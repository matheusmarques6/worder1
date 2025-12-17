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

    if (error) {
      console.error('Error fetching automations:', error);
      return NextResponse.json({ automations: [] });
    }
    return NextResponse.json({ automations: data || [] });
  } catch (error: any) {
    console.error('Automation GET error:', error);
    return NextResponse.json({ automations: [] });
  }
}

// POST - Create automation or trigger run
export async function POST(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json();
  const { action, ...data } = body;

  try {
    // Se não tem action, assume que é criação direta
    if (!action) {
      const {
        organizationId,
        name,
        description,
        trigger_type,
        trigger_config,
        nodes,
        edges,
        status = 'draft',
      } = body;

      if (!organizationId || !name) {
        return NextResponse.json({ error: 'Organization ID and name required' }, { status: 400 });
      }

      const { data: automation, error } = await supabase
        .from('automations')
        .insert({
          organization_id: organizationId,
          name,
          description,
          trigger_type,
          trigger_config,
          nodes,
          edges,
          status,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ automation });
    }

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
    console.error('Automation POST error:', error);
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
  // Suportar ambos formatos: canvas_data ou nodes/edges direto
  const nodes = automation.nodes || automation.canvas_data?.nodes || [];
  const edges = automation.edges || automation.canvas_data?.edges || [];

  console.log(`🚀 Iniciando automação com ${nodes.length} nós e ${edges.length} conexões`);

  // Encontrar trigger node (começa com 'trigger_' ou tem category 'trigger')
  const triggerNode = nodes.find((n: any) => 
    n.type?.startsWith('trigger_') || n.data?.category === 'trigger'
  );
  
  if (!triggerNode) {
    console.error('❌ Nenhum nó de gatilho encontrado');
    await updateRunStatus(runId, 'failed', { error: 'No trigger node found' });
    return;
  }

  console.log(`📍 Trigger encontrado: ${triggerNode.type}`);

  // Processar nós em ordem
  try {
    let currentNodeId = triggerNode.id;
    let context = { 
      ...triggerData,
      automation_id: automation.id,
      organization_id: automation.organization_id,
    };

    let nodeCount = 0;
    const maxNodes = 50; // Limite de segurança

    while (currentNodeId && nodeCount < maxNodes) {
      nodeCount++;
      const currentNode = nodes.find((n: any) => n.id === currentNodeId);
      if (!currentNode) {
        console.warn(`⚠️ Nó não encontrado: ${currentNodeId}`);
        break;
      }

      console.log(`\n📦 Executando nó ${nodeCount}: ${currentNode.type} (${currentNode.id})`);

      // Executar ação do nó
      const result = await executeNode(automation.organization_id, currentNode, context);
      context = { ...context, ...result };

      // Encontrar próximo nó
      const outgoingEdge = edges.find((e: any) => {
        if (e.source !== currentNodeId) return false;
        
        // Handle nós de condição (logic_condition, logic_split)
        if (currentNode.type === 'logic_condition' || currentNode.type === 'logic_split') {
          const conditionResult = result.conditionResult ?? result.variant === 'A';
          const expectedHandle = conditionResult ? 'true' : 'false';
          console.log(`  ↳ Condição: ${conditionResult ? '✅' : '❌'} → Handle ${expectedHandle}`);
          return e.sourceHandle === expectedHandle;
        }
        
        // Handle nós de filtro (só continua se passar)
        if (currentNode.type === 'logic_filter') {
          if (!result.passedFilter) {
            console.log(`  ↳ Filtro: ❌ Bloqueado - fluxo interrompido`);
            return false;
          }
        }
        
        return true;
      });

      currentNodeId = outgoingEdge?.target || null;

      // Handle delays
      if (currentNode.type === 'logic_delay') {
        const delayConfig = currentNode.data?.config?.delay || { value: 1, unit: 'hours' };
        const delayMs = calculateDelayMs(delayConfig);
        console.log(`  ↳ Delay: ${delayConfig.value} ${delayConfig.unit} (${delayMs}ms)`);
        
        // Em produção, usar job queue. Aqui, cap em 5s para demo
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 5000)));
      }
    }

    if (nodeCount >= maxNodes) {
      console.warn('⚠️ Limite de nós atingido - possível loop infinito');
    }

    console.log(`\n✅ Automação concluída após ${nodeCount} nós`);
    await updateRunStatus(runId, 'completed', { context, nodesExecuted: nodeCount });
  } catch (error: any) {
    console.error(`\n❌ Automação falhou:`, error);
    await updateRunStatus(runId, 'failed', { error: error.message });
  }
}

