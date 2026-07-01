// =============================================
// Shopify Webhook Handler
// src/app/api/webhooks/shopify/route.ts
// 
// Recebe webhooks do Shopify e:
// 1. Cria/atualiza contatos
// 2. Cria deals na pipeline configurada
// 3. Move deals entre estágios
// 4. Emite eventos para automações
// 5. Registra atividades e enriquece dados
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { EventBus, EventType } from '@/lib/events';
import { syncContactFromShopify, updateContactOrderStats } from '@/lib/services/shopify/contact-sync';
import { createOrUpdateDealForContact, moveDealToStage, markDealAsWon } from '@/lib/services/shopify/deal-sync';
import { trackActivity, trackPurchase, enrichContactFromOrder } from '@/lib/services/shopify/activity-tracker';
import { executeAutomationRules, mapShopifyEventToTrigger } from '@/lib/services/automation/automation-executor';
import type { ShopifyStoreConfig, ShopifyCustomer } from '@/lib/services/shopify/types';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createEvent } from '@/lib/shopify/event-service';
import { WORDER_SHOPIFY_EVENTS, EVENT_SOURCES } from '@/lib/shopify/event-types';
import { markCheckoutRecovered } from '@/lib/services/shopify/jobs/abandoned-cart';
import { enrichContactAfterOrder } from '@/lib/shopify/profile-enricher';
import { scheduleRecomputeStoreTotals } from '@/lib/services/shopify/store-totals';
import { scheduleSegmentReeval } from '@/lib/segments/realtime';
export const dynamic = 'force-dynamic';

// ============================================
// HELPERS
// ============================================

// Map a Shopify webhook topic to the canonical event key the segment
// resolver understands. Returning null skips the reeval enqueue
// (e.g. 'app/uninstalled' doesn't trigger segment changes).
// What signals a webhook topic produces. The realtime segment worker
// matches segments by rule_dependencies, so a single order webhook
// must announce BOTH the placed_order event AND every contact field
// it touches — otherwise segments that depend on total_orders or
// lifecycle_stage never get reevaluated when an order is paid.
function topicToSignals(topic: string): string[] {
  // Fields recomputed by the totals worker after any order webhook
  // (orders/create, orders/paid, refunds, cancellations). Mirrors
  // contacts columns that scheduleRecomputeStoreTotals refreshes.
  const ORDER_FIELDS = [
    'field:total_orders',
    'field:total_spent',
    'field:average_order_value',
    'field:lifetime_value',
    'field:last_order_at',
    'field:first_order_at',
    'field:days_since_last_order',
    'field:order_frequency_days',
    'field:lifecycle_stage',
    'field:rfm_recency',
    'field:rfm_frequency',
    'field:rfm_monetary',
  ];
  switch (topic) {
    case 'orders/create':
    case 'orders/paid':
    case 'orders/cancelled':
    case 'orders/fulfilled':
    case 'orders/updated':
    case 'refunds/create':
      return ['event:placed_order', ...ORDER_FIELDS];
    case 'checkouts/create':
    case 'checkouts/update':
      return ['event:started_checkout'];
    case 'customers/create':
    case 'customers/update':
      return [
        'event:subscribed',
        'field:email',
        'field:phone',
        'field:first_name',
        'field:last_name',
        'field:country',
        'field:state',
        'field:city',
        'field:zip',
        'field:tags',
        'field:lifecycle_stage',
      ];
    case 'customers/email_marketing_consent/update':
      return [
        'field:is_subscribed_email',
        'field:email_consent_at',
      ];
    default:
      return [];
  }
}

// Best-effort lookup of the Worder contact_id from a Shopify webhook
// payload. We try shopify_customer_id first, then fall back to email.
// Returns null if no match (e.g. an order from a guest checkout with
// a brand-new email we haven't ingested yet — that's fine; the next
// orders/paid or customer/create will create the contact).
async function resolveContactFromTopic(
  supabase: any,
  store: any,
  topic: string,
  body: any,
): Promise<string | null> {
  const orgId = store.organization_id;
  // customer-flavored topics
  if (topic.startsWith('customers/')) {
    if (body?.id) {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('shopify_customer_id', String(body.id))
        .maybeSingle();
      if (data) return data.id;
    }
    if (body?.email) {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', String(body.email).toLowerCase())
        .maybeSingle();
      if (data) return data.id;
    }
    return null;
  }
  // order / checkout topics — payload's `customer.id` or top-level email
  const customer = body?.customer;
  if (customer?.id) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('shopify_customer_id', String(customer.id))
      .maybeSingle();
    if (data) return data.id;
  }
  const email = body?.email || customer?.email;
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', String(email).toLowerCase())
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

function extractNoteAttributes(noteAttributes: any[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(noteAttributes)) return result;
  for (const attr of noteAttributes) {
    if (attr?.name && attr?.value) result[attr.name] = String(attr.value);
  }
  return result;
}

function extractUtmFromNoteAttributes(attrs: Record<string, string>): Record<string, string> {
  const utm: Record<string, string> = {};
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const clickKeys = ['gclid', 'fbclid', 'ttclid', 'msclkid', 'fbc', 'fbp', 'ttp', 'vid'];
  for (const k of utmKeys) { if (attrs[k]) utm[k] = attrs[k]; }
  for (const k of clickKeys) { if (attrs[k]) utm[k] = attrs[k]; }
  return utm;
}

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {

  return getSupabaseAdmin();
}

// ============================================
// ATTRIBUTION SETTINGS CACHE
// ============================================
// Per-request cache so the inline attribution block and any
// multi-channel fanout within the same webhook invocation share a
// single DB roundtrip. The cache lives for the lifetime of the
// handler (one Lambda / Edge invocation) and is never shared across
// requests.
interface CachedAttributionSettings {
  email_window_days: number;
  whatsapp_window_days: number;
  sms_window_days: number;
  count_opens: boolean;
  exclude_mpp_opens: boolean;
  model: 'last_touch' | 'first_touch';
}

const ATTR_DEFAULTS: CachedAttributionSettings = {
  email_window_days: 5,
  whatsapp_window_days: 2,
  sms_window_days: 2,
  count_opens: true,
  exclude_mpp_opens: true,
  model: 'last_touch',
};

const attributionSettingsCache = new Map<string, CachedAttributionSettings>();

async function getAttributionSettings(orgId: string): Promise<CachedAttributionSettings> {
  const cached = attributionSettingsCache.get(orgId);
  if (cached) return cached;

  try {
    const supabase = getSupabase();
    const { data: org } = await supabase
      .from('organizations')
      .select('email_settings')
      .eq('id', orgId)
      .maybeSingle();
    const a = org?.email_settings?.attribution || {};
    const settings: CachedAttributionSettings = {
      email_window_days: Number(a.email_window_days) || ATTR_DEFAULTS.email_window_days,
      whatsapp_window_days: Number(a.whatsapp_window_days) || ATTR_DEFAULTS.whatsapp_window_days,
      sms_window_days: Number(a.sms_window_days) || ATTR_DEFAULTS.sms_window_days,
      count_opens: a.count_opens !== false,
      exclude_mpp_opens: a.exclude_mpp_opens !== false,
      model: a.model === 'first_touch' ? 'first_touch' : 'last_touch',
    };
    attributionSettingsCache.set(orgId, settings);
    return settings;
  } catch {
    return { ...ATTR_DEFAULTS };
  }
}

// ============================================
// HELPER: meta pro outbound webhook dispatcher
// ============================================
// O dispatcher em src/lib/webhooks/outbound-dispatcher.ts só dispara
// quando payload.data._webhook_dispatch_meta está presente. Este helper
// monta o meta consistente pra todos os emits de Shopify.
function buildShopifyWebhookMeta(
  store: ShopifyStoreConfig,
  sourceEventId: string
) {
  return {
    store_id: store.id,
    source: 'shopify',
    source_event_id: sourceEventId,
    store: {
      id: store.id,
      shop_domain: store.shop_domain,
      name: store.shop_name ?? store.shop_domain,
    },
  };
}

// ============================================
// VERIFICAÇÃO DE ASSINATURA
// ============================================

async function verifyShopifyWebhook(
  body: string,
  hmacHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!hmacHeader) return false;
  
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
    const generatedHmac = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    
    return generatedHmac === hmacHeader;
  } catch (error) {
    console.error('[Shopify Webhook] Signature verification error:', error);
    return false;
  }
}

// ============================================
// BUSCAR STORE CONFIG
// ============================================

async function getStoreConfig(shopDomain: string): Promise<ShopifyStoreConfig | null> {
  try {
    const supabase = getSupabase();
    // Match either the primary shop_domain OR any entry in
    // shop_domain_aliases. Shopify sends webhooks with the canonical
    // myshopifyDomain (the one assigned at shop creation) which can
    // differ from what the merchant entered during manual connection
    // — e.g. they typed "sourosa.myshopify.com" but Shopify sends
    // "lojalaclode.myshopify.com" because that's the original domain.
    // Without this OR, the original-domain webhooks return 410 Gone
    // and events silently drop.
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .or(`shop_domain.eq.${shopDomain},shop_domain_aliases.cs.{${shopDomain}}`)
      .eq('is_active', true)
      .maybeSingle();

    if (!store) return null;
    return mapStoreRowToConfig(store);
  } catch {
    return null;
  }
}

// Resolve by store_id directly — used when the webhook URL carries
// `?store_id=<id>` (set by install-extras when registering subscriptions).
// This is the bulletproof path: regardless of which myshopifyDomain
// Shopify sends in the header (canonical, alias, custom domain, even
// a typo'd one), the URL itself unambiguously identifies the store.
// Adapted from the AdTracked pattern.
async function getStoreConfigById(storeId: string): Promise<ShopifyStoreConfig | null> {
  try {
    const supabase = getSupabase();
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('is_active', true)
      .maybeSingle();
    if (!store) return null;
    return mapStoreRowToConfig(store);
  } catch {
    return null;
  }
}

function mapStoreRowToConfig(store: any): ShopifyStoreConfig {
  return {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    shop_name: store.shop_name,
    access_token: store.access_token,
    api_secret: store.api_secret,
    default_pipeline_id: store.default_pipeline_id,
    default_stage_id: store.default_stage_id,
    contact_type: store.contact_type || 'auto',
    auto_tags: store.auto_tags || ['shopify'],
    sync_orders: store.sync_orders ?? true,
    sync_customers: store.sync_customers ?? true,
    sync_checkouts: store.sync_checkouts ?? true,
    sync_refunds: store.sync_refunds ?? false,
    stage_mapping: store.stage_mapping || {},
    is_configured: store.is_configured ?? false,
    is_active: store.is_active ?? true,
    connection_status: store.connection_status || 'active',
  };
}

// ============================================
// PROCESSAR EVENTOS
// ============================================

