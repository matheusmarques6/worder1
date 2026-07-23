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
import { sendBatchEmails } from '@/lib/email/resend';
import { isEmailBlocked } from '@/lib/email/consent';
import {
  prepareEmailHtml,
  resolveProductBlocks,
  resolveCartBlocks,
  resolveSavedBlocks,
  renderMergeTags,
} from '@/lib/email/render';
import { renderDocumentToHtml } from '@/lib/email/render-html';

export const maxDuration = 300; // 5 minutes for batch processing

// Resend's batch endpoint accepts up to 100 per call. We stay under
// that (50) to keep individual batch latency low and leave headroom
// when a single batch happens to fan-out to the webhook in parallel.
const RESEND_BATCH_SIZE = 50;
const THROTTLE_MS = 1000;

// ── ISP Rate Limits (msgs per batch cycle) ──
// Conservative limits per ISP to protect sender reputation.
// Gmail/Yahoo enforce stricter limits for new domains.
const ISP_CONFIG: Record<string, { batchSize: number; throttleMs: number }> = {
  gmail:   { batchSize: 40, throttleMs: 1200 },
  yahoo:   { batchSize: 25, throttleMs: 1500 },
  outlook: { batchSize: 20, throttleMs: 2000 },
  hotmail: { batchSize: 20, throttleMs: 2000 },
  aol:     { batchSize: 25, throttleMs: 1500 },
  uol:     { batchSize: 30, throttleMs: 1200 },
  default: { batchSize: 50, throttleMs: 1000 },
};

