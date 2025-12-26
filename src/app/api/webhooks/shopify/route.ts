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
import { createClient } from '@supabase/supabase-js';
import { EventBus, EventType } from '@/lib/events';
import { syncContactFromShopify, updateContactOrderStats } from '@/lib/services/shopify/contact-sync';
import { createOrUpdateDealForContact, moveDealToStage, markDealAsWon } from '@/lib/services/shopify/deal-sync';
import { trackActivity, trackPurchase, enrichContactFromOrder } from '@/lib/services/shopify/activity-tracker';
import type { ShopifyStoreConfig, ShopifyCustomer } from '@/lib/services/shopify/types';

// ============================================
// CONFIGURAÇÃO
// ============================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase not configured');
  }
  
  return createClient(url, key);
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
  
  // Criar deal se pipeline configurado
  if (store.default_pipeline_id && contact) {
    await createOrUpdateDealForContact(
      contact.id,
      store,
      'new_customer',
      0,
      {
        shopify_customer_id: customer.id,
        source: 'customer_created',
      }
    );
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
  
  // Criar/atualizar deal na pipeline
  if (store.default_pipeline_id) {
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

  // Emitir evento para automações
  await EventBus.emit(EventType.ORDER_CREATED, {
    organization_id: store.organization_id,
    contact_id: contact.id,
    order_id: order.id?.toString(),
    email: order.email,
    phone: order.phone,
    data: {
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
    
    if (store.default_pipeline_id) {
      // Mover deal para estágio "pago" ou marcar como ganho
      await moveDealToStage(contact.id, store, 'paid');
    }
  }

  // Emitir evento
  await EventBus.emit(EventType.ORDER_PAID, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      order_number: order.order_number,
      total_price: parseFloat(order.total_price || '0'),
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
    
    if (store.default_pipeline_id) {
      // Mover deal para estágio "enviado"
      await moveDealToStage(contact.id, store, 'fulfilled');
    }
  }

  // Emitir evento
  await EventBus.emit(EventType.ORDER_FULFILLED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      order_number: order.order_number,
      tracking_number: order.fulfillments?.[0]?.tracking_number,
      tracking_url: order.fulfillments?.[0]?.tracking_url,
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

  // Emitir evento
  await EventBus.emit(EventType.ORDER_CANCELLED, {
    organization_id: store.organization_id,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: { 
      order_number: order.order_number, 
      cancel_reason: order.cancel_reason,
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
    
    await syncContactFromShopify(customerData, store, 'checkout');
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

    // 5. Verificar idempotência (evitar processar duplicado)
    if (webhookId) {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('shopify_webhook_events')
        .select('id')
        .eq('store_id', store.id)
        .eq('shopify_event_id', webhookId)
        .maybeSingle();
      
      if (existing) {
        console.log(`[Shopify Webhook] Duplicate event ignored: ${webhookId}`);
        return NextResponse.json({ success: true, message: 'Duplicate event' });
      }
      
      // Registrar evento
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
          
        case 'app/uninstalled':
          // Marcar loja como desconectada
          const supabase = getSupabase();
          await supabase
            .from('shopify_stores')
            .update({
              is_active: false,
              connection_status: 'disconnected',
              updated_at: new Date().toISOString(),
            })
            .eq('id', store.id);
          break;
          
        default:
          console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
      }
      
      // Marcar evento como processado
      if (webhookId) {
        const supabase = getSupabase();
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
