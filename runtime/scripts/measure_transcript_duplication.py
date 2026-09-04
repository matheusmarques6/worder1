"""Medida do ruling D, item 39 da auditoria — turno sintético, ANTES x DEPOIS.

Não precisa de banco nem de provedor real: monta o MESMO turno com o
compilador de verdade (`prompt_compiler.compile_prompt`, pós-fix) e com uma
reimplementação fiel do formato ANTIGO (pré-fix — a função antiga já foi
substituída no arquivo real, então fica transcrita aqui como referência).

Fix round 1 (review): a primeira versão só media um turno SEM o bloco
`# CONHECIMENTO`, que `agent_core/responder.py::build_responder.respond`
anexa ao `system` FORA de `compile_prompt()` em turnos com RAG ativo — e esse
texto fixo (idêntico nas duas versões) dilui a razão a favor do "depois" na
mesma direção que AGENT/MISSÃO/ESTADO/CANAL já diluíam. Este script agora
roda os DOIS cenários: sem conhecimento e com conhecimento (5 chunks
sintéticos, o `knowledge_limit` padrão de `build_responder`) — a razão cai
ainda mais no segundo, e é o número mais realista para produção com RAG.

Uso: `cd runtime && PYTHONUTF8=1 .venv/Scripts/python.exe scripts/measure_transcript_duplication.py`
"""

from agents_runtime.agent_core.prompt_compiler import (
    AgentBlock,
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    compile_prompt,
)
from agents_runtime.agent_core.mission_resolver import MissionVersion, merge_mission

AGENT = AgentBlock(
    agent_id="a1",
    name="Duda",
    tone="amigável",
    language="pt-BR",
    presentation_mode="nome_funcao",
    guidelines=("Nunca invente valores.", "Seja objetiva."),
    adaptation=("mirror_tone",),
    base_instructions="Você atende a loja Exemplo, foco em tênis de corrida.",
)

MISSION = merge_mission(
    MissionVersion(
        id="m1",
        event_type="whatsapp.received",
        situation="Cliente conversando no WhatsApp.",
        objective="entender a necessidade e ajudar a fechar a compra",
        success_criteria="cliente decide o produto",
        failure_criteria="cliente desiste",
        context_fields=(),
        enabled_tools=("search_knowledge", "create_coupon"),
        forbidden=("prometer prazo de entrega",),
        max_turns=6,
        topic_change_policy="cede",
        promote_moment=False,
        concession={"kind": "none"},
        tone_delta=None,
    ),
    None,
    agent_tools=("search_knowledge", "create_coupon"),
)

STATE = StateBlock(
    moment_ids=(),
    moment_facts=(),
    moment_public_claim=None,
    grant_id=None,
    grant_lines=(),
    ledger_lines=(),
    contact_facts=(("nome", "Ana"), ("cidade", "Sao Paulo")),
)

CHANNEL = ChannelBlock(channel="whatsapp", window_open=True)

# 17 mensagens de histórico "mais antigo" + 3 pendentes = 20 = TRANSCRIPT_LIMIT
# exato — o caso comum descrito na recon: a conversa inteira cabe no limite,
# então a query ANTIGA (sem filtro) devolve as 20 sem cortar nada, e a
# rajada pendente cai por inteiro dentro do transcript. UMA rubrica de mídia
# da loja no meio (item 31) — conteúdo que precisa sobreviver às duas versões.
OLDER_17 = (
    ("contact", "oi, boa tarde! vocês tem o tenis de corrida modelo Flow?"),
    ("agent", "Boa tarde! Temos sim, qual numeração você usa?"),
    ("contact", "uso 42"),
    ("agent", "Perfeito, temos em estoque. Quer ver as cores disponíveis?"),
    ("contact", "quero sim, manda foto"),
    ("agent", "[A loja enviou uma imagem]"),
    ("contact", "gostei da azul, quanto ta custando?"),
    ("agent", "A azul está R$ 349,90, com frete grátis para sua região."),
    ("contact", "tem desconto pra pagamento a vista?"),
    ("agent", "Tenho sim, 5% no PIX. Fica R$ 332,41."),
    ("contact", "e parcela em quantas vezes no cartao?"),
    ("agent", "Em até 3x sem juros, ou 12x com juros da operadora."),
    ("contact", "ok, vou pensar"),
    ("agent", "Sem problema! Fico à disposição se quiser fechar depois."),
    ("contact", "vcs tem entrega pra fora de sao paulo?"),
    ("agent", "Temos, entrega para todo o Brasil via transportadora."),
    ("contact", "quanto tempo demora?"),
)
PENDING_3 = (
    ("contact", "entendi, vou fechar entao"),
    ("contact", "pode ser a azul, numero 42"),
    ("contact", "pago no pix mesmo"),
)
assert len(OLDER_17) == 17
# A query ANTIGA (`load_recent_transcript(limit=20)`, sem filtro): a conversa
# inteira (17 + 3 = 20) cabe no limite, então devolve as 20 sem cortar nada —
# a rajada pendente cai por inteiro dentro do transcript, como a recon
# descreveu ("quase sempre" as pendentes já vêm dentro do transcript).
OLD_QUERY_RESULT = OLDER_17 + PENDING_3
assert len(OLD_QUERY_RESULT) == 20

