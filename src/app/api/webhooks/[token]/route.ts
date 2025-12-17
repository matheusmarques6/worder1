import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

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
    const body = await request.json()
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
      switch (integrationSlug) {
        case 'shopify':
          lead = await processShopifyWebhook(supabase, installation, body)
          break
        case 'whatsapp':
          lead = await processWhatsAppWebhook(supabase, installation, body)
          break
        case 'google-forms':
          lead = await processGoogleFormsWebhook(supabase, installation, body)
          break
        case 'google-sheets':
          lead = await processGoogleSheetsWebhook(supabase, installation, body)
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

// Shopify webhook processor
async function processShopifyWebhook(supabase: any, installation: any, payload: any) {
  // Normalize Shopify data to lead format
  const leadData: any = {
    organization_id: installation.organization_id,
    first_name: payload.first_name || payload.customer?.first_name || null,
    last_name: payload.last_name || payload.customer?.last_name || null,
    email: payload.email || payload.customer?.email || null,
    phone: payload.phone || payload.customer?.phone || null,
    company: payload.company || null,
    source: 'shopify',
    tags: [...(installation.auto_tags || [])],
    custom_fields: {
      shopify_id: payload.id?.toString(),
      source_event: payload.topic || 'unknown',
      ...payload,
    },
  }

  // Determine event type and add specific tag
  if (payload.topic?.includes('orders/')) {
    leadData.tags.push('pedido')
  } else if (payload.topic?.includes('checkouts/')) {
    leadData.tags.push('carrinho-abandonado')
  } else if (payload.topic?.includes('customers/')) {
    leadData.tags.push('novo-cliente')
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// WhatsApp webhook processor
async function processWhatsAppWebhook(supabase: any, installation: any, payload: any) {
  const contact = payload.contacts?.[0]
  const message = payload.messages?.[0]

  const leadData: any = {
    organization_id: installation.organization_id,
    first_name: contact?.profile?.name?.split(' ')[0] || null,
    last_name: contact?.profile?.name?.split(' ').slice(1).join(' ') || null,
    phone: contact?.wa_id || message?.from || null,
    source: 'whatsapp',
    tags: [...(installation.auto_tags || []), 'whatsapp'],
    custom_fields: {
      whatsapp_id: contact?.wa_id,
      first_message: message?.text?.body,
      ...payload,
    },
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// Google Forms webhook processor
async function processGoogleFormsWebhook(supabase: any, installation: any, payload: any) {
  const answers = payload.answers || payload.responses || {}

  // Try to extract common fields
  const leadData: any = {
    organization_id: installation.organization_id,
    email: answers.Email || answers.email || answers['E-mail'] || null,
    first_name: (answers.Nome || answers.name || answers.Name || '').split(' ')[0] || null,
    last_name: (answers.Nome || answers.name || answers.Name || '').split(' ').slice(1).join(' ') || null,
    phone: answers.Telefone || answers.phone || answers.Phone || answers.Celular || null,
    company: answers.Empresa || answers.company || answers.Company || null,
    source: 'google-forms',
    tags: [...(installation.auto_tags || []), 'formulario'],
    custom_fields: answers,
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// Google Sheets webhook processor
async function processGoogleSheetsWebhook(supabase: any, installation: any, payload: any) {
  const row = payload.row || payload.data || {}

  const leadData: any = {
    organization_id: installation.organization_id,
    email: row.Email || row.email || null,
    first_name: (row.Nome || row.name || '').split(' ')[0] || null,
    last_name: (row.Nome || row.name || '').split(' ').slice(1).join(' ') || null,
    phone: row.Telefone || row.phone || null,
    company: row.Empresa || row.company || null,
    source: 'google-sheets',
    tags: [...(installation.auto_tags || []), 'planilha'],
    custom_fields: row,
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// Web form webhook processor
async function processWebFormWebhook(supabase: any, installation: any, payload: any) {
  const leadData: any = {
    organization_id: installation.organization_id,
    email: payload.email || null,
    first_name: payload.firstName || payload.first_name || (payload.name || '').split(' ')[0] || null,
    last_name: payload.lastName || payload.last_name || (payload.name || '').split(' ').slice(1).join(' ') || null,
    phone: payload.phone || payload.telefone || null,
    company: payload.company || payload.empresa || null,
    source: 'web-form',
    tags: [...(installation.auto_tags || []), 'site'],
    custom_fields: payload,
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// Generic webhook processor
async function processGenericWebhook(supabase: any, installation: any, payload: any) {
  const leadData: any = {
    organization_id: installation.organization_id,
    email: payload.email || null,
    first_name: payload.firstName || payload.first_name || null,
    last_name: payload.lastName || payload.last_name || null,
    phone: payload.phone || null,
    company: payload.company || null,
    source: installation.integration?.slug || 'webhook',
    tags: installation.auto_tags || [],
    custom_fields: payload,
  }

  return await createOrUpdateLead(supabase, installation, leadData)
}

// Create or update lead with deduplication
async function createOrUpdateLead(supabase: any, installation: any, leadData: any) {
  // Normalize phone (remove non-numeric except +)
  if (leadData.phone) {
    leadData.phone = leadData.phone.replace(/[^\d+]/g, '')
  }

  // Normalize email (lowercase + trim)
  if (leadData.email) {
    leadData.email = leadData.email.toLowerCase().trim()
  }

  // Check for existing lead by email or phone
  let existingLead = null

  if (leadData.email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', installation.organization_id)
      .eq('email', leadData.email)
      .limit(1)
      .single()
    
    existingLead = data
  }

  if (!existingLead && leadData.phone) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', installation.organization_id)
      .eq('phone', leadData.phone)
      .limit(1)
      .single()
    
    existingLead = data
  }

  if (existingLead) {
    // Update existing lead
    const { data: updated, error } = await supabase
      .from('contacts')
      .update({
        ...leadData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingLead.id)
      .select()
      .single()

    if (error) throw error
    return updated
  }

  // Create new lead
  const { data: newLead, error } = await supabase
    .from('contacts')
    .insert({
      ...leadData,
      pipeline_id: installation.default_pipeline_id,
      stage_id: installation.default_stage_id,
    })
    .select()
    .single()

  if (error) throw error

  // If we have a pipeline, also create a deal
  if (installation.default_pipeline_id && newLead) {
    const dealTitle = `${newLead.first_name || ''} ${newLead.last_name || ''}`.trim() || newLead.email || 'Novo Lead'
    
    await supabase.from('deals').insert({
      organization_id: installation.organization_id,
      title: dealTitle,
      pipeline_id: installation.default_pipeline_id,
      stage_id: installation.default_stage_id,
      contact_id: newLead.id,
      value: 0,
      probability: 10,
    })
  }

  return newLead
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

  if (mode === 'subscribe' && verifyToken === params.token) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ status: 'ok', token: params.token })
}
