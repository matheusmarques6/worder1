// =============================================
// Shopify OAuth Manual — start
// POST /api/integrations/shopify/oauth-manual/start
//
// Conexão via authorization code grant usando o Client ID/Secret de um
// app PRÓPRIO do operador (custom distribution). Existe porque o
// client_credentials da Integração Manual só funciona quando o app foi
// criado na MESMA organização Shopify dona da loja — o modelo agência
// (app da Convertfy, loja do cliente) cai em shop_not_permitted sempre.
// O authorization code grant funciona entre organizações e devolve um
// token offline que não expira.
//
// Requisito no Dev Dashboard do app: adicionar a Redirect URL
//   {APP_URL}/api/integrations/shopify/oauth-manual/callback
//
// Body: { domain, clientId, clientSecret, storeId? }
//   storeId → reativação/troca: o callback atualiza ESSA linha em vez
//   de criar/dedupar, preservando automações/histórico vinculados.
// Retorna: { authUrl, redirectUri }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveShopDomainInput } from '@/lib/shopify/resolve-domain';
import { getAppBaseUrl } from '@/lib/app-url';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Mesmo conjunto do connect manual (REQUIRED + RECOMMENDED). Para apps
// de Dev Dashboard o grant fica limitado ao que o app tem configurado —
// pedir a mais não quebra a autorização.
const SCOPES = [
  'read_orders',
  'read_all_orders',
  'read_customers',
  'read_products',
  'read_checkouts',
  'read_discounts',
  'read_fulfillments',
  'read_customer_events',
  'write_pixels',
  'write_script_tags',
].join(',');

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { domain, clientId, clientSecret, storeId, allowCreate } = body || {};

    if (!domain || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Domínio, Client ID e Client Secret são obrigatórios' },
        { status: 400 }
      );
    }

    const resolved = await resolveShopDomainInput(String(domain));
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const shopDomain = resolved.shopDomain;

    const supabase = getSupabaseAdmin();

    // Reativação: a linha alvo precisa existir e ser da org do caller.
    if (storeId) {
      const { data: target } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!target) {
        return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
      }
    }

    // Fail-fast: se outra loja ATIVA da org já usa esse domínio (primário
    // ou alias), o OAuth terminaria em domain_conflict só no callback —
    // melhor recusar aqui, antes de mandar o merchant autorizar na
    // Shopify. O check por shopify_shop_id do callback continua como
    // backstop (cobre domínio digitado ≠ canônico). Em schema antigo sem
    // shop_domain_aliases o .or retorna erro → data null → no-op.
    {
      const { data: colliding } = await supabase
        .from('shopify_stores')
        .select('id, shop_name, shop_domain')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .or(`shop_domain.eq.${shopDomain},shop_domain_aliases.cs.{${shopDomain}}`)
        .neq('id', storeId || '00000000-0000-0000-0000-000000000000')
        .limit(1)
        .maybeSingle();
      if (colliding) {
        return NextResponse.json({
          error: `Outra loja ativa (${colliding.shop_name || colliding.shop_domain}) já usa ${shopDomain}. Mescle ou desative-a antes de conectar.`,
          collidingStoreId: colliding.id,
          collidingStoreName: colliding.shop_name ?? null,
          collidingStoreDomain: colliding.shop_domain ?? null,
        }, { status: 409 });
      }
    }

    // State de uso único. O callback é público (o clique final pode vir
    // do navegador do DONO da loja, sem sessão Worder) — todo o contexto
    // viaja por aqui, nunca pela sessão.
    //
    // O schema VIVO de oauth_states é (state, provider, organization_id,
    // metadata, expires_at); o schema que o fluxo OAuth oficial assume é
    // (state_token, data, expires_at). Gravamos no vivo primeiro e caímos
    // pro formato antigo se as colunas não existirem (CI/dev).
    const state = crypto.randomBytes(32).toString('hex');
    const pendingPayload = {
      provider: 'shopify_manual_oauth',
      organization_id: organizationId,
      user_id: auth.user.id,
      shop: shopDomain,
      client_id: String(clientId).trim(),
      client_secret: String(clientSecret).trim(),
      store_id: storeId || null,
      // Alterar integração nunca cria loja: o callback só insere linha
      // nova com esta flag (fluxo "Adicionar loja") ou em org sem lojas.
      allow_create: allowCreate === true,
    };
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    let { error: stateErr } = await supabase.from('oauth_states').insert({
      state,
      provider: 'shopify_manual_oauth',
      organization_id: organizationId,
      metadata: pendingPayload,
      expires_at: expiresAt,
    });
    if (stateErr) {
      const retry = await supabase.from('oauth_states').insert({
        state_token: state,
        data: pendingPayload,
        expires_at: expiresAt,
      });
      stateErr = retry.error;
    }
    if (stateErr) {
      console.error('[ShopifyOAuthManual] state insert failed:', stateErr);
      return NextResponse.json({ error: 'Falha ao iniciar o fluxo OAuth' }, { status: 500 });
    }

    const redirectUri = `${getAppBaseUrl()}/api/integrations/shopify/oauth-manual/callback`;
    const authUrl =
      `https://${shopDomain}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: String(clientId).trim(),
        scope: SCOPES,
        redirect_uri: redirectUri,
        state,
      }).toString();

    return NextResponse.json({ authUrl, redirectUri, shopDomain });
  } catch (error: any) {
    console.error('[ShopifyOAuthManual] start error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
