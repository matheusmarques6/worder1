// =============================================
// Contact Stats API
// src/app/api/contacts/stats/route.ts
//
// GET: Estatísticas dos contatos (total, novos, valor)
// CORRIGIDO: Usa RPC para agregação no banco (sem limite de 1000)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    // Calcular primeiro dia do mês atual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Total de contatos - RLS filtra automaticamente
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    // Novos este mês - RLS filtra automaticamente
    const { count: newThisMonth } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayOfMonth);

    // Contatos com compras - RLS filtra automaticamente
    const { count: withOrders } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .gt('total_orders', 0);

    // Valor total - usar RPC para agregação no banco
    let totalValue = 0;
    
    // Tentar usar RPC primeiro (a RPC deve respeitar RLS ou receber org_id)
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_contacts_total_spent', { p_organization_id: user.organization_id });
    
    if (!rpcError && rpcData !== null) {
      totalValue = Number(rpcData) || 0;
    } else {
      // Fallback: buscar em lotes - RLS filtra automaticamente
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: batchData } = await supabase
          .from('contacts')
          .select('total_spent')
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
