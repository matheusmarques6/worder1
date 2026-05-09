// =============================================
// WORDER: Resend Webhook Handler
// /src/app/api/webhooks/resend/route.ts
//
// Handles: email.delivered, email.bounced,
// email.complained, email.opened, email.clicked
//
// Signature verification via svix (same format Resend uses).
// If RESEND_WEBHOOK_SECRET is not set, accepts without verification
// (dev mode). In production this env var MUST be set.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    created_at: string;
    tags?: { name: string; value: string }[];
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const svixId = request.headers.get('svix-id');
      const svixTimestamp = request.headers.get('svix-timestamp');
      const svixSignature = request.headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error('[ResendWebhook] Missing svix headers');
        return NextResponse.json({ error: 'Missing webhook headers' }, { status: 401 });
      }

      try {
        const wh = new Webhook(webhookSecret);
        wh.verify(body, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch (err) {
        console.error('[ResendWebhook] Invalid signature:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload: ResendWebhookPayload = JSON.parse(body);
    const { type, data } = payload;
    const resendId = data.email_id;

    if (!resendId) {
      return NextResponse.json({ error: 'Missing email_id' }, { status: 400 });
    }

    // Find the email_send with contact + campaign info
    const { data: emailSend, error: findError } = await supabaseAdmin
      .from('email_sends')
      .select('id, campaign_id, contact_id, ab_variant')
      .eq('resend_id', resendId)
      .maybeSingle();

    if (findError || !emailSend) {
      console.log(`[ResendWebhook] No email_send found for resend_id: ${resendId}`);
      return NextResponse.json({ received: true, matched: false });
    }

    const emailSendId = emailSend.id;
    const campaignId = emailSend.campaign_id;
    const contactId = emailSend.contact_id;
    const now = new Date().toISOString();

    // Resolve organization_id
    let orgId: string | null = null;
    if (campaignId) {
      const { data: camp } = await supabaseAdmin
        .from('email_campaigns')
        .select('organization_id')
        .eq('id', campaignId)
        .maybeSingle();
      orgId = camp?.organization_id || null;
    }

    // Helper: gravar evento no CDP + atualizar contato
    const cdpEvent = async (eventType: string, props: Record<string, any> = {}) => {
      if (!orgId || !contactId) return;
      const dayKey = now.slice(0, 10);
      // CDP event
      await supabaseAdmin.from('contact_events').insert({
        organization_id: orgId,
        contact_id: contactId,
        event_type: eventType,
        event_source: 'worder_email',
        properties: { CampaignId: campaignId, SendId: emailSendId, ...props },
        occurred_at: now,
        idempotency_key: `${eventType}:${campaignId}:${contactId}:${dayKey}`,
      }).select().maybeSingle();
      // Update contact
      await supabaseAdmin.from('contacts')
        .update({ last_active_at: now, last_event_type: eventType })
        .eq('id', contactId);

      // Dispatch matching automation trigger so flows like "tag VIPs who
      // opened" / "stop sending to anyone who reported as spam" can react.
      const triggerMap: Record<string, string> = {
        email_opened: 'trigger_email_opened',
        email_clicked: 'trigger_email_clicked',
        email_bounced: 'trigger_email_bounced',
        email_complained: 'trigger_email_complained',
        email_unsubscribed: 'trigger_email_unsubscribed',
      };
      const triggerType = triggerMap[eventType];
      if (triggerType) {
        try {
          const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
          await dispatchTrigger({
            organizationId: orgId,
            triggerType,
            contactId,
            triggerData: {
              event_type: eventType,
              CampaignId: campaignId,
              SendId: emailSendId,
              ...props,
            },
            idempotencyKey: `${triggerType}:${emailSendId}`,
          });
        } catch (e) {
          console.warn(`[resend webhook] dispatch ${triggerType} failed:`, e);
        }
      }
    };

    switch (type) {
      case 'email.delivered':
        await supabaseAdmin.from('email_sends')
          .update({ status: 'delivered', delivered_at: now })
          .eq('id', emailSendId);
        await cdpEvent('email_delivered');
        if (campaignId) {
          const { error } = await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: campaignId });
          // increment_campaign_delivered RPC pode não existir — silenciar
        }
        break;

      case 'email.bounced':
        await supabaseAdmin.from('email_sends')
          .update({ status: 'bounced', bounced_at: now, error_message: data.bounce?.type || 'bounced' })
          .eq('id', emailSendId);
        await cdpEvent('email_bounced', { bounce_type: data.bounce?.type, bounce_message: data.bounce?.message });
        // Revogar consent do contato que bounced (hard bounce)
        if (contactId && data.bounce?.type === 'hard') {
          await supabaseAdmin.from('contacts')
            .update({ email_consent: false, status: 'bounced' })
            .eq('id', contactId);
        }
        break;

      case 'email.complained':
        await supabaseAdmin.from('email_sends')
          .update({ status: 'complained', complained_at: now })
          .eq('id', emailSendId);
        await cdpEvent('email_complained');
        // Revogar consent de quem reclamou (spam report)
        if (contactId) {
          await supabaseAdmin.from('contacts')
            .update({ email_consent: false, status: 'complained' })
            .eq('id', contactId);
        }
        break;

      case 'email.opened':
        await supabaseAdmin.from('email_sends')
          .update({ opened_at: now })
          .eq('id', emailSendId)
          .is('opened_at', null);
        // CDP: só grava se nosso pixel não pegou (dedup via idempotency_key)
        await cdpEvent('email_opened');
        if (campaignId) {
          const { error } = await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: campaignId });
        }
        break;

      case 'email.clicked':
        await supabaseAdmin.from('email_sends')
          .update({ clicked_at: now })
          .eq('id', emailSendId)
          .is('clicked_at', null);
        await cdpEvent('email_clicked', { source: 'resend_webhook' });
        if (campaignId) {
          const { error } = await supabaseAdmin.rpc('increment_campaign_clicks', { campaign_id: campaignId });
        }
        break;

      default:
        console.log(`[ResendWebhook] Unhandled event type: ${type}`);
    }

    return NextResponse.json({ received: true, matched: true, type });
  } catch (error) {
    console.error('[ResendWebhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
