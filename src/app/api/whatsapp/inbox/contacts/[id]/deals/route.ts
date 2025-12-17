import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/contacts/[id]/deals
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Busca contato para pegar contact_id usado nos deals
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('id, organization_id, phone_number, email')
      .eq('id', id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Busca deals associados ao contato
    const { data: deals, error } = await supabase
      .from('deals')
      .select(`
        *,
        pipeline:pipelines(id, name),
        stage:pipeline_stages(id, name, color)
      `)
      .eq('contact_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Separa deal ativo dos históricos
    const activeDeals = deals?.filter((d: any) => d.status === 'open') || []
    const closedDeals = deals?.filter((d: any) => d.status !== 'open') || []

    return NextResponse.json({
      activeDeal: activeDeals[0] || null,
      deals: deals || [],
      summary: {
        totalDeals: deals?.length || 0,
        wonDeals: deals?.filter((d: any) => d.status === 'won').length || 0,
        totalValue: deals?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0
      }
    })

  } catch (error) {
    console.error('Error fetching deals:', error)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/contacts/[id]/deals - Criar deal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { pipelineId, stageId, title, value, userId } = body

    // Busca contato
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('id, organization_id, name, phone_number')
      .eq('id', id)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Cria deal
    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        organization_id: contact.organization_id,
        contact_id: id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: title || `Deal - ${contact.name || contact.phone_number}`,
        value: value || 0,
        status: 'open',
        created_by: userId,
        created_at: new Date().toISOString()
      })
      .select(`
        *,
        pipeline:pipelines(id, name),
        stage:pipeline_stages(id, name, color)
      `)
      .single()

    if (error) throw error

    // Atualiza contato com referência ao deal
    await supabase
      .from('whatsapp_contacts')
      .update({
        deal_id: deal.id,
        pipeline_id: pipelineId,
        stage_id: stageId
      })
      .eq('id', id)

    // Registra atividade
    await supabase.from('whatsapp_contact_activities').insert({
      organization_id: contact.organization_id,
      contact_id: id,
      activity_type: 'deal_created',
      title: 'Deal criado',
      description: `${title || 'Novo deal'} - R$ ${value || 0}`,
      related_deal_id: deal.id,
      created_by: userId
    })

    return NextResponse.json({ deal })

  } catch (error) {
    console.error('Error creating deal:', error)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
}
