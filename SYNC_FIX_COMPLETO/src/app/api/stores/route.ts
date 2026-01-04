import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getAuthClient, authError } from '@/lib/api-utils';

// GET - Listar stores da organização do usuário
export async function GET(request: NextRequest) {
  // ✅ SEGURANÇA: Auth obrigatório
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, shop_email, currency, is_active, last_sync_at, total_orders, total_revenue, created_at')
      .eq('organization_id', organizationId) // ✅ Filtra pela org do usuário
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API/stores] Error:', error.message);
      return NextResponse.json({ success: false, stores: [], error: error.message });
    }

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
      hasStores: (stores?.length || 0) > 0
    });
  } catch (error: any) {
    console.error('[API/stores] Exception:', error.message);
    return NextResponse.json({ success: false, stores: [], error: error.message });
  }
}