function detectISP(email: string): string {
  const domain = (email.split('@')[1] || '').toLowerCase()
  if (domain.includes('gmail') || domain.includes('googlemail')) return 'gmail'
  if (domain.includes('yahoo') || domain.includes('ymail')) return 'yahoo'
  if (domain.includes('outlook') || domain.includes('live.com')) return 'outlook'
  if (domain.includes('hotmail') || domain.includes('msn.com')) return 'hotmail'
  if (domain.includes('aol')) return 'aol'
  if (domain.includes('uol') || domain.includes('bol.com.br')) return 'uol'
  return 'default'
}

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
      contact_variants, // [{id, variant: 'a'|'b'}] - só quando A/B ativo
      batch_number,
      total_batches,
      organizationId,
    } = await req.json();

    if (!campaign_id || !contact_ids || !batch_number || !total_batches || !organizationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Mapeia contact_id → variant ('a'|'b')
    const variantMap = new Map<string, 'a' | 'b'>()
    if (Array.isArray(contact_variants)) {
      for (const cv of contact_variants) {
        if (cv?.id) variantMap.set(String(cv.id), (cv.variant === 'b' ? 'b' : 'a'))
      }
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

    // Resolve universal/saved blocks — re-render HTML if design_json has linked blocks
    if (template.design_json) {
      try {
        const hasLinkedBlocks = JSON.stringify(template.design_json).includes('_savedBlockId')
        if (hasLinkedBlocks) {
          const resolvedDoc = await resolveSavedBlocks(template.design_json, organizationId)
          template.html = renderDocumentToHtml(resolvedDoc)
        }
      } catch (e) { console.error('[SendBatch] Failed to resolve saved blocks:', e) }
    }

    // For text-based templates, derive the plain-text alternative once
    // from the canonical Tiptap JSON. Per-recipient merge tag rendering
    // happens later (the same place subject/html are personalized).
    let templatePlainSource = ''
    if ((template as any).editor_type === 'text' && template.design_json) {
      try {
        const { renderTextEmailToPlain } = await import('@/lib/email/text-render')
        const docJson = (template.design_json as any)?.doc || template.design_json
        templatePlainSource = renderTextEmailToPlain(docJson)
      } catch (e) {
        console.warn('[SendBatch] failed to render plain text alternative:', e)
      }
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

    const { getAppBaseUrl } = await import('@/lib/app-url');
    const baseUrl = getAppBaseUrl();

    // ──────────────────────────────────────────
    // Suppression list
    // ──────────────────────────────────────────
    // Two-layer suppression:
    //   1. Past sends with status='bounced' or 'complained' in the last
    //      90 days — covers cases where the contacts row hasn't been
    //      flipped yet (e.g., the bounce webhook arrived late).
    //   2. Contacts where email_consent=false or status is one of the
    //      hard-stop states. The Resend bounce/complaint webhook + the
    //      action_email guard both write to these columns, so this is
    //      the durable signal.
    const { data: suppressed } = await supabaseAdmin
      .from('email_sends')
      .select('email')
      .eq('organization_id', organizationId)
      .or('status.eq.bounced,status.eq.complained')
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());

    const suppressedEmails = new Set(
      (suppressed || [])
        .map((s: any) => (s.email || '').toLowerCase())
        .filter(Boolean)
    );

    const eligibleContacts = contacts.filter((c: any) => {
      if (!c.email) return false;
      if (suppressedEmails.has(c.email.toLowerCase())) return false;
      // Shared guard — same rule the automation email node uses. Blocks
      // boolean false AND the string states (pending/denied/...) so a
      // double-opt-in 'pending' contact on a TEXT schema isn't blasted.
      if (isEmailBlocked(c.email_consent, c.status)) return false;
      return true;
    });
    const skipped = contacts.length - eligibleContacts.length;
    if (skipped > 0) {
      console.log(`[SendBatch] Suppressed ${skipped} contact(s) (bounced/complained/opt-out)`);
    }

    // ──────────────────────────────────────────
    // Render per contact + batch via Resend API
    // ISP-aware: group by ISP, apply per-ISP throttle
    // ──────────────────────────────────────────
    let sent = 0;
    let failed = 0;

    // Group contacts by ISP for throttling
    const ispGroups = new Map<string, any[]>();
    for (const c of eligibleContacts) {
      const isp = detectISP(c.email || '');
      if (!ispGroups.has(isp)) ispGroups.set(isp, []);
      ispGroups.get(isp)!.push(c);
    }

    // Interleave ISP groups into chunks with per-ISP batch sizes
    // This prevents hammering a single ISP
    const allChunks: { contacts: any[]; isp: string; throttleMs: number }[] = [];
    for (const [isp, ispContacts] of ispGroups) {
      const config = ISP_CONFIG[isp] || ISP_CONFIG.default;
      for (let i = 0; i < ispContacts.length; i += config.batchSize) {
        allChunks.push({
          contacts: ispContacts.slice(i, i + config.batchSize),
          isp,
          throttleMs: config.throttleMs,
        });
      }
    }

    // Fallback for mixed ISP (original behavior)
    const chunks = allChunks.length > 0
      ? allChunks
      : [{ contacts: eligibleContacts, isp: 'default', throttleMs: THROTTLE_MS }];

    // Resolve the From address ONCE for the whole batch. It only depends on
    // the campaign + organization (both constant per request), so computing
    // it per-contact meant getOrgSender() hit the organizations table N times
    // for a single batch. Hoisted out to a single lookup.
    let batchFromAddress = campaign.from_email
      ? (campaign.sender_name ? `${campaign.sender_name} <${campaign.from_email}>` : campaign.from_email)
      : null;
    if (!batchFromAddress && campaign.store_id) {
      // Store-aware sender: a multi-store org must send each store's
      // campaigns under THAT store's identity, not the org default.
      // getEmailProviderForOrg layers store email_settings (and the
      // store's own name) over the org — same resolution the automation
      // send path uses. Without this a Dr. Groot campaign fell back to
      // getOrgSender() and arrived as the org name ("Based").
      try {
        const { getEmailProviderForOrg } = await import('@/lib/email/providers');
        const { config } = await getEmailProviderForOrg(organizationId, campaign.store_id);
        if (config.defaultFrom) {
          batchFromAddress = config.defaultSenderName
            ? `${config.defaultSenderName} <${config.defaultFrom}>`
            : config.defaultFrom;
        }
      } catch { /* fall through to org-level */ }
    }
    if (!batchFromAddress) {
      try {
        const { getOrgSender } = await import('@/lib/email/sender');
        const sender = await getOrgSender(organizationId);
        batchFromAddress = sender.from;
      } catch {
        batchFromAddress = `Worder <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
      }
    }

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const { contacts: chunk, isp: chunkIsp, throttleMs: chunkThrottleMs } = chunks[cIdx];

      // Per-contact prep: create email_sends row, render HTML with
      // its own emailSendId so trackers point at the right record.
      type Prepped = {
        contactId: string;
        emailSendId: string;
        email: string;
        payload: {
          from: string;
          to: string[];
          subject: string;
          html: string;
          replyTo?: string;
          tags?: { name: string; value: string }[];
        };
      };

      const prepped: Prepped[] = [];

      for (const contact of chunk) {
        // Build merge data with sensible defaults (never empty in visible fields)
        const fn = contact.first_name || ''
        const ln = contact.last_name || ''
        const fullName = [fn, ln].filter(Boolean).join(' ') || 'Cliente'

        const mergeData: Record<string, string> = {
          first_name: fn || 'Cliente',
          last_name: ln,
          full_name: fullName,
          email: contact.email || '',
          phone: contact.phone || '',
          'contact.first_name': fn || 'Cliente',
          'contact.last_name': ln,
          'contact.full_name': fullName,
          'contact.email': contact.email || '',
          'contact.phone': contact.phone || '',
          company: contact.company || '',
          position: contact.position || '',
          city: contact.city || '',
          state: contact.state || '',
          country: contact.country || '',
          birthday: contact.birthday ? new Date(contact.birthday).toLocaleDateString('pt-BR') : '',
          gender: contact.gender || '',
          source: contact.source || '',
          tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : (contact.tags || ''),
          total_orders: String(contact.total_orders || 0),
          total_spent: contact.total_spent ? `R$ ${Number(contact.total_spent).toFixed(2)}` : 'R$ 0,00',
          average_order_value: contact.average_order_value ? `R$ ${Number(contact.average_order_value).toFixed(2)}` : 'R$ 0,00',
          last_order_at: contact.last_order_at ? new Date(contact.last_order_at).toLocaleDateString('pt-BR') : '',
          store_name: storeName,
          store_url: storeUrl,
          store_email: storeEmail,
          store_phone: storePhone,
          'store.name': storeName,
          'store.url': storeUrl,
          'store.email': storeEmail,
          'store.phone': storePhone,
        };
        if (contact.custom_fields && typeof contact.custom_fields === 'object') {
          for (const [k, v] of Object.entries(contact.custom_fields)) {
            mergeData[`custom.${k}`] = String(v ?? '');
            mergeData[`custom_${k}`] = String(v ?? '');
          }
        }

        // Resolve last order data (best-effort)
        try {
          const { data: lastOrder } = await supabaseAdmin
            .from('shopify_orders')
            .select('order_number, total_price, created_at, tracking_url, tracking_number, currency, line_items, financial_status')
            .or(`email.ilike.${contact.email},contact_id.eq.${contact.id}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastOrder) {
            mergeData.order_number = String(lastOrder.order_number || '');
            mergeData['order.number'] = mergeData.order_number;
            mergeData.order_total = lastOrder.total_price
              ? `R$ ${Number(lastOrder.total_price).toFixed(2)}`
              : '';
            mergeData['order.total'] = mergeData.order_total;
            mergeData.order_date = lastOrder.created_at
              ? new Date(lastOrder.created_at).toLocaleDateString('pt-BR')
              : '';
            mergeData['order.date'] = mergeData.order_date;
            mergeData.order_status = lastOrder.financial_status || '';
            mergeData['order.status'] = mergeData.order_status;
            mergeData.tracking_url = lastOrder.tracking_url || '';
            mergeData['order.tracking_url'] = mergeData.tracking_url;
            mergeData.tracking_number = lastOrder.tracking_number || '';
            mergeData['order.tracking_number'] = mergeData.tracking_number;
            mergeData.order_currency = lastOrder.currency || 'BRL';
          }
        } catch {}

        // Resolve checkout_url from latest abandoned cart (best-effort)
        try {
          const { data: cart } = await supabaseAdmin
            .from('shopify_checkouts')
            .select('recovery_url, total_price, currency, line_items')
            .eq('status', 'abandoned')
            .or(`email.eq.${contact.email},contact_id.eq.${contact.id}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (cart) {
            if (cart.recovery_url) {
              mergeData.checkout_url = cart.recovery_url;
              mergeData['checkout.url'] = cart.recovery_url;
              mergeData.cart_url = cart.recovery_url;
            }
            if (cart.total_price) {
              mergeData.cart_total = `R$ ${Number(cart.total_price).toFixed(2)}`;
            }
            const items = Array.isArray(cart.line_items) ? cart.line_items : [];
            if (items.length > 0) {
              mergeData.cart_first_item = items[0]?.title || '';
              mergeData.cart_first_item_price = items[0]?.price
                ? `R$ ${Number(items[0].price).toFixed(2)}`
                : '';
              mergeData.cart_item_count = String(items.length);
            }
          }
        } catch {}

        // System tags
        mergeData.current_date = new Date().toLocaleDateString('pt-BR');
        mergeData.current_year = String(new Date().getFullYear());

        // Create the send row (status queued) to get emailSendId
        // 'queued' matches email_sends_status_check; 'pending' is not allowed.
        // Mirror email → to_email and stamp from_email/subject for the
        // dashboards that read the newer column set on the production
        // schema (legacy `email` column kept in sync).
        const contactIsp = detectISP(contact.email || '')
        const { data: emailSend, error: insertErr } = await supabaseAdmin
          .from('email_sends')
          .insert({
            campaign_id: campaign_id,
            contact_id: contact.id,
            email: contact.email,
            to_email: contact.email,
            from_email: campaign.sender_email || null,
            sender_email: campaign.sender_email || null,
            subject: campaign.subject || null,
            provider: 'resend',
            status: 'queued',
            organization_id: organizationId,
            isp_domain: contactIsp,
          })
          .select('id')
          .single();

        if (insertErr || !emailSend) {
          console.error('[SendBatch] Failed to create email_sends row:', insertErr);
          failed++;
          continue;
        }

        // ---- A/B variant selection ----
        const variant = variantMap.get(String(contact.id)) || 'a'
        const variantB = campaign.ab_variant_b || null
        const useB = variant === 'b' && variantB && campaign.ab_test_enabled

        // Escolhe template (variant B pode ter template_id próprio) ou usa o default
        let htmlSource = template.html
        let subjectSource = campaign.subject || ''
        // Plain-text source defaults to the base template's; variant B with
        // its own text-based template overrides it below so the two MIME
        // halves never disagree for B recipients.
        let plainSource = templatePlainSource
        if (useB) {
          if (variantB.subject) subjectSource = variantB.subject
          if (variantB.template_id && variantB.template_id !== template.id) {
            const { data: altTpl } = await supabaseAdmin
              .from('email_templates')
              .select('html, design_json, editor_type')
              .eq('id', variantB.template_id)
              .eq('organization_id', organizationId)
              .maybeSingle()
            if (altTpl?.html) htmlSource = altTpl.html
            // Re-derive the plain-text alternative from variant B's own
            // design when it's a text-based template; otherwise B gets no
            // text part (matching its visual nature).
            if ((altTpl as any)?.editor_type === 'text' && altTpl?.design_json) {
              try {
                const { renderTextEmailToPlain } = await import('@/lib/email/text-render')
                const altDoc = (altTpl.design_json as any)?.doc || altTpl.design_json
                plainSource = renderTextEmailToPlain(altDoc)
              } catch {
                plainSource = ''
              }
            } else {
              plainSource = ''
            }
          }
        }

        // Persistir variant no email_sends (pro relatório A/B)
        await supabaseAdmin
          .from('email_sends')
          .update({ ab_variant: variant })
          .eq('id', emailSend.id)

        // Resolve dynamic product/cart blocks per contact
        let htmlResolved = await resolveProductBlocks(htmlSource, organizationId, contact.id);
        htmlResolved = await resolveCartBlocks(htmlResolved, organizationId, contact.id);

        // Prep final HTML (merge tags + tracking pixel + click tracking + unsubscribe)
        let finalHtml = prepareEmailHtml({
          html: htmlResolved,
          mergeData,
          emailSendId: emailSend.id,
          baseUrl,
          contactId: contact.id,
          orgId: organizationId,
          campaignId: campaign_id,
        });
        // escape:false — subject is text/plain (no &amp; in the inbox).
        let finalSubject = renderMergeTags(subjectSource, mergeData, { escape: false });

        // Strip any unresolved merge tags so customers never see raw
        // {{template_syntax}} in their inbox. Log a warning so the
        // team can fix the template or missing merge data.
        const unresolvedPattern = /\{\{[^}]+\}\}/g;
        const unresolvedInHtml = finalHtml.match(unresolvedPattern);
        const unresolvedInSubject = finalSubject.match(unresolvedPattern);
        if (unresolvedInHtml?.length || unresolvedInSubject?.length) {
          console.warn(
            `[SendBatch] Unresolved merge tags for contact=${contact.id} campaign=${campaign_id}:`,
            {
              html: unresolvedInHtml || [],
              subject: unresolvedInSubject || [],
            }
          );
          finalHtml = finalHtml.replace(unresolvedPattern, '');
          finalSubject = finalSubject.replace(unresolvedPattern, '');
        }

        // ---- Remetente (resolvido uma vez por batch, ver batchFromAddress) ----
        const fromAddress = batchFromAddress;

        const replyTo = campaign.reply_to || campaign.from_email || undefined;

        // ---- Headers anti-spam (RFC 2369 + RFC 8058) ----
        // List-Unsubscribe: obrigatório pra Gmail/Yahoo desde Fev 2024
        // List-Unsubscribe-Post: one-click unsubscribe (RFC 8058)
        // The URL must be the signed-token endpoint (per recipient)
        // so Gmail's one-click button actually unsubscribes the right
        // contact — the placeholder '?token=unsub' was a no-op that
        // wouldn't have processed any clicks.
        const { buildUnsubscribeUrl, buildListUnsubscribeHeaders } = await import('@/lib/email/render');
        const unsubUrl = buildUnsubscribeUrl(emailSend.id, baseUrl, contact.id, organizationId, campaign_id || undefined);
        const antiSpamHeaders: Record<string, string> = {
          ...buildListUnsubscribeHeaders(unsubUrl),
          'Precedence': 'bulk',
          'X-Mailer': 'Worder/1.0',
        };
        if (campaign_id) {
          antiSpamHeaders['X-Campaign-Id'] = String(campaign_id);
        }

        // Per-recipient plain text — uses the non-HTML-escaping renderer
        // so `&` stays `&` in the inbox preview. Only emitted when the
        // template is text-based; visual campaigns keep the html-only
        // payload they used to ship.
        let finalText: string | undefined
        if (plainSource) {
          try {
            const { renderPlainWithMergeData } = await import('@/lib/email/text-render')
            finalText = renderPlainWithMergeData(plainSource, mergeData)
            // Strip unresolved tags in the text part too — same hygiene
            // the HTML/subject already get above.
            if (finalText) finalText = finalText.replace(/\{\{[^}]+\}\}/g, '')
          } catch (e) {
            console.warn('[SendBatch] plain-text merge failed:', e)
          }
        }
        // Always ship a text/plain alternative — HTML-only email is a major
        // spam signal. Visual campaigns have no plainSource, so derive the
        // text part from the fully-rendered HTML.
        if (!finalText || !finalText.trim()) {
          try {
            const { htmlToPlainText } = await import('@/lib/email/html-to-text')
            const derived = htmlToPlainText(finalHtml)
            finalText = derived && derived.trim() ? derived : undefined
          } catch { /* better to send than block */ }
        }

        prepped.push({
          contactId: contact.id,
          emailSendId: emailSend.id,
          email: contact.email,
          payload: ({
            from: fromAddress,
            to: [contact.email],
            subject: finalSubject,
            html: finalHtml,
            ...(finalText ? { text: finalText } : {}),
            replyTo,
            headers: antiSpamHeaders,
            tags: [
              { name: 'campaign_id', value: String(campaign_id) },
              { name: 'email_send_id', value: String(emailSend.id) },
              ...(campaign.ab_test_enabled ? [{ name: 'ab_variant', value: variant }] : []),
            ],
          }) as any,
        });
      }

      if (prepped.length === 0) {
        continue;
      }

      // Ship the batch to Resend in one HTTP call
      try {
        const result: any = await sendBatchEmails(prepped.map((p) => p.payload));
        const resendIds: string[] = Array.isArray(result?.data)
          ? result.data.map((r: any) => r?.id).filter(Boolean)
          : [];

        // Update each email_sends row with its resend_id + sent status
        const nowIso = new Date().toISOString();
        for (let i = 0; i < prepped.length; i++) {
          const p = prepped[i];
          const resendId = resendIds[i] || null;
          await supabaseAdmin
            .from('email_sends')
            .update({
              status: 'sent',
              sent_at: nowIso,
              resend_id: resendId,
              provider_message_id: resendId,
            })
            .eq('id', p.emailSendId);
          sent++;
        }
      } catch (batchErr: any) {
        console.error('[SendBatch] Batch send failed:', batchErr);
        // Mark everything in this chunk as failed
        const err = batchErr?.message || 'Batch send error';
        for (const p of prepped) {
          await supabaseAdmin
            .from('email_sends')
            .update({ status: 'failed', error_message: err })
            .eq('id', p.emailSendId);
          failed++;
        }
      }

      // Update last_email_sent_at for smart sending (fire-and-forget)
      const sentContactIds = prepped.map((p) => p.contactId)
      if (sentContactIds.length > 0) {
        void Promise.resolve(
          supabaseAdmin
            .from('contacts')
            .update({ last_email_sent_at: new Date().toISOString() })
            .in('id', sentContactIds)
        ).catch(() => {})
      }

      // Per-ISP throttle between chunks (skip after the last one)
      if (cIdx < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, chunkThrottleMs));
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
      // CRITICAL: Do NOT fall back to read-then-write. Under parallel batches,
      // each batch reads the stale campaign.total_sent before other batches have
      // written, causing undercounts (data corruption). The RPC uses atomic
      // SQL increment and is the only safe path.
      console.error(
        '[SendBatch] CRITICAL: increment_campaign_stats RPC failed — stats for this batch are LOST. ' +
        'Ensure the RPC exists in the database. ' +
        `campaign=${campaign_id} batch=${batch_number} sent=${sent} failed=${failed} error=${rpcError.message}`
      );
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
