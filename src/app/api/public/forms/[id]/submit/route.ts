// =============================================
// PUBLIC FORM SUBMIT API
// Handles: Lead creation, pipeline entry, ad events
// =============================================
import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { checkPopupOrigin } from '@/lib/forms/origin-gate'
import { META_BASE_URL } from '@/lib/whatsapp/api-version'
import { corsJson, corsError, corsPreflight } from '@/lib/forms/public-cors'
import {
  normalizeEmail,
  normalizePhone,
  validateSubmitPayloadCaps,
  buildCapiUserData,
  isVisualPopupForm,
} from '@/lib/forms/submit-utils'
import {
  collectConsentBlocks,
  resolveConsentDecisions,
  recordConsent,
  writePhoneChannelConsent,
  deviceClassFromUserAgent,
  countryFromHeaders,
  type ConsentRecordInput,
} from '@/lib/forms/consent'
import { isValidEmail } from '@/lib/email/validation'
import { trafficTypeOrNull, pageKindOrNull } from '@/lib/popups/targeting'
import { readWhatsAppOptInConfig, startWhatsAppDoubleOptIn } from '@/lib/whatsapp/popup-opt-in'

export const dynamic = 'force-dynamic'

// Known contact columns (directly writable)
const KNOWN_CONTACT_COLUMNS = new Set([
  'first_name', 'last_name', 'full_name', 'email', 'phone', 'whatsapp',
  'birthday', 'gender', 'company', 'position',
  'city', 'state', 'country', 'zip', 'address',
])

// Block types whose answers map into the contact/custom fields.
// Choice blocks (dropdown/radio/checkbox) were missing before — their
// answers never reached the contact. legal-consent is intentionally
// NOT here: it's a consent signal (answers.consent), handled separately.
const INPUT_BLOCK_TYPES = new Set([
  'email', 'phone', 'name-input', 'text-input', 'date-input',
  'dropdown', 'radio', 'checkbox',
])

