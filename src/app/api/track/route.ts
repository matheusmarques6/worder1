import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// CORS headers for cross-origin tracking
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      org_id, visitor_id, session_id, event_name,
      page_url, referrer, user_agent,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbclid, gclid, ttclid,
      email, custom_data,
    } = body;

    if (!org_id || !event_name) {
      return NextResponse.json({ error: 'org_id and event_name required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 503, headers: corsHeaders });
    }

    // Insert tracking event
    const eventData = {
      organization_id: org_id,
      visitor_id: visitor_id || null,
      session_id: session_id || null,
      event_name,
      page_url: page_url || null,
      referrer: referrer || null,
      user_agent: user_agent || request.headers.get('user-agent') || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      fbclid: fbclid || null,
      gclid: gclid || null,
      ttclid: ttclid || null,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      custom_data: custom_data || {},
    };

    try {
      await supabase.from('tracking_events').insert(eventData);
    } catch (e) {
      console.error('[Track] Insert error:', e);
    }

    // If email provided, try to link visitor to contact
    if (email) {
      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', org_id)
          .eq('email', email)
          .single();

        if (contact) {
          await supabase
            .from('tracking_events')
            .update({ contact_id: contact.id })
            .eq('organization_id', org_id)
            .eq('visitor_id', visitor_id)
            .is('contact_id', null);
        }
      } catch {}
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders });
  }
}
