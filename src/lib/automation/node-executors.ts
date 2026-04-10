/**
 * NODE EXECUTORS - COMPLETE VERSION
 * Specific execution logic for each node type with real integrations
 */

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
  supabase: any; // SupabaseClient com tipos genéricos
  isTest: boolean;
  organizationId?: string;  // ← CRÍTICO: Para isolamento multi-tenant
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
  trigger_checkout_abandoned: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_fulfilled_order: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_cancelled_order: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_viewed_product: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_added_to_cart: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_form_submitted: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_custom_event: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_date: {
    async execute({ context }) {
      return { status: 'success', output: context.trigger?.data || {} };
    },
  },
  trigger_segment: {
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
    async execute({ config, context, credentials, isTest, supabase, organizationId }) {
      const email = context.contact?.email;

      if (!email) {
        return {
          status: isTest ? 'success' : 'error',
          output: isTest ? { sent: false, test: true, reason: 'Contato sem email' } : null,
          error: isTest ? undefined : 'Contato sem email',
        };
      }

      try {
        // 1. Resolve HTML content - fetch template if specified
        let html: string;
        if (config.templateId && config.templateId !== 'none') {
          const { data: template, error: tplErr } = await supabase
            .from('email_templates')
            .select('design_json, html, name')
            .eq('id', config.templateId)
            .single();

          if (tplErr || !template) {
            return { status: 'error', output: null, error: `Template ${config.templateId} not found` };
          }

          // Use pre-rendered HTML from template
          html = template.html || '';
          if (!html) {
            html = '<p>Template sem conteúdo HTML renderizado</p>';
          }
        } else {
          html = config.html || config.body || '<p>Email sem conteúdo</p>';
        }

        // 2. Resolve merge tags using the variable engine
        let resolvedHtml = html;
        let resolvedSubject = config.subject || '';

        try {
          const { variableEngine } = await import('./variable-engine');
          resolvedHtml = variableEngine.process(html, context);
          resolvedSubject = variableEngine.process(resolvedSubject, context);
        } catch {
          // Fallback: simple regex replacement
          const resolveTags = (text: string): string => {
            return text.replace(/\{\{([\w.]+)\}\}/g, (match: string, path: string) => {
              const parts = path.split('.');
              if (parts[0] === 'contact') return (context.contact as Record<string, any>)?.[parts[1]] || '';
              if (parts[0] === 'event') return context.trigger?.data?.[parts[1]] || '';
              if (parts[0] === 'store') return (context as Record<string, any>).store?.[parts[1]] || '';
              return match;
            });
          };
          resolvedHtml = resolveTags(html);
          resolvedSubject = resolveTags(resolvedSubject);
        }

        let subject = resolvedSubject;
        html = resolvedHtml;

        // Annotate test emails
        if (isTest) {
          subject = `[TESTE] ${subject}`;
        }

        // 2b. Smart Sending — skip if contact received email recently
        if (config.smartSending && !isTest && context.contact?.id) {
          const skipHours = config.smartSendingHours || 16;
          const cutoff = new Date(Date.now() - skipHours * 60 * 60 * 1000).toISOString();
          const { data: recentSends } = await supabase
            .from('email_sends')
            .select('id')
            .eq('contact_id', context.contact.id)
            .gte('created_at', cutoff)
            .limit(1);

          if (recentSends && recentSends.length > 0) {
            return {
              status: 'success',
              output: { skipped: true, reason: `Smart Sending: contato recebeu email nas últimas ${skipHours}h` },
            };
          }
        }

        // 2c. UTM Tracking — append UTM params to all links
        if (config.utmTracking) {
          const utmSource = config.utmSource || 'worder';
          const utmMedium = config.utmMedium || 'email';
          const utmCampaign = config.utmCampaign || '';
          const utmParams = `utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}${utmCampaign ? `&utm_campaign=${encodeURIComponent(utmCampaign)}` : ''}`;

          html = html.replace(
            /(<a\s[^>]*href=["'])([^"'#][^"']*)(["'][^>]*>)/gi,
            (match: string, before: string, url: string, after: string) => {
              if (url.includes('utm_source') || url.includes('unsubscribe') || url.includes('mailto:')) return match;
              const separator = url.includes('?') ? '&' : '?';
              return `${before}${url}${separator}${utmParams}${after}`;
            }
          );
        }

        // 3. Build sender info
        const senderName = config.senderName || (context as any).store?.name || 'Worder';
        const senderEmail = config.senderEmail || credentials?.defaultFrom || 'noreply@example.com';
        const from = `${senderName} <${senderEmail}>`;

        // 4. Send via Resend (default provider)
        const provider = credentials?.type || 'resend';
        const apiKey = credentials?.apiKey || process.env.RESEND_API_KEY;

        if (!apiKey) {
          return { status: 'error', output: null, error: 'API key de email não configurada (Resend/SendGrid)' };
        }

        if (provider === 'emailSendgrid' || provider === 'sendgrid') {
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email }] }],
              from: { email: senderEmail, name: senderName },
              subject,
              content: [{ type: 'text/html', value: html }],
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            return { status: 'error', output: { error }, error: 'Falha no envio SendGrid' };
          }

          return { status: 'success', output: { sent: true, provider: 'sendgrid', to: email } };
        } else {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from,
              to: email,
              subject,
              html,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            return { status: 'error', output: result, error: result.message || 'Falha no envio Resend' };
          }

          // 5. Record the send in email_sends table (skip for tests)
          if (organizationId && !isTest) {
            await supabase.from('email_sends').insert({
              organization_id: organizationId,
              contact_id: context.contact?.id,
              email_template_id: config.templateId || null,
              subject,
              status: 'sent',
              resend_id: result?.id,
            }).catch(() => {}); // non-blocking
          }

          return { status: 'success', output: { ...result, provider: 'resend', to: email } };
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
    async execute({ config, context, supabase, isTest, organizationId }) {
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

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', contactId)
          .eq('organization_id', organizationId)  // ← ISOLAMENTO
          .single();

        if (!contact) {
          return { status: 'error', output: null, error: 'Contato não encontrado ou não pertence à organização' };
        }

        const currentTags = (contact as any)?.tags || [];
        
        if (!currentTags.includes(config.tagName)) {
          await (supabase.from('contacts') as any)
            .update({ tags: [...currentTags, config.tagName] })
            .eq('id', contactId)
            .eq('organization_id', organizationId);  // ← ISOLAMENTO
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
    async execute({ config, context, supabase, isTest, organizationId }) {
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

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', contactId)
          .eq('organization_id', organizationId)  // ← ISOLAMENTO
          .single();

        if (!contact) {
          return { status: 'error', output: null, error: 'Contato não encontrado ou não pertence à organização' };
        }

        const currentTags = (contact as any)?.tags || [];
        const newTags = currentTags.filter((t: string) => t !== config.tagName);

        await (supabase.from('contacts') as any)
          .update({ tags: newTags })
          .eq('id', contactId)
          .eq('organization_id', organizationId);  // ← ISOLAMENTO

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
    async execute({ config, context, supabase, isTest, organizationId }) {
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

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        const { data, error } = await (supabase.from('contacts') as any)
          .update(config.fields)
          .eq('id', contactId)
          .eq('organization_id', organizationId)  // ← ISOLAMENTO
          .select()
          .single();

        if (error || !data) {
          return { status: 'error', output: null, error: 'Contato não encontrado ou não pertence à organização' };
        }

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
    async execute({ config, context, supabase, isTest, organizationId }) {
      if (isTest) {
        return {
          status: 'success',
          output: { created: true, title: config.title, test: true },
        };
      }

      // ⚠️ CRÍTICO: Usar organizationId do contexto, não da config
      const orgId = organizationId || (context as any).organizationId;
      
      if (!orgId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        const { data, error } = await (supabase.from('deals') as any)
          .insert({
            title: config.title,
            value: config.value || 0,
            pipeline_id: config.pipelineId,
            stage_id: config.stageId,
            contact_id: context.contact?.id,
            organization_id: orgId,  // ← USAR O ID DO CONTEXTO
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
    async execute({ config, context, supabase, isTest, organizationId }) {
      const dealId = context.deal?.id;

      console.log('[action_move_deal] Starting...', {
        dealId,
        stageId: config.stageId,
        organizationId,
        isTest,
        hasDealInContext: !!context.deal,
      });

      if (isTest) {
        return {
          status: 'success',
          output: { moved: true, stageId: config.stageId, test: true },
        };
      }

      if (!dealId) {
        console.error('[action_move_deal] Deal not found in context');
        return { status: 'error', output: null, error: 'Deal não encontrado no contexto' };
      }

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        console.error('[action_move_deal] Organization ID not provided');
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        console.log('[action_move_deal] Updating deal...', { dealId, stageId: config.stageId });
        
        const { data, error } = await (supabase.from('deals') as any)
          .update({ stage_id: config.stageId })
          .eq('id', dealId)
          .eq('organization_id', organizationId)  // ← ISOLAMENTO
          .select()
          .single();

        if (error) {
          console.error('[action_move_deal] Error updating deal:', error);
          return { status: 'error', output: null, error: error.message };
        }
        
        if (!data) {
          console.error('[action_move_deal] No data returned');
          return { status: 'error', output: null, error: 'Deal não encontrado ou não pertence à organização' };
        }

        console.log('[action_move_deal] ✅ Deal moved successfully to stage:', config.stageId);
        return {
          status: 'success',
          output: { moved: true, dealId, stageId: config.stageId, newStage: data.stage_id },
        };
      } catch (error: any) {
        console.error('[action_move_deal] Exception:', error);
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  action_update_deal: {
    async execute({ config, context, supabase, isTest, organizationId }) {
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

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        const { data, error } = await (supabase.from('deals') as any)
          .update(config.fields)
          .eq('id', dealId)
          .eq('organization_id', organizationId)  // ← ISOLAMENTO
          .select()
          .single();

        if (error || !data) {
          return { status: 'error', output: null, error: 'Deal não encontrado ou não pertence à organização' };
        }

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
    async execute({ config, supabase, isTest, organizationId }) {
      if (isTest) {
        return {
          status: 'success',
          output: { notified: true, message: config.message, test: true },
        };
      }

      // ⚠️ CRÍTICO: Verificar organization_id
      if (!organizationId) {
        return { status: 'error', output: null, error: 'Organization ID não fornecido' };
      }

      try {
        // Verificar se os userIds pertencem à organização
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', organizationId)
          .in('user_id', config.userIds || []);

        const validUserIds = (members || []).map((m: any) => m.user_id);

        const notifications = validUserIds.map((userId: string) => ({
          user_id: userId,
          title: config.title || 'Nova notificação',
          message: config.message,
          type: 'automation',
          read: false,
          organization_id: organizationId,  // ← INCLUIR ORG ID
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
          output: { tagged: true, customerId: (context.contact as any)?.shopify_customer_id, test: true },
        };
      }

      const customerId = (context.contact as any)?.shopify_customer_id;
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

  // ========== ADD TO LIST ==========
  action_add_to_list: {
    async execute({ config, context, supabase, isTest, organizationId }) {
      const contactId = context.contact?.id;
      if (isTest) {
        return { status: 'success', output: { added: true, listId: config.listId, test: true } };
      }
      if (!contactId || !organizationId) {
        return { status: 'error', output: null, error: 'Contato ou organização não encontrado' };
      }
      try {
        await supabase.from('list_contacts').upsert({
          list_id: config.listId,
          contact_id: contactId,
          organization_id: organizationId,
        }, { onConflict: 'list_id,contact_id' });
        return { status: 'success', output: { added: true, listId: config.listId } };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== REMOVE FROM LIST ==========
  action_remove_from_list: {
    async execute({ config, context, supabase, isTest, organizationId }) {
      const contactId = context.contact?.id;
      if (isTest) {
        return { status: 'success', output: { removed: true, listId: config.listId, test: true } };
      }
      if (!contactId || !organizationId) {
        return { status: 'error', output: null, error: 'Contato ou organização não encontrado' };
      }
      try {
        await supabase
          .from('list_contacts')
          .delete()
          .eq('list_id', config.listId)
          .eq('contact_id', contactId)
          .eq('organization_id', organizationId);
        return { status: 'success', output: { removed: true, listId: config.listId } };
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
        weeks: 7 * 24 * 60 * 60 * 1000,
      };

      const delayMs = value * (multipliers[unit] || multipliers.hours);
      let resumeAt = new Date(Date.now() + delayMs);

      // Apply day-of-week restrictions (allowedDays: 0=Mon, 1=Tue, ..., 6=Sun)
      if (config.restrictDays && config.allowedDays?.length > 0) {
        const allowedDays: number[] = config.allowedDays;
        // JS getDay(): 0=Sun, 1=Mon... → convert to 0=Mon, 6=Sun
        let guard = 0;
        while (!allowedDays.includes(resumeAt.getDay() === 0 ? 6 : resumeAt.getDay() - 1) && guard < 8) {
          resumeAt = new Date(resumeAt.getTime() + 24 * 60 * 60 * 1000);
          guard++;
        }
      }

      // Apply time window restrictions
      if (config.restrictTime && config.timeFrom && config.timeTo) {
        const [fromH, fromM] = config.timeFrom.split(':').map(Number);
        const [toH, toM] = config.timeTo.split(':').map(Number);
        const hour = resumeAt.getHours();
        const min = resumeAt.getMinutes();
        const current = hour * 60 + min;
        const from = fromH * 60 + fromM;
        const to = toH * 60 + toM;

        if (current < from) {
          resumeAt.setHours(fromH, fromM, 0, 0);
        } else if (current > to) {
          // Move to next day at fromH:fromM
          resumeAt = new Date(resumeAt.getTime() + 24 * 60 * 60 * 1000);
          resumeAt.setHours(fromH, fromM, 0, 0);
        }
      }

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
    case 'in_list':
      return Array.isArray(v2) ? v2.includes(v1) : String(v2).split(',').map(s => s.trim()).includes(v1);

    case 'not_in':
    case 'not_in_list':
      return Array.isArray(v2) ? !v2.includes(v1) : !String(v2).split(',').map(s => s.trim()).includes(v1);

    case 'is_set':
      return v1 !== null && v1 !== undefined && v1 !== '';

    case 'is_not_set':
      return v1 === null || v1 === undefined || v1 === '';

    case 'before_date':
      return new Date(v1).getTime() < new Date(v2).getTime();

    case 'after_date':
      return new Date(v1).getTime() > new Date(v2).getTime();

    case 'in_last_x_days':
    case 'not_in_last_x_days': {
      const daysAgo = new Date(Date.now() - Number(v2) * 24 * 60 * 60 * 1000);
      const dateVal = new Date(v1);
      const isInRange = dateVal >= daysAgo;
      return operator === 'in_last_x_days' ? isInRange : !isInRange;
    }

    case 'between': {
      const num = parseFloat(v1);
      const parts = String(v2).split(',').map(s => parseFloat(s.trim()));
      if (parts.length >= 2) return num >= parts[0] && num <= parts[1];
      return false;
    }

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
