import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// POST /api/whatsapp/campaigns/[id]/pause
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('status')
      .eq('id', id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'running') {
      return NextResponse.json({ error: 'Only running campaigns can be paused' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      log_type: 'warning',
      message: 'Campanha pausada'
    })

    return NextResponse.json({ campaign: updated })
  } catch (error) {
    console.error('Error pausing campaign:', error)
    return NextResponse.json({ error: 'Failed to pause campaign' }, { status: 500 })
  }
}
