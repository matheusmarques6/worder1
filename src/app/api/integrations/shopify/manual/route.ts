// =============================================
// Shopify Manual Integration API (Client Credentials Grant)
// POST /api/integrations/shopify/manual
//
// Merchant flow:
//   1. Merchant creates a custom app in the Shopify Dev Dashboard,
//      configures scopes, installs it on their store.
//   2. Merchant copies Client ID + Client Secret (NOT an access token
//      — since Jan 2026 custom apps don't expose access tokens).
//   3. Merchant pastes { domain, clientId, clientSecret } here.
//   4. We exchange credentials for a 24h access token via
//      grant_type=client_credentials, persist it, and the
//      /api/cron/shopify-token-refresh cron renews it every ~23h.
//
// Produces the exact same shopify_stores row shape as the OAuth
// callback so the rest of the product (webhooks, sync, tracking)
// doesn't care which connection_type was used.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAccessTokenViaClientCredentials } from '@/lib/shopify/client-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const SHOPIFY_API_VERSION = '2025-01';

const REQUIRED_SCOPES = ['read_orders', 'read_customers', 'read_products'];

// 17 webhook topics — must match the OAuth callback exactly so both
// connection modes produce identical event coverage.
const REQUIRED_WEBHOOKS = [
  'orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'orders/fulfilled',
  'checkouts/create', 'checkouts/update',
  'customers/create', 'customers/update', 'customers/delete',
  'products/create', 'products/update', 'products/delete',
  'refunds/create',
  'fulfillments/create', 'fulfillments/update',
  'app/uninstalled',
];

