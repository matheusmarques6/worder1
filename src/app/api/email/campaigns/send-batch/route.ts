// =============================================
// WORDER: Send Campaign Batch Worker
// /src/app/api/email/campaigns/send-batch/route.ts
//
// POST: Process a single batch of contacts for
// a campaign. Called internally by the main
// send route to avoid serverless timeouts.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendCampaignEmail } from '@/lib/email/send-campaign-email';

export const maxDuration = 300; // 5 minutes for batch processing

export async function POST(req: NextRequest) {
  try {
    // Verify internal caller
    const internalHeader = req.headers.get('X-Internal');
    if (internalHeader !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      campaign_id,
      contact_ids,
      batch_number,
      total_batches,
      organizationId,
    } = await req.json();

    if (!campaign_id || !contact_ids || !batch_number || !total_batches || !organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get campaign with template
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      console.error('[SendBatch] Campaign not found:', campaign_id, campaignError);
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const template = campaign.email_templates;
    if (!template) {
      console.error('[SendBatch] Template not found for campaign:', campaign_id);
      return NextResponse.json({ error: 'Campaign template not found' }, { status: 404 });
    }

    // Get contacts for this batch
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .in('id', contact_ids);

    if (contactsError || !contacts || contacts.length === 0) {
      console.error('[SendBatch] Error fetching contacts:', contactsError);
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    // Send to each contact in this batch
    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      // Build comprehensive merge data from ALL contact fields
      const mergeData: Record<string, string> = {
        // Core fields
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        // Dotted aliases
        'contact.first_name': contact.first_name || '',
        'contact.last_name': contact.last_name || '',
        'contact.email': contact.email || '',
        'contact.phone': contact.phone || '',
        // Profile fields
        company: contact.company || '',
        position: contact.position || '',
        city: contact.city || '',
        state: contact.state || '',
        country: contact.country || '',
        birthday: contact.birthday ? new Date(contact.birthday).toLocaleDateString('pt-BR') : '',
        gender: contact.gender || '',
        source: contact.source || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : (contact.tags || ''),
        // Metrics
        total_orders: String(contact.total_orders || 0),
        total_spent: contact.total_spent ? `R$ ${Number(contact.total_spent).toFixed(2)}` : 'R$ 0,00',
        average_order_value: contact.average_order_value ? `R$ ${Number(contact.average_order_value).toFixed(2)}` : 'R$ 0,00',
        last_order_at: contact.last_order_at ? new Date(contact.last_order_at).toLocaleDateString('pt-BR') : '',
        // Store
        store_name: storeName,
        store_url: storeUrl,
        store_email: storeEmail,
        store_phone: storePhone,
        'store.name': storeName,
        'store.url': storeUrl,
        'store.email': storeEmail,
        'store.phone': storePhone,
      };
      // Inject custom_fields as custom.* merge tags
      if (contact.custom_fields && typeof contact.custom_fields === 'object') {
        for (const [k, v] of Object.entries(contact.custom_fields)) {
          mergeData[`custom.${k}`] = String(v ?? '')
          mergeData[`custom_${k}`] = String(v ?? '')
        }
      }

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
        organizationId,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[SendBatch] Batch ${batch_number}/${total_batches} for campaign ${campaign_id}: sent=${sent}, failed=${failed}`);

    // Update campaign stats atomically using RPC if available
    const { error: rpcError } = await supabaseAdmin.rpc('increment_campaign_stats', {
      p_campaign_id: campaign_id,
      p_sent: sent,
      p_failed: failed,
    });

    if (rpcError) {
      // Fallback: direct update (less safe under concurrency but functional)
      console.warn('[SendBatch] RPC fallback, using direct update:', rpcError.message);
      await supabaseAdmin
        .from('email_campaigns')
        .update({
          total_sent: (campaign.total_sent || 0) + sent,
          total_failed: (campaign.total_failed || 0) + failed,
        })
        .eq('id', campaign_id);
    }

    // If last batch, mark campaign as 'sent'
    if (batch_number === total_batches) {
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'sent' })
        .eq('id', campaign_id);
      console.log(`[SendBatch] Campaign ${campaign_id} marked as sent (final batch ${batch_number})`);
    }

    return NextResponse.json({
      batch: batch_number,
      total_batches,
      sent,
      failed,
    });
  } catch (error: any) {
    console.error('[SendBatch] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