function calculateDelayMs(delay: { value: number; unit: string }): number {
  const { value, unit } = delay;
  switch (unit) {
    case 'minutes': return value * 60 * 1000;
    case 'hours': return value * 60 * 60 * 1000;
    case 'days': return value * 24 * 60 * 60 * 1000;
    default: return value * 60 * 60 * 1000; // default hours
  }
}

async function executeNode(organizationId: string, node: any, context: any): Promise<any> {
  const { type } = node;
  const config = node.data?.config || {};

  console.log(`🔄 Executando nó: ${type}`, { config, context });

  switch (type) {
    // ==================== ACTIONS ====================
    
    case 'action_email':
      return await executeEmailNode(organizationId, config, context);

    case 'action_whatsapp':
      return await executeWhatsAppNode(organizationId, config, context);

    case 'action_sms':
      return await executeSmsNode(organizationId, config, context);

    case 'action_tag':
      if (config.tagAction === 'remove') {
        return await executeRemoveTagNode(organizationId, config, context);
      }
      return await executeAddTagNode(organizationId, config, context);

    case 'action_update':
      return await executeUpdateContactNode(organizationId, config, context);

    case 'action_create_deal':
      return await executeCreateDealNode(organizationId, config, context);

    case 'action_move_deal':
      return await executeMoveDealNode(organizationId, config, context);

    case 'action_assign_deal':
      return await executeAssignDealNode(organizationId, config, context);

    case 'action_notify':
      return await executeNotifyTeamNode(organizationId, config, context);

    case 'action_webhook':
      return await executeWebhookNode(config, context);

    // ==================== LOGIC ====================

    case 'logic_condition':
      return await evaluateCondition(config, context);

    case 'logic_split':
      return await executeAbSplit(config);

    case 'logic_filter':
      return await executeFilter(config, context);

    case 'logic_delay':
      return { delayed: true, delayConfig: config.delay };

    // ==================== TRIGGERS (info only) ====================
    
    case 'trigger_order':
    case 'trigger_abandon':
    case 'trigger_signup':
    case 'trigger_tag':
    case 'trigger_deal_created':
    case 'trigger_deal_stage':
    case 'trigger_deal_won':
    case 'trigger_deal_lost':
    case 'trigger_date':
    case 'trigger_segment':
    case 'trigger_webhook':
      // Triggers não executam ação, apenas iniciam o fluxo
      return { triggered: true, triggerType: type, triggerConfig: config };

    default:
      console.warn(`⚠️ Tipo de nó desconhecido: ${type}`);
      return { unknown: true, type };
  }
}

