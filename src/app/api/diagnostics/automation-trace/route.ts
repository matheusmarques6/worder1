// =============================================
// GET /api/diagnostics/automation-trace?automationId=<id>
//
// Walks the full chain from "checkout was abandoned" to "email sent"
// (or wherever it stopped) and reports a punch-list of where each
// stage stands. Designed for the merchant who configured an
// automation, abandoned a test checkout, and saw nothing happen —
// instead of digging through Vercel logs they get a single page that
// says "the trigger fired but no automation matched" or "the run
// hit the delay but waiting_until is null so it's stuck."
//
// What we check, in order:
//   1. The automation itself: status, trigger_type, has a trigger node?
//   2. Recent contact_events that should match the trigger
//   3. Recent automation_runs created for this automation
//   4. For each run: status, current_node_id, waiting_until,
//      error message, last activity
//   5. Schema sanity: do the columns dispatch needs actually exist?
//
// Designed to NEVER 500 — every check is wrapped, missing data
// returns a clear "missing" / "unknown" string the UI can render.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const TRIGGER_TO_EVENT_TYPES: Record<string, string[]> = {
  trigger_order: ['placed_order'],
  trigger_checkout_abandoned: ['checkout_started'],
  trigger_checkout_completed: ['checkout_completed'],
  trigger_added_to_cart: ['added_to_cart'],
  trigger_viewed_product: ['viewed_product'],
  trigger_browse_abandoned: ['viewed_product', 'page_viewed'],
  trigger_back_in_stock: ['back_in_stock'],
  trigger_form_submitted: ['form_submitted'],
};

