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

export const dynamic = 'force-dynamic';

function corsHeaders(origin?: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

    const rawDomain = String(body.shopDomain || body.domain || '').trim().toLowerCase();
    if (!rawDomain) {
      return NextResponse.json({ received: true, matched: false }, { headers });
    }

    // Normalize: strip scheme + trailing slash. Some themes pass the
    // raw `window.location.host` (which can be a custom domain), so we
    // match either against shop_domain or its aliases.
    const domain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, embed_installed, embed_installed_at')
      .or(`shop_domain.eq.${domain},shop_domain.ilike.%${domain}%`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

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
