// =============================================
// WORDER: Click Tracker / Redirect
// Grava click no CDP (contact_events) + email_sends + attribution.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  const decodedUrl = decodeURIComponent(url);

  // Fire-and-forget — não bloqueia redirect
  recordClick(emailSendId, decodedUrl).catch(() => {});
  return NextResponse.redirect(decodedUrl, 302);
}

async function recordClick(emailSendId: string, url: string) {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('id, campaign_id, contact_id, ab_variant')
      .eq('id', emailSendId).maybeSingle();
    if (!send) return;

    let orgId: string | null = null;
    if (send.campaign_id) {
      const { data: c } = await supabaseAdmin.from('email_campaigns')
        .select('organization_id').eq('id', send.campaign_id).maybeSingle();
      orgId = c?.organization_id || null;
    }

    const now = new Date().toISOString();

    // email_sends.clicked_at
    await supabaseAdmin.from('email_sends')
      .update({ clicked_at: now }).eq('id', emailSendId).is('clicked_at', null);

    // CDP: contact_events
    if (orgId && send.contact_id) {
      const day = now.slice(0, 10);
      await supabaseAdmin.from('contact_events').insert({
        organization_id: orgId, contact_id: send.contact_id,
        event_type: 'email_clicked', event_source: 'worder_email',
        properties: { CampaignId: send.campaign_id, SendId: emailSendId, ClickedURL: url, ab_variant: send.ab_variant },
        occurred_at: now,
        idempotency_key: `email_clicked:${send.campaign_id}:${send.contact_id}:${day}:${url.slice(0, 100)}`,
      }).select().maybeSingle();

      await supabaseAdmin.from('contacts')
        .update({ last_active_at: now, last_event_type: 'email_clicked' })
        .eq('id', send.contact_id);

      // Attribution: email click = last touch
      await supabaseAdmin.from('attribution_touchpoints').insert({
        organization_id: orgId, contact_id: send.contact_id,
        touchpoint_type: 'last', utm_source: 'email', utm_medium: 'email',
        utm_campaign: send.campaign_id, occurred_at: now,
      }).select().maybeSingle();
    }

    // Campaign stats
    if (send.campaign_id) {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_clicks', { campaign_id: send.campaign_id }); if (rpcErr) { /* silent */ }
    }
  } catch (e) { console.error('[ClickTracker]', e); }
}