function normalizeShopDomain(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (cleaned.endsWith('.myshopify.com')) return cleaned;
  return `${cleaned}.myshopify.com`;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { domain, clientId, clientSecret } = body || {};

    if (!domain || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Domínio, Client ID e Client Secret são obrigatórios' },
        { status: 400 }
      );
    }

    const shopDomain = normalizeShopDomain(String(domain));
    const cleanClientId = String(clientId).trim();
    const cleanClientSecret = String(clientSecret).trim();

    // ──────────────────────────────────────────
    // 1. Exchange credentials for an access token
    // ──────────────────────────────────────────
    let tokenResult;
    try {
      tokenResult = await getAccessTokenViaClientCredentials(
        shopDomain,
        cleanClientId,
        cleanClientSecret
      );
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const accessToken = tokenResult.access_token;
    const grantedScopesStr = tokenResult.scope;
    const expiresIn = tokenResult.expires_in;

    console.log('[Shopify Manual] Raw scope string:', JSON.stringify(grantedScopesStr));

    // Shopify returns scopes space-separated OR comma-separated depending on endpoint
    const scopesList = grantedScopesStr
      ? grantedScopesStr.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean)
      : [];

    console.log('[Shopify Manual] Parsed scopes:', scopesList, 'expires_in=', expiresIn);

    // ──────────────────────────────────────────
    // 2. Verify required scopes
    // write_X implies read_X in Shopify, so check both
    // ──────────────────────────────────────────
    const hasScope = (required: string) => {
      if (scopesList.includes(required)) return true
      if (required.startsWith('read_')) {
        const writeVariant = required.replace('read_', 'write_')
        if (scopesList.includes(writeVariant)) return true
      }
      return false
    }
    const missingScopes = REQUIRED_SCOPES.filter((s) => !hasScope(s));
    if (missingScopes.length > 0) {
      return NextResponse.json(
        {
          error: `O app não tem as permissões necessárias. Faltam: ${missingScopes.join(', ')}. Configure os escopos no Dev Dashboard e reinstale o app.`,
          missingScopes,
          grantedScopes: scopesList,
        },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────
    // 3. Fetch shop info via GraphQL (name, email, currency, plan)
    // ──────────────────────────────────────────
    let shopName = shopDomain;
    let shopEmail = '';
    let currency = 'BRL';
    let planName = '';
    let timezone = '';

    try {
      const shopInfoRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `{ shop { name email currencyCode timezoneAbbreviation plan { displayName } } }`,
          }),
        }
      );

      if (shopInfoRes.ok) {
        const shopInfo = await shopInfoRes.json();
        const s = shopInfo.data?.shop;
        if (s) {
          shopName = s.name || shopDomain;
          shopEmail = s.email || '';
          currency = s.currencyCode || 'BRL';
          planName = s.plan?.displayName || '';
          timezone = s.timezoneAbbreviation || '';
        }
      }
    } catch (err) {
      console.warn('[Shopify Manual] Failed to get shop info:', err);
    }

    // ──────────────────────────────────────────
    // 4. Upsert the store
    // ──────────────────────────────────────────
    const supabase = getSupabaseAdmin();
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: existingStore } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('shop_domain', shopDomain)
      .maybeSingle();

    const storeRecord: Record<string, any> = {
      organization_id: organizationId,
      shop_domain: shopDomain,
      shop_name: shopName,
      shop_email: shopEmail,
      access_token: accessToken,
      // api_secret holds the Client Secret — used to:
      //  (a) verify HMAC on inbound webhooks, and
      //  (b) refresh the access token every ~23h.
      api_secret: cleanClientSecret,
      client_id: cleanClientId,
      currency,
      timezone,
      plan_name: planName,
      api_version: SHOPIFY_API_VERSION,
      scopes: scopesList,
      is_active: true,
      status: 'active',
      connection_type: 'manual',
      installed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      token_expires_at: tokenExpiresAt,
      pixel_installed: false,
      webhook_secret: cleanClientSecret,
      embed_installed: false,
      // Enable all sync flags by default — essential for checkouts/orders/customers
      sync_orders: true,
      sync_customers: true,
      sync_checkouts: true,
      sync_products: true,
      sync_refunds: true,
      settings: {
        theme_editor_url: `https://${shopDomain}/admin/themes/current/editor?context=apps`,
        tracking_endpoint: `${APP_URL}/api/shopify/track`,
      },
    };

    let storeId: string;
    if (existingStore) {
      const { error: updErr } = await supabase
        .from('shopify_stores')
        .update(storeRecord)
        .eq('id', existingStore.id);
      if (updErr) throw updErr;
      storeId = existingStore.id;
    } else {
      const { data: newStore, error: insErr } = await supabase
        .from('shopify_stores')
        .insert(storeRecord)
        .select('id')
        .single();
      if (insErr) throw insErr;
      storeId = newStore!.id;
    }

    // ──────────────────────────────────────────
    // 5. Register 17 webhooks (skip any that already exist for this URL)
    // ──────────────────────────────────────────
    const webhookUrl = `${APP_URL}/api/webhooks/shopify`;
    let existingTopics: string[] = [];
    try {
      const listRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (listRes.ok) {
        const json = await listRes.json();
        existingTopics = (json.webhooks || [])
          .filter((w: any) => w.address === webhookUrl)
          .map((w: any) => w.topic);
      }
    } catch { /* best-effort */ }

    let created = 0;
    let existingCount = 0;
    let failed = 0;
    const failedTopics: string[] = [];
    const failReasons: string[] = [];

    for (const topic of REQUIRED_WEBHOOKS) {
      if (existingTopics.includes(topic)) {
        existingCount++;
        continue;
      }
      try {
        const res = await fetch(
          `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              webhook: { topic, address: webhookUrl, format: 'json' },
            }),
          }
        );
        if (res.ok) {
          created++;
        } else {
          failed++;
          failedTopics.push(topic);
          const errBody = await res.text().catch(() => '');
          const reason = `${res.status}: ${errBody.slice(0, 200)}`;
          failReasons.push(reason);
          console.warn(`[Shopify Manual] Webhook ${topic} failed: ${reason}`);
        }
      } catch (err: any) {
        failed++;
        failedTopics.push(topic);
        failReasons.push(err?.message || 'fetch error');
      }
    }

    if (failed > 0) {
      console.warn(`[Shopify Manual] ${failed} webhooks failed. Topics: ${failedTopics.join(', ')}`);
    }

    // ──────────────────────────────────────────
    // 6. Trigger initial sync (fire-and-forget)
    // ──────────────────────────────────────────
    let syncTriggered = false;
    try {
      fetch(`${APP_URL}/api/shopify/trigger-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Request': 'true' },
        body: JSON.stringify({ storeId }),
      }).catch(() => { /* best-effort */ });
      syncTriggered = true;
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      store: {
        id: storeId,
        name: shopName,
        domain: shopDomain,
        email: shopEmail,
        currency,
        plan: planName,
      },
      token: {
        obtained: true,
        expiresIn,
        expiresAt: tokenExpiresAt,
        autoRefresh: true,
      },
      scopes: scopesList,
      webhooks: {
        total: REQUIRED_WEBHOOKS.length,
        created,
        existing: existingCount,
        failed,
        failedTopics: failed > 0 ? failedTopics : undefined,
        webhookUrl,
        manualSetupRequired: failed > 0 && created === 0 && existingCount === 0,
      },
      sync: { triggered: syncTriggered },
    });
  } catch (err: any) {
    console.error('[Shopify Manual] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao conectar loja' },
      { status: 500 }
    );
  }
}
