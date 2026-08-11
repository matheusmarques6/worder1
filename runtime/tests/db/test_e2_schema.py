"""O corte de schema do agente no Worder — o que nenhum passo posterior
re-decide barato.

· **Uma versão em produção por AGENTE é trabalho do BANCO**: a fonte de
  verdade é o índice parcial `idx_agent_versions_one_production` de
  ai_agent_versions — não código de aplicação. Uma segunda ativação tem que
  ser erro, não corrida que o hub por acaso perde.

· **O modelo é configuração por org** (D4): vive em ai_agents.model; trocar é
  UPDATE, nunca deploy. O Judge 1 NÃO está aqui — é fixo da plataforma.

· **A dimensão do embedding está congelada em 1536** (ai_agent_chunks é a base
  que o lojista já alimenta pela SourcesTab; o RAG do runtime lê dela).
"""

import psycopg
import pytest

from tests.db.conftest import TwoTenants
from tests.db.factories import (
    an_embedding,
    create_agent,
    create_agent_version,
    create_knowledge_chunk,
    create_llm_call,
)


class TestOnlyOneVersionCanBeInProduction:
    def test_a_second_production_version_for_the_same_agent_is_rejected(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        agent_id = create_agent(admin, two_tenants.a.id)
        create_agent_version(admin, two_tenants.a.id, status="active", agent_id=agent_id)

        with pytest.raises(psycopg.errors.UniqueViolation):
            create_agent_version(admin, two_tenants.a.id, status="active", agent_id=agent_id)

    def test_each_agent_keeps_its_own_production_version(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_agent_version(admin, two_tenants.a.id, status="active")
        b_active = create_agent_version(admin, two_tenants.b.id, status="active")

        assert b_active is not None

    def test_the_index_only_watches_production_rows(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # Histórico append-only: rascunhos e arquivadas empilham livremente.
        agent_id = create_agent(admin, two_tenants.a.id)
        for _ in range(3):
            create_agent_version(admin, two_tenants.a.id, status="draft", agent_id=agent_id)
        for _ in range(2):
            create_agent_version(admin, two_tenants.a.id, status="archived", agent_id=agent_id)

        rows = admin.execute(
            "select count(*) from public.ai_agent_versions where agent_id = %s",
            (agent_id,),
        ).fetchone()

        assert rows[0] == 5


class TestTheModelIsPerOrgConfiguration:
    def test_an_agent_without_an_explicit_model_gets_the_local_default(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        agent_id = create_agent(admin, two_tenants.a.id)

        model = admin.execute(
            "select model from public.ai_agents where id = %s", (agent_id,)
        ).fetchone()[0]

        assert model == "gpt-4o-mini"

    def test_two_orgs_can_run_different_models(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        a = create_agent(admin, two_tenants.a.id, model="claude-opus-5")
        b = create_agent(admin, two_tenants.b.id, model="claude-haiku-4-5")

        models = admin.execute(
            "select id, model from public.ai_agents where id = any(%s) order by model",
            ([a, b],),
        ).fetchall()

        assert [row[1] for row in models] == ["claude-haiku-4-5", "claude-opus-5"]


class TestTheEmbeddingDimensionIsFrozen:
    def test_a_chunk_with_1536_dimensions_is_stored(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        chunk_id = create_knowledge_chunk(admin, two_tenants.a.id)

        assert chunk_id is not None

    def test_a_vector_of_another_dimension_is_rejected(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        with pytest.raises(psycopg.Error, match="1536"):
            create_knowledge_chunk(admin, two_tenants.a.id, embedding=an_embedding(768))


class TestTheLlmCallKeepsTheRoutingTrail:
    def test_provider_and_model_are_recorded(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # A cascata D4 varia provider por org; sem as duas colunas a trilha de
        # custo não diz o que foi faturado.
        call_id = create_llm_call(admin, two_tenants.a.id, model="claude-sonnet-5")

        row = admin.execute(
            "select provider, model from internal.llm_calls where id = %s", (call_id,)
        ).fetchone()

        assert row == ("openrouter", "claude-sonnet-5")