async function processCustomerCreated(store: ShopifyStoreConfig, customer: any) {
  console.log(`[Shopify] Processing customer created: ${customer.email}`);
  
  if (!store.sync_customers) {
    console.log('[Shopify] Customer sync disabled, skipping');
    return;
  }
  
  // Criar contato usando nosso serviço
  const contact = await syncContactFromShopify(
    customer as ShopifyCustomer,
    store,
    'customer'
  );

  if (!contact) {
    console.log('[Shopify] Failed to create contact, skipping automation');
    return;
  }

  // Identity graph bridge — see comment in processCheckout for rationale.
  try {
    const { linkContactToIdentityByContactInfo } = await import('@/lib/identity/resolver');
    await linkContactToIdentityByContactInfo({
      organizationId: store.organization_id,
      contactId: contact.id,
      email: customer.email || null,
      phone: customer.phone || null,
      shopifyCustomerId: customer.id ? String(customer.id) : null,
    });
  } catch (idErr) {
    console.warn('[Shopify] identity graph bridge (customer) failed:', idErr);
  }

  // ======================================
  // EXECUTAR REGRAS DE AUTOMAÇÃO
  // ======================================
  const automationResult = await executeAutomationRules(
    store.organization_id,
    'shopify',
    'customer_created',
    contact.id,
    {
      customer_id: String(customer.id),
      customer_email: customer.email,
      customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      customer: customer,
      total_price: 0, // Novo cliente não tem valor ainda
      tags: customer.tags,
      accepts_marketing: customer.accepts_marketing,
    }
  );

  console.log(`[Shopify] Automation result for customer_created:`, automationResult);

  // NOTA: Removido createOrUpdateDealForContact automático para novos clientes
  // Deals são criados apenas via regras de automação ou quando há pedido

  // CDP: profile_created event
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contact?.id,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.PROFILE_CREATED,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        customer_id: String(customer.id),
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        accepts_marketing: customer.accepts_marketing,
        tags: customer.tags,
      },
      shopify_resource_id: String(customer.id),
      shopify_resource_type: 'customer',
      occurred_at: customer.created_at || new Date().toISOString(),
      idempotency_key: `profile_created:${customer.id}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (customer):', cdpError);
  }

  // Emitir evento para automações
  await EventBus.emit(EventType.CONTACT_CREATED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    email: customer.email,
    phone: customer.phone,
    data: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      accepts_marketing: customer.accepts_marketing,
      tags: customer.tags,
      source: 'shopify',
    },
    source: 'shopify',
  });

  // Emitir evento público customer.created pros outbound webhooks
  await EventBus.emit(EventType.CUSTOMER_CREATED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    email: customer.email,
    phone: customer.phone,
    data: {
      _webhook_dispatch_meta: buildShopifyWebhookMeta(
        store,
        `customer:${customer.id}`
      ),
      customer_id: contact?.id,
      shopify_customer_id: String(customer.id),
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      accepts_marketing: customer.accepts_marketing,
      tags: customer.tags,
    },
    source: 'shopify',
  });

  // Criar notificação
  const supabase = getSupabase();
  await supabase.from('notifications').insert({
    organization_id: store.organization_id,
    type: 'contact',
    title: 'Novo cliente do Shopify',
    message: `${customer.first_name || ''} ${customer.last_name || ''} (${customer.email}) foi adicionado.`,
    data: { contact_id: contact?.id, source: 'shopify' },
    is_read: false,
  });
}

async function processOrderCreated(store: ShopifyStoreConfig, order: any) {
  console.log(`[Shopify] Processing order created: ${order.order_number}`);
  
  if (!store.sync_orders) {
    console.log('[Shopify] Order sync disabled, skipping');
    return;
  }
  
  const supabase = getSupabase();
  
  // Extrair dados do cliente
  const customerData: ShopifyCustomer = {
    id: order.customer?.id || 0,
    email: order.email,
    phone: order.phone || order.customer?.phone,
    first_name: order.customer?.first_name || order.billing_address?.first_name || '',
    last_name: order.customer?.last_name || order.billing_address?.last_name || '',
    orders_count: order.customer?.orders_count || 1,
    total_spent: order.customer?.total_spent || order.total_price,
    tags: order.customer?.tags || '',
    accepts_marketing: order.customer?.accepts_marketing ?? false,
    created_at: order.customer?.created_at || order.created_at,
    updated_at: order.customer?.updated_at || order.created_at,
  };
  
  // Criar/atualizar contato
  const contact = await syncContactFromShopify(customerData, store, 'order');

  if (!contact) {
    console.error('[Shopify] Failed to create contact for order');
    return;
  }

  // Identity graph bridge — see processCheckout for rationale.
  try {
    const { linkContactToIdentityByContactInfo } = await import('@/lib/identity/resolver');
    await linkContactToIdentityByContactInfo({
      organizationId: store.organization_id,
      contactId: contact.id,
      email: order.email || order.customer?.email || null,
      phone: order.phone || order.customer?.phone || null,
      shopifyCustomerId: order.customer?.id ? String(order.customer.id) : null,
    });
  } catch (idErr) {
    console.warn('[Shopify] identity graph bridge (order) failed:', idErr);
  }

  // Se contato foi criado agora (customer não existia antes do pedido),
  // emitir customer.created pros outbound webhooks também. O handler
  // customers/create do Shopify pode não ter vindo ainda, ou nem vir.
  if (contact.isNew) {
    await EventBus.emit(EventType.CUSTOMER_CREATED, {
      organization_id: store.organization_id,
      contact_id: contact.id,
      email: order.email,
      phone: order.phone,
      data: {
        _webhook_dispatch_meta: buildShopifyWebhookMeta(
          store,
          `customer:${order.customer?.id ?? contact.id}`
        ),
        customer_id: contact.id,
        shopify_customer_id: order.customer?.id ? String(order.customer.id) : null,
        email: order.email,
        first_name: order.customer?.first_name,
        last_name: order.customer?.last_name,
        phone: order.phone,
      },
      source: 'shopify',
    });
  }

  // Auto-link anonymous pixel events to this contact by email.
  // Strategy: find sessions with matching email, then link events from those sessions only.
  if (contact.id && customerData.email) {
    try {
      const { data: orphanSessions } = await supabase
        .from('contact_sessions')
        .select('session_id')
        .is('contact_id', null)
        .ilike('email', customerData.email)
        .eq('organization_id', store.organization_id)
        .limit(50);

      const sessionIds = (orphanSessions || []).map((s: any) => s.session_id).filter(Boolean);

      if (sessionIds.length > 0) {
        await supabase
          .from('contact_sessions')
          .update({ contact_id: contact.id })
          .is('contact_id', null)
          .ilike('email', customerData.email)
          .eq('organization_id', store.organization_id);

        await supabase
          .from('contact_events')
          .update({ contact_id: contact.id })
          .is('contact_id', null)
          .in('session_id', sessionIds)
          .eq('organization_id', store.organization_id);

        console.log(`[Shopify] Linked ${sessionIds.length} orphan sessions to contact ${contact.id}`);
      }
    } catch (linkErr) {
      console.warn('[Shopify] Failed to link anonymous events:', linkErr);
    }
  }

  // Atualizar estatísticas do contato
  const orderValue = parseFloat(order.total_price || '0');
  await updateContactOrderStats(contact.id, orderValue);

  // ---- Revenue attribution: vincular receita à campanha de email ----
  // Se o contato clicou/abriu um email dentro da janela de atribuição
  // configurada, atribuir a receita do pedido àquela campanha.
  // Respeita: window days, model (last_touch/first_touch), count_opens,
  // e exclude_mpp_opens — tudo configurável em Settings > Atribuição.
  try {
    const attrSettings = await getAttributionSettings(store.organization_id);
    const windowDays = attrSettings.email_window_days;
    const windowDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Build list of qualifying event types based on engagement settings
    const eventTypes: string[] = ['email_clicked'];
    if (attrSettings.count_opens) {
      eventTypes.push('email_opened');
      // When excluding Apple MPP auto-opens, filter out events flagged
      // as machine-generated. If exclude_mpp_opens is off, all opens
      // qualify (including MPP).
    }

    // Query direction depends on the attribution model:
    //   last_touch  → most recent engagement first (ascending: false)
    //   first_touch → earliest engagement first (ascending: true)
    const ascending = attrSettings.model === 'first_touch';

    let query = supabase
      .from('contact_events')
      .select('properties')
      .eq('contact_id', contact.id)
      .eq('organization_id', store.organization_id)
      .in('event_type', eventTypes)
      .gte('occurred_at', windowDate)
      .order('occurred_at', { ascending })
      .limit(1);

    // When count_opens is on and exclude_mpp_opens is on, filter out
    // Apple MPP opens (flagged via properties->is_mpp = true).
    // We can't filter JSONB booleans via PostgREST easily, so we fetch
    // a small batch and filter in JS when MPP exclusion is active.
    let matchedEvent: any = null;
    if (attrSettings.count_opens && attrSettings.exclude_mpp_opens) {
      // Fetch a small batch so we can skip MPP-flagged opens
      const { data: candidates } = await supabase
        .from('contact_events')
        .select('properties, event_type')
        .eq('contact_id', contact.id)
        .eq('organization_id', store.organization_id)
        .in('event_type', eventTypes)
        .gte('occurred_at', windowDate)
        .order('occurred_at', { ascending })
        .limit(10);

      matchedEvent = (candidates || []).find((e: any) => {
        // Clicks always qualify
        if (e.event_type === 'email_clicked') return true;
        // Opens qualify only if not flagged as MPP
        if (e.properties?.is_mpp) return false;
        return true;
      }) || null;
    } else {
      const { data } = await query.maybeSingle();
      matchedEvent = data;
    }

    if (matchedEvent?.properties?.CampaignId) {
      const campaignId = matchedEvent.properties.CampaignId;
      // Incrementar attributed_revenue na campanha
      const { data: currentCamp } = await supabase
        .from('email_campaigns')
        .select('attributed_revenue, conversions')
        .eq('id', campaignId)
        .maybeSingle();
      if (currentCamp) {
        await supabase.from('email_campaigns').update({
          attributed_revenue: (currentCamp.attributed_revenue || 0) + orderValue,
          conversions: (currentCamp.conversions || 0) + 1,
        }).eq('id', campaignId);
      }
      // Gravar CDP event de conversion
      await supabase.from('contact_events').insert({
        organization_id: store.organization_id,
        contact_id: contact.id,
        store_id: store.id,
        event_type: 'email_conversion',
        event_source: 'worder_email',
        properties: {
          CampaignId: campaignId,
          order_id: order.id || order.order_number,
          order_value: orderValue,
          currency: order.currency || 'BRL',
          attribution_window_days: windowDays,
          attribution_model: attrSettings.model,
        },
        monetary_value: orderValue,
        currency: order.currency || 'BRL',
        occurred_at: new Date().toISOString(),
        idempotency_key: `email_conv:${campaignId}:${order.id || order.order_number}`,
      }).select().maybeSingle();
    }
  } catch (attrErr) {
    console.warn('[Shopify] Revenue attribution failed (non-critical):', attrErr);
  }

  // Salvar pedido no banco
  const { error: orderUpsertErr } = await supabase.from('shopify_orders').upsert({
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_order_id: String(order.id),
    shopify_order_number: String(order.order_number),
    contact_id: contact.id,
    customer_shopify_id: order.customer?.id ? String(order.customer.id) : null,
    email: order.email,
    phone: order.phone,
    total_price: orderValue,
    subtotal_price: parseFloat(order.subtotal_price || '0'),
    total_tax: parseFloat(order.total_tax || '0'),
    total_discounts: parseFloat(order.total_discounts || '0'),
    currency: order.currency,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    line_items: order.line_items,
    shipping_address: order.shipping_address,
    billing_address: order.billing_address,
    shopify_created_at: order.created_at,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'store_id,shopify_order_id',
  });
  if (orderUpsertErr) {
    console.error(`[Shopify] shopify_orders upsert FAILED for order ${order.id}:`, orderUpsertErr);
  }
  
  // Verificar se checkout existente foi convertido. Match por 3 chaves possíveis:
  // 1) order.checkout_id        (Shopify ID)
  // 2) order.checkout_token     (alternativa para gateway-based checkouts)
  // 3) email + pending status   (fallback para casos onde checkout_id não foi stored)
  const updateBase = {
    status: 'converted' as const,
    converted_order_id: String(order.id),
    converted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (order.checkout_id) {
    await supabase
      .from('shopify_checkouts')
      .update(updateBase)
      .eq('store_id', store.id)
      .eq('shopify_checkout_id', String(order.checkout_id));
  }
  if (order.checkout_token) {
    await supabase
      .from('shopify_checkouts')
      .update(updateBase)
      .eq('store_id', store.id)
      .eq('shopify_checkout_token', String(order.checkout_token))
      .in('status', ['pending', 'abandoned']);
  }

  // Mark any abandoned checkout by email as recovered/converted
  if (order.email) {
    await markCheckoutRecovered(store.id, order.email, String(order.id));
  }
  
  // ======================================
  // EXECUTAR REGRAS DE AUTOMAÇÃO
  // ======================================
  // NOTA: Removido createOrUpdateDealForContact duplicado
  // Agora só usa as regras de automação para criar deals
  const automationResult = await executeAutomationRules(
    store.organization_id,
    'shopify',
    'order_created',
    contact.id,
    {
      order_id: String(order.id),
      order_number: String(order.order_number),
      total_price: orderValue,
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      line_items: order.line_items,
      customer: order.customer,
      customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
    }
  );
  
  console.log(`[Shopify] Automation result for order_created:`, automationResult);
  
  // FALLBACK: Se nenhuma regra criou deal e tem pipeline padrão configurado
  if (automationResult.dealsCreated === 0 && store.default_pipeline_id) {
    console.log(`[Shopify] No automation rules matched, using default pipeline fallback`);
    await createOrUpdateDealForContact(
      contact.id,
      store,
      'new_order',
      orderValue,
      {
        shopify_order_id: order.id,
        order_number: order.order_number,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        line_items_count: order.line_items?.length || 0,
      }
    );
  }

  // ======================================
  // Multi-channel revenue attribution. Each channel uses its own
  // window from org settings (Settings → Atribuição). The Shopify
  // order might have been preceded by an email open, a WhatsApp
  // delivery, or an SMS click — we attribute to the most recent
  // engagement on each channel independently. Idempotent on
  // (org, order_id) so the orders/paid call later is a safe no-op.
  // ======================================
  if (orderValue > 0) {
    try {
      const { attributeAcrossChannels } = await import('@/lib/attribution');
      await attributeAcrossChannels({
        contactId: contact.id,
        organizationId: store.organization_id,
        orderId: String(order.id),
        orderValue,
      });
    } catch (attribErr) {
      console.error('[Shopify Webhook] Attribution failed (orders/create):', attribErr);
    }
  }

  // ======================================
  // TRACKING: Registrar atividade e enriquecer contato
  // ======================================
  try {
    // Registrar atividade de pedido
    await trackActivity({
      organizationId: store.organization_id,
      contactId: contact.id,
      type: 'order_placed',
      title: `Fez pedido #${order.order_number}`,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        total_price: orderValue,
        currency: order.currency,
        financial_status: order.financial_status,
        items_count: order.line_items?.length || 0,
      },
      source: 'shopify',
      sourceId: String(order.id),
    });
    
    // Salvar produtos comprados individualmente
    for (const item of (order.line_items || [])) {
      await trackPurchase({
        organizationId: store.organization_id,
        contactId: contact.id,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        orderDate: new Date(order.created_at),
        productId: item.product_id?.toString(),
        productTitle: item.title || item.name,
        productSku: item.sku,
        productVendor: item.vendor,
        productType: item.product_type,
        productImageUrl: item.image?.src,
        variantId: item.variant_id?.toString(),
        variantTitle: item.variant_title,
        quantity: item.quantity || 1,
        unitPrice: parseFloat(item.price || '0'),
        totalPrice: parseFloat(item.price || '0') * (item.quantity || 1),
        currency: order.currency,
      });
    }
    
    // Enriquecer contato com dados do pedido
    await enrichContactFromOrder(contact.id, {
      id: String(order.id),
      orderNumber: String(order.order_number),
      totalPrice: orderValue,
      lineItems: order.line_items || [],
      createdAt: new Date(order.created_at),
    });
    
    console.log(`[Shopify] ✅ Contact enriched with order data`);
  } catch (enrichError) {
    console.error('[Shopify] Failed to track/enrich:', enrichError);
    // Não falhar o webhook por causa do tracking
  }

  // ======================================
  // CDP: Criar eventos na contact_events
  // ======================================
  try {
    // Look up product images from shopify_products so Items have real ImageURL
    const orderProductIds = [...new Set(
      (order.line_items || []).map((li: any) => li.product_id ? String(li.product_id) : null).filter(Boolean)
    )] as string[]
    let productImageMap = new Map<string, { images: any[]; variants: any[] }>()
    if (orderProductIds.length > 0) {
      const { data: prods } = await supabase
        .from('shopify_products')
        .select('shopify_product_id, images, variants')
        .eq('store_id', store.id)
        .in('shopify_product_id', orderProductIds)
      if (prods) {
        for (const p of prods) {
          productImageMap.set(p.shopify_product_id, { images: p.images || [], variants: p.variants || [] })
        }
      }
    }

    // Evento placed_order
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contact.id,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.PLACED_ORDER,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        $value: orderValue,
        OrderId: String(order.id),
        OrderNumber: String(order.order_number),
        OrderDate: order.created_at || new Date().toISOString(),
        Currency: order.currency,
        FinancialStatus: order.financial_status,
        FulfillmentStatus: order.fulfillment_status,
        DiscountCodes: order.discount_codes || [],
        DiscountValue: parseFloat(order.total_discounts || '0'),
        SubtotalPrice: parseFloat(order.subtotal_price || '0'),
        TotalTax: parseFloat(order.total_tax || '0'),
        TotalShipping: (order.shipping_lines || []).reduce((sum: number, sl: any) => sum + parseFloat(sl.price || '0'), 0),
        ItemCount: order.line_items?.length || 0,
        'Customer Locale': order.customer_locale || 'pt-BR',
        Items: (order.line_items || []).map((item: any) => {
          const pid = item.product_id ? String(item.product_id) : ''
          const vid = item.variant_id ? String(item.variant_id) : ''
          const prodData = productImageMap.get(pid)
          let imageUrl = ''
          if (prodData) {
            const imgSrc = (img: any) => img?.src || img?.url || ''
            const variant = prodData.variants?.find((v: any) => String(v.id) === vid)
            const variantImgId = variant?.image_id
            const variantImg = variantImgId ? prodData.images?.find((img: any) => String(img.id) === String(variantImgId)) : null
            imageUrl = imgSrc(variantImg) || imgSrc(prodData.images?.[0]) || ''
          }
          return {
            ProductID: pid || undefined,
            SKU: item.sku,
            ProductName: item.title || item.name,
            Quantity: item.quantity || 1,
            ItemPrice: parseFloat(item.price || '0'),
            RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
            VariantName: item.variant_title,
            VariantID: vid || undefined,
            Brand: item.vendor,
            ImageURL: imageUrl,
            ProductURL: prodData ? `https://${store.shop_domain}/products/${item.product?.handle || ''}` : '',
            Categories: item.product?.product_type ? [item.product.product_type] : [],
          }
        }),
        ItemNames: (order.line_items || []).map((item: any) => item.title || item.name),
        Categories: [...new Set((order.line_items || []).map((item: any) => item.product?.product_type).filter(Boolean))],
        Collections: [...new Set((order.line_items || []).flatMap((item: any) => item.product?.tags?.split(',').map((t: string) => t.trim()) || []))],
        ShippingRate: order.shipping_lines?.[0]?.title || '',
        PaymentGateway: order.payment_gateway_names?.[0] || '',
        'Total Discounts': order.total_discounts || '0.00',
        'Source Name': order.source_name || 'web',
        BillingAddress: order.billing_address ? {
          FirstName: order.billing_address.first_name,
          LastName: order.billing_address.last_name,
          Address1: order.billing_address.address1,
          City: order.billing_address.city,
          Province: order.billing_address.province,
          Country: order.billing_address.country,
          Zip: order.billing_address.zip,
          Phone: order.billing_address.phone,
        } : undefined,
        ShippingAddress: order.shipping_address ? {
          FirstName: order.shipping_address.first_name,
          LastName: order.shipping_address.last_name,
          Address1: order.shipping_address.address1,
          City: order.shipping_address.city,
          Province: order.shipping_address.province,
          Country: order.shipping_address.country,
          Zip: order.shipping_address.zip,
          Phone: order.shipping_address.phone,
        } : undefined,
        Tags: order.tags ? (typeof order.tags === 'string' ? order.tags.split(',').map((t: string) => t.trim()) : order.tags) : [],
        SourceName: order.source_name || 'web',
        Note: order.note,
        ...((() => {
          const attrs = extractNoteAttributes(order.note_attributes);
          const utm = extractUtmFromNoteAttributes(attrs);
          return Object.keys(utm).length > 0 ? { UTM: utm } : {};
        })()),
        extra: {
          full_landing_site: order.landing_site || order.full_landing_site || '',
          referring_site: order.referring_site || '',
          token: order.token || '',
          webhook_id: order.webhook_id || '',
          checkout_token: order.checkout_token || '',
          order_status_url: order.order_status_url || '',
          browser_ip: order.browser_ip || order.client_details?.browser_ip || '',
          user_agent: order.client_details?.user_agent || '',
          cart_token: order.cart_token || '',
          confirmation_number: order.confirmation_number || '',
          note_attributes: order.note_attributes || [],
          line_items: order.line_items || [],
        },
        // Full raw Shopify webhook payload — every field accessible to
        // flow builder variables via {{ trigger.raw.<path> }}, matching
        // Omnisend/Klaviyo's "raw" pattern. Lets merchants reference
        // any Shopify field without us shipping a code change.
        raw: order,
      },
      monetary_value: orderValue,
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: order.created_at || new Date().toISOString(),
      idempotency_key: `placed_order:${order.id}`,
    });

    // Dispatch automation trigger with full event data
    try {
      const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
      await dispatchTrigger({
        organizationId: store.organization_id,
        storeId: store.id,
        triggerType: 'trigger_order',
        contactId: contact.id,
        triggerData: {
          event_type: 'placed_order',
          OrderId: String(order.id),
          OrderNumber: String(order.order_number),
          Value: orderValue,
          Currency: order.currency,
          ItemCount: order.line_items?.length || 0,
          Items: (order.line_items || []).map((item: any) => {
            const pid = item.product_id ? String(item.product_id) : ''
            const prodData = productImageMap.get(pid)
            const vid = item.variant_id ? String(item.variant_id) : ''
            let imageUrl = item.product?.images?.[0]?.src || ''
            if (prodData) {
              const imgSrc = (img: any) => img?.src || img?.url || ''
              const variant = prodData.variants?.find((v: any) => String(v.id) === vid)
              const variantImgId = variant?.image_id
              const variantImg = variantImgId ? prodData.images?.find((img: any) => String(img.id) === String(variantImgId)) : null
              imageUrl = imgSrc(variantImg) || imgSrc(prodData.images?.[0]) || imageUrl
            }
            const compareAt = item.compare_at_price || item.product?.variants?.[0]?.compare_at_price
            return {
              ProductID: pid || undefined,
              ProductName: item.title || item.name,
              Quantity: item.quantity || 1,
              ItemPrice: parseFloat(item.price || '0'),
              RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
              CompareAtPrice: compareAt ? parseFloat(compareAt) : null,
              ImageURL: imageUrl,
              ProductURL: item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : '',
              SKU: item.sku,
              VariantName: item.variant_title,
              VariantID: vid || undefined,
              Brand: item.vendor,
              Categories: item.product?.product_type ? [item.product.product_type] : [],
            }
          }),
          ItemNames: (order.line_items || []).map((item: any) => item.title || item.name),
          SubtotalPrice: parseFloat(order.subtotal_price || '0'),
          TotalDiscounts: parseFloat(order.total_discounts || '0'),
          DiscountCodes: order.discount_codes || [],
          FinancialStatus: order.financial_status || '',
          FulfillmentStatus: order.fulfillment_status || '',
          PaymentGateway: order.payment_gateway_names?.[0] || '',
          ShippingRate: order.shipping_lines?.[0]?.title || '',
          TotalTax: parseFloat(order.total_tax || '0'),
          TotalShipping: (order.shipping_lines || []).reduce((sum: number, sl: any) => sum + parseFloat(sl.price || '0'), 0),
          ShippingAddress: order.shipping_address ? {
            FirstName: order.shipping_address.first_name,
            LastName: order.shipping_address.last_name,
            Address1: order.shipping_address.address1,
            City: order.shipping_address.city,
            Province: order.shipping_address.province,
            Country: order.shipping_address.country,
            Zip: order.shipping_address.zip,
            Phone: order.shipping_address.phone,
          } : undefined,
          BillingAddress: order.billing_address ? {
            FirstName: order.billing_address.first_name,
            LastName: order.billing_address.last_name,
            City: order.billing_address.city,
            Country: order.billing_address.country,
          } : undefined,
          CustomerEmail: order.email || order.customer?.email,
          CustomerPhone: order.phone || order.customer?.phone,
          CustomerName: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '),
          order_status_url: order.order_status_url || '',
          SourceName: order.source_name || 'web',
          ReferringSite: order.referring_site || '',
          LandingSite: order.landing_site || '',
          BrowserIP: order.browser_ip || order.client_details?.browser_ip || '',
          UTM: extractUtmFromNoteAttributes(extractNoteAttributes(order.note_attributes)),
        },
        idempotencyKey: `trigger:placed_order:${order.id}`,
      });

      // Klaviyo-style first / repeat purchase split. Lookup the
      // contact's order count BEFORE this order; if 0 → first
      // purchase (welcome to "buyers"); if 1+ → repeat purchase
      // (loyalty / cross-sell flow). Both run alongside the generic
      // trigger_order so existing flows keep firing.
      try {
        const { count: priorOrders } = await supabase
          .from('shopify_orders')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contact.id)
          .eq('store_id', store.id)
          .neq('shopify_order_id', String(order.id));

        const purchaseTrigger = (priorOrders || 0) === 0
          ? 'trigger_first_purchase'
          : 'trigger_repeat_purchase';

        await dispatchTrigger({
          organizationId: store.organization_id,
          storeId: store.id,
          triggerType: purchaseTrigger,
          contactId: contact.id,
          triggerData: {
            event_type: purchaseTrigger === 'trigger_first_purchase' ? 'first_purchase' : 'repeat_purchase',
            OrderId: String(order.id),
            OrderNumber: String(order.order_number),
            Value: orderValue,
            Currency: order.currency,
            ItemCount: order.line_items?.length || 0,
            CustomerEmail: order.email || order.customer?.email,
            CustomerPhone: order.phone || order.customer?.phone,
            order_count: (priorOrders || 0) + 1,
          },
          idempotencyKey: `trigger:${purchaseTrigger}:${order.id}`,
        });
      } catch (firstRepeatErr) {
        console.warn('[Shopify] first/repeat purchase trigger dispatch failed:', firstRepeatErr);
      }
    } catch (dispatchErr) {
      console.warn('[Shopify] dispatchTrigger for placed_order failed (non-critical):', dispatchErr);
    }

    // Evento ordered_product per line item
    for (const item of (order.line_items || [])) {
      await createEvent({
        organization_id: store.organization_id,
        contact_id: contact.id,
        store_id: store.id,
        event_type: WORDER_SHOPIFY_EVENTS.ORDERED_PRODUCT,
        event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
        properties: {
          $value: parseFloat(item.price || '0') * (item.quantity || 1),
          OrderId: String(order.id),
          OrderNumber: String(order.order_number),
          ProductID: item.product_id ? String(item.product_id) : undefined,
          VariantID: item.variant_id ? String(item.variant_id) : undefined,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
          SKU: item.sku,
          VariantName: item.variant_title,
          Brand: item.vendor,
          Currency: order.currency,
          ImageURL: item.product?.images?.[0]?.src || item.product?.image?.src || '',
          ProductURL: item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : '',
          Categories: item.product?.product_type ? [item.product.product_type] : [],
          CompareAtPrice: item.product?.variants?.[0]?.compare_at_price || null,
        },
        monetary_value: parseFloat(item.price || '0') * (item.quantity || 1),
        currency: order.currency || 'BRL',
        shopify_resource_id: String(order.id),
        shopify_resource_type: 'order',
        occurred_at: order.created_at || new Date().toISOString(),
        idempotency_key: `ordered_product:${order.id}:${item.id || item.product_id}`,
      });
    }
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed:', cdpError);
  }

  // CDP: Enrich contact profile after order
  try {
    await enrichContactAfterOrder(contact.id, store.id);
  } catch (enrichError) {
    console.error('[Shopify Webhook] Profile enrichment failed:', enrichError);
  }

  // Emitir evento para automações
  await EventBus.emit(EventType.ORDER_CREATED, {
    organization_id: store.organization_id,
    contact_id: contact.id,
    order_id: order.id?.toString(),
    email: order.email,
    phone: order.phone,
    data: {
      _webhook_dispatch_meta: buildShopifyWebhookMeta(store, String(order.id)),
      order_id: String(order.id),
      order_number: order.order_number,
      total_price: orderValue,
      currency: order.currency,
      financial_status: order.financial_status,
      line_items: order.line_items,
    },
    source: 'shopify',
  });

  // Criar notificação
  await supabase.from('notifications').insert({
    organization_id: store.organization_id,
    type: 'order',
    title: 'Novo pedido do Shopify',
    message: `Pedido #${order.order_number} de ${order.email} - R$ ${orderValue.toFixed(2)}`,
    data: {
      order_id: order.id,
      order_number: order.order_number,
      contact_id: contact.id,
      value: orderValue,
    },
    is_read: false,
  });
}

