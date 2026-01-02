// =============================================
// Shopify Webhook Processor v2
// src/lib/services/shopify/webhook-processor.ts
//
// Atualizado para usar o sistema de automações
// por pipeline (RuleEngine)
// =============================================

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { 
  ShopifyStoreConfig, 
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyCheckout,
  WebhookProcessResult,
  ShopifyWebhookJob
} from './types';
import { 
  syncContactFromShopify, 
  updateContactOrderStats,
  addAbandonedCartTag 
} from './contact-sync';
import { 
  createOrUpdateDealForContact, 
  moveDealToStage,
  markDealAsWon 
} from './deal-sync';
import { 
  RuleEngine, 
  type EventData 
} from '../automation/rule-engine';

// Supabase client com service role

// =============================================
// Helper: Converte null para undefined
// =============================================
function toUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Processa webhook do Shopify que veio da fila
 */
export async function processShopifyWebhook(
  job: ShopifyWebhookJob
): Promise<WebhookProcessResult> {
  
  const { topic, payload, storeId, eventId } = job;
  
  console.log(`🔄 Processing Shopify webhook: ${topic} (event: ${eventId})`);
  
  try {
    // Buscar configuração da loja
    const store = await getStoreConfig(storeId);
    
    if (!store) {
      throw new Error(`Store not found: ${storeId}`);
    }
    
    if (!store.is_configured) {
      return { success: true, action: 'skipped_not_configured' };
    }
    
    // Processar baseado no tópico
    let result: WebhookProcessResult;
    
    switch (topic) {
      case 'customers/create':
      case 'customers/update':
        result = await handleCustomerEvent(payload, store, topic);
        break;
      
      case 'orders/create':
        result = await handleOrderCreate(payload, store);
        break;
      
      case 'orders/paid':
        result = await handleOrderPaid(payload, store);
        break;
      
      case 'orders/fulfilled':
        result = await handleOrderFulfilled(payload, store);
        break;
      
      case 'orders/cancelled':
        result = await handleOrderCancelled(payload, store);
        break;
      
      case 'checkouts/create':
      case 'checkouts/update':
        result = await handleCheckoutEvent(payload, store);
        break;
      
      case 'app/uninstalled':
        result = await handleAppUninstalled(store);
        break;
      
      default:
        result = { success: true, action: `ignored_unknown_topic: ${topic}` };
    }
    
    await markEventProcessed(eventId);
    return result;
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`❌ Error processing webhook ${topic}:`, err);
    await markEventFailed(eventId, errorMessage);
    return { success: false, action: 'error', error: errorMessage };
  }
}

// =============================================
// Event Handlers
// =============================================

async function handleCustomerEvent(
  customer: ShopifyCustomer,
  store: ShopifyStoreConfig,
  topic: string
): Promise<WebhookProcessResult> {
  
  if (!store.sync_customers) {
    return { success: true, action: 'skipped_customers_disabled' };
  }
  
  const contact = await syncContactFromShopify(customer, store, 'customer');
  
  // Processar regras de automação para customers/create
  if (topic === 'customers/create') {
    const eventData: EventData = {
      contact_id: contact.id,
      contact_name: contact.name,
      contact_email: toUndefined(customer.email),
      contact_phone: toUndefined(customer.phone),
      customer_tags: customer.tags?.split(',').map(t => t.trim()) || [],
      source_id: String(customer.id),
    };
    
    const results = await RuleEngine.processCreationRules(
      store.organization_id,
      'shopify',
      'customer_created',
      eventData
    );
    
    console.log(`[Webhook] Automation results for customer_created:`, results);
    
    const createdDeal = results.find(r => r.action === 'deal_created');
    if (createdDeal) {
      return {
        success: true,
        action: 'customer_created',
        contactId: contact.id,
        dealId: createdDeal.deal_id,
      };
    }
  }
  
  // Fallback: lógica anterior
  if (contact.isNew && store.default_pipeline_id) {
    const hasRules = await hasAutomationRules(store.organization_id, 'shopify', 'customer_created');
    
    if (!hasRules) {
      const deal = await createOrUpdateDealForContact(
        contact.id,
        store,
        'new_customer',
        0,
        { shopify_customer_id: customer.id }
      );
      
      return {
        success: true,
        action: topic === 'customers/create' ? 'customer_created' : 'customer_updated',
        contactId: contact.id,
        dealId: toUndefined(deal.id),
      };
    }
  }
  
  return {
    success: true,
    action: topic === 'customers/create' ? 'customer_created' : 'customer_updated',
    contactId: contact.id,
  };
}

