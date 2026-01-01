// =============================================
// Contact Stats API
// src/app/api/contacts/stats/route.ts
//
// GET: Estatísticas dos contatos (total, novos, valor)
// CORRIGIDO: Usa RPC para agregação no banco (sem limite de 1000)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const organizationId = request.nextUrl.searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }

  try {
    // Calcular primeiro dia do mês atual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Total de contatos
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    // Novos este mês
    const { count: newThisMonth } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', firstDayOfMonth);

    // Contatos com compras
    const { count: withOrders } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gt('total_orders', 0);

    // Valor total - usar RPC para agregação no banco (sem limite de 1000)
    let totalValue = 0;
    
    // Tentar usar RPC primeiro
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_contacts_total_spent', { p_organization_id: organizationId });
    
    if (!rpcError && rpcData !== null) {
      totalValue = Number(rpcData) || 0;
    } else {
      // Fallback: buscar em lotes para contornar limite de 1000
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: batchData } = await supabase
          .from('contacts')
          .select('total_spent')
          .eq('organization_id', organizationId)
          .range(offset, offset + batchSize - 1);
        
        if (batchData && batchData.length > 0) {
          totalValue += batchData.reduce((sum, c) => sum + (Number(c.total_spent) || 0), 0);
          offset += batchSize;
          hasMore = batchData.length === batchSize;
        } else {
          hasMore = false;
        }
      }
    }

    // Valor médio por contato
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
