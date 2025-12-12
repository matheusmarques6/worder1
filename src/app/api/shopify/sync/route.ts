import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

const SHOPIFY_API_VERSION = '2024-10';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    // Get store
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name')
      .eq('is_active', true)
      .limit(1);

    if (storesError || !stores || stores.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nenhuma loja conectada' 
      }, { status: 404 });
    }

    const store = stores[0];
    
    // Fetch orders from Shopify (max 250 per request)
    const url = `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        success: false, 
        error: `Shopify API error: ${response.status} - ${errorText.substring(0, 100)}` 
      }, { status: 500 });
    }

    const data = await response.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'Nenhum pedido encontrado na loja Shopify',
        totalOrders: 0 
      });
    }

    // Clear existing orders for this store
    await supabase
      .from('shopify_orders')
      .delete()
      .eq('store_id', store.id);

    // Prepare orders for insert
    const ordersToInsert = orders.map((order: any) => ({
      store_id: store.id,
      shopify_order_id: order.id.toString(),
      order_number: order.order_number || 0,
      name: order.name || `#${order.order_number}`,
      email: order.email || order.contact_email || null,
      phone: order.phone || null,
      total_price: parseFloat(order.total_price || '0'),
      subtotal_price: parseFloat(order.subtotal_price || '0'),
      total_tax: parseFloat(order.total_tax || '0'),
      total_discounts: parseFloat(order.total_discounts || '0'),
      total_shipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0'),
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
      cancelled_at: order.cancelled_at || null,
      closed_at: order.closed_at || null,
    }));

    // Insert in batches of 50
    let insertedCount = 0;
    for (let i = 0; i < ordersToInsert.length; i += 50) {
      const batch = ordersToInsert.slice(i, i + 50);
      const { error: insertError } = await supabase
        .from('shopify_orders')
        .insert(batch);
      
      if (!insertError) {
        insertedCount += batch.length;
      }
    }

    // Calculate revenue
    let totalRevenue = 0;
    let paidOrders = 0;
    orders.forEach((order: any) => {
      if (['paid', 'partially_paid'].includes(order.financial_status)) {
        totalRevenue += parseFloat(order.total_price || '0');
        paidOrders++;
      }
    });

    // Update store stats
    await supabase
      .from('shopify_stores')
      .update({
        total_orders: insertedCount,
        total_revenue: totalRevenue,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', store.id);

    const timeSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída! ${insertedCount} pedidos importados.`,
      totalOrders: insertedCount,
      paidOrders,
      totalRevenue,
      timeSeconds: parseFloat(timeSeconds),
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const { data: stores } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, total_orders, total_revenue, last_sync_at')
      .eq('is_active', true);

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
      hasStores: (stores?.length || 0) > 0
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
