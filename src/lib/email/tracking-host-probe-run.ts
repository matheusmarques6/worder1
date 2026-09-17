// =============================================
// A sonda do domínio dos links (parte que fala com a rede).
//
// Duas responsabilidades:
//
//   1. Responder ao painel de saúde: "os links deste e-mail funcionam?"
//   2. Servir de rede de segurança no ENVIO: um host que já se provou
//      quebrado não é usado para montar link nenhum — melhor um link no
//      domínio do painel do que um link morto.
//
// A regra do envio é não esperar: quem manda e-mail nunca fica parado
// esperando uma sonda. O envio consulta o último veredito conhecido
// (`hostDeLinksReprovado`) e dispara a verificação em segundo plano
// quando ela está velha.
// =============================================

import { classificarHostDeLinks, type HostDeLinksVeredito, type RespostaDoPing } from './tracking-host-probe'

const TIMEOUT_MS = 3000
const CACHE_TTL_MS = 5 * 60_000

interface Entrada {
  ts: number
  resposta: RespostaDoPing
}

const cache = new Map<string, Entrada>()
const emVoo = new Set<string>()

async function perguntar(baseUrl: string): Promise<RespostaDoPing> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/t/ping`, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    let ehWorder = false
    try {
      const corpo = await res.json()
      ehWorder = res.ok && corpo?.worder === true
    } catch {
      ehWorder = false
    }
    return { status: res.status, ehWorder }
  } catch (e: any) {
    return {
      status: null,
      ehWorder: false,
      erro: e?.name === 'AbortError' ? 'tempo esgotado' : String(e?.message || e),
    }
  } finally {
    clearTimeout(t)
  }
}

/** Sonda esperando a resposta. É o que o painel de saúde usa. */
export async function verificarHostDeLinks(baseUrl: string): Promise<HostDeLinksVeredito> {
  const host = hostDe(baseUrl)
  const guardado = cache.get(baseUrl)
  if (guardado && Date.now() - guardado.ts < CACHE_TTL_MS) {
    return classificarHostDeLinks(host, guardado.resposta)
  }
  const resposta = await perguntar(baseUrl)
  cache.set(baseUrl, { ts: Date.now(), resposta })
  return classificarHostDeLinks(host, resposta)
}

/**
 * O envio pergunta assim: responde na hora, com o que já se sabe, e
 * manda verificar em segundo plano quando o dado está velho. Só devolve
 * `true` quando há CERTEZA de que o host está quebrado — na dúvida, o
 * domínio configurado continua valendo.
 */
export function hostDeLinksReprovado(baseUrl: string): boolean {
  const guardado = cache.get(baseUrl)
  const velho = !guardado || Date.now() - guardado.ts >= CACHE_TTL_MS

  if (velho && !emVoo.has(baseUrl)) {
    emVoo.add(baseUrl)
    perguntar(baseUrl)
      .then((resposta) => { cache.set(baseUrl, { ts: Date.now(), resposta }) })
      .catch(() => {})
      .finally(() => { emVoo.delete(baseUrl) })
  }

  if (!guardado) return false
  return !guardado.resposta.ehWorder
}

function hostDe(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

export function __limparCacheDoHostDeLinks(): void {
  cache.clear()
  emVoo.clear()
}