# `knowledge_limit` padrão de `build_responder` é 5 (`responder.py`); chunks
# de tamanho plausível de `ai_agent_chunks` (parágrafo curto de política/FAQ).
KNOWLEDGE_CHUNKS = (
    "Trocas e devoluções: o cliente tem 7 dias corridos após o recebimento "
    "para solicitar troca ou devolução, desde que o produto esteja sem uso e "
    "com a embalagem original. O frete de devolução é por conta da loja "
    "quando o defeito é de fabricação.",
    "Formas de pagamento aceitas: PIX (5% de desconto à vista), cartão de "
    "crédito em até 12x (juros da operadora a partir da 4ª parcela) e "
    "boleto bancário, compensação em até 2 dias úteis.",
    "Prazo de entrega padrão: 3 a 7 dias úteis para capitais, 5 a 12 dias "
    "úteis para o interior, via transportadora parceira. Frete grátis acima "
    "de R$ 299,90 para todo o Brasil.",
    "Tabela de numeração: os tênis desta loja seguem numeração brasileira "
    "padrão (34 a 44). Para numerações intermediárias (ex.: 37,5),  "
    "recomendamos arredondar para cima.",
    "Garantia de fábrica: 90 dias contra defeito de fabricação, cobrindo "
    "descolamento de sola e costura. Desgaste por uso normal não é coberto.",
)


def old_conversation_block_text(transcript, pending) -> str:
    """Reimplementação fiel de `_conversation_block` ANTES do item 39 (a
    função antiga já foi substituída em `prompt_compiler.py`) — dump do
    transcript inteiro + a cauda pendente de novo."""
    lines = ["# CONVERSA"]
    lines.extend(f"{a}: {t}" for a, t in transcript)
    if pending:
        lines.append("— responder agora a:")
        lines.extend(f"{a}: {t}" for a, t in pending)
    return "\n".join(lines)


def old_chat_messages(transcript) -> list[str]:
    """Reimplementação fiel de `_as_chat` ANTES do item 39: chamada como
    `_as_chat(transcript)` em responder.py, SEM `pending` (pending nunca virava
    chat diretamente) — mas como a query antiga de `load_recent_transcript`
    não excluía a janela pendente, `transcript` (as últimas 20 por
    created_at) já continha a cauda pendente dentro dele. Aqui simulamos
    exatamente essa sobreposição: as 20 "antigas" JÁ SÃO o transcript
    completo (histórico + pendente), como a query real devolvia."""
    store_mark = "[A loja enviou "
    return [
        t for a, t in transcript
        if not (a != "contact" and t.startswith(store_mark))
    ]


def new_prompt(transcript_older, pending):
    compiled = compile_prompt(
        agent=AGENT,
        mission=MISSION,
        state=STATE,
        channel=CHANNEL,
        conversation=ConversationBlock(
            conversation_id="c1",
            transcript=tuple(transcript_older),
        ),
        mode="turn",
    )
    system_text = compiled.text
    store_mark = "[A loja enviou "
    chat_texts = [
        t for a, t in (tuple(transcript_older) + tuple(pending))
        if not (a != "contact" and t.startswith(store_mark))
    ]
    return system_text, chat_texts


