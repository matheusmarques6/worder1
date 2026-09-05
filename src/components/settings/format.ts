// Utilidades das Configurações: chamadas de API com erro legível e
// formatação pt-BR (número, moeda, percentual, datas relativas).

export class ApiError extends Error {
  status: number
  code?: string
  data?: any
  constructor(message: string, status: number, data?: any) {
    super(message)
    this.status = status
    this.data = data
    this.code = data?.code
  }
}

/** fetch + JSON. Lança ApiError com a mensagem do servidor quando não é 2xx. */
export async function api<T = any>(url: string, init?: RequestInit & { json?: any }): Promise<T> {
  const { json, ...rest } = init || {}
  const res = await fetch(url, {
    ...rest,
    cache: rest.cache ?? 'no-store',
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || `Erro ${res.status}`
    throw new ApiError(String(msg), res.status, data)
  }
  return data as T
}

export const nf = (v: number | null | undefined, d = 0) =>
  (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const pc = (v: number | null | undefined, d = 1) =>
  (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'

export const brl = (v: number | null | undefined, d = 2) =>
  'R$ ' + (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const money = (v: number | null | undefined, currency = 'BRL', d = 2) => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v ?? 0)
  } catch {
    return `${currency} ${nf(v, d)}`
  }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function fmtDate(v: string | Date | null | undefined, withTime = false): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const base = `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`
  if (!withTime) return base
  return `${base}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fmtDateBR(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function timeAgo(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 45) return 'Agora'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  const dd = Math.round(h / 24)
  if (dd === 1) return 'Ontem'
  if (dd < 30) return `há ${dd} dias`
  return fmtDate(d)
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  const n = (name || '').trim()
  if (!n) return fallback
  return n.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).host } catch { return url }
}

/** Descrição curta do user agent: "Chrome · macOS". */
export function describeUA(ua: string | null | undefined): string {
  if (!ua) return 'Dispositivo desconhecido'
  const u = ua
  let browser = 'Navegador'
  if (/Edg\//.test(u)) browser = 'Edge'
  else if (/OPR\//.test(u)) browser = 'Opera'
  else if (/Chrome\//.test(u) && !/Chromium/.test(u)) browser = 'Chrome'
  else if (/Firefox\//.test(u)) browser = 'Firefox'
  else if (/Safari\//.test(u) && /Version\//.test(u)) browser = 'Safari'
  else if (/node|axios|curl|python|Vercel/i.test(u)) browser = 'API'
  let os = ''
  if (/iPhone|iPad/.test(u)) os = /iPad/.test(u) ? 'iPad' : 'iPhone'
  else if (/Android/.test(u)) os = 'Android'
  else if (/Mac OS X/.test(u)) os = 'macOS'
  else if (/Windows/.test(u)) os = 'Windows'
  else if (/Linux/.test(u)) os = 'Linux'
  return os ? `${browser} · ${os}` : browser
}
