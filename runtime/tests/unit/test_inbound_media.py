"""Mídia no inbound — a leitura honesta do que o cliente mandou (item 31).

O runtime não transcreve áudio nem enxerga imagem: `src/lib/ai/media/*` não
tem contraparte aqui. Enquanto não tiver, há duas coisas que ele NÃO pode
fazer, e são estas que este módulo decide:

  * responder no vazio. Áudio e imagem não são `unsupported` para o webhook
    (`media/router.ts:38-50`) — o turno é agendado, e sem esta leitura a
    rajada chegava ao modelo como texto vazio;
  * mentir no histórico. Mensagem de mídia virava linha em branco no meio da
    conversa, e o modelo lê uma conversa em que o cliente ficou mudo.

Fonte da voz: `cloud-runner.ts:764-770` (os marcadores do histórico) e
`media/router.ts:22-23` (a frase do fallback).
"""

import pytest

from agents_runtime.agent_core.media import (
    media_apology,
    media_handoff,
    media_step_detail,
    read_message,
    speechless_media,
)
from agents_runtime.agent_core.think_gate import PendingMessage

pytestmark = pytest.mark.unit


class TestReadingTheStoredMessage:
    """Os quatro dialetos que `public.messages.content` guarda de verdade."""

    def test_plain_text_is_itself_and_carries_no_media(self) -> None:
        assert read_message({"text": "qual o frete?"}, "contact") == ("qual o frete?", None)

    def test_the_meta_envelope_from_the_backfill_is_flattened(self) -> None:
        """`{"text": {"body": …}}` — o formato que o backfill copiou do inbox
        legado e que já ensinou o modelo a IMITAR o JSON (17/08)."""
        assert read_message({"text": {"body": "boa tarde"}}, "contact") == ("boa tarde", None)

    def test_an_audio_says_it_was_an_audio_and_names_the_kind(self) -> None:
        """A forma que o ingest do runtime grava (`webhook-processor.ts:489-494`):
        `text` nulo, `media_id` presente. Sem esta linha o transcrito mostra um
        turno em branco e o turno responde sobre nada."""
        assert read_message(
            {"type": "audio", "text": None, "media_id": "wamid.1", "caption": None}, "contact"
        ) == ("[Cliente enviou um áudio sem transcrição]", "audio")

    def test_an_image_without_a_caption_says_so(self) -> None:
        assert read_message(
            {"type": "image", "text": None, "media_id": "wamid.2", "caption": None}, "contact"
        ) == ("[Cliente enviou uma imagem]", "image")

    def test_a_caption_is_the_customer_speaking_so_there_is_no_media_kind(self) -> None:
        """Legenda é texto do cliente: o turno segue normal (nenhum tipo volta,
        então nada degrada). Mas o marcador FICA — o modelo precisa saber que
        existe uma imagem que ele não viu, senão responde como se o cliente só
        tivesse escrito. É a mesma linha que o TS monta em `cloud-runner.ts:766`.

        `extractWebhookMessageText` já põe a legenda em `text` (`cloud-api.ts:743-746`),
        então é de lá que ela costuma vir."""
        assert read_message(
            {"type": "image", "text": "olha isso", "media_id": "wamid.3", "caption": "olha isso"},
            "contact",
        ) == ("[Cliente enviou uma imagem: olha isso]", None)

    def test_the_caption_key_alone_also_counts_as_speech(self) -> None:
        assert read_message(
            {"type": "image", "text": None, "media_id": "wamid.4", "caption": "esse aqui"},
            "contact",
        ) == ("[Cliente enviou uma imagem: esse aqui]", None)

    def test_the_legacy_backfill_shape_names_the_kind_by_its_key(self) -> None:
        """O backfill de criação copia `whatsapp_cloud_messages.content` cru
        quando não há `text_body` (`20260817000004:131-135`), e lá a forma é
        `{"image": {...}}` — sem chave `type` nenhuma."""
        assert read_message({"audio": {"id": "wamid.5", "mime_type": "audio/ogg"}}, "contact") == (
            "[Cliente enviou um áudio sem transcrição]",
            "audio",
        )
        assert read_message({"image": {"id": "wamid.6", "caption": "esse"}}, "contact") == (
            "[Cliente enviou uma imagem: esse]",
            None,
        )

    def test_the_other_types_the_webhook_ingests_get_a_line_too(self) -> None:
        """Documento, vídeo e figurinha são `unsupported` — não agendam turno,
        mas SÃO ingeridos (a régua do item 07: o transcrito é sagrado). Sem
        rótulo eles somem do histórico do mesmo jeito."""
        for kind, line in (
            ("document", "[Cliente enviou um documento]"),
            ("video", "[Cliente enviou um vídeo]"),
            ("sticker", "[Cliente enviou uma figurinha]"),
            ("location", "[Cliente enviou uma localização]"),
        ):
            row = {"type": kind, "text": None, "media_id": "x"}
            assert read_message(row, "contact") == (line, kind)

    def test_an_unknown_type_without_words_stays_as_it_is_today(self) -> None:
        """Não inventar rótulo para o que não se conhece: o que não está no mapa
        volta vazio, exatamente como antes deste item."""
        assert read_message({"type": "reaction", "text": None}, "contact") == ("", None)
        assert read_message({"type": "text", "text": None}, "contact") == ("", None)

    def test_the_media_the_STORE_sent_is_never_put_in_the_customer_mouth(self) -> None:
        """A mesma forma `{"image": {...}}` é o que a rota de mídia do inbox
        grava em OUTBOUND quando o lojista manda uma foto
        (`inbox/conversations/[id]/media/route.ts:220-225`), e sem legenda o
        `text_body` fica vazio, então o backfill copia esse `content` cru com
        `author_type` 'human' ou 'agent' (`20260817000004:127-135`).

        Rotular pela chave sem olhar o autor punha a foto da LOJA na boca do
        cliente: onde antes havia linha muda passaria a haver uma afirmação
        falsa sobre quem disse o quê — a mesma doença que este item trata, na
        outra direção. O TS guarda contra isso com `role === 'user'`
        (`cloud-runner.ts:761,769`); aqui a guarda é o autor, e é explícita
        porque as duas direções saem do MESMO loader.

        E o tipo volta `None`: mídia da loja não é rajada muda do cliente, e
        nada nela pode degradar um turno."""
        store_photo = {"image": {"id": "wamid.out", "caption": None}}
        assert read_message(store_photo, "human") == ("[A loja enviou uma imagem]", None)
        assert read_message(store_photo, "agent") == ("[A loja enviou uma imagem]", None)
        assert read_message(store_photo, "contact") == ("[Cliente enviou uma imagem]", "image")

    def test_what_the_store_wrote_with_the_photo_is_the_store_speaking(self) -> None:
        assert read_message({"image": {"id": "w", "caption": "chegou hoje!"}}, "agent") == (
            "[A loja enviou uma imagem: chegou hoje!]",
            None,
        )

    def test_nothing_at_all_is_not_a_crash(self) -> None:
        assert read_message(None, "contact") == ("", None)
        assert read_message("não é objeto", "contact") == ("", None)
        assert read_message({}, "contact") == ("", None)


