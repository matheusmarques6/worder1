import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyQStashSignature, enqueueAutomationStep, calculateDelaySeconds } from '@/lib/queue';

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {
  return getSupabaseAdmin();
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST(request: NextRequest) {
  // 1. Verificar assinatura do QStash (ou internal request)
  const { isValid, body } = await verifyQStashSignature(request);
  
  if (!isValid) {
    console.error('[Worker] Invalid signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { type, data } = body;

  if (type !== 'automation_run') {
    return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
  }

  const { runId } = data;
  const supabase = getSupabase();

  console.log(`[Worker] Processing automation run: ${runId}`);

  try {
    // 2. Buscar o run e a automação
    const { data: run, error: runError } = await supabase
      .from('automation_runs')
      .select(`
        *,
        automation:automations(*)
      `)
      .eq('id', runId)
      .single();

    if (runError || !run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // 3. Verificar se não foi cancelado
    if (run.status === 'cancelled') {
      console.log(`[Worker] Run ${runId} was cancelled, skipping`);
      return NextResponse.json({ success: true, skipped: true });
    }

    // 4. Atualizar status para running
    await supabase
      .from('automation_runs')
      .update({ status: 'running' })
      .eq('id', runId);

    // 5. Processar a automação
    const result = await processAutomation(supabase, run, run.automation);

    // 6. Atualizar status final (se não está aguardando delay)
    if (result.status !== 'waiting') {
      await supabase
        .from('automation_runs')
        .update({
          status: result.success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
          metadata: {
            ...run.metadata,
            result: {
              nodes_processed: result.nodesProcessed,
              outputs: result.outputs,
            },
          },
        })
        .eq('id', runId);

      // 7. Atualizar contadores da automação
      try {
        await supabase.rpc('increment_automation_stats', {
          p_automation_id: run.automation_id,
          p_success: result.success,
        });
      } catch {
        // RPC pode não existir ainda, ignorar
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error(`[Worker] Automation run ${runId} failed:`, error);
    
    // Atualizar como falho
    await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // Retorna 200 para não retentar (erro de lógica, não infra)
    return NextResponse.json({ success: false, error: error.message });
  }
}

// ============================================
// PROCESSAMENTO DA AUTOMAÇÃO
// ============================================

interface ProcessResult {
  success: boolean;
  status: 'completed' | 'failed' | 'waiting';
  nodesProcessed: number;
  errors: string[];
  outputs: Record<string, any>;
}

async function processAutomation(
  supabase: any, 
  run: any, 
  automation: any
): Promise<ProcessResult> {
  const result: ProcessResult = {
    success: true,
    status: 'completed',
    nodesProcessed: 0,
    errors: [],
    outputs: {},
  };

  // Pegar nodes e edges do automation
  const nodes = automation.nodes || [];
  const edges = automation.edges || [];

  if (nodes.length === 0) {
    result.errors.push('No nodes in automation');
    result.success = false;
    result.status = 'failed';
    return result;
  }

  // Encontrar o trigger node (primeiro node)
  const triggerNode = nodes.find((n: any) => 
    n.type?.startsWith('trigger_') || n.data?.category === 'trigger'
  );

  if (!triggerNode) {
    result.errors.push('No trigger node found');
    result.success = false;
    result.status = 'failed';
    return result;
  }

  // Contexto inicial vem do metadata do run
  let context = { ...run.metadata };

  // Processar nodes em ordem
  let currentNodeId: string | null = triggerNode.id;

  while (currentNodeId) {
    const currentNode = nodes.find((n: any) => n.id === currentNodeId);
    if (!currentNode) break;

    try {
      // Registrar início do step
      await logStepStart(supabase, run.id, currentNode);

      // Executar o node
      const nodeResult = await executeNode(
        supabase,
        automation.organization_id,
        currentNode,
        context,
        run.id
      );

      // Se é um delay, agendar continuação e parar aqui
      if (currentNode.type === 'logic_delay' || currentNode.data?.type === 'delay') {
        const delayConfig = currentNode.data?.config?.delay || { value: 1, unit: 'hours' };
        const delaySeconds = calculateDelaySeconds(delayConfig.value, delayConfig.unit);
        
        // Encontrar próximo node
        const nextEdge = edges.find((e: any) => e.source === currentNodeId);
        const nextNodeId = nextEdge?.target;

        if (nextNodeId && delaySeconds > 0) {
          // Agendar execução do próximo node
          const scheduled = await enqueueAutomationStep(
            run.id, 
            nextNodeId, 
            { ...context, ...nodeResult }, 
            delaySeconds
          );
          
          if (scheduled) {
            // Atualizar run para aguardando
            await supabase
              .from('automation_runs')
              .update({
                status: 'waiting',
                current_node_id: nextNodeId,
                metadata: { ...run.metadata, context: { ...context, ...nodeResult } },
              })
              .eq('id', run.id);

            await logStepComplete(supabase, run.id, currentNode, { 
              delayed: true, 
              delay_seconds: delaySeconds,
              next_node: nextNodeId 
            });
            
            result.nodesProcessed++;
            result.outputs[currentNode.id] = { delayed: true, nextNodeId };
            result.status = 'waiting';
            
            return result;
          }
        }
        
        // Se não conseguiu agendar ou não tem próximo, continua
        await logStepComplete(supabase, run.id, currentNode, { delayed: false });
      } else {
        await logStepComplete(supabase, run.id, currentNode, nodeResult);
      }

      // Atualizar contexto
      context = { ...context, ...nodeResult };
      result.outputs[currentNode.id] = nodeResult;
      result.nodesProcessed++;

      // Encontrar próximo node
      const outgoingEdge = edges.find((e: any) => {
        if (e.source !== currentNodeId) return false;
        
        // Handle condition nodes
        if (currentNode.type === 'logic_condition' || currentNode.data?.type === 'condition') {
          const conditionResult = nodeResult.conditionResult;
          return e.sourceHandle === (conditionResult ? 'true' : 'false');
        }
        
        // Handle A/B split
        if (currentNode.type === 'logic_split' || currentNode.data?.type === 'ab_split') {
          return e.sourceHandle === nodeResult.variant;
        }
        
        return true;
      });

      currentNodeId = outgoingEdge?.target || null;

    } catch (error: any) {
      result.errors.push(`Node ${currentNode.id}: ${error.message}`);
      await logStepError(supabase, run.id, currentNode, error.message);
      result.success = false;
      result.status = 'failed';
      break;
    }
  }

  return result;
}

// ============================================
// EXECUÇÃO DE NODES
// ============================================

async function executeNode(
  supabase: any,
  organizationId: string,
  node: any,
  context: any,
  runId: string
): Promise<Record<string, any>> {
  const nodeType = node.type || node.data?.type;
  const config = node.data?.config || {};

  console.log(`[Worker] Executing node: ${nodeType}`);

  switch (nodeType) {
    // Triggers (não executam nada, apenas passam dados)
    case 'trigger_order':
    case 'trigger_abandon':
    case 'trigger_signup':
    case 'trigger_tag':
    case 'trigger_date':
    case 'trigger_segment':
    case 'trigger_webhook':
    case 'trigger_deal_created':
    case 'trigger_deal_stage':
    case 'trigger_deal_won':
    case 'trigger_deal_lost':
      return { triggered: true };

    // Actions
    case 'action_email':
    case 'send_email':
      return await executeEmailAction(supabase, organizationId, config, context);
      
    case 'action_whatsapp':
    case 'send_whatsapp':
      return await executeWhatsAppAction(supabase, organizationId, config, context);
      
    case 'action_sms':
    case 'send_sms':
      return { smsSent: true, simulated: true };
      
    case 'action_tag':
    case 'add_tag':
      return await executeAddTagAction(supabase, config, context);
      
    case 'remove_tag':
      return await executeRemoveTagAction(supabase, config, context);
      
    case 'action_update':
    case 'update_contact':
      return await executeUpdateContactAction(supabase, config, context);
      
    case 'action_notify':
    case 'notify_team':
      return await executeNotifyTeamAction(supabase, organizationId, config, context);
      
    case 'action_webhook':
    case 'webhook':
      return await executeWebhookAction(config, context);
      
    case 'action_create_deal':
      return await executeCreateDealAction(supabase, organizationId, config, context);
      
    case 'action_move_deal':
      return await executeMoveDealAction(supabase, config, context);
      
    case 'action_assign_deal':
      return await executeAssignDealAction(supabase, config, context);

    // Logic
    case 'logic_condition':
    case 'condition':
      return evaluateCondition(config, context);
      
    case 'logic_split':
    case 'ab_split':
      return executeAbSplit(config);
      
    case 'logic_filter':
    case 'filter':
      return executeFilter(config, context);
      
    case 'logic_delay':
    case 'delay':
      return { delayed: true };

    default:
      console.warn(`[Worker] Unknown node type: ${nodeType}`);
      return {};
  }
}

// ============================================
// IMPLEMENTAÇÕES DAS ACTIONS
// ============================================

async function executeEmailAction(
  supabase: any,
  organizationId: string,
  config: any,
  context: any
): Promise<Record<string, any>> {
  // Buscar integração Klaviyo
  const { data: klaviyo } = await supabase
    .from('klaviyo_accounts')
    .select('api_key')
    .eq('organization_id', organizationId)
    .single();

  if (!klaviyo) {
    throw new Error('Klaviyo not configured');
  }

  const email = context.email;
  if (!email) {
    throw new Error('Email not available in context');
  }

  // Criar evento no Klaviyo para triggerar flow
  const eventName = config.eventName || `Automation: ${config.subject || 'Email'}`;
  
  const response = await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${klaviyo.api_key}`,
      'Content-Type': 'application/json',
      'revision': '2024-02-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: { data: { type: 'metric', attributes: { name: eventName } } },
          profile: { data: { type: 'profile', attributes: { email } } },
          properties: {
            subject: config.subject,
            template_id: config.templateId,
            ...interpolateObject(config.properties || {}, context),
          },
          time: new Date().toISOString(),
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Klaviyo API error: ${error}`);
  }

  return { emailSent: true, eventName };
}

async function executeWhatsAppAction(
  supabase: any,
  organizationId: string,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const { data: waConfig } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!waConfig) {
    throw new Error('WhatsApp not configured');
  }

  const phone = context.phone || context.whatsapp;
  if (!phone) {
    throw new Error('Phone not available in context');
  }

  const formattedPhone = formatPhoneNumber(phone);

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${waConfig.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${waConfig.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: config.templateId ? 'template' : 'text',
        ...(config.templateId
          ? {
              template: {
                name: config.templateId,
                language: { code: 'pt_BR' },
              },
            }
          : {
              text: {
                body: interpolateTemplate(config.message || '', context),
              },
            }),
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(result)}`);
  }

  return { whatsappSent: true, messageId: result.messages?.[0]?.id };
}

async function executeAddTagAction(
  supabase: any,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const contactId = context.contact_id;
  if (!contactId) {
    throw new Error('Contact ID not available');
  }

  const tagName = config.tagName || config.tag;
  if (!tagName) {
    throw new Error('Tag name not configured');
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .single();

  const currentTags = contact?.tags || [];
  
  if (!currentTags.includes(tagName)) {
    await supabase
      .from('contacts')
      .update({ tags: [...currentTags, tagName] })
      .eq('id', contactId);
  }

  return { tagAdded: tagName };
}

async function executeRemoveTagAction(
  supabase: any,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const contactId = context.contact_id;
  if (!contactId) return { tagRemoved: null };

  const tagName = config.tagName || config.tag;
  
  const { data: contact } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .single();

  const currentTags = contact?.tags || [];
  const newTags = currentTags.filter((t: string) => t !== tagName);

  await supabase
    .from('contacts')
    .update({ tags: newTags })
    .eq('id', contactId);

  return { tagRemoved: tagName };
}

async function executeUpdateContactAction(
  supabase: any,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const contactId = context.contact_id;
  if (!contactId) return { contactUpdated: false };

  const updates: Record<string, any> = {};
  
  for (const field of config.fields || []) {
    updates[field.name] = interpolateTemplate(field.value, context);
  }

  await supabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId);

  return { contactUpdated: true, fields: Object.keys(updates) };
}

async function executeNotifyTeamAction(
  supabase: any,
  organizationId: string,
  config: any,
  context: any
): Promise<Record<string, any>> {
  await supabase.from('notifications').insert({
    organization_id: organizationId,
    type: 'automation',
    title: config.title || 'Notificação de Automação',
    message: interpolateTemplate(config.message || '', context),
    metadata: {
      automation_id: context.automation_id,
      contact_id: context.contact_id,
      deal_id: context.deal_id,
    },
  });

  return { notified: true };
}

async function executeWebhookAction(
  config: any,
  context: any
): Promise<Record<string, any>> {
  const url = config.url;
  if (!url) {
    throw new Error('Webhook URL not configured');
  }

  const response = await fetch(url, {
    method: config.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    },
    body: JSON.stringify(interpolateObject(config.body || context, context)),
  });

  const result = await response.json().catch(() => ({}));

  return {
    webhookCalled: true,
    status: response.status,
    response: result,
  };
}

async function executeCreateDealAction(
  supabase: any,
  organizationId: string,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: organizationId,
      pipeline_id: config.pipelineId,
      stage_id: config.stageId,
      contact_id: context.contact_id,
      title: interpolateTemplate(config.title || 'Novo Deal', context),
      value: config.value || 0,
      status: 'open',
      position: 0,
    })
    .select()
    .single();

  if (error) throw error;

  return { dealCreated: true, dealId: deal.id };
}

async function executeMoveDealAction(
  supabase: any,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const dealId = context.deal_id;
  if (!dealId) return { dealMoved: false };

  await supabase
    .from('deals')
    .update({ stage_id: config.stageId })
    .eq('id', dealId);

  return { dealMoved: true, newStageId: config.stageId };
}

async function executeAssignDealAction(
  supabase: any,
  config: any,
  context: any
): Promise<Record<string, any>> {
  const dealId = context.deal_id;
  if (!dealId) return { dealAssigned: false };

  await supabase
    .from('deals')
    .update({ assigned_to: config.assignTo })
    .eq('id', dealId);

  return { dealAssigned: true, assignedTo: config.assignTo };
}

// ============================================
// LOGIC NODES
// ============================================

function evaluateCondition(config: any, context: any): { conditionResult: boolean } {
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
      result = String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());
      break;
    case 'not_contains':
      result = !String(fieldValue || '').toLowerCase().includes(String(value).toLowerCase());
      break;
    case 'greater_than':
      result = Number(fieldValue) > Number(value);
      break;
    case 'less_than':
      result = Number(fieldValue) < Number(value);
      break;
    case 'is_empty':
      result = !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
      break;
    case 'is_not_empty':
      result = !!fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
      break;
    case 'in_list':
      const list = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim());
      result = list.includes(fieldValue);
      break;
    case 'has_tag':
      const tags = context.tags || [];
      result = tags.includes(value);
      break;
  }

  return { conditionResult: result };
}

function executeAbSplit(config: any): { variant: string } {
  const random = Math.random() * 100;
  const splitPercentage = config.splitPercentage || 50;
  return { variant: random < splitPercentage ? 'A' : 'B' };
}

function executeFilter(config: any, context: any): { passedFilter: boolean } {
  const conditions = config.conditions || [];
  const matchType = config.matchType || 'all';

  if (conditions.length === 0) {
    return { passedFilter: true };
  }

  const results = conditions.map((condition: any) => {
    const { conditionResult } = evaluateCondition(condition, context);
    return conditionResult;
  });

  const passedFilter = matchType === 'all'
    ? results.every(Boolean)
    : results.some(Boolean);

  return { passedFilter };
}

// ============================================
// UTILITÁRIOS
// ============================================

function interpolateTemplate(template: string, context: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.trim().split('|');
    const fieldPath = parts[0].trim();
    const defaultValue = parts[1]?.replace(/^default:["']?|["']?$/g, '') || match;
    
    const value = getNestedValue(context, fieldPath);
    return value !== undefined && value !== null ? String(value) : defaultValue;
  });
}

function interpolateObject(obj: Record<string, any>, context: any): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolateTemplate(value, context);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = interpolateObject(value, context);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

// ============================================
// LOGGING
// ============================================

async function logStepStart(supabase: any, runId: string, node: any): Promise<void> {
  try {
    await supabase.from('automation_run_steps').insert({
      run_id: runId,
      node_id: node.id,
      node_type: node.type || node.data?.type,
      status: 'running',
      started_at: new Date().toISOString(),
    });
  } catch (e) {
    // Ignorar erros de log
  }
}

async function logStepComplete(supabase: any, runId: string, node: any, output: any): Promise<void> {
  try {
    await supabase
      .from('automation_run_steps')
      .update({
        status: 'completed',
        output_data: output,
        completed_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
      .eq('node_id', node.id);
  } catch (e) {
    // Ignorar erros de log
  }
}

async function logStepError(supabase: any, runId: string, node: any, error: string): Promise<void> {
  try {
    await supabase
      .from('automation_run_steps')
      .update({
        status: 'failed',
        error_message: error,
        completed_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
      .eq('node_id', node.id);
  } catch (e) {
    // Ignorar erros de log
  }
}
