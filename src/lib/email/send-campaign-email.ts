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
  eventData?: Record<string, any>;
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
  eventData,
}: SendCampaignEmailParams): Promise<{ success: boolean; emailSendId?: string; error?: string }> {
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
      })
      .select('id')
      .single();

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

    // 3. Resolve dynamic product blocks + cart blocks
    let htmlWithProducts = await resolveProductBlocks(templateHtml, organizationId, contactId, eventData);
    // Pass eventData so the cart block can adapt to the active trigger
    // (cart vs checkout vs browse vs order) via trigger_auto feed type.
    htmlWithProducts = await resolveCartBlocks(htmlWithProducts, organizationId, contactId, eventData);
    // Resolve {{ trigger.link }}, {{ trigger.first_item_image }} etc.
    // — smart tags that adapt the right URL/title/image to whichever
    // event fired the email.
    if (eventData) {
      const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
      htmlWithProducts = resolveTriggerSmartTags(htmlWithProducts, eventData);
    }

    // 3. Prepare HTML with merge tags, tracking, unsubscribe
    const finalHtml = prepareEmailHtml({
      html: htmlWithProducts,
      mergeData,
      emailSendId,
      baseUrl,
    });

    // 4. Render subject merge tags
    const { renderMergeTags } = await import('@/lib/email/render');
    const finalSubject = renderMergeTags(subject, mergeData);

    // 5. Send via the org's configured provider (defaults to Resend).
    // The factory caches per-org so we don't hit the DB on every send.
    const { provider, config } = await getEmailProviderForOrg(organizationId);
    const effectiveFrom = fromEmail || config.defaultFrom || 'onboarding@resend.dev';
    const effectiveSenderName = senderName || config.defaultSenderName;

    // List-Unsubscribe + List-Unsubscribe-Post headers (RFC 2369 +
    // 8058). Gmail Postmaster Tools demands both for high-volume
    // senders to qualify for the inbox; without them deliverability
    // craters and mail-tester subtracts a full point. Build the same
    // URL the visible footer link uses so one-click and manual
    // unsubscribe both resolve through the same signed-token path.
    const { buildUnsubscribeUrl, buildListUnsubscribeHeaders } = await import('@/lib/email/render');
    const unsubUrl = buildUnsubscribeUrl(emailSendId, baseUrl, resolvedContactId || undefined, organizationId, campaignId || undefined);
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
          textSrc = resolveTriggerSmartTags(textSrc, eventData);
        }
        const { renderPlainWithMergeData } = await import('@/lib/email/text-render');
        finalText = renderPlainWithMergeData(textSrc, mergeData);
      } catch {
        // Defensive: never let a text-render hiccup block the HTML send.
        finalText = templateText;
      }
    }

    const result = await provider.send({
      to: contactEmail,
      from: effectiveFrom,
      senderName: effectiveSenderName,
      subject: finalSubject,
      html: finalHtml,
      text: finalText,
      replyTo,
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
