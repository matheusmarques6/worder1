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
export const dynamic = 'force-dynamic';

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {

  return getSupabaseAdmin();
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
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('shop_domain', shopDomain)
      .eq('is_active', true)
      .single();
    
    if (!store) return null;
    
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
  } catch {
    return null;
  }
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
  
  // Atualizar estatísticas do contato
  const orderValue = parseFloat(order.total_price || '0');
  await updateContactOrderStats(contact.id, orderValue);
  
  // Salvar pedido no banco
  await supabase.from('shopify_orders').upsert({
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
  
  // Verificar se checkout existente foi convertido
  if (order.checkout_id) {
    await supabase
      .from('shopify_checkouts')
      .update({
        status: 'converted',
        converted_order_id: String(order.id),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store.id)
      .eq('shopify_checkout_id', String(order.checkout_id));
  }

  // Mark any abandoned checkout as recovered
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
        Currency: order.currency,
        FinancialStatus: order.financial_status,
        FulfillmentStatus: order.fulfillment_status,
        DiscountCodes: order.discount_codes || [],
        DiscountValue: parseFloat(order.total_discounts || '0'),
        SubtotalPrice: parseFloat(order.subtotal_price || '0'),
        TotalTax: parseFloat(order.total_tax || '0'),
        ItemCount: order.line_items?.length || 0,
        'Customer Locale': order.customer_locale || 'pt-BR',
        Items: (order.line_items || []).map((item: any) => ({
          ProductID: item.product_id ? String(item.product_id) : undefined,
          SKU: item.sku,
          ProductName: item.title || item.name,
          Quantity: item.quantity || 1,
          ItemPrice: parseFloat(item.price || '0'),
          RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
          VariantName: item.variant_title,
          VariantID: item.variant_id ? String(item.variant_id) : undefined,
          Brand: item.vendor,
          ImageURL: item.product?.images?.[0]?.src || item.product?.image?.src || '',
          ProductURL: item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : '',
          Categories: item.product?.product_type ? [item.product.product_type] : [],
          CompareAtPrice: item.product?.variant?.images?.[0] ? undefined : undefined,
        })),
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
          line_items: order.line_items || [],
        },
      },
      monetary_value: orderValue,
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: order.created_at || new Date().toISOString(),
      idempotency_key: `placed_order:${order.id}`,
    });

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
      },
      monetary_value: parseFloat(order.total_price || '0'),
      currency: order.currency || 'BRL',
      shopify_resource_id: String(order.id),
      shopify_resource_type: 'order',
      occurred_at: new Date().toISOString(),
      idempotency_key: `fulfilled_order:${order.id}`,
    });
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
  
  if (contact && store.default_pipeline_id) {
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
  console.log(`[Shopify] Processing checkout: ${checkout.token}`);
  
  if (!store.sync_checkouts) {
    console.log('[Shopify] Checkout sync disabled, skipping');
    return;
  }
  
  const supabase = getSupabase();
  
  // Salvar checkout para detecção de abandono
  await supabase.from('shopify_checkouts').upsert({
    store_id: store.id,
    organization_id: store.organization_id,
    shopify_checkout_id: String(checkout.id || checkout.token),
    shopify_checkout_token: checkout.token,
    email: checkout.email || null,
    phone: checkout.phone || checkout.billing_address?.phone || null,
    total_price: parseFloat(checkout.total_price || '0'),
    subtotal_price: parseFloat(checkout.subtotal_price || '0'),
    currency: checkout.currency,
    line_items: checkout.line_items,
    abandoned_checkout_url: checkout.abandoned_checkout_url,
    status: 'pending',
    shopify_created_at: checkout.created_at,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'store_id,shopify_checkout_id',
  });

  // Se tem email, criar/atualizar contato
  let contactId: string | null = null;
  if (checkout.email) {
    const customerData: ShopifyCustomer = {
      id: 0,
      email: checkout.email,
      phone: checkout.phone || checkout.billing_address?.phone,
      first_name: checkout.billing_address?.first_name || '',
      last_name: checkout.billing_address?.last_name || '',
      orders_count: 0,
      total_spent: '0',
      tags: '',
      accepts_marketing: false,
      created_at: checkout.created_at,
      updated_at: checkout.created_at,
    };

    const contact = await syncContactFromShopify(customerData, store, 'checkout');
    contactId = contact?.id || null;
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
      },
      monetary_value: checkoutValue,
      currency: checkout.currency || 'BRL',
      shopify_resource_id: String(checkout.id || checkout.token),
      shopify_resource_type: 'checkout',
      occurred_at: checkout.created_at || new Date().toISOString(),
      idempotency_key: `checkout_started:${checkout.id || checkout.token}`,
    });
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
    .select('contact_id')
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(refund.order_id))
    .maybeSingle();

  const contactId = orderRecord?.contact_id || null;

  // Calculate refund total
  const refundAmount = refund.transactions?.reduce(
    (sum: number, t: any) => sum + parseFloat(t.amount || '0'),
    0
  ) || 0;

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
    .select('contact_id')
    .eq('store_id', store.id)
    .eq('shopify_order_id', String(fulfillment.order_id))
    .maybeSingle();

  const contactId = orderRecord?.contact_id || null;

  const eventType = fulfillment.status === 'delivered'
    ? WORDER_SHOPIFY_EVENTS.SHIPMENT_DELIVERED
    : WORDER_SHOPIFY_EVENTS.SHIPMENT_CONFIRMED;

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
      },
      shopify_resource_id: String(fulfillment.id),
      shopify_resource_type: 'fulfillment',
      occurred_at: fulfillment.created_at || new Date().toISOString(),
      idempotency_key: `${eventType}:${fulfillment.id}:${fulfillment.status}`,
    });
  } catch (cdpError) {
    console.error('[Shopify Webhook] CDP event creation failed (fulfillment):', cdpError);
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

  // Upsert product
  await supabase.from('shopify_products').upsert({
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
    price: product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'store_id,shopify_product_id',
  });
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
    const store = await getStoreConfig(shopDomain);
    if (!store) {
      console.warn(`[Shopify Webhook] No store found for: ${shopDomain}`);
      // Retorna 200 para o Shopify não retentar
      return NextResponse.json({ success: true, message: 'Shop not registered' });
    }

    // 4. Verificar assinatura (se api_secret configurado)
    if (store.api_secret) {
      const isValid = await verifyShopifyWebhook(bodyText, hmacHeader, store.api_secret);
      if (!isValid) {
        console.error('[Shopify Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
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

        case 'customers/delete':
          console.log(`[Shopify Webhook] Customer deleted: ${body.id}`);
          break;

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
