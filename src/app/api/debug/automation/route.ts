/**
 * DEBUG: Test Automation Execution
 * Endpoint para testar manualmente a execução de automações
 * 
 * GET /api/debug/automation?action=status
 * GET /api/debug/automation?action=process-runs
 * GET /api/debug/automation?action=execute-run&runId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, Workflow } from '@/lib/automation/execution-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const runId = searchParams.get('runId');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    switch (action) {
      case 'status': {
        // Mostrar status geral
        const [events, runs, automations] = await Promise.all([
          supabase.from('event_logs').select('id, event_type, processed, created_at').order('created_at', { ascending: false }).limit(10),
          supabase.from('automation_runs').select('id, status, created_at, automation_id, last_error').order('created_at', { ascending: false }).limit(10),
          supabase.from('automations').select('id, name, status, trigger_type').order('created_at', { ascending: false }).limit(10),
        ]);

        return NextResponse.json({
          env: {
            QSTASH_TOKEN: !!process.env.QSTASH_TOKEN,
            QSTASH_CURRENT_SIGNING_KEY: !!process.env.QSTASH_CURRENT_SIGNING_KEY,
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
            VERCEL_URL: process.env.VERCEL_URL || null,
            CRON_SECRET: process.env.CRON_SECRET ? 'SET' : 'NOT SET',
          },
          recentEvents: events.data,
          recentRuns: runs.data,
          automations: automations.data,
        });
      }

      case 'view-automation': {
        const automationId = searchParams.get('automationId');
        if (!automationId) {
          return NextResponse.json({ error: 'automationId required' }, { status: 400 });
        }

        const { data: automation, error } = await supabase
          .from('automations')
          .select('*')
          .eq('id', automationId)
          .single();

        if (error || !automation) {
          return NextResponse.json({ error: 'Automation not found', details: error }, { status: 404 });
        }

        const nodes = (automation.nodes || []).map((n: any) => ({
          id: n.id,
          type: n.type,
          nodeType: n.data?.nodeType,
          label: n.data?.label,
          category: n.data?.category,
          config: n.data?.config,
        }));

        const edges = (automation.edges || []).map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }));

        return NextResponse.json({
          id: automation.id,
          name: automation.name,
          status: automation.status,
          trigger_type: automation.trigger_type,
          nodes,
          edges,
          settings: automation.settings,
        });
      }

      case 'process-runs': {
        // Processar runs pendentes DIRETAMENTE
        console.log('[DEBUG] Processing pending runs directly...');
        
        const { data: pendingRuns, error: runsError } = await supabase
          .from('automation_runs')
          .select('id, automation_id, contact_id, created_at, metadata')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(5);

        if (runsError) {
          return NextResponse.json({ error: runsError.message }, { status: 500 });
        }

        if (!pendingRuns || pendingRuns.length === 0) {
          return NextResponse.json({ message: 'No pending runs found' });
        }

        const results = [];

        for (const run of pendingRuns) {
          console.log(`[DEBUG] Processing run ${run.id}...`);
          
          try {
            // Buscar automação
            const { data: automation, error: autoError } = await supabase
              .from('automations')
              .select('*')
              .eq('id', run.automation_id)
              .single();

            if (autoError || !automation) {
              results.push({ runId: run.id, error: 'Automation not found', details: autoError });
              continue;
            }

            // Verificar se está ativa
            if (automation.status !== 'active') {
              results.push({ runId: run.id, error: `Automation status is ${automation.status}` });
              continue;
            }

            // Atualizar para running
            await supabase
              .from('automation_runs')
              .update({ status: 'running' })
              .eq('id', run.id);

            // Executar workflow
            const workflow: Workflow = {
              id: automation.id,
              name: automation.name,
              nodes: automation.nodes || [],
              edges: automation.edges || [],
              settings: automation.settings,
            };

            console.log(`[DEBUG] Executing workflow with ${workflow.nodes.length} nodes`);

            const metadata = run.metadata || {};
            
            const result = await executeWorkflow(workflow, {
              organizationId: automation.organization_id,
              executionId: run.id,
              triggerData: metadata.trigger_data || {},
              contactId: run.contact_id,
              dealId: metadata.deal_id,
            });

            console.log(`[DEBUG] Run ${run.id} completed with status: ${result.status}`);

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
              duration: result.duration,
              error: result.error,
              nodeResults: Object.keys(result.nodeResults || {}),
            });

          } catch (error: any) {
            console.error(`[DEBUG] Error executing run ${run.id}:`, error);
            
            await supabase
              .from('automation_runs')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                last_error: error.message,
              })
              .eq('id', run.id);

            results.push({
              runId: run.id,
              error: error.message,
              stack: error.stack?.split('\n').slice(0, 5),
            });
          }
        }

        return NextResponse.json({
          action: 'process-runs',
          found: pendingRuns.length,
          results,
        });
      }

      case 'test-move-deal': {
        const dealId = searchParams.get('dealId');
        const stageId = searchParams.get('stageId');
        
        if (!dealId || !stageId) {
          return NextResponse.json({ error: 'dealId and stageId required' }, { status: 400 });
        }

        // Buscar deal atual
        const { data: beforeDeal } = await supabase
          .from('deals')
          .select('id, title, stage_id')
          .eq('id', dealId)
          .single();

        console.log('[test-move-deal] Before:', beforeDeal);

        // Mover deal
        const { data: afterDeal, error: updateError } = await supabase
          .from('deals')
          .update({ stage_id: stageId })
          .eq('id', dealId)
          .select('id, title, stage_id')
          .single();

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        console.log('[test-move-deal] After:', afterDeal);

        return NextResponse.json({
          action: 'test-move-deal',
          before: beforeDeal,
          after: afterDeal,
          moved: beforeDeal?.stage_id !== afterDeal?.stage_id,
        });
      }

      case 'view-run': {
        if (!runId) {
          return NextResponse.json({ error: 'runId required' }, { status: 400 });
        }

        const { data: run, error } = await supabase
          .from('automation_runs')
          .select('*')
          .eq('id', runId)
          .single();

        if (error || !run) {
          return NextResponse.json({ error: 'Run not found', details: error }, { status: 404 });
        }

        return NextResponse.json({
          id: run.id,
          status: run.status,
          automation_id: run.automation_id,
          contact_id: run.contact_id,
          metadata: run.metadata,
          last_error: run.last_error,
          created_at: run.created_at,
          completed_at: run.completed_at,
        });
      }

      case 'execute-run': {
        if (!runId) {
          return NextResponse.json({ error: 'runId required' }, { status: 400 });
        }

        // Buscar o run
        const { data: run, error: runError } = await supabase
          .from('automation_runs')
          .select('*')
          .eq('id', runId)
          .single();

        if (runError || !run) {
          return NextResponse.json({ error: 'Run not found', details: runError }, { status: 404 });
        }

        // Buscar automação
        const { data: automation, error: autoError } = await supabase
          .from('automations')
          .select('*')
          .eq('id', run.automation_id)
          .single();

        if (autoError || !automation) {
          return NextResponse.json({ error: 'Automation not found', details: autoError }, { status: 404 });
        }

        // Mostrar detalhes da automação
        const nodes = automation.nodes || [];
        const nodesInfo = nodes.map((n: any) => ({
          id: n.id,
          type: n.type,
          nodeType: n.data?.nodeType,
          label: n.data?.label,
          config: n.data?.config,
        }));

        // Atualizar para running
        await supabase
          .from('automation_runs')
          .update({ status: 'running' })
          .eq('id', runId);

        try {
          // Executar workflow
          const workflow: Workflow = {
            id: automation.id,
            name: automation.name,
            nodes: automation.nodes || [],
            edges: automation.edges || [],
            settings: automation.settings,
          };

          const metadata = run.metadata || {};

          const result = await executeWorkflow(workflow, {
            organizationId: automation.organization_id,
            executionId: runId,
            triggerData: metadata.trigger_data || {},
            contactId: run.contact_id,
            dealId: metadata.deal_id,
          });

          // Atualizar run
          await supabase
            .from('automation_runs')
            .update({
              status: result.status === 'waiting' ? 'waiting' : (result.status === 'success' ? 'completed' : 'failed'),
              completed_at: result.status !== 'waiting' ? new Date().toISOString() : null,
              last_error: result.error || null,
            })
            .eq('id', runId);

          return NextResponse.json({
            action: 'execute-run',
            runId,
            automationId: automation.id,
            automationName: automation.name,
            nodesInAutomation: nodesInfo,
            edgesCount: (automation.edges || []).length,
            result: {
              status: result.status,
              duration: result.duration,
              error: result.error,
              nodeResults: result.nodeResults,
            },
          });

        } catch (error: any) {
          await supabase
            .from('automation_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              last_error: error.message,
            })
            .eq('id', runId);

          return NextResponse.json({
            action: 'execute-run',
            runId,
            nodesInAutomation: nodesInfo,
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 10),
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ 
          error: 'Invalid action',
          availableActions: ['status', 'view-automation&automationId=xxx', 'view-run&runId=xxx', 'process-runs', 'execute-run&runId=xxx'],
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[DEBUG] Error:', error);
    return NextResponse.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 10) }, { status: 500 });
  }
}
