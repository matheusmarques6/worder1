import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// Verify Shopify webhook signature
function verifyShopifyWebhook(body: string, signature: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const digest = hmac.digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// Handle Shopify OAuth callback
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');

  if (!code || !shop || !state) {
    return NextResponse.redirect('/settings?error=missing_params');
  }

  try {
    // Verify state (should be stored in session)
    // For production, verify state matches what was sent in the initial request

    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    const { access_token, scope } = await tokenResponse.json();

    // Get shop info
    const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': access_token },
    });
    const { shop: shopData } = await shopResponse.json();

    // Parse organization_id from state
    const organizationId = state;

    // Save to database
    const { error } = await supabase.from('shopify_stores').upsert({
      organization_id: organizationId,
      shop_domain: shop,
      access_token,
      shop_name: shopData.name,
      shop_email: shopData.email,
      currency: shopData.currency,
      timezone: shopData.timezone,
      is_active: true,
      last_sync_at: new Date().toISOString(),
    });

    if (error) throw error;

    // Register webhooks
    const webhooksToCreate = [
      'orders/create',
      'orders/updated',
      'customers/create',
      'customers/update',
      'checkouts/create',
      'checkouts/update',
    ];

    for (const topic of webhooksToCreate) {
      await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': access_token,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/webhooks`,
            format: 'json',
          },
        }),
      });
    }

    return NextResponse.redirect('/settings?tab=integrations&success=shopify_connected');
  } catch (error) {
    console.error('Shopify OAuth error:', error);
    return NextResponse.redirect('/settings?error=oauth_failed');
  }
}

// Handle Shopify webhooks
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('X-Shopify-Hmac-Sha256');
  const topic = request.headers.get('X-Shopify-Topic');
  const shopDomain = request.headers.get('X-Shopify-Shop-Domain');

  // Verify webhook signature
  if (!signature || !verifyShopifyWebhook(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const data = JSON.parse(body);

  try {
    // Get organization from shop domain
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('organization_id')
      .eq('shop_domain', shopDomain)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const organizationId = store.organization_id;

    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
        await handleOrderWebhook(organizationId, data);
        break;
      case 'customers/create':
      case 'customers/update':
        await handleCustomerWebhook(organizationId, data);
        break;
      case 'checkouts/create':
      case 'checkouts/update':
        await handleCheckoutWebhook(organizationId, data);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function handleOrderWebhook(organizationId: string, order: any) {
  // Update contact with order info
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, total_orders, total_spent')
    .eq('organization_id', organizationId)
    .eq('email', order.email)
    .single();

  if (contact) {
    await supabase
      .from('contacts')
      .update({
        total_orders: (contact.total_orders || 0) + 1,
        total_spent: (contact.total_spent || 0) + parseFloat(order.total_price),
        last_order_at: order.created_at,
        shopify_customer_id: order.customer?.id?.toString(),
      })
      .eq('id', contact.id);
  } else {
    // Create new contact
    await supabase.from('contacts').insert({
      organization_id: organizationId,
      email: order.email,
      phone: order.phone,
      first_name: order.customer?.first_name,
      last_name: order.customer?.last_name,
      shopify_customer_id: order.customer?.id?.toString(),
      total_orders: 1,
      total_spent: parseFloat(order.total_price),
      last_order_at: order.created_at,
      source: 'shopify',
    });
  }

  // Update daily metrics
  const today = new Date().toISOString().split('T')[0];
  await supabase.rpc('increment_daily_metric', {
    p_organization_id: organizationId,
    p_date: today,
    p_metric: 'orders_count',
    p_value: 1,
  });

  await supabase.rpc('increment_daily_metric', {
    p_organization_id: organizationId,
    p_date: today,
    p_metric: 'revenue',
    p_value: parseFloat(order.total_price),
  });

  // Trigger automations
  await triggerAutomations(organizationId, 'order_placed', {
    order_id: order.id,
    total: order.total_price,
    customer_email: order.email,
  });
}

async function handleCustomerWebhook(organizationId: string, customer: any) {
  await supabase.from('contacts').upsert(
    {
      organization_id: organizationId,
      email: customer.email,
      phone: customer.phone,
      first_name: customer.first_name,
      last_name: customer.last_name,
      shopify_customer_id: customer.id.toString(),
      total_orders: customer.orders_count || 0,
      total_spent: parseFloat(customer.total_spent || '0'),
      tags: customer.tags?.split(',').map((t: string) => t.trim()) || [],
      source: 'shopify',
    },
    { onConflict: 'organization_id,email' }
  );

  // Trigger new customer automation
  if (customer.orders_count === 0) {
    await triggerAutomations(organizationId, 'customer_created', {
      customer_id: customer.id,
      email: customer.email,
    });
  }
}

async function handleCheckoutWebhook(organizationId: string, checkout: any) {
  // Check if checkout is abandoned (no order created)
  if (checkout.abandoned_checkout_url) {
    await triggerAutomations(organizationId, 'checkout_abandoned', {
      checkout_id: checkout.id,
      email: checkout.email,
      total: checkout.total_price,
      abandoned_url: checkout.abandoned_checkout_url,
    });
  }
}

async function triggerAutomations(organizationId: string, trigger: string, data: any) {
  // Find active automations with matching trigger
  const { data: automations } = await supabase
    .from('automations')
    .select('id, canvas_data')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('trigger_type', trigger);

  if (!automations?.length) return;

  // Queue automation runs (in production, use a job queue like BullMQ)
  for (const automation of automations) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      status: 'running',
      metadata: { trigger_data: data },
    });
  }
}
