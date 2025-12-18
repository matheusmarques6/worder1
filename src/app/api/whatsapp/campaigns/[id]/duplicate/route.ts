import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/campaigns/[id]/duplicate
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data: original } = await supabase
      .from('whatsapp_campaigns')
      .select('*')
      .eq('id', id)
      .single()

    if (!original) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Criar cópia
    const { data: duplicate, error } = await supabase
      .from('whatsapp_campaigns')
      .insert({
        organization_id: original.organization_id,
        instance_id: original.instance_id,
        name: `${original.name} (Cópia)`,
        description: original.description,
        type: original.type,
        status: 'draft',
        template_id: original.template_id,
        template_name: original.template_name,
        template_variables: original.template_variables,
        media_url: original.media_url,
        media_type: original.media_type,
        audience_type: original.audience_type,
        audience_tags: original.audience_tags,
        audience_segment_id: original.audience_segment_id,
        audience_filters: original.audience_filters,
        audience_count: original.audience_count,
        timezone: original.timezone,
        messages_per_second: original.messages_per_second,
        cost_per_message: original.cost_per_message,
        total_cost: original.total_cost,
        created_by: original.created_by,
        created_by_name: original.created_by_name
      })
      .select('*')
      .single()

    if (error) throw error

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: duplicate.id,
      log_type: 'info',
      message: `Campanha duplicada de "${original.name}"`
    })

    return NextResponse.json({ campaign: duplicate })
  } catch (error) {
    console.error('Error duplicating campaign:', error)
    return NextResponse.json({ error: 'Failed to duplicate campaign' }, { status: 500 })
  }
}
