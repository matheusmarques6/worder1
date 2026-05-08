import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, resumeExecution, Workflow } from '@/lib/automation/execution-engine';
import { verifyQStashSignature } from '@/lib/queue';
export const dynamic = 'force-dynamic';

// ============================================
// ENVIRONMENT
// ============================================

let _supabase: any = null;
function getDb() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}
const supabase = new Proxy({} as any, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

// ============================================
// POST - Process automation execution
// ============================================

export async function POST(request: NextRequest) {
  // Verify QStash signature or internal request
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  const hasQStashSig = request.headers.has('upstash-signature');
  
  if (hasQStashSig) {
    const clonedRequest = request.clone();
    const { isValid } = await verifyQStashSignature(clonedRequest);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (!isInternal) {
    // Require some form of auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    
    // Suportar formato antigo e novo
    const action = body.action || body.type;
    const data = body.data || body;
    
    // Extrair parâmetros
    const { 
      automationId, 
      executionId, 
      runId,
      triggerData, 
      contactId, 
      dealId, 
      orderId 
    } = { ...body, ...data };

    console.log(`[Automation Worker] Action: ${action}, RunId: ${runId || automationId}`);

    switch (action) {
      case 'execute':
        return await handleExecute(automationId, { triggerData, contactId, dealId, orderId });
      
      case 'execute_run':
      case 'automation_run':
        return await handleExecuteRun(runId || data.runId);
      
      case 'resume':
        return await handleResume(executionId || runId);
      
      case 'test':
        return await handleTest(automationId, triggerData);
      
      default:
        // Se não tem action mas tem runId, executar o run
        if (runId || data?.runId) {
          return await handleExecuteRun(runId || data.runId);
        }
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[Automation Worker] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// EXECUTE AUTOMATION
// ============================================

async function handleExecute(
  automationId: string,
  options: {
    triggerData?: Record<string, any>;
    contactId?: string;
    dealId?: string;
    orderId?: string;
  }
) {
  // Get automation
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .single();

  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  // Check if active
  if (automation.status !== 'active') {
    return NextResponse.json({ 
      error: 'Automation is not active',
      status: automation.status,
    }, { status: 400 });
  }

  // ⚠️ CRÍTICO: Pegar organization_id da automação para garantir isolamento
  const organizationId = automation.organization_id;

  // Build workflow
  const workflow: Workflow = {
    id: automation.id,
    name: automation.name,
    nodes: automation.nodes || [],
    edges: automation.edges || [],
    settings: automation.settings,
  };

  // Fetch related data if IDs provided
  // ⚠️ CRÍTICO: SEMPRE filtrar por organization_id
  let contact, deal, order;

  if (options.contactId) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', options.contactId)
      .eq('organization_id', organizationId)  // ← ISOLAMENTO
      .single();
    contact = data;
  }

  if (options.dealId) {
    const { data } = await supabase
      .from('deals')
      .select('*, pipeline_stages(*), pipelines(*)')
      .eq('id', options.dealId)
      .eq('organization_id', organizationId)  // ← ISOLAMENTO
      .single();
    deal = data ? {
      id: data.id,
      title: data.title,
      value: data.value,
      stageId: data.stage_id,
      stageName: data.pipeline_stages?.name,
      pipelineId: data.pipeline_id,
      pipelineName: data.pipelines?.name,
      contactId: data.contact_id,
      customFields: data.custom_fields || {},
      createdAt: data.created_at,
    } : undefined;
  }

  if (options.orderId || options.triggerData?.order_id) {
    // Order data comes from trigger
    order = options.triggerData?.order || undefined;
  }

  // Execute with organization context
  const result = await executeWorkflow(workflow, {
    organizationId,  // ← PASSAR PARA O ENGINE
    triggerData: options.triggerData || {},
    contactId: options.contactId,
    dealId: options.dealId,
    orderId: options.orderId,
  });

  return NextResponse.json({
    executionId: result.executionId,
    status: result.status,
    duration: result.duration,
    nodeResults: result.nodeResults,
  });
}

// ============================================
// EXECUTE FROM EXISTING RUN
// ============================================

async function handleExecuteRun(runId: string) {
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 });
  }

  console.log(`[Automation Worker] Executing run: ${runId}`);

  // Get the run with its automation
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .select('*, automations(*)')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Check if already completed
  if (run.status === 'completed' || run.status === 'failed') {
    return NextResponse.json({
      message: 'Run already finished',
      runId,
      status: run.status,
    });
  }

  const automation = run.automations;
  if (!automation) {
    return NextResponse.json({ error: 'Automation not found for run' }, { status: 404 });
  }

  // ⚠️ CRITICAL: Check if automation is still active
  if (automation.status !== 'active') {
    console.log(`[Automation Worker] Automation ${automation.id} is not active (status: ${automation.status}), skipping run ${runId}`);
    
    // Mark run as cancelled
    await supabase
      .from('automation_runs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        last_error: `Automação desativada (status: ${automation.status})`,
      })
      .eq('id', runId);

    return NextResponse.json({
      message: 'Automation is not active',
      runId,
      automationStatus: automation.status,
      status: 'cancelled',
    });
  }

  // ⚠️ CRÍTICO: Pegar organization_id da automação para garantir isolamento
  const organizationId = automation.organization_id;

  // Update run status to 'running'
  await supabase
    .from('automation_runs')
    .update({ status: 'running' })
    .eq('id', runId);

  // Build workflow
  const workflow: Workflow = {
    id: automation.id,
    name: automation.name,
    nodes: automation.nodes || [],
    edges: automation.edges || [],
    settings: automation.settings,
  };

  // Extract context from run metadata
  const metadata = run.metadata || {};
  
  // Fetch contact if needed
  // ⚠️ CRÍTICO: SEMPRE filtrar por organization_id
  let contact;
  if (run.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', run.contact_id)
      .eq('organization_id', organizationId)  // ← ISOLAMENTO
      .single();
    contact = data;
  }

  // Fetch deal if needed
  // ⚠️ CRÍTICO: SEMPRE filtrar por organization_id
  let deal;
  if (metadata.deal_id) {
    const { data } = await supabase
      .from('deals')
      .select('*, pipeline_stages(*), pipelines(*)')
      .eq('id', metadata.deal_id)
      .eq('organization_id', organizationId)  // ← ISOLAMENTO
      .single();
    if (data) {
      deal = {
        id: data.id,
        title: data.title,
        value: data.value,
        stageId: data.stage_id,
        stageName: data.pipeline_stages?.name,
        pipelineId: data.pipeline_id,
        pipelineName: data.pipelines?.name,
        contactId: data.contact_id,
        customFields: data.custom_fields || {},
        createdAt: data.created_at,
      };
    }
  }

  try {
    // Resume context: when a previously-waiting run is being picked up
    // by the delayed-runs cron, metadata.waiting_at carries the node id
    // we paused at. We pass startFromNodeId so the engine continues
    // AFTER that node (the engine looks up the next edge target).
    // Without this, every resumed run restarts from the trigger and
    // hits the same delay again — infinite loop / never completes.
    const previousWaitingAt = (metadata as any).waiting_at;
    const previousContext = (metadata as any).context;
    const isResume = !!previousWaitingAt?.nodeId;

    let startFromNodeId: string | undefined;
    if (isResume) {
      const edge = (workflow.edges || []).find((e: any) => e.source === previousWaitingAt.nodeId);
      startFromNodeId = edge?.target;
    }

    // Execute workflow with organization context
    const result = await executeWorkflow(workflow, {
      organizationId,  // ← PASSAR PARA O ENGINE
      executionId: runId,
      startFromNodeId,
      triggerData: metadata.trigger_data || {},
      contactId: run.contact_id,
      dealId: metadata.deal_id,
      context: previousContext || {
        organizationId,  // ← INCLUIR NO CONTEXTO
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

    // Update run with results.
    //
    // CRITICAL: when the engine returns status='waiting', we MUST persist
    // waiting_until + current_node_id so the delayed-runs cron can find
    // and resume this run later. Without these writes, runs get stuck
    // in 'waiting' forever — the cron query
    //   WHERE status='waiting' AND waiting_until <= NOW()
    // never matches a row with NULL waiting_until.
    //
    // Also persist waiting_at + context in metadata so the resume path
    // above can pick up exactly where we left off (next node after the
    // delay) instead of restarting the workflow.
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
        // Snapshot for the cron to resume cleanly
        ...(isWaiting && waitingAt ? {
          waiting_at: {
            nodeId: waitingAt.nodeId,
            resumeAt: waitingAt.resumeAt,
            data: waitingAt.data,
          },
          context: (result as any).context,
        } : {}),
      },
    };
    if (isWaiting && waitingAt?.resumeAt) {
      updatePayload.waiting_until = waitingAt.resumeAt;
      updatePayload.current_node_id = waitingAt.nodeId;
    } else if (!isWaiting) {
      // Clean up resume markers on terminal states.
      updatePayload.waiting_until = null;
      updatePayload.current_node_id = null;
    }

    await supabase
      .from('automation_runs')
      .update(updatePayload)
      .eq('id', runId);

    return NextResponse.json({
      runId,
      executionId: result.executionId,
      status: result.status,
      duration: result.duration,
      nodeResults: result.nodeResults,
    });

  } catch (error: any) {
    console.error(`[Automation Worker] Execution failed for run ${runId}:`, error);

    // Update run with error
    await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        last_error: error.message,
        retry_count: (run.retry_count || 0) + 1,
      })
      .eq('id', runId);

    return NextResponse.json({
      runId,
      status: 'error',
      error: error.message,
    }, { status: 500 });
  }
}

// ============================================
// RESUME EXECUTION
// ============================================

async function handleResume(executionId: string) {
  if (!executionId) {
    return NextResponse.json({ error: 'executionId required' }, { status: 400 });
  }

  const result = await resumeExecution(executionId);

  return NextResponse.json({
    executionId: result.executionId,
    status: result.status,
    duration: result.duration,
    nodeResults: result.nodeResults,
  });
}

// ============================================
// TEST AUTOMATION
// ============================================

async function handleTest(automationId: string, triggerData: Record<string, any> = {}) {
  // Get automation
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .single();

  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  // Build workflow
  const workflow: Workflow = {
    id: automation.id,
    name: automation.name,
    nodes: automation.nodes || [],
    edges: automation.edges || [],
    settings: automation.settings,
  };

  // Execute in test mode
  const result = await executeWorkflow(workflow, {
    isTest: true,
    triggerData,
  });

  return NextResponse.json({
    executionId: result.executionId,
    status: result.status,
    duration: result.duration,
    nodeResults: result.nodeResults,
    finalContext: result.finalContext,
  });
}

// ============================================
// GET - Check worker health
// ============================================

export async function GET() {
  return NextResponse.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
}
