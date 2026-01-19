// src/app/api/whatsapp/inbox/contacts/[id]/deals/route.ts
// CORRIGIDO: Usa tabela CONTACTS unificada
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Helper para buscar contato unificado
async function getContact(contactId: string) {
  // Tentar tabela contacts primeiro
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, organization_id, whatsapp, phone, full_name, first_name, email')
    .eq('id', contactId)
    .single()

  if (contact) {
    return {
      ...contact,
      phone_number: contact.whatsapp || contact.phone,
      name: contact.full_name || contact.first_name,
      _table: 'contacts'
    }
  }

  // Fallback para whatsapp_contacts
  const { data: waContact } = await supabase
    .from('whatsapp_contacts')
    .select('id, organization_id, phone_number, name, email')
    .eq('id', contactId)
    .single()

  if (waContact) {
    return { ...waContact, _table: 'whatsapp_contacts' }
  }

  return null
}

// GET - Listar deals do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    const contact = await getContact(contactId)

    if (!contact) {
      return NextResponse.json({ deals: [], activeDeal: null })
    }

    // Buscar deals pelo contact_id OU pelo telefone
    const { data: deals, error } = await supabase
      .from('deals')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        stage:pipeline_stages(id, name, color, is_won, is_lost)
      `)
      .eq('organization_id', contact.organization_id)
      .or(`contact_id.eq.${contactId},contact_phone.eq.${contact.phone_number}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Deals fetch error:', error.message)
      return NextResponse.json({ deals: [], activeDeal: null })
    }

    // Encontrar deal ativo (open)
    const activeDeal = deals?.find((d: any) => d.status === 'open') || null

    return NextResponse.json({ 
      deals: deals || [],
      activeDeal
    })
  } catch (error: any) {
    console.error('Error fetching deals:', error)
    return NextResponse.json({ deals: [], activeDeal: null })
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
    const { pipelineId, stageId, title, value } = body

    const contact = await getContact(contactId)

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }

    // Se não passou pipeline/stage, buscar o primeiro
    let finalPipelineId = pipelineId
    let finalStageId = stageId

    if (!finalPipelineId || !finalStageId) {
      const { data: pipelines } = await supabase
        .from('pipelines')
        .select('id, stages:pipeline_stages(id, name, position)')
        .eq('organization_id', contact.organization_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)

      const pipeline = pipelines?.[0]
      if (pipeline) {
        finalPipelineId = pipeline.id
        const sortedStages = (pipeline.stages || []).sort((a: any, b: any) => a.position - b.position)
        finalStageId = sortedStages[0]?.id
      }
    }

    // Se ainda não tem pipeline, CRIAR um padrão
    if (!finalPipelineId || !finalStageId) {
      console.log('Criando pipeline padrão para organização:', contact.organization_id)
      
      // Criar pipeline padrão
      const { data: newPipeline, error: pipelineError } = await supabase
        .from('pipelines')
        .insert({
          organization_id: contact.organization_id,
          name: 'Pipeline Padrão',
          description: 'Pipeline criado automaticamente',
          is_active: true,
          is_default: true,
        })
        .select()
        .single()

      if (pipelineError) {
        console.error('Error creating pipeline:', pipelineError)
        return NextResponse.json({ 
          error: 'Nenhum pipeline disponível. Crie um pipeline no CRM primeiro.',
          details: pipelineError.message 
        }, { status: 400 })
      }

      finalPipelineId = newPipeline.id

      // Criar stages padrão
      const defaultStages = [
        { name: 'Novo', position: 1, color: '#3B82F6', probability: 10 },
        { name: 'Qualificado', position: 2, color: '#8B5CF6', probability: 30 },
        { name: 'Proposta', position: 3, color: '#F59E0B', probability: 60 },
        { name: 'Negociação', position: 4, color: '#EF4444', probability: 80 },
        { name: 'Ganho', position: 5, color: '#10B981', probability: 100, is_won: true },
        { name: 'Perdido', position: 6, color: '#6B7280', probability: 0, is_lost: true },
      ]

      const { data: stages, error: stagesError } = await supabase
        .from('pipeline_stages')
        .insert(
          defaultStages.map(s => ({
            ...s,
            pipeline_id: finalPipelineId,
          }))
        )
        .select()

      if (stagesError) {
        console.error('Error creating stages:', stagesError)
      }

      // Pegar primeiro stage
      finalStageId = stages?.[0]?.id
    }

    if (!finalPipelineId || !finalStageId) {
      return NextResponse.json({ 
        error: 'Não foi possível criar pipeline/stage padrão' 
      }, { status: 500 })
    }

    // Criar deal
    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        organization_id: contact.organization_id,
        pipeline_id: finalPipelineId,
        stage_id: finalStageId,
        contact_id: contactId,
        contact_phone: contact.phone_number,
        contact_name: contact.name,
        contact_email: contact.email,
        title: title || `Deal - ${contact.name || contact.phone_number}`,
        value: value || 0,
        status: 'open',
        probability: 50,
        currency: 'BRL',
      })
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        stage:pipeline_stages(id, name, color, is_won, is_lost)
      `)
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
