import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { campaignId } = await request.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

    // Fetch campaign
    const { data: campaign, error: campErr } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return NextResponse.json({ error: 'Campaign already sent or sending' }, { status: 400 });
    }

    // Get org info
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, email_settings')
      .eq('id', orgId)
      .single();

    // Update status to sending
    await supabase
      .from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    // Get contacts (exclude unsubscribed, bounced, complained)
    let contactsQuery = supabase
      .from('contacts')
      .select('id, email, first_name, last_name, name, phone')
      .eq('organization_id', orgId)
      .not('email', 'is', null);

    // If campaign has a list_id, filter by list
    if (campaign.list_id) {
      const { data: listContacts } = await supabase
        .from('contact_lists')
        .select('contact_id')
        .eq('list_id', campaign.list_id);

      if (listContacts && listContacts.length > 0) {
        const contactIds = listContacts.map((lc: any) => lc.contact_id);
        contactsQuery = contactsQuery.in('id', contactIds);
      }
    }

    // If campaign has a segment_id, resolve it
    if (campaign.segment_id) {
      try {
        const { resolveSegment } = await import('@/lib/segments/resolver');
        const segmentContactIds = await resolveSegment(supabase, campaign.segment_id, orgId);
        if (segmentContactIds.length > 0) {
          contactsQuery = contactsQuery.in('id', segmentContactIds);
        }
      } catch {}
    }

    const { data: contacts } = await contactsQuery
      .not('email_consent', 'in', '("unsubscribed","bounced","complained")')
      .limit(10000);

    if (!contacts || contacts.length === 0) {
      await supabase.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), total_recipients: 0, total_sent: 0 }).eq('id', campaignId);
      return NextResponse.json({ success: true, sent_count: 0, message: 'No eligible contacts' });
    }

    // Send emails
    let sentCount = 0;
    let failedCount = 0;

    // Dynamic import to avoid circular deps
    const { sendCampaignEmail } = await import('@/lib/email/send-campaign-email');

    for (const contact of contacts) {
      try {
        const result = await sendCampaignEmail({
          supabaseAdmin: supabase,
          contact,
          template: {
            html: campaign.html_content || '<p>{{first_name}}, confira nossas novidades!</p>',
            subject: campaign.subject || 'Novidades',
          },
          org: { id: orgId, name: org?.name },
          campaign: {
            id: campaignId,
            sender_name: campaign.from_name || org?.name,
            sender_email: campaign.from_email || org?.email_settings?.sender_email,
          },
        });

        if (result.success) sentCount++;
        else failedCount++;
      } catch (e) {
        failedCount++;
        console.error(`[Campaign Send] Failed for ${contact.email}:`, e);
      }

      // Small delay to avoid rate limits
      if (sentCount % 10 === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Update campaign stats
    await supabase.from('email_campaigns').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      total_recipients: contacts.length,
      total_sent: sentCount,
    }).eq('id', campaignId);

    return NextResponse.json({
      success: true,
      sent_count: sentCount,
      failed_count: failedCount,
      total_contacts: contacts.length,
    });
  } catch (e: any) {
    console.error('[Campaign Send] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
