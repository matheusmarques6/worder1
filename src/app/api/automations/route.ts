import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// GET - List automations or get single automation
export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const automationId = searchParams.get('id');

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

  try {
    if (automationId) {
      const { data, error } = await supabase
        .from('automations')
        .select(`
          *,
          automation_runs(
            id,
            status,
            started_at,
            completed_at,
            metadata
          )
        `)
        .eq('id', automationId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ automation: data });
    }

    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ automations: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create automation or trigger run
export async function POST(request: NextRequest) {
  const { action, ...data } = await request.json();

  try {
    switch (action) {
      case 'create':
        return await createAutomation(data);
      case 'trigger':
        return await triggerAutomation(data);
      case 'run-step':
        return await runAutomationStep(data);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update automation
export async function PUT(request: NextRequest) {
  const { id, organizationId, ...updates } = await request.json();

  try {
    const { data, error } = await supabase
      .from('automations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ automation: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete automation
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const organizationId = searchParams.get('organizationId');

  if (!id || !organizationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function createAutomation({
  organizationId,
  name,
  description,
  triggerType,
  canvasData,
}: {
  organizationId: string;
  name: string;
  description?: string;
  triggerType: string;
  canvasData: any;
}) {
  const { data, error } = await supabase
    .from('automations')
    .insert({
      organization_id: organizationId,
      name,
      description,
      trigger_type: triggerType,
      canvas_data: canvasData,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json({ automation: data });
}

async function triggerAutomation({
  automationId,
  organizationId,
  triggerData,
}: {
  automationId: string;
  organizationId: string;
  triggerData: any;
}) {
  // Get automation
  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .single();

  if (error || !automation) {
    throw new Error('Automation not found or not active');
  }

  // Create run
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      automation_id: automationId,
      status: 'running',
      metadata: { trigger_data: triggerData },
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) throw runError;

  // Start processing (in production, use a job queue)
  processAutomationRun(automation, run.id, triggerData);

  return NextResponse.json({ runId: run.id });
}

async function processAutomationRun(automation: any, runId: string, triggerData: any) {
  const canvasData = automation.canvas_data;
  const nodes = canvasData.nodes || [];
  const edges = canvasData.edges || [];

  // Find trigger node
  const triggerNode = nodes.find((n: any) => n.data.category === 'trigger');
  if (!triggerNode) {
    await updateRunStatus(runId, 'failed', { error: 'No trigger node found' });
    return;
  }

  // Process nodes in order
  try {
    let currentNodeId = triggerNode.id;
    let context = { ...triggerData };

    while (currentNodeId) {
      const currentNode = nodes.find((n: any) => n.id === currentNodeId);
      if (!currentNode) break;

      // Execute node action
      const result = await executeNode(automation.organization_id, currentNode, context);
      context = { ...context, ...result };

      // Find next node
      const outgoingEdge = edges.find((e: any) => {
        if (e.source !== currentNodeId) return false;
        
        // Handle condition nodes
        if (currentNode.data.type === 'condition') {
          const conditionResult = result.conditionResult;
          return e.sourceHandle === (conditionResult ? 'true' : 'false');
        }
        
        return true;
      });

      currentNodeId = outgoingEdge?.target || null;

      // Handle delays
      if (currentNode.data.type === 'delay') {
        const delayMs = parseDelay(currentNode.data.config?.delay || '1h');
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 5000))); // Cap at 5s for demo
      }
    }

    await updateRunStatus(runId, 'completed', { context });
  } catch (error: any) {
    await updateRunStatus(runId, 'failed', { error: error.message });
  }
}

async function executeNode(organizationId: string, node: any, context: any): Promise<any> {
  const { type, config } = node.data;

  switch (type) {
    case 'send_email':
      return await executeEmailNode(organizationId, config, context);

    case 'send_whatsapp':
      return await executeWhatsAppNode(organizationId, config, context);

    case 'send_sms':
      return await executeSmsNode(organizationId, config, context);

    case 'add_tag':
      return await executeAddTagNode(organizationId, config, context);

    case 'remove_tag':
      return await executeRemoveTagNode(organizationId, config, context);

    case 'update_contact':
      return await executeUpdateContactNode(organizationId, config, context);

    case 'notify_team':
      return await executeNotifyTeamNode(organizationId, config, context);

    case 'webhook':
      return await executeWebhookNode(config, context);

    case 'condition':
      return await evaluateCondition(config, context);

    case 'ab_split':
      return await executeAbSplit(config);

    case 'filter':
      return await executeFilter(config, context);

    case 'delay':
      return { delayed: true };

    default:
      return {};
  }
}

async function executeEmailNode(organizationId: string, config: any, context: any) {
  // Get Klaviyo integration
  const { data: klaviyo } = await supabase
    .from('klaviyo_integrations')
    .select('api_key')
    .eq('organization_id', organizationId)
    .single();

  if (!klaviyo) {
    throw new Error('Klaviyo not configured');
  }

  // Send email via Klaviyo
  const response = await fetch('https://a.klaviyo.com/api/campaigns/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${klaviyo.api_key}`,
      'Content-Type': 'application/json',
      revision: '2024-02-15',
    },
    body: JSON.stringify({
      data: {
        type: 'campaign',
        attributes: {
          name: config.subject,
          audiences: {
            included: [context.email],
          },
          send_strategy: {
            method: 'immediate',
          },
        },
      },
    }),
  });

  const result = await response.json();
  
  // Update metrics
  await supabase.rpc('increment_automation_metric', {
    p_automation_id: context.automation_id,
    p_metric: 'emails_sent',
    p_value: 1,
  });

  return { emailSent: true, klaviyoResponse: result };
}

async function executeWhatsAppNode(organizationId: string, config: any, context: any) {
  const { data: waConfig } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!waConfig) {
    throw new Error('WhatsApp not configured');
  }

  // Send WhatsApp message
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${waConfig.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waConfig.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: context.phone,
        type: 'text',
        text: { body: interpolateTemplate(config.message, context) },
      }),
    }
  );

  const result = await response.json();

  await supabase.rpc('increment_automation_metric', {
    p_automation_id: context.automation_id,
    p_metric: 'whatsapp_sent',
    p_value: 1,
  });

  return { whatsappSent: true, whatsappResponse: result };
}

