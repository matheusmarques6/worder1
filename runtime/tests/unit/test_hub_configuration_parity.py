"""IA-10/21/22/30-36/58: execute consumers of the TS-verified wire payload.

The fixture is checked against real hubToAgentPatch output by Vitest. Keeping
one literal contract means a writer-only or reader-only key rename fails.
Database and external transports are simulated; no Meta/LLM claim is made.
"""

import json
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from agents_runtime.agent_core import responder, toucher
from agents_runtime.agent_core.guards import resolve_blocked_topic, resolve_handoff
from agents_runtime.agent_core.handoff import handoff_destination
from agents_runtime.agent_core.llm import ChatResult, EmbeddingResult, ToolCall, Usage
from agents_runtime.agent_core.metering import monthly_block
from agents_runtime.agent_core.mission_resolver import MissionVersion, merge_mission
from agents_runtime.agent_core.prompt_compiler import agent_block, compile_prompt
from agents_runtime.agent_core.providers import select_provider_key
from agents_runtime.judges.pre_send import (
    PASS,
    Judgement,
    RubricVerdict,
    with_merchant_judges,
)
from agents_runtime.queueing.sender import send_humanized
from agents_runtime.repository.agent import TenantPolicy, TenantSettings, _as_version
from agents_runtime.repository.budget import load_monthly_spend
from agents_runtime.repository.knowledge import KnowledgeChunk
from agents_runtime.repository.orders import PurchaseHistory
from agents_runtime.repository.outbox import ClaimedSend
from agents_runtime.repository.provider_keys import ProviderKeyRow
from agents_runtime.tools import builtin
from agents_runtime.tools import knowledge as knowledge_tool
from agents_runtime.tools.base import ToolContext
from tests.support.clock import FrozenClock
from tests.support.fake_conn import RecordingConnection
from tests.unit import test_accepted_trace_producers as producers

producer_env = producers.producer_env

WIRE = json.loads(
    (Path(__file__).resolve().parents[3]
     / "src/lib/ai/__tests__/fixtures/hub-runtime-agent.json").read_text(encoding="utf-8")
)
TEMPLATES = json.loads(
    (Path(__file__).resolve().parents[3]
     / "src/lib/ai/__tests__/fixtures/hub-runtime-templates.json").read_text(encoding="utf-8")
)
ADAPTATIONS = [
    ("mirror_tone", "Espelhe o tom do cliente"),
    ("mirror_length", "Espelhe o tamanho das mensagens"),
    ("emoji_if_client", "Use emoji só se o cliente usar primeiro"),
    ("insist_less_after_complaint", "Se a pessoa já reclamou antes, insista menos"),
    ("distinct_greeting_repeat_buyer", "Sauda quem já comprou como recorrente"),
]


def version_from_wire(row=None):
    row = WIRE if row is None else row
    # The actual DB-row decoder, not a hand-built substitute ActiveVersion.
    return _as_version((uuid4(), row["model"], row["system_prompt"], UUID(row["id"]),
                        row["name"], row["persona"], row["settings"], row["provider"],
                        row["presentation_mode"], row["client_adaptation"], None))


def prompt(row):
    return compile_prompt(
        agent=agent_block(version_from_wire(row), TenantSettings(TenantPolicy("pt-BR", True))),
        mission=None, state=None, channel=None, conversation=None, mode="preview",
    ).text


@pytest.mark.parametrize("template", TEMPLATES, ids=lambda row: row["id"])
def test_ia10_every_real_template_reaches_all_its_runtime_consumers(template):
    # Vitest binds these frozen snapshots to AGENT_TEMPLATES + templateJudges.
    row = {**template, "id": WIRE["id"]}
    version = version_from_wire(row)
    rendered = prompt(row)
    assert template["system_prompt"] in rendered
    for rule in template["persona"]["guidelines"]:
        assert f"Diretriz: {rule}" in rendered
    for flag, instruction in ADAPTATIONS:
        assert (instruction in rendered) is bool(template["client_adaptation"].get(flag))
    for topic in template["settings"]["safety"]["blocked_topics"]:
        assert resolve_blocked_topic(version.settings, topic) == topic
    for phrase in template["settings"]["safety"]["handoff_keywords"]:
        handoff = resolve_handoff(version.settings, (phrase,))
        assert handoff is not None
        assert handoff.confirmation == template["settings"]["safety"][
            "handoff_confirmation_message"
        ]
    wanted = set(template["settings"]["tools"]["enabled"]) - {
        "search_knowledge", "create_coupon",
    }
    assert {name for name, _, _ in builtin.builtin_tools_for(
        version.config.enabled_tools, has_store=True,
    )} == wanted
    criteria = with_merchant_judges({}, version.settings)["lojista"].criteria
    assert [item.description for item in criteria] == [
        item["criterion"] for item in template["settings"]["judges"]["custom"]
    ]


