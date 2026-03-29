// =============================================
// WORDER: Send Campaign API
// /src/app/api/email/campaigns/send/route.ts
//
// POST: resolve contacts, loop send, update stats.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendCampaignEmail } from '@/lib/email/send-campaign-email';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { campaign_id } = await request.json();

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }

    // Get campaign with template
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaign_id)
      .eq('organization_id', user.organization_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return NextResponse.json(
        { error: `Campaign is already ${campaign.status}` },
        { status: 400 }
      );
    }

    const template = campaign.email_templates;
    if (!template) {
      return NextResponse.json({ error: 'Campaign template not found' }, { status: 404 });
    }

    // Update campaign status to 'sending'
    await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaign_id);

    // Resolve contacts
    let contactsQuery: any = supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone')
      .eq('organization_id', user.organization_id)
      .eq('is_subscribed_email', true)
      .not('email', 'is', null);

    // Filter by segment if specified
    if (campaign.segment_id) {
      const { data: segment } = await supabaseAdmin
        .from('segments')
        .select('conditions')
        .eq('id', campaign.segment_id)
        .single();

      if (segment?.conditions) {
        // Apply basic segment conditions
        for (const condition of segment.conditions) {
          const { field, operator, value } = condition;
          switch (operator) {
            case 'eq':
              contactsQuery = contactsQuery.eq(field, value);
              break;
            case 'neq':
              contactsQuery = contactsQuery.neq(field, value);
              break;
            case 'contains':
              contactsQuery = contactsQuery.ilike(field, `%${value}%`);
              break;
            case 'gt':
              contactsQuery = contactsQuery.gt(field, value);
              break;
            case 'lt':
              contactsQuery = contactsQuery.lt(field, value);
              break;
          }
        }
      }
    }

    // Filter by store if specified
    if (campaign.store_id) {
      contactsQuery = contactsQuery.eq('store_id', campaign.store_id);
    }

    const { data: contacts, error: contactsError } = await contactsQuery;

    if (contactsError) {
      console.error('[SendCampaign] Error fetching contacts:', contactsError);
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'failed' })
        .eq('id', campaign_id);
      return NextResponse.json({ error: 'Failed to resolve contacts' }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'sent', total_sent: 0 })
        .eq('id', campaign_id);
      return NextResponse.json({ message: 'No contacts to send to', total: 0 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Get store info for merge tags
    let storeName = '';
    let storeUrl = '';
    let storeEmail = '';
    let storePhone = '';
    if (campaign.store_id) {
      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('name, domain, email, phone')
        .eq('id', campaign.store_id)
        .single();
      if (store) {
        storeName = store.name || '';
        storeUrl = store.domain ? `https://${store.domain}` : '';
        storeEmail = store.email || '';
        storePhone = store.phone || '';
      }
    }

    // Send to each contact
    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      const mergeData: Record<string, string> = {
        'contact.first_name': contact.first_name || '',
        'contact.last_name': contact.last_name || '',
        'contact.email': contact.email || '',
        'contact.phone': contact.phone || '',
        'store.name': storeName,
        'store.url': storeUrl,
        'store.email': storeEmail,
        'store.phone': storePhone,
      };

      const result = await sendCampaignEmail({
        campaignId: campaign_id,
        contactId: contact.id,
        contactEmail: contact.email,
        mergeData,
        templateHtml: template.html,
        subject: campaign.subject,
        fromEmail: campaign.from_email,
        senderName: campaign.sender_name,
        replyTo: campaign.reply_to,
        baseUrl,
        organizationId: user.organization_id,
      });

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Update campaign with final stats
    await supabaseAdmin
      .from('email_campaigns')
      .update({
        status: 'sent',
        total_sent: successCount,
        total_failed: failCount,
        total_recipients: contacts.length,
      })
      .eq('id', campaign_id);

    return NextResponse.json({
      success: true,
      total: contacts.length,
      sent: successCount,
      failed: failCount,
    });
  } catch (error) {
    console.error('[SendCampaign] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
