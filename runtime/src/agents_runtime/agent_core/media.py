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

#: Quem mandou, na abertura do marcador. Constantes porque a linha é montada
#: aqui e reconhecida em `is_store_media_line` — duas cópias da mesma string
#: divergiriam no dia em que alguém mexesse na redação.
CONTACT_MARK = "[Cliente enviou "
STORE_MARK = "[A loja enviou "

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
    who = CONTACT_MARK if from_contact else STORE_MARK
    if words:
        return f"{who}{label}: {words}]", None
    return f"{who}{label}]", kind if from_contact else None


def is_store_media_line(message: PendingMessage) -> bool:
    """Esta linha é a RUBRICA da mídia da loja, e não uma fala dela?

    Existe para tirá-la do array de chat. Lá ela viraria uma mensagem
    `assistant` cujo conteúdo inteiro é `[A loja enviou uma imagem]` — uma
    rubrica entre colchetes apresentada ao modelo como fala anterior dele
    mesmo, que é a superfície de imitação mais forte que existe. Esta casa já
    pagou por esse modo de falha exato em 17/08, quando o JSON cru no histórico
    ensinou o modelo a imitá-lo e a resposta saiu crua no WhatsApp.

    No bloco CONVERSA a mesma linha é inofensiva: lá é narração em terceira
    pessoa, com o autor por fora (`agent: [A loja enviou uma imagem]`), e o
    ganho — o modelo saber que a loja já mandou uma foto — fica inteiro.

    A do CLIENTE fica no array: ela chega como `user`, que é exatamente o que o
    TS faz (`cloud-runner.ts:761-771`), e o modelo não imita o que o cliente
    escreve.

    **A troca que isto custa, nomeada:** a foto da loja COM legenda sai junto
    — `[A loja enviou uma imagem: chegou hoje!]` é rubrica do começo ao fim,
    então "chegou hoje!", que é fala de verdade da loja, sobrevive só no bloco
    CONVERSA. É de propósito, e coerente com o motivo do corte: o que faz a
    linha perigosa é o envelope, não o miolo, e um envelope com recheio real
    ensina o formato igual. O bloco carrega a mesma informação sem apresentá-la
    como fala anterior do modelo, então nada se perde do que o modelo precisa
    saber — só do que ele poderia copiar.

    Salvar a legenda exigiria desmontar o marcador e empurrar só o miolo, o que
    é o `appendCurrentTurn` do TS de novo (e a legenda da LOJA não é o turno
    atual de ninguém). Não vale o segundo caminho de renderização.
    """
    return message.author != "contact" and message.text.startswith(STORE_MARK)


def speechless_media(pending: Sequence[PendingMessage]) -> str | None:
    """O tipo da mídia quando a rajada do cliente não trouxe UMA palavra.

    Basta uma mensagem escrita na janela para o turno seguir normal: áudio
    seguido de "viu?" é uma pergunta que o modelo responde, e degradar aí seria
    ignorar o cliente. Só o que o CONTATO mandou conta — a mesma régua do
    think-gate, pelo mesmo motivo.

    **A desculpa nomeia a PRIMEIRA mídia da rajada, não a última nem a que
    agendou o turno** — imagem seguida de áudio pede desculpa pela imagem. É
    escolha, e diverge do TS por construção: lá cada mensagem é um turno e ganha
    o seu próprio fallback; aqui o debounce coalesce a rajada inteira em UMA
    resposta, então é preciso escolher um tipo. A primeira ganha porque é a que
    abriu o assunto, e responder pela última faria a loja ignorar aquilo com que
    o cliente começou. Uma frase citando os dois tipos foi descartada: a
    combinação não é rara o bastante para pagar a redação, e a linha honesta
    vale para as duas mídias de qualquer jeito.
    """
    from_contact = [message for message in pending if message.author == "contact"]
    if not from_contact or any(message.media_kind is None for message in from_contact):
        return None
    return from_contact[0].media_kind


def media_handoff(settings: Mapping | None) -> bool:
    """A loja configurou `handoff` para mídia que a IA não interpreta?

    A outra metade do knob (`media_fallback.mode`), e a régua é a do TS,
    estrita: `raw?.mode === 'handoff' ? 'handoff' : 'ask_text'`
    (`media/router.ts:84`). Só a palavra exata transfere — qualquer outra
    coisa, lixo e ausência inclusive, pede o texto. O default de settings crava
    `ask_text` (`types.ts:437`), então loja que nunca configurou nada nunca
    transfere por causa de um áudio.

    Não é caminho excepcional do lado de lá: `cloud-runner.ts:657-660` manda
    TODO áudio ao fallback com `no_stt_provider` quando a org não tem STT,
    antes de qualquer tentativa, e `:718-723` faz o mesmo para imagem sem
    visão. Quem configurou `handoff` sem STT já vive isto no motor legado —
    honrar aqui é paridade, e configuração que não faz nada é pior que
    ausência (item 30).
    """
    raw = (settings or {}).get("media_fallback")
    return isinstance(raw, Mapping) and raw.get("mode") == "handoff"


def media_step_detail(kind: str, *, handoff: bool = False) -> str:
    """O chip do inbox para o turno degradado.

    Degradação sem registro é a mesma doença do silêncio sem registro: quem
    olha o inbox precisa ver por que a loja respondeu isso, e não a resposta
    de sempre. No modo `handoff` o chip é ainda mais necessário: ali o cliente
    não recebe NADA da IA, e sem o registro o turno some.
    """
    desfecho = (
        "a conversa foi para um humano"
        if handoff
        else "o agente ainda não lê esse tipo e pediu o texto"
    )
    return f"Cliente enviou {LABELS.get(kind, 'uma mídia')} — {desfecho}"


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
