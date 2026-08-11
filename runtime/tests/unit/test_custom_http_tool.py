"""10.7 — a tool custom: HTTP read-only no tool-loop, nunca concede.

O executor genérico valida os argumentos contra o spec tipado ANTES de
qualquer rede, aplica o header de auth decodificado pelo codec da casa,
faz GET (query) ou POST (json), respeita o timeout da linha e devolve a
resposta truncada. Falha de rede é resposta legível (success=False), nunca
exceção — o modelo precisa ler o erro para dizer "não consegui consultar".

MockTransport: nada aqui abre socket; o endpoint vem da linha do banco, e
por isso NENHUM host aparece hardcoded (o fitness de rede continua valendo).
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
        tool = CustomHttpTool(ROW, transport=capturing(seen, {"valor": 23.9}))

        result = await tool(None, None, {"cep": "01310-100"})

        assert result.success is True
        assert result.output == {"status": 200, "body": {"valor": 23.9}}
        assert seen["method"] == "GET"
        assert "cep=01310-100" in seen["url"]
        assert seen["auth"] == "Bearer token-plaintext"

    async def test_post_sends_args_as_json_body(self) -> None:
        seen: dict = {}
        row = replace(ROW, method="POST")
        tool = CustomHttpTool(row, transport=capturing(seen, {"ok": True}))

        result = await tool(None, None, {"cep": "01310-100", "peso_kg": 2.5})

        assert result.success is True
        assert seen["method"] == "POST"
        assert json.loads(seen["body"]) == {"cep": "01310-100", "peso_kg": 2.5}

    async def test_a_missing_required_param_never_reaches_the_network(self) -> None:
        def exploding(_request: httpx.Request) -> httpx.Response:
            raise AssertionError("a rede não deveria ser tocada")

        tool = CustomHttpTool(ROW, transport=httpx.MockTransport(exploding))
        result = await tool(None, None, {})

        assert result.success is False
        assert "cep" in (result.error or "")

    async def test_a_wrong_type_is_refused(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {}))
        result = await tool(None, None, {"cep": "01310-100", "peso_kg": "pesado"})
        assert result.success is False
        assert "peso_kg" in (result.error or "")

    async def test_an_unknown_arg_is_refused(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {}))
        result = await tool(None, None, {"cep": "01310-100", "grant_id": "x"})
        assert result.success is False

    async def test_a_provider_error_is_a_readable_answer(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {"erro": "sem cobertura"}, 503))
        result = await tool(None, None, {"cep": "01310-100"})
        assert result.success is False
        assert "503" in (result.error or "")

    async def test_a_huge_body_is_truncated(self) -> None:
        tool = CustomHttpTool(ROW, transport=capturing({}, {"blob": "x" * 20_000}))
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
