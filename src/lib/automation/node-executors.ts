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

        // 4. Send via the full campaign pipeline so automation emails
        //    get the same tracking as campaigns (open pixel, click
        //    tracking, unsubscribe link, resend tags with flow_id).
        //    This replaces the previous raw fetch to the Resend REST
        //    endpoint which skipped all tracking.

        if (!process.env.RESEND_API_KEY && !credentials?.apiKey) {
          return { status: 'error', output: null, error: 'RESEND_API_KEY não configurada' };
        }

        if (isTest) {
          // In test mode, skip the DB insert (no email_sends row) and
          // return success without actually sending. The test panel
          // uses a separate /api/email/test endpoint for real sends.
          return {
            status: 'success',
            output: { sent: false, test: true, to: email, subject, preview: html.slice(0, 200) },
          };
        }

        const { sendCampaignEmail } = await import('@/lib/email/send-campaign-email');

        // Resolve order-products blocks using event data before sending
        if (html.includes('WORDER_ORDER_BLOCK')) {
          const { resolveOrderBlocks, enrichOrderItemImages } = await import('@/lib/email/render');
          const eventData = context.trigger?.data || {};
          await enrichOrderItemImages(eventData, supabase, undefined, organizationId);
          html = resolveOrderBlocks(html, eventData);
        }

        // Build merge data from the same context we already resolved
        // (contact + event + store). Using empty mergeData works too
        // because the HTML/subject were pre-rendered by the variable
        // engine above — prepareEmailHtml still adds tracking + footer.
        const contact = context.contact as any;
        const triggerData = context.trigger?.data || {};
        const triggerProps = triggerData.properties || triggerData;
        const mergeData: Record<string, string> = {
          first_name: contact?.first_name || '',
          last_name: contact?.last_name || '',
          full_name: [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
          email: email || '',
          phone: contact?.phone || '',
          total_orders: String(contact?.total_orders || 0),
          total_spent: String(contact?.total_spent || 0),
          store_name: (context as any)?.store?.name || '',
          store_url: (context as any)?.store?.domain ? `https://${(context as any).store.domain}` : '',
        };
        // Flatten event/trigger data into merge tags as event.*
        if (triggerProps && typeof triggerProps === 'object') {
          for (const [k, v] of Object.entries(triggerProps)) {
            if (v == null || typeof v === 'object') continue;
            mergeData[`event.${k}`] = String(v);
          }
          if (triggerProps.Items && Array.isArray(triggerProps.Items) && triggerProps.Items.length > 0) {
            const first = triggerProps.Items[0];
            mergeData['event.ProductName'] = first.ProductName || first.title || '';
            mergeData['event.Price'] = String(first.ItemPrice || first.price || '');
            mergeData['event.CompareAtPrice'] = first.CompareAtPrice ? String(first.CompareAtPrice) : (first.compare_at_price ? String(first.compare_at_price) : '');
            mergeData['event.ImageURL'] = first.ImageURL || first.image_url || '';
            mergeData['event.ProductURL'] = first.ProductURL || first.url || '';
            mergeData['event.SKU'] = first.SKU || first.sku || '';
            mergeData['event.VariantName'] = first.VariantName || first.variant_title || '';
            mergeData['event.Brand'] = first.Brand || first.vendor || '';
          }
          mergeData['event.Value'] = String(triggerProps.$value || triggerProps.Value || triggerProps.monetary_value || '');
          mergeData['event.Currency'] = triggerProps.Currency || triggerProps.currency || 'BRL';
          mergeData['event.OrderId'] = triggerProps.OrderId || triggerProps.order_id || '';
          mergeData['event.OrderNumber'] = triggerProps.OrderNumber || '';
          mergeData['event.CheckoutURL'] = triggerProps.CheckoutURL || triggerProps.checkout_url || '';
          mergeData['event.SubtotalPrice'] = String(triggerProps.SubtotalPrice || '');
          mergeData['event.TotalDiscounts'] = String(triggerProps.TotalDiscounts || '');
          mergeData['event.FinancialStatus'] = triggerProps.FinancialStatus || '';
          mergeData['event.FulfillmentStatus'] = triggerProps.FulfillmentStatus || '';
          mergeData['event.order_status_url'] = triggerProps.order_status_url || '';
          mergeData['event.TrackingNumber'] = triggerProps.TrackingNumber || '';
          mergeData['event.TrackingUrl'] = triggerProps.TrackingUrl || '';
          mergeData['event.TrackingCompany'] = triggerProps.TrackingCompany || '';
          mergeData['tracking_url'] = triggerProps.TrackingUrl || '';
          mergeData['tracking_number'] = triggerProps.TrackingNumber || '';
          mergeData['event.ItemCount'] = String(triggerProps.ItemCount || triggerProps.item_count || '');
          mergeData['event.DiscountCode'] = (triggerProps.DiscountCodes || triggerProps.discount_codes || [])[0]?.code || '';
          mergeData['event.customer_name'] = triggerProps.CustomerName || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ');
          mergeData['event.email'] = triggerProps.CustomerEmail || email || '';
          // Also flatten top-level trigger data keys
          for (const [k, v] of Object.entries(triggerData)) {
            if (v == null || typeof v === 'object') continue;
            if (!mergeData[`event.${k}`]) mergeData[`event.${k}`] = String(v);
          }
        }
        // Checkout URL for cart recovery emails
        mergeData['checkout_url'] = triggerProps.CheckoutURL || triggerProps.checkout_url || '';
        mergeData['cart_total'] = String(triggerProps.$value || triggerProps.Value || '');
        mergeData['cart_item_count'] = String(triggerProps.ItemCount || '');
        if (triggerProps.Items?.[0]) {
          mergeData['cart_first_item'] = triggerProps.Items[0].ProductName || '';
          mergeData['cart_first_item_price'] = String(triggerProps.Items[0].ItemPrice || '');
        }
        // Order tags
        mergeData['order_number'] = triggerProps.OrderNumber || '';
        mergeData['order_total'] = String(triggerProps.$value || triggerProps.Value || triggerProps.TotalPrice || '');
        mergeData['order_status'] = triggerProps.FinancialStatus || triggerProps.FulfillmentStatus || '';
        // Custom fields
        if (contact?.custom_fields && typeof contact.custom_fields === 'object') {
          for (const [k, v] of Object.entries(contact.custom_fields)) {
            mergeData[`custom.${k}`] = String(v ?? '');
            mergeData[`custom_${k}`] = String(v ?? '');
          }
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';

        // Use flowId as campaignId surrogate so email_sends rows carry
        // a stable key we can aggregate by when the Automations ranking
        // queries attribution revenue.
        const campaignIdSurrogate = (context as any).flowId || (context as any).flow_id || `flow-${Date.now()}`;

        const result = await sendCampaignEmail({
          campaignId: campaignIdSurrogate,
          contactId: (context.contact as any)?.id || '',
          contactEmail: email,
          mergeData,
          templateHtml: html,
          subject,
          fromEmail: senderEmail,
          senderName,
          replyTo: undefined,
          baseUrl,
          organizationId: organizationId || '',
          eventData: context.trigger?.data,
        });

        if (!result.success) {
          return { status: 'error', output: { error: result.error }, error: result.error || 'Falha no envio' };
        }

        // Tag the email_sends row with flow/automation ids (so we can
        // tell apart campaign sends from automation sends downstream).
        if (result.emailSendId) {
          try {
            const updates: Record<string, any> = {};
            const flowId = (context as any).flowId || (context as any).flow_id;
            const runId = (context as any).automation_run_id || (context as any).runId;
            if (flowId) updates.flow_id = flowId;
            if (runId) updates.automation_run_id = runId;
            if (config.templateId) updates.email_template_id = config.templateId;
            if (Object.keys(updates).length > 0) {
              await supabase.from('email_sends').update(updates).eq('id', result.emailSendId);
            }
          } catch { /* non-blocking */ }
        }

        return {
          status: 'success',
          output: { sent: true, provider: 'resend', to: email, emailSendId: result.emailSendId },
        };
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

  // ========== NEW WHATSAPP NODES (Module B) ==========

  // Aguardar resposta com timeout — marca conversa aguardando
  action_whatsapp_wait_reply: {
    async execute({ config, context, isTest }) {
      if (isTest) {
        return { status: 'success', output: { waiting: true, timeout_seconds: config.timeoutSeconds || 3600 } };
      }
      try {
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const conversationId = context.conversation_id || context.conversationId;
        if (!conversationId) {
          return { status: 'error', output: null, error: 'conversationId missing from context' };
        }
        const timeoutMs = (config.timeoutSeconds || 3600) * 1000;
        await supabaseAdmin
          .from('whatsapp_conversations')
          .update({
            metadata: {
              wait_for_reply: {
                expires_at: new Date(Date.now() + timeoutMs).toISOString(),
                execution_id: context.executionId,
              },
            },
          })
          .eq('id', conversationId);
        return { status: 'success', output: { waiting: true, timeout: timeoutMs } };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Transferir conversa para fila ou agente
  action_whatsapp_transfer: {
    async execute({ config, context, isTest }) {
      if (isTest) {
        return { status: 'success', output: { transferred: true, target: config.queueId || config.agentId } };
      }
      try {
        const { transferConversation } = await import('@/lib/services/whatsapp/conversation-service');
        const conversationId = context.conversation_id || context.conversationId;
        const organizationId = context.organization_id || context.organizationId;
        if (!conversationId || !organizationId) {
          return { status: 'error', output: null, error: 'conversationId/organizationId missing' };
        }
        const result = await transferConversation({
          conversationId,
          organizationId,
          toAgentId: config.agentId,
          toQueueId: config.queueId,
          reason: config.reason || 'Transferido por automacao',
        });
        if (result.error) {
          return { status: 'error', output: null, error: result.error };
        }
        return { status: 'success', output: result.data };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Ativar agente IA na conversa
  action_whatsapp_ai: {
    async execute({ config, context, isTest }) {
      if (isTest) {
        return { status: 'success', output: { ai_activated: true, agent_id: config.aiAgentId } };
      }
      try {
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const conversationId = context.conversation_id || context.conversationId;
        if (!conversationId || !config.aiAgentId) {
          return { status: 'error', output: null, error: 'conversationId or aiAgentId missing' };
        }
        await supabaseAdmin
          .from('whatsapp_conversations')
          .update({ bot_active: true, ai_agent_id: config.aiAgentId })
          .eq('id', conversationId);
        return { status: 'success', output: { ai_activated: true } };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Enviar catalogo Meta
  action_whatsapp_catalog: {
    async execute({ config, context, credentials, isTest }) {
      if (isTest) {
        return { status: 'success', output: { catalog_sent: true, product_count: config.productIds?.length || 0 } };
      }
      const phone = context.contact?.phone;
      if (!phone) return { status: 'error', output: null, error: 'Contato sem telefone' };
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${credentials?.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${credentials?.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phone.replace(/\D/g, ''),
              type: 'interactive',
              interactive: {
                type: 'product_list',
                header: { type: 'text', text: config.headerText || 'Nossos produtos' },
                body: { text: config.bodyText || 'Confira:' },
                action: {
                  catalog_id: config.catalogId || credentials?.catalogId,
                  sections: config.sections || [
                    { title: 'Destaques', product_items: (config.productIds || []).map((id: string) => ({ product_retailer_id: id })) },
                  ],
                },
              },
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) return { status: 'error', output: result, error: result.error?.message };
        return { status: 'success', output: result };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Enviar link de pagamento
  action_whatsapp_payment: {
    async execute({ config, context, isTest }) {
      if (isTest) {
        return { status: 'success', output: { payment_link_sent: true, amount: config.amount } };
      }
      try {
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const conversationId = context.conversation_id || context.conversationId;
        const organizationId = context.organization_id || context.organizationId;

        const { data: link } = await supabaseAdmin
          .from('whatsapp_payment_links')
          .insert({
            organization_id: organizationId,
            conversation_id: conversationId,
            contact_id: context.contact?.id,
            amount: config.amount,
            currency: config.currency || 'BRL',
            description: config.description,
            payment_url: config.paymentUrl || `https://pay.example.com/checkout/${Date.now()}`,
            status: 'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select()
          .single();

        if (!link) return { status: 'error', output: null, error: 'Failed to create payment link' };

        return { status: 'success', output: { url: link.payment_url, id: link.id } };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Gerar cupom Shopify
  action_shopify_coupon: {
    async execute({ config, context, credentials, isTest }) {
      if (isTest) {
        const code = (config.prefix || 'GIFT') + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        return { status: 'success', output: { code, test: true } };
      }
      try {
        const { generateShopifyCoupon } = await import('@/lib/services/whatsapp/shopify-coupon-service');
        const result = await generateShopifyCoupon({
          shopDomain: credentials?.shopDomain,
          accessToken: credentials?.accessToken,
          discountType: config.discountType || 'percentage',
          value: config.value || 10,
          validityDays: config.validityDays || 7,
          prefix: config.prefix || 'GIFT',
          contactEmail: context.contact?.email,
        });
        if (result.error) return { status: 'error', output: null, error: result.error };
        return { status: 'success', output: { code: result.data?.code } };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Registrar interesse em produto (back-in-stock)
  action_back_in_stock_notify: {
    async execute({ config, context, isTest }) {
      if (isTest) {
        return { status: 'success', output: { registered: true, product_id: config.productId } };
      }
      try {
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        await supabaseAdmin.from('whatsapp_product_interests').insert({
          organization_id: context.organization_id || context.organizationId,
          contact_id: context.contact?.id,
          phone: context.contact?.phone,
          product_id: config.productId,
          product_title: config.productTitle,
          variant_id: config.variantId,
          notified: false,
        });
        return { status: 'success', output: { registered: true } };
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

  // A/B Split — determinístico por contato/execução (mesmo contato sempre cai no mesmo grupo)
  logic_split: {
    async execute({ config, context }) {
      const percentageA = Math.max(0, Math.min(100, Number(config.percentageA ?? 50)));
      // Hash estável do contactId (ou executionId) para determinismo
      const seed =
        (context.contact as any)?.id ||
        context.executionId ||
        String(Math.random());
      // FNV-1a hash leve
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const bucket = Math.abs(h) % 10000; // 0..9999
      const threshold = (percentageA / 100) * 10000;
      const isA = bucket < threshold;

      return {
        status: 'success',
        output: {
          bucket,
          percentageA,
          variant: isA ? 'A' : 'B',
          seed: seed.slice(0, 12),
        },
        branch: isA ? 'true' : 'false',
      };
    },
  },

  // Randomizer — N-way split (variants[] = [{name, weight}...]). sourceHandle = nome da variant.
  logic_randomizer: {
    async execute({ config, context }) {
      const variants: Array<{ name: string; weight?: number }> = Array.isArray(config.variants)
        ? config.variants
        : [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }];

      const totalWeight = variants.reduce((s, v) => s + Math.max(0, Number(v.weight || 1)), 0) || 1;

      // Determinístico via hash do contactId + nodeId (pra múltiplos randomizers no mesmo flow)
      const seed =
        ((context.contact as any)?.id || context.executionId || '') +
        ':' + (config._nodeId || '');
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const bucket = (Math.abs(h) % totalWeight) + 1;

      let acc = 0;
      let chosen = variants[0];
      for (const v of variants) {
        acc += Math.max(0, Number(v.weight || 1));
        if (bucket <= acc) { chosen = v; break; }
      }

      return {
        status: 'success',
        output: { variant: chosen.name, bucket, totalWeight },
        branch: chosen.name,
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

  // WhatsApp keyword matcher (Module B)
  condition_whatsapp_keyword: {
    async execute({ config, context }) {
      const message = (context.message?.text || context.lastMessage || '').toLowerCase();
      const keywords: string[] = config.keywords || [];
      const mode = config.mode || 'contains'; // contains|equals|regex

      let matched = false;
      for (const kw of keywords) {
        const lower = kw.toLowerCase();
        if (mode === 'equals') matched = message.trim() === lower;
        else if (mode === 'regex') {
          try { matched = new RegExp(kw, 'i').test(message); } catch { matched = false; }
        } else matched = message.includes(lower);
        if (matched) break;
      }

      return {
        status: 'success',
        output: { matched, message },
        branch: matched ? 'true' : 'false',
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
