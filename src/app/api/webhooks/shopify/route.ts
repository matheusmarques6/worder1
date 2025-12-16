import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EventBus, EventType } from '@/lib/events';

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
// BUSCAR ORGANIZAÇÃO PELO SHOP
// ============================================

async function getOrganizationByShop(shopDomain: string): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('shopify_stores')
      .select('organization_id')
      .eq('shop_domain', shopDomain)
      .single();
    
    return data?.organization_id || null;
  } catch {
    return null;
  }
}

// ============================================
// PROCESSAR EVENTOS
// ============================================

async function processOrderCreated(organizationId: string, order: any) {
  console.log(`[Shopify] Processing order created: ${order.order_number}`);
  
  // Criar/atualizar contato
  const contact = await EventBus.upsertContact(organizationId, {
    email: order.email,
    first_name: order.customer?.first_name,
    last_name: order.customer?.last_name,
    phone: order.phone || order.customer?.phone,
    shopify_customer_id: order.customer?.id?.toString(),
    source: 'shopify',
    total_orders: (order.customer?.orders_count || 1),
    total_spent: parseFloat(order.customer?.total_spent || order.total_price || '0'),
    last_order_at: new Date().toISOString(),
  });

  // Emitir evento
  await EventBus.emit(EventType.ORDER_CREATED, {
    organization_id: organizationId,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    phone: order.phone,
    data: {
      order_number: order.order_number,
      total_price: parseFloat(order.total_price || '0'),
      subtotal_price: parseFloat(order.subtotal_price || '0'),
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      line_items: (order.line_items || []).map((item: any) => ({
        title: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price || '0'),
        sku: item.sku,
        product_id: item.product_id,
      })),
      shipping_address: order.shipping_address,
      discount_codes: order.discount_codes,
      tags: order.tags,
      note: order.note,
      source_name: order.source_name,
    },
    source: 'shopify',
  });
}

async function processOrderPaid(organizationId: string, order: any) {
  console.log(`[Shopify] Processing order paid: ${order.order_number}`);
  
  const contact = await EventBus.getContactByEmail(organizationId, order.email);
  
  await EventBus.emit(EventType.ORDER_PAID, {
    organization_id: organizationId,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      order_number: order.order_number,
      total_price: parseFloat(order.total_price || '0'),
      payment_gateway: order.gateway,
    },
    source: 'shopify',
  });
}

async function processOrderFulfilled(organizationId: string, order: any) {
  console.log(`[Shopify] Processing order fulfilled: ${order.order_number}`);
  
  const contact = await EventBus.getContactByEmail(organizationId, order.email);
  
  await EventBus.emit(EventType.ORDER_FULFILLED, {
    organization_id: organizationId,
    contact_id: contact?.id,
    order_id: order.id?.toString(),
    email: order.email,
    data: {
      order_number: order.order_number,
      tracking_number: order.fulfillments?.[0]?.tracking_number,
      tracking_company: order.fulfillments?.[0]?.tracking_company,
      tracking_url: order.fulfillments?.[0]?.tracking_url,
    },
    source: 'shopify',
  });
}

async function processCheckoutCreated(organizationId: string, checkout: any) {
  console.log(`[Shopify] Processing checkout: ${checkout.token}`);
  
  const supabase = getSupabase();
  
  // Salvar checkout para detecção de abandono
  await supabase.from('abandoned_carts').upsert({
    organization_id: organizationId,
    session_id: checkout.token,
    email: checkout.email || null,
    phone: checkout.phone || null,
    cart_data: {
      line_items: checkout.line_items,
      total_price: checkout.total_price,
      currency: checkout.currency,
    },
    total_value: parseFloat(checkout.total_price || '0'),
    detected_at: null, // Será preenchido pelo cron de abandono
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'session_id',
  });

  // Se tem email, criar/atualizar contato
  if (checkout.email) {
    await EventBus.upsertContact(organizationId, {
      email: checkout.email,
      first_name: checkout.shipping_address?.first_name,
      last_name: checkout.shipping_address?.last_name,
      phone: checkout.phone,
      source: 'shopify_checkout',
    });
  }
}

async function processCustomerCreated(organizationId: string, customer: any) {
  console.log(`[Shopify] Processing customer created: ${customer.email}`);
  
  // Criar contato
  const contact = await EventBus.upsertContact(organizationId, {
    email: customer.email,
    first_name: customer.first_name,
    last_name: customer.last_name,
    phone: customer.phone,
    shopify_customer_id: customer.id?.toString(),
    source: 'shopify',
    tags: customer.tags ? customer.tags.split(',').map((t: string) => t.trim()) : [],
    is_subscribed_email: customer.accepts_marketing,
  });

  // Emitir evento
  await EventBus.emit(EventType.CONTACT_CREATED, {
    organization_id: organizationId,
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
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export async function POST(request: NextRequest) {
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

    console.log(`[Shopify Webhook] Received: ${topic} from ${shopDomain}`);

    if (!topic || !shopDomain) {
      return NextResponse.json(
        { error: 'Missing Shopify headers' },
        { status: 400 }
      );
    }

    // 3. Buscar organização
    const organizationId = await getOrganizationByShop(shopDomain);
    if (!organizationId) {
      console.warn(`[Shopify Webhook] No organization found for shop: ${shopDomain}`);
      // Retorna 200 para o Shopify não retentar
      return NextResponse.json({ success: true, message: 'Shop not registered' });
    }

    // 4. Verificar assinatura (se configurada)
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const isValid = await verifyShopifyWebhook(bodyText, hmacHeader, webhookSecret);
      if (!isValid) {
        console.error('[Shopify Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 5. Processar por tipo de evento
    switch (topic) {
      case 'orders/create':
        await processOrderCreated(organizationId, body);
        break;
        
      case 'orders/paid':
        await processOrderPaid(organizationId, body);
        break;
        
      case 'orders/fulfilled':
        await processOrderFulfilled(organizationId, body);
        break;
        
      case 'orders/cancelled':
        const contactCancelled = await EventBus.getContactByEmail(organizationId, body.email);
        await EventBus.emit(EventType.ORDER_CANCELLED, {
          organization_id: organizationId,
          contact_id: contactCancelled?.id,
          order_id: body.id?.toString(),
          email: body.email,
          data: { 
            order_number: body.order_number, 
            cancel_reason: body.cancel_reason 
          },
          source: 'shopify',
        });
        break;
        
      case 'checkouts/create':
      case 'checkouts/update':
        await processCheckoutCreated(organizationId, body);
        break;
        
      case 'customers/create':
        await processCustomerCreated(organizationId, body);
        break;
        
      case 'customers/update':
        const existingContact = await EventBus.getContactByEmail(organizationId, body.email);
        if (existingContact) {
          await EventBus.emit(EventType.CONTACT_UPDATED, {
            organization_id: organizationId,
            contact_id: existingContact.id,
            email: body.email,
            data: {
              first_name: body.first_name,
              last_name: body.last_name,
              tags: body.tags,
            },
            source: 'shopify',
          });
        }
        break;
        
      default:
        console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Shopify Webhook] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// GET para verificação
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'shopify-webhook',
    timestamp: new Date().toISOString(),
  });
}
