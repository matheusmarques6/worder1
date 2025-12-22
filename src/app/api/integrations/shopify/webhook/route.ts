// =============================================
// API: Shopify Webhook Receiver
// src/app/api/integrations/shopify/webhook/route.ts
// Usa estrutura existente do projeto
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// Verificação HMAC do Shopify
// =============================================
function verifyShopifyWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  if (!secret || !hmacHeader) return true; // Se não tem secret, aceita (dev mode)
  
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    return hash === hmacHeader;
  } catch {
    return false;
  }
}

// =============================================
// POST - Receber Webhook
// =============================================
export async function POST(request: NextRequest) {
  try {
    // Headers do Shopify
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';
    const topic = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    if (!topic || !shopDomain) {
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
    }

    // Ler body
    const rawBody = await request.text();
    let payload: any;
    
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log(`📦 Shopify webhook: ${topic} from ${shopDomain}`);

    // Buscar loja conectada
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id, api_secret')
      .eq('shop_domain', shopDomain)
      .eq('is_active', true)
      .maybeSingle();

    if (!store) {
      console.log(`No active store for ${shopDomain}`);
      return NextResponse.json({ received: true });
    }

    // Verificar HMAC se tiver secret
    if (store.api_secret && hmacHeader) {
      const isValid = verifyShopifyWebhook(rawBody, hmacHeader, store.api_secret);
      if (!isValid) {
        console.error('Invalid HMAC signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const organizationId = store.organization_id;

    // Processar baseado no tópico
    switch (topic) {
      case 'customers/create':
      case 'customers/update':
        await processCustomer(organizationId, payload, topic);
        break;

      case 'orders/create':
      case 'orders/paid':
      case 'orders/updated':
        await processOrder(organizationId, payload, topic);
        break;

      case 'checkouts/create':
      case 'checkouts/update':
        await processCheckout(organizationId, payload, topic);
        break;

      case 'app/uninstalled':
        await supabase
          .from('shopify_stores')
          .update({ is_active: false })
          .eq('shop_domain', shopDomain);
        console.log(`App uninstalled for ${shopDomain}`);
        break;

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ received: true, error: error.message });
  }
}

// =============================================
// Processar Cliente
// =============================================
async function processCustomer(organizationId: string, customer: any, topic: string) {
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify';
  const email = customer.email;
  const phone = customer.phone;

  if (!email && !phone) return;

  // Verificar se já existe
  let existingContact = null;
  
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle();
    existingContact = data;
  }

  if (!existingContact && phone) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .maybeSingle();
    existingContact = data;
  }

  if (existingContact) {
    await supabase
      .from('contacts')
      .update({
        name,
        email,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingContact.id);
    console.log(`✅ Customer updated: ${email || phone}`);
  } else {
    await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        name,
        email,
        phone,
        source: 'shopify',
        tags: ['shopify', 'customer'],
      });
    console.log(`✅ Customer created: ${email || phone}`);
  }
}

// =============================================
// Processar Pedido
// =============================================
async function processOrder(organizationId: string, order: any, topic: string) {
  const customer = order.customer || {};
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify';
  const email = order.email || customer.email;
  const phone = order.phone || customer.phone;
  const value = parseFloat(order.total_price || '0');

  if (!email && !phone) return;

  // Buscar ou criar contato
  let contactId: string | null = null;
  
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle();
    contactId = data?.id;
  }

  if (!contactId && phone) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .maybeSingle();
    contactId = data?.id;
  }

  if (!contactId) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        name,
        email,
        phone,
        source: 'shopify_order',
        tags: ['shopify', 'order'],
      })
      .select('id')
      .single();
    contactId = newContact?.id;
    console.log(`✅ Contact created from order: ${email || phone}`);
  }

  // Criar deal se tem valor
  if (contactId && value > 0) {
    // Buscar pipeline padrão
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id, stages(id, sort_order)')
      .eq('organization_id', organizationId)
      .eq('is_default', true)
      .maybeSingle();

    if (pipeline) {
      const stages = (pipeline.stages as any[]) || [];
      const firstStage = stages.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))[0];

      if (firstStage) {
        // Verificar se deal do pedido já existe
        const { data: existingDeal } = await supabase
          .from('deals')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('contact_id', contactId)
          .contains('metadata', { shopify_order_id: order.id })
          .maybeSingle();

        if (!existingDeal) {
          await supabase.from('deals').insert({
            organization_id: organizationId,
            pipeline_id: pipeline.id,
            stage_id: firstStage.id,
            contact_id: contactId,
            title: `Pedido #${order.order_number || order.id}`,
            value,
            status: topic === 'orders/paid' ? 'won' : 'open',
            source: 'shopify',
            metadata: {
              shopify_order_id: order.id,
              order_number: order.order_number,
              financial_status: order.financial_status,
            },
          });
          console.log(`✅ Deal created: Pedido #${order.order_number} - R$ ${value}`);
        } else if (topic === 'orders/paid') {
          await supabase
            .from('deals')
            .update({ status: 'won' })
            .eq('id', existingDeal.id);
          console.log(`✅ Deal marked as won: Pedido #${order.order_number}`);
        }
      }
    }
  }
}

// =============================================
// Processar Carrinho Abandonado
// =============================================
async function processCheckout(organizationId: string, checkout: any, topic: string) {
  const customer = checkout.customer || {};
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Cliente Shopify';
  const email = checkout.email || customer.email;
  const phone = checkout.phone || customer.phone;
  const value = parseFloat(checkout.total_price || '0');

  if (!email && !phone) return;

  // Verificar se já existe
  let existingContact = null;
  
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle();
    existingContact = data;
  }

  if (!existingContact) {
    await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        name,
        email,
        phone,
        source: 'shopify_abandoned',
        tags: ['shopify', 'abandoned_cart'],
        custom_fields: {
          abandoned_checkout_url: checkout.abandoned_checkout_url,
          cart_value: value,
        },
      });
    console.log(`✅ Abandoned cart contact created: ${email || phone}`);
  }
}
