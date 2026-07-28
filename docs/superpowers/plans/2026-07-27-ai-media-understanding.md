# AI Media Understanding (áudio + imagem no agente de WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente de IA passa a responder mensagens de áudio (via transcrição Whisper) e imagem (via modelos com visão), com fallback configurável seguro quando a mídia não puder ser interpretada — hoje o cliente que manda só um áudio ou imagem não recebe NENHUMA resposta.

**Architecture:** Um módulo novo `src/lib/ai/media/` concentra roteamento por tipo, transcrição (OpenAI `whisper-1` / Groq `whisper-large-v3` com chave BYO da org), download da mídia do Supabase Storage e resolução do fallback configurável (`settings.media_fallback`). O `cloud-runner` orquestra: áudio vira transcript persistido em `text_body` (entrando no histórico naturalmente), imagem vira parte multimodal base64 anexada à mensagem atual (serializada por provider em `ai-providers.ts`), e falhas caem no fallback (pedir texto OU handoff `ai_enabled=false`). `webhook-processor` e o worker `whatsapp-ai-respond` passam a agendar/rodar IA também para `audio`/`image`, mantendo o mesmo debounce.

**Tech Stack:** Next.js 14.0.4, TypeScript 5, Vitest 1.2 (`npm test`), Supabase (Postgres + Storage), QStash, chamadas LLM/STT por `fetch` cru (sem SDKs).

## Global Constraints

- **DEPENDÊNCIA DURA:** o plano paralelo `docs/superpowers/plans/2026-07-27-inbound-media-pipeline.md` cria/preenche as colunas `media_url`, `media_mime_type`, `media_storage_path` em `whatsapp_cloud_messages` (bucket `whatsapp-media`). Tasks 1–5 são independentes; **Tasks 6–7 selecionam essas colunas e SÓ podem ir a produção depois da migration daquele plano** (SELECT de coluna inexistente falha no Postgres e derrubaria até o fluxo de texto).
- BYO keys: toda chave de provider vem de `organization_api_keys` via `decodeProviderKey` (`src/lib/ai/provider-key-codec.ts:13`); NUNCA fallback para `process.env`.
- Chamadas a APIs de IA são `fetch` cru seguindo o padrão de `src/lib/whatsapp/ai-providers.ts`; nenhuma dependência npm nova.
- Nada pode quebrar o webhook nem o worker: erros de IA ficam dentro do try/catch existente (`webhook-processor.ts:361`) e o worker sempre retorna 200.
- Testes unitários Vitest co-locados (`__tests__/` ou `*.test.ts` ao lado do módulo); rodar com `npx vitest run <arquivo>`; suíte completa com `npm test`.
- Prosa, UI e mensagens ao cliente em pt-BR; código e identificadores em inglês.
- Default seguro do fallback de mídia: `mode: 'ask_text'` (nunca silêncio, nunca handoff sem configuração explícita).

---

### Task 1: Router de tipos de mídia + resolução do fallback configurável

Funções puras que decidem o caminho de cada inbound (`text` / `audio` / `image` / `unsupported`), se o provider tem visão, e qual fallback usar. É a fonte única de verdade consumida por webhook-processor, worker e cloud-runner.

**Files:**
- Create: `src/lib/ai/media/router.ts`
- Modify: `src/lib/ai/types.ts:39-61` (interface `AgentSettings`) e `src/lib/ai/types.ts:388-403` (`DEFAULT_SETTINGS`)
- Test: `src/lib/ai/media/__tests__/router.test.ts`

**Interfaces:**
- Consumes: `AgentSettings` de `src/lib/ai/types.ts`.
- Produces (usados pelas Tasks 6, 7 e 8):
  - `type AiMediaRoute = 'text' | 'audio' | 'image' | 'unsupported'`
  - `routeInboundForAi(messageType: string | null | undefined, textBody?: string | null): AiMediaRoute`
  - `providerSupportsVision(provider: string): boolean`
  - `interface InboundMediaInput { type: 'audio' | 'image'; mediaUrl: string | null; storagePath: string | null; mimeType: string | null; caption: string | null }`
  - `buildRunnerMediaInput(row: { message_type?: string | null; media_url?: string | null; media_storage_path?: string | null; media_mime_type?: string | null; caption?: string | null }): InboundMediaInput | null`
  - `interface ResolvedMediaFallback { mode: 'ask_text' | 'handoff'; message: string }`
  - `resolveMediaFallback(settings: AgentSettings | null | undefined): ResolvedMediaFallback`
  - `const DEFAULT_MEDIA_FALLBACK_MESSAGE: string`
  - Em `types.ts`: campo `media_fallback?: { mode: 'ask_text' | 'handoff'; message?: string }` em `AgentSettings`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/ai/media/__tests__/router.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  routeInboundForAi,
  providerSupportsVision,
  buildRunnerMediaInput,
  resolveMediaFallback,
  DEFAULT_MEDIA_FALLBACK_MESSAGE,
} from '../router'

describe('routeInboundForAi', () => {
  it('texto com body vira text', () => {
    expect(routeInboundForAi('text', 'oi')).toBe('text')
  })
  it('texto sem body vira unsupported', () => {
    expect(routeInboundForAi('text', '')).toBe('unsupported')
    expect(routeInboundForAi('text', '   ')).toBe('unsupported')
    expect(routeInboundForAi(null, undefined)).toBe('unsupported')
  })
  it('audio sem transcript vira audio', () => {
    expect(routeInboundForAi('audio', '')).toBe('audio')
  })
  it('audio JA transcrito (retry idempotente) vira text', () => {
    expect(routeInboundForAi('audio', 'quero fazer um pedido')).toBe('text')
  })
  it('image vira image mesmo com caption', () => {
    expect(routeInboundForAi('image', '')).toBe('image')
    expect(routeInboundForAi('image', 'olha isso')).toBe('image')
  })
  it('document/sticker/location/contacts/unknown viram unsupported', () => {
    for (const t of ['document', 'sticker', 'location', 'contacts', 'video', 'unknown']) {
      expect(routeInboundForAi(t, '')).toBe('unsupported')
    }
  })
})

describe('providerSupportsVision', () => {
  it('openai/anthropic/gemini/google/openrouter suportam', () => {
    for (const p of ['openai', 'anthropic', 'gemini', 'google', 'openrouter']) {
      expect(providerSupportsVision(p)).toBe(true)
    }
  })
  it('groq/deepseek/desconhecido nao suportam', () => {
    for (const p of ['groq', 'deepseek', 'whatever']) {
      expect(providerSupportsVision(p)).toBe(false)
    }
  })
})

describe('buildRunnerMediaInput', () => {
  it('monta input para audio com storage path', () => {
    expect(
      buildRunnerMediaInput({
        message_type: 'audio',
        media_url: null,
        media_storage_path: 'org1/conv1/msg1.ogg',
        media_mime_type: 'audio/ogg',
        caption: null,
      }),
    ).toEqual({
      type: 'audio',
      mediaUrl: null,
      storagePath: 'org1/conv1/msg1.ogg',
      mimeType: 'audio/ogg',
      caption: null,
    })
  })
  it('retorna null para texto e para midia sem ponteiros', () => {
    expect(buildRunnerMediaInput({ message_type: 'text' })).toBeNull()
    expect(buildRunnerMediaInput({ message_type: 'image' })).toBeNull()
  })
  it('image com media_url e caption', () => {
    const input = buildRunnerMediaInput({
      message_type: 'image',
      media_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/a.jpg',
      media_mime_type: 'image/jpeg',
      caption: 'meu comprovante',
    })
    expect(input?.type).toBe('image')
    expect(input?.caption).toBe('meu comprovante')
  })
})

