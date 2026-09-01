"""Mídia no inbound — o que o motor faz com o que ele não sabe ler (item 31).

`src/lib/ai/media/*` (STT e visão) não tem contraparte em Python, e portá-lo é
capacidade nova, com custo por áudio e decisão de produto. Enquanto isso não
vem, a régua da auditoria é a degradação honesta: dizer que não ouve, em vez de
responder no vazio.

Responder no vazio era o desfecho real, não uma hipótese: áudio e imagem **não**
são `unsupported` para o webhook (`media/router.ts:38-50` os inclui de
propósito, porque no caminho legado eles têm transcrição e visão), então o turno
é agendado normalmente. Sem esta leitura, `content ->> 'text'` é nulo, a rajada
chega vazia e o modelo escreve sobre nada.

Duas decisões moram aqui, as duas puras:

  * **como a mensagem aparece** — legenda é fala do cliente e entra no texto;
    mídia sem legenda vira o marcador que o caminho legado já usa
    (`cloud-runner.ts:764-770`), para os dois motores contarem a MESMA
    conversa;
  * **o que a loja responde** quando a rajada inteira não trouxe uma palavra —
    uma linha na voz da loja, sem chamar o LLM. Gerar resposta a partir de nada
    é exatamente o defeito que este módulo fecha, e a chamada seria só token
    queimado.
"""

from collections.abc import Mapping, Sequence

from agents_runtime.agent_core.think_gate import PendingMessage

#: Como cada tipo aparece no histórico. Os dois primeiros são a redação do
#: caminho legado, palavra por palavra (`cloud-runner.ts:766-770`) — divergir
#: no marcador faria as duas engines contarem histórias diferentes da mesma
#: conversa. Os outros seguem a mesma forma: são `unsupported` (não agendam
#: turno) mas SÃO ingeridos, então sem rótulo somem do histórico igual.
LABELS: dict[str, str] = {
    "image": "uma imagem",
    "audio": "um áudio sem transcrição",
    "video": "um vídeo",
    "document": "um documento",
    "sticker": "uma figurinha",
    "location": "uma localização",
    "contacts": "um contato",
}

#: A metade variável da linha honesta. O tipo importa: "não consigo ouvir" para
#: um áudio e "não consigo ver" para uma imagem dizem ao cliente o que houve;
#: uma frase genérica para os dois não diz nada.
_APOLOGIES: dict[str, str] = {
    "image": "ainda não consigo ver imagens",
    "audio": "ainda não consigo ouvir áudios",
    "video": "ainda não consigo ver vídeos",
    "document": "ainda não consigo abrir documentos",
    "sticker": "ainda não consigo ver figurinhas",
    "location": "ainda não consigo ler localização",
    "contacts": "ainda não consigo ler contatos",
}

#: Para o tipo que não está no mapa. Não deveria acontecer (só áudio e imagem
#: chegam a agendar turno), mas silêncio por tipo desconhecido seria o mesmo
#: defeito de volta por outra porta.
_DEFAULT_APOLOGY = "ainda não consigo entender esse tipo de mensagem"


def _words(value: object) -> str:
    """O texto de `content`, nos dois dialetos: string plana e o envelope Meta
    (`{"text": {"body": …}}`) que o backfill copiou do inbox legado."""
    if isinstance(value, Mapping):
        value = value.get("body")
    return value.strip() if isinstance(value, str) else ""


