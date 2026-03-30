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

    const accessToken = request.cookies.get('sb-access-token')?.value;

    if (!accessToken) {
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    // Get all orgs the user belongs to
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    let orgIds = [profile.organization_id];
    if (memberships?.length) {
      orgIds = [...new Set([...orgIds, ...memberships.map(m => m.organization_id)])];
    }

    // Fetch active stores from ALL user's organizations
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, shop_email, is_active, last_sync_at, organization_id, currency, total_orders, total_revenue, total_customers, connection_status, status, api_version, plan_name, pixel_installed, embed_installed, initial_sync_completed, installed_at, settings')
      .in('organization_id', orgIds)
      .eq('is_active', true)
      .order('installed_at', { ascending: false });

    if (error) {
      console.error('[/api/stores] Error:', error.message);
      return NextResponse.json({ success: false, stores: [], error: error.message });
    }

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
