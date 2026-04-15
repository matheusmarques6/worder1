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
    // Suporta chamada interna (cron): header X-Internal + Bearer CRON_SECRET + X-Org-Id
    const internalHeader = request.headers.get('x-internal');
    const authHeader = request.headers.get('authorization');
    const orgHeader = request.headers.get('x-org-id');
    const isInternal =
      internalHeader === 'true' &&
      process.env.CRON_SECRET &&
      authHeader === `Bearer ${process.env.CRON_SECRET}` &&
      orgHeader;

    let organizationId: string;
    if (isInternal) {
      organizationId = String(orgHeader);
    } else {
      const auth = await getAuthClient();
      if (!auth) return authError();
      organizationId = auth.user.organization_id;
    }

    const { campaign_id } = await request.json();

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }

    // Get campaign with template
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaign_id)
      .eq('organization_id', organizationId)
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
    // Se segment_id definido, usa resolver avançado (AND/OR, behavioral, RFM)
    let contacts: any[] = []
    let contactsError: any = null

    if (campaign.segment_id) {
      const { resolveSegment } = await import('@/lib/segments/resolver')
      const ids = await resolveSegment(supabaseAdmin, campaign.segment_id, organizationId)
      if (ids.length > 0) {
        let q: any = supabaseAdmin
          .from('contacts')
          .select('id, email, first_name, last_name, phone')
          .in('id', ids)
          .eq('is_subscribed_email', true)
          .not('email', 'is', null)
        if (campaign.store_id) q = q.eq('store_id', campaign.store_id)
        const { data, error } = await q
        contacts = data || []
        contactsError = error
      }
    } else {
      let q: any = supabaseAdmin
        .from('contacts')
        .select('id, email, first_name, last_name, phone')
        .eq('organization_id', organizationId)
        .eq('is_subscribed_email', true)
        .not('email', 'is', null)
      if (campaign.store_id) q = q.eq('store_id', campaign.store_id)
      const { data, error } = await q
      contacts = data || []
      contactsError = error
    }

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

    // Split contacts into batches, marcando A/B variant quando habilitado
    type ContactWithVariant = any & { ab_variant?: 'a' | 'b' }

    const abEnabled = Boolean(campaign.ab_test_enabled && campaign.ab_variant_b)
    let taggedContacts: ContactWithVariant[] = contacts
    if (abEnabled) {
      const percentA = Math.max(0, Math.min(100, Number(campaign.ab_test_percent ?? 50)))
      taggedContacts = contacts.map((c: any) => {
        // hash determinístico por contactId
        const seed = String(c.id || '')
        let h = 2166136261
        for (let i = 0; i < seed.length; i++) {
          h ^= seed.charCodeAt(i)
          h = Math.imul(h, 16777619)
        }
        const bucket = Math.abs(h) % 100
        return { ...c, ab_variant: bucket < percentA ? 'a' : 'b' }
      })
    }

    const batches: ContactWithVariant[][] = []
    for (let i = 0; i < taggedContacts.length; i += BATCH_SIZE) {
      batches.push(taggedContacts.slice(i, i + BATCH_SIZE))
    }

    // Enfileira todos os batches (Upstash Redis durable queue).
    // Throttle: 5 batches por segundo (respeita limite 100 emails/s Resend com batch=50 = 250emails/s máx).
    const useQueue = isQueueAvailable();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    if (useQueue) {
      for (let i = 0; i < batches.length; i++) {
        const delayMs = Math.floor(i / 5) * 1000; // staircase throttle: 5 batches por segundo
        const batch = batches[i]
        await enqueue(
          QUEUE_NAME,
          {
            campaign_id,
            contact_ids: batch.map((c: any) => c.id),
            contact_variants: abEnabled
              ? batch.map((c: any) => ({ id: c.id, variant: c.ab_variant || 'a' }))
              : undefined,
            batch_number: i + 1,
            total_batches: batches.length,
            organizationId: organizationId,
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
              organizationId: organizationId,
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
