// =============================================
// WORDER: Send Campaign Email Pipeline
// /src/lib/email/send-campaign-email.ts
//
// Create email_sends row, prepare HTML, send
// via Resend, update status.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getEmailProviderForOrg } from '@/lib/email/providers';
import { prepareEmailHtml, resolveProductBlocks, resolveCartBlocks } from '@/lib/email/render';
import { getUtmSettings } from '@/lib/tracking/utm-settings';
import { makeLinkParamsResolver, type LinkContext, type UtmTemplates } from '@/lib/tracking/link-params';

export interface SendCampaignEmailParams {
  campaignId: string;
  contactId: string;
  contactEmail: string;
  mergeData: Record<string, string>;
  templateHtml: string;
  /**
   * Optional plain-text alternative. When present, ships as the
   * text/plain half of a multipart/alternative MIME, which:
   *   - satisfies SpamAssassin's MIME_HTML_NO_TEXT rule
   *   - covers screen readers, smartwatches and text-only clients
   *   - is the canonical body for the "text-based" editor flavor
   * Merge tags inside this body get resolved per-recipient with the
   * non-escaping plain-text renderer (HTML escaping would leak &amp;
   * into the inbox preview).
   */
  templateText?: string;
  subject: string;
  fromEmail: string;
  senderName?: string;
  replyTo?: string;
  baseUrl: string;
  organizationId: string;
  /** Store the send belongs to — resolves the STORE's sender identity
   *  (from / sender name / reply-to) instead of the org default. */
  storeId?: string | null;
  eventData?: Record<string, any>;
  /** Automation trigger type (e.g. 'trigger_checkout_abandoned') so the
   *  "Produtos do Gatilho" block builds the correct CTA link. Omitted for
   *  plain campaign broadcasts (link family inferred from the event). */
  triggerType?: string | null;
  /**
   * Trava de duplicidade. Quando presente, o índice único em
   * email_sends garante que este envio saia UMA vez — mesmo com várias
   * execuções concorrentes tentando ao mesmo tempo.
   */
  dedupeKey?: string | null;
  /**
   * Contexto para as UTMs + identificação de TODO link do e-mail
   * (nome/id da campanha ou automação, nome/id da mensagem…). Sem ele,
   * o envio é tratado como campanha quando há campaignId e como
   * automação caso contrário. sendId/contactId/loja são preenchidos aqui.
   */
  linkContext?: Partial<LinkContext> | null;
  /** Sobrescritas de UTM desta mensagem (nó do fluxo). */
  utmOverrides?: Partial<UtmTemplates> | null;
  /** Desliga só as UTMs desta mensagem — a identificação continua. */
  utmDisabled?: boolean;
}