async function executeSmsNode(organizationId: string, config: any, context: any) {
  // Implementation would depend on SMS provider (Twilio, etc.)
  console.log('SMS node executed:', config.message);
  return { smsSent: true };
}

async function executeAddTagNode(organizationId: string, config: any, context: any) {
  const tags = Array.isArray(config.tags) ? config.tags : [config.tags];
  
  await supabase.rpc('add_contact_tags', {
    p_contact_id: context.contact_id,
    p_tags: tags,
  });

  return { tagsAdded: tags };
}

async function executeRemoveTagNode(organizationId: string, config: any, context: any) {
  const tags = Array.isArray(config.tags) ? config.tags : [config.tags];
  
  await supabase.rpc('remove_contact_tags', {
    p_contact_id: context.contact_id,
    p_tags: tags,
  });

  return { tagsRemoved: tags };
}

async function executeUpdateContactNode(organizationId: string, config: any, context: any) {
  const updates: any = {};
  
  for (const field of config.fields || []) {
    updates[field.name] = interpolateTemplate(field.value, context);
  }

  await supabase
    .from('contacts')
    .update(updates)
    .eq('id', context.contact_id);

  return { contactUpdated: true, updates };
}

async function executeNotifyTeamNode(organizationId: string, config: any, context: any) {
  // Create notification
  await supabase.from('notifications').insert({
    organization_id: organizationId,
    type: 'automation',
    title: config.title || 'Automation Notification',
    message: interpolateTemplate(config.message, context),
    metadata: { automation_id: context.automation_id },
  });

  return { notified: true };
}

async function executeWebhookNode(config: any, context: any) {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(context),
  });

  const result = await response.json().catch(() => ({}));

  return { webhookResponse: result, webhookStatus: response.status };
}

async function evaluateCondition(config: any, context: any): Promise<{ conditionResult: boolean }> {
  const { field, operator, value } = config;
  const fieldValue = getNestedValue(context, field);

  let result = false;

  switch (operator) {
    case 'equals':
      result = fieldValue === value;
      break;
    case 'not_equals':
      result = fieldValue !== value;
      break;
    case 'contains':
      result = String(fieldValue).includes(value);
      break;
    case 'not_contains':
      result = !String(fieldValue).includes(value);
      break;
    case 'greater_than':
      result = Number(fieldValue) > Number(value);
      break;
    case 'less_than':
      result = Number(fieldValue) < Number(value);
      break;
    case 'is_empty':
      result = !fieldValue || fieldValue === '';
      break;
    case 'is_not_empty':
      result = !!fieldValue && fieldValue !== '';
      break;
    case 'in_list':
      result = value.split(',').map((v: string) => v.trim()).includes(fieldValue);
      break;
  }

  return { conditionResult: result };
}

async function executeAbSplit(config: any): Promise<{ variant: string }> {
  const random = Math.random() * 100;
  const splitPercentage = config.splitPercentage || 50;
  
  return {
    variant: random < splitPercentage ? 'A' : 'B',
  };
}

async function executeFilter(config: any, context: any): Promise<{ passedFilter: boolean }> {
  const conditions = config.conditions || [];
  const matchType = config.matchType || 'all';

  const results = conditions.map((condition: any) => {
    const { conditionResult } = evaluateCondition(condition, context) as any;
    return conditionResult;
  });

  const passedFilter = matchType === 'all' 
    ? results.every(Boolean)
    : results.some(Boolean);

  return { passedFilter };
}

async function updateRunStatus(runId: string, status: string, metadata: any) {
  await supabase
    .from('automation_runs')
    .update({
      status,
      metadata,
      completed_at: status !== 'running' ? new Date().toISOString() : null,
    })
    .eq('id', runId);
}

function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)(m|h|d)$/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function interpolateTemplate(template: string, context: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    return getNestedValue(context, path) || match;
  });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

async function runAutomationStep({
  runId,
  nodeId,
  context,
}: {
  runId: string;
  nodeId: string;
  context: any;
}) {
  // For step-by-step execution (useful for debugging)
  const { data: run } = await supabase
    .from('automation_runs')
    .select('*, automation:automations(*)')
    .eq('id', runId)
    .single();

  if (!run) {
    throw new Error('Run not found');
  }

  const node = run.automation.canvas_data.nodes.find((n: any) => n.id === nodeId);
  if (!node) {
    throw new Error('Node not found');
  }

  const result = await executeNode(run.automation.organization_id, node, context);

  return NextResponse.json({ result });
}
