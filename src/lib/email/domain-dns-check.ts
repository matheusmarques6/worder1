// Verificação de domínio de envio — a lógica única usada pela tela
// (assistente), pelo endpoint /api/email/domains/verify e pelo cron.
//
// Duas fontes, sempre as duas:
//   1. DNS público (Cloudflare DoH): confere registro a registro se o que o
//      lojista colou já está publicado — feedback imediato e independente.
//   2. Resend: quem de fato precisa reconhecer os registros para assinar e
//      enviar. O status por registro e do domínio vêm de lá.
//
// O "verify" do Resend só é disparado quando faz sentido (domínio pendente
// e sem disparo recente) — consultar o status é barato, disparar não.

import { supabaseAdmin } from '@/lib/supabase-admin'

const DOH = 'https://cloudflare-dns.com/dns-query'
const VERIFY_COOLDOWN_MS = 60_000
const lastTrigger = new Map<string, number>()

export interface ResendRecord {
  record?: string        // DKIM | SPF | DMARC …
  name: string           // relativo (resend._domainkey, send, @) ou absoluto
  type: string           // TXT | MX | CNAME
  value: string
  priority?: number | string
  ttl?: string
  status?: string        // not_started | pending | verified | failed (Resend)
}

export interface RecordCheck {
  key: string
  record: string
  type: string
  host: string
  expected: string
  priority: string | null
  /** Status no Resend. */
  resend_status: string
  /** Encontrado no DNS público com o valor esperado. */
  dns_found: boolean
  /** Valores observados no DNS (para mostrar divergência). */
  dns_observed: string[]
  /** Estado consolidado para a tela. */
  state: 'ok' | 'found' | 'missing' | 'mismatch'
}

export interface VerificationResult {
  status: 'pending' | 'verified' | 'failed'
  resend_status: string | null
  records: RecordCheck[]
  dmarc: { found: boolean; value: string | null; policy: string | null }
  dns_records: ResendRecord[]
  tracking_config?: Record<string, any>
  checked_at: string
  resend_error?: string
}

/** Host absoluto de um registro relativo do Resend. */
export function absoluteHost(name: string, domain: string): string {
  const n = (name || '').trim().replace(/\.$/, '')
  if (!n || n === '@') return domain
  if (n === domain || n.endsWith(`.${domain}`)) return n
  return `${n}.${domain}`
}

const clean = (v: string) => String(v || '').trim().replace(/^"|"$/g, '').replace(/"\s+"/g, '').replace(/\.$/, '').toLowerCase()

/** Um registro do Resend está publicado com este valor? */
export function recordMatches(rec: ResendRecord, observed: string[]): boolean {
  const type = String(rec.type || '').toUpperCase()
  const want = clean(rec.value)
  const obs = observed.map(clean)
  if (type === 'MX') {
    // "10 feedback-smtp.us-east-1.amazonses.com." → compara host (e prioridade, se informada)
    return obs.some((o) => {
      const [pri, ...rest] = o.split(/\s+/)
      const host = rest.join(' ') || pri
      return host === want && (rec.priority == null || String(rec.priority) === pri || rest.length === 0)
    })
  }
  if (type === 'CNAME') return obs.some((o) => o === want)
  // TXT: DKIM pode vir dividido em pedaços ("a" "b") — já unidos em clean(); espaços não importam
  const norm = (s: string) => s.replace(/\s+/g, '')
  return obs.some((o) => norm(o) === norm(want) || norm(o).includes(norm(want)))
}

async function doh(name: string, type: 'TXT' | 'MX' | 'CNAME'): Promise<string[]> {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { Accept: 'application/dns-json' }, cache: 'no-store', signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const json: any = await res.json()
    return ((json.Answer || []) as any[]).map((a) => String(a.data || ''))
  } catch {
    return []
  }
}

/** Confere no DNS público cada registro esperado. */
export async function checkRecordsInDns(domain: string, records: ResendRecord[]): Promise<Array<{ found: boolean; observed: string[] }>> {
  return Promise.all(records.map(async (r) => {
    const type = String(r.type || 'TXT').toUpperCase() as 'TXT' | 'MX' | 'CNAME'
    const host = absoluteHost(r.name, domain)
    const observed = await doh(host, ['TXT', 'MX', 'CNAME'].includes(type) ? type : 'TXT')
    return { found: recordMatches(r, observed), observed: observed.map(clean) }
  }))
}

export async function checkDmarc(domain: string): Promise<VerificationResult['dmarc']> {
  const txts = (await doh(`_dmarc.${domain}`, 'TXT')).map(clean)
  const rec = txts.find((t) => t.startsWith('v=dmarc1')) || null
  const policy = rec ? (rec.match(/\bp=([a-z]+)/)?.[1] || null) : null
  return { found: !!rec, value: rec, policy }
}

