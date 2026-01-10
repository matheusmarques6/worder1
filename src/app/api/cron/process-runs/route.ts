/**
 * CRON: Process Pending Automation Runs
 * Processa runs que estão em "pending" executando diretamente
 * Configurar no Vercel: a cada 1 minuto
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine';

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
      .select('id, automation_id, contact_id, created_at, metadata')
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

        // Buscar contact se houver
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

        // Buscar deal se houver
        const metadata = run.metadata || {};
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
              stageName: d.pipeline_stages?.name,
              pipelineId: d.pipeline_id,
              pipelineName: d.pipelines?.name,
              contactId: d.contact_id,
              customFields: d.custom_fields || {},
              createdAt: d.created_at,
              updatedAt: d.updated_at,
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

        const result = await executeWorkflow(workflow, {
          organizationId: automation.organization_id,
          executionId: run.id,
          triggerData: metadata.trigger_data || {},
          contactId: run.contact_id,
          dealId: metadata.deal_id,
          context: {
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
        });

        console.log(`[ProcessRuns] Run ${run.id} result:`, result.status);

        // Atualizar run com resultado
        await supabase
          .from('automation_runs')
          .update({
            status: result.status === 'waiting' ? 'waiting' : (result.status === 'success' ? 'completed' : 'failed'),
            completed_at: result.status !== 'waiting' ? new Date().toISOString() : null,
            metadata: {
              ...metadata,
              result: {
                duration: result.duration,
                nodeResults: result.nodeResults,
              },
            },
            last_error: result.error || null,
          })
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
