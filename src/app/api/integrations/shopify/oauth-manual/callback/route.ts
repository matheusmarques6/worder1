// =============================================
// Shopify OAuth Manual — callback
// GET /api/integrations/shopify/oauth-manual/callback
//
// Público (está em middleware publicApiRoutes): quem chega aqui pode
// ser o dono da loja autorizando de outro navegador, sem sessão
// Worder. Segurança vem do state de uso único (oauth_states) + HMAC da
// query assinado com o Client Secret do app (que só nós e a Shopify
// conhecemos).
//
// Troca o code por um token OFFLINE (não expira) e grava a loja com o
// mesmo shape do connect manual, marcando settings.auth_mode='oauth'
// para o refresh de client_credentials (cron + ensureFreshToken) nunca
// tocar nesse token. token_expires_at fica null pelo mesmo motivo.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';

const REQUIRED_WEBHOOKS = [
  'orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'orders/fulfilled',
  'checkouts/create', 'checkouts/update',
  'customers/create', 'customers/update', 'customers/delete',
  'products/create', 'products/update', 'products/delete',
  'refunds/create',
  'fulfillments/create', 'fulfillments/update',
  'app/uninstalled',
];

function redirectTo(appUrl: string, path: string) {
  return NextResponse.redirect(`${appUrl}${path}`);
}

