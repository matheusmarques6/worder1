// =============================================
// WORDER: Pre-flight campaign quality check
// /src/lib/email/preflight.ts
//
// Runs before a campaign is dispatched. Blocks sends that would likely
// fail deliverability (unverified domain, missing unsubscribe) and
// surfaces warnings for spam triggers and broken merge tags.
// =============================================

import { isValidEmail } from './validation'

export type PreflightIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
}

export type PreflightInput = {
  subject?: string | null
  fromEmail?: string | null
  fromName?: string | null
  html?: string | null
  text?: string | null
  domainVerified?: boolean
  hasUnsubscribeVar?: boolean
}

// Classic spam-trigger words (Mailchimp / SpamAssassin lists — abridged).
// Case-insensitive. Hitting a couple is fine; the warning is informational.
const SPAM_WORDS = [
  '100% free', 'act now', 'amazing', 'bargain', 'best price', 'billion',
  'cash bonus', 'cheap', 'click here', 'congratulations', 'credit card',
  'dear friend', 'double your', 'earn $', 'extra cash', 'fast cash',
  'free access', 'free gift', 'free money', 'free offer', 'free trial',
  'giveaway', 'guarantee', 'income', 'incredible deal', 'limited time',
  'lowest price', 'make money', 'miracle', 'money back', 'no obligation',
  'no purchase', 'no risk', 'offer expires', 'one time', 'only $',
  'order now', 'prize', 'risk free', 'satisfaction', 'save big',
  'save up to', 'special promotion', 'this is not spam', 'urgent',
  'viagra', 'weight loss', 'winner', 'winning', 'you are a winner',
]

const MERGE_TAG_RE = /\{\{\s*([^}]+?)\s*\}\}/g
const KNOWN_MERGE_VARS = new Set([
  'first_name', 'last_name', 'email', 'full_name', 'phone',
  'unsubscribe_url', 'view_in_browser_url', 'organization_name',
  'store_name', 'product_name', 'product_url', 'product_price',
  'discount_code', 'abandoned_cart_url', 'order_id', 'order_total',
])

export function runPreflight(input: PreflightInput): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const subject = (input.subject || '').trim()
  const fromEmail = (input.fromEmail || '').trim()
  const html = input.html || ''
  const text = input.text || ''
  const body = html + '\n' + text

  // 1. Blocking errors
  if (!subject) {
    issues.push({ severity: 'error', code: 'missing_subject', message: 'Assunto é obrigatório.' })
  }
  if (!fromEmail) {
    issues.push({ severity: 'error', code: 'missing_from_email', message: 'E-mail remetente é obrigatório.' })
  } else if (!isValidEmail(fromEmail)) {
    issues.push({ severity: 'error', code: 'invalid_from_email', message: `E-mail remetente inválido: ${fromEmail}.` })
  }
  if (input.domainVerified === false) {
    issues.push({
      severity: 'error',
      code: 'domain_not_verified',
      message: 'Domínio do remetente não está verificado (SPF/DKIM/DMARC). Envios por domínio não-verificado são rejeitados ou caem em spam.',
    })
  }
  if (!html && !text) {
    issues.push({ severity: 'error', code: 'empty_body', message: 'Conteúdo do e-mail está vazio.' })
  }
  // Unsubscribe link (RFC 8058 / CAN-SPAM)
  const hasUnsub =
    input.hasUnsubscribeVar ||
    /\{\{\s*unsubscribe_url\s*\}\}/i.test(body) ||
    /\/unsubscribe/i.test(body) ||
    /list-unsubscribe/i.test(body)
  if (!hasUnsub) {
    issues.push({
      severity: 'error',
      code: 'missing_unsubscribe',
      message: 'E-mail não contém link de descadastro. Envio bloqueado por compliance (CAN-SPAM / LGPD).',
    })
  }

  // 2. Broken merge tags
  const tagMatches = Array.from(body.matchAll(MERGE_TAG_RE))
  const unknownTags = new Set<string>()
  for (const m of tagMatches) {
    const tag = m[1].trim()
    // Strip default filters like {{ first_name|Cliente }}
    const base = tag.split(/\||:/)[0].trim().toLowerCase()
    if (!base) {
      unknownTags.add('<empty>')
      continue
    }
    if (!KNOWN_MERGE_VARS.has(base)) unknownTags.add(tag)
  }
  if (unknownTags.size > 0) {
    issues.push({
      severity: 'warning',
      code: 'unknown_merge_tags',
      message: `Merge tags desconhecidas: ${Array.from(unknownTags).slice(0, 5).join(', ')}. Vão ficar em branco no envio.`,
    })
  }
  // Unbalanced braces (broken template)
  const openCount = (body.match(/\{\{/g) || []).length
  const closeCount = (body.match(/\}\}/g) || []).length
  if (openCount !== closeCount) {
    issues.push({
      severity: 'error',
      code: 'broken_merge_tag',
      message: `Merge tag mal-formada: ${openCount} abertura(s) "{{", ${closeCount} fechamento(s) "}}".`,
    })
  }

  // 3. Spam-word warnings
  const haystack = (subject + ' ' + body).toLowerCase()
  const hits: string[] = []
  for (const w of SPAM_WORDS) {
    if (haystack.includes(w)) hits.push(w)
  }
  if (hits.length >= 3) {
    issues.push({
      severity: 'warning',
      code: 'spam_words',
      message: `Conteúdo contém ${hits.length} termos associados a spam (ex: ${hits.slice(0, 3).join(', ')}). Considere reescrever.`,
    })
  }

  // 4. Subject quality
  if (subject.length > 100) {
    issues.push({
      severity: 'warning',
      code: 'subject_too_long',
      message: `Assunto tem ${subject.length} caracteres. Ideal < 60 para mobile.`,
    })
  }
  if (/!{2,}/.test(subject) || /\?{2,}/.test(subject)) {
    issues.push({
      severity: 'warning',
      code: 'subject_excessive_punctuation',
      message: 'Assunto com pontuação excessiva (!! / ??) aumenta spam score.',
    })
  }
  if (subject && subject === subject.toUpperCase() && subject.length > 10) {
    issues.push({
      severity: 'warning',
      code: 'subject_all_caps',
      message: 'Assunto em CAIXA ALTA aumenta spam score.',
    })
  }

  return issues
}

export function hasBlockingErrors(issues: PreflightIssue[]): boolean {
  return issues.some(i => i.severity === 'error')
}
