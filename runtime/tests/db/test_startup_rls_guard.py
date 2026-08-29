"""A prova de que o processo não está enxergando o banco inteiro.

`worker_role` e `sender_role` são NOLOGIN de propósito (migration
20260812000002): senha em migration é segredo em git. Logo é impossível o
processo "logar COMO" seu role — `SET ROLE` é o único caminho, e ele vem de
`AGENTS_WORKER_SET_ROLE`/`AGENTS_SENDER_SET_ROLE`, que `app.py` tratava como
OPCIONAIS e hoje são exigidas na partida.

Sem elas o runtime roda como o dono do DSN. E como a camada de repositório foi
escrita sem `where organization_id` por princípio ("a RLS escopa"), um dono com
BYPASSRLS transforma toda leitura de missão, momento, contato, transcript e
grant em leitura cross-org — silenciosa, sem erro, sem alerta. O agente
responderia uma conversa com os dados de outra loja.

O que este arquivo trava é a checagem de partida: antes de qualquer trabalho, o
processo pergunta ao banco quem ele é e morre alto se a resposta for "alguém que
a RLS não alcança".

Detalhe que o stack local ensinou e que decide o formato da checagem: no
Supabase o `postgres` NÃO é superuser (`rolsuper = f`) mas TEM BYPASSRLS
(`rolbypassrls = t`). Uma guarda que olhasse só para `rolsuper` passaria batido
exatamente no caso perigoso.
"""

import pytest

from agents_runtime.app import _connect
from agents_runtime.repository.scope import RlsNotEnforced, assert_rls_enforced
from tests.support.database import as_platform, as_runtime_worker


class TestTheStartupGuard:
    async def test_it_refuses_a_connection_that_bypasses_rls(self, dsn: str) -> None:
        """O dono do DSN é exatamente a configuração que esquecer a env produz."""
        async with as_platform(dsn) as conn:
            with pytest.raises(RlsNotEnforced) as caught:
                await assert_rls_enforced(conn, "worker_role")

        # A mensagem precisa nomear o role: quem lê o log às 3h da manhã tem que
        # saber QUEM o processo virou, não só que algo está errado. E pelo motivo
        # CERTO: o privilégio, não o "role diferente do esperado" — que também
        # seria verdade aqui e diria muito menos.
        assert "postgres" in str(caught.value)
        assert "BYPASSRLS" in str(caught.value)

    async def test_it_accepts_the_connection_app_py_builds(self, dsn: str) -> None:
        """A mesma forma do pool de produção: autocommit + SET ROLE, sem escopo ainda.

        Este teste é também a única prova no repositório de que `worker_role` não
        tem BYPASSRLS — a afirmação que `tests/db/conftest.py` fazia sobre uma
        "leak suite" que nunca existiu.
        """
        async with as_runtime_worker(dsn) as conn:
            await assert_rls_enforced(conn, "worker_role")


class TestTheGuardIsWiredIntoTheOnlySeam:
    """`app._connect` é por onde TODA conexão de pool nasce — pulse, workers e
    sender. Guardar ali é guardar o processo; guardar em cada chamador seria
    diff maior e uma chance a mais de esquecer.
    """

    async def test_a_missing_role_env_never_becomes_a_running_process(self, dsn: str) -> None:
        with pytest.raises(RlsNotEnforced):
            await _connect(dsn, None)

    async def test_the_configured_role_connects_normally(self, dsn: str) -> None:
        conn = await _connect(dsn, "worker_role")
        try:
            assert not conn.closed
        finally:
            await conn.close()


class TestTheGuardDemandsAnIdentity:
    """Recusar superuser/BYPASSRLS é metade da guarda: um role comum passava.

    O caso é fail-closed (as policies são `to worker_role`/`to sender_role`, então
    ninguém lê nada), mas o processo SOBE e só morre no primeiro `permission
    denied` — longe da partida, no meio do turno de um contato. A partida é o
    lugar de descobrir isso.
    """

    async def test_a_missing_set_role_is_fatal_even_without_privilege(self, dsn: str) -> None:
        """A env ausente não pode depender de o dono do DSN ter BYPASSRLS.

        `as_runtime_worker` já é `worker_role`: sem privilégio nenhum, a checagem
        antiga passaria. O que morre aqui é o "nenhum role foi exigido".
        """
        async with as_runtime_worker(dsn) as conn:
            with pytest.raises(RlsNotEnforced) as caught:
                await assert_rls_enforced(conn, None)

        # Quem lê o log às 3h precisa da env, não de um diagnóstico.
        assert "AGENTS_WORKER_SET_ROLE" in str(caught.value)
        assert "AGENTS_SENDER_SET_ROLE" in str(caught.value)

    async def test_it_refuses_a_role_that_is_not_the_expected_one(self, dsn: str) -> None:
        """Trocar as duas envs de lugar é o erro de deploy que isto pega."""
        async with as_runtime_worker(dsn) as conn:
            with pytest.raises(RlsNotEnforced) as caught:
                await assert_rls_enforced(conn, "sender_role")

        message = str(caught.value)
        # Os DOIS nomes: o que o processo virou e o que ele deveria ter virado.
        assert "worker_role" in message
        assert "sender_role" in message
