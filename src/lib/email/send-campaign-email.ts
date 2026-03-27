import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from './resend'
import { prepareEmailHtml } from './render'

interface SendCampaignEmailParams {
  campaignId: string
  contactId: string
  contactEmail: string
  contactData: Record<string, any>
  orgData: { id: string; name?: string; domain?: string }
  templateHtml: string
  subject: string
  senderName: string
  senderEmail: string
  replyTo?: string
}

export async function sendCampaignEmail(params: SendCampaignEmailParams) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'

  // 1. Create email_send record
  const { data: emailSend, error: insertError } = await supabaseAdmin
    .from('email_sends')
    .insert({
      organization_id: params.orgData.id,
      campaign_id: params.campaignId,
      contact_id: params.contactId,
      to_email: params.contactEmail,
      subject: params.subject,
      status: 'sending',
    })
    .select('id')
    .single()

  if (insertError || !emailSend) {
    return { success: false, error: insertError?.message || 'Failed to create email_send' }
  }

  // 2. Prepare HTML with tracking
  const html = prepareEmailHtml(
    params.templateHtml,
    params.contactData,
    params.orgData,
    emailSend.id,
    baseUrl
  )

  // 3. Send via Resend
  const result = await sendEmail({
    to: params.contactEmail,
    from: params.senderEmail,
    senderName: params.senderName,
    subject: params.subject,
    html,
    replyTo: params.replyTo,
    tags: [
      { name: 'campaign_id', value: params.campaignId },
      { name: 'org_id', value: params.orgData.id },
    ],
  })

  // 4. Update status
  if (result.success) {
    await supabaseAdmin
      .from('email_sends')
      .update({
        status: 'sent',
        resend_id: result.id,
        sent_at: new Date().toISOString(),
      })
      .eq('id', emailSend.id)
  } else {
    await supabaseAdmin
      .from('email_sends')
      .update({
        status: 'failed',
        error_message: result.error,
      })
      .eq('id', emailSend.id)
  }

  return { success: result.success, emailSendId: emailSend.id, error: result.error }
}
