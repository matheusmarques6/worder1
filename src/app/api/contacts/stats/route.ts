import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  // ✅ FILTRO POR LOJA
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Total de contatos
    let totalQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (storeId) totalQuery = totalQuery.eq('store_id', storeId);
    const { count: totalContacts } = await totalQuery;

    // Novos este mês
    let newQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', firstDayOfMonth);
    if (storeId) newQuery = newQuery.eq('store_id', storeId);
    const { count: newThisMonth } = await newQuery;

    // Com pedidos
    let ordersQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gt('total_orders', 0);
    if (storeId) ordersQuery = ordersQuery.eq('store_id', storeId);
    const { count: withOrders } = await ordersQuery;

    // Valor total
    let totalValue = 0;
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      let valueQuery = supabase
        .from('contacts')
        .select('total_spent')
        .eq('organization_id', organizationId)
        .range(offset, offset + batchSize - 1);
      if (storeId) valueQuery = valueQuery.eq('store_id', storeId);
      
      const { data: batchData } = await valueQuery;
      
      if (batchData && batchData.length > 0) {
        totalValue += batchData.reduce((sum, c) => sum + (Number(c.total_spent) || 0), 0);
        offset += batchSize;
        hasMore = batchData.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const avgValue = totalContacts && totalContacts > 0 ? totalValue / totalContacts : 0;

    return NextResponse.json({
      totalContacts: totalContacts || 0,
      newThisMonth: newThisMonth || 0,
      totalValue: Math.round(totalValue * 100) / 100,
      withOrders: withOrders || 0,
      avgValue: Math.round(avgValue * 100) / 100,
    });

  } catch (error: any) {
    console.error('[Contact Stats API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
