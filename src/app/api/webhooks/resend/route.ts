import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, data } = body

    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ received: true })
    }

    const { supabaseAdmin } = await import('@/lib/supabase-admin')

    // Find the email_send by resend_id
    const resendId = data.email_id
    if (!resendId) {
      return NextResponse.json({ received: true })
    }

    const { data: emailSend } = await supabaseAdmin
      .from('email_sends')
      .select('id, contact_id')
      .eq('resend_id', resendId)
      .single()

    if (!emailSend) {
      return NextResponse.json({ received: true })
    }

    switch (type) {
      case 'email.delivered':
        await supabaseAdmin
          .from('email_sends')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('id', emailSend.id)
        break

      case 'email.bounced':
        await supabaseAdmin
          .from('email_sends')
          .update({
            status: 'bounced',
            bounced_at: new Date().toISOString(),
            error_message: data.bounce?.type || 'bounced',
          })
          .eq('id', emailSend.id)

        // Mark contact as bounced
        if (emailSend.contact_id) {
          await supabaseAdmin
            .from('contacts')
            .update({ is_subscribed_email: false })
            .eq('id', emailSend.contact_id)
        }
        break

      case 'email.complained':
        await supabaseAdmin
          .from('email_sends')
          .update({
            status: 'complained',
            error_message: 'spam_complaint',
          })
          .eq('id', emailSend.id)

        if (emailSend.contact_id) {
          await supabaseAdmin
            .from('contacts')
            .update({ is_subscribed_email: false })
            .eq('id', emailSend.contact_id)
        }
        break

      case 'email.opened':
        await supabaseAdmin
          .from('email_sends')
          .update({
            opened_at: new Date().toISOString(),
            status: 'opened',
          })
          .eq('id', emailSend.id)
          .is('opened_at', null)
        break

      case 'email.clicked':
        await supabaseAdmin
          .from('email_sends')
          .update({
            clicked_at: new Date().toISOString(),
            status: 'clicked',
          })
          .eq('id', emailSend.id)
          .is('clicked_at', null)
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[Resend Webhook] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
