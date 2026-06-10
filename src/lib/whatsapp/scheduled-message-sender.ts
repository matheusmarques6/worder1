// =============================================
// P0 — Processador de scheduled_messages.
// Claim por UPDATE condicional pending->processing (idempotente entre
// ticks); envio pelo caminho canônico cloud (whatsapp_business_accounts +
// createWhatsAppCloudClient), com opt-out-guard OBRIGATÓRIO, validação de
// janela 24h (texto livre fora da janela => failed com erro claro;
// template exige APPROVED), persistência em whatsapp_cloud_messages e
// recorrência calculada em TS (calculate_next_occurrence SQL existe só em
// sql/fase3-scheduled-messages.sql — não confiável em prod).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { createWhatsAppCloudClient, normalizePhone } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import { requireOptIn, type TemplateCategory } from '@/lib/whatsapp/opt-out-guard'
import { isTemplateApproved } from '@/lib/whatsapp/template-approval'
import { wlog } from '@/lib/observability/whatsapp-logger'

const BATCH_LIMIT = 25            // mensagens por tick (cron roda a cada minuto)
const STUCK_PROCESSING_MS = 10 * 60 * 1000
const EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000 // pending atrasado > 6h não envia mais
// maxDuration é 60s no Vercel; parar aos 45s deixa as restantes em pending
// para o próximo tick e estreita a janela de double-send pós-envio.
export const TICK_BUDGET_MS = 45_000

// ---------------------------------------------
// Funções puras (testáveis)
// ---------------------------------------------

export function computeNextOccurrence(
  scheduledAt: string,
  recurrence: 'daily' | 'weekly' | 'monthly' | null | undefined,
  recurrenceEndDate: string | null | undefined,
): string | null {
  if (!recurrence) return null
  const d = new Date(scheduledAt)
  if (Number.isNaN(d.getTime())) return null

  const next = new Date(d)
  if (recurrence === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1)
  } else if (recurrence === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7)
  } else if (recurrence === 'monthly') {
    // soma 1 mês com clamp de fim de mês (31 jan -> 28/29 fev)
    const day = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, lastDay))
  } else {
    return null
  }

  if (recurrenceEndDate) {
    // recurrence_end_date é DATE — comparar pela data (UTC)
    const endOfDay = new Date(`${recurrenceEndDate}T23:59:59.999Z`)
    if (next.getTime() > endOfDay.getTime()) return null
  }

  return next.toISOString()
}

export interface ScheduledSendValidation {
  ok: boolean
  errorCode?: 'WINDOW_EXPIRED' | 'TEMPLATE_NOT_APPROVED'
  errorMessage?: string
}

export function validateScheduledSend(input: {
  messageType: string
  conversation: { is_window_open: boolean | null; window_expires_at: string | null } | null
  templateStatus: string | null
}): ScheduledSendValidation {
  if (input.messageType === 'template') {
    if (!isTemplateApproved(input.templateStatus)) {
      return {
        ok: false,
        errorCode: 'TEMPLATE_NOT_APPROVED',
        errorMessage: `Template não aprovado pela Meta (status: ${input.templateStatus ?? 'desconhecido'}).`,
      }
    }
    return { ok: true } // template aprovado abre conversa — janela não importa
  }

  // Conteúdo livre (texto/mídia): Meta rejeita fora da janela de 24h.
  const conv = input.conversation
  const windowExpired =
    !conv ||
    conv.is_window_open === false ||
    (conv.window_expires_at && new Date(conv.window_expires_at).getTime() < Date.now())

  if (windowExpired) {
    return {
      ok: false,
      errorCode: 'WINDOW_EXPIRED',
      errorMessage:
        'Fora da janela de 24h da Meta — mensagem livre seria rejeitada. Reagende usando um template aprovado.',
    }
  }
  return { ok: true }
}

