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
import { normalizePublicHost, publicStoreHost, normalizePhone } from '@/lib/shopify/store-url';
import { isTombstoneStore } from '@/lib/stores/placeholder';
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
          // shop.json traz `domain` = domínio principal público (o que o
          // cliente vê) e `myshopify_domain` = host da API. {{store_url}}
          // sai do primeiro.
          primary_domain: normalizePublicHost(shopData.domain) || null,
          primary_domain_checked_at: new Date().toISOString(),
          shop_phone: normalizePhone(shopData.phone) || null,
          currency: shopData.currency,
          timezone: shopData.timezone,
          is_active: true,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existingStore.id);

      if (updateError) throw updateError;

      // Re-run install-extras on every reconnect. The merchant only
      // ever hits this path after either (a) a fresh OAuth/manual
      // connect or (b) updating the access_token because they bumped
      // scopes — both are exactly the moments when the script tag /
      // theme.liquid / webhooks / pixel might be missing or stale.
      // Idempotent on the install-extras side, fire-and-forget so the
      // connect endpoint stays sub-second.
      fireInstallExtras(existingStore.id);

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
        primary_domain: normalizePublicHost(shopData.domain) || null,
        primary_domain_checked_at: new Date().toISOString(),
        shop_phone: normalizePhone(shopData.phone) || null,
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

    // A loja nasce com remetente próprio: <nome-da-loja>@worder.email,
    // único na Worder. Nunca herda o remetente de outra loja.
    try {
      const { ensureStoreSharedSender } = await import('@/lib/email/shared-sender');
      await ensureStoreSharedSender(newStore.id);
    } catch (e) {
      console.warn('[Connect] remetente compartilhado não alocado:', (e as Error).message);
    }

    // First connect — kick off install-extras so the merchant doesn't
    // have to click anything to get the storefront script tag, web
    // pixel, and webhooks wired. Async fire-and-forget (it takes a
    // few seconds to round-trip the Shopify admin API).
    fireInstallExtras(newStore.id);

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

// Internal helper: call install-extras for a store without holding up
// the response. install-extras is auth-protected so we POST with the
// CRON_SECRET header to bypass user-auth. Failures are logged but never
// surfaced to the merchant — connect succeeds either way; if install
// fails the dashboard banner will show the retry CTA.
function fireInstallExtras(storeId: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const secret = process.env.CRON_SECRET || '';
  if (!baseUrl) return;
  fetch(`${baseUrl}/api/shopify/install-extras`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
      'X-Internal-Request': 'true',
    },
    body: JSON.stringify({ storeId }),
    // keepalive ensures the request survives even if the connect
    // response races ahead and the function instance recycles.
    keepalive: true,
  }).catch((err) => {
    console.warn('[Connect] install-extras fire-and-forget failed:', err?.message);
  });
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

    // ✅ 2. Buscar lojas ATIVAS de TODAS as organizações.
    // Archived / disconnected / soft-deleted stores keep their row for
    // audit (so we can re-link orders if the merchant reconnects), but
    // they have no business showing up in the store switcher — the
    // dropdown was listing "Based / archived-...", "Based / manual-..."
    // alongside the live Dr. Melaxin row and the merchant kept getting
    // dropped onto a dead store.
    const { data: allStores, error } = await supabaseAdmin
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const stores = (allStores || []).filter((s: any) => {
      // Cleanup tombstones we keep around so old foreign keys still
      // resolve. Só as ARQUIVADAS: a linha manual-*.worder.local de uma
      // loja recém-criada, ainda sem integração, é uma loja de verdade
      // e some do switcher se cair aqui — era o que acontecia com quem
      // escolhia "configurar integração depois".
      if (isTombstoneStore(s)) return false;
      // REAL stores stay listed whatever the connection state. This
      // used to also drop is_active=false / status='disconnected'
      // rows, but this endpoint feeds the same zustand list as the
      // sidebar switcher — the moment any page refreshed through it,
      // a disconnected loja (Dr. Groot, 17/08) vanished from the
      // switcher and the selection silently jumped to another store,
      // even though all her contacts/automations/history still exist.
      // Disconnecting Shopify must flag the loja (isActive:false,
      // connectionStatus:'disconnected'), never hide it.
      return true;
    });

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
        // Host que o cliente vê — o que {{store_url}} usa.
        publicDomain: publicStoreHost(s) || null,
        primary_domain: s.primary_domain || null,
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