async function handleOrderCreate(
  order: ShopifyOrder,
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  if (!store.sync_orders) {
    return { success: true, action: 'skipped_orders_disabled' };
  }
  
  const customerData = order.customer || {
    id: 0,
    email: order.email,
    phone: order.phone,
    first_name: order.billing_address?.first_name || '',
    last_name: order.billing_address?.last_name || '',
    orders_count: 1,
    tags: '',
    total_spent: '0',
    accepts_marketing: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  const contact = await syncContactFromShopify(customerData, store, 'order');
  const orderValue = parseFloat(order.total_price || '0');
  
  await updateContactOrderStats(contact.id, orderValue);
  
  if (order.checkout_id) {
    await markCheckoutConverted(store.id, order.checkout_id);
  }
  
  const savedOrder = await saveOrder(order, store, contact.id);
  
  // Processar regras de automação
  const eventData: EventData = {
    contact_id: contact.id,
    contact_name: contact.name,
    contact_email: toUndefined(order.email),
    contact_phone: toUndefined(order.phone),
    order_id: String(order.id),
    order_number: String(order.order_number),
    order_value: orderValue,
    customer_tags: order.customer?.tags?.split(',').map(t => t.trim()) || [],
    product_ids: order.line_items?.map(li => String(li.product_id)) || [],
    source_id: String(order.id),
  };
  
  const results = await RuleEngine.processCreationRules(
    store.organization_id,
    'shopify',
    'order_created',
    eventData
  );
  
  console.log(`[Webhook] Automation results for order_created:`, results);
  
  const createdDeal = results.find(r => r.action === 'deal_created');
  let dealId: string | undefined;
  
  if (createdDeal) {
    dealId = createdDeal.deal_id;
  } else {
    const hasRules = await hasAutomationRules(store.organization_id, 'shopify', 'order_created');
    
    if (!hasRules && store.default_pipeline_id) {
      const deal = await createOrUpdateDealForContact(
        contact.id,
        store,
        'new_order',
        orderValue,
        {
          shopify_order_id: order.id,
          order_number: order.order_number,
          financial_status: order.financial_status,
        }
      );
      dealId = toUndefined(deal.id);
    }
  }
  
  await createNotification(store, 'new_order', {
    title: `Novo pedido: R$ ${orderValue.toFixed(2)}`,
    message: `${contact.name || 'Cliente'} fez um pedido`,
    order_id: savedOrder?.id,
    contact_id: contact.id,
    value: orderValue,
  });
  
  return {
    success: true,
    action: 'order_created',
    contactId: contact.id,
    dealId,
    orderId: toUndefined(savedOrder?.id),
  };
}

async function handleOrderPaid(
  order: ShopifyOrder,
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  if (!store.sync_orders) {
    return { success: true, action: 'skipped_orders_disabled' };
  }
  
  await supabase
    .from('shopify_orders')
    .update({ 
      financial_status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id);
  
  const { data: orderRecord } = await supabase
    .from('shopify_orders')
    .select('contact_id')
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id)
    .maybeSingle();
  
  const contactId = orderRecord?.contact_id as string | undefined;
  const orderValue = parseFloat(order.total_price || '0');
  
  // Processar regras de automação
  const eventData: EventData = {
    contact_id: contactId,
    contact_email: toUndefined(order.email),
    contact_phone: toUndefined(order.phone),
    order_id: String(order.id),
    order_number: String(order.order_number),
    order_value: orderValue,
    customer_tags: order.customer?.tags?.split(',').map(t => t.trim()) || [],
    product_ids: order.line_items?.map(li => String(li.product_id)) || [],
    source_id: String(order.id),
  };
  
  await RuleEngine.processCreationRules(
    store.organization_id,
    'shopify',
    'order_paid',
    eventData
  );
  
  await RuleEngine.processStageTransitions(
    store.organization_id,
    'shopify',
    'order_paid',
    eventData
  );
  
  // Fallback
  const hasRules = await hasTransitionRules(store.organization_id, 'shopify', 'order_paid');
  
  if (!hasRules && contactId) {
    await markDealAsWon(contactId, store, {
      paid_at: new Date().toISOString(),
      financial_status: 'paid',
    });
  }
  
  return {
    success: true,
    action: 'order_paid',
    contactId,
  };
}

async function handleOrderFulfilled(
  order: ShopifyOrder,
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  await supabase
    .from('shopify_orders')
    .update({ 
      fulfillment_status: order.fulfillment_status || 'fulfilled',
      updated_at: new Date().toISOString(),
    })
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id);
  
  const { data: orderRecord } = await supabase
    .from('shopify_orders')
    .select('contact_id')
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id)
    .maybeSingle();
  
  const contactId = orderRecord?.contact_id as string | undefined;
  
  const eventData: EventData = {
    contact_id: contactId,
    contact_email: toUndefined(order.email),
    order_id: String(order.id),
    order_number: String(order.order_number),
    order_value: parseFloat(order.total_price || '0'),
    source_id: String(order.id),
  };
  
  await RuleEngine.processStageTransitions(
    store.organization_id,
    'shopify',
    'order_fulfilled',
    eventData
  );
  
  const hasRules = await hasTransitionRules(store.organization_id, 'shopify', 'order_fulfilled');
  
  if (!hasRules && contactId) {
    await moveDealToStage(contactId, store, 'fulfilled');
  }
  
  return {
    success: true,
    action: 'order_fulfilled',
    contactId,
  };
}

