// =============================================
// GET /api/public/forms/{id}/preview-allowed?vid=...&domain=...
//
// Called by the popup script before rendering when the form has
// behavior.visibility.hideFromSubscribers = true. Decides server-side
// whether the visitor is already a known subscriber / past submitter,
// closing the gap left by the legacy _wf_sub cookie (browser-local only,
// useless for imported contacts or cross-device visitors).
//
// Inputs:
//   id     — form UUID (path param)
//   vid    — the __worder_id cookie value (Worder visitor id)
//   domain — shop domain so we can resolve the org without auth
//
// Output:
//   { allowed: true }                — render the popup
//   { allowed: false, reason: '...' } — skip rendering
//
// Always 200 + allowed=true on errors so a flaky lookup doesn't silently
// hide active popups. Public endpoint, CORS open, never include PII in
// the response.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // 10 minutes — long enough to skip the round-trip on every page
    // navigation, short enough that a fresh subscription propagates fast.
    'Cache-Control': 'public, max-age=600, s-maxage=600',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors() });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const headers = cors();
  try {
    const { searchParams } = req.nextUrl;
    const vid = (searchParams.get('vid') || '').trim();
    const domain = (searchParams.get('domain') || '').trim().toLowerCase();

    // Without a visitor id there's nothing to look up — fail open.
    if (!vid) {
      return NextResponse.json({ allowed: true }, { headers });
    }

    // Fetch the form's org + the hideFromSubscribers toggle. Stop early
    // if the merchant isn't asking us to gate by subscriber status.
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, organization_id, status, behavior')
      .eq('id', params.id)
      .maybeSingle();

    if (!form || form.status !== 'published') {
      return NextResponse.json({ allowed: true }, { headers });
    }

    const hideFromSubscribers = !!form.behavior?.visibility?.hideFromSubscribers;
    if (!hideFromSubscribers) {
      return NextResponse.json({ allowed: true }, { headers });
    }

    const orgId = form.organization_id;

    // Look up the visitor identity. The worder.js tracker writes one
    // row per visitor on first heartbeat with their __worder_id, and
    // ties it to a contact_id once we observe an email/phone.
    const { data: identity } = await supabaseAdmin
      .from('visitor_identities')
      .select('contact_id')
      .eq('organization_id', orgId)
      .eq('worder_visitor_id', vid)
      .limit(1)
      .maybeSingle();

    const contactId: string | null = identity?.contact_id || null;

    // 1) Already a subscriber? (contact has email_consent=true)
    if (contactId) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('email_consent, status')
        .eq('id', contactId)
        .maybeSingle();
      // email_consent is a TEXT column that accumulated several legacy
      // shapes: 'true'/'false' from the early boolean migration, then
      // 'subscribed'/'unsubscribed' from later code. Double opt-in adds
      // 'pending'. Treat everything that isn't an explicit "no" as a
      // subscriber to avoid showing the popup again to a person we've
      // already got in some list.
      const consent = String(contact?.email_consent || '').toLowerCase();
      const isSubscriber =
        consent === 'true' || consent === 'subscribed' || consent === 'pending';
      if (isSubscriber) {
        return NextResponse.json(
          { allowed: false, reason: consent === 'pending' ? 'awaiting_confirmation' : 'subscribed' },
          { headers }
        );
      }
      // Suppressed contacts (bounced/complained/unsubscribed) shouldn't
      // see a fresh "join the list" popup either — it'd look broken.
      const badStatus = new Set(['bounced', 'complained', 'unsubscribed', 'invalid']);
      if (contact?.status && badStatus.has(String(contact.status).toLowerCase())) {
        return NextResponse.json(
          { allowed: false, reason: 'suppressed' },
          { headers }
        );
      }

      // 2) Already submitted THIS form before (any device)?
      const { data: prior } = await supabaseAdmin
        .from('crm_form_submissions')
        .select('id')
        .eq('form_id', params.id)
        .eq('contact_id', contactId)
        .limit(1)
        .maybeSingle();
      if (prior) {
        return NextResponse.json(
          { allowed: false, reason: 'already_submitted' },
          { headers }
        );
      }
    }

    // 3) Unknown visitor or known-but-not-subscribed → render.
    return NextResponse.json({ allowed: true }, { headers });
  } catch (err: any) {
    // Fail open. We never want a lookup error to hide an active popup.
    console.warn('[preview-allowed] error:', err?.message || err);
    return NextResponse.json({ allowed: true }, { headers });
  }
}
