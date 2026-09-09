// =============================================
// De onde veio este beacon / esta inscrição?
//
// As rotas públicas do popup não têm autenticação — o id do formulário é
// público (sai no bundle de toda loja). Sem nenhuma checagem, quem lesse
// o id de um popup podia mandar impressões e inscrições para dentro da
// organização alheia: contadores inflados, grupo de controle fabricado
// (o que inverte a leitura do hold-out) e pool de cupons drenado.
//
// O que dá para exigir de um script que roda na vitrine de terceiros:
// a origem da requisição. O navegador sempre manda Origin numa chamada
// entre domínios, e o runtime também manda o domínio explícito. Isso não
// é credencial — quem chama de fora do navegador forja o cabeçalho — mas
// derruba o caminho fácil e nunca atrapalha o tráfego legítimo.
//
// A régua:
//   • origem é a nossa própria aplicação  → passa (página de embed)
//   • origem resolve para loja de OUTRA organização → barra
//   • popup preso a uma loja e a origem é outra loja → barra
//   • popup preso a uma loja e a origem é desconhecida → barra
//   • popup sem loja e origem desconhecida → passa (embed em site próprio)
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OriginGateForm {
  organization_id: string
  store_id?: string | null
}

export type OriginVerdict =
  | { ok: true; domain: string | null; storeId: string | null }
  | { ok: false; reason: string }

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL('https://' + raw)
    return url.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/** O domínio que a requisição alega, do mais explícito ao mais fraco. */
export function claimedDomain(headers: Pick<Headers, 'get'>, explicit?: unknown): string | null {
  const fromBody = typeof explicit === 'string' ? hostOf(explicit) : null
  if (fromBody) return fromBody
  return hostOf(headers.get('origin')) || hostOf(headers.get('referer'))
}

function appHost(): string | null {
  return hostOf(process.env.NEXT_PUBLIC_APP_URL || '')
}

export async function checkPopupOrigin(
  admin: SupabaseClient,
  headers: Pick<Headers, 'get'>,
  form: OriginGateForm,
  explicitDomain?: unknown,
): Promise<OriginVerdict> {
  const domain = claimedDomain(headers, explicitDomain)

  // A própria aplicação: é a página /embed servida por nós.
  const app = appHost()
  if (domain && app && domain === app) return { ok: true, domain, storeId: null }

  if (!domain) {
    if (form.store_id) return { ok: false, reason: 'sem origem' }
    return { ok: true, domain: null, storeId: null }
  }

  const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain')
  const store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
    admin, domain, { select: 'id, organization_id', activeOnly: true },
  )

  if (!store) {
    // Domínio que não é de nenhuma loja: só vale para popup sem loja
    // (um formulário embutido num site próprio do lojista).
    if (form.store_id) return { ok: false, reason: 'origem desconhecida' }
    return { ok: true, domain, storeId: null }
  }

  if (store.organization_id !== form.organization_id) {
    return { ok: false, reason: 'origem de outra organização' }
  }
  if (form.store_id && store.id !== form.store_id) {
    return { ok: false, reason: 'origem de outra loja' }
  }
  return { ok: true, domain, storeId: store.id }
}