@pytest.mark.parametrize(("voice", "description"), [
    ("casual", "leve e próximo"), ("friendly", "caloroso e simples"),
    ("professional", "cordial e objetivo"), ("luxury", "vocabulário cuidado"),
])
def test_ia21_voice_reaches_prompt_as_portuguese_instructions(voice, description):
    row = deepcopy(WIRE)
    row["persona"]["tone"] = voice
    assert description in prompt(row)
    assert WIRE["name"] in prompt(row)
    assert WIRE["system_prompt"] in prompt(row)


@pytest.mark.parametrize(("presentation", "instruction"), [
    ("transparente", "Apresente-se como a assistente virtual"),
    ("nome_funcao", "aqui é Aurora, do time da loja"),
    ("discreta", "Não se apresente espontaneamente"),
])
def test_ia22_presentation_selects_the_prompt_instruction(presentation, instruction):
    row = deepcopy(WIRE)
    row["presentation_mode"] = presentation
    assert instruction in prompt(row)


@pytest.mark.parametrize(("flag", "instruction"), ADAPTATIONS)
def test_ia10_30_each_adaptation_changes_the_prompt_independently(flag, instruction):
    row = deepcopy(WIRE)
    assert instruction in prompt(row)
    row["client_adaptation"][flag] = False
    rendered = prompt(row)
    assert instruction not in rendered
    for other, text in ADAPTATIONS:
        if other != flag:
            assert text in rendered


def test_ia31_32_rules_blocked_topics_and_active_judges_have_real_effects():
    assert "Diretriz: Informe o prazo oficial da loja." in prompt(WIRE)
    assert resolve_blocked_topic(WIRE["settings"], "Sobre o ASSUNTO CONFIDENCIAL")
    assert resolve_blocked_topic(WIRE["settings"], "O prazo é de cinco dias") is None
    rubrics = with_merchant_judges({}, WIRE["settings"])
    assert [(c.description, c.severity) for c in rubrics["lojista"].criteria] == [
        ("Confira o prazo na fonte oficial.", "standard"),
    ]
    empty = deepcopy(WIRE)
    empty["persona"]["guidelines"] = []
    empty["settings"]["safety"]["blocked_topics"] = []
    empty["settings"]["judges"]["custom"] = []
    assert "Diretriz:" not in prompt(empty)
    assert resolve_blocked_topic(empty["settings"], "assunto confidencial") is None
    assert with_merchant_judges({}, empty["settings"]) == {}


@pytest.mark.parametrize("phrase", ["quero uma pessoa", "suporte especializado"])
def test_ia33_35_every_phrase_resolves_the_saved_confirmation(phrase):
    handoff = resolve_handoff(WIRE["settings"], ("Olá", f"Por favor, {phrase}!"))
    assert handoff is not None
    assert handoff.keyword == phrase
    assert handoff.confirmation == "A equipe especializada continua daqui."
    assert resolve_handoff(WIRE["settings"], ("Qual o horário?",)) is None