// Helper: Extract contact data from answers based on field mappings
// Supports 2 modes: legacy (crm_form_fields table) + new (design_json blocks with mapTo)
function extractContactData(answers: Record<string, any>, fields: any[], designBlocks: any[] = []) {
  const contactData: Record<string, any> = {}
  const customFields: Record<string, any> = {}

  // ── 1. NEW: Design JSON blocks with mapTo property ──
  for (const block of designBlocks) {
    const p = block?.props || {}
    if (!INPUT_BLOCK_TYPES.has(block.type)) continue

    // Resolve input name (matches the public script — see script/route.ts
    // renderBlock for email/phone/name/text/date, dropdown, radio, checkbox)
    const typeFallback =
      block.type === 'dropdown' ? 'select'
      : block.type === 'radio' ? 'radio'
      : block.type === 'checkbox' ? 'check'
      : 'field'
    const fallbackName =
      block.type === 'email' ? 'email'
      : block.type === 'phone' ? 'phone'
      : block.type === 'name-input' ? 'first_name'
      : ['dropdown', 'radio', 'checkbox'].includes(block.type) ? (p.label || typeFallback)
      : 'field'
    const mapTo = p.mapTo === 'custom'
      ? `custom:${p.mapToCustom || p.label || typeFallback}`
      : (p.mapTo || fallbackName)

    let value = answers[mapTo]
    if (value === undefined || value === null || value === '') continue
    // Progressive profiling can mark a field as "known" with a boolean
    // true (no value). Never write booleans into contact columns.
    if (typeof value === 'boolean') continue
    // Checkbox groups may arrive as arrays → comma-joined string
    if (Array.isArray(value)) value = value.map((v) => String(v)).join(',')

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

  // Normalize identifiers once, here, so every downstream consumer
  // (lookup, insert, CAPI hashing, identity graph) sees the same value.
  // E-mail lowercase is an invariant of contacts_org_email_unique.
  if (contactData.email !== undefined) {
    contactData.email = normalizeEmail(contactData.email)
    // Drop a malformed address rather than create an un-emailable junk
    // contact that hard-bounces on the first send (a sender-reputation +
    // deliverability hit). Phone / name / custom fields on the same
    // submit are still captured, so a typo'd email doesn't lose the lead.
    if (contactData.email && !isValidEmail(contactData.email)) {
      delete contactData.email
    }
  }
  if (contactData.phone !== undefined) contactData.phone = normalizePhone(contactData.phone)
  if (contactData.whatsapp !== undefined) contactData.whatsapp = normalizePhone(contactData.whatsapp)

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

// Helper: Build Facebook CAPI event payload.
// user_data is SHA-256 hashed per Meta's spec (plaintext em/ph gets the
// event rejected / the pixel flagged): em = lowercased+trimmed e-mail,
// ph = digits only, fn/ln = lowercased first/last name.
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
    user_data: buildCapiUserData(
      {
        email: contactData.email,
        phone: contactData.phone,
        first_name: contactData.first_name,
        last_name: contactData.last_name,
      },
      {
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
      }
    ),
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

// Helper: atomic counter bump on crm_forms via the
// increment_crm_form_counter RPC (2026_07_02 migration). Falls back to
// read-then-write when the RPC hasn't been applied yet, so counters
// keep moving (just without atomicity) on older databases.
async function bumpFormCounters(supabase: any, formId: string, columns: string[]) {
  for (const column of columns) {
    const { error } = await supabase.rpc('increment_crm_form_counter', {
      p_form_id: formId,
      p_column: column,
    })
    if (error) {
      try {
        const { data: cur } = await supabase
          .from('crm_forms')
          .select(column)
          .eq('id', formId)
          .maybeSingle()
        await supabase
          .from('crm_forms')
          .update({ [column]: ((cur as any)?.[column] || 0) + 1 })
          .eq('id', formId)
      } catch { /* counters are best-effort */ }
    }
  }
}

// Helper: write marketing e-mail consent on the contact.
//
// SCHEMA NOTE (email_consent): the repo migration
// 20260330_shopify_graphql_cdp.sql declares contacts.email_consent as
// BOOLEAN, and every other writer (Shopify sync, unsubscribe, bounce
// webhooks, send-batch guard `=== false`) uses booleans. Only the DOI
// popup path wrote strings ('pending'/'subscribed') — on a BOOLEAN
// column those writes fail silently. A comment in preview-allowed
// claims prod is TEXT with a string vocabulary. To be safe on BOTH
// schemas: consent granted writes boolean `true` (PostgREST casts it
// to 'true' on a TEXT column, and every reader accepts true/'true'/
// 'subscribed'); DOI-pending tries the string 'pending' first (only
// representable on TEXT) and falls back to boolean `false` plus an
// `awaiting_doi` source marker on BOOLEAN schemas. All writes are
// error-checked — the old code never was, which is how consent
// silently never landed.
async function writeEmailConsent(
  supabase: any,
  contactId: string,
  state: 'granted' | 'pending' | 'denied',
  source: string
): Promise<void> {
  if (state === 'denied') {
    // Explicit opt-out (legal-consent checkbox left unchecked). Persist a
    // BLOCKING value so the shared send guard (isEmailBlocked) treats the
    // contact as unsendable — NULL would read as "sendable" and the
    // welcome flow would email someone who declined marketing.
    //
    // Never downgrade a prior positive consent: leaving a checkbox
    // unchecked on a LATER popup must not silently unsubscribe someone
    // who opted in earlier. Read current state and bail if already granted.
    const { data: cur } = await supabase
      .from('contacts')
      .select('email_consent')
      .eq('id', contactId)
      .maybeSingle()
    const c = cur?.email_consent
    const curStr = String(c ?? '').toLowerCase()
    const alreadyGranted = c === true || curStr === 'true' || curStr === 'subscribed' || curStr === 'granted'
    if (alreadyGranted) return

    const payload = {
      email_consent: false,
      email_consent_source: `${source}:declined`,
    }
    const { error } = await supabase.from('contacts').update(payload).eq('id', contactId)
    if (error) {
      // TEXT + CHECK vocabulary schema — retry with the string form.
      const { error: retryErr } = await supabase
        .from('contacts')
        .update({ ...payload, email_consent: 'denied' })
        .eq('id', contactId)
      if (retryErr) {
        console.error('[Form Submit] email_consent denial failed:', error.message, '| retry:', retryErr.message)
      }
    }
    return
  }

  if (state === 'granted') {
    const payload = {
      email_consent: true,
      email_consent_at: new Date().toISOString(),
      email_consent_source: source,
    }
    const { error } = await supabase.from('contacts').update(payload).eq('id', contactId)
    if (error) {
      // Exotic schema (e.g. TEXT + CHECK vocabulary) — retry with the
      // legacy string vocabulary before giving up.
      const { error: retryErr } = await supabase
        .from('contacts')
        .update({ ...payload, email_consent: 'subscribed' })
        .eq('id', contactId)
      if (retryErr) {
        console.error('[Form Submit] email_consent grant failed:', error.message, '| retry:', retryErr.message)
      }
    }
    return
  }

  // state === 'pending' (double opt-in awaiting confirmation)
  const { error } = await supabase
    .from('contacts')
    .update({
      email_consent: 'pending',
      email_consent_source: source,
    })
    .eq('id', contactId)
  if (error) {
    const { error: retryErr } = await supabase
      .from('contacts')
      .update({
        email_consent: false,
        email_consent_source: `${source}:awaiting_doi`,
      })
      .eq('id', contactId)
    if (retryErr) {
      console.error('[Form Submit] email_consent pending failed:', error.message, '| retry:', retryErr.message)
    }
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

    const rawBody = await request.json().catch(() => ({}))

    // Impression tracking: lightweight beacon path. Rate-limited on its
    // own bucket (it used to run BEFORE the limiter — free amplification
    // for counter inflation) and incremented atomically via RPC.
    if (rawBody && rawBody._track === 'impression') {
      const rlImp = await checkRateLimit(`form:impression:${formId}:${ip}`, {
        limit: 30,
        windowSec: 60,
      })
      if (!rlImp.allowed) {
        return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited')
      }
      // Caminho antigo: a impressão hoje vai por /events, que confere se o
      // popup está publicado e grava a série. Aqui só se reconhece o beacon
      // — contar aqui de novo dobrava a visualização de qualquer id.
      return corsJson({ ok: true, deprecated: 'use /events' })
    }

    // ---- Rate limit anti-spam ----
    // 10 submissions / minuto por IP/form (já é generoso para usuários legítimos)
    const rl = await checkRateLimit(`form:${formId}:${ip}`, {
      limit: 10,
      windowSec: 60,
    })
    if (!rl.allowed) {
      return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited')
    }
    // Limite global por IP (caso alguém tente múltiplos forms)
    const rlGlobal = await checkRateLimit(`form:global:${ip}`, {
      limit: 30,
      windowSec: 60,
    })
    if (!rlGlobal.allowed) {
      return corsError('Muitas tentativas. Aguarde e tente novamente.', 429, 'rate_limited')
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      return corsError('Database not configured', 503, 'db_unavailable')
    }

    const body = rawBody
    const { answers, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = body
    // Identity signals — sent by the popup/form runtime so we can stitch
    // the new contact to the visitor_identities row that was tracking
    // them anonymously before they submitted the form.
    const visitorId = (body as any)?.visitor_id || (body as any)?.visitorId || null
    const sessionId = (body as any)?.session_id || (body as any)?.sessionId || null
    const fingerprintHash = (body as any)?.fingerprint_hash || (body as any)?.fingerprintHash || null

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return corsError('answers é obrigatório', 400, 'invalid_payload')
    }

    // Payload caps: 50 answer keys máx, 1000 chars por valor, 500 por UTM.
    const capError = validateSubmitPayloadCaps(answers, {
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    })
    if (capError) {
      return corsError(capError, 400, 'payload_too_large')
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
      return corsError('Formulário não encontrado ou não publicado', 404, 'not_found')
    }

    // De onde veio? O id do popup sai no bundle de toda loja; sem esta
    // régua, quem o lesse podia inscrever gente na organização alheia e,
    // pior, drenar o pool de cupons dela (cada e-mail novo reserva um
    // código de verdade na Shopify do lojista).
    const originVerdict = await checkPopupOrigin(supabase, request.headers, form as any, (body as any)?.domain)
    if (!originVerdict.ok) {
      console.warn('[Form Submit] origem recusada', { formId, reason: originVerdict.reason })
      return corsError('Formulário não encontrado ou não publicado', 404, 'not_found')
    }

    // Honeypot: the storefront renders an off-screen _wf_hp field that only
    // bots fill. A non-empty value → drop the submission silently: create
    // no contact, no deal, fire no automation, apply no audience. Return a
    // success shape indistinguishable from a real one so the bot gets no
    // signal to adapt. Placed after the form loads so the fake success can
    // echo the same success_message/redirect the real path would.
    if (typeof (body as any)?._hp === 'string' && (body as any)._hp.trim() !== '') {
      console.warn('[Form Submit] honeypot tripped — dropping bot submission', { formId })
      return corsJson({
        success: true,
        submission_id: null,
        contact_id: null,
        deal_id: null,
        events_fired: [],
        redirect_url: form.redirect_url || null,
        success_message: form.success_message,
        coupon: null,
        double_optin_sent: false,
      })
    }

    const parentDesignJson = form.design_json || {}
    // Experimento A/B: a inscrição pode vir de uma variante. Os blocos,
    // etapas, consentimentos e tags são os da variante; o cupom e os níveis
    // são sempre do popup principal (o estoque de códigos é dele).
    let variantId: string | null = null
    let designJson: any = parentDesignJson
    {
      const raw = String((body as any)?.variant_id || '')
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) && raw !== formId) {
        const { data: variant } = await supabase
          .from('crm_forms')
          .select('id, design_json')
          .eq('id', raw)
          .eq('organization_id', form.organization_id)
          .eq('ab_parent_id', formId)
          .maybeSingle()
        if (variant?.id) {
          variantId = variant.id
          if (variant.design_json && Array.isArray(variant.design_json.steps)) designJson = variant.design_json
        }
      }
    }
    const isVisualForm = isVisualPopupForm(form.form_type, designJson)

    // 2. Validar campos obrigatórios (APENAS formulários clássicos).
    // Popups visuais nunca usam crm_form_fields — a rota de criação
    // semeava name/email/phone required=true para TODO formulário, e as
    // answers de popup são chaveadas por mapTo (não por field.id), então
    // o primeiro campo legado derrubava TODA submissão de popup com 400.
    if (!isVisualForm) {
      const requiredFields = (form.fields || []).filter((f: any) => f.required)
      for (const field of requiredFields) {
        if (!answers[field.id] || String(answers[field.id]).trim() === '') {
          return corsError(`Campo "${field.label}" é obrigatório`, 400, 'missing_required_field', { field_id: field.id })
        }
      }
    }

    // 3. Extrair dados de contato
    // Collect all blocks from design_json (steps[].blocks[]) to read mapTo
    const designBlocks: any[] = []
    if (Array.isArray(designJson.steps)) {
      for (const step of designJson.steps) {
        if (Array.isArray(step?.blocks)) designBlocks.push(...step.blocks)
      }
    }
    const contactData = extractContactData(answers, isVisualForm ? [] : (form.fields || []), designBlocks)

    // Consentimento (LGPD): cada bloco legal-consent declara os canais que
    // cobre e rende um checkbox próprio. A decisão por canal sai daqui; a
    // prova (texto exibido, IP, página) é gravada depois da submissão
    // existir, em consent_records. Um canal sem bloco não tem decisão —
    // e-mail cai no opt-in único de sempre; WhatsApp e SMS exigem bloco.
    const consentBlocks = collectConsentBlocks(designBlocks)
    const consentDecisions = resolveConsentDecisions(consentBlocks, answers)
    const emailDecision = consentDecisions.find((d) => d.channel === 'email')
    const whatsappDecision = consentDecisions.find((d) => d.channel === 'whatsapp')
    const smsDecision = consentDecisions.find((d) => d.channel === 'sms')
    const marketingConsentDenied = !!emailDecision && !emailDecision.checked

    // Contexto da captura — de onde a pessoa veio quando disse sim.
    const requestUserAgent = request.headers.get('user-agent') || null
    const requestIp = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '')
      .split(',')[0].trim() || null
    const pageUrl = typeof (body as any)?.page_url === 'string' && (body as any).page_url.length <= 2048
      ? (body as any).page_url
      : request.headers.get('referer') || null
    const visitorCountry = countryFromHeaders(request.headers)
    const visitorDevice = deviceClassFromUserAgent(requestUserAgent)
    const visitorLocale = (request.headers.get('accept-language') || '').split(',')[0].trim() || null

    // UTM data for contact profile (if behavior.utm.storeOnConsent is true)
    const popupBehavior = (form.behavior as any) || (designJson.behavior as any) || {}
    const audienceCfg: any = (popupBehavior as any)?.audience || {}
    // Padrão da organização (Configurações → Privacidade e LGPD) vale quando
    // o formulário não define a confirmação dupla explicitamente.
    let doubleOptInEnabled = !!audienceCfg.doubleOptIn
    if (audienceCfg.doubleOptIn === undefined || audienceCfg.doubleOptIn === null) {
      try {
        const { data: orgRow } = await supabase.from('organizations').select('settings').eq('id', form.organization_id).maybeSingle()
        doubleOptInEnabled = !!(orgRow?.settings as any)?.privacy?.double_opt_in
      } catch { /* mantém o padrão do formulário */ }
    }
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

    // Só os campos preenchidos — o valor é PII e o log não é lugar de PII.
    console.log('[Form Submit] Contact data extracted:', Object.keys(contactData))
    console.log('[Form Submit] Pipeline ID:', form.pipeline_id)

    // Update an existing contact merging custom_fields (new keys win)
    // and keeping utm_data FIRST-touch: the original utm_data is
    // preserved and the new capture goes under last_utm inside the
    // same JSONB. Replaces the old wholesale JSONB overwrite.
    const applyContactUpdate = async (existing: any): Promise<string> => {
      const id = existing.id as string
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
      const fields = ['first_name','last_name','phone','whatsapp','birthday','gender','company','position','city','state','country','zip','address']
      for (const f of fields) {
        if (contactData[f] !== undefined && contactData[f] !== null) updatePayload[f] = contactData[f]
      }
      if (contactData.custom_fields) {
        const existingCustom = (existing.custom_fields && typeof existing.custom_fields === 'object') ? existing.custom_fields : {}
        updatePayload.custom_fields = { ...existingCustom, ...contactData.custom_fields }
      }
      // Multi-tenant backfill: contacts created before store scoping (or
      // via a channel that didn't set it) carry store_id = NULL and stay
      // invisible to every store-scoped view. Adopt the popup's store —
      // but ONLY when currently unset, so a contact already owned by
      // store A is never yanked into store B by submitting B's popup.
      if (!existing.store_id && form.store_id) updatePayload.store_id = form.store_id
      if (storeUtmOnConsent && Object.keys(utmPayload).length > 0) {
        const existingUtm = (existing.utm_data && typeof existing.utm_data === 'object') ? existing.utm_data : null
        const hasFirstTouch = existingUtm && Object.keys(existingUtm).some((k) => k.startsWith('utm_'))
        if (!hasFirstTouch) {
          // First touch — set it (preserving any non-utm keys already there)
          updatePayload.utm_data = { ...(existingUtm || {}), ...utmPayload }
        } else {
          // Keep first-touch untouched; record this capture as last_utm
          updatePayload.utm_data = { ...existingUtm, last_utm: utmPayload }
        }
      }
      const { error: updErr } = await supabase.from('contacts').update(updatePayload).eq('id', id)
      if (updErr) console.error('[Form Submit] Error updating contact:', updErr)
      else console.log('[Form Submit] Updated existing contact:', id)
      return id
    }

    const CONTACT_SELECT = 'id, custom_fields, utm_data, store_id'

    if (hasContactData) {
      // Configurações → Entregabilidade → "Validar e-mails na entrada":
      // endereços descartáveis/temporários não entram na lista (o lead
      // continua salvo pelo telefone/nome, se houver).
      if (contactData.email) {
        try {
          const { checkEmail, shouldValidateOnEntry } = await import('@/lib/email/email-hygiene')
          if (await shouldValidateOnEntry(form.organization_id) && !checkEmail(contactData.email).ok) {
            console.log('[Form Submit] E-mail rejeitado pela higiene da lista')
            delete contactData.email
          }
        } catch { /* falha aberta */ }
      }
      // Tentar encontrar contato existente por email (já normalizado
      // lowercase em extractContactData — invariante do índice único)
      if (contactData.email) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select(CONTACT_SELECT)
          .eq('organization_id', form.organization_id)
          .eq('email', contactData.email)
          .maybeSingle()

        if (existingContact) {
          contactId = await applyContactUpdate(existingContact)
        }
      }

      // Sem e-mail (ou e-mail que não bateu): o telefone identifica a
      // pessoa. Sem isto cada reenvio só com telefone criava um contato
      // novo — e, com ele, um cupom único novo.
      if (!contactId) {
        const ph = String(contactData.phone || contactData.whatsapp || '').trim()
        if (ph && /^\+?[0-9]{8,20}$/.test(ph)) {
          const { data: byPhone } = await supabase
            .from('contacts')
            .select(CONTACT_SELECT)
            .eq('organization_id', form.organization_id)
            .or(`phone.eq.${ph},whatsapp.eq.${ph}`)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (byPhone) contactId = await applyContactUpdate(byPhone)
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
          // Unique violation on contacts_org_email_unique — a concurrent
          // submit (double-click) created the row between our lookup and
          // this insert. Re-fetch and fall back to the update path so the
          // submission is never dropped. (Plain .upsert can't be used:
          // the unique index is partial (WHERE email IS NOT NULL) and
          // PostgREST's ON CONFLICT inference doesn't carry the index
          // predicate, so onConflict:'organization_id,email' errors.)
          if (contactData.email && (contactError.code === '23505' || /duplicate|unique/i.test(contactError.message || ''))) {
            const { data: raced } = await supabase
              .from('contacts')
              .select(CONTACT_SELECT)
              .eq('organization_id', form.organization_id)
              .eq('email', contactData.email)
              .maybeSingle()
            if (raced) {
              contactId = await applyContactUpdate(raced)
            } else {
              console.error('[Form Submit] Unique violation but re-fetch found nothing:', contactError)
            }
          } else {
            console.error('[Form Submit] Error creating contact:', contactError)
          }
        } else {
          contactId = newContact?.id || null
          console.log('[Form Submit] Created new contact:', contactId)
        }
      }
    } else {
      // Sem email E sem telefone (nem nome): não criar mais o contato
      // fantasma "Lead do formulário" — poluía a base com linhas sem
      // nenhum identificador. A submissão em si continua sendo salva
      // logo abaixo (contact_id = null).
      console.log('[Form Submit] No contact data extracted — skipping placeholder contact')
    }

    // 4.5. Consentimento de e-mail (single opt-in). Antes desta correção
    // NENHUM caminho gravava email_consent no submit — o guard de
    // consentimento das automações via o contato sem consentimento e o
    // welcome flow pulava o nó de e-mail para todo inscrito de popup.
    // DOI (double opt-in) grava 'pending' e só vira true no clique de
    // confirmação (confirm-opt-in). Consentimento negado no bloco
    // legal-consent → não grava nada de marketing.
    if (contactId && contactData.email && !marketingConsentDenied && !doubleOptInEnabled) {
      await writeEmailConsent(supabase, contactId, 'granted', `popup_form:${form.id}`)
    }
    // Consent explicitly declined → persist a blocking state so every send
    // guard downstream (automation email node + campaign send-batch) skips
    // this contact. Without this the row stays NULL = "sendable" and the
    // welcome automation emails someone who opted out.
    if (contactId && contactData.email && marketingConsentDenied) {
      await writeEmailConsent(supabase, contactId, 'denied', `popup_form:${form.id}`)
    }

    // 4.6. WhatsApp e SMS. Antes disto o submit capturava o telefone e não
    // gravava consentimento nenhum: a régua de boas-vindas no WhatsApp
    // partia de um contato sem opt-in — o que a Meta proíbe e a LGPD
    // pune. Só existe decisão quando há bloco cobrindo o canal E um
    // telefone para receber a mensagem.
    const contactPhone = contactData.phone || contactData.whatsapp || null
    // WhatsApp com confirmação: a caixa marcada NÃO vale consentimento — só
    // a resposta ao template. O pedido sai depois da submissão (8.4c), com
    // o id dela na evidência.
    const whatsappOptIn = readWhatsAppOptInConfig(popupBehavior)
    const whatsappDoubleOptIn = !!(whatsappDecision?.checked && contactPhone && whatsappOptIn.doubleOptIn)
    let whatsappOptInSent = false
    // Pedido de confirmação que falhou: o canal fica negado, não pendente.
    let whatsappOptInFailed = false
    let whatsappAlreadyOptedIn = false
    if (contactId && contactPhone) {
      if (whatsappDecision && !whatsappDoubleOptIn) {
        await writePhoneChannelConsent(
          supabase, contactId, 'whatsapp',
          whatsappDecision.checked ? 'granted' : 'denied', `popup_form:${form.id}`,
        )
      }
      if (smsDecision) {
        await writePhoneChannelConsent(
          supabase, contactId, 'sms',
          smsDecision.checked ? 'granted' : 'denied', `popup_form:${form.id}`,
        )
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
    const submissionBase = {
      form_id: formId,
      organization_id: form.organization_id,
      contact_id: contactId,
      deal_id: dealId,
      answers,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      user_agent: requestUserAgent,
      referrer: request.headers.get('referer') || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      status: 'new',
    }
    // Contexto (migration popup_foundation). Se o banco ainda não tiver as
    // colunas, a submissão entra sem elas — perder o contexto é aceitável,
    // perder a inscrição não.
    const submissionContext = {
      visitor_id: typeof visitorId === 'string' && visitorId.length <= 128 ? visitorId : null,
      session_id: typeof sessionId === 'string' && sessionId.length <= 128 ? sessionId : null,
      page_url: pageUrl,
      country: visitorCountry,
      device: visitorDevice,
      // Origem da sessão e tipo de página, como o runtime classificou.
      // Vocabulário fechado: fora dele vira nulo, não texto livre.
      traffic_type: trafficTypeOrNull((body as any)?.traffic_type),
      page_kind: pageKindOrNull((body as any)?.page_kind),
      variant_id: variantId,
      propensity_score: Number.isFinite(Number((body as any)?.propensity_score)) ? Math.max(0, Math.min(100, Math.round(Number((body as any).propensity_score)))) : null,
    }
    let { data: submission, error: subError } = await supabase
      .from('crm_form_submissions')
      .insert({ ...submissionBase, ...submissionContext })
      .select()
      .single()

    if (subError && (subError.code === '42703' || subError.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(subError.message || ''))) {
      console.warn('[Form Submit] submission context columns missing — apply migration 20260910100000_popup_foundation')
      const retry = await supabase.from('crm_form_submissions').insert(submissionBase).select().single()
      submission = retry.data
      subError = retry.error
    }

    if (subError) {
      console.error('[Form Submit] Error creating submission:', subError)
      return corsError('Não foi possível registrar a inscrição. Tente novamente.', 500, 'server_error')
    }

    // 6.1. O evento 'submitted' na série diária. As impressões e os
    // fechamentos chegam pelo beacon do runtime; o envio é gravado aqui,
    // do lado do servidor, porque é o único ponto que sabe que ele
    // aconteceu de verdade.
    await supabase.from('form_events').insert({
      organization_id: form.organization_id,
      form_id: formId,
      event_type: 'submitted',
      properties: {
        submission_id: submission.id,
        contact_id: contactId,
        visitor_id: submissionContext.visitor_id,
        url: pageUrl,
        country: visitorCountry,
        device: visitorDevice,
      },
      occurred_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error && error.code !== '42P01') console.warn('[Form Submit] form_events submitted insert failed:', error.message)
    })

    // 6.2. A prova do consentimento — uma linha por canal decidido, com o
    // texto exato que a pessoa viu. E-mail em DOI entra como 'pending' e
    // vira 'confirmed' em /api/public/confirm-opt-in.
    {
      const proofs: ConsentRecordInput[] = []
      for (const d of consentDecisions) {
        if (d.channel === 'email' && !contactData.email) continue
        if ((d.channel === 'whatsapp' || d.channel === 'sms') && !contactPhone) continue
        const action = !d.checked
          ? 'denied'
          : d.channel === 'email' && doubleOptInEnabled ? 'pending'
          : d.channel === 'whatsapp' && whatsappDoubleOptIn ? 'pending' : 'granted'
        proofs.push({ channel: d.channel, action, text: d.block.text || null, version: d.block.version })
      }
      // Opt-in único de e-mail sem bloco: a prova registra que não houve
      // texto — o que é, em si, a informação que o jurídico precisa.
      if (!emailDecision && contactData.email && !doubleOptInEnabled) {
        proofs.push({ channel: 'email', action: 'granted', text: null, version: null })
      }
      if (!emailDecision && contactData.email && doubleOptInEnabled) {
        proofs.push({ channel: 'email', action: 'pending', text: null, version: null })
      }
      await recordConsent(supabase, {
        organizationId: form.organization_id,
        contactId,
        submissionId: submission.id,
        source: 'popup_form',
        sourceRef: form.id,
        pageUrl,
        ipAddress: requestIp,
        userAgent: requestUserAgent,
        locale: visitorLocale,
      }, proofs)
    }

    // Contador legado do card em /forms. Só submissions_count: views_count
    // já sobe no beacon de impressão — somar aqui de novo contava cada
    // inscrito duas vezes como visualização e derrubava a taxa.
    await bumpFormCounters(supabase, formId, ['submissions_count']).catch(() => {})

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
      const { error: eventsError } = await supabase
        .from('crm_form_submissions')
        .update({ events_fired: eventsFired })
        .eq('id', submission.id)
      if (eventsError) console.error('[Form Submit] eventos disparados não gravados na inscrição', submission.id, eventsError.message)
    }

    // 8.4. Aplicar audiencia (tags + listId) do formulario no contato.
    // Gated on !marketingConsentDenied: adding a contact who unchecked the
    // legal-consent box to a marketing list/tag IS the consent action, so
    // an explicit opt-out must not land them in the audience.
    if (contactId && !marketingConsentDenied) {
      try {
        // Tags do popup + tags das opções escolhidas no quiz (derivadas das
        // respostas contra o design — o cliente não manda tag nenhuma).
        const baseTags: string[] = Array.isArray(audienceCfg.tags) ? audienceCfg.tags.filter(Boolean) : (Array.isArray(form.tags) ? form.tags : [])
        const { tagsFromAnswers } = await import('@/lib/popups/branching')
        const audienceTags: string[] = Array.from(new Set([...baseTags, ...tagsFromAnswers(designBlocks, answers)]))
        const audienceListId: string | null = audienceCfg.listId || form.list_id || null

        if (audienceTags.length > 0) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('tags')
            .eq('id', contactId)
            .maybeSingle()
          const current: string[] = Array.isArray(existing?.tags) ? existing.tags : []
          const merged = Array.from(new Set([...current, ...audienceTags]))
          const { error: tagsError } = await supabase.from('contacts').update({ tags: merged }).eq('id', contactId)
          // Sem as tags, a automação que dispara por tag nunca roda para
          // este inscrito — e a falha não aparece em lugar nenhum.
          if (tagsError) console.error('[Form Submit] tags do popup não aplicadas ao contato:', tagsError.message)
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
            const { error: memberError } = await supabase.from('contact_list_members').upsert({
              list_id: audienceListId,
              contact_id: contactId,
              source: 'form',
            }, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
            // O contato existe, mas fora da lista: invisível para sempre em
            // /contacts/lists. Um erro do PostgREST não vira exceção, então
            // sem esta checagem a falha passaria calada pelo catch abaixo.
            if (memberError) console.error(`[Form Submit] contato não entrou na lista ${audienceListId}:`, memberError.message)
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
    // contact's email_consent to pending and send a transactional
    // confirmation email with a signed token link. Same shape as
    // Klaviyo's "double opt-in" toggle on subscription forms.
    // Skipped entirely when the visitor left the legal-consent
    // checkbox unchecked.
    let doubleOptInSent = false
    if (contactId && contactData.email && doubleOptInEnabled && !marketingConsentDenied) {
      try {
        // Park the contact in 'pending' so the consent guard in
        // automations / campaigns short-circuits until confirmation.
        // (Error-checked + schema-tolerant — see writeEmailConsent.)
        await writeEmailConsent(supabase, contactId, 'pending', `popup_form:${form.id}`)

        const { signOptInToken } = await import('@/lib/email/optin-token')
        const token = signOptInToken({
          contactId,
          orgId: form.organization_id,
          formId: form.id,
        })
        // O link de confirmação sai do mesmo host dos outros links do
        // e-mail. Misturar hosts dentro da mesma mensagem é o que faz o
        // filtro desconfiar — e este é o único link que a pessoa precisa
        // clicar para virar inscrita.
        const { getTrackingBaseUrl } = await import('@/lib/email/tracking-url')
        const baseUrl = await getTrackingBaseUrl(form.organization_id, form.store_id || null)
        const confirmUrl = `${baseUrl}/api/public/confirm-opt-in?token=${encodeURIComponent(token)}`

        // Remetente DA LOJA do formulário — o e-mail de confirmação de um
        // popup da Medicube não pode sair como a loja irmã.
        const { getEmailProviderForOrg } = await import('@/lib/email/providers')
        const { provider, config } = await getEmailProviderForOrg(form.organization_id, (form as any).store_id || null)
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
      } catch (e: any) {
        console.warn('[Form Submit] doubleOptIn block failed:', e?.message)
      }
    }

    // 8.4c. Confirmação de WhatsApp. Linha 'pending' em whatsapp_opt_status
    // (que já bloqueia marketing na guarda de envio) e um template UTILITY
    // aprovado pedindo o "sim". Quem já tinha opt-in não recebe pedido: o
    // consentimento do bloco vale na hora. Falha de envio não derruba a
    // inscrição — fica no whatsapp_sends com o erro.
    if (contactId && contactPhone && whatsappDoubleOptIn) {
      try {
        let storeName: string | null = null
        if ((form as any).store_id) {
          // A coluna é shop_name — 'name' não existe e a consulta falhava em silêncio.
          const { data: st } = await supabase.from('shopify_stores').select('shop_name').eq('id', (form as any).store_id).maybeSingle()
          storeName = (st as any)?.shop_name || null
        }
        const r = await startWhatsAppDoubleOptIn(supabase, {
          organizationId: form.organization_id,
          storeId: (form as any).store_id || null,
          contactId,
          phone: contactPhone,
          formId: form.id,
          formName: form.name || null,
          submissionId: submission.id,
          firstName: contactData.first_name || null,
          storeName,
          config: whatsappOptIn,
        })
        if (r.sent) whatsappOptInSent = true
        else if (r.reason === 'already_opted_in') {
          whatsappAlreadyOptedIn = true
          await writePhoneChannelConsent(supabase, contactId, 'whatsapp', 'granted', `popup_form:${form.id}`)
          // A prova acompanha o desfecho: o 'pending' de cima vira 'granted'.
          const waBlock = consentDecisions.find((d) => d.channel === 'whatsapp')?.block
          await recordConsent(supabase, {
            organizationId: form.organization_id, contactId, submissionId: submission.id,
            source: 'popup_form', sourceRef: form.id, pageUrl, ipAddress: requestIp, userAgent: requestUserAgent, locale: visitorLocale,
          }, [{ channel: 'whatsapp', action: 'granted', text: waBlock?.text || null, version: waBlock?.version || null }])
        } else {
          // Pedido de confirmação não saiu (sem conta, template reprovado,
          // falha de envio). A prova não pode continuar dizendo 'pending':
          // não existe linha em whatsapp_opt_status, então a guarda de
          // envio deixaria marketing passar para quem nunca confirmou.
          console.warn('[Form Submit] whatsapp double opt-in not sent:', r.reason, r.error || '')
          whatsappOptInFailed = true
          const waBlockFail = consentDecisions.find((d) => d.channel === 'whatsapp')?.block
          await recordConsent(supabase, {
            organizationId: form.organization_id, contactId, submissionId: submission.id,
            source: 'popup_form', sourceRef: form.id, pageUrl, ipAddress: requestIp, userAgent: requestUserAgent, locale: visitorLocale,
          }, [{ channel: 'whatsapp', action: 'denied', text: waBlockFail?.text || null, version: waBlockFail?.version || null }])
        }
      } catch (e: any) {
        console.warn('[Form Submit] whatsapp double opt-in failed:', e?.message)
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
          email: contactData.email || normalizeEmail(answers.email) || null,
          phone: contactData.phone || normalizePhone(answers.phone) || null,
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

    // Idempotency scope for automation triggers: per FORM + CONTACT (not
    // per submission id). A per-submission key made every resubmit a
    // "new" event — double-click or returning visitor re-fired the
    // welcome flow. The dispatcher dedups identical keys inside a 24h
    // window; resubmits beyond 24h still re-enroll (frequency_config on
    // the automation governs from there).
    const dispatchContactKey = contactId || contactData.email || submission.id

    // 8.5. Cupom — sempre pelo ledger de incentivos. Nada é criado na
    // Shopify aqui: o pool já tem códigos únicos prontos (cron), e
    // issue_popup_incentive reserva um deles atomicamente. UM grant por
    // pessoa por popup — reenvio devolve o mesmo código. Pool vazio cai no
    // código estático do bloco, e a queda fica registrada no ledger.
    // Código estático também passa pelo ledger: é o que liga o pedido de
    // volta ao popup ("receita por código") mesmo sem código único.
    let issuedCoupon: {
      code: string; kind: string; value: number; ends_at: string | null
      auto_apply: boolean; show_code: boolean; source: string; tier: string
    } | null = null
    // O caminho percorrido (etapas ramificadas) — só ids que existem no
    // design. Decide o tier da recompensa progressiva e fica na submissão.
    const { sanitizeStepPath, effectiveRewardTier, stepsWithAnswers } = await import('@/lib/popups/branching')
    const designSteps = Array.isArray(designJson.steps) ? designJson.steps : []
    const stepPath = sanitizeStepPath((body as any)?.step_path, designSteps)
    // Para o nível de recompensa só vale a etapa cujos campos obrigatórios
    // foram respondidos — mandar o id da etapa do quiz sem responder não
    // desbloqueia nada.
    const earnedPath = stepsWithAnswers(stepPath, designSteps, answers || {})
    let rewardTierKey: string | null = null
    // Tudo que a submissão ganha depois de criada vai num update só, e
    // esperado: na Vercel o que fica pendente depois da resposta pode
    // nunca rodar.
    const submissionPatch: Record<string, any> = {}

    // 8.4d. Jogo (roleta/raspadinha): o prêmio é sorteado AQUI, pelo peso
    // dos segmentos, nunca no navegador. Quem já jogou neste popup recebe
    // o mesmo resultado de novo — reenviar não é uma segunda chance.
    let gameResult: import('@/lib/popups/games').GameResult | null = null
    let gameReplay = false
    try {
      const { readGameBlock, playGame } = await import('@/lib/popups/games')
      const game = readGameBlock(designJson) || readGameBlock(parentDesignJson)
      if (game) {
        if (contactId) {
          const { data: prevRow } = await supabase
            .from('crm_form_submissions')
            .select('game_prize')
            .eq('organization_id', form.organization_id)
            .eq('form_id', formId)
            .eq('contact_id', contactId)
            .neq('id', submission.id)
            .not('game_prize', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const prev: any = prevRow?.game_prize
          const seg = prev && Number.isInteger(prev.segment) ? game.segments[prev.segment] : null
          // O resultado antigo só vale se o segmento ainda é o mesmo; se o
          // lojista mexeu nos prêmios, sorteia de novo.
          if (seg && seg.id === prev.segment_id) {
            gameResult = { type: game.type, segment: prev.segment, segmentId: seg.id, label: seg.label, prize: seg.prize }
            gameReplay = true
          }
        }
        if (!gameResult) gameResult = playGame(game)
        submissionPatch.game_prize = { type: gameResult.type, segment: gameResult.segment, segment_id: gameResult.segmentId, label: gameResult.label, prize: gameResult.prize, replay: gameReplay }
      }
    } catch (e: any) {
      console.warn('[Form Submit] game play errored:', e?.message)
    }

    try {
      const { readCouponBlock, effectiveDiscount } = await import('@/lib/coupons/pool-service')
      const cp = readCouponBlock(parentDesignJson)
      if (cp) {
        // Recompensa progressiva: o último tier cuja etapa foi visitada.
        let tier = effectiveRewardTier(cp.tiers, earnedPath)
        // Smart Offers: a intenção medida na exibição decide a oferta; o
        // servidor só aceita o que a regra produz. "Nenhuma" pula o cupom.
        let offerNone = false
        if (cp.smartOffer.enabled) {
          const { resolveOffer } = await import('@/lib/popups/offers')
          const off = resolveOffer(cp.smartOffer, { intent: (body as any)?.intent, bucket: (body as any)?.offer_bucket, tier: (body as any)?.offer_tier }, cp.tiers.map((t) => t.id))
          submissionPatch.intent = off.intent
          submissionPatch.offer_bucket = off.bucket
          submissionPatch.offer_tier = off.tier
          if (off.tier === 'none') offerNone = true
          else if (off.tier === 'base') tier = null
          else tier = cp.tiers.find((t) => t.id === off.tier) || null
        }
        // Jogo: o segmento sorteado decide o nível — por cima da recompensa
        // progressiva e da oferta por intenção. "Nada" pula o cupom.
        if (gameResult) {
          if (gameResult.prize === 'none') offerNone = true
          else if (gameResult.prize === 'base') { offerNone = false; tier = null }
          else {
            const found = cp.tiers.find((t) => t.id === gameResult!.prize)
            // O jogo pode estar numa variante e o cupom é sempre do pai:
            // um nível que só existe na variante não tem pool nem valor.
            // Cair na oferta base entregaria menos do que a roleta
            // prometeu — melhor não prometer desconto nenhum.
            if (!found) {
              console.warn('[Form Submit] prêmio do jogo aponta para um nível inexistente no cupom', { formId, prize: gameResult.prize })
              offerNone = true
            } else { offerNone = false; tier = found }
          }
        }
        const eff = effectiveDiscount(cp, tier)
        rewardTierKey = eff.tierKey

        let poolId: string | null = null
        if (cp.mode === 'unique' && form.store_id) {
          const { data: pool } = await supabase
            .from('coupon_pools')
            .select('id')
            .eq('organization_id', form.organization_id)
            .eq('form_id', formId)
            .eq('store_id', form.store_id)
            .eq('tier_key', eff.tierKey)
            // 'error' é pool que falhou a última reposição: os códigos já
            // criados continuam válidos e devem sair antes do estático.
            .in('status', ['active', 'error'])
            .maybeSingle()
          poolId = pool?.id || null
          if (!poolId) console.warn('[Form Submit] popup em modo único sem pool ativo — caindo no código estático', { formId, tier: eff.tierKey })
        }
        const base = { kind: eff.kind, value: eff.value, auto_apply: cp.autoApply, show_code: cp.showCode, tier: eff.tierKey }

        if (offerNone) {
          // Intenção alta sem desconto: a inscrição vale, o cupom não sai.
        } else if (contactId) {
          const { data, error } = await supabase.rpc('issue_popup_incentive', {
            p_organization_id: form.organization_id,
            p_store_id: form.store_id || null,
            p_contact_id: contactId,
            p_form_id: formId,
            p_submission_id: submission.id,
            p_kind: eff.kind,
            p_value: eff.value,
            p_validity_days: cp.validityDays,
            p_pool_id: poolId,
            p_static_code: eff.staticCode,
            p_tier_key: eff.tierKey,
          })
          if (error) {
            console.error('[Form Submit] issue_popup_incentive failed:', error.message)
            // Sem ledger não há código único; o estático ainda vale.
            if (eff.staticCode) issuedCoupon = { ...base, code: eff.staticCode, ends_at: null, source: 'static_ledger_error' }
          } else {
            const row: any = Array.isArray(data) ? data[0] : data
            if (row?.coupon_code) {
              issuedCoupon = { ...base, code: row.coupon_code, ends_at: row.validity_until || null, source: row.outcome || 'issued' }
              submissionPatch.coupon_code = row.coupon_code
              submissionPatch.coupon_kind = eff.kind
              submissionPatch.grant_id = row.grant_id || null
            } else if (row?.outcome === 'already_used') {
              console.log('[Form Submit] cupom deste popup já usado por este contato — sem novo código')
            }
          }
        } else if (eff.staticCode) {
          // Sem e-mail nem telefone não há contato, logo não há grant. O
          // código estático aparece mesmo assim — o popup prometeu.
          issuedCoupon = { ...base, code: eff.staticCode, ends_at: null, source: 'static_no_contact' }
        }
      }
    } catch (e: any) {
      console.warn('[Form Submit] coupon issuance errored:', e?.message)
    }

    // 8.7. Automações. Vêm DEPOIS do cupom de propósito: um fluxo de
    // boas-vindas que manda "seu código é {{coupon_code}}" precisa do
    // código já emitido — antes o e-mail saía com o campo vazio.
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
        idempotencyKey: `form_submit:${formId}:${dispatchContactKey}`,
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
    // Gated on !marketingConsentDenied: this trigger's contract is
    // "subscribed via popup". A visitor who left the consent box unchecked
    // did NOT subscribe, so the welcome flow must not fire for them.
    // (trigger_form_submitted above stays ungated on purpose — it drives
    // non-marketing CRM automations too, and the persisted 'denied'
    // consent already blocks any email node inside those flows.)
    //
    // Also deferred when doubleOptInEnabled: the contact is parked at
    // 'pending' here, so the welcome flow's email node would just skip
    // (and never re-run). For DOI popups the welcome trigger fires from
    // /api/public/confirm-opt-in AFTER the subscriber confirms — that's
    // the moment they actually subscribed, and consent is now granted so
    // the email sends. Firing here too would double-enroll them.
    if (isVisualFormType && contactId && !marketingConsentDenied && !doubleOptInEnabled) {
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
            // O que o popup entregou: o fluxo usa no texto da mensagem.
            coupon_code: issuedCoupon?.code || null,
            coupon_kind: issuedCoupon?.kind || null,
            coupon_value: issuedCoupon?.value ?? null,
            coupon_ends_at: issuedCoupon?.ends_at || null,
            reward_tier: rewardTierKey,
            game_prize: gameResult?.label || null,
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
          // Per form+contact so the same lead resubmitting the popup
          // doesn't kick off the welcome flow twice within the
          // dispatcher's 24h dedup window.
          idempotencyKey: `popup_subscribed:${formId}:${dispatchContactKey}`,
        })
      } catch (e: any) {
        console.warn('[Form Submit] popup_subscribed dispatch failed:', e?.message)
      }
    }


    // 8.8. Webhooks de saída (popup.signup / popup.reward) para quem assinou
    // na loja do popup. Sem loja não há assinatura possível. Só enfileira:
    // a entrega tem retry próprio. Falha aqui não derruba a inscrição.
    if (form.store_id) {
      try {
        const { data: storeRow } = await supabase.from('shopify_stores').select('id, shop_domain, shop_name').eq('id', form.store_id).eq('organization_id', form.organization_id).maybeSingle()
        if (storeRow?.shop_domain) {
          const { dispatchToOutbound } = await import('@/lib/webhooks/outbound-dispatcher')
          const storeInfo = { id: String(storeRow.id), shop_domain: String(storeRow.shop_domain), name: String((storeRow as any).shop_name || storeRow.shop_domain) }
          const cleanAnswers: Record<string, any> = {}
          for (const [k, v] of Object.entries(answers || {})) {
            if (k === '_wf_hp' || k === 'consent' || k.startsWith('consent__')) continue
            cleanAnswers[k] = v
          }
          // Mesma leitura por canal que vai na resposta ao runtime.
          const consentOut = {
            email: !contactData.email ? null : marketingConsentDenied ? 'denied' : doubleOptInEnabled ? 'pending' : 'granted',
            whatsapp: !contactPhone || !whatsappDecision ? null : !whatsappDecision.checked ? 'denied' : whatsappOptInFailed ? 'denied' : whatsappDoubleOptIn && !whatsappAlreadyOptedIn ? 'pending' : 'granted',
            sms: !contactPhone || !smsDecision ? null : (smsDecision.checked ? 'granted' : 'denied'),
          }
          await dispatchToOutbound({
            eventType: 'popup.signup',
            organizationId: form.organization_id,
            storeId: form.store_id,
            sourceEventId: submission.id,
            source: 'popup',
            store: storeInfo,
            data: {
              submission_id: submission.id,
              form_id: formId,
              form_name: form.name || null,
              contact_id: contactId,
              email: contactData.email || null,
              phone: contactPhone || null,
              first_name: contactData.first_name || null,
              last_name: contactData.last_name || null,
              answers: cleanAnswers,
              consent: consentOut,
              device: submissionContext.device || null,
              country: submissionContext.country || null,
              page_url: submissionContext.page_url || null,
              traffic_type: submissionContext.traffic_type || null,
              page_kind: submissionContext.page_kind || null,
              variant_id: submissionContext.variant_id || null,
              utm: { source: utm_source || null, medium: utm_medium || null, campaign: utm_campaign || null, term: utm_term || null, content: utm_content || null },
              created_at: new Date().toISOString(),
            },
          })
          if (issuedCoupon) {
            await dispatchToOutbound({
              eventType: 'popup.reward',
              organizationId: form.organization_id,
              storeId: form.store_id,
              sourceEventId: `${submission.id}:reward`,
              source: 'popup',
              store: storeInfo,
              data: {
                submission_id: submission.id,
                form_id: formId,
                form_name: form.name || null,
                contact_id: contactId,
                email: contactData.email || null,
                coupon: { code: issuedCoupon.code, kind: issuedCoupon.kind, value: issuedCoupon.value, ends_at: issuedCoupon.ends_at, tier: issuedCoupon.tier, source: issuedCoupon.source },
                game: gameResult ? { type: gameResult.type, segment: gameResult.segment, label: gameResult.label, prize: gameResult.prize } : null,
                created_at: new Date().toISOString(),
              },
            })
          }
        }
      } catch (e: any) {
        console.warn('[Form Submit] outbound webhook dispatch failed:', e?.message)
      }
    }

    // Código estático (pool vazio, erro do ledger ou visitante sem contato)
    // também é um código entregue: sem isto o analytics contava menos
    // cupons do que o popup realmente mostrou.
    if (issuedCoupon && !submissionPatch.coupon_code) {
      submissionPatch.coupon_code = issuedCoupon.code
      submissionPatch.coupon_kind = issuedCoupon.kind
    }
    if (stepPath.length) submissionPatch.step_path = stepPath
    if (rewardTierKey) submissionPatch.reward_tier = rewardTierKey
    if (Object.keys(submissionPatch).length) {
      const { error: upErr } = await supabase.from('crm_form_submissions').update(submissionPatch).eq('id', submission.id)
      if (upErr && upErr.code !== '42703' && upErr.code !== 'PGRST204') console.warn('[Form Submit] submission patch failed:', upErr.message)
    }

    // 9. Return success with tracking data for client-side pixels
    return corsJson({
      success: true,
      submission_id: submission.id,
      contact_id: contactId,
      deal_id: dealId,
      events_fired: eventsFired,
      redirect_url: form.redirect_url || null,
      success_message: form.success_message,
      // O cupom emitido (null quando não há bloco, ou a pessoa já usou o
      // dela). O runtime encaixa no bloco de cupom da etapa de sucesso e,
      // com auto_apply, grava na sessão do carrinho da Shopify.
      coupon: issuedCoupon,
      // Resultado do jogo (null sem roleta/raspadinha). O runtime só anima
      // até o segmento — o prêmio já está decidido e gravado.
      game: gameResult ? { type: gameResult.type, segment: gameResult.segment, segment_id: gameResult.segmentId, label: gameResult.label, prize: gameResult.prize, replay: gameReplay } : null,
      // True when a double-opt-in confirmation email was just dispatched.
      // The popup script can swap the success copy to "check your inbox".
      double_optin_sent: doubleOptInSent,
      // Pedido de confirmação no WhatsApp saiu? O runtime mostra "responda
      // SIM no WhatsApp" quando o lojista quiser.
      whatsapp_optin_sent: whatsappOptInSent,
      // O que ficou decidido por canal — o runtime expõe no evento
      // worder:signup para o script da loja.
      consent: {
        email: !contactData.email ? null
          : marketingConsentDenied ? 'denied'
          : doubleOptInEnabled ? 'pending' : 'granted',
        whatsapp: !contactPhone || !whatsappDecision ? null
          : !whatsappDecision.checked ? 'denied'
          : whatsappOptInFailed ? 'denied'
          : whatsappDoubleOptIn && !whatsappAlreadyOptedIn ? 'pending' : 'granted',
        sms: !contactPhone || !smsDecision ? null : (smsDecision.checked ? 'granted' : 'denied'),
      },
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
  } catch (error: any) {
    console.error('[Form Submit] Error:', error)
    return corsError(error.message || 'Erro interno', 500, 'server_error')
  }
}

// OPTIONS - CORS preflight
export async function OPTIONS() {
  return corsPreflight()
}
