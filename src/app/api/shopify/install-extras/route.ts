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
];

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
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: 'json' } }),
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
  const scopes: string[] = Array.isArray(store.scopes) ? store.scopes : [];
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
  // 5. Mark initial sync done + bump api_version + persist script_tag_id
  // (in settings JSONB so we don't need a schema migration)
  // ──────────────────────────────────────────
  const updatedSettings = {
    ...(store.settings || {}),
    ...(scriptTagId ? { script_tag_id: scriptTagId, loader_installed_at: new Date().toISOString() } : {}),
    ...(trackerTagId ? { tracker_tag_id: trackerTagId, tracker_installed_at: new Date().toISOString() } : {}),
  };
  await supabase
    .from('shopify_stores')
    .update({
      pixel_installed: pixelInstalled,
      initial_sync_completed: true,
      api_version: SHOPIFY_API_VERSION,
      last_sync_at: new Date().toISOString(),
      settings: updatedSettings,
    })
    .eq('id', store.id);

  return NextResponse.json({
    success: true,
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
      installed: scriptTagInstalled,
      scriptTagId,
      error: scriptTagError,
      missingScope: !hasScriptTagsScope,
      manualFallbackSnippet: scriptTagInstalled ? null : `<script src="${loaderUrl}" async></script>`,
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
