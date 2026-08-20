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
import { resolveShopDomainInput } from '@/lib/shopify/resolve-domain';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const SHOPIFY_API_VERSION = '2026-04';

// Required scopes for basic functionality
const REQUIRED_SCOPES = ['read_orders', 'read_customers', 'read_products'];
// Recommended scopes for full feature support (warned if missing, not blocked)
// read_all_orders is critical for stores with orders older than 60 days
// (without it, Shopify only returns last 60 days of order history).
// write_script_tags lets us inject the popup loader automatically (otherwise
// the merchant has to paste a <script> in their theme.liquid).
const RECOMMENDED_SCOPES = ['read_all_orders', 'write_pixels', 'write_script_tags', 'read_customer_events', 'read_fulfillments', 'read_discounts'];

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

// Resolução de domínio compartilhada com o fluxo OAuth manual —
// ver src/lib/shopify/resolve-domain.ts.

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

    const resolvedDomain = await resolveShopDomainInput(String(domain));
    if (!resolvedDomain.ok) {
      return NextResponse.json({ error: resolvedDomain.error }, { status: 400 });
    }
    const shopDomain = resolvedDomain.shopDomain;
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
    const missingRecommended = RECOMMENDED_SCOPES.filter((s) => !hasScope(s));
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
    // Canonical myshopifyDomain — Shopify's permanent identifier for the
    // shop, what they always send in X-Shopify-Shop-Domain headers on
    // webhooks. Often differs from what the merchant typed if they later
    // renamed the admin slug. We persist this as an alias so webhooks
    // for either domain resolve to the same store row.
    let permanentDomain: string | null = null;
    // Shopify Shop GID — the ONE identifier that never changes. We use
    // this to deduplicate reconnections: same shop_id = same store row,
    // even if the merchant typed a different domain. Without this,
    // reconnecting with a renamed myshopifyDomain produces a brand-new
    // shopify_stores row and orphans every automation/contact/segment
    // tied to the old row.
    let shopifyShopId: string | null = null;

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
            query: `{ shop { id name email currencyCode timezoneAbbreviation myshopifyDomain plan { displayName } } }`,
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
          permanentDomain = (s.myshopifyDomain || '').toLowerCase() || null;
          // Strip the gid:// prefix so we store just the numeric ID,
          // which is the format Shopify uses everywhere outside GraphQL.
          if (s.id) {
            const m = String(s.id).match(/Shop\/(\d+)/);
            shopifyShopId = m ? m[1] : String(s.id);
          }
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

    // Lookup cascade for existing store (in priority order):
    //   1. shopify_shop_id match (THE canonical identifier — same shop
    //      no matter what domain the merchant typed)
    //   2. shop_domain exact match (legacy reconnections that predate
    //      shop_id capture)
    //   3. shop_domain_aliases contains the typed domain (covers
    //      stores where the merchant previously added an alias and
    //      now reconnects under that alias)
    //
    // Without #1, a reconnection with a different domain (e.g. typed
    // sourosa.myshopify.com first, now typing lojalaclode.myshopify.com)
    // bypasses #2 and creates a brand-new row, orphaning every
    // automation, contact, segment, and analytics row tied to the
    // original store. With #1, we update the existing row in place
    // and add the new domain as an alias.
    let existingStore: { id: string; shop_domain: string; shop_domain_aliases?: string[] } | null = null;

    if (shopifyShopId) {
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
        .eq('shop_domain', shopDomain)
        .maybeSingle();
      if (data) existingStore = data as any;
    }

    if (!existingStore) {
      // Last-resort: maybe the merchant is reconnecting with a domain
      // that's already an alias of an existing row.
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, shop_domain_aliases')
        .eq('organization_id', organizationId)
        .contains('shop_domain_aliases', [shopDomain.toLowerCase()])
        .maybeSingle();
      if (data) existingStore = data as any;
    }

    // Resolve canonical domain. Shopify always sends webhooks with the
    // PERMANENT myshopifyDomain in X-Shopify-Shop-Domain — never the
    // public admin slug the merchant might have renamed. So the row's
    // primary shop_domain MUST be the canonical one for webhook
    // resolution to be O(1) (exact match instead of falling back to
    // alias scan). When the merchant typed a different (renamed) slug,
    // we swap automatically: canonical becomes primary, what they typed
    // becomes an alias.
    //
    // Example (Based store):
    //   merchant types:  sourosa.myshopify.com
    //   GraphQL returns: lojalaclode.myshopify.com  ← canonical
    //   result row:
    //     shop_domain         = lojalaclode.myshopify.com  (primary)
    //     shop_domain_aliases = [sourosa.myshopify.com]    (back-compat)
    const userTypedDomain = String(shopDomain).toLowerCase();
    const canonicalDomain = (permanentDomain && permanentDomain !== userTypedDomain)
      ? permanentDomain
      : userTypedDomain;
    const primaryDomain = canonicalDomain;

    const aliasSet = new Set<string>();
    if (existingStore?.shop_domain_aliases) {
      for (const a of existingStore.shop_domain_aliases) aliasSet.add(String(a).toLowerCase());
    }
    if (existingStore?.shop_domain && existingStore.shop_domain.toLowerCase() !== primaryDomain) {
      aliasSet.add(existingStore.shop_domain.toLowerCase());
    }
    // What the merchant typed always rides along as an alias so old
    // pixel/script tags pointing at it still resolve.
    if (userTypedDomain !== primaryDomain) {
      aliasSet.add(userTypedDomain);
    }
    aliasSet.delete(primaryDomain); // primary should never duplicate in aliases
    const aliases: string[] = Array.from(aliasSet);

    const storeRecord: Record<string, any> = {
      organization_id: organizationId,
      shop_domain: primaryDomain,
      shop_domain_aliases: aliases,
      shopify_shop_id: shopifyShopId,
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

    // Free up the canonical primaryDomain if any OTHER inactive row is
    // sitting on it. Without this the unique constraint idx_shopify_domain
    // blocks every reconnection where the canonical was previously held
    // by a row the merchant excluded.
    {
      const { data: blockers } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, is_active')
        .eq('organization_id', organizationId)
        .eq('shop_domain', primaryDomain)
        .neq('id', existingStore?.id || '00000000-0000-0000-0000-000000000000');
      for (const b of (blockers || []) as any[]) {
        if (b.is_active) {
          return NextResponse.json({
            error: `Outra loja ATIVA já usa ${primaryDomain}. Mescle ou exclua antes de prosseguir.`,
            collidingStoreId: b.id,
          }, { status: 409 });
        }
        // Inactive — free the domain by renaming to a placeholder so
        // the unique constraint releases. Row stays in DB for audit.
        const placeholder = `archived-${b.id}.worder.local`;
        await supabase
          .from('shopify_stores')
          .update({ shop_domain: placeholder, updated_at: new Date().toISOString() })
          .eq('id', b.id);
      }
    }

    let storeId: string;
    // Helper: retry the write without columns that may not exist in
    // older schemas. Catches PGRST204 (PostgREST schema cache miss)
    // and 42703 (undefined column) and progressively strips suspect
    // fields. Lets manual integration succeed on databases that
    // haven't run the recent shopify_shop_id / shop_domain_aliases
    // migrations yet.
    function isMissingColumnError(err: any, col: string): boolean {
      if (!err) return false;
      const code = err.code || '';
      const msg = String(err.message || '');
      if (code === 'PGRST204' || code === '42703') return msg.includes(col);
      return msg.includes(col) && (msg.includes('column') || msg.includes('schema cache'));
    }
    async function writeStore(record: Record<string, any>): Promise<{ id: string } | null> {
      // Try as-is, then progressively drop columns that may be missing.
      const fallbackChain = ['shopify_shop_id', 'shop_domain_aliases'];
      let attempt: Record<string, any> = { ...record };
      let lastErr: any = null;
      for (let i = 0; i <= fallbackChain.length; i++) {
        if (existingStore) {
          const { error } = await supabase.from('shopify_stores').update(attempt).eq('id', existingStore.id);
          if (!error) return { id: existingStore.id };
          lastErr = error;
        } else {
          const { data, error } = await supabase.from('shopify_stores').insert(attempt).select('id').single();
          if (!error && data) return { id: data.id };
          lastErr = error;
        }
        // If error mentions a known fallback column, drop it and retry.
        const dropCol = fallbackChain.find(c => isMissingColumnError(lastErr, c) && c in attempt);
        if (!dropCol) break;
        const { [dropCol]: _, ...rest } = attempt;
        attempt = rest;
      }
      throw lastErr;
    }
    try {
      const result = await writeStore(storeRecord);
      storeId = result!.id;
    } catch (writeErr: any) {
      throw writeErr;
    }

    // ──────────────────────────────────────────
    // 5. Register 17 webhooks (skip any that already exist for this URL)
    //    URL includes ?store_id= so the handler resolves the store from
    //    the URL itself (bulletproof against multi-domain shops). Must
    //    match the format expected by the diagnostic dashboard.
    // ──────────────────────────────────────────
    const webhookUrl = `${APP_URL}/api/webhooks/shopify?store_id=${storeId}`;
    const legacyWebhookPrefix = `${APP_URL}/api/webhooks/shopify`;
    let existingTopics: string[] = [];
    try {
      const listRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (listRes.ok) {
        const json = await listRes.json();
        // Accept both new (?store_id=) and legacy (no param) URLs as "existing"
        existingTopics = (json.webhooks || [])
          .filter((w: any) => w.address === webhookUrl || (w.address === legacyWebhookPrefix && w.address.startsWith(legacyWebhookPrefix)))
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
    // 5b. Try to install Web Pixel automatically if scope allows
    //     If the merchant's custom app has write_pixels scope, we can install
    //     the Shopify Web Pixel programmatically (best UX). If not, the merchant
    //     will use the Custom Pixel code shown in the integration page.
    // ──────────────────────────────────────────
    let pixelInstalled = false;
    if (scopesList.includes('write_pixels')) {
      try {
        const pixelRes = await fetch(
          `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
          {
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
          }
        );
        if (pixelRes.ok) {
          const pixelData = await pixelRes.json();
          const errors = pixelData.data?.webPixelCreate?.userErrors || [];
          if (errors.length === 0 && pixelData.data?.webPixelCreate?.webPixel?.id) {
            pixelInstalled = true;
            await supabase
              .from('shopify_stores')
              .update({ pixel_installed: true })
              .eq('id', storeId);
            console.log('[Shopify Manual] Web Pixel installed automatically');
          } else if (errors.some((e: any) => e.message?.includes('already exists'))) {
            pixelInstalled = true;
            await supabase
              .from('shopify_stores')
              .update({ pixel_installed: true })
              .eq('id', storeId);
          }
        }
      } catch (pixelErr) {
        console.warn('[Shopify Manual] Auto pixel install failed (merchant must use Custom Pixel code):', pixelErr);
      }
    }

    // ──────────────────────────────────────────
    // 6. Clean up placeholder stores (.worder.local) in this org.
    //    These are created by AddStoreModal Step 1 and should be removed
    //    once a real Shopify connection succeeds.
    // ──────────────────────────────────────────
    try {
      // Only the manual-* placeholders from AddStoreModal Step 1.
      // archived-*.worder.local rows are REAL former stores renamed by
      // the domain-release logic above — they can still hold history
      // (contact_events, automations) and must never be deleted here.
      const { data: placeholders } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain')
        .eq('organization_id', organizationId)
        .like('shop_domain', 'manual-%.worder.local')
        .neq('id', storeId);
      for (const p of (placeholders || []) as any[]) {
        await supabase.from('shopify_stores').delete().eq('id', p.id);
      }
      if ((placeholders || []).length > 0) {
        console.log(`[Shopify Manual] Cleaned up ${placeholders!.length} placeholder store(s)`);
      }
    } catch { /* best-effort */ }

    // ──────────────────────────────────────────
    // 7. Trigger initial sync (fire-and-forget)
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
      pixel: { autoInstalled: pixelInstalled },
      missingRecommendedScopes: missingRecommended.length > 0 ? missingRecommended : undefined,
    });
  } catch (err: any) {
    console.error('[Shopify Manual] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao conectar loja' },
      { status: 500 }
    );
  }
}