async function handleOrderCancelled(
  order: ShopifyOrder,
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  await supabase
    .from('shopify_orders')
    .update({ 
      financial_status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id);
  
  const { data: orderRecord } = await supabase
    .from('shopify_orders')
    .select('contact_id')
    .eq('shopify_order_id', String(order.id))
    .eq('store_id', store.id)
    .maybeSingle();
  
  const contactId = orderRecord?.contact_id as string | undefined;
  
  const eventData: EventData = {
    contact_id: contactId,
    contact_email: toUndefined(order.email),
    order_id: String(order.id),
    order_number: String(order.order_number),
    order_value: parseFloat(order.total_price || '0'),
    source_id: String(order.id),
  };
  
  await RuleEngine.processStageTransitions(
    store.organization_id,
    'shopify',
    'order_cancelled',
    eventData
  );
  
  const hasRules = await hasTransitionRules(store.organization_id, 'shopify', 'order_cancelled');
  
  if (!hasRules && contactId && store.default_pipeline_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', store.default_pipeline_id)
      .eq('status', 'open')
      .maybeSingle();
    
    if (deal) {
      await supabase
        .from('deals')
        .update({ 
          status: 'lost',
          lost_reason: 'Pedido cancelado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deal.id);
    }
  }
  
  return {
    success: true,
    action: 'order_cancelled',
    contactId,
  };
}

async function handleCheckoutEvent(
  checkout: ShopifyCheckout,
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  if (!store.sync_checkouts) {
    return { success: true, action: 'skipped_checkouts_disabled' };
  }
  
  if (!checkout.email && !checkout.phone) {
    return { success: true, action: 'skipped_no_contact_info' };
  }
  
  if (checkout.completed_at) {
    return { success: true, action: 'skipped_already_completed' };
  }
  
  const savedCheckout = await saveCheckout(checkout, store);
  
  const customerData: ShopifyCustomer = {
    id: checkout.customer?.id || 0,
    email: checkout.email,
    phone: checkout.phone,
    first_name: checkout.billing_address?.first_name || checkout.customer?.first_name || '',
    last_name: checkout.billing_address?.last_name || checkout.customer?.last_name || '',
    orders_count: 0,
    tags: '',
    total_spent: '0',
    accepts_marketing: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  const contact = await syncContactFromShopify(customerData, store, 'checkout');
  
  if (savedCheckout?.id) {
    await supabase
      .from('shopify_checkouts')
      .update({ contact_id: contact.id })
      .eq('id', savedCheckout.id);
  }
  
  return {
    success: true,
    action: 'checkout_saved',
    contactId: contact.id,
    checkoutId: toUndefined(savedCheckout?.id),
  };
}

/**
 * Processa checkout abandonado (chamado pelo cron job)
 */
export async function handleAbandonedCheckout(
  checkout: ShopifyCheckout & { contact_id: string },
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  const checkoutValue = parseFloat(checkout.total_price || '0');
  
  const eventData: EventData = {
    contact_id: checkout.contact_id,
    contact_email: toUndefined(checkout.email),
    contact_phone: toUndefined(checkout.phone),
    checkout_id: String(checkout.id),
    order_value: checkoutValue,
    product_ids: checkout.line_items?.map(li => String(li.product_id)) || [],
    source_id: `checkout_${checkout.id}`,
  };
  
  const results = await RuleEngine.processCreationRules(
    store.organization_id,
    'shopify',
    'checkout_abandoned',
    eventData
  );
  
  console.log(`[Webhook] Automation results for checkout_abandoned:`, results);
  
  const createdDeal = results.find(r => r.action === 'deal_created');
  
  if (!createdDeal) {
    const hasRules = await hasAutomationRules(store.organization_id, 'shopify', 'checkout_abandoned');
    
    if (!hasRules) {
      // Função aceita apenas 1 argumento
      await addAbandonedCartTag(checkout.contact_id);
    }
  }
  
  return {
    success: true,
    action: 'checkout_abandoned',
    contactId: checkout.contact_id,
    dealId: createdDeal?.deal_id,
  };
}

async function handleAppUninstalled(
  store: ShopifyStoreConfig
): Promise<WebhookProcessResult> {
  
  await supabase
    .from('shopify_stores')
    .update({ 
      is_active: false,
      connection_status: 'disconnected',
      status_message: 'App desinstalado pelo usuário',
      updated_at: new Date().toISOString(),
    })
    .eq('id', store.id);
  
  console.log(`📦 App uninstalled for store: ${store.shop_domain}`);
  
  return {
    success: true,
    action: 'app_uninstalled',
  };
}

// =============================================
// Helper: Verificar regras
// =============================================

async function hasAutomationRules(
  organizationId: string,
  sourceType: string,
  triggerEvent: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('pipeline_automation_rules')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source_type', sourceType)
      .eq('trigger_event', triggerEvent)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle();
    
    return !!data;
  } catch {
    return false;
  }
}

async function hasTransitionRules(
  organizationId: string,
  sourceType: string,
  triggerEvent: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('pipeline_stage_transitions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source_type', sourceType)
      .eq('trigger_event', triggerEvent)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle();
    
    return !!data;
  } catch {
    return false;
  }
}

// =============================================
// Database Operations
// =============================================

async function getStoreConfig(storeId: string): Promise<ShopifyStoreConfig | null> {
  const { data, error } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('id', storeId)
    .single();
  
  if (error || !data) return null;
  
  return {
    id: data.id,
    organization_id: data.organization_id,
    shop_domain: data.shop_domain,
    shop_name: data.shop_name,
    access_token: data.access_token,
    api_secret: data.api_secret,
    default_pipeline_id: data.default_pipeline_id,
    default_stage_id: data.default_stage_id,
    contact_type: data.contact_type || 'auto',
    auto_tags: data.auto_tags || ['shopify'],
    sync_orders: data.sync_orders ?? true,
    sync_customers: data.sync_customers ?? true,
    sync_checkouts: data.sync_checkouts ?? true,
    sync_refunds: data.sync_refunds ?? false,
    stage_mapping: data.stage_mapping || {},
    is_configured: data.is_configured ?? false,
    is_active: data.is_active ?? true,
    connection_status: data.connection_status || 'active',
  };
}

async function saveOrder(
  order: ShopifyOrder,
  store: ShopifyStoreConfig,
  contactId: string
): Promise<{ id: string } | null> {
  
  const { data, error } = await supabase
    .from('shopify_orders')
    .upsert({
      store_id: store.id,
      organization_id: store.organization_id,
      shopify_order_id: String(order.id),
      shopify_order_number: String(order.order_number),
      contact_id: contactId,
      customer_shopify_id: order.customer?.id ? String(order.customer.id) : null,
      email: order.email,
      phone: order.phone,
      total_price: parseFloat(order.total_price || '0'),
      subtotal_price: parseFloat(order.subtotal_price || '0'),
      total_tax: parseFloat(order.total_tax || '0'),
      total_discounts: parseFloat(order.total_discounts || '0'),
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      line_items: order.line_items,
      shopify_created_at: order.created_at,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_id,shopify_order_id',
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to save order:', error);
    return null;
  }
  
  return data;
}

async function saveCheckout(
  checkout: ShopifyCheckout,
  store: ShopifyStoreConfig
): Promise<{ id: string } | null> {
  
  const { data, error } = await supabase
    .from('shopify_checkouts')
    .upsert({
      store_id: store.id,
      organization_id: store.organization_id,
      shopify_checkout_id: String(checkout.id),
      shopify_checkout_token: checkout.token,
      email: checkout.email,
      phone: checkout.phone,
      customer_shopify_id: checkout.customer?.id ? String(checkout.customer.id) : null,
      total_price: parseFloat(checkout.total_price || '0'),
      subtotal_price: parseFloat(checkout.subtotal_price || '0'),
      currency: checkout.currency,
      line_items: checkout.line_items,
      recovery_url: checkout.abandoned_checkout_url,
      status: 'pending',
      shopify_created_at: checkout.created_at,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_id,shopify_checkout_id',
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Failed to save checkout:', error);
    return null;
  }
  
  return data;
}

async function markCheckoutConverted(
  storeId: string,
  checkoutId: number
): Promise<void> {
  await supabase
    .from('shopify_checkouts')
    .update({ 
      status: 'converted',
      converted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', storeId)
    .eq('shopify_checkout_id', String(checkoutId));
}

async function markEventProcessed(eventId: string): Promise<void> {
  await supabase
    .from('shopify_webhook_events')
    .update({ 
      status: 'processed',
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);
}

async function markEventFailed(eventId: string, errorMessage: string): Promise<void> {
  await supabase
    .from('shopify_webhook_events')
    .update({ 
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);
}

async function createNotification(
  store: ShopifyStoreConfig,
  type: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await supabase
      .from('notifications')
      .insert({
        organization_id: store.organization_id,
        type: `shopify_${type}`,
        title: data.title,
        message: data.message,
        data: data,
        is_read: false,
      });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}