@pytest.mark.parametrize("active", [True, False])
async def test_ia34_saved_destination_routes_only_to_an_active_same_org_agent(monkeypatch, active):
    destination = handoff_destination(WIRE["settings"])
    assert destination == UUID("22222222-2222-4222-8222-222222222222")
    monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())
    monkeypatch.setattr(builtin.agent_repo, "list_active_agents", AsyncMock(
        return_value=((destination, "Especialista", "Suporte"),) if active else (),
    ))
    assigned = AsyncMock()
    human = AsyncMock(return_value=True)
    monkeypatch.setattr(builtin.agent_repo, "assign_conversation_agent", assigned)
    monkeypatch.setattr(builtin, "transfer_to_human", human)
    context = ToolContext(organization_id=uuid4(), conversation_id=uuid4(),
                          agent_id=UUID(WIRE["id"]), handoff_agent_id=destination)

    @asynccontextmanager
    async def transaction():
        yield

    connection = SimpleNamespace(transaction=transaction)
    result = await builtin.TransferToHuman()(connection, context,
                                            {"reason": "complaint", "summary": "Revisar caso"})
    assert result.success
    if active:
        assert result.output["routed"] == "agent"
        assert assigned.await_args.kwargs["agent_id"] == destination
        assert assigned.await_args.kwargs["reset_owner_mission"] is True
        human.assert_not_awaited()
    else:
        assert result.output["transferred"] is True
        human.assert_awaited_once()
        assigned.assert_not_awaited()
    team = deepcopy(WIRE["settings"])
    team["safety"]["handoff_destination"] = None
    assert handoff_destination(team) is None


def test_ia58_tools_provider_and_coupon_authority_are_resolved_from_saved_values():
    version = version_from_wire()
    offered = builtin.builtin_tools_for(version.config.enabled_tools, has_store=True)
    assert {name for name, _, _ in offered} == {
        "transfer_to_human", "save_customer", "save_interests", "timeline",
        "product_lookup", "order_status",
    }
    assert all(tool.name == name == spec.name for name, tool, spec in offered)
    assert {name for name, _, _ in builtin.builtin_tools_for(
        version.config.enabled_tools, has_store=False,
    )} == {"transfer_to_human", "save_customer", "save_interests", "timeline"}
    assert builtin.builtin_tools_for((), has_store=True) == ()
    mission = MissionVersion("mission", "whatsapp.received", None, "Atender", None,
                             None, (), ("create_coupon", "unapproved"), (), 5, "stay",
                             False, {}, None)
    assert merge_mission(mission, None, agent_tools=version.config.enabled_tools).tools == (
        "create_coupon",
    )
    assert merge_mission(mission, None, agent_tools=()).tools == ()
    assert merge_mission(replace(mission, enabled_tools=()), None,
                         agent_tools=version.config.enabled_tools).tools == ()
    direct = ProviderKeyRow("anthropic", "tenant-direct-key", None)
    fallback = ProviderKeyRow("openrouter", "tenant-router-key", None)
    assert select_provider_key((fallback, direct), agent_provider=version.provider).api_key == (
        "tenant-direct-key"
    )
    assert select_provider_key((fallback,), agent_provider=version.provider).api_key == (
        "tenant-router-key"
    )


async def test_ia58_monthly_cap_is_read_and_blocks_at_the_saved_boundary():
    cursor = SimpleNamespace(fetchone=AsyncMock(
        return_value=(1, 500, 17.25, WIRE["monthly_cap_usd"], False),
    ))
    connection = SimpleNamespace(execute=AsyncMock(return_value=cursor))
    spend = await load_monthly_spend(connection, organization_id=uuid4(),
                                   agent_id=UUID(WIRE["id"]))
    assert spend.agent_cap_usd == 17.25
    values = dict(org_spent_usd=spend.org_spent_usd, org_limit_usd=spend.org_limit_usd,
                  agent_spent_usd=17.24, agent_cap_usd=spend.agent_cap_usd)
    assert monthly_block(**values) is None
    assert monthly_block(**{**values, "agent_spent_usd": 17.25}).scope == "agent"
    assert monthly_block(**{**values, "agent_spent_usd": 100, "agent_cap_usd": None}) is None


@pytest.mark.parametrize("split", [False, True])
@pytest.mark.parametrize("rhythm", [False, True])
async def test_ia36_delivery_settings_change_bubbles_presence_and_pacing(split, rhythm):
    row = deepcopy(WIRE)
    row["settings"]["delivery"].update(split_bubbles=split, typing_rhythm=rhythm)
    flags = responder.delivery_flags(version_from_wire(row).settings)
    assert flags == (split, rhythm)
    text = "Primeiro parágrafo com informação.\n\nSegundo parágrafo com o prazo."
    sent, presence = [], []

    async def send(_conn, payload):
        sent.append(payload.payload["text"])
        return f"wamid-{len(sent)}"

    async def mark_read(_conn, payload):
        presence.append(payload.last_inbound_wamid)

    clock = FrozenClock(datetime(2026, 10, 16, tzinfo=UTC))
    start = clock.now()
    payload = ClaimedSend(uuid4(), uuid4(), "whatsapp", "number", "+5511999999999",
                          {"text": text}, "parity-send", 0, last_inbound_wamid="real-inbound-id")
    delivered = await send_humanized(
        SimpleNamespace(send=send, mark_read_and_typing=mark_read), RecordingConnection(),
        payload, split=flags[0], humanize_delays=flags[1], clock=clock,
    )
    assert sent == (text.split("\n\n") if split else [text])
    assert len(delivered) == len(sent)
    assert presence == (["real-inbound-id"] * len(sent) if rhythm else [])
    assert (clock.now() > start) is (rhythm and split)