// Códigos permanentes: a série de recorrência deve ser cancelada (falha do negócio).
// Tudo mais (erros transitórios, API Meta, sem conta) é recuperável — pula a
// ocorrência e reagenda.
const PERMANENT_ERROR_CODES = new Set(['OPTED_OUT', 'TEMPLATE_NOT_APPROVED', 'INVALID_TYPE'])

export function isRecoverableFailure(code: string): boolean {
  return !PERMANENT_ERROR_CODES.has(code)
}

// ---------------------------------------------
// Processamento
// ---------------------------------------------

export interface ProcessScheduledResult {
  claimed: number
  sent: number
  failed: number
  rescheduled: number
  expired: number
  recovered: number
}

export async function processDueScheduledMessages(): Promise<ProcessScheduledResult> {
  const result: ProcessScheduledResult = { claimed: 0, sent: 0, failed: 0, rescheduled: 0, expired: 0, recovered: 0 }
  const nowIso = new Date().toISOString()
  // Fix 2: captura o início do tick para evitar duplicados por timeout
  const startedAt = Date.now()

  // 0) Crash recovery: linhas presas em 'processing' há >10min voltam pra pending
  const { data: recovered } = await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: 'pending', updated_at: new Date().toISOString() }) // Fix 3: updated_at explícito
    .eq('status', 'processing')
    .lt('updated_at', new Date(Date.now() - STUCK_PROCESSING_MS).toISOString())
    .select('id')
  result.recovered = recovered?.length || 0

  // 1) Buscar candidatas
  const { data: due, error } = await supabaseAdmin
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(`scheduled_messages fetch failed: ${error.message}`)
  if (!due || due.length === 0) return result

  for (const msg of due) {
    // Fix 2: orçamento de tempo — mensagens restantes ficam em pending para o
    // próximo tick, evitando double-send após timeout do Vercel (maxDuration 60s).
    if (Date.now() - startedAt > TICK_BUDGET_MS) break

    // 2) Claim atômico por linha (cron roda a cada minuto — duas execuções
    //    concorrentes nunca processam a mesma row).
    // Fix 6: select('*') para usar o estado pós-claim (edições da UI) em processOne.
    const { data: claimedRow } = await supabaseAdmin
      .from('scheduled_messages')
      .update({ status: 'processing', updated_at: new Date().toISOString() }) // Fix 3
      .eq('id', msg.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (!claimedRow) continue
    result.claimed++

    try {
      // Fix 6: passar claimedRow (estado pós-claim) em vez de msg (pré-claim)
      const outcome = await processOne(claimedRow)
      result[outcome]++
    } catch (err: any) {
      result.failed++
      await failOrSkip(claimedRow, 'INTERNAL_ERROR', err?.message || 'unknown error')
    }
  }

  return result
}

