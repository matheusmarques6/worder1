# 2026-10-15-03 · Áudio transcrito e imagem vista pelo agente

Plano de implementação IA, M1 passo 6. Fecha o item 11 do `FORK.md`.

## O que mudou

1. Nota de voz do cliente é transcrita com a chave da própria org (OpenAI
   `whisper-1`, senão Groq `whisper-large-v3`) e entra no turno como fala do
   cliente. A transcrição é gravada na mensagem para nunca ser paga duas
   vezes.
2. Imagem do cliente vai inline para o modelo (base64) quando o provedor do
   agente enxerga (OpenAI, Anthropic, Gemini/Google, OpenRouter).
3. O que não der para ler (sem chave de STT, provedor sem visão, download
   que falhou, mídia acima de 10 MB) continua caindo na degradação honesta
   que já existia: pedir texto ou transferir, conforme
   `settings.media_fallback`.

## Por quê

O motor legado (TypeScript) transcrevia áudio e enviava imagem ao modelo
(`src/lib/ai/media/transcription.ts`, `cloud-runner.ts:726-807`). O runtime
não tinha contraparte e respondia "ainda não consigo ouvir áudios". Como a
migração total para o runtime exige paridade (relatório e plano de
15/10/2026), esta é a primeira capacidade portada. Áudio é parte relevante
do WhatsApp brasileiro; sem isso, o agente no runtime seria pior que o legado
para uma fatia grande das conversas.

## Como

### Novos módulos (`agent_core/`)

- `stt.py`: a cascata `select_stt_key(rows, base_secret)` (openai → groq,
  chave decifrada por `decode_stored_key`), a tabela de preço por segundo
  (`STT_PRICING`, igual à do TS, com mínimo cobrado do Groq), e o adapter
  `WhisperStt` (multipart cru para `/audio/transcriptions`, `verbose_json`
  para obter a duração). Devolve `SttResult(text, duration_seconds, provider,
  model, cost_usd)`.
- `media_fetch.py`: `MetaMediaFetcher.fetch(conn, organization_id, ref)`
  tenta primeiro a `media_url` assinada do espelho
  (`whatsapp_cloud_messages`, só se o host for `*.supabase.co`/`.in`) e
  depois a Graph da Meta pelo `media_id` com o token da conta
  (`load_active_account` + `resolve_token`). Teto de 10 MB. Falha devolve
  `None`.
- `media_enrich.py`: `enrich_pending_media(pending, fetch, transcribe,
  vision, persist_transcript, note_step)`, a regra pura: áudio → texto
  (`media_kind=None`) e persistência; imagem → `ImageAttachment` quando
  `vision`; senão nada muda. Emite os chips `transcribing` e
  `analyzing_image` (os mesmos do TS em `run-steps-shared.ts`).

### Tipos

- `llm.Message` ganha `images: tuple[ImageAttachment, ...]`;
  `ImageAttachment(mime_type, data_base64)`.
- `think_gate.PendingMessage` ganha `provider_message_id`, `media_id`,
  `mime_type` (lidos do `content` pelo repositório) e `image`.

### Adapters

- `openrouter.openai_message`: com imagens, `content` vira a lista de partes
  `text` + `image_url` (data URL). Vale para OpenRouter e para os
  compatíveis OpenAI (Gemini pelo endpoint OpenAI).
- `direct_providers._anthropic_turn`: blocos `image` base64 + `text`.

### Repositório (`repository/agent.py`)

- `load_pending_messages` passa a selecionar `provider_message_id`;
  `_message` lê `media_id`/`mime_type` via `media.read_media_ref`.
- `load_mirror_media(conn, organization_id, provider_message_id)`: as colunas
  de mídia do espelho.
- `save_transcript(...)`: `messages.content || {"text": …, "transcribed":
  true}` e, em melhor esforço, `whatsapp_cloud_messages.text_body` (o inbox
  mostra a transcrição). `media.read_message` devolve o texto puro quando
  `transcribed` é verdadeiro.

### Responder

- `build_responder` ganha `media_fetcher`, `stt_factory` e `vision`
  (injetáveis; os testes passam dublês). `agent_responder` (produção) monta o
  `MetaMediaFetcher` com `ENCRYPTION_KEY` e `AGENTS_META_API_VERSION`.
- Novo `_enrich_media_for_turn`, chamado DEPOIS dos guards de comportamento,
  do handoff por palavra-chave e do horário (nada pago antes de saber se a
  loja fala) e ANTES de `speechless_media`. A transcrição conta no teto do
  turno (`TurnBudget.reserve("stt")`), abre span `llm_call` com
  `kind="stt"` e grava `internal.llm_calls` com `purpose="stt"` e o custo
  por segundo. Se algo mudou, `conversation` e `input_text` são recomputados
  para o modelo e o trace verem o texto transcrito.
- `_as_chat` leva `message.image` para `Message.images`.

### Banco

`supabase/migrations/20261016000003_llm_calls_purpose_stt.sql`: o CHECK de
`internal.llm_calls.purpose` ganha `stt` (e, antecipando os próximos passos,
`copilot`, `playground`, `topic`, `gap_suggestion`, `eval`); o espelho para
`ai_usage_logs` mapeia `stt → transcription`, a mesma feature que o legado
usava, para a tela de uso somar os dois motores.

### Regras de arquitetura

`stt.py` e `media_fetch.py` entram na lista de adapters de
`tests/unit/test_no_provider_network.py` (são os únicos novos módulos que
nomeiam hosts de provedor). `media_fetch` não importa `psycopg` (contrato do
import-linter): recebe a conexão como objeto opaco e delega ao repositório.

## Testes

`tests/unit/test_media_enrichment.py` (20 casos): leitura do `media_id`,
leitura de áudio transcrito, cascata e preço do STT, multipart do adapter,
os dois caminhos de busca e o teto, a regra de enriquecimento (transcrito,
sem STT, falha, imagem com e sem visão, sem fetcher) e os dois dialetos com
imagem. Suíte unit: 2043 verdes.

Cobertura pendente (exige banco): um caso de pipeline com áudio ingerido via
`ingest_inbound_message` e o STT simulado, provando `save_transcript` e a
linha `stt` em `llm_calls`. Entra com o passo 9 (tools) na mesma suíte.

## Como verificar em produção

Mandar uma nota de voz para o número piloto: a resposta deve tratar do que
foi dito; `internal.llm_calls` ganha uma linha `purpose = 'stt'` com
`cost_usd` preenchido; `public.messages.content` da mensagem ganha
`transcribed: true`; o inbox mostra o texto. Mandar uma foto: a resposta
descreve ou usa a imagem; sem chave OpenAI/Groq, o áudio ainda recebe o
pedido de texto de sempre.

## O que NÃO entrou

- Documento, vídeo, figurinha e localização continuam `unsupported` (não
  agendam turno), como no legado.
- Visão em provedores sem suporte (DeepSeek, Groq) não é simulada por OCR.
- Custo de visão: entra no `agent_reply` do próprio provedor (tokens de
  imagem), sem linha separada — igual ao legado.