@pytest.mark.parametrize("producer_env", [responder, toucher], indirect=True)
@pytest.mark.parametrize("store", [False, True])
@pytest.mark.parametrize("enabled", [False, True])
async def test_ia58_real_reply_producers_use_saved_configuration(producer_env, store, enabled):
    env = producer_env
    version = version_from_wire()
    if not enabled:
        version = replace(version, config=replace(version.config, enabled_tools=()))
    if store:
        env.monkeypatch.setattr(env.module.orders_repo, "load_purchase_history", AsyncMock(
            return_value=PurchaseHistory(0, Decimal(0), "BRL", None, ()),
        ))
    resolution = responder.agent_repo.AgentResolution(version, "single_active")
    method = "resolve_agent_for_turn" if env.module is responder else "resolve_agent_for_mission"
    env.monkeypatch.setattr(env.module.agent_repo, method, AsyncMock(return_value=resolution))
    requests, configured_judges = [], []

    class Model:
        async def chat(self, request):
            requests.append(request)
            return ChatResult("Resposta verificada.", Usage(10, 2, 0), request.model)

    def judge_factory(_llm, rubrics):
        configured_judges.append(rubrics)

        async def judge(*_):
            return Judgement(PASS, 1, (RubricVerdict("quality", PASS, 1, ()),))
        return judge

    env.monkeypatch.setattr(env.module, "PreSendJudge", judge_factory)
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    draft = await factory("unused", llm=Model(), clock=env.clock)(env.job)
    assert draft.content == {"text": "Resposta verificada.",
                             "humanize": {"split": False, "rhythm": False}}
    assert len(requests) == 1
    assert requests[0].model == "anthropic/claude-sonnet-4.5"
    system = requests[0].messages[0].content
    assert "vocabulário cuidado" in system
    assert "Não se apresente espontaneamente" in system
    assert "Diretriz: Informe o prazo oficial da loja." in system
    assert all(line in system for _, line in ADAPTATIONS)
    wanted = {"transfer_to_human", "save_customer", "save_interests", "timeline"}
    if store:
        wanted.update({"product_lookup", "order_status"})
    assert {tool.name for tool in requests[0].tools} == (wanted if enabled else set())
    assert [criterion.description for criterion in configured_judges[0]["lojista"].criteria] == [
        "Confira o prazo na fonte oficial.",
    ]


@pytest.mark.parametrize("producer_env", [toucher], indirect=True)
async def test_ia34_proactive_builtin_uses_saved_destination_and_contact_scope(producer_env):
    env = producer_env
    version = version_from_wire()
    env.monkeypatch.setattr(toucher.agent_repo, "resolve_agent_for_mission", AsyncMock(
        return_value=toucher.agent_repo.AgentResolution(version, "entry"),
    ))
    destination = UUID("22222222-2222-4222-8222-222222222222")
    env.monkeypatch.setattr(builtin.agent_repo, "list_active_agents", AsyncMock(
        return_value=((destination, "Especialista", "Suporte"),),
    ))
    assigned, activity = AsyncMock(return_value=True), AsyncMock()
    env.monkeypatch.setattr(builtin.agent_repo, "assign_conversation_agent", assigned)
    env.monkeypatch.setattr(builtin.crm_repo, "add_activity", activity)
    env.monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())
    env.monkeypatch.setattr(toucher, "PreSendJudge", lambda *_: AsyncMock(return_value=(
        Judgement(PASS, 1, (RubricVerdict("quality", PASS, 1, ()),))
    )))

    class Model:
        calls = 0

        async def chat(self, request):
            self.calls += 1
            if self.calls == 1:
                return ChatResult("", Usage(), request.model, tool_calls=(
                    ToolCall("transfer", "transfer_to_human", {"reason": "complaint"}),
                ))
            return ChatResult("Especialista continua.", Usage(), request.model)

    draft = await toucher.build_toucher("unused", llm=Model(), clock=env.clock)(env.job)
    assert draft.content is None
    assert assigned.await_args.kwargs == {
        "conversation_id": env.job.conversation_id, "agent_id": destination,
        "reset_owner_mission": True,
    }
    assert activity.await_args.kwargs["organization_id"] == env.job.organization_id
    assert activity.await_args.kwargs["contact_id"] == (
        toucher.agent_repo.load_conversation_view.return_value.contact_id
    )
    assert activity.await_args.kwargs["metadata"]["from_agent_id"] == WIRE["id"]