async function processOrderPaid(store: ShopifyStoreConfig, order: any) {
  console.log(`[Shopify] Processing order paid: ${order.order_number}`);
  
  const supabase = getSupabase();
  
  // Atualizar pedido
  await supabase
    .from('shopify_orders')
    .update({ 
      financial_status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(order.id));
  
  // Buscar contato
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', store.organization_id)
    .eq('email', order.email)
    .maybeSingle();
  
  if (contact) {
    // Tracking: Registrar atividade
    await trackActivity({
      organizationId: store.organization_id,
      contactId: contact.id,
      type: 'order_paid',
      title: `Pagamento confirmado - Pedido #${order.order_number}`,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        total_price: parseFloat(order.total_price || '0'),
      },
      source: 'shopify',
      sourceId: String(order.id),
    });

    // Multi-channel revenue attribution. Same orchestrator as
    // orders/create — safe to call again because each channel's RPC
    // is idempotent on (org, order_id). orders/paid is the fallback
    // entry point for stores that use manual capture / COD where
    // orders/create runs before the order is actually paid.
    const orderValue = parseFloat(order.total_price || '0');
    if (orderValue > 0) {
      try {
        const { attributeAcrossChannels } = await import('@/lib/attribution');
        await attributeAcrossChannels({
          contactId: contact.id,
          organizationId: store.organization_id,
          orderId: String(order.id),
          orderValue,
        });
      } catch (attribErr) {
        console.error('[Shopify Webhook] Attribution failed (orders/paid):', attribErr);
      }
    }
    
    // ======================================
    // EXECUTAR REGRAS DE AUTOMAÇÃO
    // ======================================
    const automationResult = await executeAutomationRules(
      store.organization_id,
      'shopify',
      'order_paid',
      contact.id,
      {
        order_id: String(order.id),
        order_number: String(order.order_number),
        total_price: parseFloat(order.total_price || '0'),
        currency: order.currency,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        line_items: order.line_items,
        customer: order.customer,
        customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
      }
    );
    
    console.log(`[Shopify] Automation result for order_paid:`, automationResult);
    
    // Se nenhuma regra criou deal, usar sistema legado
    if (automationResult.dealsCreated === 0 && store.default_pipeline_id) {
      // Mover deal para estágio "pago" ou marcar como ganho
      await moveDealToStage(contact.id, store, 'paid');
    }
  }

  // CDP: Evento checkout_completed (order paid = checkout completed)
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contact?.id,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.CHECKOUT_COMPLETED,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        order_id: String(order.id),
        order_number: String(order.order_number),
        total_price: parseFloat(order.total_price || '0'),
        currency: order.currency,
        financial_status: 'paid',
        // Top-level shortcuts matching Klaviyo/Omnisend convention.
        OrderId: String(order.id),
        OrderNumber: order.order_number,
        Currency: order.currency,
        TotalPrice: parseFloat(order.total_price || '0'),
        SubtotalPrice: parseFloat(order.subtotal_price || '0'),
        TotalDiscounts: parseFloat(order.total_discounts || '0'),
        TotalTax: parseFloat(order.total_tax || '0'),
        DiscountCodes: (order.discount_codes || []).map((d: any) => d.code || d).filter(Boolean),
        PaymentGateway: (order.payment_gateway_names && order.payment_gateway_names[0]) || null,
        FinancialStatus: order.financial_status || null,
        ItemCount: (order.line_items || []).length,
        Items: (order.line_items || []).map((it: any) => ({
          ProductID: it.product_id ? String(it.product_id) : undefined,
          ProductName: it.title || it.name,
          Quantity: it.quantity || 1,
          ItemPrice: parseFloat(it.price || '0'),
          RowTotal: parseFloat(it.price || '0') * (it.quantity || 1),
          SKU: it.sku, VariantName: it.variant_title,
          VariantID: it.variant_id ? String(it.variant_id) : undefined,
          ImageURL: it.product?.product_image_urls?.[0] || it.product?.image?.src || '',
          ProductURL: it.product?.product_url || '',
          Brand: it.vendor,
        })),
        ItemNames: (order.line_items || []).map((it: any) => it.title || it.name).filter(Boolean),
        CustomerEmail: order.email || order.customer?.email || null,
        CustomerFirstName: order.customer?.first_name || order.billing_address?.first_name || null,
        CustomerLastName: order.customer?.last_name || order.billing_address?.last_name || null,
        BillingAddress: order.billing_address || null,
        ShippingAddress: order.shipping_address || null,
        // Full raw Shopify payload — flow variables via {{ trigger.raw.<path> }}
        raw: order,
      },
      monetary_value: parseFloat(order.total_price || '0'),
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: new Date().toISOString(),
      idempotency_key: `checkout_completed:${order.id}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (order_paid):', cdpError);
  }

  // Emitir evento
  await EventBus.emit(EventType.ORDER_PAID, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      _webhook_dispatch_meta: buildShopifyWebhookMeta(store, String(order.id)),
      order_id: String(order.id),
      order_number: order.order_number,
      total_price: parseFloat(order.total_price || '0'),
      currency: order.currency,
    },
    source: 'shopify',
  });
}

async function processOrderFulfilled(store: ShopifyStoreConfig, order: any) {
  console.log(`[Shopify] Processing order fulfilled: ${order.order_number}`);
  
  const supabase = getSupabase();
  
  // Atualizar pedido
  await supabase
    .from('shopify_orders')
    .update({ 
      fulfillment_status: 'fulfilled',
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(order.id));
  
  // Buscar contato
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', store.organization_id)
    .eq('email', order.email)
    .maybeSingle();
  
  if (contact) {
    // Tracking: Registrar atividade
    await trackActivity({
      organizationId: store.organization_id,
      contactId: contact.id,
      type: 'order_fulfilled',
      title: `Pedido enviado #${order.order_number}`,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        tracking_number: order.fulfillments?.[0]?.tracking_number,
        tracking_url: order.fulfillments?.[0]?.tracking_url,
        tracking_company: order.fulfillments?.[0]?.tracking_company,
      },
      source: 'shopify',
      sourceId: String(order.id),
    });
    
    // ======================================
    // EXECUTAR REGRAS DE AUTOMAÇÃO
    // ======================================
    const automationResult = await executeAutomationRules(
      store.organization_id,
      'shopify',
      'order_fulfilled',
      contact.id,
      {
        order_id: String(order.id),
        order_number: String(order.order_number),
        total_price: parseFloat(order.total_price || '0'),
        currency: order.currency,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        tracking_number: order.fulfillments?.[0]?.tracking_number,
        tracking_url: order.fulfillments?.[0]?.tracking_url,
        customer: order.customer,
        customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
      }
    );
    
    console.log(`[Shopify] Automation result for order_fulfilled:`, automationResult);
    
    // Se nenhuma regra criou deal, usar sistema legado
    if (automationResult.dealsCreated === 0 && store.default_pipeline_id) {
      // Mover deal para estágio "enviado"
      await moveDealToStage(contact.id, store, 'fulfilled');
    }
  }

  // CDP: fulfilled_order event
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contact?.id,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.FULFILLED_ORDER,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        $value: parseFloat(order.total_price || '0'),
        OrderId: String(order.id),
        OrderNumber: String(order.order_number),
        Currency: order.currency,
        'Customer Locale': order.customer_locale || 'pt-BR',
        ItemCount: order.line_items?.length || 0,
        Items: (order.line_items || []).map((item: any) => ({
          ProductID: item.product_id ? String(item.product_id) : undefined,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          SKU: item.sku,
          VariantName: item.variant_title,
          ImageURL: item.product?.images?.[0]?.src || '',
        })),
        ItemNames: (order.line_items || []).map((item: any) => item.title || item.name),
        TrackingNumber: order.fulfillments?.[0]?.tracking_number || null,
        TrackingUrl: order.fulfillments?.[0]?.tracking_url || null,
        TrackingCompany: order.fulfillments?.[0]?.tracking_company || null,
        FulfillmentStatus: order.fulfillment_status,
        ShippingAddress: order.shipping_address ? {
          City: order.shipping_address.city,
          Province: order.shipping_address.province,
          Country: order.shipping_address.country,
          Zip: order.shipping_address.zip,
        } : undefined,
        // Full raw payload — flow variables via {{ trigger.raw.<path> }}
        raw: order,
      },
      monetary_value: parseFloat(order.total_price || '0'),
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: new Date().toISOString(),
      idempotency_key: `fulfilled_order:${order.id}`,
    });
    // Dispatch fulfillment automation trigger
    if (contact?.id) {
      try {
        const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
        await dispatchTrigger({
          organizationId: store.organization_id,
          storeId: store.id,
          triggerType: 'trigger_fulfilled_order',
          contactId: contact.id,
          triggerData: {
            event_type: 'fulfilled_order',
            OrderId: String(order.id),
            OrderNumber: String(order.order_number),
            Value: parseFloat(order.total_price || '0'),
            Currency: order.currency,
            TrackingNumber: order.fulfillments?.[0]?.tracking_number || '',
            TrackingUrl: order.fulfillments?.[0]?.tracking_url || '',
            TrackingCompany: order.fulfillments?.[0]?.tracking_company || '',
            FulfillmentStatus: order.fulfillment_status || 'fulfilled',
            ItemCount: order.line_items?.length || 0,
            Items: (order.line_items || []).map((item: any) => ({
              ProductID: item.product_id ? String(item.product_id) : undefined,
              ProductName: item.title || item.name,
              Quantity: item.quantity || 1,
              ItemPrice: parseFloat(item.price || '0'),
              ImageURL: item.product?.images?.[0]?.src || '',
              SKU: item.sku,
            })),
            CustomerEmail: order.email || order.customer?.email,
            CustomerName: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '),
          },
          idempotencyKey: `trigger:fulfilled_order:${order.id}`,
        });
      } catch {}
    }
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (fulfilled):', cdpError);
  }

  // Emitir evento
  await EventBus.emit(EventType.ORDER_FULFILLED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      _webhook_dispatch_meta: buildShopifyWebhookMeta(store, String(order.id)),
      order_id: String(order.id),
      order_number: order.order_number,
      tracking_number: order.fulfillments?.[0]?.tracking_number,
      tracking_url: order.fulfillments?.[0]?.tracking_url,
      tracking_company: order.fulfillments?.[0]?.tracking_company,
    },
    source: 'shopify',
  });
}

