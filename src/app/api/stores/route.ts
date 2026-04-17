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

    // Get user's primary organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    const userOrgId = profile.organization_id;

    // Build list of ALL org IDs the user has access to
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = [...new Set([
      userOrgId,
      ...(memberships?.map(m => m.organization_id) || []),
    ])];

    // Fetch active stores from ALL user's organizations
    let { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .eq('is_active', true)
      .order('installed_at', { ascending: false });

    // FALLBACK: If no stores found via org membership, search ALL active stores
    // This handles the case where OAuth callback saved with a different org
    if ((!stores || stores.length === 0) && !error) {
      const { data: allStores } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('is_active', true)
        .order('installed_at', { ascending: false });

      if (allStores && allStores.length > 0) {
        stores = allStores;
        console.log(`[/api/stores] Fallback: found ${allStores.length} stores outside user's orgs`);

        // Fix the org mismatch: update these stores to user's org
        for (const s of allStores) {
          if (!orgIds.includes(s.organization_id)) {
            await supabase
              .from('shopify_stores')
              .update({ organization_id: userOrgId })
              .eq('id', s.id);
            console.log(`[/api/stores] Fixed org for store ${s.shop_domain}: ${s.organization_id} → ${userOrgId}`);
          }
        }
      }
    }

    if (error) {
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

// POST: Create a new store (without Shopify integration)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    const body = await request.json();
    const { name, segment, currency } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 });
    }

    // Generate a unique slug for non-Shopify stores to avoid idx_shopify_domain conflict
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const uniqueDomain = `manual-${slug}-${Date.now().toString(36)}.worder.local`

    const storeData = {
      organization_id: profile.organization_id,
      shop_name: name.trim(),
      shop_domain: uniqueDomain,
      access_token: 'manual',
      is_active: true,
      status: 'pending',
      currency: currency || 'BRL',
      settings: {
        segment: segment || '',
        source: 'manual',
      },
      installed_at: new Date().toISOString(),
    };

    const { data: store, error: insertError } = await supabase
      .from('shopify_stores')
      .insert(storeData)
      .select()
      .single();

    if (insertError) {
      console.error('[/api/stores POST] Error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ store });
  } catch (error: any) {
    console.error('[/api/stores POST] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
