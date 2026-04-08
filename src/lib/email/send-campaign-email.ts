// =============================================
// WORDER: Send Campaign Email Pipeline
// /src/lib/email/send-campaign-email.ts
//
// Create email_sends row, prepare HTML, send
// via Resend, update status.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email/resend';
import { prepareEmailHtml, resolveProductBlocks } from '@/lib/email/render';

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
}: SendCampaignEmailParams): Promise<{ success: boolean; emailSendId?: string; error?: string }> {
  let emailSendId = '' as string;

  try {
    // 1. Create email_sends row with status 'pending'
    const { data: emailSend, error: insertError } = await supabaseAdmin
      .from('email_sends')
      .insert({
        campaign_id: campaignId,
        contact_id: contactId,
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

    // 2. Resolve dynamic product blocks
    const htmlWithProducts = await resolveProductBlocks(templateHtml, organizationId, contactId);

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