interface CheckResult {
  stage: string;
  status: 'ok' | 'missing' | 'failed' | 'warning';
  message: string;
  data?: any;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const sp = request.nextUrl.searchParams;
  const automationId = sp.get('automationId');
  if (!automationId) {
    return NextResponse.json({ error: 'automationId required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const checks: CheckResult[] = [];

  // ============================================================
  // STAGE 1: Automation row sanity
  // ============================================================
  const { data: automation, error: autoErr } = await admin
    .from('automations')
    .select('id, name, status, trigger_type, trigger_config, nodes, edges, organization_id')
    .eq('id', automationId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (autoErr || !automation) {
    checks.push({
      stage: 'automation_row',
      status: 'missing',
      message: `Automação não encontrada (id=${automationId}). Verifique se está na sua organização.`,
    });
    return NextResponse.json({ checks, automation: null });
  }

  checks.push({
    stage: 'automation_row',
    status: 'ok',
    message: `Automação encontrada: "${automation.name}" (status=${automation.status}, trigger_type=${automation.trigger_type}).`,
  });

  // STATUS check
  if (automation.status !== 'active') {
    checks.push({
      stage: 'automation_active',
      status: 'failed',
      message: `Automação está com status "${automation.status}". Tem que estar "active" pra disparar — ative no editor.`,
    });
  } else {
    checks.push({
      stage: 'automation_active',
      status: 'ok',
      message: 'Automação está ativa.',
    });
  }

  // TRIGGER_TYPE check
  if (!automation.trigger_type || automation.trigger_type === 'manual') {
    checks.push({
      stage: 'automation_trigger_type',
      status: 'failed',
      message: `trigger_type é "${automation.trigger_type}" — automação manual não dispara em webhooks. Configure um gatilho.`,
    });
  }

  // NODES sanity
  const nodes = Array.isArray(automation.nodes) ? automation.nodes : [];
  const triggerNodes = nodes.filter((n: any) => n.type?.startsWith('trigger_') || n.data?.category === 'trigger');
  const actionNodes = nodes.filter((n: any) => n.type?.startsWith('action_') || n.data?.category === 'action');
  if (nodes.length === 0) {
    checks.push({
      stage: 'automation_graph',
      status: 'failed',
      message: 'Automação não tem nodes — adicione um trigger e ações.',
    });
  } else if (triggerNodes.length === 0) {
    checks.push({
      stage: 'automation_graph',
      status: 'failed',
      message: `Automação tem ${nodes.length} nodes mas nenhum é trigger.`,
    });
  } else if (actionNodes.length === 0) {
    checks.push({
      stage: 'automation_graph',
      status: 'warning',
      message: `Automação tem trigger mas nenhuma ação (${nodes.length} nodes).`,
    });
  } else {
    checks.push({
      stage: 'automation_graph',
      status: 'ok',
      message: `Grafo ok: ${triggerNodes.length} trigger + ${actionNodes.length} ações + ${nodes.length - triggerNodes.length - actionNodes.length} outros nodes.`,
    });
  }

  // ============================================================
  // STAGE 2: Recent contact_events that should match this trigger
  // ============================================================
  const eventTypes = TRIGGER_TO_EVENT_TYPES[automation.trigger_type] || [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let recentEvents: any[] = [];
  if (eventTypes.length > 0) {
    const { data } = await admin
      .from('contact_events')
      .select('id, event_type, event_source, contact_id, occurred_at, properties, store_id')
      .eq('organization_id', orgId)
      .in('event_type', eventTypes)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(10);
    recentEvents = data || [];
  }

  if (recentEvents.length === 0) {
    checks.push({
      stage: 'contact_events',
      status: 'missing',
      message: `Nenhum evento ${eventTypes.join('/')} nas últimas 24h. Sem evento, nada dispara. Verifique o pixel/webhook em /integrations/shopify/tracking-debug.`,
    });
  } else {
    checks.push({
      stage: 'contact_events',
      status: 'ok',
      message: `${recentEvents.length} eventos ${eventTypes.join('/')} nas últimas 24h. Mais recente: ${recentEvents[0].occurred_at}.`,
      data: recentEvents.map(e => ({
        id: e.id,
        event_type: e.event_type,
        event_source: e.event_source,
        contact_id: e.contact_id,
        store_id: e.store_id,
        occurred_at: e.occurred_at,
        has_email: !!(e.properties?.email || e.properties?.Customer?.Email || e.properties?.raw?.email),
        has_items: Array.isArray(e.properties?.Items) && e.properties.Items.length > 0,
      })),
    });
  }

  // ============================================================
  // STAGE 3: automation_runs created for this automation
  // ============================================================
  const { data: runs, error: runsErr } = await admin
    .from('automation_runs')
    .select('id, status, contact_id, current_node_id, waiting_until, last_error, completed_at, created_at, metadata')
    .eq('automation_id', automationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  if (runsErr) {
    checks.push({
      stage: 'automation_runs_query',
      status: 'failed',
      message: `Erro ao consultar automation_runs: ${runsErr.message}. Provavelmente tabela com schema antigo — rode a migration 20260508_automation_runs_full_columns.sql.`,
    });
  } else if (!runs || runs.length === 0) {
    checks.push({
      stage: 'automation_runs',
      status: 'missing',
      message: `NENHUM run criado pra essa automação nas últimas 24h. dispatchTrigger não está disparando — possíveis causas: (1) trigger_type da automação não bate com o evento (deveria ser "${automation.trigger_type}" para esses eventos), (2) automação não está ativa, (3) erro ao inserir no DB (verifique logs do Vercel).`,
    });
  } else {
    const stuck = runs.filter(r => r.status === 'waiting' && (!r.waiting_until || r.waiting_until < new Date().toISOString()));
    const failed = runs.filter(r => r.status === 'failed');
    const completed = runs.filter(r => r.status === 'completed');
    const running = runs.filter(r => r.status === 'running');

    checks.push({
      stage: 'automation_runs',
      status: 'ok',
      message: `${runs.length} runs nas últimas 24h: ${completed.length} completos, ${running.length} rodando, ${runs.length - completed.length - running.length - failed.length - stuck.length} aguardando, ${stuck.length} travados em waiting, ${failed.length} falharam.`,
      data: runs.map(r => ({
        id: r.id,
        status: r.status,
        contact_id: r.contact_id,
        current_node_id: r.current_node_id,
        waiting_until: r.waiting_until,
        last_error: r.last_error,
        completed_at: r.completed_at,
        created_at: r.created_at,
        node_results_count: Object.keys(r.metadata?.result?.nodeResults || {}).length,
      })),
    });

    if (stuck.length > 0) {
      checks.push({
        stage: 'stuck_runs',
        status: 'failed',
        message: `${stuck.length} run(s) travados em status='waiting' com waiting_until ausente ou no passado. Cron /check-delayed-runs deveria ter pego — verifique se está rodando (configurado a cada 2min em vercel.json).`,
      });
    }
    if (failed.length > 0) {
      checks.push({
        stage: 'failed_runs',
        status: 'failed',
        message: `${failed.length} run(s) falharam. Erros: ${failed.slice(0, 3).map(r => r.last_error || 'sem mensagem').join(' | ')}`,
      });
    }
  }

  // ============================================================
  // STAGE 4: Schema sanity — verifies the columns dispatch + worker
  // need actually exist. If automation_runs is missing
  // organization_id, deal_id, waiting_until, etc, dispatch fails.
  // ============================================================
  const requiredColumns = [
    'organization_id', 'automation_id', 'contact_id', 'deal_id',
    'status', 'waiting_until', 'current_node_id', 'metadata',
    'last_error', 'completed_at',
  ];
  const missingColumns: string[] = [];
  for (const col of requiredColumns) {
    try {
      const { error } = await admin.from('automation_runs').select(col).limit(1);
      if (error && (error.code === 'PGRST204' || error.code === '42703' || /could not find/i.test(error.message))) {
        missingColumns.push(col);
      }
    } catch { /* best-effort */ }
  }

  if (missingColumns.length > 0) {
    checks.push({
      stage: 'automation_runs_schema',
      status: 'failed',
      message: `Colunas faltando em automation_runs: ${missingColumns.join(', ')}. Rode a migration 20260508_automation_runs_full_columns.sql no Supabase SQL Editor.`,
      data: { missingColumns },
    });
  } else {
    checks.push({
      stage: 'automation_runs_schema',
      status: 'ok',
      message: 'Todas as colunas necessárias existem em automation_runs.',
    });
  }

  // ============================================================
  // STAGE 5: Email pipeline sanity — Resend key + per-email-node status
  // so the merchant can see at a glance which emails are "live" and
  // which are still draft (will be skipped by action_email).
  // ============================================================
  if (!process.env.RESEND_API_KEY) {
    checks.push({
      stage: 'resend_api_key',
      status: 'failed',
      message: 'RESEND_API_KEY não configurada nas env vars do Vercel — nenhum envio sai.',
    });
  } else {
    checks.push({
      stage: 'resend_api_key',
      status: 'ok',
      message: 'RESEND_API_KEY configurada.',
    });
  }

  const emailNodes = nodes.filter((n: any) => (n?.data?.nodeType || n?.type) === 'action_email');
  if (emailNodes.length > 0) {
    const draft = emailNodes.filter((n: any) => (n.data?.config?.emailStatus || 'draft') !== 'live');
    if (draft.length > 0) {
      checks.push({
        stage: 'email_nodes_publish',
        status: 'warning',
        message: `${draft.length} de ${emailNodes.length} email(s) com status ≠ "live" — não enviarão. Nodes: ${draft.map((n: any) => n.data?.config?.emailName || n.data?.label || n.id).join(', ')}`,
      });
    } else {
      checks.push({
        stage: 'email_nodes_publish',
        status: 'ok',
        message: `Todos os ${emailNodes.length} email(s) estão Live.`,
      });
    }
  }

  // ============================================================
  // Verdict
  // ============================================================
  const errorChecks = checks.filter(c => c.status === 'failed');
  const verdict = errorChecks.length === 0
    ? 'Tudo ok. Se ainda não está funcionando, pode ser deploy não propagado ou cron desligado.'
    : `${errorChecks.length} problema(s) crítico(s) bloqueando o disparo:\n${errorChecks.map(c => `  • [${c.stage}] ${c.message}`).join('\n')}`;

  return NextResponse.json({
    automation: {
      id: automation.id,
      name: automation.name,
      status: automation.status,
      trigger_type: automation.trigger_type,
      total_nodes: nodes.length,
      trigger_nodes: triggerNodes.length,
      action_nodes: actionNodes.length,
    },
    // Stamped at file-edit time so the merchant can verify a deploy
    // actually propagated. Bump whenever you change the email pipeline.
    code_version: 'audit-2026-05-09b',
    checks,
    verdict,
    summary: {
      ok: checks.filter(c => c.status === 'ok').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      missing: checks.filter(c => c.status === 'missing').length,
      failed: errorChecks.length,
    },
  });
}
