// =============================================
// GET /api/deliverability/domain-check?domain=acme.com
//
// Klaviyo/Omnisend-style deliverability checker. Pulls the
// authoritative DNS records for the sender domain and tells the
// merchant — in plain language — whether SPF / DKIM / DMARC are
// correctly published. This is the "Why are my emails going to
// spam?" page they ask for on every churn call.
//
// All lookups go through Cloudflare DNS-over-HTTPS (1.1.1.1) so
// the route runs anywhere Vercel can fetch HTTPS. No node-dns
// binding required.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

interface DnsAnswer { name: string; type: number; TTL: number; data: string }
interface DohResponse { Status: number; Answer?: DnsAnswer[] }

const CLOUDFLARE_DOH = 'https://cloudflare-dns.com/dns-query'

async function dnsTxt(name: string): Promise<string[]> {
  try {
    const res = await fetch(`${CLOUDFLARE_DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { Accept: 'application/dns-json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = (await res.json()) as DohResponse
    return (json.Answer || []).map((a) => a.data.replace(/^"|"$/g, '').replace(/" "/g, ''))
  } catch {
    return []
  }
}

async function dnsCname(name: string): Promise<string[]> {
  try {
    const res = await fetch(`${CLOUDFLARE_DOH}?name=${encodeURIComponent(name)}&type=CNAME`, {
      headers: { Accept: 'application/dns-json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = (await res.json()) as DohResponse
    return (json.Answer || []).map((a) => a.data.replace(/\.$/, ''))
  } catch {
    return []
  }
}

interface CheckResult {
  ok: boolean
  state: 'pass' | 'warn' | 'fail' | 'missing'
  value?: string
  message: string
  recommendation?: string
}

async function checkSpf(domain: string): Promise<CheckResult> {
  const records = await dnsTxt(domain)
  const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'))
  if (!spf) {
    return {
      ok: false,
      state: 'missing',
      message: 'Nenhum registro SPF encontrado',
      recommendation: 'Adicione um TXT no DNS: v=spf1 include:_spf.resend.com -all (ou similar do seu provedor)',
    }
  }
  // Resend / Mailgun / Sendgrid / Worder default = encontra o include
  const recognized = /include:_spf\.(resend\.com|mailgun\.org|sendgrid\.net|mtasv\.net|sparkpostmail\.com)/i.test(spf)
  if (!recognized) {
    return {
      ok: true,
      state: 'warn',
      value: spf,
      message: 'SPF encontrado, mas sem include conhecido do provedor de envio',
      recommendation: 'Confirme se o seu ESP (Resend, Mailgun, etc.) está incluído no SPF',
    }
  }
  return { ok: true, state: 'pass', value: spf, message: 'SPF válido e inclui o provedor de envio' }
}

async function checkDmarc(domain: string): Promise<CheckResult> {
  const records = await dnsTxt(`_dmarc.${domain}`)
  const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'))
  if (!dmarc) {
    return {
      ok: false,
      state: 'missing',
      message: 'DMARC não publicado em _dmarc.' + domain,
      recommendation: 'Adicione TXT em _dmarc.' + domain + ' com: v=DMARC1; p=none; rua=mailto:reports@' + domain,
    }
  }
  const policy = (dmarc.match(/p\s*=\s*(\w+)/i) || [])[1]?.toLowerCase()
  if (policy === 'none') {
    return {
      ok: true,
      state: 'warn',
      value: dmarc,
      message: 'DMARC ativo em modo monitoramento (p=none)',
      recommendation: 'Após coletar relatórios por algumas semanas, suba para p=quarantine e depois p=reject',
    }
  }
  if (policy === 'reject' || policy === 'quarantine') {
    return { ok: true, state: 'pass', value: dmarc, message: `DMARC ativo com p=${policy} — proteção contra spoof` }
  }
  return { ok: true, state: 'warn', value: dmarc, message: 'DMARC encontrado mas sem política clara' }
}

// DKIM keys are typically published as TXT or CNAME at selector._domainkey.domain
// We probe the common selectors. A real provider (Resend, etc.) tells the
// merchant the exact selector; this checker is a fast triage tool.
async function checkDkim(domain: string): Promise<CheckResult> {
  const selectors = ['resend', 'resend1', 'resend2', 'google', 'k1', 'k2', 'mg', 's1', 's2', 'default']
  for (const sel of selectors) {
    const host = `${sel}._domainkey.${domain}`
    const [cname, txt] = await Promise.all([dnsCname(host), dnsTxt(host)])
    if (cname.length > 0) {
      return { ok: true, state: 'pass', value: `${sel}._domainkey → ${cname[0]}`, message: `DKIM publicado (selector: ${sel})` }
    }
    const dkimTxt = txt.find((r) => r.startsWith('v=DKIM1') || r.includes('p='))
    if (dkimTxt) {
      return { ok: true, state: 'pass', value: dkimTxt.slice(0, 80) + '…', message: `DKIM publicado (selector: ${sel})` }
    }
  }
  return {
    ok: false,
    state: 'missing',
    message: 'Nenhum DKIM encontrado nos selectors comuns',
    recommendation: 'Pegue o registro CNAME exato no painel do seu provedor (Resend, Mailgun, etc.) e adicione no DNS',
  }
}

async function checkMx(domain: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${CLOUDFLARE_DOH}?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: 'application/dns-json' },
      cache: 'no-store',
    })
    const json = (await res.json()) as DohResponse
    if (!json.Answer || json.Answer.length === 0) {
      return {
        ok: false,
        state: 'warn',
        message: 'Sem MX — domínio não recebe email',
        recommendation: 'Configure um servidor de email se você quer responder a replies dos seus envios',
      }
    }
    return { ok: true, state: 'pass', message: `${json.Answer.length} MX records` }
  } catch {
    return { ok: false, state: 'fail', message: 'Falha ao consultar MX' }
  }
}

// Composite score 0-100. Fully passing = 100, partial = scaled.
function deliverabilityScore(checks: { spf: CheckResult; dkim: CheckResult; dmarc: CheckResult; mx: CheckResult }): number {
  const weights = { spf: 30, dkim: 30, dmarc: 25, mx: 15 } as const
  let score = 0
  for (const k of Object.keys(weights) as Array<keyof typeof weights>) {
    const r = checks[k]
    if (r.state === 'pass') score += weights[k]
    else if (r.state === 'warn') score += Math.floor(weights[k] * 0.6)
  }
  return score
}

export async function GET(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const url = new URL(req.url)
  const domain = (url.searchParams.get('domain') || '').trim().toLowerCase()
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return NextResponse.json({ error: 'domain inválido' }, { status: 400 })
  }

  const [spf, dkim, dmarc, mx] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain),
    checkDmarc(domain),
    checkMx(domain),
  ])

  const score = deliverabilityScore({ spf, dkim, dmarc, mx })
  let band: 'excellent' | 'good' | 'fair' | 'poor' = 'poor'
  if (score >= 90) band = 'excellent'
  else if (score >= 70) band = 'good'
  else if (score >= 40) band = 'fair'

  return NextResponse.json({
    domain,
    checkedAt: new Date().toISOString(),
    score,
    band,
    checks: { spf, dkim, dmarc, mx },
  })
}
