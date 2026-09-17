// =============================================
// POST /api/storefront/embed-ping
//
// Called by the Theme App Embed (worder.js) on every storefront the
// merchant has activated us on. Shopify doesn't expose a webhook for
// "merchant toggled the app embed in the theme editor", so we detect
// activation by the side effect: the script ran on a real storefront,
// reaching this endpoint. That's the same heuristic Klaviyo / Postscript
// use under the hood.
//
// The handler is intentionally loose:
//   - No auth (it's called from the public storefront)
//   - Idempotent (a freshly-active store pings every session, we only
//     stamp the first one)
//   - CORS open for any storefront origin
//   - Always 200 so a failure here never blocks the popup script
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sanitizeDomain } from '@/lib/forms/submit-utils';

export const dynamic = 'force-dynamic';

function corsHeaders(origin?: string | null) {
  // sendBeacon always carries first-party cookies (credentials=include).
  // When the request reaches us in that mode, the browser rejects a
  // bare Allow-Origin:* response — we have to echo the exact origin
  // AND set Allow-Credentials:true. With wildcard origin (legacy
  // behavior) the response gets blocked with "Access-Control-Allow-
  // Credentials must be 'true'", which is exactly what was killing the
  // ping from doctormelaxintreatment.com.
  const allowOrigin = origin || '*';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // sendBeacon serializes as text/plain — tolerate
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
    }

    // Normalize + sanitize: strip scheme/path and keep only [a-z0-9.-].
    // The previous interpolation into .or(...) let a crafted domain
    // inject extra PostgREST filter clauses (cross-org enumeration).
    const domain = sanitizeDomain(body.shopDomain || body.domain || '');
    if (!domain) {
      return NextResponse.json({ received: true, matched: false }, { headers });
    }

    // Exact, alias-aware match: shop_domain, primary_domain (the public
    // storefront host) or any alias. The old suffix fallback
    // (ilike '%domain') let "groot.com" match "drgroot.com" — a lookalike
    // host could stamp embed_installed on another tenant's store.
    const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain');
    const store = await resolveStoreByDomain<{ id: string; embed_installed: boolean | null; embed_installed_at: string | null }>(
      supabaseAdmin,
      domain,
      { select: 'id, embed_installed, embed_installed_at', activeOnly: true }
    );

    if (!store) {
      return NextResponse.json({ received: true, matched: false }, { headers });
    }

    // Only stamp the first activation — the script pings once per
    // session anyway, but we don't want to thrash updated_at.
    if (!store.embed_installed || !store.embed_installed_at) {
      await supabaseAdmin
        .from('shopify_stores')
        .update({
          embed_installed: true,
          embed_installed_at: new Date().toISOString(),
        })
        .eq('id', store.id);
    }

    return NextResponse.json({ received: true, matched: true, storeId: store.id }, { headers });
  } catch (err: any) {
    // Never propagate — popup script must keep running.
    console.warn('[embed-ping] error:', err?.message || err);
    return NextResponse.json({ received: true }, { headers });
  }
}
