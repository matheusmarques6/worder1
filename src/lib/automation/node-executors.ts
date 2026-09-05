/**
 * NODE EXECUTORS - COMPLETE VERSION
 * Specific execution logic for each node type with real integrations
 */

import { VariableContext } from './variable-engine';
import { WorkflowNode } from './execution-engine';
import { META_BASE_URL } from '@/lib/whatsapp/api-version';
import { requireOptIn } from '@/lib/whatsapp/opt-out-guard';

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
  /**
   * Set by the "Sair" (control_exit) node. When true the engine stops
   * processing the run for this contact — they have left the flow. The
   * node itself still reports status 'success' (it did its job); `exit`
   * is the run-level signal, kept separate so the node renders green in
   * the test panel.
   */
  exit?: boolean;
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
  trigger_popup_subscribed: {
    // Same shape as form_submitted — the dispatcher sets context.trigger.data
    // and downstream nodes (welcome email, tag-add, etc.) read it via the
    // variable engine. Only the trigger type differs so flow authors can
    // scope a welcome flow to popups specifically.
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

/**
 * Chave de duplicidade de um envio de automação.
 *
 * (automação, nó, contato, dia). O dia entra porque reentrada legítima
 * no mesmo fluxo — abandonar o carrinho de novo semana que vem — tem de
 * continuar enviando; o que não pode é o MESMO passo sair seis vezes
 * numa tarde porque seis runs paralelas existem.
 *
 * Sem automação ou sem contato identificado não há o que deduplicar:
 * devolve null e o envio segue sem trava (é o caso do e-mail de teste).
 */
function buildEmailDedupeKey(
  context: any,
  node: any,
  organizationId?: string
): string | null {
  const workflow = context?.workflow || {};
  const automationId =
    context?.automation_id || workflow.automationId || workflow.id || null;
  const contactId = context?.contact?.id || null;
  const nodeId = node?.id || null;
  if (!automationId || !contactId || !nodeId) return null;
  const dia = new Date().toISOString().slice(0, 10);
  return `auto:${automationId}:${nodeId}:${contactId}:${dia}`;
}

const actionExecutors: Record<string, NodeExecutor> = {
  // ========== WHATSAPP ==========
  action_whatsapp: {
    async execute({ node, config, context, credentials, isTest, supabase, organizationId }) {
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

      // Pre-create the send row in 'pending' so attribution + the
      // webhook's delivered/read updates can both find it later by
      // external_message_id. Same pattern email_sends uses (create
      // queued row, then patch with provider id after the API call).
      const workflow = (context as any).workflow || {};
      // UUID columns reject the editor's transient client ids
      // ("flow-1778295108640"). Coerce to null when not a UUID so the
      // INSERT doesn't blow up the whole node.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const asUuid = (v: any) => (typeof v === 'string' && uuidRe.test(v) ? v : null);
      const flowId = asUuid(
        (context as any).flowId ||
        (context as any).flow_id ||
        workflow.flowId ||
        workflow.flow_id
      );
      const runId = asUuid(
        (context as any).automation_run_id ||
        (context as any).runId ||
        workflow.executionId ||
        workflow.execution_id
      );
      const automationId = asUuid(
        (context as any).automation_id ||
        workflow.automationId ||
        workflow.id
      );

      let whatsappSendId: string | null = null;
      try {
        if (supabase && organizationId && (context.contact as any)?.id) {
          const { data: row, error: insertErr } = await supabase
            .from('whatsapp_sends')
            .insert({
              organization_id: organizationId,
              contact_id: (context.contact as any).id,
              phone_number: phone,
              campaign_id: null,
              automation_id: automationId,
              automation_run_id: runId,
              flow_id: flowId,
              node_id: node?.id || null,
              message_body: config.message || config.bodyText || null,
              template_name: config.templateName || config.templateId || null,
              template_params: config.templateParams || null,
              status: 'pending',
            })
            .select('id')
            .single();
          if (insertErr) {
            console.warn('[action_whatsapp] whatsapp_sends INSERT failed (proceeding):', insertErr);
          } else {
            whatsappSendId = row?.id || null;
          }
        }
      } catch (e) {
        console.warn('[action_whatsapp] whatsapp_sends prep failed (proceeding):', e);
      }

      // O editor de WhatsApp grava templateName (nome Meta) e o modo em
      // messageMode; fluxos antigos gravavam templateId. Aceitar os dois
      // — sem isso o modo template caía no ramo de texto com body vazio.
      const templateName: string | undefined =
        config.templateName || config.templateId || undefined
      // Modo texto explícito vence (template que sobrou de uma troca de
      // modo não pode reativar); legado sem messageMode segue o antigo
      // critério "tem template → é template".
      const isTemplateMode = !!templateName && config.messageMode !== 'text'

      // Onda 10 — guard opt-out (automation nunca tem override; e silencioso).
      if (organizationId && phone) {
        let tplCategory: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | undefined
        if (templateName && supabase) {
          try {
            const { data: tpl } = await supabase
              .from('whatsapp_templates')
              .select('category')
              .eq('organization_id', organizationId)
              .eq('name', templateName)
              .maybeSingle()
            const upper = (tpl?.category as string | undefined)?.toUpperCase()
            if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') {
              tplCategory = upper
            }
          } catch (e) {
            console.warn('[action_whatsapp] template category lookup failed:', e)
          }
        }
        const optCheck = await requireOptIn(organizationId, phone, tplCategory, {
          sender: 'automation.action_whatsapp',
        })
        if (!optCheck.allowed) {
          return {
            status: 'success',
            output: { skipped: true, reason: 'OPTED_OUT' },
          }
        }
      }

      // UTM + identificação em todo link do texto (configuração da loja do
      // envio; utm_medium=whatsapp). Só no modo texto — no modo template a
      // URL mora no template aprovado pela Meta.
      let textBody: string = config.message || config.bodyText || '';
      if (!isTemplateMode && textBody) {
        try {
          const { stampMessageLinks } = await import('@/lib/tracking/outbound-text');
          textBody = await stampMessageLinks({
            text: textBody,
            organizationId,
            storeId: (context as any).storeId || null,
            channel: 'whatsapp',
            context: {
              messageType: 'automation',
              automationName: workflow.name || (context as any).automation_name || '',
              automationId,
              messageName: (node as any)?.data?.label || config.label || 'WhatsApp',
              messageId: node?.id || null,
              sendId: whatsappSendId,
              contactId: (context.contact as any)?.id || null,
              storeName: (context as any)?.store?.name || null,
              storeDomain: (context as any)?.store?.domain || null,
            },
          });
          if (supabase && whatsappSendId && textBody !== (config.message || config.bodyText)) {
            await supabase.from('whatsapp_sends').update({ message_body: textBody }).eq('id', whatsappSendId);
          }
        } catch { /* texto original segue */ }
      }

      try {
        let result: any;
        let externalMessageId: string | null = null;
        let usedProvider = 'cloud';

        {
          const response = await fetch(
            `${META_BASE_URL}/${credentials?.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${credentials?.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone.replace(/\D/g, ''),
                type: isTemplateMode ? 'template' : 'text',
                ...(isTemplateMode
                  ? {
                      template: {
                        name: templateName,
                        language: { code: config.language || 'pt_BR' },
                        components: config.templateParams || [],
                      },
                    }
                  : {
                      // O editor grava o texto em bodyText; message é o
                      // legado — aceitar os dois (já com os links carimbados).
                      text: { body: textBody },
                    }),
              }),
            }
          );

          result = await response.json();

          if (!response.ok) {
            if (supabase && whatsappSendId) {
              await supabase.from('whatsapp_sends').update({
                status: 'failed',
                error_message: result.error?.message || 'Falha no envio',
              }).eq('id', whatsappSendId);
            }
            return { status: 'error', output: result, error: result.error?.message || 'Falha no envio' };
          }

          // Cloud API returns messages: [{ id: wamid }]
          externalMessageId = result?.messages?.[0]?.id || null;
        }

        // Stamp the send row as 'sent' + persist the provider message id
        // so the inbound delivery/read webhook can match it back.
        if (supabase && whatsappSendId) {
          await supabase.from('whatsapp_sends').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            external_message_id: externalMessageId,
            metadata: { provider: usedProvider, raw: result },
          }).eq('id', whatsappSendId);
        }

        return {
          status: 'success',
          output: { ...result, provider: usedProvider, whatsappSendId, externalMessageId },
        };
      } catch (error: any) {
        if (supabase && whatsappSendId) {
          await supabase.from('whatsapp_sends').update({
            status: 'failed',
            error_message: error.message,
          }).eq('id', whatsappSendId);
        }
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // ========== EMAIL ==========
  action_email: {
    async execute({ node, config, context, credentials, isTest, supabase, organizationId }) {
      // Trace marker so we can grep Vercel logs for "did this email
      // node even run?". Logged once per execute() call, before any
      // skip / postpone / cap shortcuts can return.
      console.log('[action_email] ▶ start', {
        nodeId: node?.id,
        emailStatus: config?.emailStatus || '(default→draft)',
        templateId: config?.templateId,
        contactId: (context.contact as any)?.id,
        contactEmail: (context.contact as any)?.email,
        triggerType: (context as any)?.trigger?.type,
        organizationId,
      });

      // Per-node publish gate: the UI lets the merchant flip an email
      // between draft / live / manual. Anything that isn't 'live' must
      // not actually send — the node returns success+skipped so the rest
      // of the flow continues. Test runs always send (the editor uses a
      // separate /api/email/test endpoint anyway).
      //
      // Default stays 'draft' on purpose: a freshly-created email node
      // must not auto-send before the merchant explicitly publishes it.
      // The skip is logged with the node id so you can correlate with
      // the History panel.
      const emailStatus = (config.emailStatus || 'draft').toLowerCase();
      if (!isTest && emailStatus !== 'live') {
        console.log('[action_email] ⊘ skipped — not live', {
          nodeId: node?.id,
          emailStatus,
        });
        return {
          status: 'success',
          output: {
            sent: false,
            skipped: true,
            reason: `Email ${emailStatus} — publique para enviar`,
            emailStatus,
          },
        };
      }

      // Quiet Hours + Frequency Cap (org-level rules). If we'd be sending
      // inside the merchant's quiet window, postpone the run until the
      // window closes. If the contact has hit the daily cap, skip the
      // send (let the flow continue without spamming).
      if (!isTest && organizationId) {
        try {
          const { getOrgSendingRules, nextAllowedSendTime, isFrequencyCapped } =
            await import('@/lib/email/sending-rules');
          const rules = await getOrgSendingRules(organizationId);
          const resumeAt = nextAllowedSendTime(rules);
          if (resumeAt) {
            return {
              status: 'waiting',
              output: { postponedFor: 'quiet_hours', resumeAt: resumeAt.toISOString() },
              waitUntil: resumeAt,
            };
          }
          const contactIdForCap = (context.contact as any)?.id;
          if (await isFrequencyCapped(organizationId, contactIdForCap, rules)) {
            return {
              status: 'success',
              output: {
                sent: false,
                skipped: true,
                reason: `Frequency cap atingido (${rules.maxSendsPerContactPerDay}/dia)`,
              },
            };
          }
        } catch (e) {
          console.warn('[action_email] sending-rules check failed (proceeding):', e);
        }
      }

      // Email cascade: contact context first, then trigger data fields
      // (Shopify webhook may have arrived without the customer info
      // attached to the contact yet — we still try to email the
      // address that was on the trigger payload). Klaviyo/Omnisend
      // top-level keys + canonical Customer.Email + raw.email cover
      // every shape any source ships.
      const triggerData: any = (context.trigger as any)?.data || {};
      const triggerProps: any = triggerData.properties || triggerData;
      const triggerRaw: any = triggerProps.raw || {};
      const fallbackEmail =
        triggerProps.CustomerEmail ||
        triggerProps?.Customer?.Email ||
        triggerProps.email ||
        triggerProps.Email ||
        triggerRaw.email ||
        triggerRaw.contact_email ||
        triggerRaw.customer?.email ||
        triggerRaw.billing_address?.email ||
        null;
      const email = (context.contact?.email as string | undefined) || fallbackEmail;

      // If context has no contact but trigger has email, try to look up
      // an existing contact by that email so downstream merge tags +
      // email_sends linkage work. Best-effort.
      if (!context.contact && email && organizationId) {
        try {
          const { data: contactRow } = await supabase
            .from('contacts')
            .select('id, email, phone, first_name, last_name, total_orders, total_spent, tags')
            .eq('organization_id', organizationId)
            .ilike('email', String(email))
            .maybeSingle();
          if (contactRow) {
            (context as any).contact = {
              id: contactRow.id,
              email: contactRow.email,
              phone: contactRow.phone,
              firstName: contactRow.first_name,
              lastName: contactRow.last_name,
              tags: contactRow.tags || [],
              customFields: {},
            };
          }
        } catch { /* best-effort */ }
      }

      if (!email) {
        // No contact email and no fallback in trigger data. Complete
        // the run as 'success' with skipped flag so it shows in history
        // with a clear reason instead of polluting the failure stats.
        return {
          status: 'success',
          output: {
            sent: false,
            skipped: true,
            reason: 'Email não disponível: o webhook do Shopify chegou sem email do cliente e o trigger não carregou nenhum endereço. Aguardando próximo webhook (checkouts/update) com a info preenchida.',
          },
        };
      }

      // Email-consent guard. The Resend bounce/complaint webhook flips
      // contacts.email_consent=false and writes status='bounced' /
      // 'complained' / 'unsubscribed'. Re-sending to those addresses
      // poisons sender reputation on Gmail/Outlook, so we skip the
      // email node here and let the flow continue to non-email nodes
      // (WhatsApp, SMS, condition, etc.) — that's the merchant's
      // explicit ask: "remove the email but keep the WhatsApp branch
      // running if the phone is valid".
      if (!isTest && organizationId && email) {
        try {
          const { data: consentRow } = await supabase
            .from('contacts')
            .select('email_consent, status')
            .eq('organization_id', organizationId)
            .ilike('email', String(email))
            .maybeSingle();
          // Shared guard (see @/lib/email/consent) — blocks boolean false AND
          // the TEXT states pending/denied/... so double-opt-in 'pending'
          // contacts don't get the welcome flow before they confirm.
          //
          // O alcance é definido pelo sending threshold da automação
          // (Omnisend): 'subscribed' (padrão, = comportamento de sempre),
          // 'nonSubscribed' (alcança quem nunca optou — recuperação de
          // carrinho) ou 'all' (transacional). Bounce/denúncia/inválido
          // ficam bloqueados em qualquer nível.
          const { isEmailBlockedForThreshold, normalizeThreshold } = await import('@/lib/email/consent');
          const emailThreshold = normalizeThreshold(
            (context as any)?.sendingThresholds?.email
          );
          const isInvalid = !!consentRow && isEmailBlockedForThreshold(
            consentRow.email_consent,
            consentRow.status,
            emailThreshold
          );
          if (isInvalid) {
            console.log('[action_email] ⊘ skipped — email bloqueado pelo threshold', {
              nodeId: node?.id,
              contactEmail: email,
              emailConsent: consentRow?.email_consent,
              contactStatus: consentRow?.status,
              threshold: emailThreshold,
            });
            return {
              status: 'success',
              output: {
                sent: false,
                skipped: true,
                reason: `Email não permitido para este contato (status=${consentRow?.status || 'opt-out'}, alcance=${emailThreshold}). Flow continua nos próximos nodes.`,
                contactStatus: consentRow?.status,
                emailConsent: consentRow?.email_consent,
                threshold: emailThreshold,
              },
            };
          }
        } catch (e) {
          console.warn('[action_email] consent check failed (proceeding):', e);
        }
      }

      try {
        // 1. Resolve HTML content - fetch template if specified.
        // editor_type is selected here so text-based templates can also
        // produce a true text/plain alternative (rendered downstream by
        // sendCampaignEmail). Templates created before the column
        // existed return null and fall through to the visual branch.
        let html: string;
        let plainText: string | undefined;
        // Subject saved ON the template (the text editor persists
        // email_templates.subject). Used as the fallback when the flow
        // node doesn't define its own subject — before this, the
        // template's Assunto was silently ignored by automations.
        let templateSubject = '';
        if (config.templateId && config.templateId !== 'none') {
          // Scope the lookup to the executing org so a tampered/stale
          // templateId from another tenant can never be rendered into
          // this org's send. organizationId is always present for real
          // sends; in its absence (legacy test contexts) we fall back to
          // the unscoped lookup the executor used before.
          let tplQuery = supabase
            .from('email_templates')
            .select('design_json, html, name, editor_type, subject')
            .eq('id', config.templateId);
          if (organizationId) {
            tplQuery = tplQuery.eq('organization_id', organizationId);
          }
          const { data: template, error: tplErr } = await tplQuery.single();

          if (tplErr || !template) {
            return { status: 'error', output: null, error: `Template ${config.templateId} not found` };
          }

          templateSubject = (template as any).subject || '';

          // Use pre-rendered HTML from template
          html = template.html || '';
          if (!html) {
            html = '<p>Template sem conteúdo HTML renderizado</p>';
          }

          // Generate the plain-text alternative for text-based templates
          // straight from the Tiptap JSON. Stripping the HTML would
          // produce noise (footer chrome, button labels) — walking the
          // doc tree preserves the natural reading order.
          if ((template as any).editor_type === 'text' && template.design_json) {
            try {
              const { renderTextEmailToPlain } = await import('@/lib/email/text-render');
              const docJson = (template.design_json as any)?.doc || template.design_json;
              plainText = renderTextEmailToPlain(docJson);
            } catch (err) {
              console.warn('[action_email] failed to derive plain text:', err);
            }
          }
        } else {
          html = config.html || config.body || '<p>Email sem conteúdo</p>';
        }

        // 2. Resolve merge tags using the variable engine.
        // Subject priority: flow-node config wins, then the subject saved
        // on the template itself (text editor's "Assunto" field).
        let resolvedHtml = html;
        let resolvedSubject = config.subject || templateSubject || '';

        try {
          const { variableEngine } = await import('./variable-engine');
          // HTML body: escape substituted values (& < > " ') — the engine
          // resolves canonical/trigger/contact values BEFORE the escaped
          // downstream resolvers, so without this a Customer.FirstName of
          // "<b>Maria & Co</b>" landed raw in automation HTML (it was
          // escaped in preview/test). URLs stay functional: &amp; in href
          // is valid and render.ts un-escapes before click-tracking.
          resolvedHtml = variableEngine.process(html, context, { escapeHtml: true });
          // Subject is plain text — NO html-escaping (no &amp; in inbox).
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
        // Desligado por padrão — ligar é escolha do lojista por nó.
        // Quando ligado, pula quem recebeu qualquer e-mail nas últimas
        // N horas (o mesmo sentido do Smart Sending da Omnisend).
        if (config.smartSending && !isTest && context.contact?.id) {
          const skipHours = Math.max(1, Number(config.smartSendingHours) || 16);
          const cutoff = new Date(Date.now() - skipHours * 60 * 60 * 1000).toISOString();
          let q = supabase
            .from('email_sends')
            .select('id')
            .eq('contact_id', context.contact.id)
            .gte('created_at', cutoff)
            // Envio que falhou não chegou a ninguém: contá-lo bloqueava
            // o próximo e-mail por causa de um erro nosso, e o contato
            // ficava sem receber nada.
            .not('status', 'in', '("failed","cancelled","bounced")')
            .limit(1);
          // Escopo da organização: o cliente é service-role e sem este
          // filtro a consulta atravessa todos os inquilinos.
          if (organizationId) q = q.eq('organization_id', organizationId);
          const { data: recentSends, error: smartErr } = await q;

          if (smartErr) {
            // Na dúvida, ENVIA. Um erro de leitura não pode virar
            // silêncio para o contato.
            console.warn('[action_email] Smart Sending: consulta falhou, seguindo com o envio:', smartErr);
          } else if (recentSends && recentSends.length > 0) {
            console.log('[action_email] ⊘ Smart Sending', {
              nodeId: node?.id, skipHours, contactId: context.contact.id,
            });
            return {
              status: 'success',
              output: {
                sent: false,
                skipped: true,
                reason: `Smart Sending: contato recebeu e-mail nas últimas ${skipHours}h`,
              },
            };
          }
        }

        // 2b-2. Conversion guard for cart-recovery / checkout-abandon flows.
        //
        // When the trigger fired on checkout_started, the merchant doesn't
        // want the email going out if the customer has since completed
        // the purchase (during the delay window). Same for added_to_cart.
        //
        // Check: was a placed_order / order_paid / checkout_completed
        // event recorded for the same contact AFTER the run started?
        // If yes, this run is no longer relevant — skip the email.
        //
        // CRITICAL: floor MUST be the run's started_at (via
        // workflow.startedAt that the cron + worker plumb in). Earlier
        // versions used Date.now() - 24h, which counted ANY past purchase
        // in the last day as a conversion — repeat customers had every
        // recovery email silently skipped because they bought yesterday,
        // showing the symptom "fluxo entra, espera dispatch, não envia,
        // pula pra próximo delay". 5-minute safety margin catches racy
        // completions that fired right after the trigger but before the
        // engine kicked in.
        if (!isTest && context.contact?.id) {
          const triggerType = (context as any).trigger?.type || '';
          const triggerEventType = String((context.trigger?.data as any)?.event_type || '').toLowerCase();
          const isAbandonmentFlow =
            triggerType === 'trigger_checkout_abandoned' ||
            triggerType === 'trigger_added_to_cart' ||
            triggerType === 'trigger_browse_abandoned' ||
            triggerEventType === 'checkout_started' ||
            triggerEventType === 'added_to_cart' ||
            triggerEventType === 'browse_abandoned';

          if (isAbandonmentFlow) {
            const runStartedAtIso =
              (context as any).workflow?.startedAt ||
              new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const runStartedAtMs = Date.parse(runStartedAtIso);
            const since = new Date(
              Number.isFinite(runStartedAtMs)
                ? runStartedAtMs - 5 * 60 * 1000
                : Date.now() - 5 * 60 * 1000
            ).toISOString();
            const { data: completion } = await supabase
              .from('contact_events')
              .select('id, event_type, occurred_at')
              .eq('contact_id', context.contact.id)
              .in('event_type', ['placed_order', 'order_paid', 'checkout_completed'])
              .gte('occurred_at', since)
              .order('occurred_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (completion) {
              console.log('[action_email] ⊘ skipped — conversion guard', {
                nodeId: node?.id,
                contactId: context.contact.id,
                conversionEvent: completion.event_type,
                conversionAt: completion.occurred_at,
                runStartedAt: runStartedAtIso,
              });
              return {
                status: 'success',
                output: {
                  skipped: true,
                  reason: `Conversão detectada (${completion.event_type} em ${completion.occurred_at}). Email de recuperação cancelado.`,
                  converted_at: completion.occurred_at,
                },
              };
            }
          }
        }

        // 2c. UTM + identificação em todo link — feito em sendCampaignEmail
        // (prepareEmailHtml) com a configuração da LOJA e as variáveis do
        // envio: `automation: <nome> (<id>)`, nome/id deste nó, etc.
        // Aqui só se decide o que este nó SOBRESCREVE:
        //   • "Personalizar UTMs" (utmTracking=true) → os campos do nó
        //     valem no lugar do padrão da loja, campo a campo;
        //   • utmDisabled=true → este e-mail sai sem UTM (a identificação
        //     do contato/envio continua, ela nunca é removida).
        // Nós antigos com utmTracking=false (checkbox desmarcado) caem no
        // padrão da loja — antes isso desligava TODAS as UTMs sem querer.
        const utmOverrides =
          config.utmTracking === true
            ? {
                utm_source: config.utmSource || '',
                utm_medium: config.utmMedium || '',
                utm_campaign: config.utmCampaign || '',
                utm_content: config.utmContent || '',
                utm_term: config.utmTerm || '',
                utm_id: config.utmId || '',
              }
            : null;
        const utmDisabled = config.utmDisabled === true;
        const linkWorkflow = (context as any).workflow || {};
        const linkContext = {
          messageType: 'automation' as const,
          automationName:
            linkWorkflow.name || (context as any).automation_name || (context as any).automationName || '',
          automationId:
            (context as any).automation_id || linkWorkflow.automationId || linkWorkflow.id || null,
          messageName: (node as any)?.data?.label || config.label || config.name || 'Email',
          messageId: node?.id || null,
        };

        // 3. Build sender info
        // When the node has no explicit sender AND the flow belongs to a
        // store, defer the fallback to sendCampaignEmail so it resolves the
        // STORE's identity (getEmailProviderForOrg(org, storeId)) rather than
        // the org default here — this is the cross-store sender fix. Org-wide
        // flows (no storeId) keep the previous org-default behavior.
        // Mirrors the senderEmail deferral for the sender NAME too: a blank
        // '' lets sendCampaignEmail fall back to config.defaultSenderName
        // (the store's name), not the generic context store / 'Worder'.
        const runStoreId = (context as any).storeId || null;
        // Sem remetente no nó, fica vazio e sendCampaignEmail resolve a
        // identidade certa: a loja do fluxo ou, num fluxo da organização
        // inteira, a loja do contato. O fallback antigo aqui
        // ('noreply@example.com' / nome da organização) furava essa regra.
        const senderName = config.senderName || '';
        const senderEmail = config.senderEmail || '';

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

        // Enrich trigger data with product images from shopify_products table
        // (webhooks don't always include images inline)
        const eventData = context.trigger?.data || {};
        try {
          const { enrichOrderItemImages } = await import('@/lib/email/render');
          // Com a loja do fluxo, a imagem vem do catálogo DELA; sem loja
          // (fluxo da organização inteira) fica a cerca da organização.
          await enrichOrderItemImages(eventData, supabase, runStoreId || undefined, organizationId);
        } catch {}

        // Resolve order-products blocks using enriched event data
        if (html.includes('WORDER_ORDER_BLOCK')) {
          try {
            const { resolveOrderBlocks } = await import('@/lib/email/render');
            html = resolveOrderBlocks(html, eventData);
          } catch (blockErr) {
            console.error('[action_email] Order block rendering failed:', blockErr);
            return { status: 'error', output: null, error: `Falha ao renderizar bloco de produtos do pedido: ${(blockErr as any)?.message}` };
          }
        }

        // Build merge data from the same context we already resolved
        // (contact + event + store). Using empty mergeData works too
        // because the HTML/subject were pre-rendered by the variable
        // engine above — prepareEmailHtml still adds tracking + footer.
        const contact = context.contact as any;
        // O contexto canônico (VariableContext) é camelCase — é o que os
        // dois crons montam. Ler só snake_case aqui zerava {{first_name}},
        // {{last_name}} e {{full_name}} em TODO envio real de automação
        // (o preview e o /execute passam a linha crua do banco, por isso
        // funcionavam e o bug só aparecia na caixa de entrada: o assunto
        // "{{first_name}}, seu pedido..." chegava como ", seu pedido...").
        // Aceitar as duas formas cobre os quatro chamadores.
        const firstName = contact?.firstName || contact?.first_name || '';
        const lastName = contact?.lastName || contact?.last_name || '';
        const customFields = contact?.customFields || contact?.custom_fields;
        const triggerData = context.trigger?.data || {};
        const triggerProps = triggerData.properties || triggerData;
        const mergeData: Record<string, string> = {
          first_name: firstName,
          last_name: lastName,
          full_name: [firstName, lastName].filter(Boolean).join(' '),
          email: email || '',
          phone: contact?.phone || '',
          total_orders: String(contact?.totalOrders ?? contact?.total_orders ?? 0),
          total_spent: String(contact?.totalSpent ?? contact?.total_spent ?? 0),
          store_name: (context as any)?.store?.name || '',
          store_url: (context as any)?.store?.domain ? `https://${(context as any).store.domain}` : '',
          // Faltavam no mergeData: eram oferecidas no editor e chegavam
          // em branco na caixa de entrada.
          store_email: (context as any)?.store?.email || '',
          store_phone: (context as any)?.store?.phone || '',
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
          mergeData['event.customer_name'] = triggerProps.CustomerName || [firstName, lastName].filter(Boolean).join(' ');
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
        // UTM params from webhook note_attributes
        const utmData = triggerProps.UTM || triggerProps._utm || {};
        if (utmData && typeof utmData === 'object') {
          for (const [k, v] of Object.entries(utmData)) {
            if (v) mergeData[`event.${k}`] = String(v);
          }
        }
        // Custom fields
        if (customFields && typeof customFields === 'object') {
          for (const [k, v] of Object.entries(customFields as Record<string, unknown>)) {
            mergeData[`custom.${k}`] = String(v ?? '');
            mergeData[`custom_${k}`] = String(v ?? '');
          }
        }

        // Absolutize any SITE-RELATIVE flat merge value (e.g. event.ProductURL
        // extracted from Items[0] as "/products/<handle>") against the store
        // host, so renderMergeTags fallbacks don't ship a relative link that
        // 404s on the app domain. Only touches leading-slash, space-free
        // values — non-URL fields are untouched.
        try {
          const { normalizeHost, getShopDomain, absolutizeSiteUrl } = await import('@/lib/email/trigger-cta');
          const mergeStoreHost = normalizeHost((context as any)?.store?.domain) || getShopDomain(triggerData);
          if (mergeStoreHost) {
            for (const k of Object.keys(mergeData)) {
              const v = mergeData[k];
              if (typeof v === 'string' && v.startsWith('/') && !/\s/.test(v)) {
                mergeData[k] = absolutizeSiteUrl(v, mergeStoreHost);
              }
            }
          }
        } catch {}

        const { getAppBaseUrl } = await import('@/lib/app-url');
        const baseUrl = getAppBaseUrl();

        // email_sends.campaign_id is UUID — only pass it through when
        // the flow id actually is a UUID. Flow attribution lives in the
        // flow_id column we set on the row right after the send.
        const flowIdRaw = (context as any).flowId || (context as any).flow_id || '';
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowIdRaw);
        const campaignIdSurrogate = isUuid ? flowIdRaw : null;

        const result = await sendCampaignEmail({
          campaignId: campaignIdSurrogate as any,
          contactId: (context.contact as any)?.id || '',
          contactEmail: email,
          mergeData,
          templateHtml: html,
          templateText: plainText,
          subject,
          fromEmail: senderEmail,
          senderName,
          // Node-level reply-to when configured; otherwise undefined so
          // sendCampaignEmail falls back to the STORE's default_reply_to
          // (config.defaultReplyTo from getEmailProviderForOrg).
          replyTo: config.replyTo || undefined,
          baseUrl,
          organizationId: organizationId || '',
          // Store-scope the sender: a blank node senderEmail then falls back
          // to the STORE's identity (not the org default), so a Dr. Groot
          // flow never sends from Based's address. Null for org-wide flows.
          storeId: (context as any).storeId || null,
          eventData: context.trigger?.data,
          // Trigger type so the "Produtos do Gatilho" block builds the
          // correct CTA link (checkout recovery / cart permalink / product).
          triggerType: (context as any).trigger?.type || null,
          // UTM + identificação de todo link (ver 2c acima).
          linkContext,
          utmOverrides,
          utmDisabled,
          // Trava de duplicidade: um índice único no banco garante que
          // este passo, deste fluxo, para este contato, saia UMA vez por
          // dia. É o que faltava — a idempotência existente age na
          // INSCRIÇÃO e não ajuda quando as runs duplicadas já existem.
          // Reentrada legítima no fluxo em outro dia continua enviando.
          dedupeKey: buildEmailDedupeKey(context, node, organizationId),
        });

        // A trava do banco recusou: outra execução já mandou este mesmo
        // e-mail. O fluxo segue para o próximo nó como se tivesse
        // enviado — porque, do ponto de vista do contato, enviou.
        if ((result as any).skipped) {
          console.log('[action_email] ⊘ duplicado bloqueado', {
            nodeId: node?.id,
            contactId: (context.contact as any)?.id,
          });
          return {
            status: 'success',
            output: { sent: false, skipped: true, reason: 'Envio duplicado bloqueado' },
          };
        }

        if (!result.success) {
          // Permanent failures from Resend (invalid recipient,
          // suppression list, domain not verified, etc.) shouldn't
          // halt the whole run — the merchant still wants the WhatsApp
          // / SMS branch to fire. send-campaign-email already flips
          // contacts.email_consent=false for these, so the consent
          // guard above will short-circuit the next email node.
          // Transient errors (network, rate limits) keep the old
          // behaviour so the cron retries them.
          const permanent = /suppress|invalid|does not exist|not allowed|no such user|unable to deliver|not a verified/i.test(
            String(result.error || '')
          );
          if (permanent) {
            return {
              status: 'success',
              output: {
                sent: false,
                skipped: true,
                reason: `Email inválido/suprimido: ${result.error}. Próximos nodes seguem.`,
                error: result.error,
              },
            };
          }
          return { status: 'error', output: { error: result.error }, error: result.error || 'Falha no envio' };
        }

        // Tag the email_sends row with automation/flow/run/node ids so the
        // per-node analytics on the canvas can attribute opens, clicks,
        // and revenue back to the right action_email card. The cron
        // workers stash run id at context.workflow.executionId — earlier
        // versions only looked at context.automation_run_id / .runId and
        // ended up writing NULL, which is why the metrics dashboard sat
        // at zero even after real deliveries.
        if (result.emailSendId) {
          try {
            const updates: Record<string, any> = {};
            const workflow = (context as any).workflow || {};
            const flowId =
              (context as any).flowId ||
              (context as any).flow_id ||
              workflow.flowId ||
              workflow.flow_id;
            const runId =
              (context as any).automation_run_id ||
              (context as any).runId ||
              workflow.executionId ||
              workflow.execution_id;
            const automationId =
              (context as any).automation_id ||
              workflow.automationId ||
              workflow.id;
            // flow_id, automation_run_id, automation_id and
            // email_template_id are all UUID columns. The flow-builder
            // editor uses transient client ids like "flow-1778295108640"
            // for unsaved flows, and the legacy automation engine still
            // passes those through. Writing a non-UUID raises 22P02 in
            // Postgres ("invalid input syntax for type uuid"), which used
            // to surface as the run-level error on n3. Guard each column
            // independently so attribution still gets whatever ids ARE
            // valid UUIDs.
            const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const asUuid = (v: any) => (typeof v === 'string' && uuidRe.test(v) ? v : null);
            const safeFlowId = asUuid(flowId);
            const safeRunId = asUuid(runId);
            const safeAutomationId = asUuid(automationId);
            const safeTemplateId = asUuid(config.templateId);
            if (safeFlowId) updates.flow_id = safeFlowId;
            if (safeRunId) updates.automation_run_id = safeRunId;
            if (safeAutomationId) updates.automation_id = safeAutomationId;
            if (safeTemplateId) updates.email_template_id = safeTemplateId;
            // node_id lives in metadata jsonb so we don't need a schema
            // change to attribute the send to a specific canvas node.
            if (node?.id) {
              updates.metadata = { node_id: node.id, node_type: node.type };
            }
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
    async execute({ node, config, context, credentials, isTest, supabase, organizationId }) {
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

      // Guard against empty messages — without this the row is created and a
      // blank SMS is sent to the provider (Twilio/Zenvia rejects it, or worse
      // bills for an empty segment). Validation should catch this at publish
      // time but we defend at runtime too.
      const smsBody = (config.message || config.text || '').trim();
      if (!smsBody) {
        return { status: 'error', output: null, error: 'Mensagem de SMS vazia' };
      }

      // Sending threshold do canal SMS (Omnisend). Default 'all' = sem
      // filtro, exatamente como este nó sempre se comportou; apertar para
      // 'subscribed'/'nonSubscribed' é escolha explícita do lojista na UI
      // do gatilho. Bounce/denúncia/inválido bloqueiam em qualquer nível.
      {
        const organizationId = (context as any).organizationId || (context as any).organization_id;
        const contactId = (context.contact as any)?.id;
        const rawThreshold = (context as any)?.sendingThresholds?.sms;
        if (rawThreshold && organizationId && contactId && supabase) {
          try {
            const { isSmsBlockedForThreshold, normalizeThreshold } = await import('@/lib/email/consent');
            const smsThreshold = normalizeThreshold(rawThreshold);
            const { data: row } = await supabase
              .from('contacts')
              .select('sms_consent, status')
              .eq('id', contactId)
              .maybeSingle();
            if (row && isSmsBlockedForThreshold(row.sms_consent, row.status, smsThreshold)) {
              console.log('[action_sms] ⊘ skipped — SMS bloqueado pelo threshold', {
                nodeId: node?.id, contactId, threshold: smsThreshold, status: row.status,
              });
              return {
                status: 'success',
                output: {
                  sent: false,
                  skipped: true,
                  reason: `SMS não permitido para este contato (alcance=${smsThreshold}). Flow continua nos próximos nodes.`,
                  threshold: smsThreshold,
                },
              };
            }
          } catch (e) {
            console.warn('[action_sms] threshold check failed (proceeding):', e);
          }
        }
      }

      // Pre-create the send row so attribution finds it even before
      // a real SMS provider (Twilio/Zenvia) is wired in. The row is
      // still useful: flow stats count it, attribution can claim it
      // if the recipient happens to buy within the window. When the
      // provider lands, the only change is the actual fetch call +
      // provider message id captured below.
      const workflow = (context as any).workflow || {};
      // UUID columns reject the editor's transient client ids
      // ("flow-1778295108640"). Coerce non-UUIDs to null.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const asUuid = (v: any) => (typeof v === 'string' && uuidRe.test(v) ? v : null);
      const flowId = asUuid(
        (context as any).flowId ||
        (context as any).flow_id ||
        workflow.flowId ||
        workflow.flow_id
      );
      const runId = asUuid(
        (context as any).automation_run_id ||
        (context as any).runId ||
        workflow.executionId ||
        workflow.execution_id
      );
      const automationId = asUuid(
        (context as any).automation_id ||
        workflow.automationId ||
        workflow.id
      );

      let smsSendId: string | null = null;
      try {
        if (supabase && organizationId && (context.contact as any)?.id) {
          const { data: row, error: insertErr } = await supabase
            .from('sms_sends')
            .insert({
              organization_id: organizationId,
              contact_id: (context.contact as any).id,
              phone_number: phone,
              campaign_id: null,
              automation_id: automationId,
              automation_run_id: runId,
              flow_id: flowId,
              node_id: node?.id || null,
              message_body: smsBody,
              status: 'pending',
            })
            .select('id')
            .single();
          if (insertErr) {
            console.warn('[action_sms] sms_sends INSERT failed (proceeding):', insertErr);
          } else {
            smsSendId = row?.id || null;
          }
        }
      } catch (e) {
        console.warn('[action_sms] sms_sends prep failed (proceeding):', e);
      }

      const provider = credentials?.provider || credentials?.type || null;

      // UTM + identificação em todo link do SMS (configuração da loja do
      // envio; utm_medium=sms). Depois da linha criada, para o link levar
      // o worderSendID deste envio.
      let smsBodyToSend = smsBody;
      try {
        const { stampMessageLinks } = await import('@/lib/tracking/outbound-text');
        smsBodyToSend = await stampMessageLinks({
          text: smsBody,
          organizationId,
          storeId: (context as any).storeId || null,
          channel: 'sms',
          context: {
            messageType: 'automation',
            automationName: workflow.name || (context as any).automation_name || '',
            automationId,
            messageName: (node as any)?.data?.label || config.label || 'SMS',
            messageId: node?.id || null,
            sendId: smsSendId,
            contactId: (context.contact as any)?.id || null,
            storeName: (context as any)?.store?.name || null,
            storeDomain: (context as any)?.store?.domain || null,
          },
        });
        if (smsBodyToSend !== smsBody && supabase && smsSendId) {
          await supabase.from('sms_sends').update({ message_body: smsBodyToSend }).eq('id', smsSendId);
        }
      } catch { /* texto original segue */ }

      // Twilio integration path. Other providers (Zenvia, Vonage)
      // can plug in the same way — they all expose a single POST
      // endpoint that takes (to, from, body) and returns a message id.
      try {
        if (provider === 'twilio' && credentials?.accountSid && credentials?.authToken) {
          const from = credentials.fromNumber || credentials.from;
          const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
          const body = new URLSearchParams({
            To: phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`,
            From: from,
            Body: smsBodyToSend,
          });
          const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: body.toString(),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            if (supabase && smsSendId) {
              await supabase.from('sms_sends').update({
                status: 'failed',
                error_message: result.message || 'Twilio error',
              }).eq('id', smsSendId);
            }
            return { status: 'error', output: result, error: result.message || 'Falha no envio' };
          }
          if (supabase && smsSendId) {
            await supabase.from('sms_sends').update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              external_message_id: result.sid || null,
              metadata: { provider: 'twilio', raw: result },
            }).eq('id', smsSendId);
          }
          return {
            status: 'success',
            output: { sent: true, to: phone, provider: 'twilio', smsSendId, externalMessageId: result.sid },
          };
        }
      } catch (error: any) {
        if (supabase && smsSendId) {
          await supabase.from('sms_sends').update({
            status: 'failed',
            error_message: error.message,
          }).eq('id', smsSendId);
        }
        return { status: 'error', output: null, error: error.message };
      }

      // No provider configured — log the attempt and treat as a
      // stub send. The sms_sends row stays in 'pending' so the
      // History panel still shows "node executed" without claiming
      // a delivery that didn't happen. Attribution skips pending
      // rows (engagement is required, not just send).
      if (supabase && smsSendId) {
        await supabase.from('sms_sends').update({
          status: 'failed',
          error_message: 'SMS provider not configured',
        }).eq('id', smsSendId);
      }
      return {
        status: 'success',
        output: { sent: false, to: phone, smsSendId, message: 'SMS provider not configured' },
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
        // Preparar headers. A UI grava headers como STRING JSON — espalhar
        // uma string viraria chaves numéricas ('0': '{', ...). Parse antes.
        let extraHeaders: Record<string, string> = {};
        if (typeof config.headers === 'string') {
          try { extraHeaders = JSON.parse(config.headers || '{}'); } catch { extraHeaders = {}; }
        } else if (config.headers && typeof config.headers === 'object') {
          extraHeaders = config.headers;
        }
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...extraHeaders,
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
          `https://${domain}/admin/api/2026-04/customers/${customerId}.json`,
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
      if (!config.listId) {
        return { status: 'error', output: null, error: 'Nenhuma lista selecionada no nó' };
      }
      try {
        // Supabase não lança — sem checar o error, FK quebrada ou lista
        // apagada viravam "success" sem gravar nada.
        const { error } = await supabase.from('list_contacts').upsert({
          list_id: config.listId,
          contact_id: contactId,
          organization_id: organizationId,
        }, { onConflict: 'list_id,contact_id' });
        if (error) {
          return { status: 'error', output: null, error: `Falha ao adicionar à lista: ${error.message}` };
        }
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
      // defaultConfig do catálogo grava timeoutMinutes; fluxos antigos,
      // timeoutSeconds — aceitar os dois (senão era sempre 1h fixa).
      const timeoutSeconds =
        Number(config.timeoutSeconds) ||
        (Number(config.timeoutMinutes) ? Number(config.timeoutMinutes) * 60 : 0) ||
        3600;
      if (isTest) {
        return { status: 'success', output: { waiting: true, timeout_seconds: timeoutSeconds } };
      }
      try {
        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const conversationId = context.conversation_id || context.conversationId;
        if (!conversationId) {
          return { status: 'error', output: null, error: 'conversationId missing from context' };
        }
        const timeoutMs = timeoutSeconds * 1000;
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
        // defaultConfig do catálogo grava {targetType, targetId}; fluxos
        // antigos gravam agentId/queueId direto — aceitar os dois (sem
        // isso a transferência ia sem destino nenhum).
        const agentId = config.agentId || (config.targetType === 'agent' ? config.targetId : undefined);
        const queueId = config.queueId || (config.targetType === 'queue' ? config.targetId : undefined);
        const result = await transferConversation({
          conversationId,
          organizationId,
          toAgentId: agentId,
          toQueueId: queueId,
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

  // Toque de IA por missão — runtime Python (core/agentes-por-evento.md §3.2.2).
  // O NÓ PEDE, o offer engine DECIDE, a tool EXECUTA: este executor faz UMA
  // chamada (emit_ai_mission_job) e o resto acontece no runtime — missão
  // re-resolvida no consumo, Judge 1 pré-envio, preflight de momento no sender.
  // O nó guarda a FAMÍLIA do evento (mission_ref), nunca o texto do toque.
  action_ai_mission: {
    async execute({ node, config, context, organizationId, isTest }) {
      if (isTest) {
        return {
          status: 'success',
          output: { queued: true, event_family: config.eventFamily, test: true },
        };
      }
      try {
        const orgId = organizationId || (context as any).organization_id;
        const contactId = context.contact?.id;
        if (!orgId || !contactId) {
          return { status: 'error', output: null, error: 'organizationId ou contact.id ausente no contexto' };
        }
        if (!config.eventFamily) {
          return { status: 'error', output: null, error: 'eventFamily (mission_ref) não configurado no nó' };
        }

        // Delta do toque: só o que o nó pode refinar (§3.3.3 — restrição
        // acumula, permissão estreita; o teto de concessão é da MISSÃO).
        const delta: Record<string, any> = {};
        if (config.objective) delta.objective = config.objective;
        if (config.tone) delta.tone = config.tone;
        if (Array.isArray(config.forbidden) && config.forbidden.length) delta.forbidden = config.forbidden;
        if (config.context && typeof config.context === 'object') delta.context = { ...config.context };
        // O painel guarda variáveis como linhas {key, value} (editáveis, com
        // {{tags}} já interpoladas pela engine); linhas com chave vazia são
        // rascunho e não viajam. Valores viram string: é texto de prompt.
        if (Array.isArray(config.contextVars)) {
          const vars: Record<string, string> = {};
          for (const row of config.contextVars) {
            const key = typeof row?.key === 'string' ? row.key.trim() : '';
            if (!key) continue;
            vars[key] = String(row?.value ?? '');
          }
          if (Object.keys(vars).length) delta.context = { ...(delta.context ?? {}), ...vars };
        }

        // O benefício precisa de OBJETO para amarrar (grant é por carrinho/
        // checkout/pedido) — e o objeto é dado do GATILHO, não da config: o
        // nó configura o quê/quanto; o fluxo em execução diz de quem.
        let concession = config.concession ? { ...config.concession } : null;
        if (concession && !concession.object_ref) {
          const data = context.trigger?.data ?? {};
          const binding =
            data.cart_id ? { object_kind: 'cart', object_ref: String(data.cart_id) }
            : data.checkout_id ? { object_kind: 'checkout', object_ref: String(data.checkout_id) }
            : data.order_id ? { object_kind: 'order', object_ref: String(data.order_id) }
            : null;
          if (binding) {
            Object.assign(concession, binding);
          } else {
            // Sem objeto, o engine não emite: manda o toque sem benefício em
            // vez de um pedido que o runtime vai ignorar.
            concession = null;
          }
        }

        const { supabaseAdmin } = await import('@/lib/supabase-admin');
        const { data, error } = await supabaseAdmin.rpc('emit_ai_mission_job', {
          p_organization_id: orgId,
          p_contact_id: contactId,
          p_event_family: config.eventFamily,
          p_node_ref: `${context.workflow?.id ?? 'flow'}:${node.id}`,
          p_delta: delta,
          p_concession_request: concession,
          p_preferred_channel: config.preferredChannel || 'whatsapp',
          p_otel: null,
        });
        if (error) {
          return { status: 'error', output: null, error: error.message };
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || row.status !== 'queued') {
          // Caminho de erro do nó (§3.2.2-2): not_rolled_out /
          // no_active_mission / contact_not_found — o fluxo decide o desvio.
          return {
            status: 'error',
            output: row ?? null,
            error: `emit_ai_mission_job: ${row?.status ?? 'sem resposta'}`,
          };
        }
        return {
          status: 'success',
          output: {
            queued: true,
            conversation_id: row.conversation_id,
            msg_id: row.msg_id,
            event_family: config.eventFamily,
          },
        };
      } catch (error: any) {
        return { status: 'error', output: null, error: error.message };
      }
    },
  },

  // Ativar agente IA na conversa
  // DEPRECADO (D8, core/agentes-por-evento.md): fluxos NOVOS usam
  // action_ai_mission acima. Este executor fica vivo para fluxos antigos até
  // o pós-cutover; sai da palette na Etapa 7.
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
          `${META_BASE_URL}/${credentials?.phoneNumberId}/messages`,
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
        // Sem credencial explícita, usa a loja da automação (o engine põe
        // storeId no contexto) — antes o nó ia SEMPRE sem shopDomain/token.
        let shopDomain: string | undefined = credentials?.shopDomain;
        let accessToken: string | undefined = credentials?.accessToken;
        if ((!shopDomain || !accessToken) && context.storeId) {
          const { supabaseAdmin } = await import('@/lib/supabase-admin');
          const { data: store } = await supabaseAdmin
            .from('shopify_stores')
            .select('shop_domain, access_token')
            .eq('id', context.storeId)
            .eq('is_active', true)
            .maybeSingle();
          shopDomain = shopDomain || store?.shop_domain;
          accessToken = accessToken || store?.access_token;
        }
        if (!shopDomain || !accessToken) {
          return { status: 'error', output: null, error: 'Sem loja Shopify conectada para gerar o cupom (automação sem loja e nó sem credencial)' };
        }
        const result = await generateShopifyCoupon({
          shopDomain,
          accessToken,
          discountType: config.discountType || 'percentage',
          value: config.value || 10,
          // O catálogo grava expiryDays; fluxos antigos, validityDays.
          validityDays: config.validityDays || config.expiryDays || 7,
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
      if (!config.listId) {
        return { status: 'error', output: null, error: 'Nenhuma lista selecionada no nó' };
      }
      try {
        const { error } = await supabase
          .from('list_contacts')
          .delete()
          .eq('list_id', config.listId)
          .eq('contact_id', contactId)
          .eq('organization_id', organizationId);
        if (error) {
          return { status: 'error', output: null, error: `Falha ao remover da lista: ${error.message}` };
        }
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
      const value1 = resolveConditionValue(context, config.field);
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
      let chosenIndex = 0;
      for (let i = 0; i < variants.length; i++) {
        acc += Math.max(0, Number(variants[i].weight || 1));
        if (bucket <= acc) { chosen = variants[i]; chosenIndex = i; break; }
      }

      // O card do nó só expõe os handles 'true'/'false' (BaseNode), então
      // devolver o NOME da variante como branch não casava com handle
      // nenhum e o markSkippedBranches descartava os DOIS ramos — o fluxo
      // morria no randomizer. Primeira variante → 'true', demais → 'false';
      // o nome real continua no output para o histórico.
      return {
        status: 'success',
        output: { variant: chosen.name, variantIndex: chosenIndex, bucket, totalWeight },
        branch: chosenIndex === 0 ? 'true' : 'false',
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
        const value1 = resolveConditionValue(context, condition.field);
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
      // Accept both config shapes: the UI saves `keyword` (single string) and
      // `matchType`; older/programmatic flows use `keywords` (array) and `mode`.
      // Normalize both so the condition actually evaluates instead of always
      // returning false on an empty `keywords` array.
      let keywords: string[] = Array.isArray(config.keywords) ? config.keywords : [];
      if (keywords.length === 0 && typeof config.keyword === 'string' && config.keyword.trim()) {
        keywords = config.keyword.split(',').map((k: string) => k.trim()).filter(Boolean);
      }
      const mode = config.mode || config.matchType || 'contains'; // contains|equals|regex
      // No keyword configured → match any message (matches trigger semantics).
      if (keywords.length === 0) {
        return { status: 'success', output: { matched: true, message }, branch: 'true' };
      }

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
    async execute({ config, context, isTest, supabase, organizationId }) {
      // Cascade through every shape the editor might have saved the
      // delay in:
      //   config.delay.{value,unit}    — automation/index.tsx
      //   config.{value,unit}          — flow-builder PropertiesPanel
      //   config.{delayValue,delayUnit} — nodeTypes.ts defaultConfig
      //   config.{minutes,duration,amount} — legacy variants
      // Without this cascade, a flow configured as "3 minutos" silently
      // ran as "1 hour" (the parseInt(undefined)||1 + 'hours' default).
      const rawValue =
        config?.delay?.value ??
        config?.value ??
        config?.delayValue ??
        config?.minutes ??
        config?.duration ??
        config?.amount ??
        1;
      const value = parseInt(String(rawValue)) || 1;
      const unit =
        config?.delay?.unit ??
        config?.unit ??
        config?.delayUnit ??
        (config?.minutes != null ? 'minutes' : 'hours');

      const multipliers: Record<string, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
      };

      const delayMs = value * (multipliers[unit] || multipliers.hours);
      let resumeAt = new Date(Date.now() + delayMs);

      // As restrições de dia e de horário eram avaliadas com
      // getDay()/getHours()/setHours(), ou seja, no relógio do
      // SERVIDOR — que na Vercel é UTC. "Enviar só entre 09:00 e
      // 21:00" saía como 06:00 às 18:00 no Brasil, silenciosamente.
      // Agora a janela é sempre de um fuso explícito:
      //   'recipient' → fuso do contato (padrão da Omnisend)
      //   'store'     → fuso da loja/organização, igual para todos
      const restringeDias = Boolean(config.restrictDays) && config.allowedDays?.length > 0;
      const restringeHora = Boolean(config.restrictTime) && config.timeFrom && config.timeTo;

      if (restringeDias || restringeHora) {
        const { clampToSendWindow } = await import('@/lib/scheduling/timezone');
        const { resolveTimezoneForRun } = await import('@/lib/scheduling/resolve');

        const modo = config.timezoneMode === 'store' ? 'store' : 'recipient';
        const alvo = await resolveTimezoneForRun(supabase, {
          // No modo 'store' o contato é ignorado de propósito: o
          // lojista pediu UM horário, igual para a base inteira.
          contact: modo === 'recipient' ? context?.contact : undefined,
          storeId: (context as any)?.storeId,
          organizationId: organizationId || (context as any)?.organizationId,
        });

        let fromHour: number | undefined;
        let fromMinute = 0;
        let toHour: number | undefined;
        let toMinute = 0;
        if (restringeHora) {
          const [fh, fm] = String(config.timeFrom).split(':').map(Number);
          const [th, tm] = String(config.timeTo).split(':').map(Number);
          if (Number.isInteger(fh) && Number.isInteger(th)) {
            fromHour = fh; fromMinute = fm || 0;
            toHour = th; toMinute = tm || 0;
          }
        }

        // A UI grava os dias como 0=segunda … 6=domingo; o núcleo usa
        // a convenção do JS (0=domingo). Converter aqui evita que a
        // regra deslize um dia — o bug que fazia "só dias úteis"
        // liberar domingo e barrar sexta.
        const allowedWeekdays = restringeDias
          ? (config.allowedDays as number[]).map((d) => (d === 6 ? 0 : d + 1))
          : undefined;

        resumeAt = clampToSendWindow(resumeAt, alvo.timezone, {
          fromHour, fromMinute, toHour, toMinute, allowedWeekdays,
        });

        if (isTest) {
          return {
            status: 'success',
            output: {
              delay: `${value} ${unit}`,
              resumeAt: resumeAt.toISOString(),
              timezone: alvo.timezone,
              timezoneSource: alvo.source,
              test: true,
            },
          };
        }

        return {
          status: 'waiting',
          output: { delay: `${value} ${unit}`, timezone: alvo.timezone, timezoneSource: alvo.source },
          waitUntil: resumeAt,
        };
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
    async execute({ config, context, isTest, supabase, organizationId }) {
      let resumeAt: Date;
      let timezone: string | undefined;
      let timezoneSource: string | undefined;

      if (config.datetime) {
        // Instante absoluto escolhido no calendário: já vem com fuso
        // embutido, não há o que reinterpretar.
        resumeAt = new Date(config.datetime);
        if (isNaN(resumeAt.getTime())) {
          return { status: 'error', output: null, error: 'Data/hora inválida' };
        }
      } else if (config.time) {
        // "Espere até as 09:00" só quer dizer alguma coisa dentro de um
        // fuso. setHours() usava o do servidor (UTC na Vercel), então
        // 09:00 chegava como 06:00 no Brasil.
        const [hours, minutes] = String(config.time).split(':').map(Number);
        if (!Number.isInteger(hours)) {
          return { status: 'error', output: null, error: 'Horário inválido' };
        }
        const { nextOccurrenceInTz } = await import('@/lib/scheduling/timezone');
        const { resolveTimezoneForRun } = await import('@/lib/scheduling/resolve');

        const modo = config.timezoneMode === 'store' ? 'store' : 'recipient';
        const alvo = await resolveTimezoneForRun(supabase, {
          contact: modo === 'recipient' ? context?.contact : undefined,
          storeId: (context as any)?.storeId,
          organizationId: organizationId || (context as any)?.organizationId,
        });
        timezone = alvo.timezone;
        timezoneSource = alvo.source;
        resumeAt = nextOccurrenceInTz(alvo.timezone, hours, minutes || 0);
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
          output: { resumeAt: resumeAt.toISOString(), timezone, timezoneSource, test: true },
        };
      }

      return {
        status: 'waiting',
        output: { resumeAt: resumeAt.toISOString(), timezone, timezoneSource },
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

  // Exit node ("Sair") — removes the contact from the flow at this point.
  // Used on a condition branch (e.g. the "Não" path) to stop the journey
  // for contacts that shouldn't continue. The engine reads `exit: true`
  // and terminates the run after this node; downstream nodes are marked
  // skipped.
  control_exit: {
    async execute({ config }) {
      const reason =
        (typeof config?.reason === 'string' && config.reason.trim()) ||
        'Contato saiu do fluxo';
      return {
        status: 'success',
        output: { exited: true, reason },
        exit: true,
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

// Resolve um caminho de condição contra o contexto REAL de execução.
// A UI oferece caminhos como `event.total` e `contact.first_name`, mas o
// contexto montado pelos runners usa `trigger.data.*` e contato camelCase
// (firstName/lastName/createdAt) — sem estes aliases quase toda opção do
// dropdown de condição resolvia undefined e a condição caía sempre no
// ramo "não".
const CONTACT_FIELD_ALIASES: Record<string, string> = {
  first_name: 'firstName',
  last_name: 'lastName',
  created_at: 'createdAt',
  lifecycle_stage: 'lifecycleStage',
  total_orders: 'totalOrders',
  total_spent: 'totalSpent',
  last_order_at: 'lastOrderAt',
};

function resolveConditionValue(context: any, path: string): any {
  if (!path) return undefined;
  // 1) caminho literal
  let v = getNestedValue(context, path);
  if (v !== undefined) return v;
  // 2) event.* → trigger.data.* (mesmo alias do variable-engine)
  if (path.startsWith('event.')) {
    v = getNestedValue(context, `trigger.data.${path.slice('event.'.length)}`);
    if (v !== undefined) return v;
  }
  // 3) contact.snake_case → contact.camelCase
  if (path.startsWith('contact.')) {
    const field = path.slice('contact.'.length);
    const alias = CONTACT_FIELD_ALIASES[field];
    if (alias) {
      v = getNestedValue(context, `contact.${alias}`);
      if (v !== undefined) return v;
    }
  }
  // 4) campo solto → tenta no payload do gatilho
  if (!path.includes('.')) {
    v = getNestedValue(context, `trigger.data.${path}`);
    if (v !== undefined) return v;
  }
  return undefined;
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
