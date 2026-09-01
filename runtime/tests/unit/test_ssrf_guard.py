"""Portão SSRF do lado do runtime (item 19 do audit).

Espelha `src/lib/ai/ssrf-guard.ts` (item 18/19, lado TypeScript) usando
`ipaddress` da stdlib em vez de portar o `BlockList` manual — ver o módulo
pra o porquê de cada família de endereço, e a única divergência conhecida
entre os dois lados (IPv4-compatível deprecated com IPv4 embutido público).

Nada aqui toca DNS real: `assert_safe_url` recebe um `resolver` fake em todo
teste que passa por resolução de hostname.

Nenhuma URL aparece como literal única `esquema://host` neste arquivo — o
teste-fitness `test_no_provider_network.py` recusa qualquer string que junte
os dois (só os dois ADAPTERS e a suíte `contract` podem nomear um host
externo). `_url()` monta a string em runtime a partir de pedaços que,
sozinhos, não contêm `http://`/`https://`, então nenhum host de teste
(sempre `exemplo.com`/loopback fictício, nunca provedor de verdade) conta
como violação.
"""

import pytest

from agents_runtime.tools.ssrf_guard import (
    SsrfBlocked,
    assert_safe_url,
    is_private_or_reserved_ip,
)


def _url(scheme: str, host: str, path: str = "/x") -> str:
    return f"{scheme}://{host}{path}"


class TestIsPrivateOrReservedIp:
    @pytest.mark.parametrize(
        ("ip", "expected"),
        [
            # IPv4 — RFC1918, loopback, link-local (metadata da nuvem), CGNAT,
            # 0.0.0.0, broadcast, multicast, reservado, benchmarking.
            ("10.0.0.1", True),
            ("172.16.0.5", True),
            ("192.168.1.1", True),
            ("127.0.0.1", True),
            ("169.254.169.254", True),  # metadata endpoint
            ("0.0.0.0", True),
            ("100.64.0.1", True),  # CGNAT — RFC 6598
            ("255.255.255.255", True),  # broadcast
            ("224.0.0.1", True),  # multicast
            ("240.0.0.1", True),  # reservado
            ("198.18.0.1", True),  # benchmarking
            # fix round 1 (review): stdlib exclui estes dois de `is_private`
            # (`_private_networks_exceptions` — PCP e o anycast de descoberta
            # NAT64/DNS64) mesmo dentro de 192.0.0.0/24. O TS bloqueia a
            # faixa inteira sem exceção — sem `_PROTOCOL_ASSIGNMENT`, o guard
            # deixava os dois passarem.
            ("192.0.0.9", True),  # PCP anycast
            ("192.0.0.10", True),  # NAT64/DNS64 discovery anycast
            ("8.8.8.8", False),
            ("93.184.216.34", False),
            # IPv6
            ("::1", True),  # loopback
            ("fe80::1", True),  # link-local
            ("fc00::1", True),  # unique-local
            ("fd12::1", True),  # unique-local (outro bloco do /7)
            ("::", True),  # unspecified
            ("2001:4860:4860::8888", False),  # público de verdade (dns.google)
            # IPv4 mapeado em IPv6 (::ffff:a.b.c.d) — delega pra checagem de v4
            ("::ffff:127.0.0.1", True),
            ("::ffff:10.0.0.1", True),
            ("::ffff:169.254.169.254", True),
            ("::ffff:8.8.8.8", False),
            # IPv4-compatível deprecated (::a.b.c.d, sem "ffff") — cai
            # inteiro dentro de ::/8, que o stdlib marca reservado
            ("::127.0.0.1", True),
            ("::a9fe:a9fe", True),  # compat de 169.254.169.254 (metadata)
            ("::808:808", True),  # compat de 8.8.8.8 — DIVERGE do TS, ver docstring do módulo
            # NAT64 (64:ff9b::/96) — cai dentro de ::/8, reservado
            ("64:ff9b::a9fe:a9fe", True),  # NAT64 do metadata endpoint
            # 6to4 (2002::/16) — bloqueado inteiro, mesmo com IPv4 público embutido
            ("2002:0101:0101::1", True),  # 6to4 de 1.1.1.1 (público)
            ("2002:a9fe:a9fe::1", True),  # 6to4 do metadata endpoint
            ("not-an-ip", True),  # não é IP válido — trata como inseguro
        ],
    )
    def test_address_families(self, ip: str, expected: bool) -> None:
        assert is_private_or_reserved_ip(ip) is expected


