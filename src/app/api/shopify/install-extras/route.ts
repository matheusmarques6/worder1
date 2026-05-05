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

  const shopDomain = store.shop_domain;
  const accessToken = store.access_token;
  const webhookUrl = `${APP_URL}/api/webhooks/shopify`;

  // ──────────────────────────────────────────
  // 1. Webhooks — skip ones already registered for our URL
  // ──────────────────────────────────────────
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
  // 3. Mark initial sync done + bump api_version
  // ──────────────────────────────────────────
  await supabase
    .from('shopify_stores')
    .update({
      pixel_installed: pixelInstalled,
      initial_sync_completed: true,
      api_version: SHOPIFY_API_VERSION,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', store.id);

  return NextResponse.json({
    success: true,
    webhooks: {
      total: REQUIRED_WEBHOOKS.length,
      created: webhookCreated,
      existing: webhookExisting,
      failed: webhookFailed,
      failedTopics: webhookFailed > 0 ? failedTopics : undefined,
    },
    pixel: { installed: pixelInstalled },
    apiVersion: SHOPIFY_API_VERSION,
  });
}
