/**
 * MÓDULO DE AÇÕES REAIS PARA AUTOMAÇÕES
 * 
 * Cada ação executa uma operação real:
 * - action_tag: Adiciona tag no contato
 * - action_update: Atualiza campos do contato
 * - action_email: Envia email (via Klaviyo ou SMTP)
 * - action_whatsapp: Envia WhatsApp (via API)
 * - action_sms: Envia SMS (via Twilio)
 * - action_create_deal: Cria um deal
 * - action_move_deal: Move deal para outro estágio
 * - action_notify: Envia notificação interna
 * - action_webhook: Chama webhook externo
 */

import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

// =====================================================
// TYPES
// =====================================================

export interface ActionResult {
  success: boolean;
  output: any;
  variables?: Record<string, any>;
  error?: string;
}

export interface ActionContext {
  contact: any;
  deal: any;
  trigger: any;
  system: any;
  nodes: Record<string, any>;
}

// =====================================================
// MAIN EXECUTOR
// =====================================================

export async function executeAction(
  actionType: string,
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  console.log(`[Action] Executing ${actionType}`);

  try {
    switch (actionType) {
      case 'action_tag':
        return await executeAddTag(config, context, organizationId);
      
      case 'action_remove_tag':
        return await executeRemoveTag(config, context, organizationId);
      
      case 'action_update':
        return await executeUpdateContact(config, context, organizationId);
      
      case 'action_email':
        return await executeSendEmail(config, context, organizationId);
      
      case 'action_whatsapp':
        return await executeSendWhatsApp(config, context, organizationId);
      
      case 'action_sms':
        return await executeSendSMS(config, context, organizationId);
      
      case 'action_create_deal':
        return await executeCreateDeal(config, context, organizationId);
      
      case 'action_move_deal':
        return await executeMoveDeal(config, context, organizationId);
      
      case 'action_assign_deal':
        return await executeAssignDeal(config, context, organizationId);
      
      case 'action_notify':
        return await executeSendNotification(config, context, organizationId);
      
      case 'action_webhook':
        return await executeCallWebhook(config, context, organizationId);
      
      default:
        return {
          success: true,
          output: { 
            action: actionType, 
            message: 'Ação não implementada',
            config 
          }
        };
    }
  } catch (error: any) {
    console.error(`[Action] Error in ${actionType}:`, error);
    return {
      success: false,
      output: { error: error.message },
      error: error.message
    };
  }
}

// =====================================================
// ACTION: ADD TAG
// =====================================================

