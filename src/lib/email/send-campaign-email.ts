/**
 * Send Campaign Email - Stub
 * Will be implemented by Claude A with Resend integration.
 * This stub logs the attempt and returns success for flow execution.
 */

interface SendCampaignEmailParams {
  supabaseAdmin: any;
  contact: any;
  template: { html: string; subject: string };
  org: { id: string; name?: string };
  flowId?: string;
}

export async function sendCampaignEmail(params: SendCampaignEmailParams) {
  const { contact, template, org, flowId } = params;

  console.log(`[Email Stub] Would send email to ${contact?.email}`, {
    subject: template.subject,
    orgId: org.id,
    flowId,
    htmlLength: template.html?.length || 0,
  });

  // Try to log the send attempt to email_sends table
  try {
    const { supabaseAdmin } = params;
    if (supabaseAdmin) {
      await supabaseAdmin.from('email_sends').insert({
        organization_id: org.id,
        contact_id: contact?.id,
        email: contact?.email,
        subject: template.subject,
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider: 'stub',
        metadata: { flowId, stub: true },
      });
    }
  } catch (e) {
    // Table may not exist yet
  }

  return { success: true, messageId: `stub_${Date.now()}` };
}
