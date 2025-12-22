import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { 
  normalizeWebhookPayload, 
  normalizeEmail, 
  normalizePhone,
  type PlatformType 
} from '@/lib/integrations/normalizers'

// POST - Receive webhook from integrations
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    // Ler body como texto para verificação de assinatura
    const rawBody = await request.text()
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      body = rawBody
    }
    
    const headers: Record<string, string> = {}
    
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Find the installed integration by webhook token
    const { data: installation, error: installError } = await supabase
      .from('installed_integrations')
      .select(`
        *,
        integration:integrations(*)
      `)
      .eq('webhook_token', params.token)
      .eq('status', 'active')
      .single()

    if (installError || !installation) {
      console.error('Webhook token not found or integration inactive:', params.token)
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 404 })
    }

    // Log the webhook event
    const { data: webhookEvent, error: eventError } = await supabase
      .from('webhook_events')
      .insert({
        webhook_token: params.token,
        installed_integration_id: installation.id,
        event_type: body.topic || body.event || body.type || 'unknown',
        payload: body,
        headers,
        status: 'pending',
      })
      .select()
      .single()

    if (eventError) {
      console.error('Error logging webhook event:', eventError)
    }

    // Process the webhook based on integration type
    const integrationSlug = installation.integration?.slug

    let lead = null

    try {
      // Obter event type do header (para Shopify)
      const shopifyTopic = headers['x-shopify-topic'] || ''
      
      switch (integrationSlug) {
        case 'shopify':
          lead = await processShopifyWebhook(supabase, installation, body, shopifyTopic)
          break
        case 'whatsapp':
        case 'whatsapp-cloud-api':
          lead = await processWhatsAppWebhook(supabase, installation, body)
          break
        case 'evolution-api':
          lead = await processEvolutionWebhook(supabase, installation, body)
          break
        case 'google-forms':
          lead = await processGoogleFormsWebhook(supabase, installation, body)
          break
        case 'typeform':
          lead = await processTypeformWebhook(supabase, installation, body)
          break
        case 'google-sheets':
          lead = await processGoogleSheetsWebhook(supabase, installation, body)
          break
        case 'facebook-lead-ads':
        case 'instagram-lead-ads':
          lead = await processFacebookLeadAdsWebhook(supabase, installation, body)
          break
        case 'web-form':
          lead = await processWebFormWebhook(supabase, installation, body)
          break
        default:
          lead = await processGenericWebhook(supabase, installation, body)
      }

      // Update webhook event status
      if (webhookEvent) {
        await supabase
          .from('webhook_events')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            lead_id: lead?.id || null,
          })
          .eq('id', webhookEvent.id)
      }

      // Update last sync
      await supabase
        .from('installed_integrations')
        .update({
          last_sync_at: new Date().toISOString(),
          error_count: 0,
          last_error_message: null,
        })
        .eq('id', installation.id)

    } catch (processError: any) {
      console.error('Error processing webhook:', processError)

      // Update webhook event with error
      if (webhookEvent) {
        await supabase
          .from('webhook_events')
          .update({
            status: 'failed',
            error_message: processError.message,
          })
          .eq('id', webhookEvent.id)
      }

      // Increment error count
      await supabase
        .from('installed_integrations')
        .update({
          error_count: installation.error_count + 1,
          last_error_message: processError.message,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', installation.id)
    }

    return NextResponse.json({ 
      received: true,
      leadId: lead?.id || null,
    })

  } catch (error: any) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para construir dados do lead a partir de contato normalizado
function buildLeadData(
  installation: any, 
  normalized: any, 
  sourceOverride?: string
): Record<string, any> {
  return {
    organization_id: installation.organization_id,
    name: normalized.name || 
          `${normalized.firstName || ''} ${normalized.lastName || ''}`.trim() || 
          null,
    first_name: normalized.firstName || null,
    last_name: normalized.lastName || null,
    email: normalized.email || null,
    phone: normalized.phone || null,
    company: normalized.company || null,
    whatsapp_jid: normalized.whatsappJid || null,
    source: sourceOverride || normalized.source,
    tags: [...(installation.auto_tags || []), ...normalized.tags],
    custom_fields: normalized.customFields,
  }
}

// Shopify webhook processor
async function processShopifyWebhook(supabase: any, installation: any, payload: any, topic: string) {
  // Determinar tipo de evento
  let platform: PlatformType = 'generic'
  if (topic?.includes('customers/')) {
    platform = 'shopify_customer'
  } else if (topic?.includes('orders/')) {
    platform = 'shopify_order'
  } else if (topic?.includes('checkouts/')) {
    platform = 'shopify_checkout'
  }
  
  const normalized = normalizeWebhookPayload(platform, payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized)
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// WhatsApp webhook processor (Cloud API)
async function processWhatsAppWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('whatsapp_cloud_api', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'whatsapp')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Evolution API webhook processor
async function processEvolutionWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('whatsapp_evolution', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'whatsapp-evolution')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Google Forms webhook processor
async function processGoogleFormsWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('google_forms', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'google-forms')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Typeform webhook processor
async function processTypeformWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('typeform', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'typeform')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Google Sheets webhook processor
async function processGoogleSheetsWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('google_sheets', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'google-sheets')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Facebook Lead Ads webhook processor
// NOTA: O webhook do Facebook só envia o leadgen_id, precisamos buscar os dados
async function processFacebookLeadAdsWebhook(supabase: any, installation: any, payload: any) {
  // Extrair leadgen_id do payload
  const leadgenId = payload.entry?.[0]?.changes?.[0]?.value?.leadgen_id
  
  if (!leadgenId) {
    console.warn('Facebook Lead Ads: No leadgen_id in payload')
    return null
  }

  // Buscar dados completos do lead na Graph API
  const accessToken = installation.credentials_encrypted?.access_token || 
                      installation.oauth_access_token
  
  if (!accessToken) {
    console.error('Facebook Lead Ads: No access token configured')
    return null
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${accessToken}`
    )
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Facebook Lead Ads: Failed to fetch lead data:', error)
      return null
    }

    const fbLeadData = await response.json()
    
    // Agora normalizar com os dados completos
    const normalized = normalizeWebhookPayload('facebook_lead_ads', fbLeadData)
    if (!normalized) return null

    const leadData = buildLeadData(installation, normalized, 'facebook-lead-ads')
    return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
  } catch (error) {
    console.error('Facebook Lead Ads: Error fetching lead:', error)
    return null
  }
}

// Web form webhook processor
async function processWebFormWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('web_form', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, 'web-form')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Generic webhook processor
async function processGenericWebhook(supabase: any, installation: any, payload: any) {
  const normalized = normalizeWebhookPayload('generic', payload)
  if (!normalized) return null

  const leadData = buildLeadData(installation, normalized, installation.integration?.slug || 'webhook')
  return await createOrUpdateLead(supabase, installation, leadData, normalized.externalId)
}

// Create or update lead with deduplication
async function createOrUpdateLead(supabase: any, installation: any, leadData: any, externalId?: string) {
  // Normalize phone usando a função do normalizer
  if (leadData.phone) {
    const normalizedPhone = normalizePhone(leadData.phone)
    if (normalizedPhone) {
      leadData.phone = normalizedPhone
      leadData.phone_normalized = normalizedPhone
    }
  }

  // Normalize email usando a função do normalizer
  if (leadData.email) {
    const normalizedEmail = normalizeEmail(leadData.email)
    if (normalizedEmail) {
      leadData.email = normalizedEmail
      leadData.email_normalized = normalizedEmail
    }
  }

  // Remover duplicatas de tags
  if (leadData.tags) {
    leadData.tags = [...new Set(leadData.tags)]
  }

  // Hierarquia de deduplicação:
  // 1. External ID (100% confiança)
  // 2. Email normalizado (95% confiança)
  // 3. WhatsApp JID (90% confiança)
  // 4. Telefone normalizado (85% confiança)
  
  let existingLead: any = null
  let matchType = 'new'

  // 1. Verificar por external_id (mapeamento)
  if (externalId) {
    const { data: mapping } = await supabase
      .from('contact_external_mappings')
      .select('contact_id')
      .eq('installed_integration_id', installation.id)
      .eq('external_id', externalId)
      .maybeSingle()
    
    if (mapping?.contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', mapping.contact_id)
        .maybeSingle()
      
      if (data) {
        existingLead = data
        matchType = 'external_id'
      }
    }
  }

  // 2. Verificar por email normalizado
  if (!existingLead && leadData.email) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', installation.organization_id)
      .ilike('email', leadData.email)
      .limit(1)
      .maybeSingle()
    
    if (data) {
      existingLead = data
      matchType = 'email'
    }
  }

  // 3. Verificar por WhatsApp JID
  if (!existingLead && leadData.whatsapp_jid) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', installation.organization_id)
      .eq('whatsapp_jid', leadData.whatsapp_jid)
      .limit(1)
      .maybeSingle()
    
    if (data) {
      existingLead = data
      matchType = 'whatsapp_jid'
    }
  }

  // 4. Verificar por telefone normalizado
  if (!existingLead && leadData.phone) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', installation.organization_id)
      .eq('phone', leadData.phone)
      .limit(1)
      .maybeSingle()
    
    if (data) {
      existingLead = data
      matchType = 'phone'
    }
  }

  let contactResult: any

  if (existingLead) {
    // Merge tags (combinar existentes com novas)
    const existingTags = existingLead.tags || []
    const newTags = leadData.tags || []
    const mergedTags = [...new Set([...existingTags, ...newTags])]

    // Merge custom_fields (combinar existentes com novos)
    const existingCustomFields = existingLead.custom_fields || {}
    const newCustomFields = leadData.custom_fields || {}
    const mergedCustomFields = { ...existingCustomFields, ...newCustomFields }

    // Construir objeto de update apenas com campos que têm valor
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Só atualiza campos se tiverem valor (não sobrescrever com null)
    if (leadData.name) updateData.name = leadData.name
    if (leadData.email) updateData.email = leadData.email
    if (leadData.phone) updateData.phone = leadData.phone
    if (leadData.company) updateData.company = leadData.company
    if (leadData.whatsapp_jid) updateData.whatsapp_jid = leadData.whatsapp_jid
    if (mergedTags.length > 0) updateData.tags = mergedTags
    updateData.custom_fields = mergedCustomFields
    
    // Atualizar last_activity_at se a coluna existir
    updateData.last_activity_at = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', existingLead.id)
      .select()
      .single()

    if (error) throw error
    contactResult = { ...updated, isNew: false, matchType }
  } else {
    // Construir objeto de insert apenas com campos que têm valor
    const insertData: Record<string, any> = {
      organization_id: installation.organization_id,
      source: leadData.source || 'webhook',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (leadData.name) insertData.name = leadData.name
    if (leadData.first_name) insertData.first_name = leadData.first_name
    if (leadData.last_name) insertData.last_name = leadData.last_name
    if (leadData.email) insertData.email = leadData.email
    if (leadData.phone) insertData.phone = leadData.phone
    if (leadData.company) insertData.company = leadData.company
    if (leadData.whatsapp_jid) insertData.whatsapp_jid = leadData.whatsapp_jid
    if (leadData.tags?.length > 0) insertData.tags = leadData.tags
    if (leadData.custom_fields) insertData.custom_fields = leadData.custom_fields

    // Campos adicionais se existirem no schema
    if (externalId) insertData.source_external_id = externalId
    if (installation.integration?.slug) insertData.source_platform = installation.integration.slug

    const { data: newLead, error } = await supabase
      .from('contacts')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error
    contactResult = { ...newLead, isNew: true, matchType: 'new' }
  }

  // Criar/atualizar mapeamento externo (com try-catch caso tabela não exista)
  if (externalId && contactResult?.id) {
    try {
      await supabase
        .from('contact_external_mappings')
        .upsert({
          organization_id: installation.organization_id,
          contact_id: contactResult.id,
          installed_integration_id: installation.id,
          external_id: externalId,
          external_platform: installation.integration?.slug || 'unknown',
          external_data: leadData.custom_fields,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'installed_integration_id,external_id',
        })
    } catch (mappingError) {
      // Tabela pode não existir ainda, ignorar erro silenciosamente
      console.warn('Could not create external mapping:', mappingError)
    }
  }

  // Se é novo contato e tem pipeline configurado, criar deal
  if (contactResult?.isNew && installation.default_pipeline_id) {
    const dealTitle = contactResult.name || contactResult.email || contactResult.phone || 'Novo Lead'
    
    try {
      await supabase.from('deals').insert({
        organization_id: installation.organization_id,
        title: dealTitle,
        pipeline_id: installation.default_pipeline_id,
        stage_id: installation.default_stage_id,
        contact_id: contactResult.id,
        value: 0,
        probability: 10,
        source: leadData.source,
        metadata: {
          integration_id: installation.id,
          webhook_match_type: matchType,
        },
      })
    } catch (dealError) {
      // Não falhar o webhook se deal não puder ser criado
      console.warn('Could not create deal:', dealError)
    }
  }

  return contactResult
}

// GET - Webhook verification (for WhatsApp, etc)
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const searchParams = request.nextUrl.searchParams
  
  // WhatsApp verification
  const mode = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && verifyToken && challenge) {
    const supabase = getSupabaseClient()
    
    if (supabase) {
      // Buscar integração para verificar o token
      const { data: installation } = await supabase
        .from('installed_integrations')
        .select('credentials_encrypted')
        .eq('webhook_token', params.token)
        .maybeSingle()
      
      // Verificar se o verify_token bate com o armazenado nas credenciais
      // ou com o próprio webhook_token (fallback)
      const storedVerifyToken = installation?.credentials_encrypted?.verify_token
      
      if (verifyToken === storedVerifyToken || verifyToken === params.token) {
        return new Response(challenge, { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
      }
    }
    
    return new Response('Forbidden', { status: 403 })
  }

  return NextResponse.json({ status: 'ok', token: params.token })
}
