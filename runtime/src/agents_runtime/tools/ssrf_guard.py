"""Portão de rede para a custom tool do lojista (item 19 do audit).

POR QUÊ: o endpoint de uma custom tool vem de uma linha do banco que o
lojista preencheu. O único filtro até aqui era o CHECK do schema
(`endpoint like 'https://%'`) — pega o erro de digitação no cadastro, mas não
impede que o endpoint aponte pra rede interna em runtime: o metadata
endpoint da nuvem, o próprio processo em localhost, um serviço "sem senha
porque só é acessível de dentro da VPC". A defesa é sobre PARA ONDE o host
RESOLVE, não uma allowlist de domínio — o produto é "o lojista aponta pra
API dele".

Espelha o contrato de `src/lib/ai/ssrf-guard.ts` (item 18/19 do lado
TypeScript) sem portar o `BlockList` manual linha a linha: o `ipaddress` da
stdlib já resolve loopback/link-local/privado/reservado/multicast via
`is_private`/`is_reserved`/`is_multicast`, e IPv4 mapeado em IPv6
(`::ffff:a.b.c.d`) via `ipv4_mapped` (delega pra checagem de v4 sozinho). O
que falta do stdlib é só CGNAT (`100.64.0.0/10`, `is_private` é `False` pra
essa faixa de propósito — ver `ipaddress.IPv4Address.is_private.__doc__`).

NAT64 (`64:ff9b::/96`) e o IPv4-compatível deprecated (`::a.b.c.d`) caem
inteiros dentro de `::/8`, que o stdlib já marca `is_reserved`; 6to4
(`2002::/16`) já está na lista `_private_networks` do stdlib. Nenhum dos
três precisou de tratamento manual — ver o comentário de
`is_private_or_reserved_ip` para a única divergência real com o lado TS.

LIMITE CONHECIDO (DNS rebinding): igual ao item 18, e pelo mesmo motivo.
`assert_safe_url` resolve o host e confere o(s) IP(s) aqui; o httpx resolve
de NOVO (via `getaddrinfo` do SO) quando abre a conexão de verdade — essa
segunda resolução está fora do nosso controle. Fechar de verdade exigiria
abrir o socket nós mesmos pro IP já validado (um `transport` customizado que
ignore o hostname no connect), o que pede reescrever a camada de transporte
do httpx pra este único uso — fora do escopo aqui (ruling do controlador).
Não fixamos o IP no connect: fica documentado como aberto, não fingido como
fechado.
"""

from __future__ import annotations

import asyncio
import ipaddress
from collections.abc import Awaitable, Callable

import httpx

_BLOCKED_PREFIX = "esse endereço não pode ser usado como fonte"

_ALLOWED_SCHEMES = {"http", "https"}

# `ipaddress.IPv4Address.is_private` é deliberadamente `False` aqui (é o
# ponto do CGNAT: o RFC 6598 reservou a faixa pra tradução de endereço em
# operadora/nuvem, não pra rede privada do usuário) — precisa de checagem
# própria, é a única faixa do achado que o stdlib não cobre sozinho.
_CGNAT = ipaddress.ip_network("100.64.0.0/10")

# Fix round 1 (review do item 19) — IMPORTANT 1: o stdlib carrega
# `_private_networks_exceptions = [192.0.0.9/32, 192.0.0.10/32]` (PCP e o
# anycast de descoberta NAT64/DNS64, RFC 7723/7050) e por isso `is_private`
# é `False` pra esses dois endereços dentro de `192.0.0.0/24` — o guard
# deixava os dois passarem, divergindo do TS (`ssrf-guard.ts`), que bloqueia
# a faixa inteira sem exceção. Mesmo tratamento do CGNAT acima: faixa
# própria, checada à parte de `is_private`.
_PROTOCOL_ASSIGNMENT = ipaddress.ip_network("192.0.0.0/24")

