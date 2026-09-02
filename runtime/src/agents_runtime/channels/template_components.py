"""O array `components` do envio de template — espelho de
`src/lib/whatsapp/template-components.ts:1-146`.

Paridade é a moeda do item 34: onde os dois motores existem, a forma é a do
TS. Cada função aqui tem a sua irmã lá, citada no comentário, e a linha do
outro lado é a fonte quando as duas discordarem.

A tabela `public.whatsapp_templates` guarda a mesma informação em DOIS
formatos (o `components` JSONB que a Meta devolve e as colunas achatadas
`header_type`/`body_text`/`buttons`) — o TS tolera os dois e este módulo
também, pela mesma ordem de precedência: o JSONB da Meta primeiro, o achatado
como fallback.

Uma divergência DECLARADA em relação ao TS: quando não há componente nenhum,
o TS manda `components: []` (`cloud-api.ts:325`, `meta-api.ts:141`) e aqui a
chave é OMITIDA. É o ruling A do item 34 — um template sem parâmetro tem que
sair byte a byte como saía antes deste item, e a Meta trata as duas formas
igual.
"""

import re
from dataclasses import dataclass
from typing import Any

from agents_runtime.repository.whatsapp_templates import TemplateShape

#: `VAR_REGEX` do TS (`template-components.ts:36`) — `{{1}}`, com folga para
#: o espaço que a Meta às vezes devolve.
_VARIABLE = re.compile(r"\{\{\s*\d+\s*\}\}")

#: `MEDIA_FORMATS` (`template-components.ts:37`). Um header destes exige um
#: link; um header TEXT não exige nada.
_MEDIA_FORMATS = ("IMAGE", "VIDEO", "DOCUMENT")


class TemplateParametersMissing(ValueError):
    """O template exige parâmetro e o envio não tem com que preenchê-lo.

    `ValueError` de propósito: o classificador (`queueing/failures.py`) lê o
    TIPO para decidir permanente ou transitório, e insistir num template que
    continua exigindo o que ninguém tem só queima a escada de retentativa.

    É a família do `TemplateComponentsError` do TS
    (`template-components.ts:27-34`), sem os quatro códigos: lá eles viram
    corpo de resposta HTTP para o operador; aqui o destino é `last_error` da
    outbox e um alerta, e o texto é que precisa ser legível.
    """


@dataclass(frozen=True, slots=True)
class _Provided:
    body_variables: tuple[str, ...]
    header_media_url: str | None
    button_variables: tuple[str, ...]


def _component(shape: TemplateShape, kind: str) -> dict | None:
    """`findComponent` (`template-components.ts:39-43`)."""
    for entry in shape.components or ():
        if isinstance(entry, dict) and str(entry.get("type") or "").upper() == kind:
            return entry
    return None


def header_format(shape: TemplateShape) -> str | None:
    """`getHeaderFormat` (`template-components.ts:45-60`): o JSONB da Meta
    manda, o `header_type` achatado é o fallback."""
    header = _component(shape, "HEADER")
    if header is not None:
        fmt = str(header.get("format") or "TEXT").upper()
        return fmt if fmt == "TEXT" or fmt in _MEDIA_FORMATS else None
    flat = str(shape.header_type or "").upper()
    return flat if flat == "TEXT" or flat in _MEDIA_FORMATS else None


def body_text(shape: TemplateShape) -> str:
    """`getBodyText` (`template-components.ts:62-65`)."""
    body = _component(shape, "BODY")
    if body is not None and body.get("text") is not None:
        return str(body["text"])
    return shape.body_text or ""


def count_body_variables(text: str | None) -> int:
    """`countBodyVariables` (`template-components.ts:67-71`).

    Conta do TEXTO, não da coluna `body_variables`/`variables_count`: as
    colunas são desnormalização do sync do TS e podem estar defasadas, e o
    que a Meta valida é o corpo aprovado.
    """
    return len(_VARIABLE.findall(text)) if text else 0


def dynamic_url_button_indexes(shape: TemplateShape) -> list[int]:
    """`getDynamicUrlButtonIndexes` (`template-components.ts:79-90`)."""
    buttons = _component(shape, "BUTTONS")
    entries = buttons.get("buttons") if isinstance(buttons, dict) else None
    if not isinstance(entries, list):
        entries = shape.buttons if isinstance(shape.buttons, list) else []
    return [
        index
        for index, button in enumerate(entries)
        if isinstance(button, dict)
        and str(button.get("type") or "").upper() == "URL"
        and _VARIABLE.search(str(button.get("url") or ""))
    ]


