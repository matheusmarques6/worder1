// =============================================
// GET /api/public/forms/{id}/known-fields
//
// Progressive profiling lookup for the popup script. Two paths:
//
//   ?email=...      → returns ONLY booleans ({ first_name: true }).
//                     E-mail is a guessable identifier; returning the
//                     stored values made this endpoint a public PII
//                     oracle (any e-mail → phone/name/city/birthday/
//                     custom_fields). Hiding known fields — all the
//                     script needs — works with booleans.
//
//   ?visitor_id=... → may return VALUES. The visitor id is a long
//                     random token (wv_ + 16 random bytes) issued by
//                     us and stored first-party; it is not guessable,
//                     so prefill keeps working for returning visitors
//                     on the same browser.
//
// Response shape (client contract): { fields: Record<string, string|true> }
// The script must treat `true` as "known, hide the field" and must NOT
// splice boolean markers back into the submit answers (the server
// ignores boolean answer values defensively).
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/forms/submit-utils';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const CONTACT_FIELDS = 'email, phone, first_name, last_name, company, city, state, country, birthday, custom_fields';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function collectKnown(contact: any, includeValues: boolean): Record<string, string | true> {
  const known: Record<string, string | true> = {};
  const fieldMap: Record<string, any> = {
    email: contact.email,
    phone: contact.phone,
    first_name: contact.first_name,
    last_name: contact.last_name,
    full_name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    company: contact.company,
    city: contact.city,
    state: contact.state,
    country: contact.country,
    birthday: contact.birthday,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value && String(value).trim()) {
      known[key] = includeValues ? String(value) : true;
    }
  }

  if (contact.custom_fields && typeof contact.custom_fields === 'object') {
    for (const [key, value] of Object.entries(contact.custom_fields)) {
      if (value && String(value).trim()) {
        known[`custom:${key}`] = includeValues ? String(value) : true;
      }
    }
  }

  return known;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formId } = await params;
  const { searchParams } = request.nextUrl;
  const email = normalizeEmail(searchParams.get('email'));
  const visitorId = (searchParams.get('visitor_id') || '').trim();

  if (!email && !visitorId) {
    return NextResponse.json({ fields: {} }, { headers: CORS });
  }

  try {
    // Rate limit — same budget as the submit endpoint, so this can't be
    // used to enumerate contacts faster than submissions could.
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`known-fields:${formId}:${ip}`, { limit: 10, windowSec: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Muitas tentativas. Aguarde e tente novamente.', code: 'rate_limited', fields: {} },
        { status: 429, headers: CORS }
      );
    }
    const rlGlobal = await checkRateLimit(`known-fields:global:${ip}`, { limit: 30, windowSec: 60 });
    if (!rlGlobal.allowed) {
      return NextResponse.json(
        { success: false, error: 'Muitas tentativas. Aguarde e tente novamente.', code: 'rate_limited', fields: {} },
        { status: 429, headers: CORS }
      );
    }

    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('organization_id, behavior')
      .eq('id', formId)
      .single();

    if (!form) {
      return NextResponse.json({ fields: {} }, { headers: CORS });
    }

    const progressive = form.behavior?.progressiveProfiling;
    if (!progressive?.enabled) {
      return NextResponse.json({ fields: {} }, { headers: CORS });
    }

    let contact: any = null;
    let includeValues = false;

    if (email) {
      // Exact match on the normalized lowercase e-mail. The previous
      // .ilike() with the raw query string let "%@gmail.com" match (and
      // scrape) arbitrary contacts via unescaped LIKE wildcards.
      const { data } = await supabaseAdmin
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('organization_id', form.organization_id)
        .eq('email', email)
        .maybeSingle();
      contact = data;
      includeValues = false; // e-mail path: booleans only, never values
    }

    if (!contact && visitorId) {
      // Resolve the identity by its canonical worder_visitor_id, falling
      // back to the alias table (the old query filtered a nonexistent
      // client_visitor_id column and silently errored on every call).
      let identityContactId: string | null = null;

      const { data: identity } = await supabaseAdmin
        .from('visitor_identities')
        .select('contact_id')
        .eq('organization_id', form.organization_id)
        .eq('worder_visitor_id', visitorId)
        .not('contact_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      identityContactId = identity?.contact_id || null;

      if (!identityContactId) {
        const { data: alias } = await supabaseAdmin
          .from('visitor_id_aliases')
          .select('identity_id')
          .eq('organization_id', form.organization_id)
          .eq('alias_visitor_id', visitorId)
          .maybeSingle();
        if (alias?.identity_id) {
          const { data: aliased } = await supabaseAdmin
            .from('visitor_identities')
            .select('contact_id')
            .eq('id', alias.identity_id)
            .not('contact_id', 'is', null)
            .maybeSingle();
          identityContactId = aliased?.contact_id || null;
        }
      }

      if (identityContactId) {
        const { data } = await supabaseAdmin
          .from('contacts')
          .select(CONTACT_FIELDS)
          .eq('id', identityContactId)
          .single();
        contact = data;
        // visitor-id path: the token is long + random (unguessable), so
        // returning values for prefill is acceptable.
        includeValues = true;
      }
    }

    if (!contact) {
      return NextResponse.json({ fields: {} }, { headers: CORS });
    }

    return NextResponse.json({ fields: collectKnown(contact, includeValues) }, { headers: CORS });
  } catch (error: any) {
    console.error('[known-fields] Error:', error.message);
    return NextResponse.json({ fields: {} }, { headers: CORS });
  }
}