#: Resolve um hostname para os endereços que ele aponta. Injetável pra teste
#: (nunca toca DNS de verdade numa suíte `-m unit`); em produção, o resolver
#: padrão usa o resolvedor assíncrono do próprio event loop.
Resolver = Callable[[str], Awaitable[list[str]]]


class SsrfBlocked(Exception):
    """Erro com mensagem clara — não stack trace — quando o destino é recusado."""


def _blocked(reason: str) -> SsrfBlocked:
    return SsrfBlocked(f"{_BLOCKED_PREFIX}: {reason}")


def _is_blocked_v4(ip: ipaddress.IPv4Address) -> bool:
    return (
        ip.is_private
        or ip.is_reserved
        or ip.is_multicast
        or ip in _CGNAT
        or ip in _PROTOCOL_ASSIGNMENT
    )


def is_private_or_reserved_ip(ip_text: str) -> bool:
    """True se o IP (v4 ou v6, incluindo as formas de IPv4 embutido em IPv6)
    é não roteável/interno. Espelha `ssrf-guard.ts::isPrivateOrReservedIp`.

    DIVERGÊNCIA CONHECIDA com o lado TS: pra IPv4-compatível deprecated
    (`::a.b.c.d`, sem o `ffff`), o stdlib marca a faixa `::/8` inteira como
    `is_reserved` — inclusive quando o IPv4 embutido é público (`::808:808`,
    compat de `8.8.8.8`). O TS só bloqueia essa forma quando o IPv4 embutido
    É privado (tem um teste de regressão específico permitindo o caso
    público). Aqui bloqueia sempre. É um "bloqueia a mais", nunca um
    "libera a menos" — mantido porque reescrever o stdlib pra afinar esse
    único caso (uma forma de endereço deprecated desde 1995, sem uso
    legítimo conhecido) contraria a ruling de usar `ipaddress` como está.
    """
    try:
        ip = ipaddress.ip_address(ip_text)
    except ValueError:
        return True  # não é um IP válido — não sabemos o que é, trata como inseguro

    if isinstance(ip, ipaddress.IPv4Address):
        return _is_blocked_v4(ip)

    mapped = ip.ipv4_mapped  # só preenche pra ::ffff:0:0/96 (mapeado); compat/NAT64 ficam None
    if mapped is not None:
        return _is_blocked_v4(mapped)
    return ip.is_private or ip.is_reserved or ip.is_multicast


async def _default_resolve(host: str) -> list[str]:
    """Resolvedor de produção: `getaddrinfo` assíncrono do próprio event
    loop (mesma função que a stdlib usa por baixo do `socket.getaddrinfo`,
    sem bloquear o loop — não precisa de dependência nova)."""
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


async def assert_safe_url(raw_url: str, *, resolver: Resolver | None = None) -> httpx.URL:
    """Valida esquema, credenciais embutidas e resolução de DNS de uma URL
    antes de ela poder ser buscada. Lança `SsrfBlocked` (mensagem clara, não
    stack trace) quando a URL não pode ser usada como destino. Devolve a URL
    parseada quando segura.
    """
    try:
        url = httpx.URL(raw_url)
    except Exception as error:  # httpx.URL raramente lança, mas não é garantido
        raise _blocked("endereço inválido") from error

    if url.scheme not in _ALLOWED_SCHEMES:
        raise _blocked(f'esquema "{url.scheme}" não é permitido, use http ou https')
    if url.username or url.password:
        raise _blocked("URL com credenciais embutidas não é permitida")

    host = url.host
    if not host:
        raise _blocked("endereço inválido")

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None

    if literal is not None:
        if is_private_or_reserved_ip(str(literal)):
            raise _blocked("o endereço aponta para uma rede interna")
        return url

    resolve = resolver or _default_resolve
    try:
        addresses = await resolve(host)
    except Exception as error:
        raise _blocked("não foi possível resolver o host") from error
    if not addresses:
        raise _blocked("não foi possível resolver o host")
    for address in addresses:
        if is_private_or_reserved_ip(address):
            raise _blocked("o host resolve para uma rede interna")
    return url
