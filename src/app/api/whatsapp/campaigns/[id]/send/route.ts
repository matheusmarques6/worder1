import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Configurações do processamento
const CONFIG = {
  batchSize: 50,         // Mensagens por lote
  messageDelay: 500,     // Delay entre mensagens (ms)
  maxRetries: 3,         // Tentativas máximas
}

// POST /api/whatsapp/campaigns/[id]/send - Iniciar envio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Buscar campanha
    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('*, template:whatsapp_templates(*)')
      .eq('id', id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      return NextResponse.json({ error: 'Campaign cannot be sent in current status' }, { status: 400 })
    }

    if (!campaign.template_id && !campaign.template_name) {
      return NextResponse.json({ error: 'Campaign must have a template' }, { status: 400 })
    }

    // Buscar instância WhatsApp com credenciais
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', campaign.organization_id)
      .eq('status', 'connected')
      .single()

    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance found' }, { status: 400 })
    }

    if (!instance.access_token || !instance.phone_number_id) {
      return NextResponse.json({ error: 'WhatsApp instance not properly configured (missing access_token or phone_number_id)' }, { status: 400 })
    }

    // Buscar contatos da audiência
    let contacts: any[] = []
    
    if (campaign.audience_type === 'phonebook' && campaign.audience_phonebook_id) {
      // Buscar contatos do phonebook
      const { data: pbContacts, error: pbError } = await supabase
        .from('phonebook_contacts')
        .select('id, name, mobile, email')
        .eq('phonebook_id', campaign.audience_phonebook_id)
        .eq('organization_id', campaign.organization_id)

      if (pbError) throw pbError
      
      // Mapear para formato padrão
      contacts = (pbContacts || []).map(c => ({
        id: c.id,
        phone_number: c.mobile,
        name: c.name,
        email: c.email,
        tags: []
      }))
    } else if (campaign.audience_type === 'import' && campaign.imported_contacts) {
      // Contatos importados diretamente na campanha
      contacts = campaign.imported_contacts.map((c: any, i: number) => ({
        id: `imported-${i}`,
        phone_number: c.phone || c.mobile || c.telefone,
        name: c.name || c.nome || 'Contato',
        email: c.email || '',
        tags: []
      }))
    } else {
      // Buscar da tabela whatsapp_contacts
      let contactsQuery = supabase
        .from('whatsapp_contacts')
        .select('id, phone_number, name, email, tags')
        .eq('organization_id', campaign.organization_id)
        .or('is_blocked.is.null,is_blocked.eq.false')

      if (campaign.audience_type === 'tags' && campaign.audience_tags?.length > 0) {
        contactsQuery = contactsQuery.overlaps('tags', campaign.audience_tags)
      }

      const { data: waContacts, error: contactsError } = await contactsQuery

      if (contactsError) throw contactsError
      contacts = waContacts || []
    }

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
        instance_id: instance.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    // Criar registros de destinatários
    const recipients = contacts.map(contact => ({
      campaign_id: id,
      contact_id: contact.id,
      phone_number: contact.phone_number,
      contact_name: contact.name,
      status: 'pending',
      queued_at: new Date().toISOString(),
      resolved_variables: resolveVariables(campaign.template_variables, contact)
    }))

    // Inserir em batches de 500
    const insertBatchSize = 500
    for (let i = 0; i < recipients.length; i += insertBatchSize) {
      const batch = recipients.slice(i, i + insertBatchSize)
      await supabase.from('whatsapp_campaign_recipients').insert(batch)
    }

    // Log
    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: id,
      log_type: 'info',
      message: `Campanha iniciada com ${contacts.length} destinatários`,
      details: { total_recipients: contacts.length, instance_id: instance.id }
    })

    // Iniciar processamento assíncrono
    processCampaignAsync(id, campaign, instance)

    return NextResponse.json({ 
      success: true,
      message: 'Campaign started',
      totalRecipients: contacts.length
    })
  } catch (error: any) {
    console.error('Error sending campaign:', error)
    return NextResponse.json({ error: error.message || 'Failed to send campaign' }, { status: 500 })
  }
}

// Resolver variáveis do template
function resolveVariables(
  templateVars: Record<string, any>,
  contact: any
): Record<string, string> {
  const resolved: Record<string, string> = {}

  Object.entries(templateVars || {}).forEach(([key, config]: [string, any]) => {
    if (config?.type === 'static') {
      resolved[key] = config.value || ''
    } else if (config?.type === 'field') {
      switch (config.value) {
        case 'name':
          resolved[key] = contact.name || 'Cliente'
          break
        case 'phone':
          resolved[key] = contact.phone_number || ''
          break
        case 'email':
          resolved[key] = contact.email || ''
          break
        default:
          resolved[key] = config.value || ''
      }
    } else if (typeof config === 'string') {
      // Valor direto
      resolved[key] = config
    }
  })

  return resolved
}

