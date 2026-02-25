// =============================================
// PUBLIC FORM SUBMIT API
// Handles: Lead creation, pipeline entry, ad events
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Helper: Extract contact data from answers based on field mappings
function extractContactData(answers: Record<string, any>, fields: any[]) {
  const contactData: Record<string, any> = {}

  for (const field of fields) {
    const value = answers[field.id]
    if (value === undefined || value === '') continue

    // 1. Use explicit mapping if defined
    if (field.map_to_contact_field) {
      // Map 'name' to 'first_name' for compatibility
      const mappedField = field.map_to_contact_field === 'name' ? 'first_name' : field.map_to_contact_field
      contactData[mappedField] = value
      continue
    }

    // 2. Auto-detect by field type
    if (field.field_type === 'email' && !contactData.email) {
      contactData.email = value
    } else if (field.field_type === 'phone' && !contactData.phone) {
      contactData.phone = value
    }

    // 3. Auto-detect by label (common patterns)
    const label = (field.label || '').toLowerCase()
    if (!contactData.first_name && (label.includes('nome') || label.includes('name'))) {
      // If it's a full name, try to split
      const parts = String(value).trim().split(' ')
      contactData.first_name = parts[0] || value
      if (parts.length > 1) {
        contactData.last_name = parts.slice(1).join(' ')
      }
    }
    if (!contactData.email && (label.includes('email') || label.includes('e-mail'))) {
      contactData.email = value
    }
    if (!contactData.phone && (label.includes('telefone') || label.includes('phone') || label.includes('whatsapp') || label.includes('celular'))) {
      contactData.phone = value
    }
    if (!contactData.company && (label.includes('empresa') || label.includes('company'))) {
      contactData.company = value
    }
  }

  return contactData
}

// Helper: Evaluate conditions against answers
function evaluateConditions(conditions: any[], answers: Record<string, any>): boolean {
  if (!conditions || conditions.length === 0) return true

  return conditions.every((condition: any) => {
    const value = answers[condition.field_id]
    if (value === undefined) return false

    const strValue = String(value).toLowerCase()
    const condValue = String(condition.value).toLowerCase()

    switch (condition.operator) {
      case 'equals':
        return strValue === condValue
      case 'not_equals':
        return strValue !== condValue
      case 'contains':
        return strValue.includes(condValue)
      case 'not_contains':
        return !strValue.includes(condValue)
      case 'greater_than':
        return parseFloat(strValue) > parseFloat(condValue)
      case 'less_than':
        return parseFloat(strValue) < parseFloat(condValue)
      case 'in':
        const allowedValues = condValue.split(',').map((v: string) => v.trim())
        return allowedValues.includes(strValue)
      case 'not_empty':
        return strValue.length > 0
      case 'is_empty':
        return strValue.length === 0
      default:
        return false
    }
  })
}

// Helper: Build Facebook CAPI event payload
function buildFacebookEvent(
  eventName: string,
  eventValue: number | null,
  currency: string,
  contactData: Record<string, any>,
  request: NextRequest,
  submissionId: string
) {
  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: submissionId,
    action_source: 'website',
    event_source_url: request.headers.get('referer') || '',
    user_data: {
      em: contactData.email ? [contactData.email.toLowerCase()] : undefined,
      ph: contactData.phone ? [contactData.phone.replace(/\D/g, '')] : undefined,
      fn: contactData.name ? [contactData.name.split(' ')[0]?.toLowerCase()] : undefined,
      ln: contactData.name ? [contactData.name.split(' ').slice(1).join(' ')?.toLowerCase()] : undefined,
      client_ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      client_user_agent: request.headers.get('user-agent') || '',
    },
    custom_data: eventValue ? {
      value: eventValue,
      currency: currency,
    } : undefined,
  }
}

