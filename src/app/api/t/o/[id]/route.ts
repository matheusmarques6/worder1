// =============================================
// WORDER: Open Pixel Tracker
// Retorna 1x1 GIF + grava open no CDP (contact_events).
// Apple MPP (Mail Privacy Protection) auto-fetches the pixel the
// moment the email is delivered, which inflates open rates and
// poisons attribution. We detect MPP server-side and write to
// mpp_opened_at instead of opened_at; the attribution RPC only
// honors real opens by default (matches Klaviyo).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { detectMpp } from '@/lib/email/mpp-detection';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;

  // Fire-and-forget — the pixel response can't block on DB writes
  // or the email client will give up waiting and show a broken image.
  recordOpen(emailSendId, request.headers).catch(() => {});

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

async function recordOpen(emailSendId: string, headers: Headers) {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    // select('*') em vez de lista de colunas: com lista explícita, uma
    // coluna ausente no schema vivo (mpp_opened_at ficou meses sem a
    // migration) erra o SELECT inteiro, send fica null e o open é
    // engolido sem log — 372 envios com zero aberturas registradas.
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('*')
      .eq('id', emailSendId).maybeSingle();
    if (!send) return;

    let orgId: string | null = null;
    if (send.campaign_id) {
      const { data: c } = await supabaseAdmin.from('email_campaigns')
        .select('organization_id').eq('id', send.campaign_id).maybeSingle();
      orgId = c?.organization_id || null;
    }

    const now = new Date().toISOString();
    const mpp = detectMpp({ headers, sentAt: send.sent_at });

    // Route the timestamp to the right column. MPP opens land in
    // mpp_opened_at so dashboards + the attribution RPC can ignore
    // them by default. Genuine opens land in opened_at as before.
    if (mpp.isMpp) {
      const { error: mppErr } = await supabaseAdmin.from('email_sends')
        .update({ mpp_opened_at: now }).eq('id', emailSendId).is('mpp_opened_at', null);
      // Schema sem mpp_opened_at: melhor contar como abertura normal do
      // que perder o evento (é o que acontecia antes da coluna existir).
      if (mppErr) {
        await supabaseAdmin.from('email_sends')
          .update({ opened_at: now }).eq('id', emailSendId).is('opened_at', null);
      }
    } else {
      await supabaseAdmin.from('email_sends')
        .update({ opened_at: now }).eq('id', emailSendId).is('opened_at', null);
    }

    // CDP: contact_events — only record human opens. MPP opens are
    // noise in the timeline; we keep the column-level record but
    // don't pollute the activity feed.
    if (orgId && send.contact_id && !mpp.isMpp) {
      const day = now.slice(0, 10);
      await supabaseAdmin.from('contact_events').insert({
        organization_id: orgId, contact_id: send.contact_id,
        event_type: 'email_opened', event_source: 'worder_email',
        properties: { CampaignId: send.campaign_id, SendId: emailSendId, ab_variant: send.ab_variant },
        occurred_at: now,
        idempotency_key: `email_opened:${send.campaign_id}:${send.contact_id}:${day}`,
      }).select().maybeSingle();
    }

    // Bump last_active_at on ANY human open with a contact — not only
    // campaign opens. The engagement-decay cron treats a stale/null
    // last_active_at as "não engajado"; gating this on orgId (unresolved
    // for flow/transactional sends) let real opens go unrecorded and the
    // contact could be wrongly decayed. contact_events above stays
    // org-gated (it needs organization_id); this bump does not.
    if (send.contact_id && !mpp.isMpp) {
      await supabaseAdmin.from('contacts')
        .update({ last_active_at: now, last_event_type: 'email_opened' })
        .eq('id', send.contact_id);
    }

    // Campaign stats — only count real opens, not MPP prefetches.
    if (send.campaign_id && !mpp.isMpp) {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: send.campaign_id }); if (rpcErr) { /* silent */ }
    }
  } catch (e) { console.error('[OpenPixel]', e); }
}