export async function sendCampaignEmail({
  campaignId,
  contactId,
  contactEmail,
  mergeData,
  templateHtml,
  templateText,
  subject,
  fromEmail,
  senderName,
  replyTo,
  baseUrl,
  organizationId,
  storeId,
  eventData,
  triggerType,
  dedupeKey,
  linkContext,
  utmOverrides,
  utmDisabled,
}: SendCampaignEmailParams): Promise<{ success: boolean; emailSendId?: string; error?: string; skipped?: boolean; reason?: string }> {
  let emailSendId = '' as string;
  // Hoisted so the catch block can flip email_consent on the contact
  // when Resend reports a permanent failure mid-send.
  let resolvedContactId: string | null = null;

  try {
    const isUuid = (v: any) =>
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // 0. Ensure we have a real contact row to attach the send to.
    // email_sends.contact_id is NOT NULL on the production schema, so a
    // brand-new abandoned-cart lead (no Worder contact yet) would fail
    // the INSERT below. Upsert by (org, email) so the FK is satisfied
    // and the same contact is reused across future sends.
    resolvedContactId = isUuid(contactId) ? contactId : null;
    if (!resolvedContactId && contactEmail && organizationId) {
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', contactEmail)
        .maybeSingle();
      if (existing?.id) {
        resolvedContactId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabaseAdmin
          .from('contacts')
          .insert({
            organization_id: organizationId,
            email: contactEmail,
            source: 'flow_email',
          })
          .select('id')
          .single();
        if (createErr) {
          console.error('[SendCampaignEmail] Failed to create contact:', createErr);
        } else {
          resolvedContactId = created?.id || null;
        }
      }
    }

    // 0b. A loja do envio. O fluxo sabe a sua (automations.store_id);
    // um fluxo da organização inteira herda a loja do contato — o
    // cliente é de UMA loja, e os produtos, links e a atribuição do
    // envio têm de ser dela.
    let sendStoreId: string | null = storeId || null;
    if (!sendStoreId && resolvedContactId) {
      try {
        const { data: contactRow } = await supabaseAdmin
          .from('contacts')
          .select('store_id')
          .eq('id', resolvedContactId)
          .eq('organization_id', organizationId)
          .maybeSingle();
        sendStoreId = contactRow?.store_id || null;
      } catch { /* segue sem loja */ }
    }

    // 1. Create email_sends row with status 'queued'
    // 'queued' is the initial state allowed by email_sends_status_check;
    // 'pending' is NOT in the allowlist and would fail the CHECK constraint.
    //
    // The production schema has both `email` and `to_email` (legacy +
    // current) plus `from_email`/`sender_email`/`subject` that earlier
    // migrations added. Populate the new columns so dashboards / queries
    // that read them don't see blanks. `email` stays mirrored for
    // backwards compatibility.
    const { data: emailSend, error: insertError } = await supabaseAdmin
      .from('email_sends')
      .insert({
        campaign_id: isUuid(campaignId) ? campaignId : null,
        contact_id: resolvedContactId,
        email: contactEmail,
        to_email: contactEmail,
        from_email: fromEmail || null,
        sender_email: fromEmail || null,
        subject: subject || null,
        provider: 'resend',
        status: 'queued',
        organization_id: organizationId,
        // A loja do envio fica gravada: é o que o rastreador de clique
        // usa para mandar o contato para a loja CERTA quando o destino
        // do link está quebrado, e o que os relatórios por loja leem.
        store_id: sendStoreId,
        // Trava de duplicidade. O índice único faz o trabalho: seis runs
        // paralelas disparando com 2s de intervalo TODAS leriam "ainda
        // não enviei" numa verificação por SELECT, e todas mandariam.
        // Aqui a segunda simplesmente não consegue gravar.
        dedupe_key: dedupeKey || null,
      })
      .select('id')
      .single();

    // 23505 = violação de unicidade: outra execução já registrou este
    // mesmo envio. Não é erro — é a trava funcionando. Devolver sucesso
    // com skipped deixa o fluxo seguir para o próximo nó normalmente.
    if ((insertError as any)?.code === '23505' && dedupeKey) {
      console.log(`[SendCampaignEmail] duplicado bloqueado: ${dedupeKey}`);
      return { success: true, skipped: true, reason: 'duplicate_send' };
    }

    if (insertError || !emailSend) {
      console.error('[SendCampaignEmail] Failed to create email_sends row:', insertError);
      return { success: false, error: insertError?.message || 'Failed to create send record' };
    }

    emailSendId = emailSend.id;

    // 2a. Flatten eventData into mergeData for {{event.*}} tags
    if (eventData && typeof eventData === 'object') {
      const props = eventData.properties || eventData;
      for (const [k, v] of Object.entries(props)) {
        if (v == null || typeof v === 'object') continue;
        if (!mergeData[`event.${k}`]) mergeData[`event.${k}`] = String(v);
      }
      if (props.Items && Array.isArray(props.Items) && props.Items.length > 0) {
        const first = props.Items[0];
        mergeData['event.ProductName'] = mergeData['event.ProductName'] || first.ProductName || first.title || '';
        mergeData['event.Price'] = mergeData['event.Price'] || String(first.ItemPrice || first.price || '');
        mergeData['event.ImageURL'] = mergeData['event.ImageURL'] || first.ImageURL || '';
        mergeData['event.ProductURL'] = mergeData['event.ProductURL'] || first.ProductURL || '';
      }
      mergeData['event.Value'] = mergeData['event.Value'] || String(props.$value || props.Value || '');
      mergeData['event.Currency'] = mergeData['event.Currency'] || props.Currency || props.currency || '';
      mergeData['event.CheckoutURL'] = mergeData['event.CheckoutURL'] || props.CheckoutURL || '';
      mergeData['event.OrderId'] = mergeData['event.OrderId'] || props.OrderId || '';
      mergeData['event.ItemCount'] = mergeData['event.ItemCount'] || String(props.ItemCount || '');
      if (props.CheckoutURL && !mergeData.checkout_url) mergeData.checkout_url = props.CheckoutURL;
    }

    // 2b. Resolve checkout_url merge tag from contact's latest abandoned cart (if not provided)
    if (!mergeData.checkout_url || mergeData.checkout_url === '{{checkout_url}}') {
      try {
        const { data: cart } = await supabaseAdmin
          .from('shopify_checkouts')
          .select('recovery_url')
          .eq('status', 'abandoned')
          .or(`email.eq.${contactEmail},contact_id.eq.${contactId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cart?.recovery_url) {
          mergeData.checkout_url = cart.recovery_url
          mergeData['checkout.url'] = cart.recovery_url
        }
      } catch {} // Table may not exist
    }

    // 2c. Fallback final: storefront da org. Sem recovery_url disponivel,
    // melhor mandar o contato pra home da loja do que deixar `{{checkout_url}}`
    // resolver pra string vazia e gerar links quebrados (Onda 14: o tracker
    // tambem ja redireciona pro storefront nesses casos, mas evitar gerar o
    // link ruim em primeiro lugar e melhor pra UX e pras metricas de clique).
    if (!mergeData.checkout_url || mergeData.checkout_url === '{{checkout_url}}') {
      if (mergeData.store_url) {
        mergeData.checkout_url = mergeData.store_url
        mergeData['checkout.url'] = mergeData.store_url
        if (!mergeData['event.CheckoutURL']) {
          mergeData['event.CheckoutURL'] = mergeData.store_url
        }
      }
    }

    // 3. Resolve dynamic product blocks + cart blocks — sempre com a loja
    // do envio, para que produtos e links saiam da loja certa numa
    // organização com várias lojas.
    let htmlWithProducts = await resolveProductBlocks(templateHtml, organizationId, resolvedContactId || contactId, eventData, sendStoreId);
    // Pass eventData so the cart block can adapt to the active trigger
    // (cart vs checkout vs browse vs order) via trigger_auto feed type.
    htmlWithProducts = await resolveCartBlocks(htmlWithProducts, organizationId, resolvedContactId || contactId, eventData, triggerType, mergeData.store_url, sendStoreId);
    // Resolve {{ trigger.link }}, {{ trigger.first_item_image }} etc.
    // — smart tags that adapt the right URL/title/image to whichever
    // event fired the email.
    // Mapeamento da organização carregado UMA vez e reaproveitado pelas
    // três metades (html, assunto, texto) — é o que faz o caminho
    // configurado em Integrações valer no envio real.
    const { loadTagMapping } = await import('@/lib/merge-tags/load-mapping');
    const tagMapping = eventData ? await loadTagMapping(organizationId, sendStoreId) : undefined;

    if (eventData) {
      const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
      // escapeHtml: substituted values are HTML — escape & < > " ' (XSS).
      // URLs stay functional: render.ts's decodeHtmlEntitiesInUrl un-escapes
      // hrefs before the click-tracking encoding.
      // store_url → absolutizes site-relative URLs (e.g. {{ event.ProductURL }}
      // = "/products/x") against the store domain so links don't 404 on the app.
      htmlWithProducts = resolveTriggerSmartTags(htmlWithProducts, eventData, mergeData.store_url, {
        escapeHtml: true, mapping: tagMapping,
      });
    }

    // 3. Prepare HTML with merge tags, tracking, unsubscribe.
    // tracking_domain da loja/org (quando configurado) substitui o
    // baseUrl recebido — links de clique/abertura/unsubscribe saem num
    // host alinhado ao remetente em vez do domínio do app.
    let trackingBaseUrl = baseUrl;
    try {
      const { getTrackingBaseUrl } = await import('@/lib/email/tracking-url');
      trackingBaseUrl = await getTrackingBaseUrl(organizationId, sendStoreId || null);
    } catch { /* mantém o baseUrl do caller */ }

    // 3a. Render subject merge tags — the subject must go through the SAME
    // trigger resolvers as the body, otherwise {{ CheckoutURL }} /
    // {{ trigger.* }} / {{ event.* }} tags in the subject line reach the
    // inbox unresolved. Plain-text context: NO html-escaping here.
    // Renderizado ANTES do HTML porque o assunto também alimenta as UTMs
    // ({{email_subject}} / {{message_name}} de campanha).
    let subjectSrc = subject;
    if (eventData) {
      const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
      subjectSrc = resolveTriggerSmartTags(subjectSrc, eventData, mergeData.store_url, { mapping: tagMapping });
    }
    const { renderMergeTags } = await import('@/lib/email/render');
    // escape:false — the subject is text/plain: escaping would ship a
    // literal `&amp;` to the inbox ("Zé & Cia" → "Zé &amp; Cia").
    const finalSubject = renderMergeTags(subjectSrc, mergeData, { escape: false });

    // 3b. UTM + identificação em todo link. A configuração é a da LOJA do
    // envio (padrão da organização só quando a loja não configurou nada).
    // Falha aqui nunca derruba o envio: o pior caso é o link sair só com
    // o que o rastreador de clique carimba no redirect.
    let linkParams: ReturnType<typeof makeLinkParamsResolver> | null = null;
    try {
      const { settings: utmSettings } = await getUtmSettings(organizationId, sendStoreId);
      const messageType = linkContext?.messageType || (isUuid(campaignId) ? 'campaign' : 'automation');
      const ctx: LinkContext = {
        channel: 'email',
        messageType,
        // Numa automação o campaignId é só o id do fluxo como substituto
        // (email_sends.campaign_id) — não é campanha.
        campaignId: messageType === 'campaign' && isUuid(campaignId) ? campaignId : null,
        ...(linkContext || {}),
        sendId: emailSendId,
        contactId: resolvedContactId || null,
        emailSubject: linkContext?.emailSubject || finalSubject,
        storeName: linkContext?.storeName || mergeData.store_name || null,
        storeDomain: linkContext?.storeDomain || mergeData.store_url || null,
        sentAt: new Date(),
        extra: { ...mergeData, ...(linkContext?.extra || {}) },
      };
      linkParams = makeLinkParamsResolver(utmSettings, ctx, { utmOverrides, utmDisabled });
    } catch (e) {
      console.warn('[SendCampaignEmail] link params indisponíveis, seguindo sem UTM no href:', (e as Error)?.message);
    }

    const finalHtml = prepareEmailHtml({
      html: htmlWithProducts,
      mergeData,
      emailSendId,
      baseUrl: trackingBaseUrl,
      contactId: resolvedContactId || undefined,
      orgId: organizationId,
      campaignId: campaignId || undefined,
      // A página de preferências mostra a marca DESTA loja.
      storeId: sendStoreId || undefined,
      linkParams,
    });

    // 5. Send via the org's configured provider (defaults to Resend).
    // Identidade da LOJA do envio: a do fluxo/campanha ou, num fluxo da
    // organização inteira, a do contato — o cliente é de uma loja e o
    // e-mail chega assinado por ela, nunca pela loja irmã.
    const { provider, config } = await getEmailProviderForOrg(organizationId, sendStoreId);
    const effectiveFrom = fromEmail || config.defaultFrom || 'onboarding@resend.dev';
    const effectiveSenderName = senderName || config.defaultSenderName;

    // List-Unsubscribe + List-Unsubscribe-Post headers (RFC 2369 +
    // 8058). Gmail Postmaster Tools demands both for high-volume
    // senders to qualify for the inbox; without them deliverability
    // craters and mail-tester subtracts a full point. Build the same
    // URL the visible footer link uses so one-click and manual
    // unsubscribe both resolve through the same signed-token path.
    const { buildUnsubscribeUrl, buildListUnsubscribeHeaders } = await import('@/lib/email/render');
    // Mesmo host dos demais links de tracking — o List-Unsubscribe do
    // header e o link do rodapé precisam apontar pro mesmo lugar.
    const unsubUrl = buildUnsubscribeUrl(emailSendId, trackingBaseUrl, resolvedContactId || undefined, organizationId, campaignId || undefined, sendStoreId || undefined);
    const listUnsubHeaders = buildListUnsubscribeHeaders(unsubUrl);

    // Plain-text alternative — when caller supplied one (text-based
    // editor flavor), resolve its merge tags WITHOUT html-escaping so
    // the text body doesn't ship `&amp;` to inboxes. Nodemailer / Resend
    // automatically wrap html + text in multipart/alternative.
    let finalText: string | undefined;
    if (templateText && templateText.trim().length > 0) {
      try {
        let textSrc = templateText;
        // Resolve {{ trigger.* }} smart tags (cart/checkout link, first
        // item name/price, etc.) on the plain-text half too — the HTML
        // half already gets them via resolveTriggerSmartTags above, so
        // without this a text-based cart-recovery email ships an HTML
        // body WITH the recovery link and a text body where the link was
        // stripped as an unresolved tag.
        if (eventData) {
          const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
          textSrc = resolveTriggerSmartTags(textSrc, eventData, mergeData.store_url, { mapping: tagMapping });
        }
        const { renderPlainWithMergeData } = await import('@/lib/email/text-render');
        finalText = renderPlainWithMergeData(textSrc, mergeData);
      } catch {
        // Defensive: never let a text-render hiccup block the HTML send.
        finalText = templateText;
      }
    }

    // Always ship a text/plain alternative. Visual-editor templates carry no
    // plain-text version, so without this the email is HTML-only — a major
    // spam signal. Derive it from the fully-rendered HTML as a fallback.
    if (!finalText || !finalText.trim()) {
      try {
        const { htmlToPlainText } = await import('@/lib/email/html-to-text');
        const derived = htmlToPlainText(finalHtml);
        finalText = derived && derived.trim() ? derived : undefined;
      } catch { /* keep undefined; better to send than block */ }
    }

    const result = await provider.send({
      to: contactEmail,
      from: effectiveFrom,
      senderName: effectiveSenderName,
      subject: finalSubject,
      html: finalHtml,
      text: finalText,
      // Store-threaded reply-to: providers/index.ts writes the store's
      // default_reply_to into config.defaultReplyTo — honor it whenever the
      // caller didn't set an explicit replyTo.
      replyTo: replyTo ?? config.defaultReplyTo,
      headers: listUnsubHeaders,
      tags: [
        { name: 'campaign_id', value: campaignId || 'flow' },
        { name: 'email_send_id', value: emailSendId },
        { name: 'provider', value: provider.id },
      ],
    });

    // 6. Update status to 'sent' with resend_id
    // resend_message_id + provider_message_id mirror resend_id so the
    // webhook handler can match either column (production schema has all
    // three from successive migrations).
    await supabaseAdmin
      .from('email_sends')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        resend_id: result?.id || null,
        provider_message_id: result?.id || null,
      })
      .eq('id', emailSendId);

    return { success: true, emailSendId };
  } catch (error: any) {
    console.error('[SendCampaignEmail] Error:', error);

    // Update status to 'failed' if we have an emailSendId
    if (emailSendId) {
      await supabaseAdmin
        .from('email_sends')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error',
        })
        .eq('id', emailSendId);
    }

    // Auto-suppress the contact's email on permanent failures. Without
    // this every subsequent send retries Resend, eats API quota, and
    // racks up the bounce rate. Resend's typical permanent rejections:
    //   "Email is on the suppression list"
    //   "Email address is invalid"
    //   "Domain is not verified"
    //   "Recipient does not exist" / "No such user"
    const permanentPatterns = [
      /suppres/i,
      /invalid/i,
      /does not exist/i,
      /no such user/i,
      /not allowed/i,
      /not a verified/i,
      /unable to deliver/i,
    ];
    const message = String(error?.message || '');
    const isPermanent = permanentPatterns.some((p) => p.test(message));
    if (isPermanent && resolvedContactId) {
      try {
        await supabaseAdmin
          .from('contacts')
          .update({ email_consent: false, status: 'bounced' })
          .eq('id', resolvedContactId);
        console.log('[SendCampaignEmail] flipped email_consent=false for permanent error', {
          contactId: resolvedContactId,
          error: message,
        });
      } catch (flipErr) {
        console.warn('[SendCampaignEmail] failed to flip consent:', flipErr);
      }
    }

    return { success: false, emailSendId, error: error.message || 'Unknown error' };
  }
}
