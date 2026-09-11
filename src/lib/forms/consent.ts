// =============================================
// Consentimento por canal — decisão e prova
//
// O bloco `legal-consent` do popup deixou de ser um checkbox de e-mail e
// passou a declarar PARA QUAIS canais a pessoa está consentindo
// (props.channels: email | whatsapp | sms). Cada bloco rende um input
// próprio (`consent__<blockId>`), então dois blocos — "quero e-mails" e
// "quero WhatsApp" — são duas decisões independentes.
//
// A decisão vira duas coisas: o estado no contato (o que os guards de envio
// leem) e uma linha em consent_records (o que a LGPD pede: o texto exato
// que a pessoa viu, quando, de onde). A segunda nunca é opcional.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sha256Hex } from './submit-utils'

export type ConsentChannel = 'email' | 'whatsapp' | 'sms'
export type ConsentAction = 'granted' | 'pending' | 'confirmed' | 'denied' | 'revoked'

export const CONSENT_CHANNELS: ConsentChannel[] = ['email', 'whatsapp', 'sms']

export interface ConsentBlock {
  id: string
  text: string
  channels: ConsentChannel[]
  version: string | null
  required: boolean
}

export interface ConsentDecision {
  channel: ConsentChannel
  /** granted | denied. `pending` só nasce quando o canal exige confirmação. */
  checked: boolean
  block: ConsentBlock
}