async function processOne(
  msg: any,
): Promise<'sent' | 'failed' | 'rescheduled' | 'expired'> {
  // Expirado: agendado há horas (acúmulo pré-deploy ou cron parado).
  if (new Date(msg.scheduled_at).getTime() < Date.now() - EXPIRE_AFTER_MS) {
    return await failOrSkip(msg, 'EXPIRED', 'Agendamento expirado (mais de 6h no passado) — não enviado.')
  }

  // 1) Resolver conta de envio: instance_id quando aponta pra uma
  //    whatsapp_business_accounts da org; fallback: primeira conta ativa.
  let account: any = null
  if (msg.instance_id) {
    const { data } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', msg.instance_id)
      .eq('organization_id', msg.organization_id)
      .eq('status', 'active')
      .maybeSingle()
    account = data
  }
  if (!account) {
    const { data } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('organization_id', msg.organization_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    account = data
  }
  if (!account) {
    return await failOrSkip(msg, 'NO_ACCOUNT', 'Nenhuma conta WhatsApp ativa na organização.')
  }

  const phone = normalizePhone(msg.phone_number)

  // 2) Categoria do template (pro bypass transacional do opt-out-guard)
  let tplCategory: TemplateCategory | undefined
  let tplStatus: string | null = null
  let tplLanguage: string = 'pt_BR'
  if (msg.message_type === 'template' && msg.template_name) {
    const { data: tpl } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('category, status, language') // Fix 4: incluir language
      .eq('waba_id', account.id)
      .eq('name', msg.template_name)
      .maybeSingle()
    tplStatus = tpl?.status ?? null
    tplLanguage = tpl?.language || 'pt_BR' // Fix 4: usar language real do template
    const upper = (tpl?.category || '').toUpperCase()
    if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') {
      tplCategory = upper as TemplateCategory
    }
  }

  // 3) Opt-out guard — OBRIGATÓRIO em todo sender novo da branch.
  const optCheck = await requireOptIn(msg.organization_id, phone, tplCategory, {
    sender: 'scheduled-message-sender',
  })
  if (!optCheck.allowed) {
    return await failOrSkip(msg, 'OPTED_OUT', 'Contato optou por não receber mensagens (opt-out).')
  }

  // 4) Janela de 24h + template aprovado
  let conversation: any = null
  {
    const { data } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .select('id, is_window_open, window_expires_at, store_id')
      .eq('waba_id', account.id)
      .eq('wa_id', phone)
      .maybeSingle()
    conversation = data
  }

  const validation = validateScheduledSend({
    messageType: msg.message_type,
    conversation,
    templateStatus: tplStatus,
  })
  if (!validation.ok) {
    return await failOrSkip(msg, validation.errorCode!, validation.errorMessage!)
  }

  // 5) Enviar pelo cliente cloud canônico
  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account),
    wabaId: account.waba_id,
  })

  let sendResult: any
  let messageContent: any = {}
  let textBody = ''
  try {
    switch (msg.message_type) {
      case 'text':
        sendResult = await client.sendText(phone, msg.content)
        messageContent = { text: { body: msg.content } }
        textBody = msg.content
        break
      case 'image':
        sendResult = await client.sendImage(phone, { link: msg.media_url }, msg.content || undefined)
        messageContent = { image: { link: msg.media_url, caption: msg.content } }
        textBody = msg.content || '[Imagem]'
        break
      case 'video':
        sendResult = await client.sendVideo(phone, { link: msg.media_url }, msg.content || undefined)
        messageContent = { video: { link: msg.media_url, caption: msg.content } }
        textBody = msg.content || '[Vídeo]'
        break
      case 'audio':
        sendResult = await client.sendAudio(phone, { link: msg.media_url })
        messageContent = { audio: { link: msg.media_url } }
        textBody = '[Áudio]'
        break
      case 'document':
        sendResult = await client.sendDocument(phone, { link: msg.media_url, filename: msg.media_filename }, msg.content || undefined)
        messageContent = { document: { link: msg.media_url, filename: msg.media_filename } }
        textBody = msg.content || `[Documento: ${msg.media_filename}]`
        break
      case 'template': {
        // template_params (jsonb): array de strings => body parameters
        const components = Array.isArray(msg.template_params) && msg.template_params.length > 0
          ? [{ type: 'body', parameters: msg.template_params.map((v: any) => ({ type: 'text', text: String(v) })) }]
          : undefined
        // Fix 4: usar o language real do template (buscado acima), não hardcoded 'pt_BR'
        sendResult = await client.sendTemplate(phone, msg.template_name, tplLanguage, components)
        messageContent = { template: { name: msg.template_name, language: tplLanguage, components } }
        textBody = `[Template: ${msg.template_name}]`
        break
      }
      default:
        return await failOrSkip(msg, 'INVALID_TYPE', `Tipo de mensagem não suportado: ${msg.message_type}`)
    }
  } catch (apiError: any) {
    const errCode = apiError?.code?.toString() || 'META_API_ERROR'
    const errMsg = apiError?.message || 'Falha no envio'
    wlog.error('whatsapp.scheduled.send_error', {
      scheduled_message_id: msg.id,
      organization_id: msg.organization_id,
      code: errCode,
      error: errMsg,
    })
    return await failOrSkip(msg, errCode, errMsg)
  }

  const metaMessageId = sendResult?.messages?.[0]?.id || null

  // 6) Persistir no histórico da conversa (espelha cloud/messages/route.ts)
  if (conversation?.id && metaMessageId) {
    await supabaseAdmin.from('whatsapp_cloud_messages').upsert({
      organization_id: msg.organization_id,
      store_id: msg.store_id || conversation.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: metaMessageId,
      direction: 'outbound',
      from_number: account.phone_number,
      to_number: phone,
      message_type: msg.message_type,
      content: messageContent,
      text_body: textBody,
      template_name: msg.template_name || null,
      status: 'sent',
      timestamp: new Date().toISOString(),
    }, { onConflict: 'message_id' })

    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: textBody.substring(0, 100),
        last_message_direction: 'outbound',
      })
      .eq('id', conversation.id)
  }

  // 7) Sucesso + recorrência (mesma row: schema tem recurrence_count e
  //    next_occurrence_at na própria linha)
  const next = computeNextOccurrence(msg.scheduled_at, msg.recurrence, msg.recurrence_end_date)
  if (next) {
    await supabaseAdmin
      .from('scheduled_messages')
      .update({
        status: 'pending',
        scheduled_at: next,
        next_occurrence_at: next,
        recurrence_count: (msg.recurrence_count || 0) + 1,
        sent_at: new Date().toISOString(),
        message_id: metaMessageId,
        error_message: null,
        error_code: null,
        updated_at: new Date().toISOString(), // Fix 3
      })
      .eq('id', msg.id)
    wlog.info('whatsapp.scheduled.sent_rescheduled', {
      scheduled_message_id: msg.id, next_occurrence: next,
    })
    return 'rescheduled'
  }

  await supabaseAdmin
    .from('scheduled_messages')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      message_id: metaMessageId,
      error_message: null,
      error_code: null,
      updated_at: new Date().toISOString(), // Fix 3
    })
    .eq('id', msg.id)
  wlog.info('whatsapp.scheduled.sent', { scheduled_message_id: msg.id, meta_message_id: metaMessageId })
  return 'sent'
}

