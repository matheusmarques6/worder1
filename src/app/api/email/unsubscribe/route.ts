import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { contactId, orgId } = await req.json()

    if (!contactId || !orgId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    // Update contact status
    const { error } = await supabaseAdmin
      .from('contacts')
      .update({
        status: 'unsubscribed',
        email_consent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('organization_id', orgId)

    if (error) {
      console.error('[Unsubscribe]', error)
      return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }

    // Record event
    await supabaseAdmin.from('contact_events').insert({
      organization_id: orgId,
      contact_id: contactId,
      event_type: 'email_unsubscribed',
      event_source: 'worder_email',
      properties: { reason: 'user_unsubscribed' },
      occurred_at: new Date().toISOString(),
      idempotency_key: `unsubscribe:${contactId}:${Date.now()}`,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Unsubscribe]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