async function processOrderCancelled(store: ShopifyStoreConfig, order: any) {
  console.log(`[Shopify] Processing order cancelled: ${order.order_number}`);
  
  const supabase = getSupabase();
  
  // Atualizar pedido
  await supabase
    .from('shopify_orders')
    .update({ 
      financial_status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(order.id));
  
  // Buscar contato e deal
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', store.organization_id)
    .eq('email', order.email)
    .maybeSingle();
  
  if (contact) {
    // Tracking: Registrar atividade
    await trackActivity({
      organizationId: store.organization_id,
      contactId: contact.id,
      type: 'order_cancelled',
      title: `Pedido cancelado #${order.order_number}`,
      description: order.cancel_reason ? `Motivo: ${order.cancel_reason}` : undefined,
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        total_price: parseFloat(order.total_price || '0'),
        cancel_reason: order.cancel_reason,
      },
      source: 'shopify',
      sourceId: String(order.id),
    });

    // Refund / cancellation handling — revoke the attributed revenue
    // across every channel that previously got credit. Klaviyo fires
    // a "Refunded Order" event for the same purpose; without this,
    // cancelled orders inflate every "Sales R$" tile forever.
    try {
      const { revokeAttributionAcrossChannels } = await import('@/lib/attribution');
      await revokeAttributionAcrossChannels({
        organizationId: store.organization_id,
        orderId: String(order.id),
      });
    } catch (revokeErr) {
      console.error('[Shopify Webhook] Attribution revoke failed:', revokeErr);
    }

    if (store.default_pipeline_id) {
      // Marcar deal como perdido
      const { data: deal } = await supabase
        .from('deals')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('pipeline_id', store.default_pipeline_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deal) {
        await supabase
          .from('deals')
          .update({
            status: 'lost',
            lost_reason: order.cancel_reason || 'Pedido cancelado no Shopify',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', deal.id);
      }
    }
  }

  // CDP: cancelled_order event
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contact?.id,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.CANCELLED_ORDER,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        $value: parseFloat(order.total_price || '0'),
        OrderId: String(order.id),
        OrderNumber: String(order.order_number),
        Currency: order.currency,
        'Customer Locale': order.customer_locale || 'pt-BR',
        CancelReason: order.cancel_reason || null,
        ItemCount: order.line_items?.length || 0,
        Items: (order.line_items || []).map((item: any) => ({
          ProductID: item.product_id ? String(item.product_id) : undefined,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          SKU: item.sku,
          VariantName: item.variant_title,
        })),
        ItemNames: (order.line_items || []).map((item: any) => item.title || item.name),
        FinancialStatus: order.financial_status,
        // Full raw payload — flow variables via {{ trigger.raw.<path> }}
        raw: order,
      },
      monetary_value: parseFloat(order.total_price || '0'),
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: order.cancelled_at || new Date().toISOString(),
      idempotency_key: `cancelled_order:${order.id}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (cancelled):', cdpError);
  }

  // Emitir evento
  await EventBus.emit(EventType.ORDER_CANCELLED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      _webhook_dispatch_meta: buildShopifyWebhookMeta(store, String(order.id)),
      order_id: String(order.id),
      order_number: order.order_number,
      cancel_reason: order.cancel_reason,
      total_price: parseFloat(order.total_price || '0'),
      currency: order.currency,
    },
    source: 'shopify',
  });
}

async function processCheckout(store: ShopifyStoreConfig, checkout: any) {
  console.log(`[Shopify] Processing checkout: ${checkout.token} (id=${checkout.id}, email=${checkout.email || 'none'})`);

  if (!store.sync_checkouts) {
    console.log('[Shopify] Checkout sync disabled, skipping');
    return;
  }

  const supabase = getSupabase();

  const checkoutKey = String(checkout.id || checkout.token);
  const recoveryUrl = checkout.abandoned_checkout_url || checkout.recovery_url || null;
  const safeFloat = (v: any) => {
    const n = parseFloat(v ?? '0');
    return isNaN(n) ? 0 : n;
  };

  // Preserve existing status on update: if the cron already marked this checkout
  // as 'abandoned' or 'converted', a late webhook update must NOT overwrite it
  // back to 'pending'. Without this check, the upsert would regress the status.
  const { data: existingRow } = await supabase
    .from('shopify_checkouts')
    .select('status')
    .eq('store_id', store.id)
    .eq('shopify_checkout_id', checkoutKey)
    .maybeSingle();

  const preservedStatus = existingRow?.status && existingRow.status !== 'pending'
    ? existingRow.status
    : 'pending';

  // Salvar checkout para detecção de abandono.
  // Escrevemos em ambas as colunas de URL (recovery_url + abandoned_checkout_url)
  // porque diferentes versões do schema usaram nomes distintos.
  // Extract email/phone from EVERY location Shopify might put them.
  // Different webhook payloads carry contact info in different places:
  //   - checkout.email (top-level — most common, but often null on the
  //     first checkouts/create before the customer types it)
  //   - checkout.customer.email (logged-in customer, present even when
  //     they haven't typed email in the checkout form)
  //   - checkout.contact_email (older API versions / draft orders)
  //   - checkout.billing_address.email (rare, but seen in some flows)
  //   - checkout.shipping_address.email (rarer still, but a real path)
  //
  // Without these fallbacks, every guest-checkout-with-Shopify-customer
  // and every payload variation looked "Desconhecido" in the recovery
  // dashboard even though Shopify clearly knew who the customer was.
  const resolvedEmail = checkout.email
    || checkout.customer?.email
    || checkout.contact_email
    || checkout.billing_address?.email
    || checkout.shipping_address?.email
    || null;
  const resolvedPhone = checkout.phone
    || checkout.customer?.phone
    || checkout.billing_address?.phone
    || checkout.shipping_address?.phone
    || null;
  const resolvedShopifyCustomerId = checkout.customer?.id
    ? String(checkout.customer.id)
    : null;
  const resolvedFirstName = checkout.billing_address?.first_name
    || checkout.shipping_address?.first_name
    || checkout.customer?.first_name
    || '';
  const resolvedLastName = checkout.billing_address?.last_name
    || checkout.shipping_address?.last_name
    || checkout.customer?.last_name
    || '';

  const checkoutRow: Record<string, any> = {
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_checkout_id: checkoutKey,
    shopify_checkout_token: checkout.token || null,
    email: resolvedEmail,
    phone: resolvedPhone,
    total_price: safeFloat(checkout.total_price),
    subtotal_price: safeFloat(checkout.subtotal_price),
    total_tax: safeFloat(checkout.total_tax),
    total_discounts: safeFloat(checkout.total_discounts),
    currency: checkout.currency || 'BRL',
    line_items: checkout.line_items || [],
    recovery_url: recoveryUrl,
    abandoned_checkout_url: recoveryUrl,
    status: preservedStatus,
    shopify_created_at: checkout.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('shopify_checkouts')
    .upsert(checkoutRow, { onConflict: 'store_id,shopify_checkout_id' });

  if (upsertErr) {
    console.error(`[Shopify] shopify_checkouts upsert FAILED for ${checkoutKey}:`, upsertErr);
    // Tenta novamente sem colunas que possam não existir em schemas antigos
    const fallbackRow: Record<string, any> = {
      store_id: checkoutRow.store_id,
      organization_id: checkoutRow.organization_id,
      shopify_checkout_id: checkoutRow.shopify_checkout_id,
      email: checkoutRow.email,
      phone: checkoutRow.phone,
      total_price: checkoutRow.total_price,
      currency: checkoutRow.currency,
      line_items: checkoutRow.line_items,
      status: preservedStatus,
      updated_at: checkoutRow.updated_at,
    };
    const { error: fallbackErr } = await supabase
      .from('shopify_checkouts')
      .upsert(fallbackRow, { onConflict: 'store_id,shopify_checkout_id' });
    if (fallbackErr) {
      console.error(`[Shopify] shopify_checkouts FALLBACK upsert also failed:`, fallbackErr);
    } else {
      console.log(`[Shopify] shopify_checkouts saved via fallback row for ${checkoutKey}`);
    }
  }

  // Resolve contact in priority order:
  //   1. By email (most reliable, matches guest checkouts and registered)
  //   2. By shopify_customer_id (catches logged-in customers even when
  //      they haven't typed an email yet on this particular checkout)
  // Either path lets us link the checkout, fire automations, and stop
  // showing "Desconhecido" in the recovery dashboard.
  let contactId: string | null = null;
  if (resolvedEmail || resolvedShopifyCustomerId) {
    const customerData: ShopifyCustomer = {
      id: resolvedShopifyCustomerId ? Number(resolvedShopifyCustomerId) : 0,
      email: resolvedEmail || '',
      phone: resolvedPhone || undefined,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      orders_count: 0,
      total_spent: '0',
      tags: '',
      accepts_marketing: false,
      created_at: checkout.created_at,
      updated_at: checkout.created_at,
    };

    try {
      const contact = await syncContactFromShopify(customerData, store, 'checkout');
      contactId = contact?.id || null;
    } catch (contactErr) {
      console.error(`[Shopify] syncContactFromShopify failed for checkout ${checkoutKey}:`, contactErr);
    }

    // Last-resort fallback: match by shopify_customer_id directly when
    // syncContactFromShopify didn't return a contact (e.g. it requires
    // an email and we only have the customer_id).
    if (!contactId && resolvedShopifyCustomerId) {
      const { data: byCustomer } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', store.organization_id)
        .eq('shopify_customer_id', resolvedShopifyCustomerId)
        .maybeSingle();
      contactId = byCustomer?.id || null;
    }

    // Bridge to identity graph: webhooks don't have browser signals so
    // they can't call resolveIdentity, but we DO have email / phone /
    // shopify_customer_id — enough to find any visitor_identities row
    // the pixel previously created for the same person. Linking now
    // triggers the standard alias backfill so historic anonymous
    // events (page_viewed / viewed_product / added_to_cart that fired
    // before the customer typed an email) get their contact_id
    // populated. Without this, the contact's timeline showed a hard
    // cutoff at "first webhook" — everything before it stayed orphaned
    // even when it was clearly the same person.
    if (contactId) {
      try {
        const { linkContactToIdentityByContactInfo } = await import('@/lib/identity/resolver');
        await linkContactToIdentityByContactInfo({
          organizationId: store.organization_id,
          contactId,
          email: resolvedEmail,
          phone: resolvedPhone,
          shopifyCustomerId: resolvedShopifyCustomerId,
        });
      } catch (idErr) {
        console.warn('[Shopify] identity graph bridge failed (non-fatal):', idErr);
      }
    }

    // Backfill: vincular contact_id no shopify_checkouts e em qualquer
    // contact_event órfão que já tenha sido criado para esse checkout.
    // Now also runs when we resolved by shopify_customer_id alone.
    if (contactId) {
      await supabase
        .from('shopify_checkouts')
        .update({ contact_id: contactId, updated_at: new Date().toISOString() })
        .eq('store_id', store.id)
        .eq('shopify_checkout_id', checkoutKey)
        .is('contact_id', null);

      await supabase
        .from('contact_events')
        .update({ contact_id: contactId })
        .eq('organization_id', store.organization_id)
        .eq('shopify_resource_id', checkoutKey)
        .eq('shopify_resource_type', 'checkout')
        .is('contact_id', null);

      // Backfill any waiting automation_runs that were dispatched from
      // the early checkouts/create webhook (before the customer typed
      // their email). The run still references this checkout via
      // metadata.trigger_data.checkout_token / CheckoutId — set its
      // contact_id so the History panel stops showing "Sem contato".
      try {
        await supabase
          .from('automation_runs')
          .update({ contact_id: contactId })
          .eq('organization_id', store.organization_id)
          .is('contact_id', null)
          .or(
            `metadata->trigger_data->>checkout_token.eq.${checkout.token || checkoutKey},` +
            `metadata->trigger_data->>CheckoutId.eq.${checkoutKey},` +
            `metadata->trigger_data->>cart_token.eq.${checkout.cart_token || checkout.token || ''}`
          );
      } catch (e) {
        console.warn('[Shopify] backfill automation_runs.contact_id failed:', e);
      }

      // Atividade visível na timeline do contato (lê de contact_activities)
      try {
        const itemsCount = checkout.line_items?.length || 0;
        const totalPrice = safeFloat(checkout.total_price);
        await trackActivity({
          organizationId: store.organization_id,
          contactId,
          type: 'checkout_started',
          title: itemsCount > 0
            ? `Iniciou checkout com ${itemsCount} item${itemsCount > 1 ? 'ns' : ''}`
            : 'Iniciou um checkout',
          description: totalPrice > 0
            ? `Valor: R$ ${totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            : undefined,
          metadata: {
            checkout_id: checkoutKey,
            checkout_token: checkout.token,
            total_price: totalPrice,
            currency: checkout.currency || 'BRL',
            items_count: itemsCount,
            recovery_url: recoveryUrl,
          },
          source: 'shopify',
          sourceId: checkoutKey,
        });
      } catch (actErr) {
        console.warn('[Shopify] trackActivity for checkout failed (non-critical):', actErr);
      }
    }
  }

  // CDP: checkout_started event
  try {
    const checkoutValue = parseFloat(checkout.total_price || checkout.subtotal_price || checkout.total_line_items_price || '0') || (checkout.line_items || []).reduce((sum: number, item: any) => sum + (parseFloat(item.price || '0') * (item.quantity || 1)), 0);
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contactId,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.CHECKOUT_STARTED,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        $value: checkoutValue,
        CheckoutId: String(checkout.id || checkout.token),
        CheckoutURL: checkout.abandoned_checkout_url || (checkout.token ? `https://${store.shop_domain}/checkouts/${checkout.token}` : null),
        Currency: checkout.currency,
        'Customer Locale': checkout.customer_locale || 'pt-BR',
        ItemCount: checkout.line_items?.length || 0,
        Items: (checkout.line_items || []).map((item: any) => ({
          ProductID: item.product_id ? String(item.product_id) : undefined,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
          SKU: item.sku,
          VariantName: item.variant_title,
          VariantID: item.variant_id ? String(item.variant_id) : undefined,
          Brand: item.vendor,
          ImageURL: item.product?.images?.[0]?.src || item.product?.image?.src || '',
          ProductURL: item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : '',
        })),
        ItemNames: (checkout.line_items || []).map((item: any) => item.title || item.name),
        'Discount Codes': checkout.discount_codes || [],
        'Total Discounts': checkout.total_discounts || '0.00',
        'Source Name': checkout.source_name || 'web',
        ShippingRate: checkout.shipping_lines?.[0]?.title || '',
        SubtotalPrice: parseFloat(checkout.subtotal_price || '0'),
        TotalTax: parseFloat(checkout.total_tax || '0'),
        TotalPrice: parseFloat(checkout.total_price || '0'),
        extra: {
          full_landing_site: checkout.landing_site || '',
          referring_site: checkout.referring_site || '',
          token: checkout.token || '',
          checkout_token: checkout.checkout_token || checkout.token || '',
          cart_token: checkout.cart_token || '',
          line_items: checkout.line_items || [],
        },
        // Full raw Shopify checkout payload — flow variables can reach
        // any field via {{ trigger.raw.<path> }}, matching Omnisend.
        raw: checkout,
      },
      monetary_value: checkoutValue,
      currency: checkout.currency || 'BRL',
      shopify_resource_id: String(checkout.id || checkout.token),
      shopify_resource_type: 'checkout',
      occurred_at: checkout.created_at || new Date().toISOString(),
      idempotency_key: `checkout_started:${checkout.id || checkout.token}`,
    });

    // Dispatch automation trigger with full checkout data.
    //
    // We dispatch UNCONDITIONALLY (no `if (contactId)` guard) so the
    // automation_runs row is always created and surfaces in the
    // automation history. Common case: Shopify fires checkouts/create
    // before the customer types their email (resolvedEmail=null →
    // contactId=null). With the guard, no run was created and the
    // merchant saw nothing in history. Without the guard, the run
    // exists, the worker can attempt to resolve email at send-time
    // (via the trigger data's CustomerEmail / raw.email / etc.), and
    // if still nothing, the run completes with output.skipped='no_email'
    // — visible in history with a clear reason.
    // Klaviyo / Omnisend pattern: dispatch the trigger immediately but
    // PARK the run in waiting state for the merchant-configured window
    // (default 30 min, settable per automation via
    // trigger_config.abandonTime). check-delayed-runs (every minute)
    // resumes the run after the wait — the engine evaluates
    // exit_conditions before each node, so if the customer completed
    // the purchase in the meantime the run is auto-cancelled. No
    // table-wide cron polling.
    try {
      const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
      const supabaseLocal = getSupabase();

      // Defensive email pull. checkouts/create may arrive before the
      // customer types their email; checkouts/update fires later with
      // it. Re-read shopify_checkouts (we just upserted it) so we always
      // pick the freshest email Shopify has shared with us. Then if we
      // still don't have a contactId, look the contact up here.
      let dispatchEmail: string | null = resolvedEmail || checkout.email || null;
      let dispatchContactId: string | null = contactId || null;
      const checkoutKey = String(checkout.id || checkout.token);
      try {
        const { data: existingCheckout } = await supabaseLocal
          .from('shopify_checkouts')
          .select('email, contact_id')
          .or(`shopify_checkout_id.eq.${checkoutKey},checkout_token.eq.${checkout.token || ''}`)
          .maybeSingle();
        if (!dispatchEmail && existingCheckout?.email) dispatchEmail = existingCheckout.email;
        if (!dispatchContactId && existingCheckout?.contact_id) dispatchContactId = existingCheckout.contact_id;
      } catch { /* best-effort */ }

      if (!dispatchContactId && dispatchEmail) {
        const { data: c } = await supabaseLocal
          .from('contacts')
          .select('id')
          .eq('organization_id', store.organization_id)
          .ilike('email', dispatchEmail)
          .maybeSingle();
        if (c?.id) dispatchContactId = c.id;
      }

      // Store-scope the bucketing query so delay buckets only include THIS
      // store's abandoned-checkout flows (+ org-wide NULL). Mirrors the
      // dispatchTrigger match; without it, buckets fan out cross-store.
      const { data: matchingAutos } = await supabaseLocal
        .from('automations')
        .select('id, trigger_config, store_id')
        .eq('organization_id', store.organization_id)
        .eq('trigger_type', 'trigger_checkout_abandoned')
        .eq('status', 'active')
        .or(`store_id.eq.${store.id},store_id.is.null`);

      const buckets = new Map<number, string[]>();
      for (const a of (matchingAutos as any[]) || []) {
        const cfg = a.trigger_config || {};
        const minutes = cfg.abandonUnit === 'hours'
          ? (cfg.abandonTime || 1) * 60
          : (cfg.abandonTime || 5);
        if (!buckets.has(minutes)) buckets.set(minutes, []);
        buckets.get(minutes)!.push(a.id);
      }

      // Email gate: Shopify fires checkouts/create immediately when the
      // customer lands on /checkouts (often before any contact info is
      // typed) and then checkouts/update repeatedly as they fill the
      // form. Dispatching on the first webhook leaves us with an orphan
      // run (contact_id=null, trigger_data.CustomerEmail empty) that
      // may execute its email node before the next webhook brings the
      // email via backfill. We defer until we have a way to email — a
      // resolved email or a shopify_customer_id. The next
      // checkouts/update with email will fire dispatch; idempotencyKey
      // prevents duplicate runs across all the webhooks for one
      // checkout. processCheckout has nothing useful left to do for
      // this webhook, so a plain return is fine.
      if (!dispatchEmail && !dispatchContactId) {
        console.log('[Shopify] checkout_abandoned dispatch DEFERRED — no email or customer_id yet, waiting for next checkouts/update', {
          checkoutId: checkoutKey,
          checkoutToken: checkout.token,
          matchingAutomations: (matchingAutos || []).length,
        });
        return;
      }

      const triggerData = {
        event_type: 'checkout_started',
        CheckoutId: String(checkout.id || checkout.token),
        CheckoutURL: checkout.abandoned_checkout_url || '',
        Value: checkoutValue,
        Currency: checkout.currency,
        ItemCount: checkout.line_items?.length || 0,
        Items: (checkout.line_items || []).map((item: any) => ({
          ProductID: item.product_id ? String(item.product_id) : undefined,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
          CompareAtPrice: item.compare_at_price ? parseFloat(item.compare_at_price) : null,
          ImageURL: item.product?.images?.[0]?.src || item.product?.image?.src || '',
          ProductURL: item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : '',
          SKU: item.sku,
          VariantName: item.variant_title,
          VariantID: item.variant_id ? String(item.variant_id) : undefined,
          Brand: item.vendor,
        })),
        ItemNames: (checkout.line_items || []).map((item: any) => item.title || item.name),
        SubtotalPrice: parseFloat(checkout.subtotal_price || '0'),
        TotalDiscounts: parseFloat(checkout.total_discounts || '0'),
        DiscountCodes: checkout.discount_codes || [],
        CustomerEmail: resolvedEmail || checkout.email,
        CustomerPhone: resolvedPhone || checkout.phone,
        ReferringSite: checkout.referring_site || '',
        LandingSite: checkout.landing_site || '',
        UTM: extractUtmFromNoteAttributes(extractNoteAttributes(checkout.note_attributes)),
        cart_token: checkout.cart_token || null,
        checkout_token: checkout.token || null,
      };

      // Default Started Checkout wait: 5 minutes (was 30; tightened for
      // testing — adjust per-automation via trigger_config.abandonTime).
      if (buckets.size === 0) {
        await dispatchTrigger({
          organizationId: store.organization_id,
          storeId: store.id,
          triggerType: 'trigger_checkout_abandoned',
          contactId: dispatchContactId,
          triggerData: { ...triggerData, CustomerEmail: dispatchEmail || triggerData.CustomerEmail },
          delayMinutes: 5,
          idempotencyKey: `trigger:checkout_abandoned:${checkout.id || checkout.token}`,
        });
      } else {
        for (const [delayMinutes] of buckets.entries()) {
          await dispatchTrigger({
            organizationId: store.organization_id,
            storeId: store.id,
            triggerType: 'trigger_checkout_abandoned',
            contactId: contactId || null,
            triggerData,
            delayMinutes,
            idempotencyKey: `trigger:checkout_abandoned:${checkout.id || checkout.token}:${delayMinutes}`,
          });
        }
      }
    } catch (dispatchErr) {
      console.warn('[Shopify] dispatchTrigger for checkout_abandoned failed:', dispatchErr);
    }
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (checkout):', cdpError);
  }
}