/** Nome do input que o runtime renderiza para um bloco de consentimento. */
export function consentInputName(blockId: string): string {
  return 'consent__' + String(blockId || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

/** O texto que a pessoa leu, sem HTML e com espaços normalizados. */
export function stripConsentHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashConsentText(text: string): string {
  return sha256Hex(text)
}

function normalizeChannels(raw: unknown): ConsentChannel[] {
  if (!Array.isArray(raw)) return ['email']
  const out = raw
    .map((c) => String(c).toLowerCase())
    .filter((c): c is ConsentChannel => (CONSENT_CHANNELS as string[]).includes(c))
  return out.length > 0 ? Array.from(new Set(out)) : ['email']
}

/** Extrai os blocos de consentimento do design, na ordem em que aparecem. */
export function collectConsentBlocks(designBlocks: any[]): ConsentBlock[] {
  return (designBlocks || [])
    .filter((b) => b && b.type === 'legal-consent')
    .map((b) => {
      const p = b.props || {}
      return {
        id: String(b.id || ''),
        text: stripConsentHtml(p.text),
        channels: normalizeChannels(p.channels),
        version: p.consentVersion ? String(p.consentVersion) : null,
        required: p.required !== false,
      }
    })
}

function isChecked(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false
  const s = String(raw).trim().toLowerCase()
  return s !== '' && s !== 'false' && s !== '0' && s !== 'off'
}

/**
 * Cruza os blocos com as respostas. Um canal citado em dois blocos só
 * conta como concedido se TODOS os blocos que o citam estiverem marcados
 * — a leitura mais conservadora, que é a que a LGPD exige.
 *
 * `answers.consent` (sem sufixo) é o contrato antigo: vale para o primeiro
 * bloco, e só para ele.
 */
export function resolveConsentDecisions(
  blocks: ConsentBlock[],
  answers: Record<string, unknown>,
): ConsentDecision[] {
  const byChannel = new Map<ConsentChannel, ConsentDecision>()
  blocks.forEach((block, index) => {
    const named = answers[consentInputName(block.id)]
    const legacy = index === 0 ? answers.consent : undefined
    const checked = isChecked(named !== undefined ? named : legacy)
    for (const channel of block.channels) {
      const prev = byChannel.get(channel)
      if (!prev) byChannel.set(channel, { channel, checked, block })
      else if (!checked) byChannel.set(channel, { channel, checked: false, block })
    }
  })
  return Array.from(byChannel.values())
}

export interface ConsentContext {
  organizationId: string
  contactId: string | null
  submissionId: string | null
  source: string
  sourceRef: string | null
  pageUrl: string | null
  ipAddress: string | null
  userAgent: string | null
  locale: string | null
}

export interface ConsentRecordInput {
  channel: ConsentChannel
  action: ConsentAction
  text: string | null
  version: string | null
}

/**
 * Grava a prova. Best-effort por contrato: a submissão nunca cai porque o
 * registro falhou — mas a falha é logada com contexto suficiente para
 * alguém correr atrás.
 */
export async function recordConsent(
  supabase: SupabaseClient,
  ctx: ConsentContext,
  records: ConsentRecordInput[],
): Promise<void> {
  if (records.length === 0) return
  const rows = records.map((r) => ({
    organization_id: ctx.organizationId,
    contact_id: ctx.contactId,
    channel: r.channel,
    action: r.action,
    source: ctx.source,
    source_ref: ctx.sourceRef,
    submission_id: ctx.submissionId,
    consent_text: r.text,
    consent_text_hash: r.text ? hashConsentText(r.text) : null,
    consent_version: r.version,
    page_url: ctx.pageUrl,
    ip_address: ctx.ipAddress,
    user_agent: ctx.userAgent,
    locale: ctx.locale,
  }))
  const { error } = await supabase.from('consent_records').insert(rows)
  if (error) {
    console.error('[Consent] consent_records insert failed:', error.message, {
      org: ctx.organizationId,
      contact: ctx.contactId,
      submission: ctx.submissionId,
      channels: records.map((r) => `${r.channel}:${r.action}`),
    })
  }
}

type PhoneChannel = 'whatsapp' | 'sms'

/**
 * Estado de consentimento de WhatsApp/SMS no contato. E-mail tem o seu
 * próprio (writeEmailConsent no submit) porque a coluna acumulou formatos
 * legados; estes dois são booleanos limpos.
 *
 * Nunca rebaixa um consentimento positivo anterior por uma caixa deixada
 * em branco hoje — quem já optou por entrar continua dentro até pedir
 * para sair.
 */
export async function writePhoneChannelConsent(
  supabase: SupabaseClient,
  contactId: string,
  channel: PhoneChannel,
  state: 'granted' | 'denied',
  source: string,
): Promise<void> {
  const consentCol = `${channel}_consent`
  const atCol = `${channel}_consent_at`
  const sourceCol = `${channel}_consent_source`
  const subscribedCol = `is_subscribed_${channel}`

  if (state === 'denied') {
    const { data: cur } = await supabase
      .from('contacts')
      .select(consentCol)
      .eq('id', contactId)
      .maybeSingle()
    if ((cur as any)?.[consentCol] === true) return
    const { error } = await supabase
      .from('contacts')
      .update({ [consentCol]: false, [sourceCol]: `${source}:declined` })
      .eq('id', contactId)
    if (error) console.error(`[Consent] ${channel} denial failed:`, error.message)
    return
  }

  const { error } = await supabase
    .from('contacts')
    .update({
      [consentCol]: true,
      [atCol]: new Date().toISOString(),
      [sourceCol]: source,
      [subscribedCol]: true,
    })
    .eq('id', contactId)
  if (error) console.error(`[Consent] ${channel} grant failed:`, error.message)
}

/** Classe do dispositivo a partir do user-agent, para o contexto da submissão. */
export function deviceClassFromUserAgent(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | null {
  if (!ua) return null
  const s = ua.toLowerCase()
  if (/ipad|tablet|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android|blackberry|opera mini|windows phone/.test(s)) return 'mobile'
  return 'desktop'
}

/** País do visitante, resolvido na borda — nunca por chamada externa. */
export function countryFromHeaders(headers: Pick<Headers, 'get'>): string | null {
  const raw =
    headers.get('x-vercel-ip-country') ||
    headers.get('cf-ipcountry') ||
    headers.get('x-country-code') ||
    ''
  const cc = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : null
}
