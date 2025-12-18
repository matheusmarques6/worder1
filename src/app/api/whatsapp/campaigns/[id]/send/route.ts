import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/campaigns/[id]/send - Iniciar envio imediato
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Buscar campanha
    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('*, template:whatsapp_templates(*)')
      .eq('id', id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json({ error: 'Campaign cannot be sent in current status' }, { status: 400 })
    }

    if (!campaign.template_id) {
      return NextResponse.json({ error: 'Campaign must have a template' }, { status: 400 })
    }

    // Buscar contatos da audiência
    let contactsQuery = supabase
      .from('whatsapp_contacts')
      .select('id, phone_number, name, email, tags')
      .eq('organization_id', campaign.organization_id)
      .or('is_blocked.is.null,is_blocked.eq.false')

    if (campaign.audience_type === 'tags' && campaign.audience_tags?.length > 0) {
      contactsQuery = contactsQuery.overlaps('tags', campaign.audience_tags)
    }

    const { data: contacts, error: contactsError } = await contactsQuery

    if (contactsError) throw contactsError

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found for this audience' }, { status: 400 })
    }

    // Atualizar status para running
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        total_recipients: contacts.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    // Criar registros de destinatários
    const recipients = contacts.map(contact => ({
      campaign_id: id,
      contact_id: contact.id,
      phone_number: contact.phone_number,
      contact_name: contact.name,
      status: 'queued',
      queued_at: new Date().toISOString(),
      resolved_variables: resolveVariables(campaign.template_variables, contact)
    }))

    // Inserir em batches
    const batchSize = 500
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)
      await supabase.from('whatsapp_campaign_recipients').insert(batch)
    }

    // Log
    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      log_type: 'success',
      message: `Campanha iniciada com ${contacts.length} destinatários`,
      details: { total_recipients: contacts.length }
    })

    // TODO: Aqui deveria enfileirar o job de envio real
    // Por enquanto, simula o envio atualizando status

    // Simular envio (em produção seria um job async)
    setTimeout(async () => {
      await simulateSend(id, contacts.length)
    }, 1000)

    return NextResponse.json({ 
      success: true,
      message: 'Campaign started',
      totalRecipients: contacts.length
    })
  } catch (error) {
    console.error('Error sending campaign:', error)
    return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 })
  }
}

// Resolver variáveis do template
function resolveVariables(
  templateVars: Record<string, any>,
  contact: any
): Record<string, string> {
  const resolved: Record<string, string> = {}

  Object.entries(templateVars || {}).forEach(([key, config]: [string, any]) => {
    if (config.type === 'static') {
      resolved[key] = config.value
    } else if (config.type === 'field') {
      switch (config.value) {
        case 'name':
          resolved[key] = contact.name || 'Cliente'
          break
        case 'phone':
          resolved[key] = contact.phone_number
          break
        case 'email':
          resolved[key] = contact.email || ''
          break
        default:
          resolved[key] = config.value
      }
    }
  })

  return resolved
}

// Simular envio (em produção seria integração real com Meta)
async function simulateSend(campaignId: string, totalRecipients: number) {
  try {
    // Simular progresso
    const successRate = 0.95 // 95% de sucesso

    // Atualizar recipients como enviados
    await supabase
      .from('whatsapp_campaign_recipients')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'queued')

    // Simular algumas entregas
    const deliveredCount = Math.floor(totalRecipients * successRate)
    const { data: recipients } = await supabase
      .from('whatsapp_campaign_recipients')
      .select('id')
      .eq('campaign_id', campaignId)
      .limit(deliveredCount)

    if (recipients) {
      const ids = recipients.map(r => r.id)
      await supabase
        .from('whatsapp_campaign_recipients')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .in('id', ids)
    }

    // Marcar campanha como completa
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_sent: totalRecipients,
        total_delivered: deliveredCount,
        total_failed: totalRecipients - deliveredCount
      })
      .eq('id', campaignId)

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: campaignId,
      log_type: 'success',
      message: 'Campanha concluída',
      details: { 
        total_sent: totalRecipients, 
        total_delivered: deliveredCount,
        total_failed: totalRecipients - deliveredCount
      }
    })
  } catch (error) {
    console.error('Error in simulateSend:', error)
  }
}
