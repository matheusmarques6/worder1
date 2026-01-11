/**
 * AUTO-PROCESS: Endpoint público para processar runs pendentes
 * Pode ser chamado por serviços externos de cron (cron-job.org, etc)
 * 
 * GET /api/cron/auto-process
 * 
 * Não requer autenticação - processa runs pendentes automaticamente
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Permitir execução mais longa
export const maxDuration = 60;

export async function GET(request: NextRequest) {
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
        // Buscar automação
        const { data: automation, error: autoError } = await supabase
          .from('automations')
          .select('*')
          .eq('id', run.automation_id)
          .single();

        if (autoError || !automation) {
          console.error(`[AutoProcess] Automation not found for run ${run.id}`);
          await markRunFailed(supabase, run.id, 'Automation not found');
          results.push({ runId: run.id, success: false, error: 'Automation not found' });
          continue;
        }

        if (automation.status !== 'active') {
          console.log(`[AutoProcess] Automation ${automation.id} not active`);
          await supabase
            .from('automation_runs')
            .update({ status: 'cancelled', completed_at: new Date().toISOString(), last_error: 'Automation not active' })
            .eq('id', run.id);
          results.push({ runId: run.id, success: false, error: 'Automation not active' });
          continue;
        }

        // Atualizar para running
        await supabase
          .from('automation_runs')
          .update({ status: 'running' })
          .eq('id', run.id);

        // Buscar contact
        let contact;
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
        let deal;
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

        // Atualizar run
        await supabase
          .from('automation_runs')
          .update({
            status: result.status === 'waiting' ? 'waiting' : (result.status === 'success' ? 'completed' : 'failed'),
            completed_at: result.status !== 'waiting' ? new Date().toISOString() : null,
            last_error: result.error || null,
          })
          .eq('id', run.id);

        results.push({
          runId: run.id,
          success: result.status === 'success',
          status: result.status,
        });

        console.log(`[AutoProcess] Run ${run.id} completed: ${result.status}`);

      } catch (error: any) {
        console.error(`[AutoProcess] Error on run ${run.id}:`, error);
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
