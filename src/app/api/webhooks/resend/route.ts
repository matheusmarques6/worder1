// =============================================
// WORDER: Resend Webhook Handler
// /src/app/api/webhooks/resend/route.ts
//
// Handles: email.delivered, email.bounced,
// email.complained, email.opened, email.clicked
// =============================================

import { NextRequest, NextResponse } from 'next/server';
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
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload: ResendWebhookPayload = await request.json();

    const { type, data } = payload;
    const resendId = data.email_id;

    if (!resendId) {
      return NextResponse.json({ error: 'Missing email_id' }, { status: 400 });
    }

    // Find the email_send by resend_id
    const { data: emailSend, error: findError } = await supabaseAdmin
      .from('email_sends')
      .select('id')
      .eq('resend_id', resendId)
      .maybeSingle();

    if (findError || !emailSend) {
      console.log(`[ResendWebhook] No email_send found for resend_id: ${resendId}`);
      // Return 200 to prevent Resend from retrying
      return NextResponse.json({ received: true, matched: false });
    }

    const emailSendId = emailSend.id;
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
        break;

      case 'email.complained':
        await supabaseAdmin
          .from('email_sends')
          .update({ status: 'complained', complained_at: now })
          .eq('id', emailSendId);
        break;

      case 'email.opened':
        await supabaseAdmin
          .from('email_sends')
          .update({ opened_at: now })
          .eq('id', emailSendId)
          .is('opened_at', null);
        break;

      case 'email.clicked':
        await supabaseAdmin
          .from('email_sends')
          .update({ clicked_at: now })
          .eq('id', emailSendId)
          .is('clicked_at', null);
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
