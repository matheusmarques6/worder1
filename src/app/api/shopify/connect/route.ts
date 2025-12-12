import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

// Get or create default organization for demo purposes
async function getOrCreateDefaultOrg(): Promise<string> {
  try {
    // Try to get existing default org
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('name', 'Default Organization')
      .single();

    if (existingOrg) {
      return existingOrg.id;
    }

    // Create new organization
    const { data: newOrg, error } = await supabase
      .from('organizations')
      .insert({
        name: 'Default Organization',
        slug: 'default-org',
      })
      .select('id')
      .single();

    if (error) {
      // If organizations table doesn't exist or other error, generate UUID
      console.warn('Could not create organization:', error.message);
      return randomUUID();
    }

    return newOrg.id;
  } catch (err) {
    // Fallback to random UUID
    return randomUUID();
  }
}

// Connect store via Access Token (custom app method)
export async function POST(request: NextRequest) {
  try {
    const { name, domain, accessToken, apiSecret, organizationId } = await request.json();

    // Validação - API Secret agora é obrigatória
    if (!name || !domain || !accessToken || !apiSecret) {
      return NextResponse.json(
        { error: 'Nome, domínio, access token e API secret são obrigatórios' },
        { status: 400 }
      );
    }

    // Format domain - remover espaços e caracteres extras
    const cleanDomain = domain.trim().toLowerCase().replace(/\s+/g, '');
    const shopDomain = cleanDomain.includes('.myshopify.com') 
      ? cleanDomain 
      : `${cleanDomain}.myshopify.com`;

    console.log('Connecting to Shopify store:', shopDomain);

    // Verify access token by fetching shop info
    let shopResponse;
    try {
      shopResponse = await fetch(
        `https://${shopDomain}/admin/api/2024-01/shop.json`,
        {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': accessToken.trim(),
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (fetchError: any) {
      console.error('Fetch error:', fetchError);
      return NextResponse.json(
        { error: `Erro de conexão: ${fetchError.message}. Verifique se o domínio está correto.` },
        { status: 400 }
      );
    }

    if (!shopResponse.ok) {
      const errorText = await shopResponse.text();
      console.error('Shopify API error:', shopResponse.status, errorText);
      
      if (shopResponse.status === 401) {
        return NextResponse.json(
          { error: 'Access Token inválido ou expirado. Gere um novo token no Shopify Admin.' },
          { status: 401 }
        );
      }
      if (shopResponse.status === 404) {
        return NextResponse.json(
          { error: `Loja não encontrada: ${shopDomain}. Verifique o domínio.` },
          { status: 404 }
        );
      }
      if (shopResponse.status === 403) {
        return NextResponse.json(
          { error: 'Acesso negado. Verifique as permissões do app no Shopify.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `Erro Shopify (${shopResponse.status}): ${errorText.substring(0, 100)}` },
        { status: 400 }
      );
    }

    let shopData;
    try {
      const jsonResponse = await shopResponse.json();
      shopData = jsonResponse.shop;
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Erro ao processar resposta do Shopify' },
        { status: 500 }
      );
    }

    // Get organization ID from request or create/get default
    let orgId = organizationId;
    if (!orgId) {
      orgId = await getOrCreateDefaultOrg();
    }

    // Check if store already exists
    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    if (existingStore) {
      // Update existing store
      const { error: updateError } = await supabase
        .from('shopify_stores')
        .update({
          shop_name: name,
          access_token: accessToken.trim(),
          api_secret: apiSecret.trim(),
          shop_email: shopData.email,
          currency: shopData.currency,
          timezone: shopData.timezone,
          is_active: true,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existingStore.id);

      if (updateError) throw updateError;

      // Register webhooks
      registerWebhooks(shopDomain, accessToken.trim()).catch(console.error);

      return NextResponse.json({
        success: true,
        message: 'Loja atualizada com sucesso',
        store: {
          id: existingStore.id,
          name,
          domain: shopDomain,
        },
      });
    }

    // Create new store
    const { data: newStore, error: insertError } = await supabase
      .from('shopify_stores')
      .insert({
        organization_id: orgId,
        shop_domain: shopDomain,
        shop_name: name,
        shop_email: shopData.email,
        access_token: accessToken.trim(),
        api_secret: apiSecret.trim(),
        currency: shopData.currency,
        timezone: shopData.timezone,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Trigger initial data sync (async)
    syncStoreData(newStore.id, shopDomain, accessToken.trim()).catch(console.error);

    // Register webhooks
    registerWebhooks(shopDomain, accessToken.trim()).catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Loja conectada com sucesso',
      store: {
        id: newStore.id,
        name: newStore.shop_name,
        domain: newStore.shop_domain,
      },
    });
  } catch (error: any) {
    console.error('Connect store error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao conectar loja' },
      { status: 500 }
    );
  }
}

// Register Shopify webhooks
async function registerWebhooks(shopDomain: string, accessToken: string) {
  const webhooksToCreate = [
    'orders/create',
    'orders/updated',
    'customers/create',
    'customers/update',
    'checkouts/create',
    'checkouts/update',
    'products/create',
    'products/update',
    'inventory_levels/update',
  ];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  
  for (const topic of webhooksToCreate) {
    try {
      await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${appUrl}/api/shopify/webhooks`,
            format: 'json',
          },
        }),
      });
    } catch (err) {
      console.error(`Failed to register webhook ${topic}:`, err);
    }
  }
}

// GET - List stores for organization
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Organization ID required' },
      { status: 400 }
    );
  }

  try {
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, shop_email, currency, is_active, total_orders, total_revenue, last_sync_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      stores: stores?.map(s => ({
        id: s.id,
        name: s.shop_name,
        domain: s.shop_domain,
        email: s.shop_email,
        currency: s.currency,
        isActive: s.is_active,
        totalOrders: s.total_orders,
        totalRevenue: s.total_revenue,
        lastSyncAt: s.last_sync_at,
      })) || [],
    });
  } catch (error: any) {
    console.error('List stores error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar lojas' },
      { status: 500 }
    );
  }
}

// Sync store data - calls the sync API
async function syncStoreData(storeId: string, shopDomain: string, accessToken: string) {
  try {
    console.log(`[Shopify Connect] Starting initial sync for store ${storeId}...`);
    
    // Fetch orders with pagination
    let allOrders: any[] = [];
    let sinceId: string | null = null;
    let pageCount = 0;
    const maxPages = 10;

    do {
      let endpoint = `https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250`;
      if (sinceId) {
        endpoint += `&since_id=${sinceId}`;
      }

      const ordersResponse = await fetch(endpoint, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!ordersResponse.ok) break;

      const { orders } = await ordersResponse.json();
      if (!orders || orders.length === 0) break;

      allOrders = [...allOrders, ...orders];
      sinceId = orders[orders.length - 1]?.id?.toString();
      pageCount++;
    } while (pageCount < maxPages);

    console.log(`[Shopify Connect] Fetched ${allOrders.length} orders`);

    // Save orders to database
    if (allOrders.length > 0) {
      const ordersToInsert = allOrders.map((order: any) => ({
        store_id: storeId,
        shopify_order_id: order.id.toString(),
        order_number: order.order_number,
        name: order.name,
        email: order.email || order.contact_email || null,
        phone: order.phone || null,
        total_price: parseFloat(order.total_price || '0'),
        subtotal_price: parseFloat(order.subtotal_price || '0'),
        total_tax: parseFloat(order.total_tax || '0'),
        total_discounts: parseFloat(order.total_discounts || '0'),
        currency: order.currency || 'BRL',
        financial_status: order.financial_status || 'pending',
        fulfillment_status: order.fulfillment_status || null,
        customer_id: order.customer?.id?.toString() || null,
        customer_email: order.customer?.email || null,
        customer_first_name: order.customer?.first_name || null,
        customer_last_name: order.customer?.last_name || null,
        line_items: order.line_items || [],
        shipping_address: order.shipping_address || null,
        billing_address: order.billing_address || null,
        processed_at: order.processed_at || order.created_at,
        created_at: order.created_at,
        updated_at: order.updated_at,
      }));

      // Insert in batches of 100
      for (let i = 0; i < ordersToInsert.length; i += 100) {
        const batch = ordersToInsert.slice(i, i + 100);
        const { error } = await supabase
          .from('shopify_orders')
          .upsert(batch, { 
            onConflict: 'store_id,shopify_order_id',
            ignoreDuplicates: false 
          });
        
        if (error) {
          console.error(`[Shopify Connect] Error inserting orders batch:`, error.message);
        }
      }

      console.log(`[Shopify Connect] Saved ${ordersToInsert.length} orders to database`);
    }

    // Calculate totals
    const totalOrders = allOrders.length;
    const totalRevenue = allOrders.reduce((sum: number, order: any) => 
      sum + parseFloat(order.total_price || '0'), 0
    );

    // Get counts from API
    const [customersRes, productsRes] = await Promise.all([
      fetch(`https://${shopDomain}/admin/api/2024-01/customers/count.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      }).then(r => r.json()).catch(() => ({ count: 0 })),
      fetch(`https://${shopDomain}/admin/api/2024-01/products/count.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      }).then(r => r.json()).catch(() => ({ count: 0 })),
    ]);

    // Update store stats
    await supabase
      .from('shopify_stores')
      .update({
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_customers: customersRes.count || 0,
        total_products: productsRes.count || 0,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', storeId);

    console.log(`[Shopify Connect] Sync complete: ${totalOrders} orders, R$ ${totalRevenue.toFixed(2)}`);
  } catch (error) {
    console.error('[Shopify Connect] Sync error:', error);
  }
}
