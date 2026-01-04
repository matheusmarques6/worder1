import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    
    if (!supabase) {
      return NextResponse.json({ success: false, stores: [], error: 'Database not configured' });
    }

    // Pegar token do cookie
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      console.log('[/api/stores] No access token - returning empty');
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    // Verificar usuário pelo token
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.log('[/api/stores] Invalid token - returning empty');
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    // Buscar organization_id do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      console.log('[/api/stores] No organization for user:', user.id);
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    console.log('[/api/stores] Fetching stores for org:', profile.organization_id);

    // Buscar lojas da organização - APENAS colunas que existem
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, shop_email, is_active, last_sync_at, organization_id')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[/api/stores] Error:', error.message);
      return NextResponse.json({ success: false, stores: [], error: error.message });
    }

    console.log('[/api/stores] Found stores:', stores?.length || 0);

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
      hasStores: (stores?.length || 0) > 0
    });
  } catch (error: any) {
    console.error('[/api/stores] Error:', error.message);
    return NextResponse.json({ success: false, stores: [], error: error.message });
  }
}
