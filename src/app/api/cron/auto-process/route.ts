/**
 * AUTO-PROCESS: Endpoint para processar runs pendentes
 * Chamado por Vercel Cron ou provider externo (cron-job.org, etc).
 *
 * GET /api/cron/auto-process
 *
 * Autenticação:
 *  - Vercel Cron envia header `x-vercel-cron: 1`
 *  - OU header `Authorization: Bearer <CRON_SECRET>`
 *  - Sem nenhum deles → 401
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine';
import { claimRun, releaseRun, withHeartbeat } from '@/lib/automation/run-lock';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Permitir execução mais longa
export const maxDuration = 60;

function isAuthorizedCron(request: NextRequest): boolean {
  // Vercel Cron identifier
  if (request.headers.get('x-vercel-cron')) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Em dev sem CRON_SECRET definido, aceitamos (evita bloqueio local)
    return process.env.NODE_ENV !== 'production';
  }

  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[AutoProcess] Starting...');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Buscar runs pendentes (criados há mais de 3 segundos)
    const threeSecondsAgo = new Date(Date.now() - 3000).toISOString();
    
    const { data: pendingRuns, error: runsError } = await supabase
      .from('automation_runs')
      .select('id, automation_id, contact_id, created_at, metadata')
      .eq('status', 'pending')
      .lt('created_at', threeSecondsAgo)
      .order('created_at', { ascending: true })
      .limit(10);

    if (runsError) {
      console.error('[AutoProcess] Error fetching runs:', runsError);
      return NextResponse.json({ error: runsError.message }, { status: 500 });
    }

    if (!pendingRuns || pendingRuns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending runs',
        processed: 0,
        duration: Date.now() - startTime,
      });
    }

    console.log(`[AutoProcess] Found ${pendingRuns.length} pending runs`);

    const results: any[] = [];

    for (const run of pendingRuns) {
      try {
        // ✅ Lock optimista: só 1 worker processa cada run
        const lock = await claimRun(run.id);
        if (!lock) {
          // Outro worker pegou — pula silenciosamente
          results.push({ runId: run.id, success: false, skipped: true, reason: 'locked_by_another_worker' });
          continue;
        }

        // Buscar automação
        const { data: automation, error: autoError } = await supabase
          .from('automations')
          .select('*')
          .eq('id', run.automation_id)
          .single();

        if (autoError || !automation) {
          console.error(`[AutoProcess] Automation not found for run ${run.id}`);
          await releaseRun(run.id, lock.token, 'failed', 'Automation not found');
          results.push({ runId: run.id, success: false, error: 'Automation not found' });
          continue;
        }

        if (automation.status !== 'active') {
          console.log(`[AutoProcess] Automation ${automation.id} not active`);
          await releaseRun(run.id, lock.token, 'cancelled', 'Automation not active');
          results.push({ runId: run.id, success: false, error: 'Automation not active' });
          continue;
        }

        // Buscar contact
        let contact: any;
        if (run.contact_id) {
          const { data: c } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', run.contact_id)
            .single();
          contact = c;
        }

        // Buscar deal
        const metadata = run.metadata || {};
        let deal: any;
        if (metadata.deal_id) {
          const { data: d } = await supabase
            .from('deals')
            .select('*, pipeline_stages(*), pipelines(*)')
            .eq('id', metadata.deal_id)
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

        console.log(`[AutoProcess] Executing run ${run.id} with ${workflow.nodes.length} nodes, hasDeal=${!!deal}`);

        // Resume context — same logic as /api/workers/automation. When
        // metadata.waiting_at is set, the run was previously paused at
        // a delay and is being re-enqueued by check-delayed-runs. Pass
        // startFromNodeId so the engine continues AFTER the delay
        // instead of restarting from the trigger.
        const previousWaitingAt = (metadata as any).waiting_at;
        const previousContext = (metadata as any).context;
        const isResume = !!previousWaitingAt?.nodeId;
        let startFromNodeId: string | undefined;
        if (isResume) {
          const edge = (workflow.edges || []).find((e: any) => e.source === previousWaitingAt.nodeId);
          startFromNodeId = edge?.target;
        }

        // Executa com heartbeat periódico (lock não expira durante execução longa)
        const result = await withHeartbeat(run.id, lock.token, () =>
          executeWorkflow(workflow, {
            organizationId: automation.organization_id,
            executionId: run.id,
            startFromNodeId,
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
              trigger: metadata.trigger_data || {},
            },
          })
        );

        // Liberar lock com status final
        const finalStatus =
          result.status === 'waiting' ? 'waiting' :
          result.status === 'success' ? 'completed' :
          result.status === 'cancelled' ? 'cancelled' :
          'failed';

        await releaseRun(
          run.id,
          lock.token,
          finalStatus as any,
          result.error || null,
          { nodeResults: result.nodeResults } as any
        );

        // CRITICAL: releaseRun's RPC doesn't write waiting_until /
        // current_node_id. Without these the check-delayed-runs cron
        // never finds the row and the run is stuck forever in 'waiting'
        // — exactly what caused 'no email ever shipped, Resend received
        // zero requests' for the merchant. Write them here, post-release.
        if (result.status === 'waiting') {
          const waitingAt = (result as any).waitingAt;
          if (waitingAt?.resumeAt) {
            try {
              await supabase
                .from('automation_runs')
                .update({
                  waiting_until: waitingAt.resumeAt,
                  current_node_id: waitingAt.nodeId,
                  metadata: {
                    ...metadata,
                    result: { duration: result.duration, nodeResults: result.nodeResults },
                    waiting_at: {
                      nodeId: waitingAt.nodeId,
                      resumeAt: waitingAt.resumeAt,
                      data: waitingAt.data,
                    },
                    context: (result as any).context,
                  },
                })
                .eq('id', run.id);
            } catch (e: any) {
              console.warn(`[AutoProcess] Failed to persist waiting state for ${run.id}:`, e?.message);
            }
          }
        } else if (result.status === 'success' || result.status === 'cancelled' || finalStatus === 'failed') {
          // Clean up resume markers on terminal states so future
          // dispatches with idempotent keys can start fresh.
          try {
            await supabase
              .from('automation_runs')
              .update({ waiting_until: null, current_node_id: null })
              .eq('id', run.id);
          } catch { /* non-blocking */ }
        }

        results.push({
          runId: run.id,
          success: result.status === 'success',
          status: result.status,
        });

        console.log(`[AutoProcess] Run ${run.id} completed: ${result.status}`);

      } catch (error: any) {
        console.error(`[AutoProcess] Error on run ${run.id}:`, error);
        // Falhou — libera com status failed. Se ainda temos o token, usa; senão força via markRunFailed.
        await markRunFailed(supabase, run.id, error.message);
        results.push({ runId: run.id, success: false, error: error.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      processed: pendingRuns.length,
      successful,
      failed,
      results,
      duration: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error('[AutoProcess] Exception:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      duration: Date.now() - startTime,
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

// Suporte para POST também
export async function POST(request: NextRequest) {
  return GET(request);
}
