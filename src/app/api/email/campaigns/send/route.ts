import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendCampaignEmail } from '@/lib/email/send-campaign-email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { campaignId } = await req.json()
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

    // Get campaign with template
    const { data: campaign } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.template_id || !campaign.email_templates) {
      return NextResponse.json({ error: 'No template linked' }, { status: 400 })
    }

    // Get org info
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name, domain')
      .eq('id', auth.user.organization_id)
      .single()

    // Resolve contacts (subscribed only)
    let contactsQuery = supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone, company')
      .eq('organization_id', auth.user.organization_id)
      .eq('is_subscribed_email', true)
      .not('email', 'is', null)

    // If segment_id, resolve segment contacts
    if (campaign.segment_id) {
      const { data: segment } = await supabaseAdmin
        .from('segments')
        .select('conditions')
        .eq('id', campaign.segment_id)
        .single()
      // For now, use all subscribed contacts (segment filtering would need resolver)
    }

    const { data: contacts } = await contactsQuery.limit(1000)

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts to send to' }, { status: 400 })
    }

    // Update campaign status
    await supabaseAdmin
      .from('email_campaigns')
      .update({
        status: 'sending',
        sent_at: new Date().toISOString(),
        total_recipients: contacts.length,
      })
      .eq('id', campaignId)

    // Send to each contact (in batches to avoid rate limits)
    let sent = 0, failed = 0
    for (const contact of contacts) {
      if (!contact.email) continue

      const result = await sendCampaignEmail({
        campaignId,
        contactId: contact.id,
        contactEmail: contact.email,
        contactData: contact,
        orgData: org || { id: auth.user.organization_id },
        templateHtml: campaign.email_templates.html || '',
        subject: campaign.subject,
        senderName: campaign.sender_name,
        senderEmail: campaign.sender_email,
        replyTo: campaign.reply_to,
      })

      if (result.success) sent++
      else failed++

      // Rate limit: ~10 emails per second
      if ((sent + failed) % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Update campaign with final stats
    await supabaseAdmin
      .from('email_campaigns')
      .update({
        status: 'sent',
        total_sent: sent,
        total_failed: failed,
      })
      .eq('id', campaignId)

    return NextResponse.json({ success: true, sent, failed, total: contacts.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
