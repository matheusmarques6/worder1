import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, campaignId, contactId, orgId, url } = body

    if (!type || !campaignId || !contactId || !orgId) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const eventType = type === 'open' ? 'email_opened' : type === 'click' ? 'email_clicked' : type
    const idempotencyKey = `${eventType}:${campaignId}:${contactId}:${Date.now()}`

    // Insert event
    await supabaseAdmin.from('contact_events').insert({
      organization_id: orgId,
      contact_id: contactId,
      event_type: eventType,
      event_source: 'worder_email',
      properties: {
        CampaignId: campaignId,
        ...(url ? { ClickedURL: url } : {}),
      },
      occurred_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    })

    // Update contact last_active_at
    await supabaseAdmin.from('contacts').update({
      last_active_at: new Date().toISOString(),
      last_event_type: eventType,
    }).eq('id', contactId)

    // Update campaign stats
    if (type === 'open') {
      const { error: rpcError } = await supabaseAdmin.rpc('increment_campaign_opens', { campaign_id: campaignId })
      if (rpcError) {
        // If RPC doesn't exist, silently ignore
        console.warn('[Email Track Record] increment_campaign_opens RPC failed:', rpcError.message)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Email Track Record]', error)
    return NextResponse.json({ ok: true }) // Always return 200
  }
}
