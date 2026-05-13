// ===============================
// CORREÇÃO: /api/shopify/connect/route.ts
// ===============================
// MUDANÇAS:
// 1. Incluir organization_id no response
// 2. Buscar lojas de TODAS as organizações que o usuário é membro

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SupabaseClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

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
      `https://${shopDomain}/admin/api/2026-04/shop.json`,
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
          api_secret: apiSecret?.trim() || null,
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
        api_secret: apiSecret?.trim() || null,
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

// ✅ GET CORRIGIDO - Retorna organization_id e busca de todas as orgs do usuário
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  try {
    // ✅ 1. Buscar todas as organizações que o usuário é membro
    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    // Criar lista de org IDs (inclui a org padrão do usuário)
    let orgIds: string[] = [userOrgId];
    if (memberships && memberships.length > 0) {
      const memberOrgIds = memberships.map(m => m.organization_id);
      orgIds = [...new Set([...orgIds, ...memberOrgIds])]; // Remove duplicados
    }

    // ✅ 2. Buscar lojas de TODAS as organizações (incluindo novos campos)
    const { data: stores, error } = await supabaseAdmin
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // ✅ 3. Buscar nomes das organizações
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);
    
    const orgMap = new Map(orgs?.map(o => [o.id, o.name]) || []);

    // ✅ 4. Retornar COM todos os campos
    return NextResponse.json({
      stores: stores?.map(s => ({
        id: s.id,
        organization_id: s.organization_id,
        organization_name: orgMap.get(s.organization_id) || 'Organização',
        name: s.shop_name,
        shop_name: s.shop_name,
        domain: s.shop_domain,
        shop_domain: s.shop_domain,
        email: s.shop_email,
        shop_email: s.shop_email,
        currency: s.currency,
        isActive: s.is_active,
        is_active: s.is_active,
        connectionStatus: s.connection_status || (s.is_active ? 'active' : 'disconnected'),
        connection_status: s.connection_status || (s.is_active ? 'active' : 'disconnected'),
        status: s.status,
        totalOrders: s.total_orders || 0,
        total_orders: s.total_orders || 0,
        totalRevenue: s.total_revenue || 0,
        total_revenue: s.total_revenue || 0,
        totalCustomers: s.total_customers || 0,
        total_customers: s.total_customers || 0,
        lastSyncAt: s.last_sync_at,
        last_sync_at: s.last_sync_at,
        // New fields from GraphQL migration
        api_version: s.api_version,
        plan_name: s.plan_name,
        pixel_installed: s.pixel_installed,
        embed_installed: s.embed_installed,
        embed_installed_at: s.embed_installed_at,
        webhooks_registered: s.webhooks_registered,
        // Distinguishes OAuth (Theme App Embed available) from manual
        // / Custom App (merchant pastes loader.js into theme.liquid).
        // The forms dashboard renders different activation instructions
        // for each — without this, manual stores see "ative o app embed"
        // pointing nowhere.
        connection_type: s.connection_type || 'oauth',
        initial_sync_completed: s.initial_sync_completed,
        installed_at: s.installed_at,
        settings: s.settings,
      })) || [],
    });
  } catch (error: any) {
    console.error('List stores error:', error);
    return NextResponse.json({ error: error.message || 'Erro ao buscar lojas' }, { status: 500 });
  }
}
