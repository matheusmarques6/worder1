// =============================================
// Opt-in de WhatsApp pedido por popup, com confirmação (double opt-in).
//
// A Meta só permite mensagem de marketing para quem deu opt-in claro; a
// LGPD pede prova. O fluxo aqui é o da caixa de e-mail, transposto:
//
//   1. submit → a pessoa marcou "quero receber no WhatsApp" e deixou o
//      telefone. Nada de consentimento ainda: a linha em
//      whatsapp_opt_status fica 'pending' e sai UM template aprovado
//      (categoria UTILITY) pedindo a confirmação.
//   2. webhook → a resposta ("SIM" ou o botão de resposta rápida do
//      template) vira 'opted_in', grava whatsapp_consent no contato, a
//      prova em consent_records e dispara trigger_whatsapp_optin — a régua
//      de boas-vindas no WhatsApp começa daí, nunca antes.
//
// 'pending' bloqueia marketing na guarda de envio (requireOptIn), então
// nenhuma campanha ou automação fala com a pessoa antes do "sim".
// =============================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookMessage } from './cloud-api'
import { normalizePhone } from './cloud-api'
import { getAccessToken } from './account-loader'
import { requireOptIn, isStopKeyword } from './opt-out-guard'
import { buildTemplateComponents } from './template-manager'
import { recordConsent, writePhoneChannelConsent } from '@/lib/forms/consent'

export interface WhatsAppOptInConfig {
  doubleOptIn: boolean
  templateName: string | null
  templateLanguage: string
  /** Valores dos {{1}}, {{2}}… do corpo. Aceitam {{first_name}}, {{form_name}}, {{store_name}}. */
  bodyVariables: string[]
}

export function readWhatsAppOptInConfig(behavior: any): WhatsAppOptInConfig {
  const raw = behavior?.whatsapp || {}
  const templateName = typeof raw.templateName === 'string' && raw.templateName.trim() ? raw.templateName.trim() : null
  const bodyVariables = Array.isArray(raw.bodyVariables)
    ? raw.bodyVariables.slice(0, 10).map((v: unknown) => (typeof v === 'string' ? v : '')).map((v: string) => v.slice(0, 200))
    : []
  return {
    doubleOptIn: !!raw.doubleOptIn && !!templateName,
    templateName,
    templateLanguage: typeof raw.templateLanguage === 'string' && raw.templateLanguage.trim() ? raw.templateLanguage.trim() : 'pt_BR',
    bodyVariables,
  }
}

// Respostas que valem como "sim". Match exato depois de tirar acentos e
// pontuação final — "Sim!", "confirmo." e "1" entram; "sim, mas depois"
// não, porque não é uma confirmação inequívoca.
export const CONFIRM_KEYWORDS = ['SIM', 'S', 'CONFIRMAR', 'CONFIRMO', 'CONFIRMADO', 'QUERO', 'ACEITO', 'OK', 'YES', 'Y', '1'] as const

function normalizeReply(text: string | null | undefined): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[.,!?;:]+$/, '')
    .trim()
}

export function isConfirmKeyword(text: string | null | undefined): boolean {
  const n = normalizeReply(text)
  return !!n && (CONFIRM_KEYWORDS as readonly string[]).includes(n)
}

/**
 * A mensagem recebida confirma o opt-in? Botão de resposta rápida (o payload
 * ou o título com a palavra), botão interativo, ou texto com a palavra.
 */
export function inboundConfirms(message: Pick<WebhookMessage, 'type' | 'button' | 'interactive'>, textBody: string | null | undefined): 'button' | 'keyword' | null {
  if (message.type === 'button' && message.button) {
    const payload = normalizeReply(message.button.payload)
    if (isConfirmKeyword(message.button.text) || isConfirmKeyword(payload) || /^(CONFIRM|OPTIN|OPT_IN|SUBSCRIBE)/.test(payload)) return 'button'
    return null
  }
  if (message.type === 'interactive' && message.interactive?.button_reply) {
    const br = message.interactive.button_reply
    const id = normalizeReply(br.id)
    if (isConfirmKeyword(br.title) || isConfirmKeyword(id) || /^(CONFIRM|OPTIN|OPT_IN|SUBSCRIBE)/.test(id)) return 'button'
    return null
  }
  return isConfirmKeyword(textBody) ? 'keyword' : null
}

export function renderVariable(value: string, ctx: { first_name?: string | null; form_name?: string | null; store_name?: string | null }): string {
  return value.replace(/\{\{\s*(first_name|form_name|store_name)\s*\}\}/g, (_, k: string) => String((ctx as any)[k] || '').trim())
}

export interface SenderAccount {
  id: string
  organization_id: string
  store_id: string | null
  phone_number_id: string
  waba_id: string | null
  phone_number: string | null
  access_token?: string | null
  access_token_encrypted?: string | null
}

