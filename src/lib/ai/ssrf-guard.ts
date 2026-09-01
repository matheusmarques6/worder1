// src/lib/ai/ssrf-guard.ts
// =============================================
// Portão de rede para busca de URL fornecida pelo lojista (item 18 do audit).
//
// POR QUÊ: o crawler (e, a seguir, as custom tools do item 19) buscam uma URL
// que o lojista digitou. Sem checagem, "fonte de conhecimento" vira uma forma
// de fazer o servidor ler rede interna (SSRF): http://169.254.169.254/... é o
// metadata endpoint da nuvem, http://localhost:PORTA é o próprio processo.
// A defesa é sobre PARA ONDE o host resolve, não sobre uma lista de domínios
// permitidos — o produto é "o lojista aponta pro site dele".
//
// Redirect é o vetor preferido do ataque: um host público pode responder 302
// para um IP interno. Por isso `safeFetch` NUNCA usa redirect:'follow' — ele
// segue redirect manualmente, checando cada salto antes de buscá-lo.
//
// LIMITE CONHECIDO (DNS rebinding): `assertSafeUrl` resolve o hostname e
// confere o IP; `fetch` looga depois e resolve o MESMO hostname de novo. Um
// atacante com controle do DNS pode devolver um IP público na primeira
// resolução (a nossa) e um IP interno na segunda (a do fetch), com TTL bem
// baixo. Fechar essa janela de verdade exige abrir a conexão TCP nós mesmos
// pro IP já validado (dispatcher/agent customizado) — fora do escopo aqui
// (sem dependência nova, ver ruling do item). Isso NÃO está coberto.
// =============================================

import { lookup } from 'node:dns/promises'
import { isIP, BlockList } from 'node:net'

const BLOCKED_PREFIX = 'esse endereço não pode ser usado como fonte'

function blocked(reason: string): Error {
  return new Error(`${BLOCKED_PREFIX}: ${reason}`)
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

// Faixas não roteáveis / internas. "no mínimo" do achado: loopback,
// link-local, privadas RFC1918, 0.0.0.0 — e o equivalente IPv6 de cada uma.
const V4_BLOCKLIST = new BlockList()
V4_BLOCKLIST.addSubnet('10.0.0.0', 8, 'ipv4')
V4_BLOCKLIST.addSubnet('172.16.0.0', 12, 'ipv4')
V4_BLOCKLIST.addSubnet('192.168.0.0', 16, 'ipv4')
V4_BLOCKLIST.addSubnet('127.0.0.0', 8, 'ipv4')
V4_BLOCKLIST.addSubnet('169.254.0.0', 16, 'ipv4') // link-local — inclui o metadata endpoint da nuvem
V4_BLOCKLIST.addAddress('0.0.0.0', 'ipv4')

const V6_BLOCKLIST = new BlockList()
V6_BLOCKLIST.addSubnet('::1', 128, 'ipv6') // loopback
V6_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6') // link-local
V6_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6') // unique-local (equivalente privado)
V6_BLOCKLIST.addAddress('::', 'ipv6')

const IPV4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i

/** True se o IP (v4 ou v6, incluindo IPv4 mapeado em IPv6) é não roteável/interno. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return V4_BLOCKLIST.check(ip, 'ipv4')
  if (family === 6) {
    const mapped = ip.match(IPV4_MAPPED)
    if (mapped) return V4_BLOCKLIST.check(mapped[1], 'ipv4')
    return V6_BLOCKLIST.check(ip, 'ipv6')
  }
  return true // não é um IP válido — não sabemos o que é, trata como inseguro
}

function bareHostname(hostname: string): string {
  // new URL('http://[::1]/').hostname === '[::1]' — remove os colchetes do literal IPv6
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

/**
 * Valida esquema, credenciais embutidas e resolução de DNS de uma URL antes
 * de ela poder ser buscada. Lança erro com mensagem clara (não stack trace)
 * quando a URL não pode ser usada como fonte. Devolve a URL parseada quando
 * segura.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw blocked('endereço inválido')
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw blocked(`esquema "${url.protocol}" não é permitido, use http ou https`)
  }
  if (url.username || url.password) {
    throw blocked('URL com credenciais embutidas não é permitida')
  }

  const host = bareHostname(url.hostname)
  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) throw blocked('o endereço aponta para uma rede interna')
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw blocked('não foi possível resolver o host')
  }
  if (addresses.length === 0) throw blocked('não foi possível resolver o host')
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) throw blocked('o host resolve para uma rede interna')
  }
  return url
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * fetch seguro contra SSRF: valida a URL (e, a cada redirect, o DESTINO do
 * redirect) antes de buscar. Nunca usa redirect:'follow' — cada salto passa
 * pelo mesmo portão que a URL de entrada.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = rawUrl
  for (let hop = 0; ; hop++) {
    const url = await assertSafeUrl(currentUrl)
    const res = await fetch(url.toString(), { ...init, redirect: 'manual' })
    const location = res.headers.get('location')
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res
    if (hop >= maxRedirects) {
      throw blocked('excesso de redirecionamentos ao seguir a URL')
    }
    currentUrl = new URL(location, url).toString()
  }
}