@pytest.mark.parametrize("producer_env", [responder], indirect=True)
async def test_ia33_35_keyword_sends_confirmation_to_human_with_agent_destination(producer_env):
    env = producer_env
    version = version_from_wire()
    env.monkeypatch.setattr(responder.agent_repo, "resolve_agent_for_turn", AsyncMock(
        return_value=responder.agent_repo.AgentResolution(version, "single_active"),
    ))
    from agents_runtime.agent_core.think_gate import PendingMessage
    env.monkeypatch.setattr(responder.agent_repo, "load_pending_messages", AsyncMock(
        return_value=(PendingMessage("contact", "quero uma pessoa"),),
    ))
    human = AsyncMock(return_value=True)
    env.monkeypatch.setattr(responder, "transfer_to_human", human)
    no_model = SimpleNamespace(chat=AsyncMock(
        side_effect=AssertionError("handoff must not call LLM"),
    ))
    draft = await responder.build_responder("unused", llm=no_model, clock=env.clock)(env.job)
    assert draft.content == {"text": "A equipe especializada continua daqui.",
                             "humanize": {"split": False, "rhythm": False}}
    assert human.await_args.kwargs["reason"] == "handoff_keyword"
    assert "handoff_agent_id" not in human.await_args.kwargs
    no_model.chat.assert_not_awaited()


@pytest.mark.parametrize("producer_env", [toucher], indirect=True)
@pytest.mark.parametrize("agent_destination", [False, True], ids=["human", "agent"])
async def test_proactive_transfer_stops_remaining_tools_model_and_judge(
    producer_env, agent_destination,
):
    from agents_runtime.tools import base

    env = producer_env
    row = deepcopy(WIRE)
    row["settings"]["tools"]["enabled"] = ["transfer_to_human", "save_customer"]
    if not agent_destination:
        row["settings"]["safety"]["handoff_destination"] = None
    version = version_from_wire(row)
    env.monkeypatch.setattr(toucher.agent_repo, "resolve_agent_for_mission", AsyncMock(
        return_value=toucher.agent_repo.AgentResolution(version, "entry"),
    ))
    destination = UUID("22222222-2222-4222-8222-222222222222")
    env.monkeypatch.setattr(builtin.agent_repo, "list_active_agents", AsyncMock(
        return_value=((destination, "Especialista", "Suporte"),),
    ))
    assigned = AsyncMock(return_value=True)
    human = AsyncMock(return_value=True)
    env.monkeypatch.setattr(builtin.agent_repo, "assign_conversation_agent", assigned)
    env.monkeypatch.setattr(builtin, "transfer_to_human", human)
    env.monkeypatch.setattr(builtin.crm_repo, "add_activity", AsyncMock())
    env.monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())
    env.monkeypatch.setattr(base, "scope_to_organization", AsyncMock())
    recorded = AsyncMock()
    env.monkeypatch.setattr(base.tool_calls_repo, "record_tool_call", recorded)
    second_tool_io = AsyncMock(side_effect=AssertionError("CRM ran after transfer"))
    env.monkeypatch.setattr(builtin.crm_repo, "find_contact", second_tool_io)
    judge = AsyncMock(side_effect=AssertionError("Judge ran after transfer"))
    env.monkeypatch.setattr(toucher, "PreSendJudge", lambda *_: judge)

    class Model:
        calls = 0

        async def chat(self, request):
            self.calls += 1
            assert self.calls == 1, "Model ran again after transfer"
            return ChatResult("", Usage(), request.model, tool_calls=(
                ToolCall("transfer", "transfer_to_human", {"reason": "complaint"}),
                ToolCall("post-transfer-write", "save_customer", {"name": "Changed"}),
            ))

    model = Model()
    draft = await toucher.build_toucher("unused", llm=model, clock=env.clock)(env.job)
    assert draft.content is None
    assert model.calls == 1
    judge.assert_not_awaited()
    second_tool_io.assert_not_awaited()
    assert [call.kwargs["tool_name"] for call in recorded.await_args_list] == [
        "transfer_to_human",
    ]
    if agent_destination:
        assigned.assert_awaited_once()
        human.assert_not_awaited()
    else:
        human.assert_awaited_once()
        assigned.assert_not_awaited()

