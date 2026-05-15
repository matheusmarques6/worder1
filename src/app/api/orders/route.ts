import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

async function getUserOrganization(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;

  // Resolve every org the user belongs to — primary + memberships.
  // Single-org filtering used to silently drop secondary org data
  // (multi-org users saw partial / missing orders).
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = Array.from(
    new Set<string>(
      [profile?.organization_id, ...((memberships || []).map((m: any) => m.organization_id))]
        .filter(Boolean) as string[]
    )
  );
  if (orgIds.length === 0) return null;
  return { primary: profile?.organization_id || orgIds[0], all: orgIds };
}

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  return { body: await response.json(), headers: response.headers };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const orgs = await getUserOrganization(request);
    if (!orgs) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status'); // any, open, closed, cancelled
    const financialStatus = searchParams.get('financialStatus'); // pending, paid, refunded, etc
    const search = searchParams.get('search');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Buscar lojas — escopa por TODAS as orgs do usuário (primária +
    // memberships). O filtro single-org anterior silenciosamente
    // ignorava lojas de orgs secundárias.
    let storesQuery = supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgs.all)
      .eq('is_active', true);

    if (storeId) {
      storesQuery = storesQuery.eq('id', storeId);
    }

    const { data: stores } = await storesQuery;

    if (!stores || stores.length === 0) {
      return NextResponse.json({ orders: [], total: 0, stores: [] });
    }

    // Buscar pedidos de cada loja
    const allOrders: any[] = [];

    for (const store of stores) {
      if (!store.shop_domain || !store.access_token) continue;

      try {
        // Construir query params
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        params.append('status', status || 'any');

        if (financialStatus) {
          params.append('financial_status', financialStatus);
        }
        if (startDate) {
          params.append('created_at_min', new Date(startDate).toISOString());
        }
        if (endDate) {
          params.append('created_at_max', new Date(endDate).toISOString());
        }

        const endpoint = `/orders.json?${params.toString()}`;
        const { body } = await shopifyFetch(store.shop_domain, store.access_token, endpoint);

        const orders = (body.orders || []).map((order: any) => ({
          ...order,
          store_id: store.id,
          store_name: store.shop_name || store.shop_domain,
          store_domain: store.shop_domain,
        }));

        // Filtro de busca local (nome, email, número do pedido)
        const filteredOrders = search
          ? orders.filter((o: any) =>
              o.name?.toLowerCase().includes(search.toLowerCase()) ||
              o.email?.toLowerCase().includes(search.toLowerCase()) ||
              o.customer?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
              o.customer?.last_name?.toLowerCase().includes(search.toLowerCase())
            )
          : orders;

        allOrders.push(...filteredOrders);

      } catch (err) {
        console.error(`Error fetching orders from ${store.shop_domain}:`, err);
      }
    }

    // Ordenar por data (mais recentes primeiro)
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Formatar pedidos para o frontend
    const formattedOrders = allOrders.map((order: any) => ({
      id: order.id,
      name: order.name,
      order_number: order.order_number,
      created_at: order.created_at,

      // Cliente
      customer: order.customer ? {
        id: order.customer.id,
        name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Cliente',
        email: order.email || order.customer.email,
        phone: order.phone || order.customer.phone,
        orders_count: order.customer.orders_count,
      } : {
        name: order.billing_address?.name || 'Cliente',
        email: order.email,
      },

      // Status
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status || 'unfulfilled',
      cancelled_at: order.cancelled_at,

      // Valores
      currency: order.currency,
      subtotal_price: parseFloat(order.subtotal_price || 0),
      total_discounts: parseFloat(order.total_discounts || 0),
      total_shipping: order.shipping_lines?.reduce((sum: number, s: any) => sum + parseFloat(s.price || 0), 0) || 0,
      total_tax: parseFloat(order.total_tax || 0),
      total_price: parseFloat(order.total_price || 0),

      // Itens
      line_items_count: order.line_items?.length || 0,
      line_items: order.line_items?.slice(0, 3).map((item: any) => ({
        id: item.id,
        title: item.title,
        variant_title: item.variant_title,
        quantity: item.quantity,
        price: parseFloat(item.price || 0),
        sku: item.sku,
        product_id: item.product_id,
        variant_id: item.variant_id,
      })),

      // Loja
      store_id: order.store_id,
      store_name: order.store_name,

      // Outros
      tags: order.tags,
      note: order.note,
      gateway: order.gateway,
      source_name: order.source_name,
    }));

    return NextResponse.json({
      orders: formattedOrders,
      total: formattedOrders.length,
      stores: stores.map(s => ({ id: s.id, name: s.shop_name, domain: s.shop_domain })),
    });

  } catch (error: any) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