describe('resolveMediaFallback', () => {
  it('default seguro: ask_text com mensagem padrao', () => {
    expect(resolveMediaFallback(undefined)).toEqual({
      mode: 'ask_text',
      message: DEFAULT_MEDIA_FALLBACK_MESSAGE,
    })
    expect(resolveMediaFallback({} as any)).toEqual({
      mode: 'ask_text',
      message: DEFAULT_MEDIA_FALLBACK_MESSAGE,
    })
  })
  it('respeita handoff configurado', () => {
    expect(resolveMediaFallback({ media_fallback: { mode: 'handoff' } } as any).mode).toBe('handoff')
  })
  it('usa mensagem customizada quando informada', () => {
    const r = resolveMediaFallback({
      media_fallback: { mode: 'ask_text', message: 'Me manda em texto?' },
    } as any)
    expect(r.message).toBe('Me manda em texto?')
  })
  it('mode invalido cai no default ask_text', () => {
    expect(resolveMediaFallback({ media_fallback: { mode: 'explode' } } as any).mode).toBe('ask_text')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/media/__tests__/router.test.ts`
Expected: FAIL — `Cannot find module '../router'` (ou equivalente de resolução).

- [ ] **Step 3: Implementar `src/lib/ai/media/router.ts`**

```ts
/**
 * Media router — decide o que a IA faz com cada inbound do WhatsApp.
 *
 * Fonte única de verdade para:
 *   - quais message_types disparam a IA (text/audio/image; resto = fallback);
 *   - quais providers têm visão (imagem na mensagem);
 *   - qual fallback usar quando a mídia não puder ser interpretada
 *     (agent.settings.media_fallback, default seguro ask_text).
 *
 * Funções PURAS (sem IO) — consumidas por webhook-processor, pelo worker
 * whatsapp-ai-respond e pelo cloud-runner.
 */

import type { AgentSettings } from '../types'

export type AiMediaRoute = 'text' | 'audio' | 'image' | 'unsupported'

/** Providers cujos modelos de chat aceitam imagem inline (base64). */
const VISION_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'google', 'openrouter'])

export const DEFAULT_MEDIA_FALLBACK_MESSAGE =
  'Desculpe, não consegui entender sua mensagem por aqui. Pode me escrever em texto, por favor?'

export interface InboundMediaInput {
  type: 'audio' | 'image'
  mediaUrl: string | null
  storagePath: string | null
  mimeType: string | null
  caption: string | null
}

export interface ResolvedMediaFallback {
  mode: 'ask_text' | 'handoff'
  message: string
}

export function routeInboundForAi(
  messageType: string | null | undefined,
  textBody?: string | null,
): AiMediaRoute {
  const body = (textBody || '').trim()
  const type = messageType || 'text'
  if (type === 'text') return body ? 'text' : 'unsupported'
  // Áudio já transcrito (text_body preenchido pelo runner em run anterior)
  // é tratado como texto — evita re-transcrever em retries.
  if (type === 'audio') return body ? 'text' : 'audio'
  if (type === 'image') return 'image'
  return 'unsupported'
}

export function providerSupportsVision(provider: string): boolean {
  return VISION_PROVIDERS.has(provider)
}

/**
 * Monta o input de mídia do runner a partir da row de whatsapp_cloud_messages
 * (colunas media_* preenchidas pelo plano inbound-media-pipeline).
 * Null quando não há mídia utilizável.
 */
export function buildRunnerMediaInput(row: {
  message_type?: string | null
  media_url?: string | null
  media_storage_path?: string | null
  media_mime_type?: string | null
  caption?: string | null
}): InboundMediaInput | null {
  const type = row.message_type
  if (type !== 'audio' && type !== 'image') return null
  if (!row.media_url && !row.media_storage_path) return null
  return {
    type,
    mediaUrl: row.media_url ?? null,
    storagePath: row.media_storage_path ?? null,
    mimeType: row.media_mime_type ?? null,
    caption: row.caption ?? null,
  }
}

export function resolveMediaFallback(
  settings: AgentSettings | null | undefined,
): ResolvedMediaFallback {
  const raw = settings?.media_fallback
  const mode = raw?.mode === 'handoff' ? 'handoff' : 'ask_text'
  const message = (raw?.message || '').trim() || DEFAULT_MEDIA_FALLBACK_MESSAGE
  return { mode, message }
}
```

- [ ] **Step 4: Adicionar `media_fallback` ao `AgentSettings` em `src/lib/ai/types.ts`**

Na interface `AgentSettings` (linha 39), depois do bloco `behavior`:

```ts
  behavior: {
    activate_on: 'new_message' | 'pipeline_stage' | 'manual'
    stop_on_human_reply: boolean
    cooldown_after_transfer: number
    max_messages_per_conversation: number
  }
  /**
   * O que fazer quando o cliente manda mídia que a IA não consegue
   * interpretar (áudio sem STT disponível, imagem sem visão, falha de
   * transcrição). Default seguro: ask_text (pede pra escrever em texto).
   */
  media_fallback?: {
    mode: 'ask_text' | 'handoff'
    message?: string
  }
```

E em `DEFAULT_SETTINGS` (linha 388), depois de `behavior: {...}`:

```ts
  media_fallback: { mode: 'ask_text' },
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/media/__tests__/router.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

```bash
git add src/lib/ai/media/router.ts src/lib/ai/media/__tests__/router.test.ts src/lib/ai/types.ts
git commit -m "feat(ai): router de midia inbound + settings.media_fallback com default seguro"
```

---

### Task 2: Serialização multimodal (imagem) nos providers

Estende `AIMessage`/`ToolLoopMessage` com `images` e extrai serializadores puros (testáveis) usados tanto pelo `callAI` quanto pelo tool-loop. Groq/DeepSeek fazem strip defensivo de imagens (o router impede esse caminho, mas nunca mandamos payload inválido).

**Files:**
- Modify: `src/lib/whatsapp/ai-providers.ts` (interface `AIMessage` linha 22; `ToolLoopMessage` linha 60; `callOpenAI` linha 103; `callAnthropic` linha 137; `callGemini` linha 179; `callDeepSeek` linha 226; `callGroq` linha 260; `callOpenRouter` linha 303; `callAnthropicWithTools` linha 391; `callOpenAICompatWithTools` linha 472; `callGeminiWithTools` linha 559)
- Test: `src/lib/whatsapp/__tests__/multimodal-serializers.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces (usados pelas Tasks 3 e 6):
  - `export interface AIMessageImage { mimeType: string; base64: string }`
  - `AIMessage` ganha `images?: AIMessageImage[]` e passa a ser `export interface AIMessage`
  - `ToolLoopMessage` ganha `images?: AIMessageImage[]`
  - `export function toOpenAIChatMessage(m: AIMessage): any`
  - `export function toAnthropicChatMessage(m: AIMessage): any`
  - `export function toGeminiParts(m: AIMessage): any[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/__tests__/multimodal-serializers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toOpenAIChatMessage,
  toAnthropicChatMessage,
  toGeminiParts,
  type AIMessage,
} from '../ai-providers'

const img = { mimeType: 'image/jpeg', base64: 'QUJD' }

describe('toOpenAIChatMessage', () => {
  it('mensagem sem imagem permanece string simples', () => {
    expect(toOpenAIChatMessage({ role: 'user', content: 'oi' })).toEqual({
      role: 'user',
      content: 'oi',
    })
  })
  it('user com imagem vira array de parts com data URL', () => {
    const m: AIMessage = { role: 'user', content: 'o que é isso?', images: [img] }
    expect(toOpenAIChatMessage(m)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'o que é isso?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      ],
    })
  })
  it('imagem sem texto omite o part de texto', () => {
    const out = toOpenAIChatMessage({ role: 'user', content: '', images: [img] })
    expect(out.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ])
  })
  it('assistant nunca carrega imagem', () => {
    expect(toOpenAIChatMessage({ role: 'assistant', content: 'ok', images: [img] })).toEqual({
      role: 'assistant',
      content: 'ok',
    })
  })
})

