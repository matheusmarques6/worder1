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
// confere o IP; a segunda resolução do MESMO hostname acontece depois, dentro
// do `fetch` — feita pelo undici por baixo do capô, fora do nosso controle.
// Isso não é uma corrida de timing: quem é dono do domínio também é dono do
// TTL do registro. Um atacante configura TTL=0 e alterna a resposta — IP
// público na nossa checagem, IP interno na resolução do fetch — de forma
// determinística e barata, não por sorte de timing. Fechar essa janela de
// verdade exige abrir a conexão TCP nós mesmos pro IP já validado (um
// dispatcher HTTP customizado que fixe o endereço), o que pede uma
// dependência nova — `undici` NÃO é um módulo embutido do Node acessível via
// `node:` (`require('node:undici')` lança `ERR_UNKNOWN_BUILTIN_MODULE`) — ou
// um hack que quebra SNI/verificação de certificado em HTTPS. Fora do escopo
// aqui (ver ruling do item). Isso NÃO está coberto.
// =============================================

import { lookup } from 'node:dns/promises'
import { isIP, BlockList } from 'node:net'

const BLOCKED_PREFIX = 'esse endereço não pode ser usado como fonte'

function blocked(reason: string): Error {
  return new Error(`${BLOCKED_PREFIX}: ${reason}`)
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

// Faixas IPv4 não roteáveis/reservadas. "no mínimo" do achado (loopback,
// link-local, privadas RFC1918, 0.0.0.0) mais o resto do espaço reservado que
// um SSRF pode explorar: CGNAT (VPC de nuvem costuma viver aqui), broadcast,
// multicast, reservado, e as faixas IANA "special-purpose" de uso restrito.
const V4_RANGES: Array<[address: string, prefixLength: number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — inclui o metadata endpoint da nuvem
  ['0.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT — onde internals de VPC de nuvem costumam viver
  ['255.255.255.255', 32], // broadcast
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado
  ['192.0.0.0', 24], // atribuições de protocolo IETF
  ['198.18.0.0', 15], // benchmarking
]

const V4_BLOCKLIST = new BlockList()
for (const [address, prefixLength] of V4_RANGES) {
  V4_BLOCKLIST.addSubnet(address, prefixLength, 'ipv4')
}

const V6_BLOCKLIST = new BlockList()
V6_BLOCKLIST.addSubnet('::1', 128, 'ipv6') // loopback
V6_BLOCKLIST.addSubnet('fe80::', 10, 'ipv6') // link-local
V6_BLOCKLIST.addSubnet('fc00::', 7, 'ipv6') // unique-local (equivalente privado)
V6_BLOCKLIST.addAddress('::', 'ipv6')
V6_BLOCKLIST.addSubnet('64:ff9b::', 96, 'ipv6') // NAT64 — o gateway traduz pra IPv4 arbitrário
V6_BLOCKLIST.addSubnet('2002::', 16, 'ipv6') // 6to4 — mesmo problema, outro mecanismo de transição
// IPv4 embutido em IPv6 — mapeado (::ffff:a.b.c.d) e compatível (::a.b.c.d,
// deprecated): projeta CADA faixa de V4_RANGES nos dois formatos.
// `BlockList` compara bytes já normalizados, então isso cobre a forma
// hexadecimal também (`new URL()` normaliza "::127.0.0.1" para "::7f00:1" —
// testado: BlockList reconhece as duas formas como o mesmo endereço).
for (const [address, prefixLength] of V4_RANGES) {
  V6_BLOCKLIST.addSubnet(`::ffff:${address}`, 96 + prefixLength, 'ipv6')
  V6_BLOCKLIST.addSubnet(`::${address}`, 96 + prefixLength, 'ipv6')
}

/** True se o IP (v4 ou v6, incluindo IPv4 mapeado/compatível em IPv6) é não roteável/interno. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return V4_BLOCKLIST.check(ip, 'ipv4')
  if (family === 6) return V6_BLOCKLIST.check(ip, 'ipv6')
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
    // Não vamos ler o corpo deste redirect — cancela pra liberar o socket
    // antes do próximo salto (senão vaza conexão/memória em cadeia de redirect).
    if (res.body) {
      try {
        await res.body.cancel()
      } catch {
        // best-effort: cancelar corpo já descartado não deve derrubar o crawl
      }
    }
    if (hop >= maxRedirects) {
      throw blocked('excesso de redirecionamentos ao seguir a URL')
    }
    currentUrl = new URL(location, url).toString()
  }
}
