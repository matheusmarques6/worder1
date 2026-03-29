import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ ok: true });

    // Find email_send by resend message ID
    const messageId = data?.email_id;
    if (!messageId) return NextResponse.json({ ok: true });

    const { data: emailSend } = await supabase
      .from('email_sends')
      .select('id, contact_id')
      .eq('provider_message_id', messageId)
      .single();

    if (!emailSend) return NextResponse.json({ ok: true });

    const now = new Date().toISOString();

    switch (type) {
      case 'email.delivered':
        await supabase.from('email_sends').update({ delivered_at: now, status: 'delivered' }).eq('id', emailSend.id);
        break;
      case 'email.opened':
        await supabase.from('email_sends').update({ opened_at: now, status: 'opened' }).eq('id', emailSend.id).is('opened_at', null);
        break;
      case 'email.clicked':
        await supabase.from('email_sends').update({ clicked_at: now, status: 'clicked' }).eq('id', emailSend.id).is('clicked_at', null);
        break;
      case 'email.bounced':
        await supabase.from('email_sends').update({
          bounced_at: now, status: 'bounced',
          bounce_type: data?.bounce?.type || 'unknown',
          bounce_message: data?.bounce?.message || '',
        }).eq('id', emailSend.id);
        // Update contact
        if (emailSend.contact_id) {
          await supabase.from('contacts').update({ email_consent: 'bounced' }).eq('id', emailSend.contact_id);
        }
        break;
      case 'email.complained':
        await supabase.from('email_sends').update({ complained_at: now, status: 'complained' }).eq('id', emailSend.id);
        if (emailSend.contact_id) {
          await supabase.from('contacts').update({ email_consent: 'complained' }).eq('id', emailSend.contact_id);
        }
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[Resend Webhook] Error:', e);
    return NextResponse.json({ ok: true });
  }
}
