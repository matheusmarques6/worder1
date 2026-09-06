import { NextRequest, NextResponse } from 'next/server';
import { requireStore } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }
  return response.json();
}

export async function GET(request: NextRequest) {
  // A loja vem pela URL e daqui sai o access_token dela para chamar a
  // Shopify. Sem esta cerca, um id de loja de outra organização bastava.
  const guard = await requireStore(request);
  if (!guard.ok) return guard.response;
  const { supabase, storeId, organizationId } = guard;


  try {
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // IDs dos clientes suspeitos
    const customerIds = ['8167905525943', '8202510467255'];
    const customerEmails = ['murilo.leite.ml@gmail.com', 'bbetobarreto@gmail.com'];

    // Buscar checkouts abandonados recentes
    const checkoutsData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/checkouts.json?limit=250`
    );

    const allCheckouts = checkoutsData.checkouts || [];
    
    // Filtrar checkouts dos clientes suspeitos
    const checkoutsSuspeitos = allCheckouts.filter((c: any) => {
      const email = c.email?.toLowerCase();
      const customerId = c.customer?.id?.toString();
      return customerEmails.includes(email) || customerIds.includes(customerId);
    });

    // Buscar também draft orders (rascunhos)
    let draftOrders: any[] = [];
    try {
      const draftsData = await shopifyFetch(
        store.shop_domain,
        store.access_token,
        `/draft_orders.json?limit=250`
      );
      draftOrders = draftsData.draft_orders || [];
    } catch (e) {
      // Pode não ter permissão
    }

    const draftsSuspeitos = draftOrders.filter((d: any) => {
      const email = d.email?.toLowerCase();
      const customerId = d.customer?.id?.toString();
      return customerEmails.includes(email) || customerIds.includes(customerId);
    });

    // Analisar todos os checkouts para ver padrão
    const checkoutsPorCliente = new Map<string, any[]>();
    for (const c of allCheckouts) {
      const key = c.email || c.customer?.id || 'unknown';
      if (!checkoutsPorCliente.has(key)) {
        checkoutsPorCliente.set(key, []);
      }
      checkoutsPorCliente.get(key)!.push({
        id: c.id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        completed_at: c.completed_at,
        email: c.email,
        abandoned_checkout_url: c.abandoned_checkout_url ? 'SIM' : 'NÃO',
      });
    }

    return NextResponse.json({
      success: true,
      
      checkouts_abandonados: {
        total_encontrados: allCheckouts.length,
        dos_clientes_suspeitos: checkoutsSuspeitos.length,
        detalhes_suspeitos: checkoutsSuspeitos.map((c: any) => ({
          id: c.id,
          email: c.email,
          customer_id: c.customer?.id,
          created_at: c.created_at,
          completed_at: c.completed_at,
          abandoned: !c.completed_at,
        })),
      },

      draft_orders: {
        total_encontrados: draftOrders.length,
        dos_clientes_suspeitos: draftsSuspeitos.length,
        detalhes_suspeitos: draftsSuspeitos.map((d: any) => ({
          id: d.id,
          email: d.email,
          customer_id: d.customer?.id,
          created_at: d.created_at,
          status: d.status,
        })),
      },

      clientes_suspeitos_buscados: {
        ids: customerIds,
        emails: customerEmails,
      },
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