def pending(*messages: tuple[str, str, str | None]) -> tuple[PendingMessage, ...]:
    return tuple(
        PendingMessage(author=author, text=text, media_kind=kind)
        for author, text, kind in messages
    )


class TestTheBurstThatCarriesNoWord:
    def test_an_audio_alone_is_speechless_and_names_its_kind(self) -> None:
        assert (
            speechless_media(
                pending(("contact", "[Cliente enviou um áudio sem transcrição]", "audio"))
            )
            == "audio"
        )

    def test_one_written_message_in_the_burst_is_enough_to_answer_normally(self) -> None:
        """A rajada do debounce traz várias: áudio + "viu?" é uma pergunta que
        o modelo consegue responder, e degradar aí seria ignorar o cliente."""
        assert (
            speechless_media(
                pending(
                    ("contact", "[Cliente enviou um áudio sem transcrição]", "audio"),
                    ("contact", "viu?", None),
                )
            )
            is None
        )

    def test_the_first_kind_wins_when_the_burst_is_all_media(self) -> None:
        assert (
            speechless_media(
                pending(
                    ("contact", "[Cliente enviou uma imagem]", "image"),
                    ("contact", "[Cliente enviou um áudio sem transcrição]", "audio"),
                )
            )
            == "image"
        )

    def test_what_the_agent_said_does_not_count(self) -> None:
        """Só o que o CONTATO mandou decide — a mesma régua do think-gate."""
        assert speechless_media(pending(("agent", "Posso ajudar?", None))) is None

    def test_an_empty_burst_degrades_nothing(self) -> None:
        assert speechless_media(()) is None


