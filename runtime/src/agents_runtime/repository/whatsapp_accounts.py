"""A conta WhatsApp Cloud API ativa da org — via porta SECURITY DEFINER
(migration 20260901000001), no mesmo molde de `internal.active_shopify_store`
(stores.py): `whatsapp_business_accounts` é legada, sem RLS, e guarda o token
em DUAS colunas possíveis — `sender_role` não tem SELECT nela. A função valida
que a org pedida é a org da sessão e entrega só a conta ativa dela.

Duas colunas, não uma: `access_token_encrypted` (v2 secret-box) e o legado
`access_token` em claro, exatamente como `getAccessToken` do TS lê
(`src/lib/whatsapp/account-loader.ts:25-33`) — cifrada primeiro, texto puro
como fallback de transição. `resolve_token` decide qual vale e decifra;
`load_active_account` busca a linha, cru, como `stores.py` faz para a
Shopify — quem fala com o banco não é quem interpreta o formato do segredo.

Fix round 1 (item 20): a conexão que chama esta função é a do SENDER, e ela
NUNCA vem escopada para uma org — `app.py` abre um `sender_conn` só, para a
fila inteira, e `repository/engine.py` diz isso com todas as letras
(`alert_moment_suppression`: "a conexão do sender drena todas as orgs sem
escopo fixo — o escopo entra aqui, por operação"). A 1ª entrega deste item
não escopava em lugar nenhum: a review provou ao vivo que
`internal.active_whatsapp_business_account` recusava TODO envio em produção,
porque `current_app_organization_id()` vinha sempre NULL. O conserto é o
MESMO padrão de `alert_moment_suppression`, só que aqui — não em cada
chamador, que teria uma chance a mais de esquecer.
"""

from dataclasses import dataclass
from uuid import UUID

import psycopg

from agents_runtime.crypto.secret_box import decrypt_secret, is_encrypted_secret
from agents_runtime.repository.scope import scope_to_organization


class NoUsableToken(RuntimeError):
    """A conta ativa não tem token em NENHUMA das duas colunas."""


@dataclass(frozen=True, slots=True)
class WhatsAppAccountRow:
    id: UUID
    phone_number_id: str
    #: Como está no banco — pode faltar se só a outra coluna estiver preenchida.
    access_token: str | None
    access_token_encrypted: str | None


async def load_active_account(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> WhatsAppAccountRow | None:
    """Escopa a org NESTA operação, dentro da própria função — não confia em
    nenhum chamador ter escopado a conexão por fora (a do sender não escopa;
    ver docstring do módulo)."""
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        cursor = await conn.execute(
            "select id, phone_number_id, access_token, access_token_encrypted"
            " from internal.active_whatsapp_business_account(%s)",
            (organization_id,),
        )
        row = await cursor.fetchone()
    if row is None:
        return None
    return WhatsAppAccountRow(
        id=row[0], phone_number_id=row[1], access_token=row[2], access_token_encrypted=row[3]
    )


def resolve_token(account: WhatsAppAccountRow, *, base_secret: str) -> str:
    """Decifra a coluna que vale — cifrada primeiro, legado em claro depois.

    Nunca loga nem inclui o valor na exceção: quem chama não tem token para
    vazar, só sabe que a conta não tinha nenhum utilizável.
    """
    stored = account.access_token_encrypted or account.access_token
    if not stored:
        raise NoUsableToken(f"conta whatsapp {account.id} sem token (nem cifrado, nem legado)")
    if is_encrypted_secret(stored):
        return decrypt_secret(stored, base_secret=base_secret)
    return stored