async function executeEmailNode(organizationId: string, config: any, context: any) {
  const email = context.email || context.contact?.email;
  const subject = interpolateTemplate(config.subject || 'Mensagem automática', context);

  if (!email) {
    console.warn('⚠️ Contato não tem email');
    return { emailSent: false, error: 'No email address' };
  }

  // Buscar integração de email (Klaviyo ou SMTP)
  const { data: klaviyo } = await supabase
    .from('klaviyo_integrations')
    .select('api_key')
    .eq('organization_id', organizationId)
    .single();

  if (!klaviyo?.api_key) {
    console.warn('⚠️ Klaviyo não configurado - simulando envio');
    console.log(`📧 [SIMULADO] Email para ${email}: ${subject}`);
    return { emailSent: true, simulated: true, email, subject };
  }

  try {
    // Enviar via Klaviyo
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
            name: subject,
            audiences: {
              included: [email],
            },
            send_strategy: {
              method: 'immediate',
            },
          },
        },
      }),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Email enviado para ${email}`);
      await supabase.rpc('increment_automation_metric', {
        p_automation_id: context.automation_id,
        p_metric: 'emails_sent',
        p_value: 1,
      }).catch(() => {});

      return { emailSent: true, klaviyoResponse: result };
    } else {
      console.error('❌ Erro Klaviyo:', result);
      return { emailSent: false, error: result };
    }
  } catch (error: any) {
    console.error('❌ Erro ao enviar email:', error);
    return { emailSent: false, error: error.message };
  }
}

async function executeWhatsAppNode(organizationId: string, config: any, context: any) {
  const phone = context.phone || context.contact?.phone;

  if (!phone) {
    console.warn('⚠️ Contato não tem telefone');
    return { whatsappSent: false, error: 'No phone number' };
  }

  // Buscar credenciais do WhatsApp
  const { data: waConfig } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!waConfig?.access_token) {
    console.warn('⚠️ WhatsApp não configurado - simulando envio');
    const message = config.messageType === 'template' 
      ? `[Template: ${config.templateName}]`
      : interpolateTemplate(config.message || '', context);
    console.log(`📱 [SIMULADO] WhatsApp para ${phone}: ${message}`);
    return { whatsappSent: true, simulated: true, phone, message };
  }

  try {
    let messagePayload: any;

    if (config.messageType === 'template') {
      // Mensagem de template
      messagePayload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage || 'pt_BR' },
        },
      };
    } else {
      // Mensagem de texto
      const message = interpolateTemplate(config.message || '', context);
      messagePayload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${waConfig.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${waConfig.access_token}`,
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ WhatsApp enviado para ${phone}`);
      await supabase.rpc('increment_automation_metric', {
        p_automation_id: context.automation_id,
        p_metric: 'whatsapp_sent',
        p_value: 1,
      }).catch(() => {});

      return { whatsappSent: true, whatsappResponse: result };
    } else {
      console.error('❌ Erro WhatsApp:', result);
      return { whatsappSent: false, error: result };
    }
  } catch (error: any) {
    console.error('❌ Erro ao enviar WhatsApp:', error);
    return { whatsappSent: false, error: error.message };
  }
}

async function executeSmsNode(organizationId: string, config: any, context: any) {
  // Buscar credenciais do Twilio
  const { data: twilioConfig } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('organization_id', organizationId)
    .eq('type', 'twilio')
    .eq('is_active', true)
    .single();

  const phone = context.phone || context.contact?.phone;
  const message = interpolateTemplate(config.message || '', context);

  if (!phone) {
    console.warn('⚠️ Contato não tem telefone');
    return { smsSent: false, error: 'No phone number' };
  }

  if (!twilioConfig?.credentials) {
    console.warn('⚠️ Twilio não configurado - simulando envio');
    console.log(`📱 [SIMULADO] SMS para ${phone}: ${message}`);
    return { smsSent: true, simulated: true, phone, message };
  }

  const { accountSid, authToken, phoneNumber } = twilioConfig.credentials;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        body: new URLSearchParams({
          To: phone,
          From: phoneNumber,
          Body: message,
        }),
      }
    );

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ SMS enviado para ${phone}`);
      await supabase.rpc('increment_automation_metric', {
        p_automation_id: context.automation_id,
        p_metric: 'sms_sent',
        p_value: 1,
      }).catch(() => {});

      return { smsSent: true, twilioSid: result.sid };
    } else {
      console.error('❌ Erro Twilio:', result);
      return { smsSent: false, error: result.message };
    }
  } catch (error: any) {
    console.error('❌ Erro ao enviar SMS:', error);
    return { smsSent: false, error: error.message };
  }
}