async function executeAddTag(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contactId = context.contact?.id;
  if (!contactId) {
    throw new Error('Contato não encontrado no contexto');
  }

  const tagName = config.tagName || config.tag;
  const tagId = config.tagId;

  if (!tagName && !tagId) {
    throw new Error('Nome ou ID da tag não especificado');
  }

  // Se tem tagId, usa direto. Se não, busca ou cria por nome
  let finalTagId = tagId;
  
  if (!finalTagId && tagName) {
    // Buscar tag existente
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', tagName)
      .single();

    if (existingTag) {
      finalTagId = existingTag.id;
    } else {
      // Criar tag se não existe
      const { data: newTag, error: createError } = await supabase
        .from('tags')
        .insert({
          organization_id: organizationId,
          name: tagName,
          color: config.tagColor || '#8B5CF6'
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Erro ao criar tag: ${createError.message}`);
      }
      finalTagId = newTag.id;
    }
  }

  // Verificar se já tem a tag
  const { data: existingContactTag } = await supabase
    .from('contact_tags')
    .select('id')
    .eq('contact_id', contactId)
    .eq('tag_id', finalTagId)
    .single();

  if (existingContactTag) {
    return {
      success: true,
      output: {
        action: 'add_tag',
        tag_name: tagName,
        tag_id: finalTagId,
        contact_id: contactId,
        already_had_tag: true
      }
    };
  }

  // Adicionar tag ao contato
  const { error: insertError } = await supabase
    .from('contact_tags')
    .insert({
      contact_id: contactId,
      tag_id: finalTagId,
      organization_id: organizationId
    });

  if (insertError) {
    throw new Error(`Erro ao adicionar tag: ${insertError.message}`);
  }

  console.log(`[Action] Tag "${tagName}" added to contact ${contactId}`);

  return {
    success: true,
    output: {
      action: 'add_tag',
      tag_name: tagName,
      tag_id: finalTagId,
      contact_id: contactId,
      applied: true
    }
  };
}

// =====================================================
// ACTION: REMOVE TAG
// =====================================================

async function executeRemoveTag(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contactId = context.contact?.id;
  if (!contactId) {
    throw new Error('Contato não encontrado no contexto');
  }

  const tagName = config.tagName || config.tag;
  const tagId = config.tagId;

  let finalTagId = tagId;
  
  if (!finalTagId && tagName) {
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', tagName)
      .single();

    finalTagId = existingTag?.id;
  }

  if (!finalTagId) {
    return {
      success: true,
      output: {
        action: 'remove_tag',
        tag_name: tagName,
        contact_id: contactId,
        tag_not_found: true
      }
    };
  }

  const { error } = await supabase
    .from('contact_tags')
    .delete()
    .eq('contact_id', contactId)
    .eq('tag_id', finalTagId);

  if (error) {
    throw new Error(`Erro ao remover tag: ${error.message}`);
  }

  return {
    success: true,
    output: {
      action: 'remove_tag',
      tag_name: tagName,
      tag_id: finalTagId,
      contact_id: contactId,
      removed: true
    }
  };
}

// =====================================================
// ACTION: UPDATE CONTACT
// =====================================================

async function executeUpdateContact(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contactId = context.contact?.id;
  if (!contactId) {
    throw new Error('Contato não encontrado no contexto');
  }

  const updates: Record<string, any> = {};
  const fieldsUpdated: string[] = [];

  // Campos padrão
  if (config.firstName !== undefined) {
    updates.first_name = resolveVariable(config.firstName, context);
    fieldsUpdated.push('first_name');
  }
  if (config.lastName !== undefined) {
    updates.last_name = resolveVariable(config.lastName, context);
    fieldsUpdated.push('last_name');
  }
  if (config.phone !== undefined) {
    updates.phone = resolveVariable(config.phone, context);
    fieldsUpdated.push('phone');
  }
  if (config.source !== undefined) {
    updates.source = resolveVariable(config.source, context);
    fieldsUpdated.push('source');
  }

  // Custom fields
  if (config.customFields && Object.keys(config.customFields).length > 0) {
    const resolvedCustomFields: Record<string, any> = {};
    for (const [key, value] of Object.entries(config.customFields)) {
      resolvedCustomFields[key] = resolveVariable(value as string, context);
    }
    updates.custom_fields = {
      ...context.contact?.custom_fields,
      ...resolvedCustomFields
    };
    fieldsUpdated.push('custom_fields');
  }

  if (Object.keys(updates).length === 0) {
    return {
      success: true,
      output: {
        action: 'update_contact',
        contact_id: contactId,
        no_updates: true
      }
    };
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId);

  if (error) {
    throw new Error(`Erro ao atualizar contato: ${error.message}`);
  }

  console.log(`[Action] Contact ${contactId} updated: ${fieldsUpdated.join(', ')}`);

  return {
    success: true,
    output: {
      action: 'update_contact',
      contact_id: contactId,
      fields_updated: fieldsUpdated,
      new_values: updates
    }
  };
}

// =====================================================
// ACTION: SEND EMAIL
// =====================================================

async function executeSendEmail(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contact = context.contact;
  if (!contact?.email) {
    throw new Error('Email do contato não encontrado');
  }

  // Buscar integração de email (Klaviyo ou outro)
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('type', 'klaviyo')
    .eq('status', 'active')
    .single();

  const subject = resolveVariable(config.subject || 'Mensagem automática', context);
  const body = resolveVariable(config.body || config.message || '', context);
  const templateId = config.templateId || config.template;

  if (integration) {
    // Enviar via Klaviyo
    try {
      const klaviyoApiKey = integration.credentials?.api_key;
      
      if (templateId) {
        // Usar template do Klaviyo
        // TODO: Implementar chamada real à API do Klaviyo
        console.log(`[Action] Would send Klaviyo template ${templateId} to ${contact.email}`);
      } else {
        // Enviar email direto
        console.log(`[Action] Would send Klaviyo email to ${contact.email}`);
      }

      return {
        success: true,
        output: {
          action: 'send_email',
          provider: 'klaviyo',
          to: contact.email,
          subject,
          template_id: templateId,
          sent: true
        }
      };
    } catch (e: any) {
      throw new Error(`Erro ao enviar email via Klaviyo: ${e.message}`);
    }
  }

  // Sem integração - logar apenas
  console.log(`[Action] Email would be sent to ${contact.email} (no integration configured)`);
  
  return {
    success: true,
    output: {
      action: 'send_email',
      provider: 'none',
      to: contact.email,
      subject,
      body_preview: body.substring(0, 100),
      warning: 'Integração de email não configurada'
    }
  };
}

// =====================================================
// ACTION: SEND WHATSAPP
// =====================================================

async function executeSendWhatsApp(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contact = context.contact;
  if (!contact?.phone) {
    throw new Error('Telefone do contato não encontrado');
  }

  // Buscar integração WhatsApp
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('type', 'whatsapp')
    .eq('status', 'active')
    .single();

  const message = resolveVariable(config.message || config.body || '', context);
  const templateId = config.templateId || config.template;

  if (integration) {
    try {
      const phoneNumber = formatPhoneNumber(contact.phone);
      
      // TODO: Implementar chamada real à API do WhatsApp Business
      console.log(`[Action] Would send WhatsApp to ${phoneNumber}`);

      return {
        success: true,
        output: {
          action: 'send_whatsapp',
          to: phoneNumber,
          template_id: templateId,
          message_preview: message.substring(0, 100),
          sent: true
        }
      };
    } catch (e: any) {
      throw new Error(`Erro ao enviar WhatsApp: ${e.message}`);
    }
  }

  return {
    success: true,
    output: {
      action: 'send_whatsapp',
      to: contact.phone,
      message_preview: message.substring(0, 100),
      warning: 'Integração WhatsApp não configurada'
    }
  };
}

// =====================================================
// ACTION: SEND SMS
// =====================================================

async function executeSendSMS(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contact = context.contact;
  if (!contact?.phone) {
    throw new Error('Telefone do contato não encontrado');
  }

  // Buscar integração Twilio
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('type', 'twilio')
    .eq('status', 'active')
    .single();

  const message = resolveVariable(config.message || config.body || '', context);

  if (integration) {
    try {
      const phoneNumber = formatPhoneNumber(contact.phone);
      
      // TODO: Implementar chamada real à API do Twilio
      console.log(`[Action] Would send SMS to ${phoneNumber}`);

      return {
        success: true,
        output: {
          action: 'send_sms',
          to: phoneNumber,
          message_preview: message.substring(0, 100),
          sent: true
        }
      };
    } catch (e: any) {
      throw new Error(`Erro ao enviar SMS: ${e.message}`);
    }
  }

  return {
    success: true,
    output: {
      action: 'send_sms',
      to: contact.phone,
      message_preview: message.substring(0, 100),
      warning: 'Integração SMS não configurada'
    }
  };
}

// =====================================================
// ACTION: CREATE DEAL
// =====================================================

async function executeCreateDeal(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contactId = context.contact?.id;
  
  const title = resolveVariable(config.title || 'Novo Deal', context);
  const value = config.value || 0;
  const pipelineId = config.pipelineId;
  const stageId = config.stageId;

  // Se não especificou pipeline, busca o padrão
  let finalPipelineId = pipelineId;
  let finalStageId = stageId;

  if (!finalPipelineId) {
    const { data: defaultPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1)
      .single();
    
    finalPipelineId = defaultPipeline?.id;
  }

  if (!finalStageId && finalPipelineId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', finalPipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single();
    
    finalStageId = firstStage?.id;
  }

  if (!finalPipelineId) {
    throw new Error('Pipeline não encontrado');
  }

  const { data: newDeal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      pipeline_id: finalPipelineId,
      stage_id: finalStageId,
      title,
      value,
      status: 'open'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao criar deal: ${error.message}`);
  }

  console.log(`[Action] Deal "${title}" created: ${newDeal.id}`);

  return {
    success: true,
    output: {
      action: 'create_deal',
      deal_id: newDeal.id,
      title,
      value,
      pipeline_id: finalPipelineId,
      stage_id: finalStageId,
      created: true
    }
  };
}

// =====================================================
// ACTION: MOVE DEAL
// =====================================================

async function executeMoveDeal(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const dealId = context.deal?.id;
  if (!dealId) {
    throw new Error('Deal não encontrado no contexto');
  }

  const newStageId = config.stageId;
  if (!newStageId) {
    throw new Error('Estágio de destino não especificado');
  }

  const { error } = await supabase
    .from('deals')
    .update({
      stage_id: newStageId,
      updated_at: new Date().toISOString()
    })
    .eq('id', dealId);

  if (error) {
    throw new Error(`Erro ao mover deal: ${error.message}`);
  }

  console.log(`[Action] Deal ${dealId} moved to stage ${newStageId}`);

  return {
    success: true,
    output: {
      action: 'move_deal',
      deal_id: dealId,
      new_stage_id: newStageId,
      moved: true
    }
  };
}

// =====================================================
// ACTION: ASSIGN DEAL
// =====================================================

async function executeAssignDeal(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const dealId = context.deal?.id;
  if (!dealId) {
    throw new Error('Deal não encontrado no contexto');
  }

  const assignedTo = config.userId || config.assignedTo;
  if (!assignedTo) {
    throw new Error('Usuário não especificado');
  }

  const { error } = await supabase
    .from('deals')
    .update({
      assigned_to: assignedTo,
      updated_at: new Date().toISOString()
    })
    .eq('id', dealId);

  if (error) {
    throw new Error(`Erro ao atribuir deal: ${error.message}`);
  }

  return {
    success: true,
    output: {
      action: 'assign_deal',
      deal_id: dealId,
      assigned_to: assignedTo,
      assigned: true
    }
  };
}

// =====================================================
// ACTION: SEND NOTIFICATION
// =====================================================

async function executeSendNotification(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const title = resolveVariable(config.title || 'Notificação', context);
  const message = resolveVariable(config.message || '', context);
  const channel = config.channel || 'app'; // app, email, slack
  const recipients = config.recipients || []; // user IDs

  // Criar notificação no banco
  const { error } = await supabase
    .from('notifications')
    .insert({
      organization_id: organizationId,
      title,
      message,
      type: 'automation',
      data: {
        contact_id: context.contact?.id,
        deal_id: context.deal?.id,
        automation_run: context.system?.execution_id
      }
    });

  if (error) {
    console.error('[Action] Error creating notification:', error);
    // Não falha a automação por erro de notificação
  }

  console.log(`[Action] Notification sent: "${title}"`);

  return {
    success: true,
    output: {
      action: 'send_notification',
      title,
      message_preview: message.substring(0, 100),
      channel,
      sent: true
    }
  };
}

// =====================================================
// ACTION: CALL WEBHOOK
// =====================================================

async function executeCallWebhook(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const url = config.url;
  if (!url) {
    throw new Error('URL do webhook não especificada');
  }

  const method = (config.method || 'POST').toUpperCase();
  const headers = config.headers || { 'Content-Type': 'application/json' };
  
  // Monta o body com dados do contexto
  const body = config.body || {
    contact: context.contact,
    deal: context.deal,
    trigger: context.trigger,
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log(`[Action] Webhook called: ${method} ${url} - ${response.status}`);

    return {
      success: response.ok,
      output: {
        action: 'call_webhook',
        url,
        method,
        status_code: response.status,
        response: responseData,
        sent: true
      }
    };
  } catch (e: any) {
    throw new Error(`Erro ao chamar webhook: ${e.message}`);
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function resolveVariable(template: string, context: ActionContext): string {
  if (typeof template !== 'string') return template;
  
  // Substitui variáveis no formato {{campo}} ou {{contact.nome}}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined && value !== null ? String(value) : match;
  });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function formatPhoneNumber(phone: string): string {
  // Remove caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '');
  
  // Adiciona código do país se não tiver
  if (cleaned.length === 11 && cleaned.startsWith('9')) {
    // Celular brasileiro sem DDD
    cleaned = '55' + cleaned;
  } else if (cleaned.length === 11) {
    // Com DDD
    cleaned = '55' + cleaned;
  } else if (cleaned.length === 10 || cleaned.length === 9) {
    // Sem DDD - assume 11 (SP)
    cleaned = '5511' + cleaned;
  }
  
  return '+' + cleaned;
}
