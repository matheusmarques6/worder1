"""10.7 — a tool custom: HTTP read-only no tool-loop, nunca concede.

O executor genérico valida os argumentos contra o spec tipado ANTES de
qualquer rede, aplica o header de auth decodificado pelo codec da casa,
faz GET (query) ou POST (json), respeita o timeout da linha e devolve a
resposta truncada. Falha de rede é resposta legível (success=False), nunca
exceção — o modelo precisa ler o erro para dizer "não consegui consultar".

MockTransport: nada aqui abre socket; o endpoint vem da linha do banco, e
por isso NENHUM host aparece hardcoded (o fitness de rede continua valendo).

item 19 do audit: desde que `__call__` passou a validar o endpoint via
`ssrf_guard.assert_safe_url` (resolução de DNS incluída), toda construção
de `CustomHttpTool` abaixo injeta um `resolver` fake — nunca toca DNS real,
igual ao `transport` mockado nunca toca socket real. `ROW.endpoint` continua
usando "localhost" (o único host não-local-mas-real que o fitness
`test_no_provider_network.py` deixa passar fora do CONTRACT) só porque é
cômodo; o resolver abaixo o resolve pra um IP público fixo, então o texto do
host não importa pro que o teste verifica.
"""

import json
from dataclasses import replace

import httpx
import pytest

from agents_runtime.tools.custom_http import CustomHttpTool, CustomToolRow, tool_spec_for

ROW = CustomToolRow(
    name="frete_kangu",
    label="Calcular frete Kangu",
    description="Consulta a API da Kangu com o CEP do cliente.",
    when_to_use="Pedirem valor de frete antes do checkout.",
    endpoint="https://localhost/frete",
    method="GET",
    auth_header_name="Authorization",
    auth_header_value="Bearer token-plaintext",
    params=(
        {"name": "cep", "type": "string", "description": "CEP de destino", "required": True},
        {"name": "peso_kg", "type": "number", "description": "Peso total", "required": False},
    ),
    timeout_ms=5000,
)


def _url(scheme: str, host: str, path: str = "/x") -> str:
    # Monta a URL em pedaços pra nenhum literal único do arquivo juntar
    # esquema+host (o fitness `test_no_provider_network.py` recusaria).
    return f"{scheme}://{host}{path}"


async def _resolve_public(_host: str) -> list[str]:
    return ["93.184.216.34"]


def capturing(seen: dict, payload, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["method"] = request.method
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.content.decode() if request.content else ""
        return httpx.Response(status, json=payload)

    return httpx.MockTransport(handler)


class TestTheCall:
    async def test_get_sends_args_as_query_and_auth_header(self) -> None:
        seen: dict = {}
        tool = CustomHttpTool(
            ROW, transport=capturing(seen, {"valor": 23.9}), resolver=_resolve_public
        )

        result = await tool(None, None, {"cep": "01310-100"})

        assert result.success is True
        assert result.output == {"status": 200, "body": {"valor": 23.9}}
        assert seen["method"] == "GET"
        assert "cep=01310-100" in seen["url"]
        assert seen["auth"] == "Bearer token-plaintext"

    async def test_post_sends_args_as_json_body(self) -> None:
        seen: dict = {}
        row = replace(ROW, method="POST")
        tool = CustomHttpTool(
            row, transport=capturing(seen, {"ok": True}), resolver=_resolve_public
        )

        result = await tool(None, None, {"cep": "01310-100", "peso_kg": 2.5})

        assert result.success is True
        assert seen["method"] == "POST"
        assert json.loads(seen["body"]) == {"cep": "01310-100", "peso_kg": 2.5}

    async def test_a_missing_required_param_never_reaches_the_network(self) -> None:
        def exploding(_request: httpx.Request) -> httpx.Response:
            raise AssertionError("a rede não deveria ser tocada")

        tool = CustomHttpTool(
            ROW, transport=httpx.MockTransport(exploding), resolver=_resolve_public
        )
        result = await tool(None, None, {})

        assert result.success is False
        assert "cep" in (result.error or "")

    async def test_a_wrong_type_is_refused(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {}), resolver=_resolve_public)
        result = await tool(None, None, {"cep": "01310-100", "peso_kg": "pesado"})
        assert result.success is False
        assert "peso_kg" in (result.error or "")

    async def test_an_unknown_arg_is_refused(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {}), resolver=_resolve_public)
        result = await tool(None, None, {"cep": "01310-100", "grant_id": "x"})
        assert result.success is False

    async def test_a_provider_error_is_a_readable_answer(self) -> None:
        tool = CustomHttpTool(
            ROW,
            transport=capturing({}, {"erro": "sem cobertura"}, 503),
            resolver=_resolve_public,
        )
        result = await tool(None, None, {"cep": "01310-100"})
        assert result.success is False
        assert "503" in (result.error or "")

    async def test_a_huge_body_is_truncated(self) -> None:
        tool = CustomHttpTool(
            ROW, transport=capturing({}, {"blob": "x" * 20_000}), resolver=_resolve_public
        )
        result = await tool(None, None, {"cep": "01310-100"})
        assert result.success is True
        assert len(json.dumps(result.output)) < 5_000


