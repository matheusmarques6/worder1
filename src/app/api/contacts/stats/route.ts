// =============================================
// Contact Stats API
// src/app/api/contacts/stats/route.ts
// 
// Retorna estatísticas reais dos contatos
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
    // Primeiro dia do mês atual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 1. Total de contatos
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    // 2. Novos este mês
    const { count: newThisMonth } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', firstDayOfMonth);

    // 3. Valor total (soma de total_spent)
    const { data: valueData } = await supabase
      .from('contacts')
      .select('total_spent')
      .eq('organization_id', organizationId);
    
    const totalValue = valueData?.reduce((sum, c) => {
      const spent = parseFloat(c.total_spent) || 0;
      return sum + spent;
    }, 0) || 0;

    // 4. Contatos com deals (opcional)
    const { count: withDeals } = await supabase
      .from('contacts')
      .select('*, deals!inner(id)', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    return NextResponse.json({
      success: true,
      stats: {
        totalContacts: totalContacts || 0,
        newThisMonth: newThisMonth || 0,
        totalValue: totalValue,
        withDeals: withDeals || 0,
      }
    });

  } catch (error: any) {
    console.error('[Contact Stats] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