describe('toAnthropicChatMessage', () => {
  it('user com imagem vira blocos image (base64) + text', () => {
    const m: AIMessage = { role: 'user', content: 'analisa', images: [img] }
    expect(toAnthropicChatMessage(m)).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
        { type: 'text', text: 'analisa' },
      ],
    })
  })
  it('sem imagem permanece string', () => {
    expect(toAnthropicChatMessage({ role: 'user', content: 'oi' })).toEqual({
      role: 'user',
      content: 'oi',
    })
  })
})

describe('toGeminiParts', () => {
  it('texto + imagem viram parts text e inline_data', () => {
    expect(toGeminiParts({ role: 'user', content: 'veja', images: [img] })).toEqual([
      { text: 'veja' },
      { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } },
    ])
  })
  it('mensagem vazia produz part de texto vazio (Gemini exige >=1 part)', () => {
    expect(toGeminiParts({ role: 'user', content: '' })).toEqual([{ text: '' }])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/__tests__/multimodal-serializers.test.ts`
Expected: FAIL — `toOpenAIChatMessage` (etc.) não são exportados de `../ai-providers`.

- [ ] **Step 3: Implementar tipos + serializadores em `ai-providers.ts`**

Substituir a interface `AIMessage` (linha 22) por:

```ts
/** Imagem inline anexada a uma mensagem de user (visão multimodal). */
export interface AIMessageImage {
  mimeType: string
  base64: string
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Imagens da mensagem (somente role='user'; providers sem visão fazem strip). */
  images?: AIMessageImage[];
}
```

Em `ToolLoopMessage` (linha 60), adicionar após `content?: string;`:

```ts
  /** imagens inline (quando role='user' — visão multimodal) */
  images?: AIMessageImage[];
```

Adicionar os serializadores puros logo após `genCallId` (linha 98):

```ts
// =============================================
// SERIALIZADORES MULTIMODAIS (imagem inline)
// =============================================
// Exportados para reuso no caminho sem tools (callAI) e no tool-loop, e para
// testes unitários. Imagem só em role='user'; demais roles ignoram `images`.

export function toOpenAIChatMessage(m: AIMessage): any {
  if (m.role !== 'user' || !m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  const parts: any[] = [];
  if (m.content) parts.push({ type: 'text', text: m.content });
  for (const img of m.images) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  return { role: 'user', content: parts };
}

export function toAnthropicChatMessage(m: AIMessage): any {
  if (m.role !== 'user' || !m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  const blocks: any[] = m.images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
  }));
  if (m.content) blocks.push({ type: 'text', text: m.content });
  return { role: 'user', content: blocks };
}

export function toGeminiParts(m: AIMessage): any[] {
  const parts: any[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const img of m.images || []) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  if (parts.length === 0) parts.push({ text: '' });
  return parts;
}

/** Strip defensivo p/ providers SEM visão (Groq/DeepSeek): nunca vaza `images`. */
function toTextOnlyMessage(m: AIMessage): { role: string; content: string } {
  return { role: m.role, content: m.content };
}
```

- [ ] **Step 4: Ligar os serializadores nos providers (caminho `callAI`)**

Em `callOpenAI` (linha 110), trocar `messages,` no body por:

```ts
      messages: messages.map(toOpenAIChatMessage),
```

Em `callAnthropic` (linha 153), trocar o `messages: chatMessages.map(...)` por:

```ts
      messages: chatMessages.map(toAnthropicChatMessage),
```

Em `callGemini` (linha 184), trocar a construção de `contents` por:

```ts
  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m),
  }));
```

Em `callOpenRouter` (linha 320), trocar `messages,` por:

```ts
      messages: messages.map(toOpenAIChatMessage),
```

Em `callGroq` (linha 268) e `callDeepSeek` (linha 234), trocar `messages,` por:

```ts
      messages: messages.map(toTextOnlyMessage),
```

- [ ] **Step 5: Ligar os serializadores no tool-loop**

Em `callAnthropicWithTools`, no branch final do for (linha 417), trocar
`anthropicMessages.push({ role: 'user', content: m.content || '' });` por:

```ts
      anthropicMessages.push(
        toAnthropicChatMessage({ role: 'user', content: m.content || '', images: m.images }),
      );
```

Em `callOpenAICompatWithTools`, no branch final (linha 501), trocar
`openaiMessages.push({ role: m.role, content: m.content || '' });` por:

```ts
      openaiMessages.push(
        m.role === 'user'
          ? toOpenAIChatMessage({ role: 'user', content: m.content || '', images: m.images })
          : { role: m.role, content: m.content || '' },
      );
```

(Groq/DeepSeek com tools passam por aqui; modelos sem visão simplesmente não recebem `images` porque o runner só anexa imagem quando `providerSupportsVision` é true — o strip do `callAI` é a rede extra do caminho sem tools.)

Em `callGeminiWithTools`, no branch final (linha 585), trocar
`contents.push({ role: 'user', parts: [{ text: m.content || '' }] });` por:

```ts
      contents.push({
        role: 'user',
        parts: toGeminiParts({ role: 'user', content: m.content || '', images: m.images }),
      });
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/__tests__/multimodal-serializers.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + suíte e commit**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; suíte inteira verde (nenhum teste existente depende do formato antigo do body — os providers são chamados via `callAI`/`callAIWithTools`).

```bash
git add src/lib/whatsapp/ai-providers.ts src/lib/whatsapp/__tests__/multimodal-serializers.test.ts
git commit -m "feat(ai): mensagens multimodais (imagem base64) nos providers OpenAI/Anthropic/Gemini/OpenRouter"
```

---

### Task 3: Propagar `images` do histórico até o LLM (engine + prompt-builder)

`EngineMessage` ganha `images`; o `PromptBuilder.formatMessages` preserva as imagens e deixa de DUPLICAR a mensagem atual (hoje a última mensagem do histórico é mapeada E re-anexada no fim — com imagem isso dobraria o custo); o engine repassa `images` para `callAI` e para o tool-loop.

**Files:**
- Modify: `src/lib/ai/types.ts:234-239` (`EngineMessage`)
- Modify: `src/lib/ai/prompt-builder.ts:294-312` (`formatMessages`)
- Modify: `src/lib/ai/engine.ts:206-209` (map do tool-loop) e `src/lib/ai/engine.ts:254` (map do `callAI`)
- Test: `src/lib/ai/__tests__/prompt-builder-images.test.ts`

**Interfaces:**
- Consumes: `AIMessageImage` da Task 2 (`import type { AIMessageImage } from '@/lib/whatsapp/ai-providers'` — sem ciclo: `ai-providers.ts` não importa nada de `src/lib/ai`).
- Produces (usado pela Task 6): `EngineMessage.images?: AIMessageImage[]`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/ai/__tests__/prompt-builder-images.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PromptBuilder } from '../prompt-builder'
import { AIAgent, DEFAULT_PERSONA, DEFAULT_SETTINGS, EngineMessage } from '../types'

const agent: AIAgent = {
  id: 'a1',
  organization_id: 'o1',
  name: 'Test Agent',
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 1000,
  is_active: true,
  persona: DEFAULT_PERSONA,
  settings: DEFAULT_SETTINGS,
  total_messages: 0,
  total_conversations: 0,
  total_tokens_used: 0,
  created_at: '',
  updated_at: '',
}

