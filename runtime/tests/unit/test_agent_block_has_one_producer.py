"""O bloco AGENTE tem um produtor só, e ele lê as colunas de verdade (item 45).

Duas afirmações, porque uma sozinha não fecha o buraco:

  · o VALOR — `agent_block(version, settings)` mapeia `ActiveVersion` em
    `AgentBlock` sem literal nenhum. É a fatia que prova que a apresentação e
    as adaptações escolhidas na radial chegam ao prompt;

  · a FORMA — `AgentBlock(` é construído num lugar só em `src/`. A função pura
    não impede um quarto site de nascer à mão com literais, que é exatamente
    como este bug nasceu: `d4fbc23a` criou o `_preview` do listener com
    `presentation_mode="nome_funcao"` e `adaptation=()` antes das colunas
    existirem, e `4a009997` — seis horas depois, no mesmo dia — ensinou
    responder e toucher a lê-las sem passar por `server.py`. Suíte verde o
    tempo todo, e o preview mentindo.

A asserção de forma segue o molde de `test_listener_connects_in_one_guarded_place.py`
e escapa da objeção do item 40 (teste que codifica COMO o código está escrito):
ela não olha keywords, ordem, linha nem tipos de nó — só conta produtores. Quem
refatora direito não quebra; quem replanta o fóssil quebra.
"""

import ast
import uuid
from pathlib import Path

import pytest

import agents_runtime
from agents_runtime.agent_core.prompt_compiler import agent_block
from agents_runtime.repository.agent import (
    ActiveVersion,
    AgentConfig,
    TenantPolicy,
    TenantSettings,
)

_SRC = Path(agents_runtime.__file__).parent
_VERSION_ID = uuid.UUID(int=1)


def _producers() -> list[str]:
    """Os módulos de `src/` que constroem `AgentBlock(...)`, com repetição."""
    found: list[str] = []
    for path in sorted(_SRC.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            target = node.func
            name = (
                target.attr
                if isinstance(target, ast.Attribute)
                else target.id
                if isinstance(target, ast.Name)
                else None
            )
            if name == "AgentBlock":
                found.append(path.relative_to(_SRC).as_posix())
    return found


def _settings(language: str = "pt-BR") -> TenantSettings:
    return TenantSettings(
        policy=TenantPolicy(primary_language=language, never_say_ai=True),
        shadow_until=None,
    )


def _version(**overrides) -> ActiveVersion:
    base = {
        "id": _VERSION_ID,
        "config": AgentConfig(model="gpt-4o-mini", base_prompt="Atenda bem."),
        "name": "Bia",
    }
    return ActiveVersion(**{**base, **overrides})


class TestTheAgentBlockIsBuiltInOnePlace:
    def test_only_one_module_constructs_it(self) -> None:
        assert _producers() == ["agent_core/prompt_compiler.py"], (
            "voltou a existir mais de um produtor de AgentBlock: "
            f"{_producers()}. Foi assim que o preview ficou dois commits atrás "
            "do turno — construa pelo `agent_block(version, settings)`."
        )


class TestWhatTheAgentBlockCarries:
    def test_the_columns_the_radial_writes_arrive_whole(self) -> None:
        """Apresentação e adaptação vêm da coluna, nunca de literal."""
        version = _version(
            presentation_mode="discreta",
            client_adaptation={
                "mirror_tone": True,
                "emoji_if_client": True,
                "mirror_length": False,
            },
        )

        block = agent_block(version, _settings())

        assert block.presentation_mode == "discreta"
        # A ponte de vocabulário entre a radial (`emoji_if_client`) e o compiler
        # (`emoji`) é de `ActiveVersion.adaptation_flags` — e sobrevive aqui.
        assert set(block.adaptation) == {"mirror_tone", "emoji"}

    def test_persona_wins_and_the_tenant_language_is_the_floor(self) -> None:
        version = _version(persona={"tone": "seco", "guidelines": ["Sem emoji."]})

        block = agent_block(version, _settings("es-AR"))

        assert (block.tone, block.language) == ("seco", "es-AR")
        assert block.guidelines == ("Sem emoji.",)
        assert block.base_instructions == "Atenda bem."

    def test_the_agent_id_falls_back_to_the_version_id(self) -> None:
        """Sem `agent_id` (versão órfã), o bloco não fica sem identidade."""
        block = agent_block(_version(persona={"language": "pt-PT"}), _settings())

        assert block.agent_id == str(_VERSION_ID)
        assert block.language == "pt-PT"


class TestTheConfigIsAValue:
    """Migrado de `test_prompt_layers.py:283-292` pelo item 56.

    Veio junto com o símbolo: `AgentConfig.__post_init__` é código que produção
    EXECUTA — `load_active_version` o atravessa em todo turno, pelos três call
    sites (`responder.py`, `toucher.py`, `server.py`) — e este é o único teste
    dele no repositório inteiro. Apagar `test_prompt_layers.py` sem trazê-lo
    deixaria a guarda sem trava em tier nenhum.
    """

    def test_an_empty_base_prompt_is_rejected(self) -> None:
        # A version with no base prompt would compose a prompt made only of
        # context and knowledge — an agent with no instructions at all.
        with pytest.raises(ValueError):
            AgentConfig(
                model="claude-sonnet-5",
                base_prompt="   ",
                scenario_prompts={},
                enabled_tools=(),
            )