@pytest.mark.parametrize("producer_env", [responder, toucher], indirect=True)
@pytest.mark.parametrize("mode", ["enabled", "disabled", "knowledge-present"])
async def test_ia58_knowledge_control_reaches_scoped_retrieval_and_generated_prompt(
    producer_env, mode,
):
    from agents_runtime.tools import base

    env = producer_env
    row = deepcopy(WIRE)
    row["settings"]["tools"]["enabled"] = ["search_knowledge"] if mode == "enabled" else []
    version = version_from_wire(row)
    method = "resolve_agent_for_turn" if env.module is responder else "resolve_agent_for_mission"
    env.monkeypatch.setattr(env.module.agent_repo, method, AsyncMock(
        return_value=env.module.agent_repo.AgentResolution(version, "single_active"),
    ))
    mission = MissionVersion(str(uuid4()), "whatsapp.received", None, "Prazo de troca", None,
                             None, (), ("search_knowledge",), (), 5, "stay", False, {}, None)
    env.monkeypatch.setattr(
        env.module.missions_repo, "load_active_mission", AsyncMock(return_value=mission),
    )
    env.monkeypatch.setattr(responder.knowledge_repo, "has_knowledge", AsyncMock(
        return_value=mode == "knowledge-present",
    ))
    env.monkeypatch.setattr(responder.knowledge_repo, "load_rules", AsyncMock(return_value=()))
    scoped = AsyncMock()
    env.monkeypatch.setattr(knowledge_tool, "scope_to_organization", scoped)
    env.monkeypatch.setattr(base, "scope_to_organization", AsyncMock())
    recorded = AsyncMock()
    env.monkeypatch.setattr(base.tool_calls_repo, "record_tool_call", recorded)
    source_id = uuid4()
    retrieved = AsyncMock(return_value=(KnowledgeChunk(
        uuid4(), env.job.organization_id, "policy", "Prazo", "A troca tem prazo de 37 dias.",
        0.91, source_id,
    ),))
    env.monkeypatch.setattr(knowledge_tool.knowledge_repo, "search_knowledge", retrieved)
    requests, embeddings = [], []

    class Model:
        async def embed(self, texts, *, model):
            embeddings.append(tuple(texts))
            return EmbeddingResult(((0.25, 0.75),), Usage(2, 0, 0), model)

        async def chat(self, request):
            requests.append(request)
            return ChatResult("Confira a política de troca.", Usage(3, 2, 0), request.model)

    env.monkeypatch.setattr(env.module, "PreSendJudge", lambda *_: AsyncMock(return_value=(
        Judgement(PASS, 1, (RubricVerdict("quality", PASS, 1, ()),))
    )))
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    draft = await factory("unused", llm=Model(), clock=env.clock)(env.job)
    assert draft.content is not None
    expected = mode == "enabled" or (mode == "knowledge-present" and env.module is responder)
    assert ("A troca tem prazo de 37 dias." in requests[0].messages[0].content) is expected
    if expected:
        retrieved.assert_awaited_once()
        assert retrieved.await_args.kwargs["agent_id"] == UUID(WIRE["id"])
        assert retrieved.await_args.kwargs["embedding"] == (0.25, 0.75)
        assert scoped.await_args.args[1] == env.job.organization_id
        expected_query = "question" if env.module is responder else "Prazo de troca"
        assert embeddings == [(expected_query,)]
        assert recorded.await_args.kwargs["output"]["chunks"][0]["source_id"] == str(source_id)
    else:
        retrieved.assert_not_awaited()
        assert embeddings == []
