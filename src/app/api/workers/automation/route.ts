import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, resumeExecution, Workflow } from '@/lib/automation/execution-engine';
import { verifyQStashSignature } from '@/lib/queue';

// ============================================
// ENVIRONMENT
// ============================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Build workflow
  const workflow: Workflow = {
    id: automation.id,
    name: automation.name,
    nodes: automation.nodes || [],
    edges: automation.edges || [],
    settings: automation.settings,
  };

  // Fetch related data if IDs provided
  let contact, deal, order;

  if (options.contactId) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', options.contactId)
      .single();
    contact = data;
  }

  if (options.dealId) {
    const { data } = await supabase
      .from('deals')
      .select('*, pipeline_stages(*), pipelines(*)')
      .eq('id', options.dealId)
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

  // Execute
  const result = await executeWorkflow(workflow, {
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
  let contact;
  if (run.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', run.contact_id)
      .single();
    contact = data;
  }

  // Fetch deal if needed
  let deal;
  if (metadata.deal_id) {
    const { data } = await supabase
      .from('deals')
      .select('*, pipeline_stages(*), pipelines(*)')
      .eq('id', metadata.deal_id)
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
    // Execute workflow
    const result = await executeWorkflow(workflow, {
      executionId: runId,
      triggerData: metadata.trigger_data || {},
      contactId: run.contact_id,
      dealId: metadata.deal_id,
      context: {
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

    // Update run with results
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
