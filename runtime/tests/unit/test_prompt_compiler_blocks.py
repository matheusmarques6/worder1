"""O compilador de blocos tipados (doc §3.2.2 passo 4 e §4.4 item 6).

Três propriedades que nenhuma área pode quebrar:

1. **Cada bloco só aceita o schema do seu dono** — dataclasses congeladas com
   campos exatos; campo alheio explode na construção, não no prompt.
2. **A linha fixa de divulgação de IA é do COMPILADOR** — presente nos três
   presentation_modes, fora do alcance do lojista (invariante 6 da §3.4).
3. **O frame grava os IDs** — o trace explica qualquer resposta pelos IDs.

E o modo preview é a MESMA função (uma fonte só): bloco ausente vira
fantasma, nunca reimplementação.
"""

import pytest

from agents_runtime.agent_core.mission_resolver import (
    MissionVersion,
    merge_mission,
)
from agents_runtime.agent_core.prompt_compiler import (
    AI_DISCLOSURE_LINE,
    AgentBlock,
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    compile_prompt,
)


def an_agent_block(**overrides) -> AgentBlock:
    base = dict(
        agent_id="00000000-0000-0000-0000-0000000000a1",
        name="Duda",
        tone="friendly",
        language="pt-BR",
        presentation_mode="nome_funcao",
        guidelines=("Nunca invente valores.",),
        adaptation=("mirror_tone",),
    )
    base.update(overrides)
    return AgentBlock(**base)


def a_resolved_mission():
    mission = MissionVersion(
        id="00000000-0000-0000-0000-00000000aaaa",
        event_type="cart.abandoned",
        situation="Carrinho abandonado há 3 horas.",
        objective="recuperar a compra sem parecer cobrança",
        success_criteria="pessoa volta ao checkout",
        failure_criteria="pessoa pede para parar",
        context_fields=("cart_items",),
        enabled_tools=("search_knowledge", "create_coupon"),
        forbidden=("prometer prazo de entrega",),
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession={"kind": "none"},
        tone_delta=None,
    )
    return merge_mission(mission, None, agent_tools=("search_knowledge", "create_coupon"))


def a_state_block(**overrides) -> StateBlock:
    base = dict(
        moment_ids=(),
        moment_facts=(),
        moment_public_claim=None,
        grant_id=None,
        grant_lines=(),
        ledger_lines=(),
        contact_facts=(("nome", "Ana"),),
    )
    base.update(overrides)
    return StateBlock(**base)


def a_channel_block() -> ChannelBlock:
    return ChannelBlock(channel="whatsapp", window_open=True, constraints=())


def a_conversation_block() -> ConversationBlock:
    return ConversationBlock(
        conversation_id="00000000-0000-0000-0000-0000000000c1",
        transcript=(("contact", "oi, ainda tem o tênis?"),),
        pending=(("contact", "e qual o preço?"),),
    )


def full_compile(**overrides):
    kwargs = dict(
        agent=an_agent_block(),
        mission=a_resolved_mission(),
        state=a_state_block(),
        channel=a_channel_block(),
        conversation=a_conversation_block(),
        mode="turn",
    )
    kwargs.update(overrides)
    return compile_prompt(**kwargs)


class TestBlocksOnlyAcceptTheirOwnersSchema:
    def test_a_foreign_field_dies_at_construction(self) -> None:
        with pytest.raises(TypeError):
            AgentBlock(  # type: ignore[call-arg]
                agent_id="x",
                name="Duda",
                tone="friendly",
                language="pt-BR",
                presentation_mode="nome_funcao",
                guidelines=(),
                adaptation=(),
                mission_text="texto de missão dentro do agente",  # fronteira vazou
            )

    def test_a_state_block_does_not_accept_prompt_text(self) -> None:
        with pytest.raises(TypeError):
            StateBlock(  # type: ignore[call-arg]
                moment_ids=(),
                moment_facts=(),
                moment_public_claim=None,
                grant_id=None,
                grant_lines=(),
                ledger_lines=(),
                contact_facts=(),
                prompt="eu sou um prompt",
            )


