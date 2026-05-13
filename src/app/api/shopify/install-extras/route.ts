// =============================================
// POST /api/shopify/install-extras
//
// Idempotent "make this store fully wired" endpoint. Used at the end
// of the unified Sync button flow (after sync-now + sync-financials)
// to ensure the store ends up with:
//   - All 17 webhooks registered (skips ones that already exist)
//   - Web Pixel installed (if write_pixels scope is granted)
//   - api_version up to date (2026-04)
//   - initial_sync_completed = true
//
// All steps are best-effort: failures don't block the response.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ensureFreshToken } from '@/lib/shopify/ensure-fresh-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

const REQUIRED_WEBHOOKS = [
  'orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'orders/fulfilled',
  'checkouts/create', 'checkouts/update',
  'customers/create', 'customers/update', 'customers/delete',
  'products/create', 'products/update', 'products/delete',
  'refunds/create',
  'fulfillments/create', 'fulfillments/update',
  'app/uninstalled',
  // Bulk Operations API. Fires when an async export (POST /api/shopify/bulk-sync)
  // finishes — our handler grabs the JSONL URL and streams the result
  // into shopify_orders. Different path from the main /api/webhooks/shopify
  // handler because Shopify expects an HMAC-only endpoint for bulk events.
  'bulk_operations/finish',
];

