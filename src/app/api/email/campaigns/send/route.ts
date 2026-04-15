// =============================================
// WORDER: Send Campaign API
// /src/app/api/email/campaigns/send/route.ts
//
// POST: resolve contacts, split into batches,
// fire background workers, return immediately.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueue, isQueueAvailable } from '@/lib/queue/durable-queue';

const BATCH_SIZE = 50;
const QUEUE_NAME = 'email-send-batch';

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

    // Update total_recipients upfront
    await supabaseAdmin
      .from('email_campaigns')
      .update({ total_recipients: contacts.length })
      .eq('id', campaign_id);

    // Split contacts into batches
    const batches: typeof contacts[] = [];
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      batches.push(contacts.slice(i, i + BATCH_SIZE));
    }

    // Enfileira todos os batches (Upstash Redis durable queue).
    // Throttle: 5 batches por segundo (respeita limite 100 emails/s Resend com batch=50 = 250emails/s máx).
    const useQueue = isQueueAvailable();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    if (useQueue) {
      for (let i = 0; i < batches.length; i++) {
        const delayMs = Math.floor(i / 5) * 1000; // staircase throttle: 5 batches por segundo
        await enqueue(
          QUEUE_NAME,
          {
            campaign_id,
            contact_ids: batches[i].map((c: any) => c.id),
            batch_number: i + 1,
            total_batches: batches.length,
            organizationId: user.organization_id,
          },
          {
            jobId: `campaign:${campaign_id}:batch:${i + 1}`,
            delayMs,
            maxAttempts: 5,
          }
        );
      }
      console.log(
        `[SendCampaign] Campaign ${campaign_id} enqueued: ${contacts.length} contacts in ${batches.length} batches (durable queue, throttled)`
      );
    } else {
      // Fallback sem Redis: dispara em paralelo com pequeno delay entre batches
      console.warn('[SendCampaign] Redis not configured, using fire-and-forget fallback');
      for (let i = 0; i < batches.length; i++) {
        const delayMs = Math.floor(i / 5) * 1000;
        setTimeout(() => {
          fetch(`${baseUrl}/api/email/campaigns/send-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal': 'true',
            },
            body: JSON.stringify({
              campaign_id,
              contact_ids: batches[i].map((c: any) => c.id),
              batch_number: i + 1,
              total_batches: batches.length,
              organizationId: user.organization_id,
            }),
          }).catch((err) =>
            console.error(`[SendCampaign] Batch ${i + 1} failed to queue:`, err)
          );
        }, delayMs);
      }
    }

    return NextResponse.json({
      queued: true,
      totalContacts: contacts.length,
      batches: batches.length,
      durable: useQueue,
    });
  } catch (error) {
    console.error('[SendCampaign] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