function mapStatus(raw: string | null | undefined): VerificationResult['status'] {
  const s = String(raw || '').toLowerCase().trim()
  if (s === 'verified' || s === 'active') return 'verified'
  if (s === 'failed' || s === 'temporary_failure') return 'failed'
  return 'pending'
}

/**
 * Executa a verificação de um domínio (linha de email_domains) e grava o
 * resultado. `trigger` pede ao Resend para re-verificar (com cooldown).
 */
export async function verifyEmailDomain(dbDomain: any, opts: { trigger?: boolean } = {}): Promise<VerificationResult> {
  const apiKey = process.env.RESEND_API_KEY
  const domain: string = dbDomain.domain
  let resend: any = null
  let resendError: string | undefined

  if (dbDomain.resend_domain_id && apiKey) {
    const id = dbDomain.resend_domain_id
    const headers = { Authorization: `Bearer ${apiKey}` }
    const canTrigger = opts.trigger && dbDomain.status !== 'verified' && Date.now() - (lastTrigger.get(id) || 0) > VERIFY_COOLDOWN_MS
    try {
      if (canTrigger) {
        lastTrigger.set(id, Date.now())
        await fetch(`https://api.resend.com/domains/${id}/verify`, { method: 'POST', headers, signal: AbortSignal.timeout(10_000) }).catch(() => {})
        await new Promise((r) => setTimeout(r, 1500))
      }
      const res = await fetch(`https://api.resend.com/domains/${id}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      if (res.ok) resend = await res.json()
      else resendError = `Resend respondeu ${res.status}`
    } catch (e: any) {
      resendError = e?.message || 'Resend indisponível'
    }
  } else if (!apiKey) {
    resendError = 'RESEND_API_KEY não configurada'
  }

  const dnsRecords: ResendRecord[] = (resend?.records || resend?.dns || dbDomain.dns_records || []) as ResendRecord[]
  const [dns, dmarc] = await Promise.all([checkRecordsInDns(domain, dnsRecords), checkDmarc(domain)])

  const records: RecordCheck[] = dnsRecords.map((r, i) => {
    const rs = String(r.status || '').toLowerCase()
    const found = dns[i]?.found || false
    const observed = dns[i]?.observed || []
    const state: RecordCheck['state'] = rs === 'verified' ? 'ok' : found ? 'found' : observed.length ? 'mismatch' : 'missing'
    const kind = String(r.record || r.type || '').toUpperCase()
    const type = String(r.type || 'TXT').toUpperCase()
    return {
      key: kind === 'SPF' && type === 'MX' ? 'mx' : kind === 'SPF' ? 'spf' : kind === 'DKIM' ? 'dkim' : `${type.toLowerCase()}-${i}`,
      record: kind, type, host: absoluteHost(r.name, domain), expected: String(r.value || ''), priority: r.priority != null ? String(r.priority) : null,
      resend_status: rs || 'not_started', dns_found: found, dns_observed: observed.slice(0, 3), state,
    }
  })

  // Status do domínio: o do Resend manda. Sem Resend (indisponível), mantém o que temos.
  const status: VerificationResult['status'] = resend ? mapStatus(resend.status) : mapStatus(dbDomain.status)

  const updates: Record<string, any> = { status, dns_records: dnsRecords }
  if (status === 'verified' && !dbDomain.verified_at) updates.verified_at = new Date().toISOString()
  if (resend && (resend.open_tracking !== undefined || resend.click_tracking !== undefined)) {
    updates.tracking_config = { ...(dbDomain.tracking_config || {}), open_tracking: resend.open_tracking ?? false, click_tracking: resend.click_tracking ?? false, tls: resend.tls || 'opportunistic', region: resend.region || 'us-east-1', last_checked_at: new Date().toISOString(), dmarc_found: dmarc.found }
  } else {
    updates.tracking_config = { ...(dbDomain.tracking_config || {}), last_checked_at: new Date().toISOString(), dmarc_found: dmarc.found }
  }
  const { error } = await supabaseAdmin.from('email_domains').update(updates).eq('id', dbDomain.id)
  if (error) {
    // Bancos antigos sem tracking_config: grava o essencial.
    delete updates.tracking_config
    await supabaseAdmin.from('email_domains').update(updates).eq('id', dbDomain.id)
  }

  return { status, resend_status: resend?.status || null, records, dmarc, dns_records: dnsRecords, tracking_config: updates.tracking_config, checked_at: new Date().toISOString(), resend_error: resendError }
}
