import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// POST /api/whatsapp/campaigns/[id]/schedule
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { scheduled_at, timezone = 'America/Sao_Paulo' } = body

    if (!scheduled_at) {
      return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 })
    }

    // Verificar se a campanha pode ser agendada
    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('status, template_id, audience_count')
      .eq('id', id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'cancelled'].includes(campaign.status)) {
      return NextResponse.json({ error: 'Campaign cannot be scheduled in current status' }, { status: 400 })
    }

    if (!campaign.template_id) {
      return NextResponse.json({ error: 'Campaign must have a template' }, { status: 400 })
    }

    if (campaign.audience_count === 0) {
      return NextResponse.json({ error: 'Campaign must have an audience' }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'scheduled',
        scheduled_at,
        timezone,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    // Log
    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      log_type: 'info',
      message: `Campanha agendada para ${new Date(scheduled_at).toLocaleString('pt-BR')}`,
      details: { scheduled_at, timezone }
    })

    return NextResponse.json({ campaign: updated })
  } catch (error) {
    console.error('Error scheduling campaign:', error)
    return NextResponse.json({ error: 'Failed to schedule campaign' }, { status: 500 })
  }
}
