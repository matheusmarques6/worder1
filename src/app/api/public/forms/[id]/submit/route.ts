// =============================================
// PUBLIC FORM SUBMIT API
// Handles: Lead creation, pipeline entry, ad events
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { META_BASE_URL } from '@/lib/whatsapp/api-version'

export const dynamic = 'force-dynamic'

// Known contact columns (directly writable)
const KNOWN_CONTACT_COLUMNS = new Set([
  'first_name', 'last_name', 'full_name', 'email', 'phone', 'whatsapp',
  'birthday', 'gender', 'company', 'position',
  'city', 'state', 'country', 'zip', 'address',
])

// Helper: Extract contact data from answers based on field mappings
// Supports 2 modes: legacy (crm_form_fields table) + new (design_json blocks with mapTo)
function extractContactData(answers: Record<string, any>, fields: any[], designBlocks: any[] = []) {
  const contactData: Record<string, any> = {}
  const customFields: Record<string, any> = {}

  // ── 1. NEW: Design JSON blocks with mapTo property ──
  for (const block of designBlocks) {
    const p = block?.props || {}
    if (!['email', 'phone', 'name-input', 'text-input', 'date-input'].includes(block.type)) continue

    // Resolve input name (matches the public script)
    const mapTo = p.mapTo === 'custom'
      ? `custom:${p.mapToCustom || p.label || 'field'}`
      : (p.mapTo || (block.type === 'email' ? 'email' : block.type === 'phone' ? 'phone' : block.type === 'name-input' ? 'first_name' : 'field'))

    const value = answers[mapTo]
    if (value === undefined || value === null || value === '') continue

    // Custom field → put in custom_fields
    if (String(mapTo).startsWith('custom:')) {
      customFields[mapTo.slice(7)] = value
      continue
    }

    // full_name → split into first_name + last_name
    if (mapTo === 'full_name') {
      const parts = String(value).trim().split(/\s+/)
      contactData.first_name = parts[0]
      if (parts.length > 1) contactData.last_name = parts.slice(1).join(' ')
      continue
    }

    // Known contact columns
    if (KNOWN_CONTACT_COLUMNS.has(mapTo)) {
      contactData[mapTo] = value
      continue
    }

    // Unknown key → custom_fields
    customFields[mapTo] = value
  }

  // ── 2. LEGACY: crm_form_fields table (still supported) ──
  for (const field of fields) {
    const value = answers[field.id]
    if (value === undefined || value === '') continue

    if (field.map_to_contact_field) {
      const mappedField = field.map_to_contact_field === 'name' ? 'first_name' : field.map_to_contact_field
      if (KNOWN_CONTACT_COLUMNS.has(mappedField) && !contactData[mappedField]) {
        contactData[mappedField] = value
      }
      continue
    }

    if (field.field_type === 'email' && !contactData.email) contactData.email = value
    else if (field.field_type === 'phone' && !contactData.phone) contactData.phone = value

    const label = (field.label || '').toLowerCase()
    if (!contactData.first_name && (label.includes('nome') || label.includes('name'))) {
      const parts = String(value).trim().split(' ')
      contactData.first_name = parts[0] || value
      if (parts.length > 1) contactData.last_name = parts.slice(1).join(' ')
    }
    if (!contactData.email && (label.includes('email') || label.includes('e-mail'))) contactData.email = value
    if (!contactData.phone && (label.includes('telefone') || label.includes('phone') || label.includes('whatsapp') || label.includes('celular'))) contactData.phone = value
    if (!contactData.company && (label.includes('empresa') || label.includes('company'))) contactData.company = value
  }

  // Attach custom fields (if any)
  if (Object.keys(customFields).length > 0) {
    contactData.custom_fields = customFields
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
      `${META_BASE_URL}/${pixelId}/events`,
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
    const ip = getClientIp(request)
    const formId = params.id

    // Impression tracking: lightweight path, no rate-limit, just increments counter
    const rawBody = await request.json().catch(() => ({}))
    if (rawBody && rawBody._track === 'impression') {
      try {
        const sb = getSupabaseClient()
        if (sb) {
          // Bump BOTH impressions_count and views_count. The dashboard
          // card reads views_count; impressions_count is the legacy
          // name kept around for old analytics queries. Without
          // mirroring both, the merchant saw views=0 even after the
          // popup loaded for thousands of visitors.
          const { data: current } = await sb
            .from('crm_forms')
            .select('impressions_count, views_count')
            .eq('id', formId)
            .maybeSingle()
          await sb
            .from('crm_forms')
            .update({
              impressions_count: (current?.impressions_count || 0) + 1,
              views_count: (current?.views_count || 0) + 1,
            })
            .eq('id', formId)
        }
      } catch {}
      const r = NextResponse.json({ ok: true })
      r.headers.set('Access-Control-Allow-Origin', '*')
      return r
    }

    // ---- Rate limit anti-spam ----
    // 10 submissions / minuto por IP/form (já é generoso para usuários legítimos)
    const rl = await checkRateLimit(`form:${formId}:${ip}`, {
      limit: 10,
      windowSec: 60,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde e tente novamente.' },
        { status: 429 }
      )
    }
    // Limite global por IP (caso alguém tente múltiplos forms)
    const rlGlobal = await checkRateLimit(`form:global:${ip}`, {
      limit: 30,
      windowSec: 60,
    })
    if (!rlGlobal.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde e tente novamente.' },
        { status: 429 }
      )
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = rawBody
    const { answers, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = body
    // Identity signals — sent by the popup/form runtime so we can stitch
    // the new contact to the visitor_identities row that was tracking
    // them anonymously before they submitted the form.
    const visitorId = (body as any)?.visitor_id || (body as any)?.visitorId || null
    const sessionId = (body as any)?.session_id || (body as any)?.sessionId || null
    const fingerprintHash = (body as any)?.fingerprint_hash || (body as any)?.fingerprintHash || null

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
    // Collect all blocks from design_json (steps[].blocks[]) to read mapTo
    const designBlocks: any[] = []
    const designJson = form.design_json || {}
    if (Array.isArray(designJson.steps)) {
      for (const step of designJson.steps) {
        if (Array.isArray(step?.blocks)) designBlocks.push(...step.blocks)
      }
    }
    const contactData = extractContactData(answers, form.fields || [], designBlocks)

    // UTM data for contact profile (if behavior.utm.storeOnConsent is true)
    const popupBehavior = (form.behavior as any) || (designJson.behavior as any) || {}
    const storeUtmOnConsent = popupBehavior?.utm?.storeOnConsent === true
    const utmPayload: Record<string, any> = {}
    if (storeUtmOnConsent) {
      if (utm_source) utmPayload.utm_source = utm_source
      if (utm_medium) utmPayload.utm_medium = utm_medium
      if (utm_campaign) utmPayload.utm_campaign = utm_campaign
      if (utm_term) utmPayload.utm_term = utm_term
      if (utm_content) utmPayload.utm_content = utm_content
      if (Object.keys(utmPayload).length > 0) {
        utmPayload.captured_at = new Date().toISOString()
        utmPayload.form_id = formId
      }
    }

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
          const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
          const fields = ['first_name','last_name','phone','whatsapp','birthday','gender','company','position','city','state','country','zip','address']
          for (const f of fields) {
            if (contactData[f] !== undefined) updatePayload[f] = contactData[f]
          }
          if (contactData.custom_fields) {
            updatePayload.custom_fields = contactData.custom_fields
          }
          if (storeUtmOnConsent && Object.keys(utmPayload).length > 0) {
            updatePayload.utm_data = utmPayload
          }
          await supabase.from('contacts').update(updatePayload).eq('id', contactId)
          console.log('[Form Submit] Updated existing contact:', contactId)
        }
      }

      // Se não encontrou, criar novo
      if (!contactId) {
        const insertPayload: Record<string, any> = {
          organization_id: form.organization_id,
          store_id: form.store_id || null,
          first_name: contactData.first_name || contactData.email || contactData.phone || 'Lead',
          last_name: contactData.last_name || null,
          email: contactData.email || null,
          phone: contactData.phone || null,
          whatsapp: contactData.whatsapp || null,
          company: contactData.company || null,
          position: contactData.position || null,
          source: 'form',
        }
        // Optional new contact columns
        const optional = ['birthday', 'gender', 'city', 'state', 'country', 'zip', 'address']
        for (const f of optional) {
          if (contactData[f] !== undefined) insertPayload[f] = contactData[f]
        }
        if (contactData.custom_fields) insertPayload.custom_fields = contactData.custom_fields
        if (storeUtmOnConsent && Object.keys(utmPayload).length > 0) {
          insertPayload.utm_data = utmPayload
        }

        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert(insertPayload)
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

        // Build form responses with labels for display
        const formResponses: Array<{ label: string; value: any; type: string }> = []
        for (const field of (form.fields || [])) {
          const value = answers[field.id]
          if (value !== undefined && value !== '') {
            formResponses.push({
              label: field.label || field.id,
              value: value,
              type: field.field_type || 'text',
            })
          }
        }

        // Detect source tags based on UTM
        const sourceTags: string[] = []
        if (utm_source) {
          const source = utm_source.toLowerCase()
          if (source.includes('facebook') || source.includes('fb') || source.includes('ig') || source.includes('instagram')) {
            sourceTags.push('Ads Facebook')
          } else if (source.includes('google') || source.includes('gads') || source.includes('gclid')) {
            sourceTags.push('Ads Google')
          } else if (source.includes('tiktok')) {
            sourceTags.push('TikTok Ads')
          } else if (source.includes('youtube')) {
            sourceTags.push('YouTube')
          }
        }
        if (utm_medium) {
          const medium = utm_medium.toLowerCase()
          if (medium === 'cpc' || medium === 'ppc' || medium === 'paid') {
            if (!sourceTags.some(t => t.includes('Ads'))) sourceTags.push('Tráfego Pago')
          } else if (medium === 'organic' || medium === 'social') {
            sourceTags.push('Inbound')
          }
        }
        if (sourceTags.length === 0) {
          sourceTags.push('Inbound')
        }

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
            tags: sourceTags,
            custom_fields: {
              source: 'form',
              form_id: formId,
              form_name: form.name || 'Formulário',
              form_responses: formResponses,
              referrer: request.headers.get('referer') || null,
              ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
              user_agent: request.headers.get('user-agent') || null,
              submitted_at: new Date().toISOString(),
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

    // Bump the form's submissions_count + views_count so the /forms
    // dashboard card reflects reality. Fire-and-forget — a failure
    // here mustn't break the submit response. Mirrors the impression
    // tracker above (which also writes both columns).
    supabase
      .from('crm_forms')
      .select('submissions_count, views_count')
      .eq('id', formId)
      .maybeSingle()
      .then(({ data: cur }: any) => {
        supabase
          .from('crm_forms')
          .update({
            submissions_count: ((cur?.submissions_count as number) || 0) + 1,
            // Some merchants land on the popup AND submit before our
            // impression beacon makes it through (Beacon API can drop on
            // slow connections). Guarantee views >= submits by also
            // bumping views_count here.
            views_count: ((cur?.views_count as number) || 0) + 1,
          })
          .eq('id', formId)
          .then(() => {}, () => {})
      }, () => {})

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

    // 8.4. Aplicar audiencia (tags + listId) do formulario no contato
    if (contactId) {
      try {
        const audienceCfg: any = (popupBehavior as any)?.audience || {}
        const audienceTags: string[] = Array.isArray(audienceCfg.tags) ? audienceCfg.tags.filter(Boolean) : (Array.isArray(form.tags) ? form.tags : [])
        const audienceListId: string | null = audienceCfg.listId || form.list_id || null

        if (audienceTags.length > 0) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('tags')
            .eq('id', contactId)
            .maybeSingle()
          const current: string[] = Array.isArray(existing?.tags) ? existing.tags : []
          const merged = Array.from(new Set([...current, ...audienceTags]))
          await supabase.from('contacts').update({ tags: merged }).eq('id', contactId)
        }

        if (audienceListId) {
          // Verify the list belongs to the same org before linking.
          // The form's audience.listId comes from design_json, which is
          // merchant-authored — without this guard, a copy/pasted UUID
          // from another tenant would silently attach contacts to the
          // wrong list (cross-org leak).
          const { data: list } = await supabase
            .from('contact_lists')
            .select('id')
            .eq('id', audienceListId)
            .eq('organization_id', form.organization_id)
            .maybeSingle()
          if (list?.id) {
            // Write to contact_list_members (the v2 membership table).
            // The legacy list_contacts table is empty in prod; old
            // form submits silently wrote there and the contacts
            // never showed up under /contacts/lists/[id]. The
            // contact_list_members trigger maintains total_contacts
            // on the parent row automatically.
            await supabase.from('contact_list_members').upsert({
              list_id: audienceListId,
              contact_id: contactId,
              source: 'form',
            }, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
          } else {
            console.warn('[Form Submit] audience.listId does not belong to this org, skipping:', audienceListId)
          }
        }
      } catch (e: any) {
        console.warn('[Form Submit] audience apply failed:', e?.message)
      }
    }

    // 8.4b. Double opt-in. When audience.doubleOptIn=true the form
    // shouldn't grant marketing consent on submit — that requires a
    // confirmation click from the subscriber's inbox. Flip the
    // contact's email_consent to 'pending' and send a transactional
    // confirmation email with a signed token link. Same shape as
    // Klaviyo's "double opt-in" toggle on subscription forms.
    let doubleOptInSent = false
    if (contactId && contactData.email) {
      try {
        const audienceCfg: any = (popupBehavior as any)?.audience || {}
        if (audienceCfg.doubleOptIn) {
          // Park the contact in 'pending' so the consent guard in
          // automations / campaigns short-circuits until confirmation.
          await supabase
            .from('contacts')
            .update({
              email_consent: 'pending',
              email_consent_source: `popup_form:${form.id}:awaiting_doi`,
            })
            .eq('id', contactId)

          const { signOptInToken } = await import('@/lib/email/optin-token')
          const token = signOptInToken({
            contactId,
            orgId: form.organization_id,
            formId: form.id,
          })
          const { getAppBaseUrl } = await import('@/lib/app-url')
          const baseUrl = getAppBaseUrl()
          const confirmUrl = `${baseUrl}/api/public/confirm-opt-in?token=${encodeURIComponent(token)}`

          const { getEmailProviderForOrg } = await import('@/lib/email/providers')
          const { provider, config } = await getEmailProviderForOrg(form.organization_id)
          const fromEmail = config.defaultFrom || 'onboarding@resend.dev'
          const senderName = config.defaultSenderName || 'Worder'
          const subject = `Confirme sua inscrição`
          const greeting = contactData.first_name ? `Olá ${contactData.first_name},` : 'Olá,'
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="max-width:520px;margin:48px auto;padding:32px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;">
              <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;letter-spacing:-0.02em;">Confirme sua inscrição</h1>
              <p style="font-size:15px;color:#6B7280;line-height:1.5;margin:0 0 24px;">${greeting} obrigado por se inscrever. Para confirmar sua inscrição e começar a receber nossos emails, clique no botão abaixo.</p>
              <a href="${confirmUrl}" style="display:inline-block;background:#F97316;color:#FFFFFF;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;">Confirmar inscrição</a>
              <p style="font-size:12px;color:#9CA3AF;margin:24px 0 0;line-height:1.5;">Se você não pediu para se inscrever, pode ignorar este email. O link expira em 14 dias.</p>
            </div>
          </body></html>`

          try {
            await provider.send({
              to: contactData.email,
              from: fromEmail,
              senderName,
              subject,
              html,
              tags: [
                { name: 'kind', value: 'double_optin' },
                { name: 'form_id', value: form.id },
              ],
            })
            doubleOptInSent = true
          } catch (sendErr: any) {
            console.warn('[Form Submit] doubleOptIn email send failed:', sendErr?.message)
          }
        }
      } catch (e: any) {
        console.warn('[Form Submit] doubleOptIn block failed:', e?.message)
      }
    }

    // 8.4. Identity graph stitching: link contact to visitor_identities
    //      and backfill historic anonymous events under all aliases. This
    //      is the popup → CDP bridge that catches every product view /
    //      cart event the visitor did before identifying themselves.
    if (contactId) {
      try {
        const { resolveIdentity, linkContactToIdentity } = await import('@/lib/identity/resolver')
        const ua = request.headers.get('user-agent') || null
        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
        const identity = await resolveIdentity({
          organizationId: form.organization_id,
          storeId: (form as any).store_id || null,
          clientVisitorId: visitorId,
          fingerprintHash,
          userAgent: ua,
          ip,
          email: contactData.email || answers.email || null,
          phone: contactData.phone || answers.phone || null,
          source: 'form',
        })
        await linkContactToIdentity(identity.identityId, contactId, form.organization_id)
      } catch (e: any) {
        console.warn('[Form Submit] identity graph link failed:', e?.message)
      }
    }

    // 8.5. CDP: gravar evento form_submitted
    if (contactId) {
      try {
        await supabase.from('contact_events').insert({
          organization_id: form.organization_id,
          contact_id: contactId,
          event_type: 'form_submitted',
          event_source: 'worder_form',
          properties: {
            form_id: formId,
            form_name: form.name,
            submission_id: submission?.id,
            utm_source, utm_medium, utm_campaign,
          },
          occurred_at: new Date().toISOString(),
          idempotency_key: `form_submitted:${submission?.id || formId}:${contactId}`,
        })
        await supabase.from('contacts')
          .update({ last_active_at: new Date().toISOString(), last_event_type: 'form_submitted' })
          .eq('id', contactId)
      } catch { /* silent */ }
    }

    // 8.6. Disparar automações com trigger_form_submitted
    try {
      const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher')
      await dispatchTrigger({
        organizationId: form.organization_id,
        // Propagar store_id da popup pra que o trigger dispatcher
        // marque contatos órfãos com a loja correta (era criados com
        // NULL antes, sumindo de views store-scoped).
        storeId: (form as any).store_id || null,
        triggerType: 'trigger_form_submitted',
        contactId: contactId || null,
        dealId: dealId || null,
        triggerData: {
          form_id: formId,
          form_name: form.name,
          submission_id: submission.id,
          answers,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
        },
        matchConfig: (cfg) => {
          // Se automação define form_id específico, filtra
          if (cfg?.form_id && cfg.form_id !== formId) return false
          return true
        },
        idempotencyKey: `form_submit:${submission.id}`,
      })
    } catch (e: any) {
      console.warn('[Form Submit] automation dispatch failed:', e?.message)
    }

    // 8.6b. trigger_popup_subscribed — popup-specific welcome trigger.
    // Klaviyo/Omnisend distinguish between "any form submit" and
    // "subscribed via popup" so merchants can run a welcome flow that
    // ONLY fires for popup signups (and not for the embedded contact
    // form, landing page, etc.). Mirrors the form_submitted dispatch
    // but with a different triggerType the editor can match against.
    const isVisualFormType = ['popup', 'flyout', 'banner', 'fullpage'].includes(form.form_type || 'popup')
    if (isVisualFormType && contactId) {
      try {
        const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher')
        await dispatchTrigger({
          organizationId: form.organization_id,
          storeId: (form as any).store_id || null,
          triggerType: 'trigger_popup_subscribed',
          contactId,
          triggerData: {
            form_id: formId,
            form_name: form.name,
            form_type: form.form_type,
            submission_id: submission.id,
            email: contactData.email || null,
            phone: contactData.phone || null,
            first_name: contactData.first_name || null,
            last_name: contactData.last_name || null,
            answers,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
          },
          matchConfig: (cfg) => {
            // Editor can scope a flow to one specific popup via form_id.
            // Unset = match every popup in the org.
            if (cfg?.form_id && cfg.form_id !== formId) return false
            return true
          },
          // Per-submission so the same lead resubmitting the popup
          // doesn't kick off the welcome flow twice in a row.
          idempotencyKey: `popup_subscribed:${submission.id}`,
        })
      } catch (e: any) {
        console.warn('[Form Submit] popup_subscribed dispatch failed:', e?.message)
      }
    }

    // 8.5. Dynamic Shopify coupon. If the design has a coupon block in
    // `dynamic` mode, generate a unique price_rule + discount_code on
    // the merchant's Shopify so each subscriber gets a single-use code
    // (anti-abuse). Falls back silently to whatever is in block.code on
    // any error so the success step still shows *something*.
    let dynamicCoupon: { code: string; endsAt: string } | null = null
    const allBlocks: any[] = []
    if (Array.isArray(designJson.steps)) {
      for (const step of designJson.steps) {
        if (Array.isArray(step?.blocks)) allBlocks.push(...step.blocks)
      }
    }
    if (Array.isArray(designJson.successStep?.blocks)) {
      allBlocks.push(...designJson.successStep.blocks)
    }
    const dynamicCouponBlock = allBlocks.find(
      (b: any) => b?.type === 'coupon' && b?.props?.mode === 'dynamic'
    )
    if (dynamicCouponBlock && form.store_id) {
      try {
        const { data: store } = await supabase
          .from('shopify_stores')
          .select('shop_domain, access_token')
          .eq('id', form.store_id)
          .maybeSingle()
        if (store?.shop_domain && store?.access_token) {
          const cp = dynamicCouponBlock.props || {}
          const { generateShopifyCoupon } = await import('@/lib/services/whatsapp/shopify-coupon-service')
          const result = await generateShopifyCoupon({
            shopDomain: store.shop_domain,
            accessToken: store.access_token,
            discountType: cp.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage',
            value: Number(cp.discountValue) || 10,
            validityDays: Number(cp.validityDays) || 7,
            prefix: String(cp.codePrefix || 'POPUP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'POPUP',
            usageLimit: 1,
            minimumAmount: cp.minimumAmount > 0 ? Number(cp.minimumAmount) : undefined,
            contactEmail: contactData.email,
            title: `Popup ${form.name || form.id}`,
          })
          if (result.data) {
            dynamicCoupon = { code: result.data.code, endsAt: result.data.endsAt }
          } else {
            console.warn('[Form Submit] dynamic coupon failed (using fallback):', result.error)
          }
        }
      } catch (e: any) {
        console.warn('[Form Submit] dynamic coupon errored (using fallback):', e?.message)
      }
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
      // Dynamic coupon (null when the form is static-only or generation failed).
      // The popup script splices this into any coupon block on the success step.
      coupon: dynamicCoupon,
      // True when a double-opt-in confirmation email was just dispatched.
      // The popup script can swap the success copy to "check your inbox".
      double_optin_sent: doubleOptInSent,
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
