// =============================================
// WORDER: Open Pixel Tracker
// Retorna 1x1 GIF + grava open no CDP (contact_events).
// =============================================

import { NextRequest, NextResponse } from 'next/server';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;

  // Fire-and-forget
  recordOpen(emailSendId).catch(() => {});

  return new NextResponse(GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

async function recordOpen(emailSendId: string) {
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

    // email_sends.opened_at (primeiro open)
    await supabaseAdmin.from('email_sends')
      .update({ opened_at: now }).eq('id', emailSendId).is('opened_at', null);

    // CDP: contact_events
    if (orgId && send.contact_id) {
      const day = now.slice(0, 10);
      await supabaseAdmin.from('contact_events').insert({
        organization_id: orgId, contact_id: send.contact_id,
        event_type: 'email_opened', event_source: 'worder_email',
        properties: { CampaignId: send.campaign_id, SendId: emailSendId, ab_variant: send.ab_variant },
        occurred_at: now,
        idempotency_key: `email_opened:${send.campaign_id}:${send.contact_id}:${day}`,
      }).select().maybeSingle();

      await supabaseAdmin.from('contacts')
        .update({ last_active_at: now, last_event_type: 'email_opened' })
        .eq('id', send.contact_id);
    }

    // Campaign stats
    if (send.campaign_id) {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: send.campaign_id }); if (rpcErr) { /* silent */ }
    }
  } catch (e) { console.error('[OpenPixel]', e); }
}