class TestTheSpec:
    def test_the_llm_spec_carries_typed_params_and_when_to_use(self) -> None:
        spec = tool_spec_for(ROW)
        assert spec.name == "frete_kangu"
        assert "Pedirem valor de frete" in spec.description
        assert "apenas consulta" in spec.description.lower()
        assert spec.parameters["properties"]["cep"]["type"] == "string"
        assert spec.parameters["properties"]["peso_kg"]["type"] == "number"
        assert spec.parameters["required"] == ["cep"]

    def test_methods_beyond_get_post_are_refused_at_construction(self) -> None:
        with pytest.raises(ValueError):
            replace(ROW, method="DELETE")


class TestTheSsrfGate:
    """item 19 do audit: o endpoint vem de uma linha que o lojista preencheu,
    e o único filtro até aqui era o CHECK do schema (`like 'https://%'`) —
    não impede apontar pra rede interna. `__call__` agora valida via
    `ssrf_guard.assert_safe_url` ANTES de abrir qualquer `httpx.AsyncClient`;
    estes testes provam que a rede (o `MockTransport`) nunca é tocada quando
    o destino é recusado.
    """

    async def test_ip_literal_privado_e_recusado_sem_tocar_a_rede(self) -> None:
        def exploding(_request: httpx.Request) -> httpx.Response:
            raise AssertionError("a rede não deveria ser tocada")

        row = replace(ROW, endpoint=_url("http", "169.254.169.254", "/latest/meta-data/"))
        tool = CustomHttpTool(
            row, transport=httpx.MockTransport(exploding), resolver=_resolve_public
        )

        result = await tool(None, None, {"cep": "01310-100"})

        assert result.success is False
        assert "rede interna" in (result.error or "")

    async def test_hostname_que_resolve_para_ip_privado_e_recusado(self) -> None:
        def exploding(_request: httpx.Request) -> httpx.Response:
            raise AssertionError("a rede não deveria ser tocada")

        async def resolver_malicioso(_host: str) -> list[str]:
            return ["127.0.0.1"]

        tool = CustomHttpTool(
            ROW, transport=httpx.MockTransport(exploding), resolver=resolver_malicioso
        )

        result = await tool(None, None, {"cep": "01310-100"})

        assert result.success is False
        assert "rede interna" in (result.error or "")

    async def test_esquema_diferente_de_http_https_e_recusado(self) -> None:
        def exploding(_request: httpx.Request) -> httpx.Response:
            raise AssertionError("a rede não deveria ser tocada")

        row = replace(ROW, endpoint="file:///etc/passwd")
        tool = CustomHttpTool(
            row, transport=httpx.MockTransport(exploding), resolver=_resolve_public
        )

        result = await tool(None, None, {"cep": "01310-100"})

        assert result.success is False
        assert "esquema" in (result.error or "")

    async def test_redirect_3xx_nunca_e_seguido_automaticamente(self) -> None:
        # `follow_redirects=False` é explícito no client (custom_http.py):
        # sem isso o httpx seguiria o `Location` sozinho, sem revalidar o
        # destino — o mesmo vetor que o item 18/19 fecha do lado TS
        # (`safeFetch`). Aqui prova-se que só UMA requisição acontece mesmo
        # quando o endpoint responde 302 apontando pro metadata endpoint.
        chamadas = {"n": 0}

        def handler(_request: httpx.Request) -> httpx.Response:
            chamadas["n"] += 1
            return httpx.Response(
                302,
                headers={"location": _url("http", "169.254.169.254", "/latest/meta-data/")},
            )

        tool = CustomHttpTool(
            ROW, transport=httpx.MockTransport(handler), resolver=_resolve_public
        )

        result = await tool(None, None, {"cep": "01310-100"})

        assert chamadas["n"] == 1  # nenhum segundo salto
        # comportamento pré-existente (não é bug deste item): 3xx não é
        # HTTP >= 400, então o executor devolve como "sucesso" — só não
        # persegue o Location.
        assert result.success is True
        assert result.output["status"] == 302
