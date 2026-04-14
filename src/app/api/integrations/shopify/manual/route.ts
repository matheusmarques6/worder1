// =============================================
// Shopify Manual Integration API
// POST /api/integrations/shopify/manual
//
// Allows merchants to connect their Shopify store without going through
// the public OAuth app: they create a Custom App in Shopify Admin, paste
// the Admin API Access Token + API Secret Key, and Worder does the rest
// (validate, register webhooks, trigger sync) — producing the exact same
// database state as the OAuth callback so the rest of the product works
// identically regardless of connection_type.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_VERSION = '2026-01';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

// Required scopes for baseline Worder functionality
const REQUIRED_SCOPES = ['read_orders', 'read_customers', 'read_products'];

// 17 webhook topics — must match the OAuth callback exactly so both
// connection modes produce identical event coverage.
const WEBHOOK_TOPICS = [
  'orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'orders/fulfilled',
  'checkouts/create', 'checkouts/update',
  'customers/create', 'customers/update', 'customers/delete',
  'products/create', 'products/update', 'products/delete',
  'refunds/create',
  'fulfillments/create', 'fulfillments/update',
  'app/uninstalled',
];

function normalizeShopDomain(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (cleaned.endsWith('.myshopify.com')) return cleaned;
  return `${cleaned}.myshopify.com`;
}

async function shopifyGraphQL(domain: string, token: string, query: string) {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Shopify API returned ${res.status}`);
  }
  return res.json();
}

async function shopifyREST(
  domain: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const body = await request.json();
    const { domain, accessToken, apiSecretKey } = body || {};

    if (!domain || !accessToken || !apiSecretKey) {
      return NextResponse.json(
        { error: 'domain, accessToken e apiSecretKey são obrigatórios' },
        { status: 400 }
      );
    }

    const shopDomain = normalizeShopDomain(String(domain));

    // ──────────────────────────────────────────
    // 1. Validate the token by pulling shop info
    // ──────────────────────────────────────────
    let shopInfo: any;
    try {
      const gql = await shopifyGraphQL(
        shopDomain,
        String(accessToken),
        `{
          shop {
            name
            email
            currencyCode
            ianaTimezone
            plan { displayName }
          }
        }`
      );
      if (gql.errors) {
        return NextResponse.json(
          { error: 'Access Token inválido ou sem permissão', details: gql.errors },
          { status: 401 }
        );
      }
      shopInfo = gql.data?.shop;
      if (!shopInfo) {
        return NextResponse.json(
          { error: 'Não foi possível obter informações da loja. Verifique o token.' },
          { status: 401 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: `Falha ao conectar com a Shopify: ${err.message}` },
        { status: 502 }
      );
    }

    // ──────────────────────────────────────────
    // 2. Verify required scopes
    // ──────────────────────────────────────────
    let scopes: string[] = [];
    try {
      const scopesRes = await shopifyREST(
        shopDomain,
        String(accessToken),
        '/oauth/access_scopes.json'
      );
      if (scopesRes.ok) {
        const scopesJson = await scopesRes.json();
        scopes = (scopesJson.access_scopes || []).map((s: any) => s.handle);
      }
    } catch {
      // Non-blocking — if Shopify fails here, carry on.
    }

    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Faltam permissões no Custom App: ${missing.join(', ')}`,
          missing,
          scopes,
        },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────
    // 3. Upsert the store (PARITY with OAuth callback)
    // ──────────────────────────────────────────
    const supabase = getSupabaseAdmin();

    // Has this org/shop already connected? Update in place rather than
    // duplicating rows.
    const { data: existing } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('organization_id', auth.user.organization_id)
      .eq('shop_domain', shopDomain)
      .maybeSingle();

    const baseRow: Record<string, any> = {
      organization_id: auth.user.organization_id,
      shop_domain: shopDomain,
      shop_name: shopInfo.name,
      shop_email: shopInfo.email || null,
      access_token: accessToken,
      api_secret: apiSecretKey,
      webhook_secret: apiSecretKey,
      currency: shopInfo.currencyCode || 'BRL',
      plan_name: shopInfo.plan?.displayName || null,
      api_version: API_VERSION,
      scopes,
      is_active: true,
      status: 'active',
      connection_type: 'manual',
      installed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      pixel_installed: false,
      embed_installed: false,
      settings: {
        theme_editor_url: `https://${shopDomain}/admin/themes/current/editor?context=apps`,
        tracking_endpoint: `${APP_URL}/api/shopify/track`,
      },
    };

    let storeId: string;
    if (existing?.id) {
      const { data: updated, error: updErr } = await supabase
        .from('shopify_stores')
        .update(baseRow)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (updErr) throw updErr;
      storeId = updated!.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('shopify_stores')
        .insert(baseRow)
        .select('id')
        .single();
      if (insErr) throw insErr;
      storeId = inserted!.id;
    }

    // ──────────────────────────────────────────
    // 4. Register webhooks (REST API)
    //    Skip topics that already exist for this store.
    // ──────────────────────────────────────────
    const webhookUrl = `${APP_URL}/api/webhooks/shopify`;
    let created = 0;
    let existingCount = 0;
    let failed = 0;

    let existingTopics: string[] = [];
    try {
      const listRes = await shopifyREST(shopDomain, String(accessToken), '/webhooks.json');
      if (listRes.ok) {
        const listJson = await listRes.json();
        existingTopics = (listJson.webhooks || [])
          .filter((w: any) => w.address === webhookUrl)
          .map((w: any) => w.topic);
      }
    } catch { /* fall through */ }

    for (const topic of WEBHOOK_TOPICS) {
      if (existingTopics.includes(topic)) {
        existingCount++;
        continue;
      }
      try {
        const res = await shopifyREST(shopDomain, String(accessToken), '/webhooks.json', {
          method: 'POST',
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: 'json',
            },
          }),
        });
        if (res.ok) created++;
        else failed++;
      } catch {
        failed++;
      }
    }

    // ──────────────────────────────────────────
    // 5. Trigger initial sync (fire-and-forget)
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
        name: shopInfo.name,
        domain: shopDomain,
        email: shopInfo.email,
        currency: shopInfo.currencyCode,
        plan: shopInfo.plan?.displayName,
      },
      scopes,
      webhooks: {
        total: WEBHOOK_TOPICS.length,
        created,
        existing: existingCount,
        failed,
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
