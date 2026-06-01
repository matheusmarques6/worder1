// =============================================
// Public Preferences API
// GET /api/public/preferences?token=...  — fetch current consent state
// POST /api/public/preferences           — update consent + topics
//
// Public endpoint (no auth) — gated by HMAC-signed token from email link.
// Same token format as unsubscribe so existing emails work seamlessly.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400, headers: CORS });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401, headers: CORS });
  }

  try {
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, is_subscribed_email, is_subscribed_sms, is_subscribed_whatsapp, email_consent, status, custom_fields')
      .eq('id', verified.contactId)
      .eq('organization_id', verified.orgId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404, headers: CORS });
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, settings, email_settings')
      .eq('id', verified.orgId)
      .single();

    return NextResponse.json({
      contact: {
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email_subscribed: contact.is_subscribed_email !== false && contact.email_consent !== false && !['bounced', 'complained', 'unsubscribed', 'invalid'].includes(String(contact.status || '').toLowerCase()),
        sms_subscribed: !!contact.is_subscribed_sms,
        whatsapp_subscribed: !!contact.is_subscribed_whatsapp,
        topics: contact.custom_fields?.email_topics || [],
      },
      organization: {
        name: org?.name || 'Loja',
        from_email: org?.email_settings?.default_from_email || null,
      },
    }, { headers: CORS });
  } catch (error: any) {
    console.error('[preferences GET] Error:', error.message);
    return NextResponse.json({ error: 'Erro ao carregar preferências' }, { status: 500, headers: CORS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email_subscribed, sms_subscribed, whatsapp_subscribed, topics } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400, headers: CORS });
    }

    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 401, headers: CORS });
    }

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id, custom_fields, status')
      .eq('id', verified.contactId)
      .eq('organization_id', verified.orgId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404, headers: CORS });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof email_subscribed === 'boolean') {
      updatePayload.is_subscribed_email = email_subscribed;
      updatePayload.email_consent = email_subscribed;
      // If re-subscribing, clear bounce/unsub status so the contact can
      // receive again. Keep 'complained' contacts blocked — that's a hard
      // signal we never override via self-service.
      if (email_subscribed && String(contact.status || '').toLowerCase() === 'unsubscribed') {
        updatePayload.status = 'active';
      }
      if (!email_subscribed) {
        updatePayload.status = 'unsubscribed';
        updatePayload.unsubscribed_at = new Date().toISOString();
      }
    }

    if (typeof sms_subscribed === 'boolean') {
      updatePayload.is_subscribed_sms = sms_subscribed;
    }
    if (typeof whatsapp_subscribed === 'boolean') {
      updatePayload.is_subscribed_whatsapp = whatsapp_subscribed;
    }

    if (Array.isArray(topics)) {
      const currentCustom = contact.custom_fields || {};
      updatePayload.custom_fields = { ...currentCustom, email_topics: topics };
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .update(updatePayload)
      .eq('id', verified.contactId)
      .eq('organization_id', verified.orgId);

    if (error) {
      console.error('[preferences POST] Update error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
    }

    // Log activity for auditability
    try {
      await supabaseAdmin.from('contact_activities').insert({
        contact_id: verified.contactId,
        organization_id: verified.orgId,
        type: 'preferences_updated',
        description: 'Contato atualizou preferências via centro de preferências',
        metadata: {
          email_subscribed,
          sms_subscribed,
          whatsapp_subscribed,
          topics: Array.isArray(topics) ? topics : null,
          campaign_id: verified.campaignId,
        },
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true }, { headers: CORS });
  } catch (error: any) {
    console.error('[preferences POST] Error:', error.message);
    return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500, headers: CORS });
  }
}
