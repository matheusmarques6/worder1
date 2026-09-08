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
      // Resolve the ACTUAL send domain + its verification via the shared
      // helper. The previous inline check read a non-existent column
      // (verification_status) and matched org-only, which 422'd EVERY
      // campaign send — verified domain, system domain, store default alike.
      const { resolveSendDomainVerification } = await import('@/lib/email/domain-verification')
      const { fromEmail, domainVerified } = await resolveSendDomainVerification(
        organizationId,
        campaign.store_id,
        campaign.from_email
      )
      // Block sends from unverified domains (unless this is a test send)
      const isTestSend = request.headers.get('x-test-send') === 'true'
      if (!domainVerified && !isTestSend) {
        return NextResponse.json({
          error: 'Domain not verified. Verify your sending domain before sending campaigns.',
          code: 'DOMAIN_NOT_VERIFIED',
        }, { status: 422 })
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

    // Bug fix: Atomic status transition to prevent race conditions.
    // Instead of SELECT then UPDATE, do a single UPDATE with WHERE on the
    // current status. If no rows are returned, another process already claimed it.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaign_id)
      .in('status', ['draft', 'scheduled'])
      .select('id')

    if (claimError) {
      console.error('[SendCampaign] Failed to claim campaign:', claimError);
      return NextResponse.json({ error: 'Failed to update campaign status' }, { status: 500 });
    }

    if (!claimed || claimed.length === 0) {
      // Another process already moved the campaign out of draft/scheduled
      return NextResponse.json(
        { error: 'Campaign was already claimed by another process' },
        { status: 409 }
      );
    }

    // Resolve contacts
    // timezone/country entram para o modo "fuso do destinatário": sem
    // eles todo contato cairia no fuso da loja e o recurso viraria um
    // agendamento fixo com nome bonito.
    const contactFields = 'id, email, first_name, last_name, phone, last_email_sent_at, engagement_score, best_send_hour, timezone, country, created_at, last_active_at, last_email_at, last_order_at, last_seen_at'
    let contacts: any[] = []
    let contactsError: any = null

    if (campaign.segment_id) {
      // Route through the canonical entrypoint (index.ts) so v1 and v2
      // segments both resolve correctly — it detects rule_version and
      // runs the v1→v2 adapter, fixing the date-NaN and unreadable-v2
      // rules bugs in the legacy resolver. Returns { contactIds, ... }.
      const { resolveSegment } = await import('@/lib/segments')
      const { contactIds: ids } = await resolveSegment(supabaseAdmin, campaign.segment_id, organizationId)
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

    // Higiene da lista (Configurações → Entregabilidade): contatos sem
    // engajamento há N dias saem das campanhas — continuam nas automações.
    if (!contactsError && contacts.length) {
      try {
        const { getOrgSendingRules, filterInactiveContacts } = await import('@/lib/email/sending-rules')
        const rules = await getOrgSendingRules(organizationId)
        const { kept, suppressed } = filterInactiveContacts(contacts, rules)
        if (suppressed > 0) {
          console.log(`[SendCampaign] Higiene da lista: ${suppressed} contato(s) inativo(s) há ${rules.suppressInactiveDays} dias fora desta campanha`)
          contacts = kept
        }
      } catch (e) {
        console.warn('[SendCampaign] Higiene da lista indisponível:', (e as any)?.message)
      }
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

    // ── Quando cada contato recebe ──
    // Dois modos, mutuamente exclusivos, na ordem de precedência:
    //
    //  1. timezone_mode = 'recipient' — cada contato recebe no horário
    //     de PAREDE escolhido, lido no fuso dele (o "Send in
    //     recipient's time zone" da Omnisend).
    //  2. send_time_optimization — cada contato recebe na hora em que
    //     costuma abrir e-mail (best_send_hour, aprendido do histórico).
    //
    // Sem nenhum dos dois, todo mundo sai junto, como sempre foi.
    const recipientTimezoneMode = campaign.timezone_mode === 'recipient'
    const sendTimeOptimization = !recipientTimezoneMode && Boolean(campaign.send_time_optimization)

    type ScheduledBatch = { contacts: ContactWithVariant[]; delayMs: number }
    const scheduledBatches: ScheduledBatch[] = []
    const now = Date.now()
    let timezoneBucketCount = 0
    let hourBucketCount = 0

    /** Fatia um grupo em lotes, escalonando dentro do grupo. */
    const pushBatches = (list: ContactWithVariant[], baseDelayMs: number) => {
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE)
        const intraThrottle = Math.floor((i / BATCH_SIZE) / 5) * 1000
        scheduledBatches.push({ contacts: batch, delayMs: baseDelayMs + intraThrottle })
      }
    }

    if (recipientTimezoneMode) {
      const { planRecipientTimezoneSend } = await import('@/lib/scheduling/campaign-plan')

      // O fuso de quem agendou define QUAL horário de parede foi
      // escolhido — é o relógio que o lojista tinha na tela.
      let authorTimezone: string | null = null
      if (campaign.store_id) {
        const { data: loja } = await supabaseAdmin
          .from('shopify_stores').select('timezone').eq('id', campaign.store_id).maybeSingle()
        authorTimezone = (loja as any)?.timezone || null
      }
      if (!authorTimezone) {
        const { data: org } = await supabaseAdmin
          .from('organizations').select('quiet_hours_timezone').eq('id', organizationId).maybeSingle()
        authorTimezone = (org as any)?.quiet_hours_timezone || null
      }

      const buckets = planRecipientTimezoneSend(taggedContacts as any[], {
        // Campanha enviada na hora (sem agendar) usa agora como
        // referência: o horário de parede vira "este mesmo".
        scheduledAt: campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date(now),
        authorTimezone,
        fallbackTimezone: authorTimezone,
        now: new Date(now),
      })
      timezoneBucketCount = buckets.length
      for (const b of buckets) pushBatches(b.contacts as ContactWithVariant[], b.delayMs)

      console.log(
        `[SendCampaign] ${campaign_id} no fuso do destinatário: ${buckets.length} fusos, ` +
        `primeiro em ${Math.round((buckets[0]?.delayMs ?? 0) / 60000)}min, ` +
        `último em ${Math.round((buckets[buckets.length - 1]?.delayMs ?? 0) / 60000)}min`
      )
    } else if (sendTimeOptimization) {
      // best_send_hour é a MODA das aberturas em UTC, então o balde
      // também é UTC — é a mesma unidade, não uma conversão perdida.
      const DEFAULT_HOUR = 10
      const byHour = new Map<number, ContactWithVariant[]>()
      for (const c of taggedContacts) {
        const h = Number.isInteger(c.best_send_hour) ? c.best_send_hour : DEFAULT_HOUR
        const hour = Math.max(0, Math.min(23, h))
        const lista = byHour.get(hour)
        if (lista) lista.push(c)
        else byHour.set(hour, [c])
      }
      hourBucketCount = byHour.size
      for (const [hour, list] of byHour) {
        const nowDate = new Date(now)
        const target = new Date(Date.UTC(
          nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), hour, 0, 0, 0
        ))
        if (target.getTime() <= now) target.setUTCDate(target.getUTCDate() + 1)
        pushBatches(list, target.getTime() - now)
      }
    } else {
      pushBatches(taggedContacts, 0)
    }

    const batches: ContactWithVariant[][] = scheduledBatches.map(sb => sb.contacts)

    // Enfileira todos os batches (Upstash Redis durable queue).
    // Throttle: 5 batches por segundo (respeita limite 100 emails/s Resend com batch=50 = 250emails/s máx).
    const useQueue = isQueueAvailable();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Bug fix: Wrap batch dispatching in try-catch so that if enqueuing fails,
    // the campaign status is reset to 'failed' instead of being stuck in 'sending' forever.
    try {
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
          `[SendCampaign] Campaign ${campaign_id} enqueued: ${contacts.length} contacts in ${scheduledBatches.length} batches` +
          `${recipientTimezoneMode ? ` across ${timezoneBucketCount} timezones` : ''}` +
          `${sendTimeOptimization ? ` across ${hourBucketCount} send-time buckets` : ''} (durable queue)`
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
    } catch (batchError) {
      // All or partial batch dispatch failed — mark campaign as 'failed' to avoid
      // it being stuck in 'sending' forever with no workers processing it.
      console.error(`[SendCampaign] Batch dispatch failed for campaign ${campaign_id}:`, batchError);
      await supabaseAdmin
        .from('email_campaigns')
        .update({
          status: 'failed',
          error_message: `Batch dispatch error: ${batchError instanceof Error ? batchError.message : String(batchError)}`,
        })
        .eq('id', campaign_id);
      return NextResponse.json(
        { error: 'Failed to dispatch email batches', campaign_status: 'failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      queued: true,
      totalContacts: contacts.length,
      batches: scheduledBatches.length,
      sendTimeBuckets: sendTimeOptimization ? hourBucketCount : undefined,
      timezoneBuckets: recipientTimezoneMode ? timezoneBucketCount : undefined,
      smartSendingSkipped,
      engagementSkipped,
      warmupCapped,
      durable: useQueue,
    });
  } catch (error) {
    // Outer catch: if campaign_id is available and status was already set to 'sending',
    // reset it to 'failed' so the campaign doesn't get stuck.
    console.error('[SendCampaign] Error:', error);
    try {
      const body = await request.clone().json().catch(() => ({}));
      const cid = body?.campaign_id;
      if (cid) {
        // Only reset if still in 'sending' — avoids overwriting a 'failed' already set above
        await supabaseAdmin
          .from('email_campaigns')
          .update({
            status: 'failed',
            error_message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          })
          .eq('id', cid)
          .eq('status', 'sending');
      }
    } catch (_) {
      // Best-effort recovery — don't mask the original error
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
