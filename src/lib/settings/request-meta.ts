// Metadados da requisição usados nas Configurações → Segurança
// (sessões ativas e histórico de login): IP, navegador e cidade
// (cabeçalhos da Vercel quando disponíveis).

export interface RequestMeta {
  ip: string | null
  userAgent: string | null
  city: string | null
  country: string | null
}

export function requestMeta(req: Request): RequestMeta {
  const h = req.headers
  const fwd = h.get('x-forwarded-for')
  const ip = (h.get('x-real-ip') || (fwd ? fwd.split(',')[0] : null) || h.get('cf-connecting-ip') || null)?.trim() || null
  const cityRaw = h.get('x-vercel-ip-city')
  let city: string | null = null
  if (cityRaw) {
    try { city = decodeURIComponent(cityRaw) } catch { city = cityRaw }
  }
  return {
    ip,
    userAgent: h.get('user-agent'),
    city,
    country: h.get('x-vercel-ip-country') || h.get('cf-ipcountry') || null,
  }
}

/** Lê o payload de um JWT sem validar (só para extrair session_id/exp). */
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function jwtSessionId(token: string | null | undefined): string | null {
  const p = decodeJwtPayload(token)
  const sid = p?.session_id
  return typeof sid === 'string' ? sid : null
}
