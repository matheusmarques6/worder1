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

    // ── Pre-flight quality check (spam, merge tags, unsubscribe, domain) ──
    // Skip apenas quando o caller passar X-Skip-Preflight (ex.: cron de A/B winner
    // que já validou na primeira rodada).
    const skipPreflight = request.headers.get('x-skip-preflight') === 'true'
    if (!skipPreflight) {
      const { runPreflight, hasBlockingErrors } = await import('@/lib/email/preflight')
      const fromEmail = (campaign.from_email || '').trim()
      let domainVerified = true
      if (fromEmail && fromEmail.includes('@')) {
        const domainPart = fromEmail.split('@')[1].toLowerCase()
        const { data: dom } = await supabaseAdmin
          .from('email_domains')
          .select('verification_status')
          .eq('organization_id', organizationId)
          .eq('domain', domainPart)
          .maybeSingle()
        if (dom) domainVerified = dom.verification_status === 'verified'
      }
      const issues = runPreflight({
        subject: campaign.subject || template.subject,
        fromEmail,
        fromName: campaign.from_name,
        html: template.html_content,
        text: template.text_content,
        domainVerified,
      })
      if (hasBlockingErrors(issues)) {
        return NextResponse.json({
          error: 'Preflight check failed',
          issues: issues.filter(i => i.severity === 'error'),
          warnings: issues.filter(i => i.severity === 'warning'),
        }, { status: 422 })
      }
      if (issues.length > 0) {
        console.log(`[SendCampaign] ${campaign_id} preflight warnings:`, issues.map(i => i.code).join(','))
      }
    }

    // Update campaign status to 'sending'
    await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaign_id);

    // Resolve contacts
    const contactFields = 'id, email, first_name, last_name, phone, last_email_sent_at, engagement_score, best_send_hour'
    let contacts: any[] = []
    let contactsError: any = null

    if (campaign.segment_id) {
      const { resolveSegment } = await import('@/lib/segments/resolver')
      const ids = await resolveSegment(supabaseAdmin, campaign.segment_id, organizationId)
      if (ids.length > 0) {
        let q: any = supabaseAdmin
          .from('contacts')
          .select(contactFields)
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
        .select(contactFields)
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

    // ── Smart Sending: skip contacts who received email recently ──
    const smartSendingEnabled = campaign.smart_sending_enabled !== false
    const smartSendingHours = campaign.smart_sending_hours || 16
    let smartSendingSkipped = 0

    if (smartSendingEnabled) {
      const cutoff = new Date(Date.now() - smartSendingHours * 3600000).toISOString()
      contacts = contacts.filter((c: any) => {
        if (c.last_email_sent_at && c.last_email_sent_at > cutoff) {
          smartSendingSkipped++
          return false
        }
        return true
      })
    }

    // ── Engagement filter: skip unengaged contacts ──
    let engagementSkipped = 0
    if (campaign.skip_unengaged) {
      const days = campaign.skip_unengaged_days || 120
      const { data: unengagedIds } = await supabaseAdmin
        .from('email_sends')
        .select('contact_id')
        .eq('organization_id', organizationId)
        .is('opened_at', null)
        .lt('sent_at', new Date(Date.now() - days * 86400000).toISOString())

      if (unengagedIds && unengagedIds.length > 0) {
        const hasRecentOpen = new Set<string>()
        const { data: recentOpens } = await supabaseAdmin
          .from('email_sends')
          .select('contact_id')
          .eq('organization_id', organizationId)
          .not('opened_at', 'is', null)
          .gte('sent_at', new Date(Date.now() - days * 86400000).toISOString())

        if (recentOpens) {
          for (const r of recentOpens) hasRecentOpen.add(r.contact_id)
        }

        const neverEngaged = new Set(
          unengagedIds
            .map((u: any) => u.contact_id)
            .filter((id: string) => !hasRecentOpen.has(id))
        )

        contacts = contacts.filter((c: any) => {
          if (neverEngaged.has(c.id)) {
            engagementSkipped++
            return false
          }
          return true
        })
      }
    }

    if (smartSendingSkipped > 0 || engagementSkipped > 0) {
      console.log(`[SendCampaign] Filtered: ${smartSendingSkipped} smart-sending, ${engagementSkipped} unengaged`)
    }

    if (contacts.length === 0) {
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'sent', total_sent: 0 })
        .eq('id', campaign_id);
      return NextResponse.json({
        message: 'All contacts filtered (smart sending / engagement)',
        smartSendingSkipped,
        engagementSkipped,
        total: 0,
      });
    }

    // ── Domain warm-up: cap daily volume for warming domains ──
    let warmupCapped = 0
    try {
      const { getWarmupStatus } = await import('@/lib/email/warmup')
      const fromEmail = campaign.from_email || ''
      if (fromEmail) {
        const warmup = await getWarmupStatus(organizationId, fromEmail)
        if (warmup.isWarmingUp && warmup.remaining >= 0 && warmup.remaining < contacts.length) {
          // Sort by engagement_score DESC — send to most engaged first (best for warm-up)
          contacts.sort((a: any, b: any) => (b.engagement_score || 50) - (a.engagement_score || 50))
          warmupCapped = contacts.length - warmup.remaining
          contacts = contacts.slice(0, warmup.remaining)
          console.log(`[SendCampaign] Warm-up cap: sending ${contacts.length}, deferred ${warmupCapped} (day ${warmup.warmupDay}, limit ${warmup.dailyLimit})`)
        }
      }
    } catch (e: any) {
      console.warn('[SendCampaign] Warm-up check failed (proceeding):', e?.message)
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

    // ── Send Time Optimization: bucket by best_send_hour ──
    // When enabled, each contact is scheduled at their personal best hour (UTC).
    // Klaviyo-style: learns from open history, defaults to 10 UTC when unknown.
    const sendTimeOptimization = Boolean(campaign.send_time_optimization)
    const DEFAULT_HOUR = 10

    type HourBucket = { hour: number; contacts: ContactWithVariant[] }
    const hourBuckets: HourBucket[] = []

    if (sendTimeOptimization) {
      const byHour = new Map<number, ContactWithVariant[]>()
      for (const c of taggedContacts) {
        const h = Number.isInteger(c.best_send_hour) ? c.best_send_hour : DEFAULT_HOUR
        const hour = Math.max(0, Math.min(23, h))
        if (!byHour.has(hour)) byHour.set(hour, [])
        byHour.get(hour)!.push(c)
      }
      for (const [hour, list] of byHour) hourBuckets.push({ hour, contacts: list })
    } else {
      hourBuckets.push({ hour: -1, contacts: taggedContacts })
    }

    // Build all batches with their scheduled delay
    type ScheduledBatch = { contacts: ContactWithVariant[]; delayMs: number }
    const scheduledBatches: ScheduledBatch[] = []

    const now = Date.now()
    for (const bucket of hourBuckets) {
      // Base delay until this hour's next UTC occurrence (0 if bucket.hour === -1)
      let bucketDelayMs = 0
      if (bucket.hour >= 0) {
        const nowDate = new Date(now)
        const target = new Date(Date.UTC(
          nowDate.getUTCFullYear(),
          nowDate.getUTCMonth(),
          nowDate.getUTCDate(),
          bucket.hour,
          0, 0, 0
        ))
        if (target.getTime() <= now) target.setUTCDate(target.getUTCDate() + 1)
        bucketDelayMs = target.getTime() - now
      }

      // Split bucket into batches of BATCH_SIZE with intra-bucket throttle staircase
      for (let i = 0; i < bucket.contacts.length; i += BATCH_SIZE) {
        const batch = bucket.contacts.slice(i, i + BATCH_SIZE)
        const intraThrottle = Math.floor((i / BATCH_SIZE) / 5) * 1000
        scheduledBatches.push({ contacts: batch, delayMs: bucketDelayMs + intraThrottle })
      }
    }

    const batches: ContactWithVariant[][] = scheduledBatches.map(sb => sb.contacts)

    // Enfileira todos os batches (Upstash Redis durable queue).
    // Throttle: 5 batches por segundo (respeita limite 100 emails/s Resend com batch=50 = 250emails/s máx).
    const useQueue = isQueueAvailable();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    if (useQueue) {
      for (let i = 0; i < scheduledBatches.length; i++) {
        const { contacts: batch, delayMs } = scheduledBatches[i]
        await enqueue(
          QUEUE_NAME,
          {
            campaign_id,
            contact_ids: batch.map((c: any) => c.id),
            contact_variants: abEnabled
              ? batch.map((c: any) => ({ id: c.id, variant: c.ab_variant || 'a' }))
              : undefined,
            batch_number: i + 1,
            total_batches: scheduledBatches.length,
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
        `[SendCampaign] Campaign ${campaign_id} enqueued: ${contacts.length} contacts in ${scheduledBatches.length} batches${sendTimeOptimization ? ` across ${hourBuckets.length} send-time buckets` : ''} (durable queue)`
      );
    } else {
      // Fallback sem Redis: dispara em paralelo com pequeno delay entre batches
      // Nota: setTimeout em serverless não sobrevive ao request, então send-time optimization
      // pode degradar sem Redis — warn se o delay for > 60s.
      console.warn('[SendCampaign] Redis not configured, using fire-and-forget fallback');
      for (let i = 0; i < scheduledBatches.length; i++) {
        const { contacts: batch, delayMs } = scheduledBatches[i]
        if (delayMs > 60_000) {
          console.warn(`[SendCampaign] Batch ${i + 1} delayMs=${delayMs} exceeds serverless timeout; send-time optimization requires Redis`)
        }
        setTimeout(() => {
          fetch(`${baseUrl}/api/email/campaigns/send-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal': 'true',
            },
            body: JSON.stringify({
              campaign_id,
              contact_ids: batch.map((c: any) => c.id),
              batch_number: i + 1,
              total_batches: scheduledBatches.length,
              organizationId: organizationId,
            }),
          }).catch((err) =>
            console.error(`[SendCampaign] Batch ${i + 1} failed to queue:`, err)
          );
        }, Math.min(delayMs, 60_000));
      }
    }

    return NextResponse.json({
      queued: true,
      totalContacts: contacts.length,
      batches: scheduledBatches.length,
      sendTimeBuckets: sendTimeOptimization ? hourBuckets.length : undefined,
      smartSendingSkipped,
      engagementSkipped,
      warmupCapped,
      durable: useQueue,
    });
  } catch (error) {
    console.error('[SendCampaign] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
