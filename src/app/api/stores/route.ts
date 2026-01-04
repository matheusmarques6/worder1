import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ success: false, stores: [], error: 'Database not configured' });
    }

    // Criar cliente com cookies do request para pegar sessão do usuário
    const cookieStore = cookies();
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    });

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('[/api/stores] No authenticated user');
      return NextResponse.json({ success: false, stores: [], error: 'Not authenticated' });
    }

    // Buscar organization_id do usuário
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      console.log('[/api/stores] No organization found for user:', user.id);
      return NextResponse.json({ success: false, stores: [], error: 'No organization' });
    }

    console.log('[/api/stores] Fetching stores for org:', profile.organization_id);

    // Buscar lojas da organização do usuário
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, shop_email, is_active, last_sync_at, total_orders, total_revenue, organization_id')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[/api/stores] Error fetching stores:', error.message);
      return NextResponse.json({ success: false, stores: [], error: error.message });
    }

    console.log('[/api/stores] Found stores:', stores?.length || 0);

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
      hasStores: (stores?.length || 0) > 0,
      organizationId: profile.organization_id
    });
  } catch (error: any) {
    console.error('[/api/stores] Error:', error.message);
    return NextResponse.json({ success: false, stores: [], error: error.message });
  }
}