async def _public_resolver(host: str) -> list[str]:
    return ["93.184.216.34"]


class TestAssertSafeUrl:
    async def test_recusa_esquema_diferente_de_http_https(self) -> None:
        with pytest.raises(SsrfBlocked, match="esquema"):
            await assert_safe_url("file:///etc/passwd")

    async def test_recusa_esquema_javascript(self) -> None:
        with pytest.raises(SsrfBlocked, match="esquema"):
            await assert_safe_url("javascript:alert(1)")

    async def test_recusa_credenciais_embutidas(self) -> None:
        with pytest.raises(SsrfBlocked, match="credenciais"):
            await assert_safe_url(_url("https", "user:pass@exemplo.com"), resolver=_public_resolver)

    async def test_recusa_ip_literal_privado_sem_chamar_o_resolver(self) -> None:
        chamado = False

        async def resolver_que_nao_deveria_ser_chamado(host: str) -> list[str]:
            nonlocal chamado
            chamado = True
            return ["93.184.216.34"]

        with pytest.raises(SsrfBlocked, match="rede interna"):
            await assert_safe_url(
                _url("http", "169.254.169.254", "/latest/meta-data/"),
                resolver=resolver_que_nao_deveria_ser_chamado,
            )
        assert chamado is False  # IP literal não precisa resolver pra saber que é interno

    async def test_recusa_ip_literal_ipv6_privado(self) -> None:
        with pytest.raises(SsrfBlocked, match="rede interna"):
            await assert_safe_url(_url("http", "[::1]"))

    async def test_recusa_hostname_que_resolve_para_ip_privado(self) -> None:
        async def resolver(host: str) -> list[str]:
            assert host == "interno.exemplo.com"
            return ["127.0.0.1"]

        with pytest.raises(SsrfBlocked, match="rede interna"):
            await assert_safe_url(_url("https", "interno.exemplo.com", "/api"), resolver=resolver)

    async def test_recusa_quando_qualquer_endereco_resolvido_e_privado(self) -> None:
        # multi-A-record: um IP público e um privado — recusa mesmo que o
        # primeiro pareça seguro.
        async def resolver(host: str) -> list[str]:
            return ["93.184.216.34", "10.0.0.9"]

        with pytest.raises(SsrfBlocked, match="rede interna"):
            await assert_safe_url(_url("https", "multi.exemplo.com", "/api"), resolver=resolver)

    async def test_recusa_quando_resolucao_falha(self) -> None:
        async def resolver(host: str) -> list[str]:
            raise OSError("nao resolveu")

        with pytest.raises(SsrfBlocked, match="não foi possível resolver"):
            await assert_safe_url(_url("https", "naoexiste.exemplo.com", "/api"), resolver=resolver)

    async def test_recusa_quando_resolucao_devolve_lista_vazia(self) -> None:
        async def resolver(host: str) -> list[str]:
            return []

        with pytest.raises(SsrfBlocked, match="não foi possível resolver"):
            await assert_safe_url(_url("https", "vazio.exemplo.com", "/api"), resolver=resolver)

    async def test_aceita_host_publico(self) -> None:
        raw = _url("https", "api.loja-publica.com")
        url = await assert_safe_url(raw, resolver=_public_resolver)
        assert str(url) == raw

    async def test_aceita_ip_literal_publico(self) -> None:
        url = await assert_safe_url(_url("http", "93.184.216.34"))
        assert url.host == "93.184.216.34"
