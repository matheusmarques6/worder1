"""A forma do template aprovado da org — via porta SECURITY DEFINER
(migration 20260901000009), no mesmo molde de `whatsapp_accounts.py`.

Por que uma porta e não um `grant select`: `public.whatsapp_templates` é uma
tabela LEGADA do lado TS e está **sem RLS** (nasce em
`20260812000001_agents_baseline_prereqs.sql:616-643`, `relrowsecurity = false`,
zero policies). Dar SELECT ao `sender_role` entregaria a ele os templates de
todas as organizações — o mesmo vazamento que o item 20 fechou em
`whatsapp_business_accounts`. A função valida que a org pedida é a org da
sessão antes de ler qualquer linha.

O que volta é CRU, de propósito: a tabela guarda a mesma informação em dois
formatos (o `components` JSONB da Meta e as colunas achatadas
`header_type`/`body_text`/`buttons`), e conciliar os dois é regra de negócio
que o TS já escreveu (`src/lib/whatsapp/template-components.ts:1-9`). Quem
espelha aquela regra é `channels/template_components.py` — quem fala com o
banco não interpreta o formato, exatamente como `resolve_token` não é quem
lê a linha.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg

from agents_runtime.repository.scope import scope_to_organization


@dataclass(frozen=True, slots=True)
class TemplateShape:
    """As colunas de forma, como estão no banco — nenhuma conciliada."""

    components: list[Any] | None
    header_type: str | None
    body_text: str | None
    buttons: list[Any] | None


async def load_template_shape(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, name: str, language: str
) -> TemplateShape | None:
    """Escopa a org NESTA operação, dentro da própria função — a conexão do
    sender drena a fila inteira e nunca vem escopada por fora (ver a docstring
    de `whatsapp_accounts.py`, onde essa lição custou uma review).

    `None` = a org não tem linha sincronizada para esse nome+idioma. Não é
    "não exige parâmetro": é "não sei", e quem chama decide o que fazer com a
    diferença.
    """
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        cursor = await conn.execute(
            "select components, header_type, body_text, buttons"
            " from internal.whatsapp_template_shape(%s, %s, %s)",
            (organization_id, name, language),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return TemplateShape(
        components=row[0] if isinstance(row[0], list) else None,
        header_type=row[1],
        body_text=row[2],
        buttons=row[3] if isinstance(row[3], list) else None,
    )