class TestTheHonestLine:
    def test_the_audio_apology_says_it_cannot_hear(self) -> None:
        assert media_apology("audio", None) == (
            "Desculpe, ainda não consigo ouvir áudios por aqui. "
            "Pode me escrever em texto, por favor?"
        )

    def test_the_image_apology_has_its_own_wording(self) -> None:
        assert media_apology("image", None) == (
            "Desculpe, ainda não consigo ver imagens por aqui. "
            "Pode me escrever em texto, por favor?"
        )

    def test_an_unmapped_kind_still_gets_an_honest_line(self) -> None:
        assert media_apology("carrier-pigeon", None) == (
            "Desculpe, ainda não consigo entender esse tipo de mensagem por aqui. "
            "Pode me escrever em texto, por favor?"
        )

    def test_the_store_message_wins_when_the_merchant_configured_one(self) -> None:
        """`settings.media_fallback.message` é a voz que o lojista escreveu —
        o mesmo knob que `resolveMediaFallback` lê (`media/router.ts:78-85`)."""
        settings = {"media_fallback": {"message": "  Manda por escrito que eu te ajudo!  "}}
        assert media_apology("audio", settings) == "Manda por escrito que eu te ajudo!"

    def test_an_empty_configured_message_falls_back_to_ours(self) -> None:
        """`(raw?.message || '').trim() || DEFAULT` — string vazia não cala a
        loja, cai no default. Mesma regra."""
        settings = {"media_fallback": {"message": "   "}}
        assert media_apology("audio", settings).startswith("Desculpe, ainda não consigo ouvir")

    def test_the_chip_says_what_happened(self) -> None:
        """Degradação sem registro é a mesma doença do silêncio sem registro."""
        assert media_step_detail("audio") == (
            "Cliente enviou um áudio sem transcrição — "
            "o agente ainda não lê esse tipo e pediu o texto"
        )
        assert media_step_detail("carrier-pigeon").startswith("Cliente enviou uma mídia —")

    def test_garbage_in_settings_is_not_a_crash(self) -> None:
        assert media_apology("audio", {"media_fallback": "não é objeto"}).startswith("Desculpe,")
        assert media_apology("audio", {"media_fallback": {"message": 7}}).startswith("Desculpe,")


class TestTheModeTheMerchantConfigured:
    """`media_fallback.mode` — o outro metade do knob, que não tinha leitor.

    No TS o modo `handoff` desliga a IA e chama a equipe, e ele NÃO é um
    caminho excepcional de lá: `cloud-runner.ts:657-660` manda todo áudio para
    o fallback com `no_stt_provider` quando a org não tem STT, antes de
    qualquer tentativa. Uma loja que configurou `handoff` e nunca configurou
    STT já tem, hoje, a IA desligada no primeiro áudio de cada conversa.
    Honrar o modo aqui é paridade, não capacidade nova.
    """

    def test_the_default_is_asking_for_text_not_transferring(self) -> None:
        """`raw?.mode === 'handoff' ? 'handoff' : 'ask_text'`
        (`media/router.ts:83`), e o default de settings crava `ask_text`
        (`types.ts:437`). Loja que nunca configurou nada não transfere."""
        assert media_handoff(None) is False
        assert media_handoff({}) is False
        assert media_handoff({"media_fallback": {}}) is False
        assert media_handoff({"media_fallback": {"message": "me escreve"}}) is False

    def test_only_the_exact_word_transfers(self) -> None:
        assert media_handoff({"media_fallback": {"mode": "handoff"}}) is True
        assert media_handoff({"media_fallback": {"mode": "ask_text"}}) is False
        assert media_handoff({"media_fallback": {"mode": "HANDOFF"}}) is False

    def test_garbage_does_not_transfer(self) -> None:
        assert media_handoff({"media_fallback": "não é objeto"}) is False
        assert media_handoff({"media_fallback": {"mode": 7}}) is False