def read_message(content: object, author: str) -> tuple[str, str | None]:
    """`public.messages.content` → (a linha do histórico, o tipo sem palavra).

    O segundo elemento só vem preenchido quando o CLIENTE mandou mídia e **não**
    escreveu nada — é o único caso que degrada. Com legenda ele volta `None`:
    o cliente escreveu, o turno é normal, e o marcador continua na linha só para
    o modelo saber que existe algo que ele não viu.

    **O autor decide de quem é a mídia, e não é detalhe.** A forma
    `{"image": {...}}` que este módulo rotula pela chave é também o que a rota
    de mídia do inbox grava em OUTBOUND quando o lojista manda uma foto
    (`inbox/conversations/[id]/media/route.ts:220-225`); sem legenda o
    `text_body` fica vazio e o backfill copia esse `content` cru com
    `author_type` 'human'/'agent' (`20260817000004:127-135`). Rotular sem olhar
    o autor punha a foto da LOJA na boca do cliente — trocar mentira por omissão
    por mentira por afirmação, que é pior. O TS guarda o marcador atrás de
    `role === 'user'` (`cloud-runner.ts:761,769`); aqui a guarda é o autor, e
    precisa ser explícita porque as duas direções saem do MESMO loader.
    """
    if not isinstance(content, Mapping):
        return "", None
    from_contact = author == "contact"

    words = _words(content.get("text")) or _words(content.get("caption"))
    kind = content.get("type")
    if not isinstance(kind, str):
        # Dialeto do backfill de criação: ele copia `content` cru do espelho
        # quando não há `text_body` (`20260817000004:131-135`), e lá a forma é
        # `{"image": {...}}` — o tipo é a própria chave.
        kind = next((key for key in LABELS if key in content), None)
        nested = content.get(kind) if kind else None
        if isinstance(nested, Mapping):
            words = words or _words(nested.get("caption"))

    label = LABELS.get(kind) if kind else None
    if label is None:
        # Tipo desconhecido segue como antes deste item: o que houver de texto,
        # ou nada. Inventar rótulo para o que não se conhece seria pôr palavra
        # na boca do cliente.
        return words, None
    # Ao contrário do TS, que simplesmente DESCARTA a linha de mídia outbound
    # do histórico (`cloud-runner.ts:761-771` só empurra para `role === 'user'`),
    # a loja também ganha o seu marcador: a omissão é o defeito que este item
    # existe para fechar, e ela vale nas duas direções — o modelo precisa saber
    # que a loja já mandou uma foto antes de oferecer mandar outra.
    who = "Cliente" if from_contact else "A loja"
    if words:
        return f"[{who} enviou {label}: {words}]", None
    return f"[{who} enviou {label}]", kind if from_contact else None


def speechless_media(pending: Sequence[PendingMessage]) -> str | None:
    """O tipo da mídia quando a rajada do cliente não trouxe UMA palavra.

    Basta uma mensagem escrita na janela para o turno seguir normal: áudio
    seguido de "viu?" é uma pergunta que o modelo responde, e degradar aí seria
    ignorar o cliente. Só o que o CONTATO mandou conta — a mesma régua do
    think-gate, pelo mesmo motivo.
    """
    from_contact = [message for message in pending if message.author == "contact"]
    if not from_contact or any(message.media_kind is None for message in from_contact):
        return None
    return from_contact[0].media_kind


def media_step_detail(kind: str) -> str:
    """O chip do inbox para o turno degradado.

    Degradação sem registro é a mesma doença do silêncio sem registro: quem
    olha o inbox precisa ver por que a loja respondeu isso, e não a resposta
    de sempre.
    """
    return (
        f"Cliente enviou {LABELS.get(kind, 'uma mídia')} — "
        "o agente ainda não lê esse tipo e pediu o texto"
    )


def media_apology(kind: str, settings: Mapping | None) -> str:
    """A linha honesta, na voz da loja.

    `settings.media_fallback.message` é o texto que o lojista escreveu para
    exatamente esta situação, e é o mesmo knob que o TS lê
    (`media/router.ts:78-85`, com a mesma regra de que string vazia cai no
    default). Configurado, ele vence — inclusive o tipo, porque uma frase só
    não sabe distinguir áudio de imagem e a escolha é do lojista.
    """
    raw = (settings or {}).get("media_fallback")
    if isinstance(raw, Mapping):
        configured = raw.get("message")
        if isinstance(configured, str) and configured.strip():
            return configured.strip()
    return (
        f"Desculpe, {_APOLOGIES.get(kind, _DEFAULT_APOLOGY)} por aqui. "
        "Pode me escrever em texto, por favor?"
    )