async function executeAddTagNode(organizationId: string, config: any, context: any) {
  // Pegar tags do formato do frontend
  let tagsToAdd: string[] = [];
  
  if (config.tagName) {
    tagsToAdd = config.tagName.split(',').map((t: string) => t.trim()).filter(Boolean);
  } else if (config.tags) {
    tagsToAdd = Array.isArray(config.tags) ? config.tags : [config.tags];
  }

  if (tagsToAdd.length === 0) {
    console.warn('⚠️ Nenhuma tag para adicionar');
    return { tagsAdded: [], success: false };
  }

  const contactId = context.contact_id || context.contactId;
  if (!contactId) {
    console.error('❌ contact_id não encontrado no contexto');
    return { tagsAdded: [], success: false, error: 'No contact_id' };
  }

  console.log(`🏷️ Adicionando tags ao contato ${contactId}: ${tagsToAdd.join(', ')}`);

  // Buscar tags atuais do contato
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError) {
    console.error('❌ Erro ao buscar contato:', fetchError);
    return { tagsAdded: [], success: false, error: fetchError.message };
  }

  // Mesclar tags (sem duplicatas)
  const existingTags: string[] = contact?.tags || [];
  const newTags = [...new Set([...existingTags, ...tagsToAdd])];

  // Atualizar contato
  const { error: updateError } = await supabase
    .from('contacts')
    .update({ tags: newTags, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('organization_id', organizationId);

  if (updateError) {
    console.error('❌ Erro ao atualizar tags:', updateError);
    return { tagsAdded: [], success: false, error: updateError.message };
  }

  console.log(`✅ Tags adicionadas: ${tagsToAdd.join(', ')}`);
  return { tagsAdded: tagsToAdd, success: true, newTags };
}

async function executeRemoveTagNode(organizationId: string, config: any, context: any) {
  let tagsToRemove: string[] = [];
  
  if (config.tagName) {
    tagsToRemove = config.tagName.split(',').map((t: string) => t.trim()).filter(Boolean);
  } else if (config.tags) {
    tagsToRemove = Array.isArray(config.tags) ? config.tags : [config.tags];
  }

  if (tagsToRemove.length === 0) {
    return { tagsRemoved: [], success: false };
  }

  const contactId = context.contact_id || context.contactId;
  if (!contactId) {
    return { tagsRemoved: [], success: false, error: 'No contact_id' };
  }

  console.log(`🏷️ Removendo tags do contato ${contactId}: ${tagsToRemove.join(', ')}`);

  // Buscar tags atuais
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', contactId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError) {
    console.error('❌ Erro ao buscar contato:', fetchError);
    return { tagsRemoved: [], success: false, error: fetchError.message };
  }

  // Filtrar tags removidas
  const existingTags: string[] = contact?.tags || [];
  const newTags = existingTags.filter(t => !tagsToRemove.includes(t));

  // Atualizar contato
  const { error: updateError } = await supabase
    .from('contacts')
    .update({ tags: newTags, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('organization_id', organizationId);

  if (updateError) {
    console.error('❌ Erro ao remover tags:', updateError);
    return { tagsRemoved: [], success: false, error: updateError.message };
  }

  console.log(`✅ Tags removidas: ${tagsToRemove.join(', ')}`);
  return { tagsRemoved: tagsToRemove, success: true, newTags };
}

async function executeUpdateContactNode(organizationId: string, config: any, context: any) {
  const contactId = context.contact_id || context.contactId;
  if (!contactId) {
    console.error('❌ contact_id não encontrado no contexto');
    return { contactUpdated: false, error: 'No contact_id' };
  }

  const updates: any = {};
  
  // Campos padrão que podem ser atualizados
  const standardFields = ['first_name', 'last_name', 'email', 'phone', 'whatsapp', 'company', 'position'];
  
  // Novo formato do frontend (updateField, updateValue)
  if (config.updateField && config.updateValue !== undefined) {
    const field = config.updateField;
    const value = interpolateTemplate(config.updateValue, context);
    
    if (field === 'custom' && config.customField) {
      // Campo customizado vai em custom_fields JSONB
      const { data: contact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single();
      
      updates.custom_fields = {
        ...(contact?.custom_fields || {}),
        [config.customField]: value
      };
    } else if (standardFields.includes(field)) {
      updates[field] = value;
    } else {
      // Tentar como campo customizado
      const { data: contact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single();
      
      updates.custom_fields = {
        ...(contact?.custom_fields || {}),
        [field]: value
      };
    }
  }
  
  // Formato antigo (array de fields)
  if (config.fields && Array.isArray(config.fields)) {
    for (const field of config.fields) {
      const value = interpolateTemplate(field.value, context);
      if (standardFields.includes(field.name)) {
        updates[field.name] = value;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    console.warn('⚠️ Nenhum campo para atualizar');
    return { contactUpdated: false };
  }

  updates.updated_at = new Date().toISOString();

  console.log(`📝 Atualizando contato ${contactId}:`, updates);

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .eq('organization_id', organizationId);

  if (error) {
    console.error('❌ Erro ao atualizar contato:', error);
    return { contactUpdated: false, error: error.message };
  }

  console.log(`✅ Contato atualizado`);
  return { contactUpdated: true, updates, success: true };
}

async function executeNotifyTeamNode(organizationId: string, config: any, context: any) {
  const title = interpolateTemplate(config.title || 'Notificação de Automação', context);
  const message = interpolateTemplate(config.message || '', context);

  console.log(`🔔 Criando notificação: "${title}"`);

  // Determinar para quem notificar
  let userIds: string[] = [];

  if (config.notifyTarget === 'owner' && context.deal_id) {
    // Notificar o dono do deal
    const { data: deal } = await supabase
      .from('deals')
      .select('assigned_to')
      .eq('id', context.deal_id)
      .single();
    
    if (deal?.assigned_to) {
      userIds = [deal.assigned_to];
    }
  } else if (config.notifyTarget === 'specific' && config.notifyEmail) {
    // Notificar usuário específico
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', config.notifyEmail)
      .eq('organization_id', organizationId)
      .single();
    
    if (profile) {
      userIds = [profile.id];
    }
  } else {
    // Notificar todos (admins e owners)
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .in('role', ['owner', 'admin']);
    
    userIds = (members || []).map((m: any) => m.user_id);
  }

  // Se houver deal_id, registrar como atividade do deal
  if (context.deal_id) {
    await supabase
      .from('deal_activities')
      .insert({
        deal_id: context.deal_id,
        type: 'note',
        title: title,
        content: message,
        metadata: {
          automation_id: context.automation_id,
          notification_type: 'automation',
        }
      })
      .catch((err) => console.warn('⚠️ Não foi possível registrar atividade:', err));
  }

  // Tentar criar notificação na tabela notifications (se existir)
  if (userIds.length > 0) {
    try {
      await supabase
        .from('notifications')
        .insert(
          userIds.map(userId => ({
            organization_id: organizationId,
            user_id: userId,
            type: 'automation',
            title: title,
            message: message,
            metadata: { 
              automation_id: context.automation_id,
              contact_id: context.contact_id,
              deal_id: context.deal_id,
            },
            is_read: false,
            created_at: new Date().toISOString(),
          }))
        );
      console.log(`✅ Notificações criadas para ${userIds.length} usuário(s)`);
    } catch (err) {
      // Tabela pode não existir - apenas logar
      console.log(`📋 Notificação (tabela não existe): ${title} - ${message}`);
      console.log(`  → Usuários alvo: ${userIds.length}`);
    }
  }

  return { 
    notified: true, 
    title, 
    message, 
    targetUsers: userIds.length,
    success: true 
  };
}

// ==================== DEAL NODES ====================

async function executeCreateDealNode(organizationId: string, config: any, context: any) {
  const contactId = context.contact_id || context.contactId;
  
  // Interpolar título com variáveis do contexto
  const title = interpolateTemplate(
    config.dealTitle || config.title || 'Novo Deal de {{first_name}}', 
    context
  );
  const value = config.dealValue ? parseFloat(config.dealValue) : (config.value || 0);

  if (!config.pipelineId) {
    console.error('❌ Pipeline não selecionada');
    return { dealCreated: false, error: 'No pipeline selected' };
  }

  console.log(`💼 Criando deal: "${title}" na pipeline ${config.pipelineId}`);

  // Se não tiver estágio, pegar o primeiro da pipeline
  let stageId = config.stageId;
  if (!stageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', config.pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single();
    
    stageId = firstStage?.id;
  }

  const dealData: any = {
    organization_id: organizationId,
    pipeline_id: config.pipelineId,
    stage_id: stageId,
    title: title,
    value: value,
    probability: config.probability || 50,
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Vincular contato se existir
  if (contactId) {
    dealData.contact_id = contactId;
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .insert(dealData)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao criar deal:', error);
    return { dealCreated: false, error: error.message };
  }

  console.log(`✅ Deal criado: ${deal.id}`);
  
  // Adicionar ao contexto para próximos nós
  return { 
    dealCreated: true, 
    dealId: deal.id, 
    deal,
    deal_id: deal.id, // Para compatibilidade
    success: true 
  };
}

async function executeMoveDealNode(organizationId: string, config: any, context: any) {
  // Pegar deal_id do contexto (pode vir de trigger ou de action_create_deal anterior)
  const dealId = context.deal_id || context.dealId;
  
  if (!dealId) {
    console.error('❌ deal_id não encontrado no contexto');
    return { dealMoved: false, error: 'No deal_id in context' };
  }

  if (!config.stageId) {
    console.error('❌ Estágio de destino não selecionado');
    return { dealMoved: false, error: 'No stage selected' };
  }

  console.log(`📦 Movendo deal ${dealId} para estágio ${config.stageId}`);

  // Verificar se o deal pertence à organização
  const { data: existingDeal, error: fetchError } = await supabase
    .from('deals')
    .select('id, stage_id, title')
    .eq('id', dealId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !existingDeal) {
    console.error('❌ Deal não encontrado:', fetchError);
    return { dealMoved: false, error: 'Deal not found' };
  }

  const previousStageId = existingDeal.stage_id;

  // Preparar atualização
  const updateData: any = {
    stage_id: config.stageId,
    updated_at: new Date().toISOString(),
  };

  // Se mudar de pipeline também
  if (config.pipelineId) {
    updateData.pipeline_id = config.pipelineId;
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', dealId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao mover deal:', error);
    return { dealMoved: false, error: error.message };
  }

  // Registrar atividade de mudança de estágio
  await supabase
    .from('deal_activities')
    .insert({
      deal_id: dealId,
      type: 'stage_change',
      title: 'Deal movido por automação',
      metadata: {
        previous_stage_id: previousStageId,
        new_stage_id: config.stageId,
        automation_id: context.automation_id,
      }
    })
    .catch(() => {}); // Não falhar se não conseguir registrar atividade

  console.log(`✅ Deal movido para estágio ${config.stageId}`);
  return { 
    dealMoved: true, 
    dealId, 
    previousStageId,
    newStageId: config.stageId,
    success: true 
  };
}

async function executeAssignDealNode(organizationId: string, config: any, context: any) {
  const dealId = context.deal_id || context.dealId;
  
  if (!dealId) {
    console.error('❌ deal_id não encontrado no contexto');
    return { dealAssigned: false, error: 'No deal_id in context' };
  }

  let assignedToId: string | null = null;
  let assignedToEmail: string | null = null;

  if (config.assignmentType === 'round_robin') {
    // Round Robin: buscar usuários da organização e escolher um
    console.log(`🔄 Atribuição por Round Robin`);
    
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id, profiles!inner(id, email, first_name)')
      .eq('organization_id', organizationId);

    if (members && members.length > 0) {
      // Buscar quantos deals cada usuário tem em aberto
      const { data: dealCounts } = await supabase
        .from('deals')
        .select('assigned_to')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .not('assigned_to', 'is', null);

      // Contar deals por usuário
      const countByUser: Record<string, number> = {};
      (dealCounts || []).forEach((d: any) => {
        countByUser[d.assigned_to] = (countByUser[d.assigned_to] || 0) + 1;
      });

      // Encontrar usuário com menos deals
      let minDeals = Infinity;
      let selectedMember: any = null;

      for (const member of members) {
        const profile = (member as any).profiles;
        const count = countByUser[profile.id] || 0;
        if (count < minDeals) {
          minDeals = count;
          selectedMember = profile;
        }
      }

      if (selectedMember) {
        assignedToId = selectedMember.id;
        assignedToEmail = selectedMember.email;
        console.log(`  → Selecionado: ${selectedMember.first_name || selectedMember.email} (${minDeals} deals)`);
      }
    }
  } else {
    // Atribuição específica por email
    if (config.assigneeEmail) {
      console.log(`👤 Atribuição para: ${config.assigneeEmail}`);
      
      // Buscar usuário pelo email
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', config.assigneeEmail)
        .eq('organization_id', organizationId)
        .single();

      if (profile) {
        assignedToId = profile.id;
        assignedToEmail = profile.email;
      } else {
        console.warn(`⚠️ Usuário ${config.assigneeEmail} não encontrado na organização`);
      }
    }
  }

  if (!assignedToId) {
    console.warn('⚠️ Nenhum usuário disponível para atribuição');
    return { dealAssigned: false, error: 'No user found for assignment' };
  }

  // Atualizar deal
  const { data: deal, error } = await supabase
    .from('deals')
    .update({
      assigned_to: assignedToId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    console.error('❌ Erro ao atribuir deal:', error);
    return { dealAssigned: false, error: error.message };
  }

  console.log(`✅ Deal atribuído para ${assignedToEmail}`);
  return { 
    dealAssigned: true, 
    dealId, 
    assignedTo: assignedToId,
    assignedToEmail,
    success: true 
  };
}

async function executeWebhookNode(config: any, context: any) {
  const url = config.webhookUrl || config.url;
  const method = config.method || 'POST';
  
  // Parse headers se for string JSON
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.headers) {
    try {
      headers = { ...headers, ...(typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers) };
    } catch (e) {
      console.warn('⚠️ Headers inválidos, usando padrão');
    }
  }

  // Parse body ou usar context
  let body = context;
  if (config.webhookBody) {
    try {
      body = typeof config.webhookBody === 'string' 
        ? JSON.parse(interpolateTemplate(config.webhookBody, context))
        : config.webhookBody;
    } catch (e) {
      body = { data: interpolateTemplate(config.webhookBody, context) };
    }
  }

  console.log(`🌐 Chamando webhook: ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const result = await response.json().catch(() => ({ status: response.status }));

  console.log(`✅ Webhook respondeu: ${response.status}`);
  return { webhookResponse: result, webhookStatus: response.status, success: response.ok };
}

async function evaluateCondition(config: any, context: any): Promise<{ conditionResult: boolean }> {
  // Suportar ambos os formatos (antigo e novo)
  const field = config.conditionField || config.field;
  const operator = config.conditionOperator || config.operator;
  const value = config.conditionValue || config.value;
  
  const fieldValue = getNestedValue(context, field);

  console.log(`🔍 Avaliando condição: ${field} ${operator} ${value} (atual: ${fieldValue})`);

  let result = false;

  switch (operator) {
    case 'equals':
      result = String(fieldValue).toLowerCase() === String(value).toLowerCase();
      break;
    case 'not_equals':
      result = String(fieldValue).toLowerCase() !== String(value).toLowerCase();
      break;
    case 'contains':
      result = String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      break;
    case 'not_contains':
      result = !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      break;
    case 'starts_with':
      result = String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
      break;
    case 'ends_with':
      result = String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
      break;
    case 'greater_than':
      result = Number(fieldValue) > Number(value);
      break;
    case 'less_than':
      result = Number(fieldValue) < Number(value);
      break;
    case 'is_empty':
      result = !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined;
      break;
    case 'is_not_empty':
      result = !!fieldValue && fieldValue !== '' && fieldValue !== null;
      break;
    case 'in_list':
      const list = String(value).split(',').map(v => v.trim().toLowerCase());
      result = list.includes(String(fieldValue).toLowerCase());
      break;
    default:
      console.warn(`⚠️ Operador desconhecido: ${operator}`);
      result = false;
  }

  console.log(`📊 Resultado da condição: ${result ? '✅ Verdadeiro' : '❌ Falso'}`);
  return { conditionResult: result };
}

async function executeAbSplit(config: any): Promise<{ variant: string; path: string }> {
  const random = Math.random() * 100;
  const splitPercentage = config.splitPercentage || 50;
  
  const variant = random < splitPercentage ? 'A' : 'B';
  console.log(`🔀 Teste A/B: ${splitPercentage}% → Caminho ${variant}`);
  
  return {
    variant,
    path: variant === 'A' ? 'true' : 'false', // Para compatibilidade com condition handles
  };
}

async function executeFilter(config: any, context: any): Promise<{ passedFilter: boolean }> {
  // Suportar formato simples (filterField, filterOperator, filterValue)
  if (config.filterField) {
    const conditionConfig = {
      conditionField: config.filterField,
      conditionOperator: config.filterOperator,
      conditionValue: config.filterValue,
    };
    const { conditionResult } = await evaluateCondition(conditionConfig, context);
    console.log(`🔍 Filtro: ${conditionResult ? '✅ Passou' : '❌ Bloqueado'}`);
    return { passedFilter: conditionResult };
  }

  // Formato com múltiplas condições
  const conditions = config.conditions || [];
  const matchType = config.matchType || 'all';

  if (conditions.length === 0) {
    return { passedFilter: true };
  }

  const results = await Promise.all(
    conditions.map(async (condition: any) => {
      const { conditionResult } = await evaluateCondition(condition, context);
      return conditionResult;
    })
  );

  const passedFilter = matchType === 'all' 
    ? results.every(Boolean)
    : results.some(Boolean);

  console.log(`🔍 Filtro (${matchType}): ${passedFilter ? '✅ Passou' : '❌ Bloqueado'}`);
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