def old_prompt(transcript_as_query_returned, pending_3):
    # ANTES: `load_recent_transcript(limit=20)` sem filtro devolve as ÚLTIMAS
    # 20 por created_at — que já incluem a cauda pendente (recon, seção 4).
    # `transcript_as_query_returned` simula exatamente esse resultado (20
    # linhas, das quais as 3 finais também estão em `pending_3`).
    compiled_system = old_conversation_block_text(
        transcript_as_query_returned, tuple(pending_3)
    )
    # Monta o texto dos blocos restantes (AGENT/MISSION/STATE/CHANNEL) com o
    # próprio compilador de verdade (esses blocos não mudaram no item 39) e
    # troca só o texto do bloco CONVERSATION pelo formato antigo acima.
    compiled = compile_prompt(
        agent=AGENT, mission=MISSION, state=STATE, channel=CHANNEL,
        conversation=ConversationBlock(
            conversation_id="c1", transcript=tuple(transcript_as_query_returned)
        ),
        mode="turn",
    )
    other_blocks_text = "\n\n".join(
        b.text for b in compiled.blocks if b.kind != "CONVERSATION"
    )
    system_text = other_blocks_text + "\n\n" + compiled_system
    chat_texts = old_chat_messages(transcript_as_query_returned)
    return system_text, chat_texts


def with_knowledge(system_text: str, knowledge: tuple[str, ...] = KNOWLEDGE_CHUNKS) -> str:
    """A MESMA linha de `responder.py::build_responder.respond` (não mudou no
    item 39) — anexada aqui igualmente às duas versões, porque o achado do
    fix round 1 é que ela dilui a razão pros dois lados sem mudar a
    economia absoluta."""
    return system_text + "\n\n# CONHECIMENTO\n" + "\n".join(f"- {c}" for c in knowledge)


def total_chars(system_text: str, chat_texts: list[str]) -> int:
    return len(system_text) + sum(len(t) for t in chat_texts)


def report(label: str, old_system: str, old_chat: list[str], new_system: str, new_chat: list[str]) -> None:
    old_total = total_chars(old_system, old_chat)
    new_total = total_chars(new_system, new_chat)
    print(f"--- {label} ---")
    print(f"ANTES  — system: {len(old_system):6d} chars | chat ({len(old_chat)} msgs): "
          f"{sum(len(t) for t in old_chat):6d} chars | TOTAL: {old_total:6d}")
    print(f"DEPOIS — system: {len(new_system):6d} chars | chat ({len(new_chat)} msgs): "
          f"{sum(len(t) for t in new_chat):6d} chars | TOTAL: {new_total:6d}")
    print(f"Razão ANTES/DEPOIS: {old_total / new_total:.2f}x")
    print(f"Redução: {(1 - new_total / old_total) * 100:.1f}%")
    print(f"Economia absoluta: {old_total - new_total} caracteres\n")


def demo() -> None:
    """Auto-checagem (ponytail): as duas versões preservam a rubrica de
    mídia da loja e a fala real do cliente; a pendente nunca some do array
    de chat novo. Roda como parte do `__main__`."""
    old_system, old_chat = old_prompt(OLD_QUERY_RESULT, PENDING_3)
    new_system, new_chat = new_prompt(OLDER_17, PENDING_3)
    assert "[A loja enviou uma imagem]" in old_system
    assert "[A loja enviou uma imagem]" in new_system
    assert any("gostei da azul" in t for t in old_chat)
    assert any("gostei da azul" in t for t in new_chat)
    assert any("pago no pix mesmo" in t for t in new_chat), "pendente sumiu do chat novo"


if __name__ == "__main__":
    demo()

    old_system, old_chat = old_prompt(OLD_QUERY_RESULT, PENDING_3)
    # DEPOIS: `load_recent_transcript(limit=20, exclude_inbound_after_seq=...)`
    # exclui as 3 pendentes na própria query — sobram as 17 não-pendentes.
    new_system, new_chat = new_prompt(OLDER_17, PENDING_3)
    report("sem # CONHECIMENTO", old_system, old_chat, new_system, new_chat)

    # Fix round 1: o mesmo turno, mas com RAG ativo — o bloco # CONHECIMENTO
    # que responder.py anexa FORA do compilador, idêntico nas duas versões.
    report(
        "com # CONHECIMENTO (5 chunks, knowledge_limit padrão)",
        with_knowledge(old_system), old_chat,
        with_knowledge(new_system), new_chat,
    )

    print("Guardas de conteúdo: OK (rubrica preservada, fala do cliente preservada, "
          "pendente nunca some).")