export async function GET(request: NextRequest) {
  const { getAppBaseUrl } = await import('@/lib/app-url');
  const APP_URL = getAppBaseUrl();
  const supabase = getSupabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const shop = (searchParams.get('shop') || '').toLowerCase();
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      return redirectTo(APP_URL, '/integrations/shopify?error=oauth_denied');
    }
    if (!code || !shop || !state) {
      return redirectTo(APP_URL, '/integrations/shopify?error=missing_params');
    }

    // ── State de uso único ──
    // Schema vivo: (state, provider, metadata). Fallback pro formato
    // antigo (state_token, data) usado pelo fluxo oficial em CI/dev.
    let pending: any = null;
    const nowIso = new Date().toISOString();
    {
      const { data: row, error: readErr } = await supabase
        .from('oauth_states')
        .select('metadata')
        .eq('state', state)
        .eq('provider', 'shopify_manual_oauth')
        .gte('expires_at', nowIso)
        .maybeSingle();
      if (!readErr && row?.metadata) pending = row.metadata;
      if (readErr) {
        const { data: legacy } = await supabase
          .from('oauth_states')
          .select('data')
          .eq('state_token', state)
          .gte('expires_at', nowIso)
          .maybeSingle();
        if (legacy?.data) pending = legacy.data;
      }
    }
    if (!pending || pending.provider !== 'shopify_manual_oauth') {
      return redirectTo(APP_URL, '/integrations/shopify?error=invalid_state');
    }
    // Consumir o state ANTES do exchange — replay do mesmo link não pode
    // gerar um segundo token. (delete nos dois formatos, best-effort)
    const del = await supabase.from('oauth_states').delete().eq('state', state);
    if (del.error) {
      await supabase.from('oauth_states').delete().eq('state_token', state);
    }

    const organizationId: string = pending.organization_id;
    const clientId: string = pending.client_id;
    const clientSecret: string = pending.client_secret;
    const targetStoreId: string | null = pending.store_id || null;

    if (shop !== String(pending.shop || '').toLowerCase()) {
      console.error('[ShopifyOAuthManual] shop mismatch:', shop, 'vs', pending.shop);
      return redirectTo(APP_URL, '/integrations/shopify?error=invalid_state');
    }

    // ── HMAC (assinado com o Client Secret do app) ──
    // Estrito: aqui sempre temos o secret, diferente do callback do app
    // oficial que tolera env ausente.
    if (!hmac) {
      return redirectTo(APP_URL, '/integrations/shopify?error=hmac_invalid');
    }
    const params = new URLSearchParams(searchParams);
    params.delete('hmac');
    params.sort();
    const expectedHmac = crypto
      .createHmac('sha256', clientSecret)
      .update(params.toString())
      .digest('hex');
    try {
      if (!crypto.timingSafeEqual(Buffer.from(expectedHmac, 'hex'), Buffer.from(hmac, 'hex'))) {
        return redirectTo(APP_URL, '/integrations/shopify?error=hmac_invalid');
      }
    } catch {
      return redirectTo(APP_URL, '/integrations/shopify?error=hmac_invalid');
    }

    // ── Troca do code por token OFFLINE ──
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      console.error('[ShopifyOAuthManual] token exchange failed:', tokenRes.status, errText.slice(0, 300));
      return redirectTo(APP_URL, '/integrations/shopify?error=token_failed');
    }
    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const grantedScopes: string = tokenData.scope || '';
    const scopesList = grantedScopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!accessToken) {
      return redirectTo(APP_URL, '/integrations/shopify?error=token_failed');
    }

    // ── Shop info (nome, moeda, shop_id canônico, myshopifyDomain) ──
    let shopName = shop;
    let shopEmail = '';
    let currency = 'BRL';
    let planName = '';
    let timezone = '';
    let permanentDomain: string | null = null;
    let shopifyShopId: string | null = null;
    try {
      const infoRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `{ shop { id name email currencyCode timezoneAbbreviation myshopifyDomain plan { displayName } } }`,
        }),
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        const s = info.data?.shop;
        if (s) {
          shopName = s.name || shop;
          shopEmail = s.email || '';
          currency = s.currencyCode || 'BRL';
          planName = s.plan?.displayName || '';
          timezone = s.timezoneAbbreviation || '';
          permanentDomain = (s.myshopifyDomain || '').toLowerCase() || null;
          if (s.id) {
            const m = String(s.id).match(/Shop\/(\d+)/);
            shopifyShopId = m ? m[1] : String(s.id);
          }
        }
      }
    } catch (err) {
      console.warn('[ShopifyOAuthManual] shop info failed:', err);
    }

    // ── Linha alvo: storeId explícito (reativação) ou cascade de dedup
    // igual ao connect manual (shop_id → domínio → alias). ──
    let existingStore: { id: string; shop_domain: string; shop_domain_aliases?: string[] } | null = null;

    if (targetStoreId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, shop_domain_aliases')
        .eq('id', targetStoreId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (data) existingStore = data as any;
    }
    if (!existingStore && shopifyShopId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, shop_domain_aliases')
        .eq('organization_id', organizationId)
        .eq('shopify_shop_id', shopifyShopId)
        .maybeSingle();
      if (data) existingStore = data as any;
    }
    if (!existingStore) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, shop_domain_aliases')
        .eq('organization_id', organizationId)
        .eq('shop_domain', shop)
        .maybeSingle();
      if (data) existingStore = data as any;
    }
    if (!existingStore) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, shop_domain_aliases')
        .eq('organization_id', organizationId)
        .contains('shop_domain_aliases', [shop])
        .maybeSingle();
      if (data) existingStore = data as any;
    }

    // Domínio primário = canônico da Shopify; o que veio na query e o
    // domínio antigo da linha viram aliases (mesma regra do manual).
    const canonicalDomain = permanentDomain && permanentDomain !== shop ? permanentDomain : shop;
    const aliasSet = new Set<string>();
    if (existingStore?.shop_domain_aliases) {
      for (const a of existingStore.shop_domain_aliases) aliasSet.add(String(a).toLowerCase());
    }
    if (existingStore?.shop_domain && existingStore.shop_domain.toLowerCase() !== canonicalDomain) {
      aliasSet.add(existingStore.shop_domain.toLowerCase());
    }
    if (shop !== canonicalDomain) aliasSet.add(shop);
    aliasSet.delete(canonicalDomain);

    // Liberar o domínio canônico se outra linha (inativa) o segura —
    // linha ATIVA de outra loja é conflito real.
    {
      const { data: blockers } = await supabase
        .from('shopify_stores')
        .select('id, is_active')
        .eq('organization_id', organizationId)
        .eq('shop_domain', canonicalDomain)
        .neq('id', existingStore?.id || '00000000-0000-0000-0000-000000000000');
      for (const b of (blockers || []) as any[]) {
        if (b.is_active) {
          return redirectTo(APP_URL, '/integrations/shopify?error=domain_conflict');
        }
        await supabase
          .from('shopify_stores')
          .update({ shop_domain: `archived-${b.id}.worder.local`, updated_at: new Date().toISOString() })
          .eq('id', b.id);
      }
    }

    const storeRecord: Record<string, any> = {
      organization_id: organizationId,
      shop_domain: canonicalDomain,
      shop_domain_aliases: Array.from(aliasSet),
      shopify_shop_id: shopifyShopId,
      shop_name: shopName,
      shop_email: shopEmail,
      access_token: accessToken,
      api_secret: clientSecret,
      client_id: clientId,
      currency,
      timezone,
      plan_name: planName,
      api_version: SHOPIFY_API_VERSION,
      scopes: scopesList,
      is_active: true,
      status: 'active',
      connection_status: 'active',
      status_message: null,
      status_code: null,
      connection_type: 'manual',
      installed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      // Token offline do authorization code: não expira e NÃO pode ser
      // renovado via client_credentials (app de outra organização).
      token_expires_at: null,
      pixel_installed: false,
      webhook_secret: clientSecret,
      embed_installed: false,
      sync_orders: true,
      sync_customers: true,
      sync_checkouts: true,
      sync_products: true,
      sync_refunds: true,
      settings: {
        auth_mode: 'oauth',
        theme_editor_url: `https://${shop}/admin/themes/current/editor?context=apps`,
        tracking_endpoint: `${APP_URL}/api/shopify/track`,
      },
    };

    let storeId: string;
    if (existingStore) {
      const { error } = await supabase.from('shopify_stores').update(storeRecord).eq('id', existingStore.id);
      if (error) {
        console.error('[ShopifyOAuthManual] store update failed:', error);
        return redirectTo(APP_URL, '/integrations/shopify?error=save_failed');
      }
      storeId = existingStore.id;
    } else {
      const { data, error } = await supabase.from('shopify_stores').insert(storeRecord).select('id').single();
      if (error || !data) {
        console.error('[ShopifyOAuthManual] store insert failed:', error);
        return redirectTo(APP_URL, '/integrations/shopify?error=save_failed');
      }
      storeId = data.id;
    }

    // ── Webhooks (REST, mesmos 17 tópicos e URL do connect manual) ──
    const webhookUrl = `${APP_URL}/api/webhooks/shopify?store_id=${storeId}`;
    let existingTopics: string[] = [];
    try {
      const listRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
      if (listRes.ok) {
        const json = await listRes.json();
        existingTopics = (json.webhooks || [])
          .filter((w: any) => w.address === webhookUrl)
          .map((w: any) => w.topic);
      }
    } catch { /* best-effort */ }

    let webhooksOk = 0;
    for (const topic of REQUIRED_WEBHOOKS) {
      if (existingTopics.includes(topic)) { webhooksOk++; continue; }
      try {
        const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: 'json' } }),
        });
        if (res.ok) webhooksOk++;
        else {
          const errBody = await res.text().catch(() => '');
          console.warn(`[ShopifyOAuthManual] webhook ${topic} failed: ${res.status} ${errBody.slice(0, 150)}`);
        }
      } catch { /* segue */ }
    }

    // ── Pixel automático quando o escopo permite ──
    let pixelInstalled = false;
    if (scopesList.includes('write_pixels')) {
      try {
        const pixelRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              mutation webPixelCreate($webPixel: WebPixelInput!) {
                webPixelCreate(webPixel: $webPixel) {
                  webPixel { id }
                  userErrors { code field message }
                }
              }
            `,
            variables: {
              webPixel: {
                settings: JSON.stringify({
                  accountId: organizationId,
                  storeId,
                  trackingEndpoint: `${APP_URL}/api/track/event`,
                }),
              },
            },
          }),
        });
        if (pixelRes.ok) {
          const pixelData = await pixelRes.json();
          const errors = pixelData.data?.webPixelCreate?.userErrors || [];
          if (errors.length === 0 || errors.some((e: any) => e.message?.includes('already') || e.message?.includes('exists'))) {
            pixelInstalled = true;
            await supabase.from('shopify_stores').update({ pixel_installed: true }).eq('id', storeId);
          }
        }
      } catch (err) {
        console.warn('[ShopifyOAuthManual] pixel install failed:', err);
      }
    }

    // ── Limpeza de placeholders do AddStoreModal (nunca archived-*) ──
    try {
      const { data: placeholders } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('organization_id', organizationId)
        .like('shop_domain', 'manual-%.worder.local')
        .neq('id', storeId);
      for (const p of (placeholders || []) as any[]) {
        await supabase.from('shopify_stores').delete().eq('id', p.id);
      }
    } catch { /* best-effort */ }

    // ── Sync inicial (fire-and-forget) ──
    try {
      fetch(`${APP_URL}/api/shopify/trigger-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Request': 'true' },
        body: JSON.stringify({ storeId }),
      }).catch(() => {});
    } catch { /* ignore */ }

    console.log(`[ShopifyOAuthManual] connected shop=${shop} store=${storeId} webhooks=${webhooksOk}/${REQUIRED_WEBHOOKS.length} pixel=${pixelInstalled}`);

    // Sem write_pixels o merchant precisa colar o Custom Pixel — cair
    // direto no wizard, igual ao fim do connect manual.
    if (!pixelInstalled) {
      return redirectTo(APP_URL, `/integrations/shopify/install-pixel?storeId=${storeId}`);
    }
    return redirectTo(APP_URL, `/integrations/shopify?success=true&store=${storeId}&webhooks=${webhooksOk}&pixel=${pixelInstalled}`);
  } catch (error: any) {
    console.error('[ShopifyOAuthManual] callback error:', error);
    return redirectTo(APP_URL, `/integrations/shopify?error=${encodeURIComponent(error?.message || 'internal')}`);
  }
}
