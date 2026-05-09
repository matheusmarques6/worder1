// =============================================
// WORDER: Send Campaign Email Pipeline
// /src/lib/email/send-campaign-email.ts
//
// Create email_sends row, prepare HTML, send
// via Resend, update status.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email/resend';
import { prepareEmailHtml, resolveProductBlocks, resolveCartBlocks } from '@/lib/email/render';

export interface SendCampaignEmailParams {
  campaignId: string;
  contactId: string;
  contactEmail: string;
  mergeData: Record<string, string>;
  templateHtml: string;
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
  subject,
  fromEmail,
  senderName,
  replyTo,
  baseUrl,
  organizationId,
  eventData,
}: SendCampaignEmailParams): Promise<{ success: boolean; emailSendId?: string; error?: string }> {
  let emailSendId = '' as string;

  try {
    const isUuid = (v: any) =>
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    // 0. Ensure we have a real contact row to attach the send to.
    // email_sends.contact_id is NOT NULL on the production schema, so a
    // brand-new abandoned-cart lead (no Worder contact yet) would fail
    // the INSERT below. Upsert by (org, email) so the FK is satisfied
    // and the same contact is reused across future sends.
    let resolvedContactId: string | null = isUuid(contactId) ? contactId : null;
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

    // 1. Create email_sends row with status 'pending'
    // campaign_id is UUID — drop any non-UUID surrogate (flow runs pass null)
    const { data: emailSend, error: insertError } = await supabaseAdmin
      .from('email_sends')
      .insert({
        campaign_id: isUuid(campaignId) ? campaignId : null,
        contact_id: resolvedContactId,
        email: contactEmail,
        status: 'pending',
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

    // 5. Send via Resend
    const result = await sendEmail({
      to: contactEmail,
      from: fromEmail,
      senderName,
      subject: finalSubject,
      html: finalHtml,
      replyTo,
      tags: [
        { name: 'campaign_id', value: campaignId },
        { name: 'email_send_id', value: emailSendId },
      ],
    });

    // 6. Update status to 'sent' with resend_id
    await supabaseAdmin
      .from('email_sends')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        resend_id: result?.id || null,
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

    return { success: false, emailSendId, error: error.message || 'Unknown error' };
  }
}