/** A conta de WhatsApp da loja do popup; sem loja, a primeira ativa da org. */
export async function pickSenderAccount(admin: SupabaseClient, orgId: string, storeId: string | null): Promise<SenderAccount | null> {
  const { data } = await admin
    .from('whatsapp_business_accounts')
    .select('id, organization_id, store_id, phone_number_id, waba_id, phone_number, access_token, access_token_encrypted, status')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(10)
  const rows = (data || []) as any[]
  if (!rows.length) return null
  const own = storeId ? rows.find((r) => r.store_id === storeId) : null
  return (own || rows.find((r) => !r.store_id) || rows[0]) as SenderAccount
}

export interface StartDoubleOptInParams {
  organizationId: string
  storeId: string | null
  contactId: string
  phone: string
  formId: string
  formName: string | null
  submissionId: string | null
  firstName?: string | null
  storeName?: string | null
  config: WhatsAppOptInConfig
}

export type StartDoubleOptInResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: 'already_opted_in' | 'no_account' | 'template_not_found' | 'blocked_by_category' | 'send_failed' | 'disabled'; error?: string }

export interface SendDeps {
  sendTemplate: (account: SenderAccount, to: string, name: string, language: string, components: any[]) => Promise<{ messageId: string | null }>
}

async function defaultSendTemplate(account: SenderAccount, to: string, name: string, language: string, components: any[]) {
  const { createWhatsAppCloudClient } = await import('./cloud-api')
  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account as any),
    wabaId: account.waba_id || undefined,
  })
  const r = await client.sendTemplate(to, name, language, components)
  return { messageId: r?.messages?.[0]?.id || null }
}

/**
 * Deixa a pessoa em 'pending' e manda o template de confirmação. Quem já
 * era opted_in não recebe pedido nenhum — o chamador grava o consentimento
 * direto. Quem estava opted_out e voltou a marcar a caixa recebe o pedido
 * (UTILITY passa pela guarda), e só vira opted_in respondendo.
 */
