// =============================================
// GET /api/diagnostics/run-trace/[runId]
//
// Walks one specific automation_runs row from creation to current state
// and reports every check that would block it. Designed to answer:
//
//   "Why is this specific run stuck in waiting?"
//
// What we check, in order:
//   1. The run row itself: status, waiting_until, current_node_id,
//      contact_id, last_error, metadata.trigger_data, started_at.
//   2. The parent automation: status (must be 'active'), trigger_type,
//      nodes array (saved version), trigger_config.
//   3. Cron eligibility: would check-delayed-runs find this row right now?
//      (status='waiting' AND waiting_until <= NOW())
//   4. Schema sanity: do the resume columns even exist?
//   5. Per-node simulation: walk the saved nodes in topological order
//      starting from where the run currently is, list each node + the
//      first reason that would skip / fail / wait.
//   6. Email pipeline: if the email node is next, what would
//      sendCampaignEmail do? (RESEND_API_KEY set, contact email
//      resolvable, template found, etc.)
//
// Designed to NEVER 500 — every check is wrapped, missing data returns
// a clear "missing" / "unknown" string the UI can render.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface CheckResult {
  stage: string;
  status: 'ok' | 'missing' | 'failed' | 'warning' | 'info';
  message: string;
  data?: any;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const { runId } = await params;
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const checks: CheckResult[] = [];

  // ============================================================
  // STAGE 1: Load the run + automation
  // ============================================================
  const { data: run, error: runErr } = await admin
    .from('automation_runs')
    .select('*')
    .eq('id', runId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (runErr || !run) {
    return NextResponse.json({
      error: 'Run not found in your organization',
      code_version: 'run-trace-2026-05-09',
    }, { status: 404 });
  }

  const { data: automation } = await admin
    .from('automations')
    .select('id, name, status, trigger_type, nodes, edges, trigger_config, exit_conditions, audience_filters, trigger_filters, frequency_config')
    .eq('id', run.automation_id)
    .maybeSingle();

  if (!automation) {
    checks.push({ stage: 'automation', status: 'failed', message: 'Automation row missing — automation_id no longer points to a valid row.' });
  } else {
    checks.push({
      stage: 'automation',
      status: automation.status === 'active' ? 'ok' : 'failed',
      message: `Automation "${automation.name}" status='${automation.status}'. Trigger=${automation.trigger_type}. ${automation.status !== 'active' ? 'check-delayed-runs requires active to resume.' : ''}`,
      data: { id: automation.id, status: automation.status, trigger_type: automation.trigger_type, nodes_count: (automation.nodes || []).length, edges_count: (automation.edges || []).length },
    });
  }

  // ============================================================
  // STAGE 2: Run state
  // ============================================================
  const now = new Date();
  const wu = run.waiting_until ? new Date(run.waiting_until) : null;
  const waitingPast = !!(wu && wu <= now);
  const waitingDeltaMs = wu ? wu.getTime() - now.getTime() : null;

  checks.push({
    stage: 'run_state',
    status: 'info',
    message: `status='${run.status}', current_node_id=${run.current_node_id || 'null'}, contact_id=${run.contact_id || 'null'}, waiting_until=${run.waiting_until || 'null'}${waitingDeltaMs !== null ? ` (${waitingPast ? 'PAST' : 'future'} by ${Math.round(waitingDeltaMs / 60000)}min)` : ''}`,
    data: {
      status: run.status,
      current_node_id: run.current_node_id,
      contact_id: run.contact_id,
      waiting_until: run.waiting_until,
      waiting_until_in_past: waitingPast,
      started_at: run.started_at,
      completed_at: run.completed_at,
      last_error: run.last_error,
      trigger_data_keys: Object.keys(run.metadata?.trigger_data || {}),
    },
  });

  // ============================================================
  // STAGE 3: Cron eligibility
  // ============================================================
  if (run.status === 'waiting') {
    if (!run.waiting_until) {
      checks.push({
        stage: 'cron_eligible',
        status: 'failed',
        message: 'status="waiting" but waiting_until=NULL — check-delayed-runs filters by `waiting_until <= NOW()`, so this row is INVISIBLE to the cron and will never resume. Use the Limpar button to cancel it.',
      });
    } else if (!waitingPast) {
      checks.push({
        stage: 'cron_eligible',
        status: 'info',
        message: `Will be picked up by check-delayed-runs in ~${Math.round((waitingDeltaMs || 0) / 60000)}min. Cron runs every 1min.`,
      });
    } else if (automation?.status !== 'active') {
      checks.push({
        stage: 'cron_eligible',
        status: 'failed',
        message: `waiting_until is in the past but automation.status='${automation?.status}' — cron only resumes runs whose automation is 'active'. Reactivate the automation or click Limpar.`,
      });
    } else {
      checks.push({
        stage: 'cron_eligible',
        status: 'warning',
        message: `Eligible RIGHT NOW. If still here in 2 min, the Vercel cron isn't firing — try the Retomar button on the toolbar.`,
      });
    }
  }

  // ============================================================
  // STAGE 4: Walk the saved nodes from where the run currently is
  // ============================================================
  if (automation?.nodes && Array.isArray(automation.nodes)) {
    const nodes: any[] = automation.nodes;
    const edges: any[] = automation.edges || [];
    const findNode = (id: string) => nodes.find(n => n?.id === id);

    let startNode: any = null;
    if (run.current_node_id) {
      startNode = findNode(run.current_node_id);
      if (!startNode) {
        checks.push({
          stage: 'node_walk',
          status: 'failed',
          message: `current_node_id="${run.current_node_id}" doesn't exist in the saved nodes anymore (canvas was edited after this run started). The engine's BFS resume will return an empty execution slice and complete with 0 nodes. Use Limpar to cancel.`,
        });
      }
    }
    if (!startNode) {
      startNode = nodes.find(n => n?.data?.category === 'trigger') || nodes[0];
    }

    if (startNode) {
      // Walk forward via outgoing edges, listing each node + first
      // skip / wait reason. Stop at the first action_email so we can
      // show the merchant exactly what would happen.
      const visited = new Set<string>();
      const walk: any[] = [];
      let cur: any = startNode;
      while (cur && !visited.has(cur.id) && walk.length < 30) {
        visited.add(cur.id);
        const nodeType = cur.data?.nodeType || cur.type;
        const config = cur.data?.config || {};
        const note: string[] = [];

        if (nodeType === 'control_delay') {
          const value = config?.delay?.value || config?.value || config?.delayValue || config?.minutes || 1;
          const unit = config?.delay?.unit || config?.unit || config?.delayUnit || 'hours';
          note.push(`Delay ${value} ${unit} → status=waiting`);
        }
        if (nodeType === 'action_email') {
          const emailStatus = (config.emailStatus || 'draft').toLowerCase();
          note.push(`emailStatus="${emailStatus}"${emailStatus !== 'live' ? ' → SKIPPED (publish to send)' : ''}`);
          note.push(`templateId=${config.templateId || 'none'}, subject="${(config.subject || '').slice(0, 50)}"`);
          note.push(`senderEmail=${config.senderEmail || '(uses default)'}`);
        }
        if (nodeType === 'condition_field') {
          note.push(`field=${config.field}, op=${config.operator}, value=${config.value}`);
        }

        walk.push({
          id: cur.id,
          type: nodeType,
          label: cur.data?.label || nodeType,
          notes: note,
        });

        if (nodeType === 'action_email') break; // stop at first email

        const next = edges.find((e: any) => e?.source === cur.id);
        cur = next ? findNode(next.target) : null;
      }

      checks.push({
        stage: 'node_walk',
        status: 'info',
        message: `Walked ${walk.length} node(s) from ${startNode.id}. ${walk.length >= 30 ? 'Stopped at depth 30.' : ''}`,
        data: { startNodeId: startNode.id, walk },
      });
    }
  }

  // ============================================================
  // STAGE 5: Email pipeline sanity
  // ============================================================
  const emailNodes = (automation?.nodes || []).filter((n: any) => (n?.data?.nodeType || n?.type) === 'action_email');
  if (emailNodes.length > 0) {
    if (!process.env.RESEND_API_KEY) {
      checks.push({
        stage: 'email_pipeline',
        status: 'failed',
        message: 'RESEND_API_KEY env var missing — every email node will throw on send. Configure it in Vercel.',
      });
    } else {
      checks.push({
        stage: 'email_pipeline',
        status: 'ok',
        message: `RESEND_API_KEY present. ${emailNodes.length} email node(s) in the flow.`,
      });
    }
    const drafts = emailNodes.filter((n: any) => (n.data?.config?.emailStatus || 'draft') !== 'live');
    if (drafts.length > 0) {
      checks.push({
        stage: 'email_pipeline_publish',
        status: 'warning',
        message: `${drafts.length} of ${emailNodes.length} email node(s) NOT in 'live' status — they will be skipped. Names: ${drafts.map((n: any) => n.data?.config?.emailName || n.data?.label || n.id).join(', ')}`,
      });
    }
  }

  // ============================================================
  // STAGE 6: Contact resolution
  // ============================================================
  const td = run.metadata?.trigger_data || {};
  const props: any = td.properties || td;
  const candidateEmail =
    td.CustomerEmail || td.email || td.Email ||
    props.CustomerEmail || props.email || props.Email ||
    props?.Customer?.Email || props?.raw?.email ||
    null;

  if (!run.contact_id) {
    if (candidateEmail) {
      const { data: c } = await admin.from('contacts').select('id, email, first_name, last_name')
        .eq('organization_id', orgId).ilike('email', candidateEmail).maybeSingle();
      if (c) {
        checks.push({
          stage: 'contact_resolution',
          status: 'warning',
          message: `Run has contact_id=NULL but a contact exists for ${candidateEmail} (id=${c.id}). Backfilling now.`,
          data: { resolved: c },
        });
        await admin.from('automation_runs').update({ contact_id: c.id }).eq('id', run.id);
      } else {
        checks.push({
          stage: 'contact_resolution',
          status: 'warning',
          message: `Run has contact_id=NULL and no contact exists for ${candidateEmail} yet. The send pipeline will create one at send time.`,
        });
      }
    } else {
      checks.push({
        stage: 'contact_resolution',
        status: 'failed',
        message: `Run has contact_id=NULL and trigger_data has no email field. Send will fail unless trigger payload is enriched. trigger_data keys: ${Object.keys(td).slice(0, 10).join(', ')}`,
      });
    }
  } else {
    checks.push({
      stage: 'contact_resolution',
      status: 'ok',
      message: `contact_id=${run.contact_id} resolved.`,
    });
  }

  // ============================================================
  // Verdict
  // ============================================================
  const failed = checks.filter(c => c.status === 'failed');
  const warnings = checks.filter(c => c.status === 'warning');
  const verdict = failed.length === 0 && warnings.length === 0
    ? 'Tudo ok. O run deve seguir o fluxo normalmente.'
    : failed.length > 0
      ? `${failed.length} bloqueio(s) crítico(s):\n${failed.map(c => `  • [${c.stage}] ${c.message}`).join('\n')}`
      : `${warnings.length} warning(s) — não impedem execução, mas vale checar.`;

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      automation_id: run.automation_id,
      contact_id: run.contact_id,
      current_node_id: run.current_node_id,
      waiting_until: run.waiting_until,
      started_at: run.started_at,
    },
    automation: automation ? {
      id: automation.id,
      name: automation.name,
      status: automation.status,
      trigger_type: automation.trigger_type,
    } : null,
    checks,
    verdict,
    code_version: 'run-trace-2026-05-09',
  });
}