// Processar campanha em background
async function processCampaignAsync(
  campaignId: string, 
  campaign: any, 
  instance: any
) {
  console.log(`[Campaign ${campaignId}] Starting async processing...`)
  
  let totalSent = 0
  let totalFailed = 0
  let isRunning = true

  try {
    while (isRunning) {
      // Verificar se campanha ainda está running (pode ter sido pausada/cancelada)
      const { data: currentCampaign } = await supabase
        .from('whatsapp_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (!currentCampaign || currentCampaign.status !== 'running') {
        console.log(`[Campaign ${campaignId}] Status changed to ${currentCampaign?.status}, stopping...`)
        break
      }

      // Buscar próximo lote de pendentes
      const { data: pendingRecipients } = await supabase
        .from('whatsapp_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('queued_at', { ascending: true })
        .limit(CONFIG.batchSize)

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // Verificar se tem falhos para retentar
        const { data: failedRecipients } = await supabase
          .from('whatsapp_campaign_recipients')
          .select('*')
          .eq('campaign_id', campaignId)
          .eq('status', 'failed')
          .lt('retry_count', CONFIG.maxRetries)
          .limit(CONFIG.batchSize)

        if (!failedRecipients || failedRecipients.length === 0) {
          // Campanha concluída!
          isRunning = false
          break
        }

        // Resetar falhos para retentar
        for (const recipient of failedRecipients) {
          await supabase
            .from('whatsapp_campaign_recipients')
            .update({ status: 'pending' })
            .eq('id', recipient.id)
        }
        continue
      }

      // Processar lote
      for (const recipient of pendingRecipients) {
        try {
          // Preparar variáveis do body
          const bodyVariables: string[] = []
          const vars = recipient.resolved_variables || {}
          
          // Ordenar por chave numérica (1, 2, 3...)
          const sortedKeys = Object.keys(vars).sort((a, b) => parseInt(a) - parseInt(b))
          for (const key of sortedKeys) {
            if (vars[key]) {
              bodyVariables.push(vars[key])
            }
          }

          // Preparar componentes do template
          const components: any[] = []
          
          if (bodyVariables.length > 0) {
            components.push({
              type: 'body',
              parameters: bodyVariables.map(v => ({ type: 'text', text: v }))
            })
          }

          // Header com mídia (se houver)
          if (campaign.media_url && campaign.media_type) {
            components.push({
              type: 'header',
              parameters: [{
                type: campaign.media_type,
                [campaign.media_type]: { link: campaign.media_url }
              }]
            })
          }

          // Enviar mensagem via Meta API
          const result = await sendTemplateMessage({
            phoneNumberId: instance.phone_number_id,
            accessToken: instance.access_token,
            to: recipient.phone_number,
            templateName: campaign.template_name || campaign.template?.name,
            languageCode: campaign.template?.language || 'pt_BR',
            components
          })

          // Sucesso!
          await supabase
            .from('whatsapp_campaign_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              meta_message_id: result.messages?.[0]?.id || null
            })
            .eq('id', recipient.id)

          totalSent++

        } catch (error: any) {
          console.error(`[Campaign ${campaignId}] Error sending to ${recipient.phone_number}:`, error.message)
          
          const currentRetry = (recipient.retry_count || 0) + 1
          
          await supabase
            .from('whatsapp_campaign_recipients')
            .update({
              status: currentRetry >= CONFIG.maxRetries ? 'failed' : 'pending',
              failed_at: new Date().toISOString(),
              error_code: error.code || 'UNKNOWN',
              error_message: error.message || 'Unknown error',
              retry_count: currentRetry
            })
            .eq('id', recipient.id)

          if (currentRetry >= CONFIG.maxRetries) {
            totalFailed++
          }
        }

        // Delay entre mensagens
        await sleep(CONFIG.messageDelay)
      }

      // Atualizar métricas parciais
      await supabase
        .from('whatsapp_campaigns')
        .update({
          total_sent: totalSent,
          total_failed: totalFailed,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId)
    }

    // Campanha finalizada
    const finalStats = await getFinalStats(campaignId)
    
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_sent: finalStats.sent,
        total_delivered: finalStats.delivered,
        total_read: finalStats.read,
        total_failed: finalStats.failed,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: campaignId,
      log_type: 'success',
      message: 'Campanha concluída',
      details: finalStats
    })

    console.log(`[Campaign ${campaignId}] Completed! Sent: ${finalStats.sent}, Failed: ${finalStats.failed}`)

  } catch (error: any) {
    console.error(`[Campaign ${campaignId}] Fatal error:`, error)
    
    await supabase
      .from('whatsapp_campaigns')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)

    await supabase.from('whatsapp_campaign_logs').insert({
      campaign_id: campaignId,
      log_type: 'error',
      message: `Erro fatal: ${error.message}`,
      details: { error: error.message }
    })
  }
}

// Obter estatísticas finais
async function getFinalStats(campaignId: string) {
  const { data: recipients } = await supabase
    .from('whatsapp_campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId)

  const stats = {
    total: recipients?.length || 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    pending: 0
  }

  recipients?.forEach(r => {
    switch (r.status) {
      case 'sent': stats.sent++; break
      case 'delivered': stats.delivered++; stats.sent++; break
      case 'read': stats.read++; stats.delivered++; stats.sent++; break
      case 'failed': stats.failed++; break
      case 'pending': stats.pending++; break
    }
  })

  return stats
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
