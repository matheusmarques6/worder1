// =============================================
// WORDER: Click Tracker / Redirect
//
// Inbound URL pattern (from email render):
//   /api/t/c/<emailSendId>?url=<encoded destination>
//
// Three jobs:
//   1. Resolve send → contact/campaign/org (synchronous, ~50ms). We
//      need this BEFORE the redirect so we can stamp the destination
//      URL with attribution params for the storefront pixel.
//   2. Stamp the destination with worderContactID + worderSendID +
//      worderCampaignID + utm_source/medium/campaign and 302. This is
//      the cross-device attribution carrier — same pattern Klaviyo
//      and Omnisend use (the worderContactID in the URL lets the
//      pixel attach the visitor identity to this exact contact even
//      if they're on a different device than where the email opened).
//   3. Fire-and-forget: record click in contact_events +
//      email_sends.clicked_at + campaign counters +
//      attribution_touchpoints.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  // Normaliza: descodifica URI + entidades HTML residuais (`&amp;` etc.)
  // que possam ter escapado em emails enviados ANTES do fix em
  // rewriteUrlsForTracking (Onda 14). Sem isso, links antigos cairiam
  // num path relativo (`/&amp;discount=…`) e quebrariam em 404.
  let decodedUrl = decodeURIComponent(url)
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");

  // Synchronous lookup so the redirect URL can carry attribution
  // params. Cost: one Supabase query (~50ms). Gain: every storefront
  // pixel boot after this click can identify the visitor as this
  // exact contact, even on a different device than where they read
  // the email.
  const attribution = await resolveAttribution(emailSendId);

  // Defesa em profundidade: se o destino nao for http(s) (template
  // quebrado, merge tag vazia, etc.), redireciona pro storefront da org
  // em vez de bater num path relativo quebrado. Click ainda eh registrado
  // pra que o merchant veja no painel que houve interesse.
  if (!/^https?:\/\//i.test(decodedUrl)) {
    const fallback = await resolveStoreFallback(emailSendId);
    console.warn(
      `[ClickTracker] destino invalido send=${emailSendId} url="${decodedUrl.slice(0, 80)}" -> fallback=${fallback}`
    );
    recordClick(emailSendId, decodedUrl, attribution).catch(() => {});
    return NextResponse.redirect(fallback, 302);
  }

  // Fire-and-forget the rest (event row, counters, touchpoint).
  recordClick(emailSendId, decodedUrl, attribution).catch(() => {});

  const stamped = stampDestination(decodedUrl, emailSendId, attribution);
  return NextResponse.redirect(stamped, 302);
}

/**
 * Resolve a URL "casa" pra qual mandar o contato quando o destino do
 * email esta quebrado (merge tag vazia, template malformado). Caminho:
 * email_sends -> email_campaigns.store_id -> shopify_stores.domain.
 * Fallback final: app.worder.com.br.
 */
async function resolveStoreFallback(emailSendId: string): Promise<string> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('campaign_id, organization_id')
      .eq('id', emailSendId)
      .maybeSingle();
    if (send?.campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from('email_campaigns')
        .select('store_id')
        .eq('id', send.campaign_id)
        .maybeSingle();
      if (campaign?.store_id) {
        const { data: store } = await supabaseAdmin
          .from('shopify_stores')
          .select('domain')
          .eq('id', campaign.store_id)
          .maybeSingle();
        if (store?.domain) return `https://${store.domain}`;
      }
    }
    // Sem store na campanha — tenta primeira loja ativa da org.
    if (send?.organization_id) {
      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('domain')
        .eq('organization_id', send.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (store?.domain) return `https://${store.domain}`;
    }
  } catch (err) {
    console.error('[ClickTracker] resolveStoreFallback failed:', err);
  }
  return 'https://worder.com.br';
}

interface ClickAttribution {
  contactId: string | null;
  campaignId: string | null;
  organizationId: string | null;
  abVariant: string | null;
}