describe('PromptBuilder.formatMessages com imagens', () => {
  const images = [{ mimeType: 'image/jpeg', base64: 'QUJD' }]

  it('preserva images na mensagem atual e nao duplica a ultima user message', () => {
    const pb = new PromptBuilder(agent)
    const history: EngineMessage[] = [
      { role: 'assistant', content: 'Oi! Como posso ajudar?' },
      { role: 'user', content: 'olha essa foto', images },
    ]
    const msgs = pb.formatMessages(history, 'olha essa foto')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'assistant', content: 'Oi! Como posso ajudar?', images: undefined })
    expect(msgs[1]).toEqual({ role: 'user', content: 'olha essa foto', images })
  })

  it('quando currentMessage nao esta no historico, anexa sem images', () => {
    const pb = new PromptBuilder(agent)
    const msgs = pb.formatMessages([{ role: 'assistant', content: 'oi' }], 'nova pergunta')
    expect(msgs).toHaveLength(2)
    expect(msgs[1]).toEqual({ role: 'user', content: 'nova pergunta', images: undefined })
  })

  it('preserva images de mensagens anteriores do historico', () => {
    const pb = new PromptBuilder(agent)
    const history: EngineMessage[] = [
      { role: 'user', content: 'primeira foto', images },
      { role: 'assistant', content: 'recebi!' },
      { role: 'user', content: 'e agora?' },
    ]
    const msgs = pb.formatMessages(history, 'e agora?')
    expect(msgs).toHaveLength(3)
    expect(msgs[0].images).toEqual(images)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/prompt-builder-images.test.ts`
Expected: FAIL — `images` não existe em `EngineMessage` (erro de tipo) e/ou `msgs` tem length 3 no primeiro teste (duplicação atual).

- [ ] **Step 3: Adicionar `images` a `EngineMessage` em `types.ts`**

No topo de `src/lib/ai/types.ts`:

```ts
import type { AIMessageImage } from '@/lib/whatsapp/ai-providers'
```

E na interface `EngineMessage` (linha 234):

```ts
export interface EngineMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
  /** Imagens inline da mensagem (visão multimodal — só role='user'). */
  images?: AIMessageImage[]
}
```

- [ ] **Step 4: Corrigir `formatMessages` em `prompt-builder.ts`**

Substituir o corpo de `formatMessages` (linha 294) por:

```ts
  formatMessages(history: EngineMessage[], currentMessage: string): EngineMessage[] {
    // Limitar histórico (últimas N mensagens)
    const maxHistory = 20
    const recentHistory = history.slice(-maxHistory)

    // A mensagem atual costuma JÁ ser o último item do histórico (o runner a
    // anexa antes de chamar o engine). Removemos essa cópia para não duplicar
    // a mensagem — com imagem anexada a duplicação dobraria tokens/custo.
    const last = recentHistory[recentHistory.length - 1]
    const lastIsCurrent = last?.role === 'user' && last.content === currentMessage
    const base = lastIsCurrent ? recentHistory.slice(0, -1) : recentHistory

    const messages: EngineMessage[] = base.map(msg => ({
      role: msg.role,
      content: msg.content,
      images: msg.images,
    }))

    // Adicionar mensagem atual (carregando as imagens dela, se houver)
    messages.push({
      role: 'user',
      content: currentMessage,
      images: lastIsCurrent ? last.images : undefined,
    })

    return messages
  }
```

- [ ] **Step 5: Repassar `images` no engine**

Em `src/lib/ai/engine.ts`, no map do tool-loop (linha 206):

```ts
          messages: messages.map(m => ({
            role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: m.content,
            images: m.images,
          })),
```

E no map do `callAI` (linha 254):

```ts
        messages.map(m => ({ role: m.role as any, content: m.content, images: m.images }))
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/prompt-builder-images.test.ts && npx vitest run src/lib/ai/__tests__/prompt-builder.test.ts`
Expected: PASS nos dois (o teste existente de prompt-builder não pode regredir; se algum caso dele contar com a duplicação da mensagem atual, ajustar a EXPECTATIVA dele para o novo comportamento sem duplicação e anotar no commit).

- [ ] **Step 7: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add src/lib/ai/types.ts src/lib/ai/prompt-builder.ts src/lib/ai/engine.ts src/lib/ai/__tests__/prompt-builder-images.test.ts
git commit -m "feat(ai): propaga imagens ate o LLM e remove duplicacao da mensagem atual no prompt"
```

---

### Task 4: Serviço de transcrição de áudio (Whisper BYO)

Transcreve voice notes via API `audio/transcriptions`: OpenAI `whisper-1` quando a org tem chave OpenAI; senão Groq `whisper-large-v3`; sem nenhuma das duas, retorna null e o runner cai no fallback configurável.

**Files:**
- Create: `src/lib/ai/media/transcription.ts`
- Test: `src/lib/ai/media/__tests__/transcription.test.ts`

**Interfaces:**
- Consumes: `decodeProviderKey(stored: string | null | undefined): string` de `src/lib/ai/provider-key-codec.ts`; `supabaseAdmin` de `@/lib/supabase-admin`.
- Produces (usados pela Task 6):
  - `interface SttConfig { provider: 'openai' | 'groq'; apiKey: string; model: string }`
  - `pickSttKey(rows: Array<{ provider: string; api_key: string }>): SttConfig | null` (pura, testável)
  - `resolveSttConfig(organizationId: string): Promise<SttConfig | null>` (consulta `organization_api_keys`)
  - `transcribeAudio(params: { config: SttConfig; audio: Buffer; mimeType: string }): Promise<string>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/ai/media/__tests__/transcription.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickSttKey, transcribeAudio } from '../transcription'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickSttKey', () => {
  it('prefere openai (whisper-1) quando as duas chaves existem', () => {
    const cfg = pickSttKey([
      { provider: 'groq', api_key: 'gsk_test' },
      { provider: 'openai', api_key: 'sk_test' },
    ])
    expect(cfg).toEqual({ provider: 'openai', apiKey: 'sk_test', model: 'whisper-1' })
  })

  it('cai para groq (whisper-large-v3) sem chave openai', () => {
    const cfg = pickSttKey([{ provider: 'groq', api_key: 'gsk_test' }])
    expect(cfg).toEqual({ provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' })
  })

  it('retorna null sem provider compativel com STT', () => {
    expect(pickSttKey([{ provider: 'anthropic', api_key: 'sk-ant' }])).toBeNull()
    expect(pickSttKey([])).toBeNull()
  })
})

describe('transcribeAudio', () => {
  it('POSTa multipart no endpoint do provider e retorna o texto trimado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: ' olá, quero fazer um pedido ' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await transcribeAudio({
      config: { provider: 'groq', apiKey: 'gsk_test', model: 'whisper-large-v3' },
      audio: Buffer.from('fake-ogg-bytes'),
      mimeType: 'audio/ogg',
    })

    expect(text).toBe('olá, quero fazer um pedido')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer gsk_test')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('model')).toBe('whisper-large-v3')
  })

  it('usa o endpoint da openai para provider openai', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'oi' }) })
    vi.stubGlobal('fetch', fetchMock)
    await transcribeAudio({
      config: { provider: 'openai', apiKey: 'sk_test', model: 'whisper-1' },
      audio: Buffer.from('x'),
      mimeType: 'audio/ogg',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions')
  })

  it('lanca erro com a mensagem da API quando nao-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'invalid api key' } }),
      }),
    )
    await expect(
      transcribeAudio({
        config: { provider: 'openai', apiKey: 'sk', model: 'whisper-1' },
        audio: Buffer.from('x'),
        mimeType: 'audio/ogg',
      }),
    ).rejects.toThrow('invalid api key')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/media/__tests__/transcription.test.ts`
Expected: FAIL — `Cannot find module '../transcription'`.

- [ ] **Step 3: Implementar `src/lib/ai/media/transcription.ts`**

```ts
/**
 * Transcrição de áudio (voice notes do WhatsApp) — BYO key.
 *
 * Ordem de resolução do provider de STT (independente do provider do AGENTE):
 *   1. Chave OpenAI ativa da org  => whisper-1 (api.openai.com)
 *   2. Chave Groq ativa da org    => whisper-large-v3 (api.groq.com, formato OpenAI)
 *   3. Nenhuma                    => null (caller cai no media_fallback)
 *
 * fetch cru multipart (padrão ai-providers.ts, sem SDK). WhatsApp entrega
 * voice notes como audio/ogg (opus) — ambos endpoints aceitam.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { decodeProviderKey } from '../provider-key-codec'

export interface SttConfig {
  provider: 'openai' | 'groq'
  apiKey: string
  model: string
}

const STT_MODELS: Record<SttConfig['provider'], string> = {
  openai: 'whisper-1',
  groq: 'whisper-large-v3',
}

const STT_ENDPOINTS: Record<SttConfig['provider'], string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
}

const STT_PROVIDER_PRIORITY: SttConfig['provider'][] = ['openai', 'groq']

/** Pura: escolhe a chave STT a partir das rows de organization_api_keys. */
export function pickSttKey(
  rows: Array<{ provider: string; api_key: string }>,
): SttConfig | null {
  for (const provider of STT_PROVIDER_PRIORITY) {
    const row = rows.find((r) => r.provider === provider && r.api_key)
    if (row) {
      return { provider, apiKey: decodeProviderKey(row.api_key), model: STT_MODELS[provider] }
    }
  }
  return null
}

export async function resolveSttConfig(organizationId: string): Promise<SttConfig | null> {
  const { data } = await supabaseAdmin
    .from('organization_api_keys')
    .select('provider, api_key')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('provider', STT_PROVIDER_PRIORITY)
  return pickSttKey(data || [])
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  return 'ogg'
}

export async function transcribeAudio(params: {
  config: SttConfig
  audio: Buffer
  mimeType: string
}): Promise<string> {
  const { config, audio, mimeType } = params

  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    `audio.${extensionForMime(mimeType)}`,
  )
  form.append('model', config.model)

  const response = await fetch(STT_ENDPOINTS[config.provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `${config.provider} transcription error`)
  }

  return (data.text || '').trim()
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/media/__tests__/transcription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/media/transcription.ts src/lib/ai/media/__tests__/transcription.test.ts
git commit -m "feat(ai): transcricao de audio BYO (OpenAI whisper-1 com fallback Groq whisper-large-v3)"
```

---

### Task 5: Download da mídia inbound (Storage → Buffer)

Baixa os bytes da mídia persistida pelo pipeline paralelo: preferencialmente do bucket `whatsapp-media` (`media_storage_path`), com fallback para `media_url`. Cap de 10MB (limite prático p/ base64 no payload do LLM e p/ upload de STT).

**Files:**
- Create: `src/lib/ai/media/fetch-media.ts`
- Test: `src/lib/ai/media/__tests__/fetch-media.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin.storage` (bucket `whatsapp-media`, o mesmo usado em `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts:166`).
- Produces (usados pela Task 6):
  - `const MAX_INBOUND_MEDIA_BYTES = 10 * 1024 * 1024`
  - `interface FetchedMedia { buffer: Buffer; mimeType: string }`
  - `fetchInboundMedia(params: { storagePath?: string | null; mediaUrl?: string | null; mimeType?: string | null }): Promise<FetchedMedia | null>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/ai/media/__tests__/fetch-media.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Storage sempre falha nestes testes — exercitamos o fallback por URL.
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
      })),
    },
  },
}))

import { fetchInboundMedia, MAX_INBOUND_MEDIA_BYTES } from '../fetch-media'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fetchResponse(bytes: Uint8Array, contentType = 'image/jpeg') {
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => bytes.buffer,
  }
}

describe('fetchInboundMedia', () => {
  it('sem ponteiros retorna null', async () => {
    expect(await fetchInboundMedia({})).toBeNull()
  })

  it('baixa por media_url quando storage falha e usa content-type da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1, 2, 3]))))
    const media = await fetchInboundMedia({
      storagePath: 'org/conv/x.jpg',
      mediaUrl: 'https://cdn.example.com/x.jpg',
      mimeType: null,
    })
    expect(media?.buffer).toEqual(Buffer.from([1, 2, 3]))
    expect(media?.mimeType).toBe('image/jpeg')
  })

  it('mimeType explicito da row tem prioridade sobre o content-type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(new Uint8Array([1]))))
    const media = await fetchInboundMedia({
      mediaUrl: 'https://cdn.example.com/a.ogg',
      mimeType: 'audio/ogg',
    })
    expect(media?.mimeType).toBe('audio/ogg')
  })

  it('resposta nao-ok retorna null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/x.jpg' })).toBeNull()
  })

  it('midia acima do cap retorna null', async () => {
    const big = new Uint8Array(MAX_INBOUND_MEDIA_BYTES + 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fetchResponse(big)))
    expect(await fetchInboundMedia({ mediaUrl: 'https://cdn.example.com/big.jpg' })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/media/__tests__/fetch-media.test.ts`
Expected: FAIL — `Cannot find module '../fetch-media'`.

- [ ] **Step 3: Implementar `src/lib/ai/media/fetch-media.ts`**

```ts
/**
 * Download da mídia inbound persistida pelo pipeline de mídia
 * (plano 2026-07-27-inbound-media-pipeline): bucket 'whatsapp-media' via
 * media_storage_path, com fallback para media_url (signed/public URL).
 *
 * Cap de tamanho: base64 no payload do LLM e multipart de STT ficam
 * impraticáveis acima disso; mídia grande cai no media_fallback do runner.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

export const MAX_INBOUND_MEDIA_BYTES = 10 * 1024 * 1024 // 10MB

const MEDIA_BUCKET = 'whatsapp-media'

export interface FetchedMedia {
  buffer: Buffer
  mimeType: string
}

function withinCap(buffer: Buffer): boolean {
  return buffer.byteLength > 0 && buffer.byteLength <= MAX_INBOUND_MEDIA_BYTES
}

export async function fetchInboundMedia(params: {
  storagePath?: string | null
  mediaUrl?: string | null
  mimeType?: string | null
}): Promise<FetchedMedia | null> {
  const { storagePath, mediaUrl, mimeType } = params

  if (storagePath) {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .download(storagePath)
      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer())
        if (withinCap(buffer)) {
          return { buffer, mimeType: mimeType || data.type || 'application/octet-stream' }
        }
        return null
      }
    } catch {
      // storage indisponível => tenta a URL abaixo
    }
  }

  if (mediaUrl) {
    try {
      const response = await fetch(mediaUrl)
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!withinCap(buffer)) return null
      return {
        buffer,
        mimeType:
          mimeType || response.headers.get('content-type') || 'application/octet-stream',
      }
    } catch {
      return null
    }
  }

  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/media/__tests__/fetch-media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/media/fetch-media.ts src/lib/ai/media/__tests__/fetch-media.test.ts
git commit -m "feat(ai): download de midia inbound (storage whatsapp-media + fallback URL, cap 10MB)"
```

---

### Task 6: cloud-runner — pipeline de mídia + fallback configurável

O coração da correção: o runner deixa de skippar `non_text` e passa a transcrever áudio (persistindo o transcript em `text_body`), anexar imagem base64 na mensagem atual, incluir placeholders de mídia no histórico e executar o `media_fallback` (ask_text/handoff) em qualquer falha. **Depende da migration do plano inbound-media-pipeline** (SELECT das colunas `media_*`).

**Files:**
- Modify: `src/lib/ai/cloud-runner.ts` (imports linha 24-32; `CloudRunnerParams` linha 67-82; guards linha 113-126; novo bloco de mídia após o BYO-key check linha 257; histórico linha 259-281; trace linha 396; helper novo `runMediaFallback` no nível do módulo)
- Test: verificação por typecheck + suíte completa (o runner é IO-pesado; as peças novas já têm testes nas Tasks 1–5). Verificação funcional manual na Task 9.

**Interfaces:**
- Consumes: `routeInboundForAi`, `providerSupportsVision`, `resolveMediaFallback`, `InboundMediaInput` (Task 1); `resolveSttConfig`, `transcribeAudio` (Task 4); `fetchInboundMedia` (Task 5); `AIMessageImage` (Task 2); `EngineMessage.images` (Task 3); `sendHumanizedReply` (existente, `cloud-sender.ts`).
- Produces (usados pela Task 7): `CloudRunnerParams.inboundMedia?: InboundMediaInput`; novos `skipped`: `'media_handoff'`, `'media_fallback:<reason>'`; novo `ai_disabled_reason: 'media_handoff'`; novo tipo de notificação `whatsapp_ai_media_handoff`.

- [ ] **Step 1: Adicionar imports e estender `CloudRunnerParams`**

No topo de `src/lib/ai/cloud-runner.ts`, junto aos imports existentes:

```ts
import {
  routeInboundForAi,
  providerSupportsVision,
  resolveMediaFallback,
  type InboundMediaInput,
} from './media/router';
import { resolveSttConfig, transcribeAudio } from './media/transcription';
import { fetchInboundMedia } from './media/fetch-media';
import type { AIMessageImage } from '@/lib/whatsapp/ai-providers';
```

Em `CloudRunnerParams` (linha 67), após `phoneNumber?: string;`:

```ts
  /**
   * Mídia da última mensagem inbound (áudio/imagem), com ponteiros das colunas
   * media_* de whatsapp_cloud_messages (preenchidas pelo inbound-media-pipeline).
   * Ausente => mensagem de texto puro.
   */
  inboundMedia?: InboundMediaInput;
```

- [ ] **Step 2: Substituir os guards text-only (linhas 113-119)**

Trocar:

```ts
  // ---------- Guards básicos ----------
  if (!text || !text.trim()) {
    return { replied: false, transferred: false, skipped: 'empty_text' };
  }
  if (messageType && messageType !== 'text') {
    return { replied: false, transferred: false, skipped: 'non_text' };
  }
```

por:

```ts
  // ---------- Guards básicos ----------
  // Roteamento por tipo: text/audio/image seguem; document/sticker/location/
  // video/etc continuam fora (skipped non_text, como antes).
  const route = routeInboundForAi(messageType, text);
  if (route === 'unsupported') {
    const isTextish = !messageType || messageType === 'text';
    return {
      replied: false,
      transferred: false,
      skipped: isTextish ? 'empty_text' : 'non_text',
    };
  }
```

- [ ] **Step 3: Adicionar o helper `runMediaFallback` no nível do módulo**

Logo após `notifyAiDisabled` (linha 65):

```ts
interface MediaFallbackParams {
  account: any;
  conversation: any;
  agent: any;
  agentId: string;
  organizationId: string;
  reason: string;
  inboundMessageId?: string;
  skipSend: boolean;
  skipDelays: boolean;
}

/**
 * Fallback de segurança quando a mídia não pôde ser interpretada
 * (sem STT, provider sem visão, download/transcrição falhou, mídia grande).
 *   - ask_text (default): responde pedindo texto (via sender humanizado);
 *   - handoff: pausa a IA (ai_enabled=false, reason='media_handoff') e
 *     notifica a equipe — NUNCA silêncio.
 */
async function runMediaFallback(params: MediaFallbackParams): Promise<CloudRunnerResult> {
  const {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    reason,
    inboundMessageId,
    skipSend,
    skipDelays,
  } = params;

  const fallback = resolveMediaFallback(agent.settings);

  wlog.warn('whatsapp.ai.media_fallback', {
    organization_id: organizationId,
    conversation_id: conversation.id,
    agent_id: agentId,
    reason,
    mode: fallback.mode,
  });

  if (fallback.mode === 'handoff') {
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: 'media_handoff',
      })
      .eq('id', conversation.id);

    const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
      organization_id: organizationId,
      type: 'whatsapp_ai_media_handoff',
      title: 'Cliente enviou mídia que a IA não interpretou',
      message: `A IA foi pausada em uma conversa (${reason}). Responda manualmente.`,
      metadata: { conversation_id: conversation.id, reason },
      action_url: '/whatsapp/inbox',
    });
    if (notifErr) wlog.warn('whatsapp.ai.notify_insert_failed', { error: notifErr.message });

    return { replied: false, transferred: true, agentId, skipped: 'media_handoff' };
  }

  if (skipSend) {
    return {
      replied: true,
      transferred: false,
      response: fallback.message,
      agentId,
      skipped: `media_fallback:${reason}`,
    };
  }

  const sendResult = await sendHumanizedReply({
    account,
    conversation,
    text: fallback.message,
    agent: { id: agentId, ...agent },
    inboundMessageId,
    skipDelays,
  });

  return {
    replied: sendResult.sent,
    transferred: false,
    response: fallback.message,
    agentId,
    skipped: `media_fallback:${reason}`,
    failure: sendResult.sent ? undefined : 'transient',
    error: sendResult.sent ? undefined : sendResult.reason || sendResult.error,
  };
}
```

- [ ] **Step 4: Inserir o bloco de processamento de mídia**

Depois do BYO-key check (após o `return` de `no_valid_api_key`, linha 257) e ANTES do histórico, inserir:

```ts
  // ---------- Mídia inbound (áudio/imagem) ----------
  // Áudio: transcreve via chave BYO (OpenAI whisper-1 / Groq whisper-large-v3)
  // e PERSISTE o transcript em text_body — assim entra no histórico e retries
  // re-roteiam como 'text' (idempotente). Imagem: baixa do Storage e injeta
  // base64 na mensagem atual (visão). Falhas => media_fallback configurável.
  let effectiveText = text;
  let currentImages: AIMessageImage[] | undefined;
  const media = params.inboundMedia;
  const fallbackCtx: Omit<MediaFallbackParams, 'reason'> = {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    inboundMessageId: params.inboundMessageId,
    skipSend,
    skipDelays,
  };

  if (route === 'audio') {
    const sttConfig = await resolveSttConfig(organizationId);
    if (!sttConfig) {
      return runMediaFallback({ ...fallbackCtx, reason: 'no_stt_provider' });
    }
    const fetched = media
      ? await fetchInboundMedia({
          storagePath: media.storagePath,
          mediaUrl: media.mediaUrl,
          mimeType: media.mimeType,
        })
      : null;
    if (!fetched) {
      return runMediaFallback({ ...fallbackCtx, reason: 'media_unavailable' });
    }

    let transcript = '';
    try {
      transcript = await transcribeAudio({
        config: sttConfig,
        audio: fetched.buffer,
        mimeType: fetched.mimeType,
      });
    } catch (sttErr: any) {
      wlog.warn('whatsapp.ai.transcription_failed', {
        organization_id: organizationId,
        conversation_id: conversation.id,
        error: sttErr?.message,
      });
    }
    if (!transcript) {
      return runMediaFallback({ ...fallbackCtx, reason: 'transcription_failed' });
    }

    effectiveText = transcript;
    if (params.inboundMessageId) {
      await supabaseAdmin
        .from('whatsapp_cloud_messages')
        .update({ text_body: transcript })
        .eq('organization_id', organizationId)
        .eq('message_id', params.inboundMessageId);
    }
  } else if (route === 'image') {
    const caption = (media?.caption || text || '').trim();
    const fetched =
      media && providerSupportsVision(agent.provider)
        ? await fetchInboundMedia({
            storagePath: media.storagePath,
            mediaUrl: media.mediaUrl,
            mimeType: media.mimeType,
          })
        : null;

    if (fetched) {
      currentImages = [{ mimeType: fetched.mimeType, base64: fetched.buffer.toString('base64') }];
      effectiveText = caption || 'O cliente enviou esta imagem.';
    } else if (caption) {
      // Sem visão/sem bytes mas com caption: degrada para texto (melhor que fallback).
      effectiveText = caption;
    } else {
      return runMediaFallback({
        ...fallbackCtx,
        reason: providerSupportsVision(agent.provider)
          ? 'media_unavailable'
          : 'provider_without_vision',
      });
    }
  }
```

- [ ] **Step 5: Reescrever o histórico com placeholders de mídia (linhas 259-281)**

Trocar o bloco `// ---------- Histórico (~20 últimas) ----------` inteiro por:

```ts
  // ---------- Histórico (~20 últimas) ----------
  const { data: historyRows } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('direction, text_body, timestamp, message_type, caption')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(20);

  const ordered = (historyRows || []).slice().reverse();
  const conversationHistory: EngineMessage[] = [];
  for (const m of ordered) {
    const role = m.direction === 'inbound' ? ('user' as const) : ('assistant' as const);
    const body = (m.text_body || '').trim();
    if (body) {
      conversationHistory.push({
        role,
        content: body,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      });
      continue;
    }
    // Mídia inbound sem texto: placeholder para o modelo saber o que houve
    // (a imagem REAL só é anexada na mensagem atual, nunca no histórico —
    // custo/latência).
    if (role === 'user' && m.message_type === 'image') {
      conversationHistory.push({
        role: 'user',
        content: m.caption
          ? `[Cliente enviou uma imagem: ${m.caption}]`
          : '[Cliente enviou uma imagem]',
      });
    } else if (role === 'user' && m.message_type === 'audio') {
      conversationHistory.push({ role: 'user', content: '[Cliente enviou um áudio sem transcrição]' });
    }
  }

  // Garantir que a mensagem atual está no fim como 'user' (com as imagens,
  // quando visão). Se o fim é o placeholder da PRÓPRIA imagem atual, remove.
  const last = conversationHistory[conversationHistory.length - 1];
  if (
    currentImages &&
    last &&
    last.role === 'user' &&
    last.content.startsWith('[Cliente enviou uma imagem')
  ) {
    conversationHistory.pop();
  }
  const tail = conversationHistory[conversationHistory.length - 1];
  if (!tail || tail.role !== 'user' || tail.content !== effectiveText || currentImages) {
    conversationHistory.push({ role: 'user', content: effectiveText, images: currentImages });
  }
```

- [ ] **Step 6: Usar `effectiveText` no trace**

Na gravação de `agent_traces` (linha 396), trocar `input: text,` por:

```ts
        input: effectiveText,
```

- [ ] **Step 7: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; suíte inteira verde (nenhum teste existente cobre o cloud-runner diretamente; `reactivate-ai/route.test.ts` e `cloud-sender.test.ts` não podem regredir).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/cloud-runner.ts
git commit -m "feat(ai): cloud-runner processa audio (transcricao) e imagem (visao) com media_fallback configuravel"
```

---

### Task 7: Agendamento — webhook-processor e worker aceitam audio/image

O webhook agenda IA (mesmo debounce) também para `audio`/`image`; o worker deixa de exigir `text_body` e monta `inboundMedia` a partir da última inbound elegível. `document`/`sticker`/`location`/`video` continuam fora (rota `unsupported`). **Depende da migration do plano inbound-media-pipeline** (colunas `media_*` no SELECT).

**Files:**
- Modify: `src/lib/whatsapp/webhook-processor.ts:361-404` (condição de agendamento + fallback síncrono) e imports linha 20-29
- Modify: `src/app/api/workers/whatsapp-ai-respond/route.ts:151-177` (busca da última inbound + chamada do runner) e imports linha 27-32
- Test: roteamento já coberto por `src/lib/ai/media/__tests__/router.test.ts` (Task 1); aqui verificação por typecheck + suíte + verificação manual (Task 9)

**Interfaces:**
- Consumes: `routeInboundForAi`, `buildRunnerMediaInput` (Task 1); `CloudRunnerParams.inboundMedia` (Task 6).
- Produces: nada novo — mantém contrato do QStash payload `{ conversationId, accountId, organizationId }` intacto (o worker relê a última inbound, então mídia agregada pelo debounce funciona sem mudar a fila).

- [ ] **Step 1: Atualizar o agendamento no `webhook-processor.ts`**

Adicionar import estático no topo (junto aos imports, linha 27):

```ts
import { routeInboundForAi } from '@/lib/ai/media/router';
```

Trocar a condição (linhas 362-370):

```ts
    // Só agenda p/ inbound de texto, fora de auto-conversa, com IA habilitada.
    const isSelf = phoneNumber && account.phone_number && phoneNumber === account.phone_number;
    if (
      messageType === 'text' &&
      textBody &&
      textBody.trim() &&
      !isSelf &&
      conversation?.ai_enabled !== false
    ) {
```

por:

```ts
    // Agenda p/ inbound de texto, ÁUDIO e IMAGEM (document/sticker/location/
    // video seguem fora — rota 'unsupported'), fora de auto-conversa, com IA
    // habilitada. Mesma janela de debounce para todos os tipos.
    const isSelf = phoneNumber && account.phone_number && phoneNumber === account.phone_number;
    const aiRoute = routeInboundForAi(messageType, textBody);
    if (aiRoute !== 'unsupported' && !isSelf && conversation?.ai_enabled !== false) {
```

- [ ] **Step 2: Atualizar o fallback síncrono (sem QStash) no `webhook-processor.ts`**

Trocar o bloco `if (!messageId) { ... }` (linhas 392-403) por:

```ts
      // Fallback: QStash não configurado => roda síncrono (caminho legado 2a)
      // p/ não perder a resposta em ambientes sem fila. Relê a row p/ pegar
      // media_* (preenchidas pelo pipeline de mídia inbound).
      if (!messageId) {
        const { maybeRunAgentForCloudConversation } = await import('@/lib/ai/cloud-runner');
        const { buildRunnerMediaInput } = await import('@/lib/ai/media/router');
        const { data: freshMsg } = await supabase
          .from('whatsapp_cloud_messages')
          .select('message_type, caption, media_url, media_storage_path, media_mime_type')
          .eq('message_id', message.id)
          .maybeSingle();
        await maybeRunAgentForCloudConversation({
          account,
          conversation,
          contact,
          text: textBody,
          inboundMessageId: message.id,
          messageType,
          phoneNumber,
          inboundMedia: freshMsg ? buildRunnerMediaInput(freshMsg) || undefined : undefined,
        });
      }
```

- [ ] **Step 3: Atualizar o worker `whatsapp-ai-respond/route.ts`**

Adicionar import no topo (junto aos imports, linha 31):

```ts
import { buildRunnerMediaInput } from '@/lib/ai/media/router';
```

Trocar o bloco `---------- 5. Última mensagem inbound de texto ----------` (linhas 151-177) por:

```ts
    // ---------- 5. Última mensagem inbound elegível (texto/áudio/imagem) ----------
    const { data: lastInbound } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select(
        'message_id, text_body, message_type, caption, media_url, media_storage_path, media_mime_type',
      )
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const text = (lastInbound?.text_body || '').trim();
    const inboundMedia = lastInbound ? buildRunnerMediaInput(lastInbound) : null;
    if (!text && !inboundMedia) {
      return NextResponse.json({ ok: true, skipped: 'no_inbound_text' }, { status: 200 });
    }

    // ---------- 6. Rodar runner (envio humanizado dentro do sender) ----------
    const { maybeRunAgentForCloudConversation } = await import('@/lib/ai/cloud-runner');
    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation,
      contact,
      text,
      inboundMessageId: lastInbound?.message_id,
      messageType: lastInbound?.message_type || 'text',
      phoneNumber: conversation.contact_phone || conversation.wa_id,
      inboundMedia: inboundMedia || undefined,
    });
```

(Repare: o `messageType: 'text'` hardcoded morre — o runner agora recebe o tipo real e roteia. Áudio já transcrito num retry tem `text_body` preenchido e re-roteia como `text` sem re-transcrever.)

- [ ] **Step 4: Typecheck + suíte**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; suíte verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/webhook-processor.ts src/app/api/workers/whatsapp-ai-respond/route.ts
git commit -m "feat(whatsapp): agenda IA tambem para audio/imagem (mesmo debounce); worker repassa midia ao runner"
```

---

### Task 8: UI — configurar `media_fallback` no agente (SettingsTab)

Bloco novo na seção Comportamento: escolher entre "Pedir texto" (com mensagem customizável) e "Transferir para humano". Persiste em `agent.settings.media_fallback` via o `updateSettings` já existente (o save do agente já grava `settings` inteiro).

**Files:**
- Modify: `src/components/agents/tabs/SettingsTab.tsx:73-88` (default local de `settings`) e `src/components/agents/tabs/SettingsTab.tsx:615-638` (inserir bloco após o rule-card "Limite de mensagens por conversa")
- Test: verificação manual (componente React sem infra de teste de UI no repo) + lint/typecheck

**Interfaces:**
- Consumes: `AgentSettings.media_fallback` (Task 1); `updateSettings(updates: Partial<AgentSettings>)` já existente no componente (linha 124).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar default local de `media_fallback`**

No objeto default de `settings` (linha 73-88), após o bloco `behavior`:

```ts
    behavior: { 
      activate_on: 'new_message', 
      stop_on_human_reply: true, 
      cooldown_after_transfer: 300, 
      max_messages_per_conversation: 0 
    },
    media_fallback: { mode: 'ask_text' as const },
```

- [ ] **Step 2: Inserir o bloco de UI**

Dentro do accordion "Comportamento", logo APÓS o `</div>` que fecha o rule-card "Limite de mensagens por conversa" (linha 638), inserir:

```tsx
              {/* Media fallback — áudio/imagem que a IA não conseguiu interpretar */}
              <div className="rule-card">
                <div className="mb-2">
                  <span className="text-sm" style={{ color: 'var(--text)' }}>
                    Mídia não compreendida (áudio/imagem)
                  </span>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    O que fazer quando a IA não conseguir transcrever um áudio ou interpretar uma imagem
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    className={`selcard ${(settings.media_fallback?.mode || 'ask_text') === 'ask_text' ? 'on' : ''} flex items-center gap-3`}
                    style={{ padding: 12 }}
                  >
                    <input
                      type="radio"
                      name="media_fallback_mode"
                      checked={(settings.media_fallback?.mode || 'ask_text') === 'ask_text'}
                      onChange={() => updateSettings({
                        media_fallback: { ...settings.media_fallback, mode: 'ask_text' }
                      })}
                    />
                    <div>
                      <span className="text-sm" style={{ color: 'var(--text)' }}>Pedir texto</span>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        Responde automaticamente pedindo que o cliente escreva em texto
                      </p>
                    </div>
                  </label>
                  <label
                    className={`selcard ${settings.media_fallback?.mode === 'handoff' ? 'on' : ''} flex items-center gap-3`}
                    style={{ padding: 12 }}
                  >
                    <input
                      type="radio"
                      name="media_fallback_mode"
                      checked={settings.media_fallback?.mode === 'handoff'}
                      onChange={() => updateSettings({
                        media_fallback: { ...settings.media_fallback, mode: 'handoff' }
                      })}
                    />
                    <div>
                      <span className="text-sm" style={{ color: 'var(--text)' }}>Transferir para humano</span>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        Pausa a IA na conversa e notifica a equipe
                      </p>
                    </div>
                  </label>
                  {(settings.media_fallback?.mode || 'ask_text') === 'ask_text' && (
                    <div>
                      <label className="label">Mensagem enviada ao cliente</label>
                      <textarea
                        className="field"
                        rows={2}
                        placeholder="Desculpe, não consegui entender sua mensagem por aqui. Pode me escrever em texto, por favor?"
                        value={settings.media_fallback?.message || ''}
                        onChange={(e) => updateSettings({
                          media_fallback: { mode: 'ask_text', message: e.target.value }
                        })}
                      />
                      <p className="hint">Vazio = usa a mensagem padrão acima</p>
                    </div>
                  )}
                </div>
              </div>
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos (warnings pré-existentes do lint não contam).

- [ ] **Step 4: Verificação manual da UI**

Run: `npm run dev` e abrir a edição de um agente → aba Configurações → Comportamento.
Expected: bloco "Mídia não compreendida" renderiza; alternar para "Transferir para humano" e salvar; recarregar e confirmar que `settings.media_fallback.mode === 'handoff'` persistiu (Network tab ou recarregando a página).

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/tabs/SettingsTab.tsx
git commit -m "feat(agents): config de media_fallback (pedir texto / transferir p/ humano) no SettingsTab"
```

---

### Task 9: Autocheck final + verificação funcional

**Files:**
- Modify: nenhum (verificação); ajustes pontuais só se algo falhar.
- Test: suíte completa + simulador.

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: branch pronta para review.

- [ ] **Step 1: Suíte completa + typecheck + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: todos os testes verdes (incluindo os novos: `router.test.ts`, `multimodal-serializers.test.ts`, `prompt-builder-images.test.ts`, `transcription.test.ts`, `fetch-media.test.ts`); zero erros de tipo.

- [ ] **Step 2: Verificação funcional via simulador (se ambiente com chaves disponível)**

O simulador `src/app/api/ai/test/cloud-webhook` chama `maybeRunAgentForCloudConversation` com `skipSend`/`skipDelays`. Verificar manualmente com uma org de teste:
1. Mensagem de TEXTO continua respondendo (regressão zero).
2. Mensagem `messageType: 'audio'` SEM chave OpenAI/Groq na org → resposta = mensagem do `media_fallback` (default ask_text), nunca silêncio.
3. Com `media_fallback.mode = 'handoff'` → `whatsapp_cloud_conversations.ai_enabled` vira `false` com `ai_disabled_reason = 'media_handoff'` e notificação `whatsapp_ai_media_handoff` criada.
4. (Com a migration do inbound-media-pipeline aplicada + chave OpenAI) áudio real → `text_body` da mensagem inbound recebe o transcript e a IA responde ao conteúdo.

Expected: os 4 cenários se comportam como descrito; logs `whatsapp.ai.media_fallback` / `whatsapp.ai.transcription_failed` aparecem nos casos de falha.

- [ ] **Step 3: Conferir dependência antes do deploy**

Confirmar que a migration do plano `2026-07-27-inbound-media-pipeline.md` (colunas `media_url`, `media_mime_type`, `media_storage_path` em `whatsapp_cloud_messages`) está aplicada no ambiente-alvo ANTES de fazer deploy das Tasks 6–7 — os SELECTs novos falham sem as colunas.
Expected: colunas presentes (`select media_url, media_mime_type, media_storage_path from whatsapp_cloud_messages limit 1` não erra).

- [ ] **Step 4: Commit final (se houve ajustes)**

```bash
git add -A
git commit -m "chore(ai): autocheck final do media understanding (testes/typecheck/lint)"
```

---

## Self-Review (executado na escrita do plano)

- **Cobertura da spec:** transcrição de áudio com fallback de provider claro (Task 4 + 6); imagem com visão OpenAI/Anthropic/Gemini incluindo caption (Tasks 2, 3, 6); agendamento para audio/image com o mesmo debounce mantendo document/sticker/location fora (Task 7 + router da Task 1); fallback configurável `settings.media_fallback` com default seguro ask_text e opção handoff `ai_enabled=false` (Tasks 1, 6, 8); testes unitários de roteamento (Task 1) e do builder multimodal (Task 2) — OK.
- **Placeholders:** nenhum "TBD"/"similar à Task N"; todo step de código tem código real consistente com os arquivos lidos (`cloud-runner.ts`, `ai-providers.ts`, `engine.ts`, `prompt-builder.ts`, `types.ts`, `webhook-processor.ts`, `whatsapp-ai-respond/route.ts`, `SettingsTab.tsx`) — OK.
- **Consistência de nomes/tipos entre tasks:** `AiMediaRoute`/`routeInboundForAi`/`buildRunnerMediaInput`/`InboundMediaInput`/`resolveMediaFallback` (Task 1) usados nas Tasks 6–7; `AIMessageImage`/`toOpenAIChatMessage`/`toAnthropicChatMessage`/`toGeminiParts` (Task 2) usados nas Tasks 3 e 6; `SttConfig`/`resolveSttConfig`/`transcribeAudio` (Task 4) e `fetchInboundMedia` (Task 5) usados na Task 6; `CloudRunnerParams.inboundMedia` (Task 6) usado na Task 7 — OK.
