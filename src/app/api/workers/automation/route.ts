import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeWorkflow, resumeExecution, Workflow } from '@/lib/automation/execution-engine';

// ============================================
// ENVIRONMENT
// ============================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// VERIFY QSTASH SIGNATURE (optional but recommended)
// ============================================

async function verifyQStashSignature(request: NextRequest): Promise<boolean> {
  // Skip verification if no QSTASH_CURRENT_SIGNING_KEY is set
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY) {
    return true;
  }

  const signature = request.headers.get('upstash-signature');
  if (!signature) {
    return false;
  }

  // In production, verify the signature using @upstash/qstash
  // For now, we'll accept requests with any signature if the header exists
  return true;
}

// ============================================
// POST - Process automation execution
// ============================================

export async function POST(request: NextRequest) {
  // Verify QStash signature
  const isValid = await verifyQStashSignature(request);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, automationId, executionId, triggerData, contactId, dealId, orderId } = body;

    console.log(`[Automation Worker] Action: ${action}, Automation: ${automationId}`);

    switch (action) {
      case 'execute':
        return await handleExecute(automationId, { triggerData, contactId, dealId, orderId });
      
      case 'resume':
        return await handleResume(executionId);
      
      case 'test':
        return await handleTest(automationId, triggerData);
      
      default:
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