// Topic → custom path overrides. Most webhooks land on the canonical
// /api/webhooks/shopify handler with ?store_id=, but a few (like bulk
// finish) have their own dedicated path so we don't bloat the main
// router with branchy logic.
const WEBHOOK_PATH_OVERRIDES: Record<string, string> = {
  'bulk_operations/finish': '/api/webhooks/shopify/bulk-finish',
};

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  let storeId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    storeId = body?.storeId || null;
  } catch { /* ignore */ }

  const supabase = getSupabaseAdmin();
  let store: any;
  if (storeId) {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();
    store = data;
  } else {
    const { data } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    store = data;
  }

  if (!store) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
  if (!store.access_token) {
    return NextResponse.json({ error: 'Token de acesso ausente' }, { status: 400 });
  }

  const refreshed = await ensureFreshToken(store);
  if (!refreshed.ok) {
    return NextResponse.json({ error: refreshed.error }, { status: 401 });
  }
  store = refreshed.store;

  // ──────────────────────────────────────────
  // 0. Canonicalize shop_domain
  //
  // If the merchant connected with a renamed admin slug (e.g.
  // sourosa.myshopify.com) but Shopify's permanent canonical domain is
  // different (e.g. lojalaclode.myshopify.com), webhooks arrive carrying
  // the canonical in X-Shopify-Shop-Domain. Resolution falls back to
  // alias scan instead of O(1) primary match. Worse, the diagnostic
  // dashboard misleads the merchant into thinking they should match
  // by what they typed.
  //
  // Fix: query GraphQL for shop.myshopifyDomain. If it differs from
  // the stored shop_domain, swap them — canonical becomes primary,
  // typed becomes alias. Idempotent (no-op when already canonical).
  // ──────────────────────────────────────────
  let domainCanonicalization: { swapped: boolean; canonical?: string; previous?: string } = { swapped: false };
  try {
    const canonRes = await fetch(
      `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: `{ shop { myshopifyDomain } }` }),
      }
    );
    if (canonRes.ok) {
      const j = await canonRes.json();
      const canonical = (j.data?.shop?.myshopifyDomain || '').toLowerCase() || null;
      const typed = String(store.shop_domain || '').toLowerCase();
      if (canonical && canonical !== typed) {
        const existingAliases: string[] = Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [];
        const aliases = new Set(existingAliases.map((a: string) => String(a).toLowerCase()));
        aliases.add(typed);
        aliases.delete(canonical);
        const { error: swErr } = await supabase
          .from('shopify_stores')
          .update({ shop_domain: canonical, shop_domain_aliases: Array.from(aliases), updated_at: new Date().toISOString() })
          .eq('id', store.id);
        if (!swErr) {
          domainCanonicalization = { swapped: true, canonical, previous: typed };
          // Reflect in our local copy so the rest of this request uses
          // the canonical domain for webhook/script_tag URLs.
          store.shop_domain = canonical;
          store.shop_domain_aliases = Array.from(aliases);
        }
      }
    }
  } catch { /* best-effort */ }

  const shopDomain = store.shop_domain;
  const accessToken = store.access_token;
  // Webhook URL carries `?store_id=<id>` so the handler can identify
  // the store from the URL itself — bulletproof against multi-domain
  // shops, canonical-domain changes, or unknown myshopifyDomain aliases
  // (the silent 410 cause that lost the Based store's checkouts).
  // Pattern adapted from AdTracked.
  const webhookUrl = `${APP_URL}/api/webhooks/shopify?store_id=${store.id}`;

  // ──────────────────────────────────────────
  // 1. Webhooks — clean up stale URLs first, then create missing ones.
  //
  // We delete any subscription whose path is `/api/webhooks/shopify`
  // (so it's clearly ours) but whose address ≠ the current expected URL
  // — typical when NEXT_PUBLIC_APP_URL changed (preview deploy promoted
  // to prod, custom domain swap, ngrok tunnel that died), OR when the
  // store was registered before we started carrying ?store_id= in the
  // URL. Without this, Shopify keeps delivering to the dead URL forever.
  // ──────────────────────────────────────────
  let existingTopics: string[] = [];
  let staleDeleted = 0;
  let staleFailed = 0;
  try {
    const listRes = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    if (listRes.ok) {
      const json = await listRes.json();
      const all = json.webhooks || [];
      existingTopics = all
        .filter((w: any) => w.address === webhookUrl)
        .map((w: any) => w.topic);

      const stale = all.filter((w: any) =>
        typeof w.address === 'string' &&
        w.address.includes('/api/webhooks/shopify') &&
        w.address !== webhookUrl
      );
      for (const sw of stale) {
        try {
          const delRes = await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${sw.id}.json`,
            { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
          );
          if (delRes.ok) staleDeleted++; else staleFailed++;
        } catch { staleFailed++; }
      }
    }
  } catch { /* best-effort */ }

  let webhookCreated = 0;
  let webhookExisting = 0;
  let webhookFailed = 0;
  const failedTopics: string[] = [];

  for (const topic of REQUIRED_WEBHOOKS) {
    if (existingTopics.includes(topic)) {
      webhookExisting++;
      continue;
    }
    // Bulk-finish and any other topic in WEBHOOK_PATH_OVERRIDES gets a
    // dedicated handler URL — keeps the main webhook router lean.
    const override = WEBHOOK_PATH_OVERRIDES[topic];
    const topicUrl = override
      ? `${APP_URL}${override}?store_id=${store.id}`
      : webhookUrl;
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ webhook: { topic, address: topicUrl, format: 'json' } }),
        }
      );
      if (res.ok) {
        webhookCreated++;
      } else {
        webhookFailed++;
        failedTopics.push(topic);
      }
    } catch {
      webhookFailed++;
      failedTopics.push(topic);
    }
  }

  // ──────────────────────────────────────────
  // 2. Web Pixel — install if scope allows and not already installed
  // ──────────────────────────────────────────
  let pixelInstalled = !!store.pixel_installed;
  // Read scopes live from Shopify. The local copy on shopify_stores.scopes
  // can be stale: the merchant might have just added write_script_tags
  // (or write_themes) to the Custom App and reinstalled, but the row
  // was last written days ago. Without the live read, install-extras
  // would keep reporting "missing_scope" and the merchant would re-add
  // the scope in a panic. Falls back to the DB copy on network error.
  let scopes: string[] = Array.isArray(store.scopes) ? store.scopes : [];
  try {
    const scopesRes = await fetch(
      `https://${shopDomain}/admin/oauth/access_scopes.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    if (scopesRes.ok) {
      const sj = await scopesRes.json();
      const live = Array.isArray(sj?.access_scopes)
        ? sj.access_scopes.map((s: any) => String(s.handle || s.name || '').toLowerCase()).filter(Boolean)
        : [];
      if (live.length > 0) {
        scopes = live;
        // Persist so other endpoints (banner gating, sync, etc.) read fresh.
        await supabase
          .from('shopify_stores')
          .update({ scopes: live })
          .eq('id', store.id);
      }
    }
  } catch { /* fall back to DB copy */ }

  if (!pixelInstalled && scopes.includes('write_pixels')) {
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
                  storeId: store.id,
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
        const alreadyExists = errors.some((e: any) => e.message?.includes('already exists'));
        if ((errors.length === 0 && pixelData.data?.webPixelCreate?.webPixel?.id) || alreadyExists) {
          pixelInstalled = true;
        }
      }
    } catch { /* best-effort */ }
  }

  // ──────────────────────────────────────────
  // 3. Storefront popup loader via ScriptTag API
  //
  // Shopify Custom Pixels can't inject DOM into the storefront (sandboxed
  // iframe), and our Theme App Embed extension is only available for OAuth
  // installs. So for manual integrations we use the ScriptTag API to install
  // a regular <script> tag — Shopify renders it on every storefront page and
  // it loads /api/storefront/loader.js which fetches and injects published
  // popups. Idempotent: if a tag for our URL already exists we reuse it.
  //
  // Requires write_script_tags scope. If the merchant's app doesn't have it,
  // we surface a manual fallback (the inline <script> snippet).
  // ──────────────────────────────────────────
  const loaderUrl = `${APP_URL}/api/storefront/loader.js`;
  let scriptTagInstalled = false;
  let scriptTagId: string | null = null;
  let scriptTagError: string | null = null;
  const hasScriptTagsScope = scopes.includes('write_script_tags');

  if (hasScriptTagsScope) {
    try {
      // Look for existing tag pointing to our loader URL
      const listRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json?src=${encodeURIComponent(loaderUrl)}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (listRes.ok) {
        const listJson = await listRes.json();
        const existing = (listJson.script_tags || []).find((s: any) => s.src === loaderUrl);
        if (existing) {
          scriptTagInstalled = true;
          scriptTagId = String(existing.id);
        }
      }

      if (!scriptTagInstalled) {
        const createRes = await fetch(
          `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              script_tag: {
                event: 'onload',
                src: loaderUrl,
                display_scope: 'online_store',
              },
            }),
          }
        );
        if (createRes.ok) {
          const created = await createRes.json();
          if (created.script_tag?.id) {
            scriptTagInstalled = true;
            scriptTagId = String(created.script_tag.id);
          }
        } else {
          scriptTagError = `${createRes.status}: ${(await createRes.text()).slice(0, 200)}`;
        }
      }
    } catch (err: any) {
      scriptTagError = err?.message || 'fetch error';
    }
  } else {
    scriptTagError = 'missing_scope:write_script_tags';
  }

  // ──────────────────────────────────────────
  // 4. Storefront tracker via ScriptTag — fallback that doesn't depend
  //    on the Custom Pixel sandbox. Captures page_viewed, viewed_product,
  //    added_to_cart, checkout_started, checkout_completed (thank-you
  //    page), plus the full click-IDs cascade (fbclid/fbc/fbp, gclid,
  //    msclkid, ttclid, _kx, etc) and a richer canvas+webgl fingerprint.
  //    Adapted from the AdTracked pattern.
  // ──────────────────────────────────────────
  const trackerUrl = `${APP_URL}/api/storefront/tracker.js?store_id=${store.id}`;
  let trackerInstalled = false;
  let trackerTagId: string | null = null;
  let trackerError: string | null = null;
  if (hasScriptTagsScope) {
    try {
      // Find any existing tracker tag (may use the OLD URL without
      // ?store_id= or pointing at a previous APP_URL). Delete stale
      // ones, then install the canonical one.
      const listRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (listRes.ok) {
        const listJson = await listRes.json();
        const tags = listJson.script_tags || [];
        const ourTrackerTags = tags.filter((s: any) =>
          typeof s.src === 'string' && s.src.includes('/api/storefront/tracker.js')
        );
        const matching = ourTrackerTags.find((s: any) => s.src === trackerUrl);
        if (matching) {
          trackerInstalled = true;
          trackerTagId = String(matching.id);
        }
        // Delete stale tracker tags pointing at any other URL
        for (const stale of ourTrackerTags) {
          if (stale.src !== trackerUrl) {
            try {
              await fetch(
                `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${stale.id}.json`,
                { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
              );
            } catch { /* best-effort */ }
          }
        }
      }
      if (!trackerInstalled) {
        const createRes = await fetch(
          `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              script_tag: {
                event: 'onload',
                src: trackerUrl,
                display_scope: 'online_store',
              },
            }),
          }
        );
        if (createRes.ok) {
          const created = await createRes.json();
          if (created.script_tag?.id) {
            trackerInstalled = true;
            trackerTagId = String(created.script_tag.id);
          }
        } else {
          trackerError = `${createRes.status}: ${(await createRes.text()).slice(0, 200)}`;
        }
      }
    } catch (err: any) {
      trackerError = err?.message || 'fetch error';
    }
  } else {
    trackerError = 'missing_scope:write_script_tags';
  }

  // ──────────────────────────────────────────
  // 4.5. Storefront popup loader via Asset API (theme.liquid edit) —
  // fallback for when the Custom App was not granted write_script_tags.
  // We fetch the main theme's layout/theme.liquid, append our <script>
  // tag right before </body> if not already there, and PUT it back via
  // the Asset API. Requires write_themes.
  //
  // We DON'T touch other parts of the file — diff is a single inserted
  // line wrapped in a {% comment %} marker we can find again on uninstall.
  //
  // Idempotent: detects our marker comment, skips if present.
  // ──────────────────────────────────────────
  const hasThemesScope = scopes.includes('write_themes');
  let themeAssetInstalled = false;
  let themeAssetError: string | null = null;
  let themeIdUsed: number | null = null;
  // Only try Asset API when ScriptTag didn't already land. No point
  // editing the theme if a global ScriptTag is doing the job.
  if (!scriptTagInstalled && hasThemesScope) {
    try {
      // Pick the published theme (role=main). Shopify returns multiple
      // themes (drafts, library). We only edit the live one.
      const themesRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/themes.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (!themesRes.ok) {
        themeAssetError = `themes list ${themesRes.status}`;
      } else {
        const themesJson = await themesRes.json();
        const mainTheme = (themesJson.themes || []).find((t: any) => t.role === 'main');
        if (!mainTheme?.id) {
          themeAssetError = 'no_main_theme';
        } else {
          themeIdUsed = mainTheme.id;
          // Pull the current theme.liquid content
          const getRes = await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/themes/${mainTheme.id}/assets.json?asset[key]=layout/theme.liquid`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
          );
          if (!getRes.ok) {
            themeAssetError = `theme.liquid GET ${getRes.status}`;
          } else {
            const getJson = await getRes.json();
            const value: string = getJson.asset?.value || '';
            const marker = '{%- comment -%} Worder popup loader (managed) {%- endcomment -%}';
            const snippet = `\n${marker}\n<script src="${loaderUrl}" async></script>\n`;
            if (value.includes(marker)) {
              themeAssetInstalled = true; // already present
            } else if (!value) {
              themeAssetError = 'empty_theme_liquid';
            } else {
              // Splice the snippet right before </body>. If </body> is
              // missing (rare), append at end so we still get on every page.
              const closeBodyIdx = value.lastIndexOf('</body>');
              const patched = closeBodyIdx >= 0
                ? value.slice(0, closeBodyIdx) + snippet + value.slice(closeBodyIdx)
                : value + snippet;
              const putRes = await fetch(
                `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/themes/${mainTheme.id}/assets.json`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                  },
                  body: JSON.stringify({
                    asset: { key: 'layout/theme.liquid', value: patched },
                  }),
                }
              );
              if (putRes.ok) {
                themeAssetInstalled = true;
              } else {
                themeAssetError = `theme.liquid PUT ${putRes.status}: ${(await putRes.text()).slice(0, 160)}`;
              }
            }
          }
        }
      }
    } catch (err: any) {
      themeAssetError = err?.message || 'asset fetch error';
    }
  } else if (!scriptTagInstalled && !hasThemesScope) {
    themeAssetError = 'missing_scope:write_themes';
  }

  // ──────────────────────────────────────────
  // 5. Mark initial sync done + bump api_version + persist script_tag_id
  // (in settings JSONB so we don't need a schema migration)
  // ──────────────────────────────────────────
  // Loader is "installed" when EITHER the ScriptTag landed OR we patched
  // theme.liquid via Asset API. The forms dashboard reads embed_installed
  // to drop the activation banner — set it here so the merchant sees a
  // green state immediately after the auto-install, without waiting for
  // the storefront beacon round-trip.
  const loaderInstalled = scriptTagInstalled || themeAssetInstalled;
  const loaderVia = scriptTagInstalled
    ? 'script_tag'
    : themeAssetInstalled
      ? 'theme_asset'
      : null;
  const updatedSettings = {
    ...(store.settings || {}),
    ...(scriptTagId ? { script_tag_id: scriptTagId, loader_installed_at: new Date().toISOString() } : {}),
    ...(trackerTagId ? { tracker_tag_id: trackerTagId, tracker_installed_at: new Date().toISOString() } : {}),
    ...(themeAssetInstalled ? { theme_id_patched: themeIdUsed, theme_asset_installed_at: new Date().toISOString() } : {}),
    ...(loaderVia ? { loader_via: loaderVia } : {}),
  };
  await supabase
    .from('shopify_stores')
    .update({
      pixel_installed: pixelInstalled,
      initial_sync_completed: true,
      api_version: SHOPIFY_API_VERSION,
      last_sync_at: new Date().toISOString(),
      settings: updatedSettings,
      ...(loaderInstalled
        ? {
            embed_installed: true,
            embed_installed_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq('id', store.id);

  return NextResponse.json({
    success: true,
    domainCanonicalization,
    webhooks: {
      total: REQUIRED_WEBHOOKS.length,
      created: webhookCreated,
      existing: webhookExisting,
      failed: webhookFailed,
      staleDeleted,
      staleFailed,
      failedTopics: webhookFailed > 0 ? failedTopics : undefined,
    },
    pixel: { installed: pixelInstalled },
    loader: {
      installed: loaderInstalled,
      via: loaderVia,
      // ScriptTag-specific status (legacy callers still read these).
      scriptTagId,
      error: loaderInstalled ? null : (scriptTagError || themeAssetError),
      missingScope: !hasScriptTagsScope && !hasThemesScope,
      missingScopes: !loaderInstalled
        ? [
            !hasScriptTagsScope && 'write_script_tags',
            !hasThemesScope && 'write_themes',
          ].filter(Boolean)
        : [],
      themeAsset: {
        installed: themeAssetInstalled,
        themeId: themeIdUsed,
        error: themeAssetError,
      },
      manualFallbackSnippet: loaderInstalled ? null : `<script src="${loaderUrl}" async></script>`,
    },
    tracker: {
      installed: trackerInstalled,
      scriptTagId: trackerTagId,
      error: trackerError,
      missingScope: !hasScriptTagsScope,
      manualFallbackSnippet: trackerInstalled ? null : `<script src="${trackerUrl}" async></script>`,
    },
    apiVersion: SHOPIFY_API_VERSION,
  });
}
