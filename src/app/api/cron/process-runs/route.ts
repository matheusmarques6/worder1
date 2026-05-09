/**
 * CRON: Process Pending Automation Runs
 * Processa runs que estão em "pending" executando diretamente
 * Configurar no Vercel: a cada 1 minuto
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar autorização
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  const isAuthorized = isVercelCron || isInternal || 
    (cronSecret && authHeader === `Bearer ${cronSecret}`);
  
  if (!isAuthorized) {
    console.log('[ProcessRuns] Unauthorized request - headers:', {
      'x-vercel-cron': request.headers.get('x-vercel-cron'),
      'X-Internal-Request': request.headers.get('X-Internal-Request'),
      hasAuth: !!authHeader,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[ProcessRuns] ✅ Authorized - Starting check');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Buscar runs pendentes (criados há mais de 5 segundos para evitar race condition)
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    
    const { data: pendingRuns, error: runsError } = await supabase
      .from('automation_runs')
      .select('id, automation_id, contact_id, created_at, started_at, metadata')
      .eq('status', 'pending')
      .lt('created_at', fiveSecondsAgo)
      .order('created_at', { ascending: true })
      .limit(10);

    if (runsError) {
      console.error('[ProcessRuns] Error fetching runs:', runsError);
      throw runsError;
    }

    if (!pendingRuns || pendingRuns.length === 0) {
      console.log('[ProcessRuns] No pending runs found');
      return NextResponse.json({
        success: true,
        message: 'No pending runs',
        processed: 0,
      });
    }

    console.log(`[ProcessRuns] Found ${pendingRuns.length} pending runs`);

    // 2. Processar cada run DIRETAMENTE (sem HTTP request)
    const results: any[] = [];

    for (const run of pendingRuns) {
      console.log(`[ProcessRuns] Processing run ${run.id}...`);
      
      try {
        // Buscar a automação
        const { data: automation, error: autoError } = await supabase
          .from('automations')
          .select('*')
          .eq('id', run.automation_id)
          .single();

        if (autoError || !automation) {
          console.error(`[ProcessRuns] Automation not found for run ${run.id}`);
          await markRunFailed(supabase, run.id, 'Automation not found');
          results.push({ runId: run.id, success: false, error: 'Automation not found' });
          continue;
        }

        // Verificar se está ativa
        if (automation.status !== 'active') {
          console.log(`[ProcessRuns] Automation ${automation.id} is not active`);
          await supabase
            .from('automation_runs')
            .update({
              status: 'cancelled',
              completed_at: new Date().toISOString(),
              last_error: 'Automation is not active',
            })
            .eq('id', run.id);
          results.push({ runId: run.id, success: false, error: 'Automation not active' });
          continue;
        }

        // Atualizar para running
        await supabase
          .from('automation_runs')
          .update({ status: 'running' })
          .eq('id', run.id);

        const metadata = run.metadata || {};

        // Buscar contact — fallback path: when the run was created
        // before we had contact_id resolved (race with the contacts
        // upsert), look it up now using the email that came in on the
        // trigger payload. Persist back to the run so the History panel
        // stops showing "Sem contato" and downstream sends have ids.
        let contact;
        if (run.contact_id) {
          const { data: c } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', run.contact_id)
            .eq('organization_id', automation.organization_id)
            .single();
          contact = c;
        }
        if (!contact) {
          const td: any = metadata.trigger_data || {};
          const props: any = td.properties || td;
          const candidateEmail =
            td.CustomerEmail || td.email || td.Email ||
            props.CustomerEmail || props.email || props.Email ||
            props?.Customer?.Email || props?.raw?.email ||
            props?.raw?.customer?.email || props?.raw?.billing_address?.email;
          if (candidateEmail && typeof candidateEmail === 'string') {
            const { data: existing } = await supabase
              .from('contacts')
              .select('*')
              .eq('organization_id', automation.organization_id)
              .ilike('email', candidateEmail)
              .maybeSingle();
            if (existing) {
              contact = existing;
            } else {
              const { data: created } = await supabase
                .from('contacts')
                .insert({
                  organization_id: automation.organization_id,
                  email: candidateEmail,
                  source: `run:${run.id}`,
                })
                .select('*')
                .single();
              if (created) contact = created;
            }
            if (contact?.id && !run.contact_id) {
              await supabase
                .from('automation_runs')
                .update({ contact_id: contact.id })
                .eq('id', run.id);
            }
          }
        }

        // Buscar deal se houver
        let deal;
        if (metadata.deal_id) {
          const { data: d } = await supabase
            .from('deals')
            .select('*, pipeline_stages(*), pipelines(*)')
            .eq('id', metadata.deal_id)
            .eq('organization_id', automation.organization_id)
            .single();
          if (d) {
            deal = {
              id: d.id,
              title: d.title,
              value: d.value,
              stageId: d.stage_id,
              stageName: d.pipeline_stages?.name || '',
              pipelineId: d.pipeline_id,
              pipelineName: d.pipelines?.name || '',
              contactId: d.contact_id,
              customFields: d.custom_fields || {},
              createdAt: d.created_at,
            };
          }
        }

        // Executar workflow
        const workflow: Workflow = {
          id: automation.id,
          name: automation.name,
          nodes: automation.nodes || [],
          edges: automation.edges || [],
          settings: automation.settings,
        };

        console.log(`[ProcessRuns] Executing workflow ${workflow.id} with ${workflow.nodes.length} nodes`);

        // Resume context: when this run was previously paused at a
        // delay/email node, metadata.waiting_at carries the node id +
        // a rerunOnResume flag.
        //   • Delay nodes (control_delay, action_delay) finished their
        //     wait when they returned 'waiting' — on resume we SKIP
        //     them via resumeAfterNodeId, otherwise we'd hit the same
        //     delay forever.
        //   • Email nodes that returned 'waiting' (postponed by quiet
        //     hours / frequency cap) DID NOT actually send — on resume
        //     we must RE-EXECUTE them via startFromNodeId.
        // The engine writes rerunOnResume into metadata.waiting_at when
        // the paused node is non-delay, so we route accordingly here.
        const previousWaitingAt = (metadata as any).waiting_at;
        const previousContext = (metadata as any).context;
        const isResume = !!previousWaitingAt?.nodeId;
        const shouldRerunPaused =
          isResume && previousWaitingAt?.rerunOnResume === true;

        const triggerType =
          (metadata as any).trigger_type ||
          (automation as any).trigger_type ||
          'manual';
        const runStartedAt = (run as any).started_at || run.created_at;

        const result = await executeWorkflow(workflow, {
          organizationId: automation.organization_id,
          executionId: run.id,
          runStartedAt,
          ...(isResume && shouldRerunPaused
            ? { startFromNodeId: previousWaitingAt.nodeId }
            : isResume
              ? { resumeAfterNodeId: previousWaitingAt.nodeId }
              : {}),
          triggerData: metadata.trigger_data || {},
          contactId: run.contact_id,
          dealId: metadata.deal_id,
          context: previousContext || {
            organizationId: automation.organization_id,
            contact: contact ? {
              id: contact.id,
              email: contact.email,
              phone: contact.phone,
              firstName: contact.first_name,
              lastName: contact.last_name,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
              tags: contact.tags || [],
              customFields: contact.custom_fields || {},
              createdAt: contact.created_at,
              updatedAt: contact.updated_at,
            } : undefined,
            deal,
            // Variable engine expects {type, data, timestamp}; passing
            // raw trigger_data here used to wipe out every {{event.*}}
            // and {{trigger.data.*}} merge tag.
            trigger: {
              type: triggerType,
              data: metadata.trigger_data || {},
              timestamp: runStartedAt,
            },
            workflow: {
              id: automation.id,
              name: automation.name,
              executionId: run.id,
              startedAt: runStartedAt,
            },
          },
        });

        console.log(`[ProcessRuns] Run ${run.id} result:`, result.status);

        // CRITICAL: when result.status === 'waiting', we MUST persist
        // waiting_until + current_node_id so the check-delayed-runs cron
        // can find this row later (its WHERE clause is
        // `status='waiting' AND waiting_until <= NOW()`). Without these
        // writes the run is stuck forever in 'waiting' and the email
        // never goes out — exactly what the merchant reported (Resend
        // received zero requests).
        const isWaiting = result.status === 'waiting';
        const waitingAt = (result as any).waitingAt;
        const updatePayload: Record<string, any> = {
          status: isWaiting ? 'waiting' : (result.status === 'success' ? 'completed' : 'failed'),
          completed_at: !isWaiting ? new Date().toISOString() : null,
          last_error: result.error || null,
          metadata: {
            ...metadata,
            result: {
              duration: result.duration,
              nodeResults: result.nodeResults,
            },
            // Snapshot for the resume path above. rerunOnResume tells
            // the next pickup whether to re-execute the paused node
            // (email postponed for quiet hours) or skip it (delay).
            ...(isWaiting && waitingAt ? {
              waiting_at: {
                nodeId: waitingAt.nodeId,
                resumeAt: waitingAt.resumeAt,
                data: waitingAt.data,
                rerunOnResume: (waitingAt as any).rerunOnResume === true,
              },
              context: (result as any).context,
            } : {}),
          },
        };
        if (isWaiting && waitingAt?.resumeAt) {
          updatePayload.waiting_until = waitingAt.resumeAt;
          updatePayload.current_node_id = waitingAt.nodeId;
        } else if (!isWaiting) {
          updatePayload.waiting_until = null;
          updatePayload.current_node_id = null;
        }

        await supabase
          .from('automation_runs')
          .update(updatePayload)
          .eq('id', run.id);

        results.push({
          runId: run.id,
          success: result.status === 'success',
          status: result.status,
          duration: result.duration,
        });

      } catch (error: any) {
        console.error(`[ProcessRuns] Error processing run ${run.id}:`, error);
        await markRunFailed(supabase, run.id, error.message);
        results.push({
          runId: run.id,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[ProcessRuns] ✅ Completed - Processed: ${pendingRuns.length}, Success: ${successful}, Failed: ${failed}`);

    return NextResponse.json({
      success: true,
      processed: pendingRuns.length,
      successful,
      failed,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[ProcessRuns] Exception:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

async function markRunFailed(supabase: any, runId: string, error: string) {
  await supabase
    .from('automation_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      last_error: error,
    })
    .eq('id', runId);
}

// Suporte para POST
export async function POST(request: NextRequest) {
  return GET(request);
}
