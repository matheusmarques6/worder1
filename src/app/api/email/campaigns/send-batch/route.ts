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
const THROTTLE_MS = 1000; // 1s between batches to respect daily + per-second caps

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

    // ──────────────────────────────────────────
    // Suppression list
    // ──────────────────────────────────────────
    // Anyone who bounced or filed a spam complaint in the last 90 days
    // gets skipped. This protects sender reputation — re-sending to
    // bouncers is the #1 way to kill a Resend account.
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

    const eligibleContacts = contacts.filter(
      (c: any) => c.email && !suppressedEmails.has(c.email.toLowerCase())
    );
    const skipped = contacts.length - eligibleContacts.length;
    if (skipped > 0) {
      console.log(`[SendBatch] Suppressed ${skipped} contact(s) (bounced/complained in last 90d)`);
    }

    // ──────────────────────────────────────────
    // Render per contact + batch via Resend API
    // ──────────────────────────────────────────
    let sent = 0;
    let failed = 0;

    // Chunk eligible contacts into batches (max RESEND_BATCH_SIZE each)
    const chunks: any[][] = [];
    for (let i = 0; i < eligibleContacts.length; i += RESEND_BATCH_SIZE) {
      chunks.push(eligibleContacts.slice(i, i + RESEND_BATCH_SIZE));
    }

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];

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
        // Build merge data
        const mergeData: Record<string, string> = {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          'contact.first_name': contact.first_name || '',
          'contact.last_name': contact.last_name || '',
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

        // Resolve checkout_url from latest abandoned cart (best-effort)
        if (!mergeData.checkout_url) {
          try {
            const { data: cart } = await supabaseAdmin
              .from('shopify_checkouts')
              .select('recovery_url')
              .eq('status', 'abandoned')
              .or(`email.eq.${contact.email},contact_id.eq.${contact.id}`)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (cart?.recovery_url) {
              mergeData.checkout_url = cart.recovery_url;
              mergeData['checkout.url'] = cart.recovery_url;
            }
          } catch { /* table may not exist */ }
        }

        // Create the send row (status pending) to get emailSendId
        const { data: emailSend, error: insertErr } = await supabaseAdmin
          .from('email_sends')
          .insert({
            campaign_id: campaign_id,
            contact_id: contact.id,
            email: contact.email,
            status: 'pending',
            organization_id: organizationId,
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
        if (useB) {
          if (variantB.subject) subjectSource = variantB.subject
          if (variantB.template_id && variantB.template_id !== template.id) {
            const { data: altTpl } = await supabaseAdmin
              .from('email_templates')
              .select('html, design_json')
              .eq('id', variantB.template_id)
              .eq('organization_id', organizationId)
              .maybeSingle()
            if (altTpl?.html) htmlSource = altTpl.html
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
        const finalHtml = prepareEmailHtml({
          html: htmlResolved,
          mergeData,
          emailSendId: emailSend.id,
          baseUrl,
          contactId: contact.id,
          orgId: organizationId,
          campaignId: campaign_id,
        });
        const finalSubject = renderMergeTags(subjectSource, mergeData);

        // ---- Resolver remetente (com fallback org sender) ----
        let fromAddress = campaign.from_email
          ? (campaign.sender_name ? `${campaign.sender_name} <${campaign.from_email}>` : campaign.from_email)
          : null;

        if (!fromAddress) {
          try {
            const { getOrgSender } = await import('@/lib/email/sender');
            const sender = await getOrgSender(organizationId);
            fromAddress = sender.from;
          } catch {
            fromAddress = `Worder <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`;
          }
        }

        const replyTo = campaign.reply_to || campaign.from_email || undefined;

        // ---- Headers anti-spam (RFC 2369 + RFC 8058) ----
        // List-Unsubscribe: obrigatório pra Gmail/Yahoo desde Fev 2024
        // List-Unsubscribe-Post: one-click unsubscribe (RFC 8058)
        const unsubUrl = `${baseUrl}/api/email/unsubscribe?token=unsub`;
        const antiSpamHeaders: Record<string, string> = {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'Precedence': 'bulk',
          'X-Mailer': 'Worder/1.0',
        };
        if (campaign_id) {
          antiSpamHeaders['X-Campaign-Id'] = String(campaign_id);
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

      // Throttle between chunks (skip after the last one)
      if (cIdx < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
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
