import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isTombstoneStore } from '@/lib/stores/placeholder';

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

    // Fetch ALL stores from the user's organizations (don't filter is_active
    // — a temporarily disconnected store should still appear in the sidebar
    // so the user can reconnect or view historical data)
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .order('installed_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, stores: [], error: error.message });
    }

    // Esconde só as LÁPIDES (linhas arquivadas guardadas por causa das
    // chaves estrangeiras). A loja que o usuário acabou de criar e
    // ainda não integrou também usa domínio .worder.local, e o filtro
    // antigo a apagava da lista: quem escolhia "configurar integração
    // depois" via o modal fechar e nada aparecer — a loja existia no
    // banco e era invisível para sempre.
    const realStores = (stores || []).filter((s: any) => !isTombstoneStore(s));

    return NextResponse.json({
      success: true,
      stores: realStores,
      hasStores: realStores.length > 0
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

    // A loja nasce com remetente próprio: <nome-da-loja>@worder.email,
    // único na Worder. Nunca herda o remetente de outra loja.
    try {
      const { ensureStoreSharedSender } = await import('@/lib/email/shared-sender');
      const r = await ensureStoreSharedSender(store.id);
      if (r?.settings) store.settings = { ...(store.settings || {}), email_settings: r.settings };
    } catch (e) {
      console.warn('[/api/stores POST] remetente compartilhado não alocado:', (e as Error).message);
    }

    return NextResponse.json({ store });
  } catch (error: any) {
    console.error('[/api/stores POST] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
