import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { name, domain, accessToken, apiSecret } = body;

    // ✅ MUDANÇA: apiSecret agora é OPCIONAL
    if (!name || !domain || !accessToken) {
      return NextResponse.json(
        { error: 'Nome, domínio e access token são obrigatórios' },
        { status: 400 }
      );
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/\s+/g, '');
    const shopDomain = cleanDomain.includes('.myshopify.com') 
      ? cleanDomain 
      : `${cleanDomain}.myshopify.com`;

    // Verify access token
    const shopResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/shop.json`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken.trim(),
          'Content-Type': 'application/json',
        },
      }
    );

    if (!shopResponse.ok) {
      if (shopResponse.status === 401) {
        return NextResponse.json({ error: 'Access Token inválido' }, { status: 401 });
      }
      if (shopResponse.status === 404) {
        return NextResponse.json({ error: `Loja não encontrada: ${shopDomain}` }, { status: 404 });
      }
      return NextResponse.json({ error: 'Erro ao conectar com Shopify' }, { status: 400 });
    }

    const { shop: shopData } = await shopResponse.json();

    // Check if store already exists
    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    if (existingStore) {
      const { error: updateError } = await supabase
        .from('shopify_stores')
        .update({
          shop_name: name,
          access_token: accessToken.trim(),
          api_secret: apiSecret?.trim() || null, // ✅ Permite null
          shop_email: shopData.email,
          currency: shopData.currency,
          timezone: shopData.timezone,
          is_active: true,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existingStore.id);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: 'Loja atualizada com sucesso',
        store: { id: existingStore.id, name, domain: shopDomain },
      });
    }

    const { data: newStore, error: insertError } = await supabase
      .from('shopify_stores')
      .insert({
        organization_id: organizationId,
        shop_domain: shopDomain,
        shop_name: name,
        shop_email: shopData.email,
        access_token: accessToken.trim(),
        api_secret: apiSecret?.trim() || null, // ✅ Permite null
        currency: shopData.currency,
        timezone: shopData.timezone,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: 'Loja conectada com sucesso',
      store: { id: newStore.id, name: newStore.shop_name, domain: newStore.shop_domain },
    });
  } catch (error: any) {
    console.error('Connect store error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao conectar loja' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, shop_email, currency, is_active, total_orders, total_revenue, last_sync_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      stores: stores?.map(s => ({
        id: s.id,
        name: s.shop_name,
        domain: s.shop_domain,
        email: s.shop_email,
        currency: s.currency,
        isActive: s.is_active,
        totalOrders: s.total_orders,
        totalRevenue: s.total_revenue,
        lastSyncAt: s.last_sync_at,
      })) || [],
    });
  } catch (error: any) {
    console.error('List stores error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao buscar lojas' }, { status: 500 });
  }
}
