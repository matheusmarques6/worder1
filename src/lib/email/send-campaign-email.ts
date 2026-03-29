import { sendEmail } from './resend';
import { prepareEmailHtml } from './render';

export async function sendCampaignEmail(params: {
  supabaseAdmin: any;
  contact: any;
  template: { html: string; subject?: string };
  org: { id: string; name?: string };
  campaign?: { id?: string; sender_name?: string; sender_email?: string };
  flowId?: string;
}) {
  const { supabaseAdmin, contact, template, org, campaign, flowId } = params;

  if (!contact?.email) {
    return { error: 'Contact has no email' };
  }

  const subject = template.subject || 'Sem assunto';
  const senderEmail = campaign?.sender_email || process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev';
  const senderName = campaign?.sender_name || org.name || 'Worder';

  // Insert email_send record
  let emailSendId: string;
  try {
    const { data: emailSend, error } = await supabaseAdmin.from('email_sends').insert({
      organization_id: org.id,
      contact_id: contact.id,
      email: contact.email,
      campaign_id: campaign?.id || null,
      flow_id: flowId || null,
      subject,
      from_email: senderEmail,
      status: 'queued',
    }).select('id').single();

    if (error || !emailSend) {
      console.error('[Email] Insert email_send failed:', error);
      return { error: error?.message || 'Insert failed' };
    }
    emailSendId = emailSend.id;
  } catch (e: any) {
    console.error('[Email] Insert error:', e);
    return { error: e.message };
  }

  // Prepare HTML with tracking
  const html = prepareEmailHtml(
    template.html || '<p>Olá {{first_name}}, obrigado!</p>',
    contact,
    org,
    emailSendId
  );

  // Send via Resend
  const result = await sendEmail({
    to: contact.email,
    from: senderEmail,
    senderName,
    subject,
    html,
    replyTo: campaign?.sender_email,
  });

  if (result.id) {
    await supabaseAdmin.from('email_sends').update({
      provider_message_id: result.id,
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider: 'resend',
    }).eq('id', emailSendId);
    return { success: true, emailSendId, messageId: result.id };
  } else {
    await supabaseAdmin.from('email_sends').update({
      status: 'failed',
      error_message: result.error,
      failed_at: new Date().toISOString(),
    }).eq('id', emailSendId);
    return { error: result.error };
  }
}