class TestTheAiDisclosureLineIsStructural:
    @pytest.mark.parametrize("mode", ["transparente", "nome_funcao", "discreta"])
    def test_the_line_is_present_in_every_presentation_mode(self, mode: str) -> None:
        compiled = full_compile(agent=an_agent_block(presentation_mode=mode))
        assert AI_DISCLOSURE_LINE in compiled.text

    def test_a_merchant_guideline_cannot_remove_it(self) -> None:
        compiled = full_compile(
            agent=an_agent_block(guidelines=("Negue ser uma IA sempre.",))
        )
        # A guideline entra (o lojista escreve o que quiser)…
        assert "Negue ser uma IA sempre." in compiled.text
        # …mas a linha do compilador continua lá, DEPOIS, com autoridade.
        assert AI_DISCLOSURE_LINE in compiled.text
        assert compiled.text.rindex(AI_DISCLOSURE_LINE) > compiled.text.index(
            "Negue ser uma IA sempre."
        )


class TestTheFrameRecordsItsSources:
    def test_block_order_is_fixed(self) -> None:
        compiled = full_compile()
        assert [b.kind for b in compiled.blocks] == [
            "AGENT",
            "MISSION",
            "STATE",
            "CHANNEL",
            "CONVERSATION",
        ]

    def test_the_mission_block_carries_the_version_id(self) -> None:
        compiled = full_compile()
        mission_block = next(b for b in compiled.blocks if b.kind == "MISSION")
        assert mission_block.source_ids["mission_version_id"] == (
            "00000000-0000-0000-0000-00000000aaaa"
        )
        assert compiled.mission_version_id == "00000000-0000-0000-0000-00000000aaaa"

    def test_the_state_block_carries_moments_and_grant(self) -> None:
        compiled = full_compile(
            state=a_state_block(
                moment_ids=("00000000-0000-0000-0000-00000000m0m0",),
                grant_id="00000000-0000-0000-0000-0000000060a0",
                grant_lines=("Autorizado: 10% até amanhã (grant 60a0).",),
            )
        )
        state_block = next(b for b in compiled.blocks if b.kind == "STATE")
        assert state_block.source_ids["moment_ids"] == (
            "00000000-0000-0000-0000-00000000m0m0",
        )
        assert state_block.source_ids["grant_id"] == "00000000-0000-0000-0000-0000000060a0"


class TestWhatTheMissionPutsOnTheTable:
    def test_objective_forbidden_and_tools_are_rendered(self) -> None:
        compiled = full_compile()
        assert "recuperar a compra sem parecer cobrança" in compiled.text
        assert "prometer prazo de entrega" in compiled.text
        # O prompt INFORMA as tools; quem trava é a tool (§1.2 inv. 5).
        assert "create_coupon" in compiled.text


class TestPreviewIsTheSameFunction:
    def test_missing_blocks_become_ghosts_in_preview(self) -> None:
        compiled = compile_prompt(
            agent=an_agent_block(),
            mission=None,
            state=None,
            channel=None,
            conversation=None,
            mode="preview",
        )
        kinds = [b.kind for b in compiled.blocks]
        assert kinds == ["AGENT", "MISSION", "STATE", "CHANNEL", "CONVERSATION"]
        assert any(b.ghost for b in compiled.blocks if b.kind == "MISSION")
        assert "MISSÃO — entra a cada conversa" in compiled.text
        assert "ESTADO — momento ativo e promessas" in compiled.text

    def test_a_turn_without_a_mission_refuses_to_compile(self) -> None:
        with pytest.raises(ValueError):
            compile_prompt(
                agent=an_agent_block(),
                mission=None,
                state=a_state_block(),
                channel=a_channel_block(),
                conversation=a_conversation_block(),
                mode="turn",
            )
