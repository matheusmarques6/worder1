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

    // Find the email_send by resend_id
    const { data: emailSend, error: findError } = await supabaseAdmin
      .from('email_sends')
      .select('id, campaign_id')
      .eq('resend_id', resendId)
      .maybeSingle();

    if (findError || !emailSend) {
      console.log(`[ResendWebhook] No email_send found for resend_id: ${resendId}`);
      // Return 200 to prevent Resend from retrying
      return NextResponse.json({ received: true, matched: false });
    }

    const emailSendId = emailSend.id;
    const campaignId = emailSend.campaign_id;
    const now = new Date().toISOString();

    switch (type) {
      case 'email.delivered':
        await supabaseAdmin
          .from('email_sends')
          .update({ status: 'delivered', delivered_at: now })
          .eq('id', emailSendId);
        break;

      case 'email.bounced':
        await supabaseAdmin
          .from('email_sends')
          .update({
            status: 'bounced',
            bounced_at: now,
            error_message: data.bounce?.type || 'bounced',
          })
          .eq('id', emailSendId);
        if (campaignId) {
          try { await supabaseAdmin.rpc('increment_campaign_bounces', { p_campaign_id: campaignId }); } catch {}
        }
        break;

      case 'email.complained':
        await supabaseAdmin
          .from('email_sends')
          .update({ status: 'complained', complained_at: now })
          .eq('id', emailSendId);
        break;

      case 'email.opened':
        // Update only if not already set (open pixel may have fired first)
        await supabaseAdmin
          .from('email_sends')
          .update({ opened_at: now })
          .eq('id', emailSendId)
          .is('opened_at', null);
        if (campaignId) {
          try { await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: campaignId }); } catch {}
        }
        break;

      case 'email.clicked':
        await supabaseAdmin
          .from('email_sends')
          .update({ clicked_at: now })
          .eq('id', emailSendId)
          .is('clicked_at', null);
        if (campaignId) {
          try { await supabaseAdmin.rpc('increment_campaign_clicks', { p_campaign_id: campaignId }); } catch {}
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