async function resolveAttribution(emailSendId: string): Promise<ClickAttribution> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('id, campaign_id, contact_id, organization_id, ab_variant')
      .eq('id', emailSendId)
      .maybeSingle();
    if (!send) {
      return { contactId: null, campaignId: null, organizationId: null, abVariant: null };
    }

    // email_sends.organization_id is populated on every new send via
    // send-campaign-email.ts. Fall back to email_campaigns lookup for
    // older rows that pre-date that column being filled in.
    let organizationId = send.organization_id || null;
    if (!organizationId && send.campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from('email_campaigns')
        .select('organization_id')
        .eq('id', send.campaign_id)
        .maybeSingle();
      organizationId = campaign?.organization_id || null;
    }

    return {
      contactId: send.contact_id || null,
      campaignId: send.campaign_id || null,
      organizationId,
      abVariant: send.ab_variant || null,
    };
  } catch (err) {
    console.error('[ClickTracker] resolveAttribution failed:', err);
    return { contactId: null, campaignId: null, organizationId: null, abVariant: null };
  }
}

function stampDestination(
  destination: string,
  emailSendId: string,
  attribution: ClickAttribution
): string {
  // Only http(s) destinations can carry query params. mailto:/tel:/#
  // pass through untouched.
  if (!/^https?:\/\//i.test(destination)) return destination;

  let target: URL;
  try {
    target = new URL(destination);
  } catch {
    return destination;
  }

  const sp = target.searchParams;

  // Worder identifiers — always stamp when present, never duplicate.
  // These are what the theme app embed reads on page load to attach
  // the visitor's identity to this exact contact.
  if (attribution.contactId && !sp.has('worderContactID')) {
    sp.set('worderContactID', attribution.contactId);
  }
  if (emailSendId && !sp.has('worderSendID')) {
    sp.set('worderSendID', emailSendId);
  }
  if (attribution.campaignId && !sp.has('worderCampaignID')) {
    sp.set('worderCampaignID', attribution.campaignId);
  }

  // UTM params — respect anything the merchant hand-placed on their
  // links (e.g. ?utm_source=instagram on a co-promo). Only fill blanks.
  if (!sp.has('utm_source')) sp.set('utm_source', 'worder');
  if (!sp.has('utm_medium')) sp.set('utm_medium', 'email');
  if (attribution.campaignId && !sp.has('utm_campaign')) {
    sp.set('utm_campaign', attribution.campaignId);
  }

  target.search = sp.toString();
  return target.toString();
}

async function recordClick(
  emailSendId: string,
  url: string,
  attribution: ClickAttribution
) {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');

    const now = new Date().toISOString();

    // email_sends.clicked_at — only the first click flips it.
    await supabaseAdmin.from('email_sends')
      .update({ clicked_at: now }).eq('id', emailSendId).is('clicked_at', null);

    // CDP: contact_events
    if (attribution.organizationId && attribution.contactId) {
      const day = now.slice(0, 10);
      await supabaseAdmin.from('contact_events').insert({
        organization_id: attribution.organizationId,
        contact_id: attribution.contactId,
        event_type: 'email_clicked',
        event_source: 'worder_email',
        properties: {
          CampaignId: attribution.campaignId,
          SendId: emailSendId,
          ClickedURL: url,
          ab_variant: attribution.abVariant,
        },
        occurred_at: now,
        idempotency_key: `email_clicked:${attribution.campaignId}:${attribution.contactId}:${day}:${url.slice(0, 100)}`,
      }).select().maybeSingle();

      await supabaseAdmin.from('contacts')
        .update({ last_active_at: now, last_event_type: 'email_clicked' })
        .eq('id', attribution.contactId);

      // Attribution touchpoint: email click = last touch
      await supabaseAdmin.from('attribution_touchpoints').insert({
        organization_id: attribution.organizationId,
        contact_id: attribution.contactId,
        touchpoint_type: 'last',
        utm_source: 'email',
        utm_medium: 'email',
        utm_campaign: attribution.campaignId,
        occurred_at: now,
      }).select().maybeSingle();
    }

    // Campaign stats
    if (attribution.campaignId) {
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_clicks', {
        campaign_id: attribution.campaignId,
      });
      if (rpcErr) { /* silent */ }
    }
  } catch (e) {
    console.error('[ClickTracker]', e);
  }
}