async function markFailed(id: string, code: string, message: string): Promise<void> {
  await supabaseAdmin
    .from('scheduled_messages')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message,
      updated_at: new Date().toISOString(), // Fix 3
    })
    .eq('id', id)
  wlog.warn('whatsapp.scheduled.failed', { scheduled_message_id: id, error_code: code })
}

// Fix 5: Para mensagens COM recorrência e falhas RECUPERÁVEIS, pula a ocorrência
// e reagenda; para falhas PERMANENTES ou sem recorrência, comportamento atual (failed).
async function failOrSkip(
  msg: any,
  code: string,
  message: string,
): Promise<'failed' | 'rescheduled' | 'expired'> {
  const outcome = (code === 'EXPIRED') ? 'expired' : 'failed'

  if (msg.recurrence && isRecoverableFailure(code)) {
    const next = computeNextOccurrence(msg.scheduled_at, msg.recurrence, msg.recurrence_end_date)
    if (next) {
      await supabaseAdmin
        .from('scheduled_messages')
        .update({
          status: 'pending',
          scheduled_at: next,
          next_occurrence_at: next,
          error_code: code,
          error_message: `${message} (ocorrência pulada; reagendado)`,
          updated_at: new Date().toISOString(), // Fix 3
        })
        .eq('id', msg.id)
      wlog.warn('whatsapp.scheduled.occurrence_skipped', {
        scheduled_message_id: msg.id,
        error_code: code,
        next_occurrence: next,
      })
      return 'rescheduled'
    }
  }

  await markFailed(msg.id, code, message)
  return outcome
}
