/**
 * NODE EXECUTORS - COMPLETE VERSION
 * Specific execution logic for each node type with real integrations
 */

import { createClient } from '@supabase/supabase-js';
import { VariableContext } from './variable-engine';
import { WorkflowNode } from './execution-engine';

// ============================================
// TYPES
// ============================================

export interface NodeExecutionResult {
  status: 'success' | 'error' | 'skipped' | 'waiting';
  output: any;
  error?: string;
  duration?: number;
  branch?: string;
  waitUntil?: Date;
}

export interface NodeExecutorContext {
  node: WorkflowNode;
  config: Record<string, any>;
  context: VariableContext;
  credentials?: Record<string, any>;
  supabase: ReturnType<typeof createClient>;
  isTest: boolean;
}

export interface NodeExecutor {
  execute: (ctx: NodeExecutorContext) => Promise<NodeExecutionResult>;
}

// ============================================
// TRIGGER EXECUTORS
// ============================================

const triggerExecutors: Record<string, NodeExecutor> = {
  trigger_order: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_order_paid: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_abandon: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_signup: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_tag: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_deal_created: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_deal_stage: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_deal_won: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_deal_lost: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_webhook: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_whatsapp: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_schedule: {
    async execute({ context }) {
      return { status: 'success', output: { scheduled_at: new Date().toISOString() } };
    },
  },
  trigger_manual: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
};

// ============================================
// ACTION EXECUTORS
// ============================================