def _provided(template: dict[str, Any]) -> _Provided:
    """O que o payload da outbox trouxe.

    Hoje: nada, sempre — nenhuma fonte do caminho do runtime carrega valor de
    variável (auditoria item 34, ruling D: `channel_template_policies`,
    `commercial_moments.template_readiness` e o retorno de
    `internal.sender_preflight` devolvem nome e idioma e mais nada). Os nomes
    são os do TS (`bodyVars`/`headerMediaUrl`/`buttonVars`,
    `template-components.ts:93`) em snake_case, para que o dia em que produto
    decidir a semântica seja um `insert`, não uma reescrita.
    """
    def texts(key: str) -> tuple[str, ...]:
        value = template.get(key)
        return tuple(str(item) for item in value) if isinstance(value, list) else ()

    url = template.get("header_media_url")
    return _Provided(
        body_variables=texts("body_variables"),
        header_media_url=str(url).strip() if isinstance(url, str) and url.strip() else None,
        button_variables=texts("button_variables"),
    )


def build_components(
    shape: TemplateShape | None, template: dict[str, Any], *, described_as: str
) -> list[dict]:
    """`buildTemplateComponents` (`template-components.ts:92-146`), com o
    "não sei" do ruling C a mais.

    `shape=None` significa que a org nunca sincronizou aquele nome+idioma —
    não é "não exige parâmetro". Aí não há o que validar: sai o que o payload
    trouxer, e recusar por ausência de sincronização calaria uma loja que hoje
    funciona.

    `described_as` é como o template aparece no erro ("nome (idioma)"): quem
    lê `last_error` precisa saber QUAL template pediu o que ninguém deu.
    """
    provided = _provided(template)
    components: list[dict] = []

    if shape is None:
        if provided.body_variables:
            components.append(_body(provided.body_variables))
        return components

    # Header de mídia: `missing_header_media` (`template-components.ts:96-115`).
    # O `invalid_header_media` do TS (URL não-https) não tem irmão aqui porque
    # nenhuma URL entra no runtime hoje para ser validada — quando entrar, é a
    # mesma checagem.
    fmt = header_format(shape)
    if fmt is not None and fmt != "TEXT":
        if provided.header_media_url is None:
            raise TemplateParametersMissing(
                f"payload inválido: template {described_as} exige mídia de cabeçalho"
                f" ({fmt}) e o envio não trouxe nenhuma URL — ninguém no runtime"
                " preenche mídia de template hoje (auditoria item 34, ruling D)"
            )
        media = fmt.lower()
        link = {"link": provided.header_media_url}
        components.append({"type": "header", "parameters": [{"type": media, media: link}]})

    # Corpo: `body_vars_mismatch` (`template-components.ts:117-132`).
    expected = count_body_variables(body_text(shape))
    if expected != len(provided.body_variables):
        raise TemplateParametersMissing(
            f"payload inválido: template {described_as} espera {expected} variável(is)"
            f" de corpo e o envio trouxe {len(provided.body_variables)} — ninguém no"
            " runtime preenche {{1}} hoje (auditoria item 34, ruling D)"
        )
    if provided.body_variables:
        components.append(_body(provided.body_variables))

    # Botões de URL dinâmica: `button_vars_mismatch` (`template-components.ts:134-145`).
    indexes = dynamic_url_button_indexes(shape)
    if len(indexes) != len(provided.button_variables):
        raise TemplateParametersMissing(
            f"payload inválido: template {described_as} tem {len(indexes)} botão(ões) de"
            f" URL dinâmica e o envio trouxe {len(provided.button_variables)} valor(es)"
            " — ninguém no runtime preenche botão de template hoje"
            " (auditoria item 34, ruling D)"
        )
    for position, index in enumerate(indexes):
        components.append(
            {
                "type": "button",
                "sub_type": "url",
                "index": str(index),
                "parameters": [{"type": "text", "text": provided.button_variables[position]}],
            }
        )

    return components


def _body(variables: tuple[str, ...]) -> dict:
    return {"type": "body", "parameters": [{"type": "text", "text": text} for text in variables]}
