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
import { publicStoreUrl } from '@/lib/shopify/store-url';

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
 * email esta quebrado (merge tag vazia, template malformado).
 *
 * A loja tem de ser a DO ENVIO. Antes, sem loja na campanha, caía na
 * "loja ativa mais nova da organização" — e um clique num e-mail da
 * Dr. Groot levava para a Medicube, cadastrada no dia. A ordem agora:
 *   email_sends.store_id → campanha → automação → contato → única loja
 *   ativa da organização → worder.com.br.
 * Nunca "qualquer loja da organização".
 */
async function resolveStoreFallback(emailSendId: string): Promise<string> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('campaign_id, organization_id, store_id, contact_id, flow_id, automation_id')
      .eq('id', emailSendId)
      .maybeSingle();
    if (!send) return 'https://worder.com.br';

    const storeUrlById = async (storeId: string | null | undefined): Promise<string> => {
      if (!storeId) return '';
      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('shop_domain, primary_domain, organization_id')
        .eq('id', storeId)
        .maybeSingle();
      // A loja de outra organização não serve, venha de onde vier o id.
      if (!store || (send.organization_id && store.organization_id !== send.organization_id)) return '';
      // A coluna é shop_domain — pedir `domain` fazia o PostgREST devolver
      // erro e este fallback NUNCA funcionava. E o host certo para o
      // cliente é o principal.
      return publicStoreUrl(store);
    };

    // 1. O envio sabe a sua loja.
    { const url = await storeUrlById(send.store_id); if (url) return url; }

    // 2. A campanha.
    if (send.campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from('email_campaigns')
        .select('store_id')
        .eq('id', send.campaign_id)
        .maybeSingle();
      const url = await storeUrlById(campaign?.store_id);
      if (url) return url;
    }

    // 3. A automação (envios de fluxo gravam flow_id / automation_id).
    const automationId = send.automation_id || send.flow_id || null;
    if (automationId && /^[0-9a-f-]{36}$/i.test(String(automationId))) {
      const { data: automation } = await supabaseAdmin
        .from('automations')
        .select('store_id')
        .eq('id', automationId)
        .maybeSingle();
      const url = await storeUrlById(automation?.store_id);
      if (url) return url;
    }

    // 4. O contato é de UMA loja.
    if (send.contact_id) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('store_id')
        .eq('id', send.contact_id)
        .maybeSingle();
      const url = await storeUrlById(contact?.store_id);
      if (url) return url;
    }

    // 5. Só quando a organização tem UMA loja ativa não há o que errar.
    if (send.organization_id) {
      const { data: stores } = await supabaseAdmin
        .from('shopify_stores')
        .select('shop_domain, primary_domain')
        .eq('organization_id', send.organization_id)
        .eq('is_active', true);
      const reais = (stores || []).filter((s: any) => !String(s.shop_domain || '').endsWith('.worder.local'));
      if (reais.length === 1) {
        const url = publicStoreUrl(reais[0]);
        if (url) return url;
      }
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
  /** Fluxo (automation_id / flow_id) quando o envio veio de uma automação. */
  automationId: string | null;
  /** Nó do fluxo que enviou (email_sends.metadata.node_id). */
  messageId: string | null;
}

const EMPTY_ATTRIBUTION: ClickAttribution = {
  contactId: null, campaignId: null, organizationId: null, abVariant: null, automationId: null, messageId: null,
};

async function resolveAttribution(emailSendId: string): Promise<ClickAttribution> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('id, campaign_id, contact_id, organization_id, ab_variant, automation_id, flow_id, metadata')
      .eq('id', emailSendId)
      .maybeSingle();
    if (!send) {
      return EMPTY_ATTRIBUTION;
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

    const automationId = (send as any).automation_id || (send as any).flow_id || null;
    return {
      contactId: send.contact_id || null,
      // Num envio de automação, campaign_id é só o id do fluxo como
      // substituto — não é campanha.
      campaignId: automationId ? null : send.campaign_id || null,
      organizationId,
      abVariant: send.ab_variant || null,
      automationId,
      messageId: (send as any).metadata?.node_id || null,
    };
  } catch (err) {
    console.error('[ClickTracker] resolveAttribution failed:', err);
    return EMPTY_ATTRIBUTION;
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

  // O destino normalmente JÁ chega completo: o render do e-mail carimba
  // UTM + identificação em todo link (src/lib/tracking/link-params.ts).
  // Este passo é a rede de segurança — e-mails antigos, links que o
  // render não conseguiu tocar — e só preenche o que falta, nunca
  // sobrescreve (uma UTM colocada à mão pelo lojista vence).
  //
  // Identificação: o que o pixel da loja lê para amarrar o visitante a
  // este contato/envio, mesmo em outro dispositivo.
  if (attribution.contactId && !sp.has('worderContactID')) {
    sp.set('worderContactID', attribution.contactId);
  }
  if (emailSendId && !sp.has('worderSendID')) {
    sp.set('worderSendID', emailSendId);
  }
  if (attribution.campaignId && !sp.has('worderCampaignID')) {
    sp.set('worderCampaignID', attribution.campaignId);
  }
  if (attribution.automationId && !sp.has('worderAutomationID')) {
    sp.set('worderAutomationID', attribution.automationId);
  }
  const messageId = attribution.messageId || attribution.campaignId;
  if (messageId && !sp.has('worderMessageID')) {
    sp.set('worderMessageID', messageId);
  }

  // UTM mínimas de fallback (legado sem carimbo no render).
  if (!sp.has('utm_source')) sp.set('utm_source', 'worder');
  if (!sp.has('utm_medium')) sp.set('utm_medium', 'email');
  if (!sp.has('utm_campaign')) {
    if (attribution.campaignId) sp.set('utm_campaign', `campaign: (${attribution.campaignId})`);
    else if (attribution.automationId) sp.set('utm_campaign', `automation: (${attribution.automationId})`);
  }
  if (!sp.has('utm_id')) {
    const id = attribution.campaignId || attribution.automationId;
    if (id) sp.set('utm_id', id);
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
