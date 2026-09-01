"""A tool custom do lojista (10.7/D7) — HTTP read-only no tool-loop.

A regra dupla, do lado do CÓDIGO: este executor lê e consulta, nunca concede.
Estruturalmente ele não alcança o offer engine nem as tabelas de incentivo —
só faz UMA chamada HTTP (GET ou POST; qualquer outro método morre no
construtor, espelhando o CHECK do schema) e devolve a resposta para o modelo
ler. O endpoint vem da linha do banco, então nenhum host existe aqui dentro
(o fitness de rede segue valendo: adapters têm hosts, isto aqui tem porta).

Validação ANTES da rede: argumento desconhecido, obrigatório ausente ou tipo
errado viram `success=False` legível — o modelo precisa do erro para dizer
"não consegui consultar", e um provedor caído jamais vira exceção no turno.

SSRF (item 19 do audit): o CHECK do schema (`endpoint like 'https://%'`) pega
o erro de digitação no cadastro, mas não impede o endpoint de apontar pra
rede interna em runtime. `__call__` valida o endpoint via
`ssrf_guard.assert_safe_url` — que resolve o host e confere o(s) IP(s) —
ANTES de abrir o `httpx.AsyncClient`. `follow_redirects=False` fica explícito
no client (era o padrão do httpx, mas explícito documenta a intenção): sem
isso, um 3xx do endpoint seria perseguido automaticamente sem revalidar o
destino, reabrindo o mesmo buraco que o guard fecha.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from agents_runtime.agent_core.llm import ToolSpec
from agents_runtime.agent_core.providers import decode_stored_key
from agents_runtime.tools.base import ToolResult
from agents_runtime.tools.ssrf_guard import Resolver, SsrfBlocked, assert_safe_url

#: O corpo devolvido ao modelo é truncado aqui: resposta gigante vira custo
#: de prompt e não vira informação.
MAX_BODY_CHARS = 3000

_ALLOWED_METHODS = ("GET", "POST")
_PARAM_TYPES = {"string": str, "number": (int, float), "boolean": bool}


@dataclass(frozen=True, slots=True)
class CustomToolRow:
    """Uma linha de ai_agent_custom_tools, já carregada pelo repository."""

    name: str
    label: str
    description: str
    when_to_use: str
    endpoint: str
    method: str
    auth_header_name: str
    auth_header_value: str | None
    params: tuple[Mapping[str, Any], ...]
    timeout_ms: int

    def __post_init__(self) -> None:
        if self.method not in _ALLOWED_METHODS:
            raise ValueError(
                f"tool custom só lê e consulta: método {self.method!r} não é um de "
                f"{_ALLOWED_METHODS}"
            )


def tool_spec_for(row: CustomToolRow) -> ToolSpec:
    """O que o modelo lê. A postura read-only está no TEXTO também: a UI diz
    a mesma coisa (regra dupla)."""
    properties: dict[str, Any] = {}
    required: list[str] = []
    for param in row.params:
        properties[str(param["name"])] = {
            "type": str(param.get("type") or "string"),
            "description": str(param.get("description") or ""),
        }
        if param.get("required"):
            required.append(str(param["name"]))
    return ToolSpec(
        name=row.name,
        description=(
            f"{row.description} Use quando: {row.when_to_use} "
            "Esta ferramenta APENAS CONSULTA dados externos — nunca cria "
            "benefício, cupom ou desconto."
        ),
        parameters={"type": "object", "properties": properties, "required": required},
    )


class CustomHttpTool:
    """Executor genérico de UMA tool custom. `run_tool` registra a trilha."""

    def __init__(
        self,
        row: CustomToolRow,
        *,
        base_secret: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver | None = None,
    ) -> None:
        self.name = row.name
        self._row = row
        self._base_secret = base_secret
        self._transport = transport
        self._resolver = resolver

    def _validate(self, arguments: Mapping[str, Any]) -> str | None:
        known = {str(p["name"]) for p in self._row.params}
        unknown = set(arguments) - known
        if unknown:
            return f"argumentos desconhecidos: {sorted(unknown)}"
        for param in self._row.params:
            name = str(param["name"])
            if param.get("required") and name not in arguments:
                return f"argumento obrigatório ausente: {name}"
            if name in arguments:
                expected = _PARAM_TYPES.get(str(param.get("type") or "string"), str)
                value = arguments[name]
                if isinstance(value, bool) and expected is not bool:
                    return f"{name}: esperava {param.get('type')}, veio boolean"
                if not isinstance(value, expected):
                    return f"{name}: esperava {param.get('type')}, veio {type(value).__name__}"
        return None

    async def __call__(
        self,
        conn: Any,
        context: Any,
        arguments: Mapping[str, Any],
    ) -> ToolResult:
        problem = self._validate(arguments)
        if problem is not None:
            return ToolResult(tool=self.name, success=False, error=problem)

        try:
            safe_url = await assert_safe_url(self._row.endpoint, resolver=self._resolver)
        except SsrfBlocked as blocked:
            return ToolResult(tool=self.name, success=False, error=str(blocked))

        headers: dict[str, str] = {}
        if self._row.auth_header_value:
            headers[self._row.auth_header_name] = decode_stored_key(
                self._row.auth_header_value, base_secret=self._base_secret
            )

        timeout = httpx.Timeout(self._row.timeout_ms / 1000)
        try:
            async with httpx.AsyncClient(
                timeout=timeout, transport=self._transport, follow_redirects=False
            ) as client:
                if self._row.method == "GET":
                    response = await client.get(
                        str(safe_url), params=dict(arguments), headers=headers
                    )
                else:
                    response = await client.post(
                        str(safe_url), json=dict(arguments), headers=headers
                    )
        except httpx.HTTPError as error:
            return ToolResult(
                tool=self.name, success=False, error=f"consulta falhou: {error}"
            )

        body = self._parse_body(response)
        if response.status_code >= 400:
            return ToolResult(
                tool=self.name,
                success=False,
                error=f"HTTP {response.status_code} do endpoint da tool",
                output={"status": response.status_code, "body": body},
            )
        return ToolResult(
            tool=self.name,
            success=True,
            output={"status": response.status_code, "body": body},
        )

    @staticmethod
    def _parse_body(response: httpx.Response) -> Any:
        try:
            body: Any = response.json()
        except ValueError:
            body = response.text
        serialized = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
        if len(serialized) > MAX_BODY_CHARS:
            return serialized[:MAX_BODY_CHARS] + "…(truncado)"
        return body