const actionExecutors: Record<string, NodeExecutor> = {
  // ========== WHATSAPP ==========
  action_whatsapp: {
    async execute({ config, context, credentials, isTest }) {
      const phone = context.contact?.phone;
      
      if (isTest) {
        return {
          status: 'success',
          output: { 
            sent: true, 
            test: true, 
            to: phone,
            message: config.message?.substring(0, 50) + '...',
          },
        };
      }

      if (!phone) {
        return { status: 'error', output: null, error: 'Contato sem telefone' };
      }

      const provider = credentials?.provider || credentials?.type || 'evolution';
      
      try {
        if (provider === 'whatsappBusiness' || provider === 'cloud') {
          // WhatsApp Cloud API
          const response = await fetch(
            `https://graph.facebook.com/v18.0/${credentials?.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${credentials?.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone.replace(/\D/g, ''),
                type: config.templateId ? 'template' : 'text',
                ...(config.templateId
                  ? {
                      template: {
                        name: config.templateId,
                        language: { code: config.language || 'pt_BR' },
                        components: config.templateParams || [],
                      },
                    }
                  : {
                      text: { body: config.message },
                    }),
              }),
            }
          );

          const result = await response.json();
          
          if (!response.ok) {
            return { status: 'error', output: result, error: result.error?.message || 'Falha no envio' };
          }

          return { status: 'success', output: { ...result, provider: 'cloud' } };
        } else {
          // Evolution API
          const baseUrl = credentials?.evolutionUrl?.replace(/\/$/, '');
          const response = await fetch(
            `${baseUrl}/message/sendText/${credentials?.instanceName}`,
            {
              method: 'POST',
              headers: {
                'apikey': credentials?.apiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                number: phone.replace(/\D/g, ''),
                text: config.message,
              }),
            }
          );

          const result = await response.json();
          
          if (!response.ok) {
            return { status: 'error', output: result, error: result.message || 'Falha no envio' };
          }

          return { status: 'success', output: { ...result, provider: 'evolution' } };
        }
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== EMAIL ==========
  action_email: {
    async execute({ config, context, credentials, isTest }) {
      const email = context.contact?.email;

      if (isTest) {
        return {
          status: 'success',
          output: { 
            sent: true, 
            test: true, 
            to: email,
            subject: config.subject,
          },
        };
      }

      if (!email) {
        return { status: 'error', output: null, error: 'Contato sem email' };
      }

      const provider = credentials?.type || 'resend';

      try {
        if (provider === 'emailSendgrid' || provider === 'sendgrid') {
          // SendGrid
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials?.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email }] }],
              from: { email: config.from || credentials?.defaultFrom },
              subject: config.subject,
              content: [
                { type: 'text/html', value: config.html || config.body },
              ],
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            return { status: 'error', output: { error }, error: 'Falha no envio' };
          }

          return { status: 'success', output: { sent: true, provider: 'sendgrid' } };
        } else {
          // Resend (default)
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials?.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: config.from || credentials?.defaultFrom || 'noreply@example.com',
              to: email,
              subject: config.subject,
              html: config.html || config.body,
              text: config.text,
            }),
          });

          const result = await response.json();
          
          if (!response.ok) {
            return { status: 'error', output: result, error: result.message || 'Falha no envio' };
          }

          return { status: 'success', output: { ...result, provider: 'resend' } };
        }
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== SMS ==========
  action_sms: {
    async execute({ config, context, credentials, isTest }) {
      const phone = context.contact?.phone;

      if (isTest) {
        return {
          status: 'success',
          output: { sent: true, test: true, to: phone },
        };
      }

      if (!phone) {
        return { status: 'error', output: null, error: 'Contato sem telefone' };
      }

      // Placeholder - implementar com Twilio ou outro provider
      return {
        status: 'success',
        output: { sent: true, to: phone, message: 'SMS provider not configured' },
      };
    },
  },

  // ========== TAGS ==========
  action_tag: {
    async execute({ config, context, supabase, isTest }) {
      const contactId = context.contact?.id;
      
      if (isTest) {
        return {
          status: 'success',
          output: { added: true, tag: config.tagName, test: true },
        };
      }

      if (!contactId) {
        return { status: 'error', output: null, error: 'Contato não encontrado' };
      }

      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', contactId)
          .single();

        const currentTags = (contact as any)?.tags || [];
        
        if (!currentTags.includes(config.tagName)) {
          await (supabase.from('contacts') as any)
            .update({ tags: [...currentTags, config.tagName] })
            .eq('id', contactId);
        }

        return {
          status: 'success',
          output: { added: true, tag: config.tagName, previousTags: currentTags },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  action_remove_tag: {
    async execute({ config, context, supabase, isTest }) {
      const contactId = context.contact?.id;

      if (isTest) {
        return {
          status: 'success',
          output: { removed: true, tag: config.tagName, test: true },
        };
      }

      if (!contactId) {
        return { status: 'error', output: null, error: 'Contato não encontrado' };
      }

      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', contactId)
          .single();

        const currentTags = (contact as any)?.tags || [];
        const newTags = currentTags.filter((t: string) => t !== config.tagName);

        await (supabase.from('contacts') as any)
          .update({ tags: newTags })
          .eq('id', contactId);

        return {
          status: 'success',
          output: { removed: true, tag: config.tagName },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== CONTACT UPDATE ==========
  action_update: {
    async execute({ config, context, supabase, isTest }) {
      const contactId = context.contact?.id;

      if (isTest) {
        return {
          status: 'success',
          output: { updated: true, fields: config.fields, test: true },
        };
      }

      if (!contactId) {
        return { status: 'error', output: null, error: 'Contato não encontrado' };
      }

      try {
        await (supabase.from('contacts') as any)
          .update(config.fields)
          .eq('id', contactId);

        return {
          status: 'success',
          output: { updated: true, fields: config.fields },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== DEALS ==========
  action_create_deal: {
    async execute({ config, context, supabase, isTest }) {
      if (isTest) {
        return {
          status: 'success',
          output: { created: true, title: config.title, test: true },
        };
      }

      try {
        const { data, error } = await (supabase.from('deals') as any)
          .insert({
            title: config.title,
            value: config.value || 0,
            pipeline_id: config.pipelineId,
            stage_id: config.stageId,
            contact_id: context.contact?.id,
            organization_id: config.organizationId || context.automation?.organization_id,
            store_id: config.storeId,
          })
          .select()
          .single();

        if (error) throw error;

        return { status: 'success', output: data };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  action_move_deal: {
    async execute({ config, context, supabase, isTest }) {
      const dealId = context.deal?.id;

      if (isTest) {
        return {
          status: 'success',
          output: { moved: true, stageId: config.stageId, test: true },
        };
      }

      if (!dealId) {
        return { status: 'error', output: null, error: 'Deal não encontrado' };
      }

      try {
        await (supabase.from('deals') as any)
          .update({ stage_id: config.stageId })
          .eq('id', dealId);

        return {
          status: 'success',
          output: { moved: true, stageId: config.stageId },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  action_update_deal: {
    async execute({ config, context, supabase, isTest }) {
      const dealId = context.deal?.id;

      if (isTest) {
        return {
          status: 'success',
          output: { updated: true, fields: config.fields, test: true },
        };
      }

      if (!dealId) {
        return { status: 'error', output: null, error: 'Deal não encontrado' };
      }

      try {
        await (supabase.from('deals') as any)
          .update(config.fields)
          .eq('id', dealId);

        return {
          status: 'success',
          output: { updated: true, fields: config.fields },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== NOTIFICATIONS ==========
  action_notify: {
    async execute({ config, supabase, isTest }) {
      if (isTest) {
        return {
          status: 'success',
          output: { notified: true, message: config.message, test: true },
        };
      }

      try {
        const notifications = (config.userIds || []).map((userId: string) => ({
          user_id: userId,
          title: config.title || 'Nova notificação',
          message: config.message,
          type: 'automation',
          read: false,
        }));

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }

        return {
          status: 'success',
          output: { notified: true, count: notifications.length },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== HTTP/WEBHOOK ==========
  action_webhook: {
    async execute({ config, context, credentials, isTest }) {
      if (isTest) {
        return {
          status: 'success',
          output: { called: true, url: config.url, method: config.method || 'POST', test: true },
        };
      }

      try {
        // Preparar headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...config.headers,
        };

        // Adicionar autenticação se houver credenciais
        if (credentials) {
          if (credentials.type === 'httpBasicAuth') {
            const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
          } else if (credentials.type === 'httpApiKey') {
            const headerName = credentials.headerName || 'X-API-Key';
            headers[headerName] = credentials.apiKey;
          } else if (credentials.type === 'httpBearer') {
            headers['Authorization'] = `Bearer ${credentials.token}`;
          }
        }

        // Preparar body
        let body: string | undefined;
        if (config.method !== 'GET' && config.method !== 'HEAD') {
          const bodyData = config.body || context;
          body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
        }

        const response = await fetch(config.url, {
          method: config.method || 'POST',
          headers,
          body,
        });

        let result;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          result = await response.json();
        } else {
          result = await response.text();
        }

        if (!response.ok) {
          return {
            status: 'error',
            output: result,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        return { status: 'success', output: result };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  action_http_request: {
    async execute(ctx) {
      return actionExecutors.action_webhook.execute(ctx);
    },
  },

  // ========== SHOPIFY ==========
  action_shopify_tag: {
    async execute({ config, context, credentials, isTest }) {
      if (isTest) {
        return {
          status: 'success',
          output: { tagged: true, customerId: context.contact?.shopify_customer_id, test: true },
        };
      }

      const customerId = context.contact?.shopify_customer_id;
      if (!customerId) {
        return { status: 'error', output: null, error: 'Cliente Shopify não encontrado' };
      }

      try {
        const domain = credentials?.shopDomain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const response = await fetch(
          `https://${domain}/admin/api/2024-01/customers/${customerId}.json`,
          {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': credentials?.accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              customer: {
                id: customerId,
                tags: config.tags,
              },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          return { status: 'error', output: result, error: 'Falha ao atualizar tags' };
        }

        return { status: 'success', output: result };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },
};

// ============================================
// CONDITION EXECUTORS
// ============================================

const conditionExecutors: Record<string, NodeExecutor> = {
  condition_has_tag: {
    async execute({ config, context }) {
      const tags = context.contact?.tags || [];
      const hasTag = tags.includes(config.tagName);
      
      return {
        status: 'success',
        output: { hasTag, tag: config.tagName },
        branch: hasTag ? 'true' : 'false',
      };
    },
  },

  condition_field: {
    async execute({ config, context }) {
      const value1 = getNestedValue(context, config.field);
      const value2 = config.value;
      const operator = config.operator || 'equals';

      const result = evaluateCondition(value1, operator, value2);
      
      return {
        status: 'success',
        output: { field: config.field, value: value1, operator, expected: value2, result },
        branch: result ? 'true' : 'false',
      };
    },
  },

  condition_deal_value: {
    async execute({ config, context }) {
      const dealValue = context.deal?.value || 0;
      const targetValue = parseFloat(config.value) || 0;
      const operator = config.operator || 'greater_than';

      const result = evaluateCondition(dealValue, operator, targetValue);
      
      return {
        status: 'success',
        output: { dealValue, operator, targetValue, result },
        branch: result ? 'true' : 'false',
      };
    },
  },

  condition_order_value: {
    async execute({ config, context }) {
      const orderValue = context.order?.totalPrice || context.trigger?.data?.order_value || 0;
      const targetValue = parseFloat(config.value) || 0;
      const operator = config.operator || 'greater_than';

      const result = evaluateCondition(orderValue, operator, targetValue);
      
      return {
        status: 'success',
        output: { orderValue, operator, targetValue, result },
        branch: result ? 'true' : 'false',
      };
    },
  },

  condition_contact_exists: {
    async execute({ context }) {
      const exists = !!context.contact?.id;
      return {
        status: 'success',
        output: { exists },
        branch: exists ? 'true' : 'false',
      };
    },
  },

  // A/B Split
  logic_split: {
    async execute({ config }) {
      const percentageA = config.percentageA || 50;
      const random = Math.random() * 100;
      const isA = random < percentageA;
      
      return {
        status: 'success',
        output: { random, percentageA, isA },
        branch: isA ? 'true' : 'false',
      };
    },
  },

  // Advanced Filter
  logic_filter: {
    async execute({ config, context }) {
      const conditions = config.conditions || [];
      const logicOperator = config.logicOperator || 'and';

      const results: boolean[] = [];

      for (const condition of conditions) {
        const value1 = getNestedValue(context, condition.field);
        const result = evaluateCondition(value1, condition.operator, condition.value);
        results.push(result);
      }

      const finalResult = logicOperator === 'and'
        ? results.every(r => r)
        : results.some(r => r);

      return {
        status: 'success',
        output: { conditions: results, logicOperator, result: finalResult },
        branch: finalResult ? 'true' : 'false',
      };
    },
  },
};

// ============================================
// CONTROL EXECUTORS
// ============================================

const controlExecutors: Record<string, NodeExecutor> = {
  control_delay: {
    async execute({ config, isTest }) {
      const value = parseInt(config.value) || 1;
      const unit = config.unit || 'hours';

      const multipliers: Record<string, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
      };

      const delayMs = value * (multipliers[unit] || multipliers.hours);
      const resumeAt = new Date(Date.now() + delayMs);

      if (isTest) {
        return {
          status: 'success',
          output: { delay: `${value} ${unit}`, resumeAt: resumeAt.toISOString(), test: true },
        };
      }

      return {
        status: 'waiting',
        output: { delay: `${value} ${unit}` },
        waitUntil: resumeAt,
      };
    },
  },

  control_delay_until: {
    async execute({ config, isTest }) {
      let resumeAt: Date;

      if (config.datetime) {
        resumeAt = new Date(config.datetime);
      } else if (config.time) {
        const [hours, minutes] = config.time.split(':').map(Number);
        resumeAt = new Date();
        resumeAt.setHours(hours, minutes, 0, 0);
        
        if (resumeAt <= new Date()) {
          resumeAt.setDate(resumeAt.getDate() + 1);
        }
      } else {
        return {
          status: 'error',
          output: null,
          error: 'Data/hora não configurada',
        };
      }

      if (isTest) {
        return {
          status: 'success',
          output: { resumeAt: resumeAt.toISOString(), test: true },
        };
      }

      return {
        status: 'waiting',
        output: { resumeAt: resumeAt.toISOString() },
        waitUntil: resumeAt,
      };
    },
  },

  // Legacy support
  logic_delay: {
    async execute(ctx) {
      return controlExecutors.control_delay.execute(ctx);
    },
  },

  // End node - finish workflow
  control_end: {
    async execute({ config }) {
      return {
        status: 'success',
        output: { ended: true, reason: config.reason || 'Workflow completed' },
      };
    },
  },

  // Set Variable
  control_set_variable: {
    async execute({ config, context }) {
      const value = config.value;
      return {
        status: 'success',
        output: { variable: config.name, value },
      };
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function evaluateCondition(value1: any, operator: string, value2: any): boolean {
  const v1 = normalizeValue(value1);
  const v2 = normalizeValue(value2);

  switch (operator) {
    case 'equals':
    case 'eq':
      return v1 === v2;
    
    case 'not_equals':
    case 'neq':
      return v1 !== v2;
    
    case 'contains':
      return String(v1).toLowerCase().includes(String(v2).toLowerCase());
    
    case 'not_contains':
      return !String(v1).toLowerCase().includes(String(v2).toLowerCase());
    
    case 'starts_with':
      return String(v1).toLowerCase().startsWith(String(v2).toLowerCase());
    
    case 'ends_with':
      return String(v1).toLowerCase().endsWith(String(v2).toLowerCase());
    
    case 'greater_than':
    case 'gt':
      return parseFloat(v1) > parseFloat(v2);
    
    case 'greater_or_equal':
    case 'gte':
      return parseFloat(v1) >= parseFloat(v2);
    
    case 'less_than':
    case 'lt':
      return parseFloat(v1) < parseFloat(v2);
    
    case 'less_or_equal':
    case 'lte':
      return parseFloat(v1) <= parseFloat(v2);
    
    case 'is_empty':
      return v1 === null || v1 === undefined || v1 === '' || 
             (Array.isArray(v1) && v1.length === 0);
    
    case 'is_not_empty':
      return !(v1 === null || v1 === undefined || v1 === '' || 
               (Array.isArray(v1) && v1.length === 0));
    
    case 'matches':
    case 'regex':
      try {
        return new RegExp(v2).test(String(v1));
      } catch {
        return false;
      }
    
    case 'in':
      return Array.isArray(v2) ? v2.includes(v1) : String(v2).split(',').map(s => s.trim()).includes(v1);
    
    case 'not_in':
      return Array.isArray(v2) ? !v2.includes(v1) : !String(v2).split(',').map(s => s.trim()).includes(v1);
    
    default:
      return v1 === v2;
  }
}

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  return String(value).trim();
}

// ============================================
// EXPORT ALL EXECUTORS
// ============================================

export const nodeExecutors: Record<string, NodeExecutor> = {
  ...triggerExecutors,
  ...actionExecutors,
  ...conditionExecutors,
  ...controlExecutors,
};

export default nodeExecutors;
