// =============================================
// POST /api/identity/resolve
//
// Resolves a stable worder_visitor_id from any combination of client
// signals. Called by the storefront loader on every page load (once
// per session) and by the popup runtime when the user submits an
// email/phone.
//
// Sets a first-party cookie (__worder_id) on app.worder.com.br so a
// returning visitor that comes back via a campaign click identifies
// instantly (similar to Klaviyo's _kx).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, linkContactToIdentity } from '@/lib/identity/resolver';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// CORS: when the pixel sends `credentials: 'include'`, the browser
// requires a SPECIFIC origin in Access-Control-Allow-Origin (not '*')
// AND Access-Control-Allow-Credentials: true. We echo the request's
// Origin header so any merchant storefront can set our first-party
// cookie without us having to maintain an allowlist.
function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': origin ? 'true' : 'false',
    'Vary': 'Origin',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const CH = corsHeaders(request.headers.get('origin'));
  try {
    const body = await request.json().catch(() => ({}));
    const {
      accountId,        // organization_id
      storeId,
      storeDomain,
      clientVisitorId,
      fingerprintHash,
      email,
      phone,
      shopifyCustomerId,
      source,
    } = body;

    if (!accountId && !storeId && !storeDomain) {
      return NextResponse.json(
        { error: 'Missing store identifier' },
        { status: 400, headers: CH }
      );
    }

    const supabase = getSupabaseAdmin();

    // Resolve org from store identifier — uses the alias-aware
    // resolver so a pixel sending the merchant's canonical
    // myshopifyDomain (e.g. lojalaclode.myshopify.com) still finds the
    // store even when shop_domain in our DB is the renamed/secondary
    // domain (e.g. sourosa.myshopify.com).
    let organizationId = accountId as string | undefined;
    let resolvedStoreId = storeId as string | undefined;
    if (!organizationId || !resolvedStoreId) {
      let store: { id: string; organization_id: string } | null = null;
      if (storeId) {
        const { data } = await supabase
          .from('shopify_stores')
          .select('id, organization_id')
          .eq('id', storeId)
          .maybeSingle();
        store = data;
      } else if (storeDomain) {
        const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain');
        store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
          supabase,
          storeDomain,
          { select: 'id, organization_id', activeOnly: false }
        );
      } else if (accountId) {
        const { data } = await supabase
          .from('shopify_stores')
          .select('id, organization_id')
          .eq('organization_id', accountId)
          .limit(1)
          .maybeSingle();
        store = data;
      }
      if (!store) {
        return NextResponse.json(
          { error: 'Store not found' },
          { status: 404, headers: CH }
        );
      }
      organizationId = organizationId || store.organization_id;
      resolvedStoreId = resolvedStoreId || store.id;
    }

    const ua = request.headers.get('user-agent') || null;
    const ip = getClientIp(request) || null;

    const result = await resolveIdentity({
      organizationId: organizationId!,
      storeId: resolvedStoreId,
      clientVisitorId: clientVisitorId || null,
      fingerprintHash: fingerprintHash || null,
      userAgent: ua,
      ip,
      email: email || null,
      phone: phone || null,
      shopifyCustomerId: shopifyCustomerId ? String(shopifyCustomerId) : null,
      source: source || 'pixel',
    });

    // If caller provided email/phone (identification), look up or create
    // the contact and link it to the identity. The /track/identify route
    // does the heavier lifting; here we keep it minimal.
    let contactId = result.contactId;
    if (!contactId && (email || phone || shopifyCustomerId)) {
      const lookups = [];
      if (email) {
        lookups.push(
          supabase.from('contacts').select('id').eq('organization_id', organizationId).ilike('email', email).maybeSingle()
        );
      }
      if (shopifyCustomerId) {
        lookups.push(
          supabase.from('contacts').select('id').eq('organization_id', organizationId).eq('shopify_customer_id', String(shopifyCustomerId)).maybeSingle()
        );
      }
      const results = await Promise.all(lookups);
      for (const r of results) {
        if ((r as any)?.data?.id) {
          contactId = (r as any).data.id;
          break;
        }
      }
      if (contactId) {
        const linked = await linkContactToIdentity(result.identityId, contactId, organizationId!);
        result.contactId = contactId;
        (result as any).backfilledEvents = linked.eventsLinked;
      }
    }

    const response = NextResponse.json(
      {
        worderVisitorId: result.worderVisitorId,
        contactId: result.contactId,
        stitched: result.stitched,
        matchSource: result.matchSource,
        backfilledEvents: (result as any).backfilledEvents || 0,
      },
      { status: 200, headers: CH }
    );

    // First-party cookie on app.worder.com.br (or whatever NEXT_PUBLIC_APP_URL is).
    // Safari ITP caps first-party cookies at 7 days, but we re-set it on
    // every resolve call, so it effectively never expires for active
    // users. The fingerprint matching on the server is the real safety net.
    response.cookies.set('__worder_id', result.worderVisitorId, {
      httpOnly: false,           // pixel JS reads it
      secure: true,
      sameSite: 'none',          // cross-site so the merchant's domain can read it
      maxAge: 60 * 60 * 24 * 365, // 1 year, browser may cap
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('[Identity Resolve] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Internal error' },
      { status: 500, headers: CH }
    );
  }
}
