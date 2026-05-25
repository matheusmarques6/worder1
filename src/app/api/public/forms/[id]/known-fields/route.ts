import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formId } = await params;
  const { searchParams } = request.nextUrl;
  const email = searchParams.get('email');
  const visitorId = searchParams.get('visitor_id');

  if (!email && !visitorId) {
    return NextResponse.json({ fields: {} }, { headers: CORS });
  }

  try {
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

    if (email) {
      const { data } = await supabaseAdmin
        .from('contacts')
        .select('email, phone, first_name, last_name, company, city, state, country, birthday, custom_fields')
        .eq('organization_id', form.organization_id)
        .ilike('email', email)
        .maybeSingle();
      contact = data;
    }

    if (!contact && visitorId) {
      const { data: identity } = await supabaseAdmin
        .from('visitor_identities')
        .select('contact_id')
        .eq('organization_id', form.organization_id)
        .eq('client_visitor_id', visitorId)
        .not('contact_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (identity?.contact_id) {
        const { data } = await supabaseAdmin
          .from('contacts')
          .select('email, phone, first_name, last_name, company, city, state, country, birthday, custom_fields')
          .eq('id', identity.contact_id)
          .single();
        contact = data;
      }
    }

    if (!contact) {
      return NextResponse.json({ fields: {} }, { headers: CORS });
    }

    // Return known fields (non-null, non-empty values only)
    const known: Record<string, string> = {};
    const fieldMap: Record<string, string> = {
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
        known[key] = String(value);
      }
    }

    // Include custom fields
    if (contact.custom_fields && typeof contact.custom_fields === 'object') {
      for (const [key, value] of Object.entries(contact.custom_fields)) {
        if (value && String(value).trim()) {
          known[`custom:${key}`] = String(value);
        }
      }
    }

    return NextResponse.json({ fields: known }, { headers: CORS });
  } catch (error: any) {
    console.error('[known-fields] Error:', error.message);
    return NextResponse.json({ fields: {} }, { headers: CORS });
  }
}
