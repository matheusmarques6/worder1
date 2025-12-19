import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Listar deals do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    // Buscar contato para pegar org_id
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('organization_id, phone_number')
      .eq('id', contactId)
      .single()

    if (!contact) {
      return NextResponse.json({ deals: [] })
    }

    // Buscar deals do contato
    const { data: deals, error } = await supabase
      .from('deals')
      .select('*')
      .eq('organization_id', contact.organization_id)
      .or(`contact_phone.eq.${contact.phone_number},metadata->>whatsapp_contact_id.eq.${contactId}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Deals table error:', error.message)
      return NextResponse.json({ deals: [] })
    }

    return NextResponse.json({ deals: deals || [] })
  } catch (error: any) {
    console.error('Error fetching deals:', error)
    return NextResponse.json({ deals: [] })
  }
}

// POST - Criar deal
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { title, value } = body

    // Buscar contato
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('organization_id, phone_number, name')
      .eq('id', contactId)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }

    // Buscar pipeline padrão
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, stages:pipeline_stages(id, name, position)')
      .eq('organization_id', contact.organization_id)
      .limit(1)

    const pipeline = pipelines?.[0]
    const firstStage = pipeline?.stages?.sort((a: any, b: any) => a.position - b.position)?.[0]

    // Criar deal
    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        organization_id: contact.organization_id,
        title: title || `Deal - ${contact.name || contact.phone_number}`,
        value: value || 0,
        status: 'open',
        pipeline_id: pipeline?.id || null,
        stage_id: firstStage?.id || null,
        contact_phone: contact.phone_number,
        metadata: { 
          whatsapp_contact_id: contactId,
          source: 'whatsapp'
        },
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating deal:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Error creating deal:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