// ============================================
// NOVOS HANDLERS (Phase 2)
// ============================================

async function processRefundCreated(store: ShopifyStoreConfig, refund: any) {
  console.log(`[Shopify] Processing refund created for order: ${refund.order_id}`);

  const supabase = getSupabase();

  // Find contact by order
  const { data: orderRecord } = await supabase
    .from('shopify_orders')
    .select('contact_id, shopify_order_number')
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(refund.order_id))
    .maybeSingle();

  const contactId = orderRecord?.contact_id || null;
  const orderNumber = orderRecord?.shopify_order_number || refund.order_id;

  // Calculate refund total
  const refundAmount = refund.transactions?.reduce(
    (sum: number, t: any) => sum + parseFloat(t.amount || '0'),
    0
  ) || 0;

  // Tracking: Registrar atividade na timeline do contato
  if (contactId) {
    try {
      await trackActivity({
        organizationId: store.organization_id,
        contactId,
        type: 'order_refunded',
        title: `Reembolso no pedido #${orderNumber}`,
        description: `R$ ${refundAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${refund.note ? ` — ${refund.note}` : ''}`,
        metadata: {
          order_id: refund.order_id,
          refund_id: refund.id,
          refund_amount: refundAmount,
          currency: refund.currency || 'BRL',
          items_count: refund.refund_line_items?.length || 0,
        },
        source: 'shopify',
        sourceId: String(refund.id),
      });
    } catch (actErr) {
      console.warn('[Shopify] trackActivity for refund failed (non-critical):', actErr);
    }
  }

  // CDP event
  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contactId,
      store_id: store.id,
      event_type: WORDER_SHOPIFY_EVENTS.REFUNDED_ORDER,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        $value: refundAmount,
        OrderId: String(refund.order_id),
        RefundId: String(refund.id),
        Currency: refund.currency || 'BRL',
        Note: refund.note || '',
        ItemCount: refund.refund_line_items?.length || 0,
        Items: (refund.refund_line_items || []).map((rli: any) => ({
          ProductName: rli.line_item?.title || rli.line_item?.name,
          Quantity: rli.quantity,
          ItemPrice: parseFloat(rli.line_item?.price || '0'),
          SKU: rli.line_item?.sku,
          VariantName: rli.line_item?.variant_title,
          RefundAmount: parseFloat(rli.subtotal || '0'),
        })),
        ItemNames: (refund.refund_line_items || []).map((rli: any) => rli.line_item?.title || rli.line_item?.name),
        // Full raw payload — flow variables via {{ trigger.raw.<path> }}
        raw: refund,
      },
      monetary_value: refundAmount,
      currency: refund.currency || 'BRL',
      shopify_resource_id: String(refund.id),
      shopify_resource_type: 'refund',
      occurred_at: refund.created_at || new Date().toISOString(),
      idempotency_key: `refunded_order:${refund.id}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (refund):', cdpError);
  }
}

async function processFulfillmentEvent(store: ShopifyStoreConfig, fulfillment: any) {
  console.log(`[Shopify] Processing fulfillment: ${fulfillment.id} (status: ${fulfillment.status})`);

  const supabase = getSupabase();

  const { data: orderRecord } = await supabase
    .from('shopify_orders')
    .select('contact_id, shopify_order_number')
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(fulfillment.order_id))
    .maybeSingle();

  const contactId = orderRecord?.contact_id || null;
  const orderNumber = orderRecord?.shopify_order_number || fulfillment.order_id;

  const eventType = fulfillment.status === 'delivered'
    ? WORDER_SHOPIFY_EVENTS.SHIPMENT_DELIVERED
    : WORDER_SHOPIFY_EVENTS.SHIPMENT_CONFIRMED;

  // Tracking: Registrar atividade na timeline do contato
  if (contactId) {
    try {
      const isDelivered = fulfillment.status === 'delivered';
      await trackActivity({
        organizationId: store.organization_id,
        contactId,
        type: isDelivered ? 'order_fulfilled' : 'order_fulfilled',
        title: isDelivered
          ? `Pedido entregue #${orderNumber}`
          : `Envio confirmado #${orderNumber}`,
        description: fulfillment.tracking_number
          ? `Rastreio: ${fulfillment.tracking_company || ''} ${fulfillment.tracking_number}`
          : undefined,
        metadata: {
          order_id: fulfillment.order_id,
          fulfillment_id: fulfillment.id,
          status: fulfillment.status,
          tracking_number: fulfillment.tracking_number,
          tracking_url: fulfillment.tracking_url,
          tracking_company: fulfillment.tracking_company,
        },
        source: 'shopify',
        sourceId: String(fulfillment.id),
      });
    } catch (actErr) {
      console.warn('[Shopify] trackActivity for fulfillment failed (non-critical):', actErr);
    }
  }

  try {
    await createEvent({
      organization_id: store.organization_id,
      contact_id: contactId,
      store_id: store.id,
      event_type: eventType,
      event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
      properties: {
        order_id: String(fulfillment.order_id),
        fulfillment_id: String(fulfillment.id),
        status: fulfillment.status,
        tracking_number: fulfillment.tracking_number || null,
        tracking_url: fulfillment.tracking_url || null,
        tracking_company: fulfillment.tracking_company || null,
        // Klaviyo/Omnisend-style top-level + full raw
        OrderId: String(fulfillment.order_id),
        FulfillmentId: String(fulfillment.id),
        TrackingNumber: fulfillment.tracking_number || null,
        TrackingUrl: fulfillment.tracking_url || null,
        TrackingCompany: fulfillment.tracking_company || null,
        Status: fulfillment.status,
        ItemCount: (fulfillment.line_items || []).length,
        Items: (fulfillment.line_items || []).map((it: any) => ({
          ProductID: it.product_id ? String(it.product_id) : undefined,
          ProductName: it.title || it.name,
          Quantity: it.quantity || 1,
          SKU: it.sku, VariantName: it.variant_title,
        })),
        raw: fulfillment,
      },
      shopify_resource_id: String(fulfillment.id),
      shopify_resource_type: 'fulfillment',
      occurred_at: fulfillment.created_at || new Date().toISOString(),
      idempotency_key: `${eventType}:${fulfillment.id}:${fulfillment.status}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (fulfillment):', cdpError);
  }

  // Outbound: shipment.tracking_created (só se tracking_number presente)
  if (fulfillment.tracking_number) {
    await EventBus.emit(EventType.SHIPMENT_TRACKING_CREATED, {
      organization_id: store.organization_id,
      contact_id: contactId ?? undefined,
      order_id: String(fulfillment.order_id),
      data: {
        _webhook_dispatch_meta: buildShopifyWebhookMeta(
          store,
          `fulfillment:${fulfillment.id}`
        ),
        order_id: String(fulfillment.order_id),
        fulfillment_id: String(fulfillment.id),
        tracking_number: fulfillment.tracking_number,
        tracking_url: fulfillment.tracking_url ?? null,
        tracking_company: fulfillment.tracking_company ?? null,
        status: fulfillment.status,
      },
      source: 'shopify',
    });
  }
}

async function processMarketingConsentUpdate(store: ShopifyStoreConfig, customer: any) {
  console.log(`[Shopify] Processing marketing consent update: ${customer.email}`);

  const supabase = getSupabase();

  const emailConsent = customer.email_marketing_consent;
  if (!emailConsent) return;

  const isSubscribed = emailConsent.state === 'subscribed';

  // Update contact consent fields
  if (customer.email) {
    await supabase
      .from('contacts')
      .update({
        email_consent: isSubscribed,
        email_consent_at: emailConsent.consent_updated_at || new Date().toISOString(),
        email_consent_source: emailConsent.opt_in_level || 'shopify',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', store.organization_id)
      .ilike('email', customer.email);
  }

  // CDP event
  if (isSubscribed) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', store.organization_id)
      .ilike('email', customer.email || '')
      .maybeSingle();

    try {
      await createEvent({
        organization_id: store.organization_id,
        contact_id: contact?.id || null,
        store_id: store.id,
        event_type: WORDER_SHOPIFY_EVENTS.SUBSCRIBED_EMAIL,
        event_source: EVENT_SOURCES.SHOPIFY_WEBHOOK,
        properties: {
          email: customer.email,
          consent_state: emailConsent.state,
          opt_in_level: emailConsent.opt_in_level,
        },
        shopify_resource_id: String(customer.id),
        shopify_resource_type: 'customer',
        occurred_at: emailConsent.consent_updated_at || new Date().toISOString(),
        idempotency_key: `subscribed_email:${customer.id}:${emailConsent.consent_updated_at}`,
      });
    } catch (cdpError) {
      console.error('[Shopify Webhook] CDP event creation failed (consent):', cdpError);
    }
  }
}

async function processProductEvent(store: ShopifyStoreConfig, product: any, topic: string) {
  console.log(`[Shopify] Processing product event: ${topic} - ${product.title}`);

  const supabase = getSupabase();

  if (topic === 'products/delete') {
    await supabase
      .from('shopify_products')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .eq('shopify_product_id', String(product.id));
    return;
  }

  // Price-drop detection: capture the previous price BEFORE we upsert
  // so we can compare. If the new price is lower, fire trigger_price_drop
  // for every contact that viewed or added this product in the last
  // 30 days. Fire-and-forget so the webhook stays fast.
  const newPrice = product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null;
  let previousPrice: number | null = null;
  if (topic === 'products/update' && newPrice && newPrice > 0) {
    const { data: prev } = await supabase
      .from('shopify_products')
      .select('price')
      .eq('store_id', store.id)
      .eq('shopify_product_id', String(product.id))
      .maybeSingle();
    previousPrice = prev?.price ?? null;
  }

  // Upsert product
  // Strip HTML tags from body_html for plain-text description used in
  // emails. Keep both: html for templates that want rich copy, plain for
  // ones that want clean text (most cart-recovery email blocks).
  const bodyHtml: string | null = product.body_html || null;
  const plainDescription: string | null = bodyHtml
    ? String(bodyHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  // Collections come from a separate /admin/api/.../collects.json fetch
  // when product is synced by sync-now; the webhook payload itself
  // doesn't carry them, but if a future webhook does we accept it.
  const collections = Array.isArray(product.collections) ? product.collections : [];

  const productRow: Record<string, any> = {
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_product_id: String(product.id),
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: product.tags,
    status: product.status || 'active',
    variants: product.variants,
    images: product.images,
    body_html: bodyHtml,
    description: plainDescription,
    collections,
    price: product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null,
    updated_at: new Date().toISOString(),
  };
  // Resilient write: drop description/body_html/collections columns on
  // error if the schema migration hasn't been applied yet.
  function isMissingColumnErr(err: any, col: string): boolean {
    if (!err) return false;
    const code = err.code || '';
    const msg = String(err.message || '');
    if (code === 'PGRST204' || code === '42703') return msg.includes(col);
    return msg.includes(col) && (msg.includes('column') || msg.includes('schema cache'));
  }
  let attemptRow: Record<string, any> = { ...productRow };
  let productErr: any = null;
  for (const col of ['', 'body_html', 'description', 'collections']) {
    if (col && col in attemptRow) {
      const { [col]: _omit, ...rest } = attemptRow;
      attemptRow = rest;
    }
    const { error } = await supabase.from('shopify_products').upsert(attemptRow, { onConflict: 'store_id,shopify_product_id' });
    if (!error) { productErr = null; break; }
    productErr = error;
    const next = ['body_html', 'description', 'collections'].find(c => isMissingColumnErr(error, c) && c in attemptRow);
    if (!next) break;
    const { [next]: _omit2, ...rest } = attemptRow;
    attemptRow = rest;
  }
  if (productErr) {
    console.error(`[Shopify] shopify_products upsert FAILED for product ${product.id}:`, productErr);
  }

  // Fire-and-forget price drop dispatch. We don't await because
  // contact-event scanning can take seconds — Shopify gives us 5s
  // before retrying the webhook.
  if (previousPrice && newPrice && newPrice < previousPrice) {
    const dropPct = ((previousPrice - newPrice) / previousPrice) * 100;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: events } = await supabase
          .from('contact_events')
          .select('contact_id')
          .eq('organization_id', store.organization_id)
          .in('event_type', ['viewed_product', 'added_to_cart', 'checkout_started'])
          .contains('properties', { product_id: String(product.id) })
          .gte('occurred_at', since)
          .limit(2000);
        const uniqueContactIds: string[] = Array.from(
          new Set((events || []).map((e: any) => e.contact_id as string).filter(Boolean))
        );
        if (uniqueContactIds.length === 0) return;
        const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
        const today = new Date().toISOString().slice(0, 10);
        for (const cid of uniqueContactIds) {
          await dispatchTrigger({
            organizationId: store.organization_id,
            storeId: store.id,
            triggerType: 'trigger_price_drop',
            contactId: cid,
            triggerData: {
              event_type: 'price_drop',
              ProductID: String(product.id),
              ProductName: product.title,
              ProductURL: product.handle ? `https://${store.shop_domain}/products/${product.handle}` : '',
              OldPrice: previousPrice,
              NewPrice: newPrice,
              DiscountAmount: previousPrice - newPrice,
              DiscountPercent: Math.round(dropPct * 100) / 100,
              Items: [{
                ProductID: String(product.id),
                ProductName: product.title,
                ItemPrice: newPrice,
                CompareAtPrice: previousPrice,
              }],
              properties: {
                product_id: String(product.id),
                old_price: previousPrice,
                new_price: newPrice,
                discount_percent: dropPct,
              },
            },
            // Idempotent per (contact, product, day) — multiple webhook
            // updates the same day for the same product won't double-fire.
            idempotencyKey: `price_drop:${cid}:${product.id}:${today}`,
          }).catch((e) => console.error('[price_drop] dispatch failed:', e));
        }
        console.log(`[price_drop] product ${product.id} dropped ${dropPct.toFixed(1)}% — dispatched to ${uniqueContactIds.length} contact(s)`);
      } catch (e) {
        console.error('[price_drop] background error:', e);
      }
    })();
  }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Ler body raw para verificação
    const bodyText = await request.text();
    let body: any;
    
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 2. Headers do Shopify
    const topic = request.headers.get('X-Shopify-Topic');
    const shopDomain = request.headers.get('X-Shopify-Shop-Domain');
    const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
    const webhookId = request.headers.get('X-Shopify-Webhook-Id');

    console.log(`[Shopify Webhook] Received: ${topic} from ${shopDomain} (${webhookId})`);

    if (!topic || !shopDomain) {
      return NextResponse.json(
        { error: 'Missing Shopify headers' },
        { status: 400 }
      );
    }

    // 3. Buscar configuração da loja
    //
    // Prefer ?store_id=<id> from the query string when present —
    // install-extras registers webhooks with that param so the URL
    // itself unambiguously identifies the store. This is the
    // bulletproof path: works even when Shopify sends a myshopifyDomain
    // we haven't aliased yet, when the canonical domain changed, or
    // when the merchant has multiple stores under the same domain pattern.
    // Falls back to header-based shop_domain lookup for stores
    // registered before this URL pattern shipped.
    const queryStoreId = request.nextUrl.searchParams.get('store_id');
    let store = queryStoreId ? await getStoreConfigById(queryStoreId) : null;
    if (!store) store = await getStoreConfig(shopDomain);
    if (!store) {
      // Orphan webhook subscription — typically from a store that was
      // disconnected/deleted on our side without uninstalling our app on
      // Shopify, so Shopify keeps delivering events for it forever.
      // Returning 410 Gone makes Shopify auto-remove the subscription
      // after a handful of failed deliveries (~48h), permanently
      // stopping the noise without us needing valid credentials.
      //
      // Also persist the attempt to shopify_webhook_audit so the
      // diagnostic dashboard can show "Shopify is sending us X
      // deliveries from shop_domain Y but no matching store row exists
      // — was it deleted/inactivated?". The audit table doesn't require
      // a store_id (which we don't have here).
      console.log(`[Shopify Webhook] Orphan subscription, replying 410: ${shopDomain}`);
      try {
        await getSupabase().from('shopify_webhook_audit').insert({
          shop_domain: shopDomain,
          topic,
          webhook_id: webhookId,
          status: 'orphan_store',
          error_message: 'No active shopify_stores row matched this shop_domain. Reconnect the store or contact support.',
          received_at: new Date().toISOString(),
        });
      } catch { /* table may not exist yet — best-effort */ }
      return NextResponse.json({ error: 'Shop not registered' }, { status: 410 });
    }

    // 4. Verificar assinatura HMAC
    //    - Se api_secret existe no store, valida contra ele.
    //    - Caso contrário, tenta SHOPIFY_API_SECRET global (apps monolíticas).
    //    - Em produção sem nenhum secret → REJEITA (fail closed).
    //    - Em dev, permite passar para facilitar testes.
    //
    // Failures here used to silently 401 without any DB trace, which made
    // "webhooks aren't arriving" debugging impossible. We now record the
    // failed delivery in shopify_webhook_log so the diagnostic dashboard
    // can surface "X HMAC failures from this shop" to the merchant.
    const effectiveSecret = store.api_secret || process.env.SHOPIFY_API_SECRET || null;
    async function logRejectedDelivery(status: 'hmac_failed' | 'no_secret', errMsg: string) {
      if (!webhookId) return;
      try {
        await getSupabase().from('shopify_webhook_log').insert({
          store_id: store!.id,
          organization_id: store!.organization_id,
          webhook_id: webhookId,
          topic,
          shop_domain: shopDomain,
          shopify_resource_id: body?.id ? String(body.id) : null,
          status,
          error_message: errMsg,
          attempts: 1,
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        });
      } catch (e: any) {
        // Unique constraint violations are fine (duplicate delivery retry).
        if (e?.code !== '23505') console.error('[Shopify Webhook] log rejected delivery failed:', e);
      }
    }
    if (effectiveSecret) {
      const isValid = await verifyShopifyWebhook(bodyText, hmacHeader, effectiveSecret);
      if (!isValid) {
        console.error(`[Shopify Webhook] Invalid signature for store ${store.id}`);
        await logRejectedDelivery(
          'hmac_failed',
          `HMAC mismatch — api_secret ${store.api_secret ? 'from store row' : 'from SHOPIFY_API_SECRET env'} doesn't match the signature Shopify sent. Reconnect the store or update the secret.`
        );
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error(
        `[Shopify Webhook] No secret configured (store=${store.id}, shop=${shopDomain}) — REJECTING in production`
      );
      await logRejectedDelivery(
        'no_secret',
        'Store has no api_secret and SHOPIFY_API_SECRET env is unset — cannot verify HMAC.'
      );
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    } else {
      console.warn(
        `[Shopify Webhook] No secret configured for ${shopDomain} — allowing in DEV mode only`
      );
    }

    // 5. Verificar idempotência via shopify_webhook_log
    if (webhookId) {
      const supabase = getSupabase();

      // Check new webhook_log table first
      const { data: logEntry } = await supabase
        .from('shopify_webhook_log')
        .select('id, status')
        .eq('webhook_id', webhookId)
        .maybeSingle();

      if (logEntry) {
        console.log(`[Shopify Webhook] Duplicate webhook ignored: ${webhookId} (status: ${logEntry.status})`);
        return NextResponse.json({ success: true, message: 'Duplicate webhook' });
      }

      // Register in webhook_log (ignore unique constraint errors from race conditions)
      const { error: logInsertError } = await supabase.from('shopify_webhook_log').insert({
        store_id: store.id,
        organization_id: store.organization_id,
        webhook_id: webhookId,
        topic,
        shop_domain: shopDomain,
        shopify_resource_id: body.id ? String(body.id) : null,
        status: 'processing',
        attempts: 1,
        received_at: new Date().toISOString(),
      });
      if (logInsertError && logInsertError.code === '23505') {
        // Unique constraint violation — duplicate webhook, already handled above
        console.log(`[Shopify Webhook] Duplicate webhook_log insert ignored: ${webhookId}`);
        return NextResponse.json({ success: true, message: 'Duplicate webhook' });
      }

      // Also keep legacy shopify_webhook_events for backwards compat
      const { data: existing } = await supabase
        .from('shopify_webhook_events')
        .select('id')
        .eq('store_id', store.id)
        .eq('shopify_event_id', webhookId)
        .maybeSingle();

      if (existing) {
        console.log(`[Shopify Webhook] Duplicate event ignored (legacy): ${webhookId}`);
        return NextResponse.json({ success: true, message: 'Duplicate event' });
      }

      await supabase.from('shopify_webhook_events').insert({
        store_id: store.id,
        organization_id: store.organization_id,
        shopify_event_id: webhookId,
        topic,
        payload: body,
        status: 'processing',
        received_at: new Date().toISOString(),
      });
    }

    // 6. Processar por tipo de evento
    try {
      switch (topic) {
        case 'customers/create':
        case 'customers/update':
          await processCustomerCreated(store, body);
          break;
          
        case 'orders/create':
          await processOrderCreated(store, body);
          break;
          
        case 'orders/paid':
          await processOrderPaid(store, body);
          break;
          
        case 'orders/fulfilled':
          await processOrderFulfilled(store, body);
          break;
          
        case 'orders/cancelled':
          await processOrderCancelled(store, body);
          break;
          
        case 'checkouts/create':
        case 'checkouts/update':
          await processCheckout(store, body);
          break;
          
        case 'refunds/create':
          await processRefundCreated(store, body);
          break;

        case 'fulfillments/create':
        case 'fulfillments/update':
          await processFulfillmentEvent(store, body);
          break;

        case 'customers/delete': {
          console.log(`[Shopify Webhook] Customer deleted: ${body.id}`);
          // Marca contato como inativo / revoga consent / limpa shopify_customer_id.
          // NÃO deletamos o contato — preserva histórico de atividades para audit/LGPD.
          const supabase = getSupabase();
          const nowIso = new Date().toISOString();
          await supabase
            .from('contacts')
            .update({
              is_active: false,
              email_consent: false,
              sms_consent: false,
              whatsapp_consent: false,
              status: 'deleted_in_shopify',
              shopify_customer_id: null,
              updated_at: nowIso,
            })
            .eq('organization_id', store.organization_id)
            .eq('shopify_customer_id', String(body.id));
          break;
        }

        case 'customers/email_marketing_consent/update':
          await processMarketingConsentUpdate(store, body);
          break;

        case 'products/create':
        case 'products/update':
        case 'products/delete':
          await processProductEvent(store, body, topic);
          break;

        case 'app/uninstalled': {
          const supabase = getSupabase();
          await supabase
            .from('shopify_stores')
            .update({
              is_active: false,
              connection_status: 'disconnected',
              uninstalled_at: new Date().toISOString(),
              status: 'uninstalled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', store.id);
          break;
        }

        default:
          console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
      }

      // Nudge the store-totals cache after any topic that mutated
      // orders/customers/products. Klaviyo-style: ingest writes the
      // row, the aggregator pass rolls up the cache off the critical
      // path. Fire-and-forget so the webhook returns 200 fast.
      const totalsTopics = [
        'orders/create',
        'orders/paid',
        'orders/fulfilled',
        'orders/cancelled',
        'orders/updated',
        'orders/delete',
        'refunds/create',
        'customers/create',
        'customers/update',
        'customers/delete',
        'products/create',
        'products/update',
        'products/delete',
      ];
      if (totalsTopics.includes(topic)) {
        scheduleRecomputeStoreTotals(getSupabase(), store.id);
      }

      // Real-time segment membership: enqueue reevaluations for any
      // segments whose rule_dependencies match the signals this
      // webhook produces. A single order webhook fires the event AND
      // touches ~10 contact fields (totals, lifecycle, RFM), so we
      // batch all of them — the queue dedupes per (segment, contact).
      const signals = topicToSignals(topic);
      if (signals.length) {
        const contactId = await resolveContactFromTopic(getSupabase(), store, topic, body);
        if (contactId) {
          scheduleSegmentReeval(getSupabase(), {
            orgId: store.organization_id,
            contactId,
            reasons: signals,
          });
        }
      }

      // Marcar evento como processado
      if (webhookId) {
        const supabase = getSupabase();
        const processingTime = Date.now() - startTime;

        // Update webhook_log
        await supabase
          .from('shopify_webhook_log')
          .update({
            status: 'processed',
            processing_time_ms: processingTime,
            processed_at: new Date().toISOString(),
          })
          .eq('webhook_id', webhookId);

        // Update legacy table
        await supabase
          .from('shopify_webhook_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
          })
          .eq('store_id', store.id)
          .eq('shopify_event_id', webhookId);
      }
      
    } catch (processingError: any) {
      console.error(`[Shopify Webhook] Processing error:`, processingError);
      
      // Marcar evento como falho
      if (webhookId) {
        const supabase = getSupabase();
        const processingTime = Date.now() - startTime;

        // Update webhook_log
        await supabase
          .from('shopify_webhook_log')
          .update({
            status: 'failed',
            error_message: processingError.message,
            processing_time_ms: processingTime,
            processed_at: new Date().toISOString(),
          })
          .eq('webhook_id', webhookId);

        // Update legacy table
        await supabase
          .from('shopify_webhook_events')
          .update({
            status: 'failed',
            error_message: processingError.message,
            processed_at: new Date().toISOString(),
          })
          .eq('store_id', store.id)
          .eq('shopify_event_id', webhookId);
      }
      
      // Mesmo com erro, retornar 200 para não ficar retentando
      // O erro será tratado na reconciliação
    }

    const duration = Date.now() - startTime;
    console.log(`[Shopify Webhook] Completed in ${duration}ms`);

    return NextResponse.json({ success: true, duration });
    
  } catch (error: any) {
    console.error('[Shopify Webhook] Error:', error);
    // Retornar 200 mesmo com erro para evitar retentativas infinitas
    return NextResponse.json({ success: true, error: error.message });
  }
}

// GET para verificação de saúde
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'shopify-webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      customers: ['customers/create', 'customers/update'],
      orders: ['orders/create', 'orders/paid', 'orders/fulfilled', 'orders/cancelled'],
      checkouts: ['checkouts/create', 'checkouts/update'],
      app: ['app/uninstalled'],
    },
  });
}