export async function startWhatsAppDoubleOptIn(
  admin: SupabaseClient,
  p: StartDoubleOptInParams,
  deps: SendDeps = { sendTemplate: defaultSendTemplate },
): Promise<StartDoubleOptInResult> {
  if (!p.config.doubleOptIn || !p.config.templateName) return { sent: false, reason: 'disabled' }
  const phone = normalizePhone(p.phone)

  const { data: existing } = await admin
    .from('whatsapp_opt_status')
    .select('id, status')
    .eq('organization_id', p.organizationId)
    .eq('phone', phone)
    .maybeSingle()
  if (existing?.status === 'opted_in') return { sent: false, reason: 'already_opted_in' }

  const evidence = {
    kind: 'popup_double_optin',
    form_id: p.formId,
    form_name: p.formName,
    submission_id: p.submissionId,
    requested_at: new Date().toISOString(),
    template: p.config.templateName,
  }
  // 'form_optin' é o valor que o CHECK de opt_in_source aceita; o popup
  // fica identificado na evidência.
  const { error: upErr } = await admin.from('whatsapp_opt_status').upsert(
    {
      organization_id: p.organizationId,
      contact_id: p.contactId,
      phone,
      status: 'pending',
      opt_in_source: 'form_optin',
      consent_evidence: evidence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,phone' },
  )
  if (upErr) console.warn('[WhatsApp DOI] opt_status upsert failed:', upErr.message)

  const account = await pickSenderAccount(admin, p.organizationId, p.storeId)
  if (!account) return { sent: false, reason: 'no_account' }

  const { data: tpl } = await admin
    .from('whatsapp_templates')
    .select('name, language, category, status, body_variables')
    .eq('organization_id', p.organizationId)
    .eq('name', p.config.templateName)
    .limit(1)
    .maybeSingle()
  if (!tpl) return { sent: false, reason: 'template_not_found' }

  const category = String(tpl.category || '').toUpperCase() as any
  // Pendente + MARKETING é exatamente o que a guarda bloqueia: o pedido de
  // confirmação tem de ser UTILITY. Aqui a regra aparece para o lojista.
  const gate = await requireOptIn(p.organizationId, phone, category === 'MARKETING' || category === 'UTILITY' || category === 'AUTHENTICATION' ? category : undefined, { sender: 'popup.double_optin' })
  if (!gate.allowed) return { sent: false, reason: 'blocked_by_category' }

  const ctx = { first_name: p.firstName || null, form_name: p.formName, store_name: p.storeName || null }
  const varsMap: Record<string, string> = {}
  const needed = Math.max(Number(tpl.body_variables || 0), 0)
  for (let i = 0; i < Math.max(needed, p.config.bodyVariables.length); i++) {
    varsMap[String(i + 1)] = renderVariable(p.config.bodyVariables[i] || '', ctx) || (i === 0 ? (p.firstName || 'cliente') : '-')
  }
  const components = buildTemplateComponents(varsMap)
  const language = (tpl.language as string) || p.config.templateLanguage

  const sendRow = {
    organization_id: p.organizationId,
    contact_id: p.contactId,
    phone_number: phone,
    template_name: tpl.name,
    template_params: varsMap,
    store_id: p.storeId,
    metadata: { kind: 'popup_double_optin', form_id: p.formId, submission_id: p.submissionId },
  }
  try {
    const r = await deps.sendTemplate(account, phone, tpl.name as string, language, components)
    await admin.from('whatsapp_sends').insert({ ...sendRow, status: 'sent', sent_at: new Date().toISOString(), external_message_id: r.messageId })
    return { sent: true, messageId: r.messageId }
  } catch (e: any) {
    await admin.from('whatsapp_sends').insert({ ...sendRow, status: 'failed', failed_at: new Date().toISOString(), error_message: String(e?.message || e).slice(0, 500) })
    return { sent: false, reason: 'send_failed', error: e?.message }
  }
}

export interface ConfirmParams {
  organizationId: string
  storeId: string | null
  phone: string
  message: Pick<WebhookMessage, 'id' | 'type' | 'button' | 'interactive'>
  textBody: string | null | undefined
  crmContactId?: string | null
  ipAddress?: string | null
}

export type ConfirmResult =
  | { outcome: 'confirmed'; contactId: string | null; via: 'button' | 'keyword' }
  | { outcome: 'opted_out' }
  | { outcome: 'ignored'; reason: 'no_pending' | 'not_a_confirmation' }

/**
 * Chamado para TODA mensagem recebida. Só faz algo quando há um pedido
 * pendente para esse telefone nesta org; qualquer outra conversa passa
 * reto. Nunca lança — o ingest do webhook não pode cair por isto.
 */
export async function confirmWhatsAppOptInFromInbound(admin: SupabaseClient, p: ConfirmParams): Promise<ConfirmResult> {
  const phone = normalizePhone(p.phone)
  const { data: row } = await admin
    .from('whatsapp_opt_status')
    .select('id, status, contact_id, consent_evidence')
    .eq('organization_id', p.organizationId)
    .eq('phone', phone)
    .maybeSingle()
  if (!row || row.status !== 'pending') return { outcome: 'ignored', reason: 'no_pending' }

  const evidence = (row.consent_evidence && typeof row.consent_evidence === 'object' ? row.consent_evidence : {}) as Record<string, any>
  const formId: string | null = evidence.form_id || null
  const now = new Date().toISOString()

  if (isStopKeyword(p.textBody)) {
    await admin
      .from('whatsapp_opt_status')
      .update({ status: 'opted_out', opted_out_at: now, opt_out_reason: 'keyword', updated_at: now, consent_evidence: { ...evidence, declined_at: now, reply_text: String(p.textBody || '').slice(0, 200) } })
      .eq('id', row.id)
    return { outcome: 'opted_out' }
  }

  const via = inboundConfirms(p.message, p.textBody)
  if (!via) return { outcome: 'ignored', reason: 'not_a_confirmation' }

  const replyText = p.message.type === 'button' ? p.message.button?.text : p.message.type === 'interactive' ? p.message.interactive?.button_reply?.title : p.textBody
  const { error: upErr } = await admin
    .from('whatsapp_opt_status')
    .update({
      status: 'opted_in',
      opted_in_at: now,
      opted_out_at: null,
      opt_out_reason: null,
      updated_at: now,
      consent_evidence: { ...evidence, confirmed_at: now, confirmed_via: via, message_id: p.message.id, reply_text: String(replyText || '').slice(0, 200) },
    })
    .eq('id', row.id)
    .eq('status', 'pending')
  if (upErr) throw new Error(upErr.message)

  const contactId: string | null = (row.contact_id as string) || p.crmContactId || null
  if (contactId) {
    await writePhoneChannelConsent(admin, contactId, 'whatsapp', 'granted', `popup_form:${formId || 'unknown'}:double_optin`)
    await recordConsent(
      admin,
      {
        organizationId: p.organizationId,
        contactId,
        submissionId: evidence.submission_id || null,
        source: 'double_opt_in',
        sourceRef: formId,
        pageUrl: null,
        ipAddress: p.ipAddress || null,
        userAgent: 'whatsapp:inbound',
        locale: null,
      },
      [{ channel: 'whatsapp', action: 'confirmed', text: String(replyText || '').slice(0, 200) || null, version: null }],
    )

    try {
      const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher')
      await dispatchTrigger({
        organizationId: p.organizationId,
        storeId: p.storeId,
        triggerType: 'trigger_whatsapp_optin',
        contactId,
        triggerData: {
          form_id: formId,
          form_name: evidence.form_name || null,
          submission_id: evidence.submission_id || null,
          phone,
          channel: 'whatsapp',
          confirmed_via: via,
        },
        matchConfig: (cfg) => !cfg?.form_id || cfg.form_id === formId,
        idempotencyKey: `whatsapp_optin:${formId || 'any'}:${contactId}`,
      })
    } catch (e: any) {
      console.warn('[WhatsApp DOI] trigger dispatch failed:', e?.message)
    }
  }

  // Fecha o ciclo no registro do envio, para o relatório saber que o pedido
  // foi respondido.
  await admin
    .from('whatsapp_sends')
    .update({ status: 'replied', replied_at: now })
    .eq('organization_id', p.organizationId)
    .eq('phone_number', phone)
    .eq('status', 'sent')
    .contains('metadata', { kind: 'popup_double_optin' })

  return { outcome: 'confirmed', contactId, via }
}