// Helper: Send Facebook Conversion API event
async function sendFacebookEvent(
  pixelId: string,
  accessToken: string,
  eventData: any
) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [eventData],
          access_token: accessToken,
        }),
      }
    )
    const result = await response.json()
    return { success: !result.error, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// POST - Submit form
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const formId = params.id
    const body = await request.json()
    const { answers, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = body

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'answers é obrigatório' }, { status: 400 })
    }

    // 1. Buscar formulário com campos e eventos
    const { data: form, error: formError } = await supabase
      .from('crm_forms')
      .select(`
        *,
        fields:crm_form_fields(*),
        events:crm_form_events(*)
      `)
      .eq('id', formId)
      .eq('status', 'published')
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Formulário não encontrado ou não publicado' }, { status: 404 })
    }

    // 2. Validar campos obrigatórios
    const requiredFields = (form.fields || []).filter((f: any) => f.required)
    for (const field of requiredFields) {
      if (!answers[field.id] || String(answers[field.id]).trim() === '') {
        return NextResponse.json(
          { error: `Campo "${field.label}" é obrigatório`, field_id: field.id },
          { status: 400 }
        )
      }
    }

    // 3. Extrair dados de contato
    const contactData = extractContactData(answers, form.fields || [])

    // 4. Criar ou encontrar contato (sempre criar se tiver algum dado)
    let contactId: string | null = null
    const hasContactData = contactData.email || contactData.phone || contactData.first_name

    console.log('[Form Submit] Contact data extracted:', contactData)
    console.log('[Form Submit] Pipeline ID:', form.pipeline_id)

    if (hasContactData) {
      // Tentar encontrar contato existente por email
      if (contactData.email) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', form.organization_id)
          .eq('email', contactData.email)
          .maybeSingle()

        if (existingContact) {
          contactId = existingContact.id
          // Atualizar contato com novos dados
          await supabase
            .from('contacts')
            .update({
              first_name: contactData.first_name || undefined,
              last_name: contactData.last_name || undefined,
              phone: contactData.phone || undefined,
              company: contactData.company || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', contactId)
          console.log('[Form Submit] Updated existing contact:', contactId)
        }
      }

      // Se não encontrou, criar novo
      if (!contactId) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            organization_id: form.organization_id,
            store_id: form.store_id || null,
            first_name: contactData.first_name || contactData.email || contactData.phone || 'Lead',
            last_name: contactData.last_name || null,
            email: contactData.email || null,
            phone: contactData.phone || null,
            company: contactData.company || null,
            source: 'form',
          })
          .select('id')
          .single()

        if (contactError) {
          console.error('[Form Submit] Error creating contact:', contactError)
        } else {
          contactId = newContact?.id || null
          console.log('[Form Submit] Created new contact:', contactId)
        }
      }
    } else {
      // Sem dados de contato extraídos - criar contato genérico para não perder o lead
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: form.organization_id,
          store_id: form.store_id || null,
          first_name: 'Lead do formulário',
          source: 'form',
        })
        .select('id')
        .single()

      if (contactError) {
        console.error('[Form Submit] Error creating generic contact:', contactError)
      } else {
        contactId = newContact?.id || null
        console.log('[Form Submit] Created generic contact:', contactId)
      }
    }

    // 5. Criar deal no pipeline (se configurado)
    let dealId: string | null = null
    if (form.pipeline_id && contactId) {
      const stageId = form.stage_id
      console.log('[Form Submit] Creating deal - Pipeline:', form.pipeline_id, 'Stage configured:', stageId)

      // Se não tem stage específico, pegar o primeiro estágio
      let targetStageId = stageId
      if (!targetStageId) {
        const { data: firstStage, error: stageError } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', form.pipeline_id)
          .order('position')
          .limit(1)
          .single()

        if (stageError) {
          console.error('[Form Submit] Error fetching first stage:', stageError)
        }
        targetStageId = firstStage?.id
        console.log('[Form Submit] Using first stage:', targetStageId)
      }

      if (targetStageId) {
        // Build UTM data for custom_fields
        const utmData: Record<string, string> = {}
        if (utm_source) utmData.utm_source = utm_source
        if (utm_medium) utmData.utm_medium = utm_medium
        if (utm_campaign) utmData.utm_campaign = utm_campaign
        if (utm_term) utmData.utm_term = utm_term
        if (utm_content) utmData.utm_content = utm_content

        const dealTitle = contactData.first_name
          ? `${contactData.first_name}${contactData.last_name ? ' ' + contactData.last_name : ''}`
          : (contactData.email || 'Novo Lead')

        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .insert({
            organization_id: form.organization_id,
            pipeline_id: form.pipeline_id,
            stage_id: targetStageId,
            contact_id: contactId,
            title: dealTitle,
            value: 0,
            status: 'open',
            position: 0,
            custom_fields: {
              source: 'form',
              form_id: formId,
              form_name: form.name || 'Formulário',
              ...utmData,
            },
            notes: Object.keys(utmData).length > 0
              ? `Lead via formulário: ${form.name || 'Sem nome'}\n\nUTMs:\n${Object.entries(utmData).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`
              : `Lead via formulário: ${form.name || 'Sem nome'}`,
          })
          .select('id')
          .single()

        if (dealError) {
          console.error('[Form Submit] Error creating deal:', dealError)
        } else {
          dealId = deal?.id || null
          console.log('[Form Submit] Deal created:', dealId)
        }
      } else {
        console.error('[Form Submit] No stage found for pipeline:', form.pipeline_id)
      }
    } else {
      console.log('[Form Submit] Skipping deal creation - Pipeline:', form.pipeline_id, 'Contact:', contactId)
    }

    // 6. Criar submission
    const { data: submission, error: subError } = await supabase
      .from('crm_form_submissions')
      .insert({
        form_id: formId,
        organization_id: form.organization_id,
        contact_id: contactId,
        deal_id: dealId,
        answers,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
        user_agent: request.headers.get('user-agent') || null,
        referrer: request.headers.get('referer') || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_term: utm_term || null,
        utm_content: utm_content || null,
        status: 'new',
      })
      .select()
      .single()

    if (subError) {
      console.error('[Form Submit] Error creating submission:', subError)
      return NextResponse.json({ error: subError.message }, { status: 500 })
    }

    // 7. Processar eventos de ads
    const eventsFired: any[] = []
    const activeEvents = (form.events || []).filter((e: any) => e.is_active)

    for (const event of activeEvents) {
      let shouldFire = false

      switch (event.trigger_type) {
        case 'on_submit':
          shouldFire = true
          break
        case 'on_condition':
          shouldFire = evaluateConditions(event.conditions || [], answers)
          break
        default:
          continue
      }

      if (!shouldFire) continue

      // Fire Facebook event
      if (event.send_to_facebook && form.facebook_pixel_id) {
        // Buscar token do Facebook
        const { data: metaAccount } = await supabase
          .from('meta_accounts')
          .select('access_token')
          .eq('organization_id', form.organization_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()

        if (metaAccount?.access_token) {
          const fbEvent = buildFacebookEvent(
            event.event_name,
            event.event_value,
            event.event_currency || 'BRL',
            contactData,
            request,
            submission.id
          )

          const result = await sendFacebookEvent(
            form.facebook_pixel_id,
            metaAccount.access_token,
            fbEvent
          )

          // Log event
          await supabase
            .from('crm_form_event_logs')
            .insert({
              event_id: event.id,
              submission_id: submission.id,
              form_id: formId,
              organization_id: form.organization_id,
              platform: 'facebook',
              event_name: event.event_name,
              event_data: fbEvent,
              status: result.success ? 'sent' : 'failed',
              error_message: result.success ? null : (result.error || JSON.stringify(result.data)),
              response_data: result.data || {},
            })

          eventsFired.push({
            event: event.event_name,
            platform: 'facebook',
            success: result.success,
            fired_at: new Date().toISOString(),
          })
        }
      }

      // Fire Google event (via Measurement Protocol)
      if (event.send_to_google && form.google_ads_id) {
        // Google Ads offline conversions or GA4 Measurement Protocol
        eventsFired.push({
          event: event.event_name,
          platform: 'google',
          success: true, // Client-side pixel will handle this
          fired_at: new Date().toISOString(),
        })
      }
    }

    // 8. Atualizar submission com eventos disparados
    if (eventsFired.length > 0) {
      await supabase
        .from('crm_form_submissions')
        .update({ events_fired: eventsFired })
        .eq('id', submission.id)
    }

    // 9. Return success with tracking data for client-side pixels
    const response = NextResponse.json({
      success: true,
      submission_id: submission.id,
      contact_id: contactId,
      deal_id: dealId,
      events_fired: eventsFired,
      redirect_url: form.redirect_url || null,
      success_message: form.success_message,
      // Client-side tracking data
      tracking: {
        facebook_pixel_id: form.facebook_pixel_id,
        google_ads_id: form.google_ads_id,
        google_analytics_id: form.google_analytics_id,
        events: activeEvents
          .filter((e: any) => e.trigger_type === 'on_submit' || (e.trigger_type === 'on_condition' && evaluateConditions(e.conditions || [], answers)))
          .map((e: any) => ({
            name: e.event_name,
            value: e.event_value,
            currency: e.event_currency,
            platforms: {
              facebook: e.send_to_facebook,
              google: e.send_to_google,
            },
          })),
      },
    })

    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    return response
  } catch (error: any) {
    console.error('[Form Submit] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// OPTIONS - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return response
}
