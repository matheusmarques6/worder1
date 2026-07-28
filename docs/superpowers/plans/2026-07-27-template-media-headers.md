# Template Media Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer templates WhatsApp com header de mídia (IMAGE/VIDEO/DOCUMENT) funcionarem no envio pelo inbox e falharem cedo (400 claro em PT) na criação quando faltar o exemplo exigido pela Meta.

**Architecture:** Extraímos um builder puro de componentes de template (`src/lib/whatsapp/template-components.ts`) que monta `header` (mídia via `link`), `body` (variáveis posicionais) e `button` (URL dinâmica) a partir da linha de `whatsapp_templates` — que guarda tanto o JSON `components` da Meta (caminho de sync do cloud/templates GET) quanto colunas achatadas `header_type`/`header_media_url`/`body_text`/`buttons` (caminho de sync do /api/whatsapp/templates). A rota `send-template` do inbox passa a usar o builder e a aceitar `headerMediaUrl`/`buttonParameters`; o `TemplatePickerModal` coleta a URL da mídia (digitada ou via upload para o Supabase Storage por uma rota nova). Na criação (`cloud/templates` POST), headers de mídia sem `example.header_handle` são rejeitados com erro claro (fase 1 — sem implementar Resumable Upload; justificativa na Task 5).

**Tech Stack:** Next.js 14 (App Router, route handlers Node runtime), TypeScript, Supabase (Postgres + Storage), Meta WhatsApp Cloud API, Vitest 1.x (`environment: 'node'`).

## Global Constraints

- Testes: Vitest, `npm run test` (`vitest run`), inclui `src/**/*.test.ts`; sem infra de teste React (environment `node`, sem @testing-library) — UI valida por passos manuais explícitos.
- Rotas de API respondem erros de validação com status 400 e mensagem em português (padrão já usado no inbox, ex.: media route).
- Módulos em `src/lib/whatsapp` importados por componentes client devem ser puros (sem `supabase-admin`, sem `node:` APIs).
- `whatsapp_templates` tem AMBOS os formatos: `components` JSONB (sync via `src/app/api/whatsapp/cloud/templates/route.ts:79`) e colunas achatadas `header_type`/`header_text`/`header_media_url`/`body_text`/`buttons` (sync via `src/app/api/whatsapp/templates/route.ts:157-173`); todo código novo deve tolerar qualquer um dos dois preenchido.
- Compatibilidade retroativa: payload antigo `{ templateName, language, parameters }` continua funcionando para templates sem header de mídia e sem botões dinâmicos.
- Código em inglês, comentários curtos podem seguir o padrão PT do repo; prosa de erro ao usuário em PT sem acentos obrigatórios (o repo usa "variavel", "midia" sem acento em strings de UI).
- Fora de escopo (YAGNI): header TEXT com variável `{{1}}` no envio do inbox (nenhum template do fluxo atual usa; a Meta rejeitará como hoje), header LOCATION, e upload resumable para criação de template (fase 2 — ver Task 5).
- Commits atômicos por task; mensagens `feat:`/`fix:`/`refactor:` como nas mensagens recentes do repo.

---

### Task 1: Builder puro de componentes de template

**Files:**
- Create: `src/lib/whatsapp/template-components.ts`
- Test: `src/lib/whatsapp/template-components.test.ts`

**Interfaces:**
- Consumes: nada do repo (módulo puro, zero imports).
- Produces (usado pelas Tasks 3 e 4):
  - `type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null`
  - `interface TemplateShape { components?: any[] | null; header_type?: string | null; body_text?: string | null; buttons?: any[] | null }`
  - `class TemplateComponentsError extends Error { code: 'missing_header_media' | 'invalid_header_media' | 'body_vars_mismatch' | 'button_vars_mismatch' }`
  - `getHeaderFormat(template: TemplateShape): HeaderFormat`
  - `getBodyText(template: TemplateShape): string`
  - `countBodyVariables(bodyText: string | null | undefined): number`
  - `getDynamicUrlButtonIndexes(template: TemplateShape): number[]`
  - `buildTemplateComponents(template: TemplateShape, input: { bodyVars: string[]; headerMediaUrl?: string; buttonVars?: string[] }): any[]` — lança `TemplateComponentsError`; retorna array na ordem header → body → buttons (vazio se nada a parametrizar).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/template-components.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  getHeaderFormat,
  getBodyText,
  countBodyVariables,
  getDynamicUrlButtonIndexes,
  buildTemplateComponents,
  TemplateComponentsError,
} from './template-components'

const imageTemplate = {
  components: [
    { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::aW...'] } },
    { type: 'BODY', text: 'Oi {{1}}, seu pedido {{2}} saiu!' },
    { type: 'FOOTER', text: 'Loja X' },
  ],
}

const flatVideoTemplate = {
  header_type: 'video',
  header_media_url: 'https://cdn.exemplo.com/v.mp4',
  body_text: 'Oi {{1}}!',
  buttons: [],
}

const buttonTemplate = {
  components: [
    { type: 'BODY', text: 'Rastreie seu pedido' },
    {
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Ok' },
        { type: 'URL', text: 'Rastrear', url: 'https://loja.com/track/{{1}}' },
        { type: 'URL', text: 'Site', url: 'https://loja.com' },
      ],
    },
  ],
}

describe('getHeaderFormat', () => {
  it('le o format do componente HEADER (components JSONB)', () => {
    expect(getHeaderFormat(imageTemplate)).toBe('IMAGE')
  })
  it('cai para header_type achatado quando nao ha components', () => {
    expect(getHeaderFormat(flatVideoTemplate)).toBe('VIDEO')
    expect(getHeaderFormat({ header_type: 'text' })).toBe('TEXT')
  })
  it('retorna null sem header', () => {
    expect(getHeaderFormat({ body_text: 'oi' })).toBeNull()
    expect(getHeaderFormat({ header_type: 'none' })).toBeNull()
  })
})

describe('getBodyText / countBodyVariables', () => {
  it('prefere o texto do BODY em components, senao body_text', () => {
    expect(getBodyText(imageTemplate)).toBe('Oi {{1}}, seu pedido {{2}} saiu!')
    expect(getBodyText(flatVideoTemplate)).toBe('Oi {{1}}!')
  })
  it('conta variaveis posicionais', () => {
    expect(countBodyVariables('Oi {{1}} e {{ 2 }}')).toBe(2)
    expect(countBodyVariables('')).toBe(0)
    expect(countBodyVariables(null)).toBe(0)
  })
})

describe('getDynamicUrlButtonIndexes', () => {
  it('so retorna indices de botoes URL com {{n}} na url', () => {
    expect(getDynamicUrlButtonIndexes(buttonTemplate)).toEqual([1])
  })
  it('retorna [] sem botoes', () => {
    expect(getDynamicUrlButtonIndexes(imageTemplate)).toEqual([])
  })
})

describe('buildTemplateComponents', () => {
  it('header de imagem + 2 vars de body gera header e body na ordem', () => {
    const c = buildTemplateComponents(imageTemplate, {
      bodyVars: ['Ana', '123'],
      headerMediaUrl: 'https://cdn.exemplo.com/a.jpg',
    })
    expect(c).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.exemplo.com/a.jpg' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '123' }] },
    ])
  })
  it('header de midia sem url lanca missing_header_media', () => {
    expect(() => buildTemplateComponents(imageTemplate, { bodyVars: ['Ana', '123'] }))
      .toThrowError(TemplateComponentsError)
    try {
      buildTemplateComponents(imageTemplate, { bodyVars: ['Ana', '123'] })
    } catch (e: any) {
      expect(e.code).toBe('missing_header_media')
    }
  })
  it('url nao-https lanca invalid_header_media', () => {
    try {
      buildTemplateComponents(imageTemplate, { bodyVars: ['a', 'b'], headerMediaUrl: 'http://x.com/a.jpg' })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('invalid_header_media')
    }
  })
  it('contagem errada de bodyVars lanca body_vars_mismatch', () => {
    try {
      buildTemplateComponents(flatVideoTemplate, { bodyVars: [], headerMediaUrl: 'https://x.com/v.mp4' })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('body_vars_mismatch')
    }
  })
  it('botao URL dinamico gera componente button com index original', () => {
    const c = buildTemplateComponents(buttonTemplate, { bodyVars: [], buttonVars: ['ABC123'] })
    expect(c).toEqual([
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'ABC123' }] },
    ])
  })
  it('buttonVars faltando lanca button_vars_mismatch', () => {
    try {
      buildTemplateComponents(buttonTemplate, { bodyVars: [] })
      expect.unreachable()
    } catch (e: any) {
      expect(e.code).toBe('button_vars_mismatch')
    }
  })
  it('template sem nada a parametrizar retorna []', () => {
    expect(buildTemplateComponents({ body_text: 'Ola!' }, { bodyVars: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npx vitest run src/lib/whatsapp/template-components.test.ts`
Esperado: FAIL — "Cannot find module './template-components'" (ou equivalente de resolução).

- [ ] **Step 3: Implementar o módulo**

Criar `src/lib/whatsapp/template-components.ts`:

```ts
// =============================================
// Template component builder (pure)
// src/lib/whatsapp/template-components.ts
//
// Monta o array `components` do payload de envio de template da
// Cloud API a partir de uma linha de whatsapp_templates. A tabela
// tem DOIS formatos possiveis (components JSONB da Meta e colunas
// achatadas header_type/body_text/buttons) — este modulo tolera ambos.
// Puro: importado tanto por rotas de API quanto por componentes client.
// =============================================

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null

export interface TemplateShape {
  components?: any[] | null
  header_type?: string | null
  body_text?: string | null
  buttons?: any[] | null
}

export type TemplateComponentsErrorCode =
  | 'missing_header_media'
  | 'invalid_header_media'
  | 'body_vars_mismatch'
  | 'button_vars_mismatch'

export class TemplateComponentsError extends Error {
  code: TemplateComponentsErrorCode
  constructor(code: TemplateComponentsErrorCode, message: string) {
    super(message)
    this.name = 'TemplateComponentsError'
    this.code = code
  }
}

const VAR_REGEX = /\{\{\s*\d+\s*\}\}/g
const MEDIA_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const

function findComponent(template: TemplateShape, type: string): any | undefined {
  return (template.components || []).find(
    (c: any) => String(c?.type || '').toUpperCase() === type,
  )
}

export function getHeaderFormat(template: TemplateShape): HeaderFormat {
  const header = findComponent(template, 'HEADER')
  if (header) {
    const fmt = String(header.format || 'TEXT').toUpperCase()
    if (fmt === 'TEXT' || (MEDIA_FORMATS as readonly string[]).includes(fmt)) {
      return fmt as HeaderFormat
    }
    return null
  }
  const flat = String(template.header_type || '').toUpperCase()
  if (flat === 'TEXT' || (MEDIA_FORMATS as readonly string[]).includes(flat)) {
    return flat as HeaderFormat
  }
  return null
}

export function getBodyText(template: TemplateShape): string {
  const body = findComponent(template, 'BODY')
  return body?.text ?? template.body_text ?? ''
}

export function countBodyVariables(bodyText: string | null | undefined): number {
  if (!bodyText) return 0
  const matches = bodyText.match(VAR_REGEX)
  return matches ? matches.length : 0
}

function getButtons(template: TemplateShape): any[] {
  const btnComponent = findComponent(template, 'BUTTONS')
  if (Array.isArray(btnComponent?.buttons)) return btnComponent.buttons
  return Array.isArray(template.buttons) ? template.buttons : []
}

export function getDynamicUrlButtonIndexes(template: TemplateShape): number[] {
  return getButtons(template)
    .map((b: any, i: number) => ({ b, i }))
    .filter(
      ({ b }) =>
        String(b?.type || '').toUpperCase() === 'URL' &&
        VAR_REGEX.test(String(b?.url || '')) &&
        // VAR_REGEX e global (lastIndex persiste); reseta apos o test
        ((VAR_REGEX.lastIndex = 0), true),
    )
    .map(({ i }) => i)
}

export function buildTemplateComponents(
  template: TemplateShape,
  input: { bodyVars: string[]; headerMediaUrl?: string; buttonVars?: string[] },
): any[] {
  const components: any[] = []

  const format = getHeaderFormat(template)
  if (format && format !== 'TEXT') {
    const url = (input.headerMediaUrl || '').trim()
    if (!url) {
      throw new TemplateComponentsError(
        'missing_header_media',
        `Este template exige uma midia de cabecalho (${format}). Informe a URL publica da midia (headerMediaUrl).`,
      )
    }
    if (!/^https:\/\//i.test(url)) {
      throw new TemplateComponentsError(
        'invalid_header_media',
        'headerMediaUrl deve ser uma URL https publica acessivel pela Meta.',
      )
    }
    const mediaType = format.toLowerCase() // 'image' | 'video' | 'document'
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: { link: url } }],
    })
  }

  const expected = countBodyVariables(getBodyText(template))
  if (expected !== input.bodyVars.length) {
    throw new TemplateComponentsError(
      'body_vars_mismatch',
      `Template espera ${expected} variavel(is) de corpo, recebeu ${input.bodyVars.length}.`,
    )
  }
  if (input.bodyVars.length > 0) {
    components.push({
      type: 'body',
      parameters: input.bodyVars.map((text) => ({ type: 'text', text })),
    })
  }

  const dynIndexes = getDynamicUrlButtonIndexes(template)
  const buttonVars = input.buttonVars || []
  if (dynIndexes.length !== buttonVars.length) {
    throw new TemplateComponentsError(
      'button_vars_mismatch',
      `Template tem ${dynIndexes.length} botao(oes) de URL dinamica, recebeu ${buttonVars.length} valor(es) (buttonParameters).`,
    )
  }
  dynIndexes.forEach((btnIndex, i) => {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(btnIndex),
      parameters: [{ type: 'text', text: buttonVars[i] }],
    })
  })

  return components
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npx vitest run src/lib/whatsapp/template-components.test.ts`
Esperado: PASS (todos os testes verdes).

- [ ] **Step 5: Rodar a suite inteira para garantir zero regressão**

Rodar: `npm run test`
Esperado: PASS (nenhum teste existente afetado — módulo novo, sem imports).

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/template-components.ts src/lib/whatsapp/template-components.test.ts
git commit -m "feat(whatsapp): builder puro de components de template (header de midia, body, botoes URL dinamicos)"
```

---

### Task 2: Extrair validação de mídia + rota de upload de mídia de header

**Files:**
- Create: `src/lib/whatsapp/media-validation.ts`
- Create: `src/app/api/whatsapp/inbox/template-header-media/route.ts`
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts:22-75` (substituir constantes/`validateFile` locais por import)
- Test: `src/lib/whatsapp/media-validation.test.ts`

**Interfaces:**
- Consumes: `requireOrgFromAuth` de `@/lib/auth/require-org` (retorna `NextResponse` ou `{ orgId, userId }`); `supabaseAdmin` de `@/lib/supabase-admin`; bucket Storage `whatsapp-media` (já usado pela media route).
- Produces (usado pela Task 4):
  - `interface MediaFileLike { name: string; size: number; type: string }`
  - `validateWhatsAppMediaFile(file: MediaFileLike, mediaType: string): { valid: boolean; error?: string }`
  - Endpoint `POST /api/whatsapp/inbox/template-header-media` — formData `{ file: File, mediaType: 'image'|'video'|'document' }` → `200 { url: string, path: string }` (signed URL 24h) ou `400 { error: string }`.

- [ ] **Step 1: Escrever teste que falha**

Criar `src/lib/whatsapp/media-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateWhatsAppMediaFile } from './media-validation'

describe('validateWhatsAppMediaFile', () => {
  it('aceita jpeg dentro do limite de imagem (5MB)', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.jpg', size: 4 * 1024 * 1024, type: 'image/jpeg' }, 'image')
    expect(r.valid).toBe(true)
  })
  it('rejeita imagem acima de 5MB', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' }, 'image')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('5MB')
  })
  it('rejeita extensao perigosa', () => {
    const r = validateWhatsAppMediaFile({ name: 'x.exe', size: 100, type: 'application/pdf' }, 'document')
    expect(r.valid).toBe(false)
  })
  it('rejeita MIME fora da lista da Meta', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.gif', size: 100, type: 'image/gif' }, 'image')
    expect(r.valid).toBe(false)
  })
  it('aceita pdf como document', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.pdf', size: 100, type: 'application/pdf' }, 'document')
    expect(r.valid).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npx vitest run src/lib/whatsapp/media-validation.test.ts`
Esperado: FAIL — módulo `./media-validation` inexistente.

- [ ] **Step 3: Criar `src/lib/whatsapp/media-validation.ts`** (conteúdo movido 1:1 das linhas 22-75 da media route, com assinatura estrutural para testabilidade)

```ts
// =============================================
// Validacao de midia p/ Meta Cloud API (compartilhada)
// Extraido de inbox/conversations/[id]/media/route.ts para reuso
// pela rota de upload de header de template.
// =============================================

export interface MediaFileLike {
  name: string
  size: number
  type: string
}

// Meta Cloud API enforces different size limits per media category.
export const MAX_SIZE_BY_TYPE: Record<string, number> = {
  image: 5 * 1024 * 1024,      // 5 MB
  video: 16 * 1024 * 1024,     // 16 MB
  audio: 16 * 1024 * 1024,     // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}
export const FALLBACK_MAX_SIZE = 16 * 1024 * 1024

// MIME types accepted by Meta's /media endpoint (fora disso: code 131053).
export const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/3gpp'],
  audio: ['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/ogg'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
  ],
}

export const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.msi']

export function validateWhatsAppMediaFile(
  file: MediaFileLike,
  mediaType: string,
): { valid: boolean; error?: string } {
  const maxSize = MAX_SIZE_BY_TYPE[mediaType] ?? FALLBACK_MAX_SIZE
  if (file.size > maxSize) {
    const label = mediaType === 'image' ? 'Imagem'
      : mediaType === 'video' ? 'Video'
      : mediaType === 'audio' ? 'Audio'
      : 'Documento'
    return { valid: false, error: `${label} muito grande. Maximo: ${maxSize / (1024 * 1024)}MB` }
  }

  if (DANGEROUS_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }

  const allowedList = ALLOWED_TYPES[mediaType as keyof typeof ALLOWED_TYPES]
  if (allowedList && !allowedList.includes(file.type)) {
    return { valid: false, error: `Tipo de arquivo nao aceito pelo WhatsApp para ${mediaType}: ${file.type}` }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npx vitest run src/lib/whatsapp/media-validation.test.ts`
Esperado: PASS.

- [ ] **Step 5: Refatorar a media route para importar do módulo**

Em `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts`:
- Apagar as constantes `MAX_SIZE_BY_TYPE`, `FALLBACK_MAX_SIZE`, `ALLOWED_TYPES`, `DANGEROUS_EXTENSIONS` e a função `validateFile` (linhas 23-75).
- Adicionar import: `import { validateWhatsAppMediaFile } from '@/lib/whatsapp/media-validation'`.
- Trocar a chamada `validateFile(file, mediaType)` (linha 105) por `validateWhatsAppMediaFile(file, mediaType)` (o `File` do formData satisfaz `MediaFileLike` estruturalmente).

- [ ] **Step 6: Criar a rota de upload `src/app/api/whatsapp/inbox/template-header-media/route.ts`**

```ts
// =============================================
// API: POST /api/whatsapp/inbox/template-header-media
//
// Sobe um arquivo para o Supabase Storage (bucket whatsapp-media) e
// devolve uma signed URL de 24h para uso como header de midia em
// envio de template (Meta baixa a midia no momento do envio, entao
// a URL so precisa estar viva no send).
//
// FormData: { file: File, mediaType: 'image'|'video'|'document' }
// 200: { url, path } | 400: { error }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { validateWhatsAppMediaFile } from '@/lib/whatsapp/media-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }
const SIGNED_URL_EXPIRY = 24 * 3600 // 24h — envio acontece logo apos o upload
const HEADER_MEDIA_TYPES = ['image', 'video', 'document']

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mediaType = (formData.get('mediaType') as string) || 'image'

    if (!file) {
      return NextResponse.json({ error: 'Arquivo obrigatorio (file)' }, { status: 400, headers: NO_CACHE_HEADERS })
    }
    if (!HEADER_MEDIA_TYPES.includes(mediaType)) {
      return NextResponse.json(
        { error: `mediaType invalido. Use: ${HEADER_MEDIA_TYPES.join(', ')}` },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }

    const validation = validateWhatsAppMediaFile(file, mediaType)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers: NO_CACHE_HEADERS })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const storagePath = `${orgId}/template-headers/${uniqueId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('whatsapp-media')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      })
    if (upErr) {
      console.error('[template-header-media] storage error:', upErr)
      return NextResponse.json(
        { error: 'Falha ao subir arquivo para o storage' },
        { status: 500, headers: NO_CACHE_HEADERS },
      )
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)
    if (signErr || !signed?.signedUrl) {
      console.error('[template-header-media] sign error:', signErr)
      return NextResponse.json(
        { error: 'Falha ao gerar URL assinada' },
        { status: 500, headers: NO_CACHE_HEADERS },
      )
    }

    return NextResponse.json(
      { url: signed.signedUrl, path: storagePath },
      { headers: NO_CACHE_HEADERS },
    )
  } catch (e: any) {
    console.error('[template-header-media] unhandled:', e)
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500, headers: NO_CACHE_HEADERS },
    )
  }
}
```

- [ ] **Step 7: Verificar compilação e suite**

Rodar: `npx tsc --noEmit` e depois `npm run test`
Esperado: zero erros de tipo nos arquivos tocados; suite PASS.

- [ ] **Step 8: Verificação manual da rota (dev server)**

Rodar: `npm run dev` e, com um token válido de sessão:
`curl -X POST http://localhost:3000/api/whatsapp/inbox/template-header-media -H "Authorization: Bearer <TOKEN>" -F "file=@foto.jpg" -F "mediaType=image"`
Esperado: `200 { "url": "https://...supabase.co/storage/v1/object/sign/whatsapp-media/...", "path": "<org>/template-headers/..." }`. Sem `file`: `400 { "error": "Arquivo obrigatorio (file)" }`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/whatsapp/media-validation.ts src/lib/whatsapp/media-validation.test.ts "src/app/api/whatsapp/inbox/template-header-media/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts"
git commit -m "feat(whatsapp): rota de upload de midia de header de template + validacao de midia compartilhada (DRY com inbox media)"
```

---

### Task 3: send-template do inbox monta header de mídia e botões dinâmicos

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/send-template/route.ts:9-10` (doc do body), `:29-33` (remover `countBodyVariables` local), `:60-62` (parse do body), `:114-124` (substituir validação/montagem por builder)
- Test: coberto pelos testes unitários da Task 1 (`src/lib/whatsapp/template-components.test.ts`); rota validada por passos manuais (não há infra de teste de route handlers no repo).

**Interfaces:**
- Consumes (da Task 1): `buildTemplateComponents(template, { bodyVars, headerMediaUrl, buttonVars }): any[]` e `TemplateComponentsError` de `@/lib/whatsapp/template-components`.
- Produces (consumido pela Task 4): body da rota passa a aceitar `{ templateName: string, language: string, parameters?: string[], headerMediaUrl?: string, buttonParameters?: string[] }`; erros de montagem retornam `400 { error: string (PT), code: 'missing_header_media' | 'invalid_header_media' | 'body_vars_mismatch' | 'button_vars_mismatch' }`.

- [ ] **Step 1: Confirmar cobertura de teste do builder (pré-condição)**

Rodar: `npx vitest run src/lib/whatsapp/template-components.test.ts`
Esperado: PASS. (A lógica nova da rota é 100% o builder; a rota só delega.)

- [ ] **Step 2: Editar a rota**

Em `src/app/api/whatsapp/inbox/conversations/[id]/send-template/route.ts`:

1. Atualizar o comentário do topo (linhas 9-10) para:

```ts
// Body: { templateName, language, parameters?: string[],
//         headerMediaUrl?: string, buttonParameters?: string[] }
// parameters: valores posicionais {{1}}..{{N}} do body do template.
// headerMediaUrl: obrigatorio quando o template tem header IMAGE/VIDEO/DOCUMENT.
// buttonParameters: valores para botoes de URL dinamica, na ordem dos botoes.
```

2. Adicionar import (junto dos imports existentes) e remover a função local `countBodyVariables` (linhas 29-33) — `renderPreview` permanece:

```ts
import {
  buildTemplateComponents,
  TemplateComponentsError,
} from '@/lib/whatsapp/template-components'
```

3. Após a linha 62 (`const parameters ...`), adicionar o parse dos novos campos:

```ts
    const headerMediaUrl: string | undefined =
      typeof body?.headerMediaUrl === 'string' && body.headerMediaUrl.trim()
        ? body.headerMediaUrl.trim()
        : undefined
    const buttonParameters: string[] = Array.isArray(body?.buttonParameters)
      ? body.buttonParameters.map((v: unknown) => String(v))
      : []
```

4. Substituir o bloco das linhas 114-124 (validação `expectedVars` + montagem de `components`) por:

```ts
    // Monta header (midia) + body + botoes URL dinamicos. O builder valida
    // contagem de variaveis e exige headerMediaUrl quando o template
    // aprovado tem header IMAGE/VIDEO/DOCUMENT (senao a Meta rejeita o envio).
    let builtComponents: any[]
    try {
      builtComponents = buildTemplateComponents(template, {
        bodyVars: parameters,
        headerMediaUrl,
        buttonVars: buttonParameters,
      })
    } catch (err) {
      if (err instanceof TemplateComponentsError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400, headers: NO_CACHE_HEADERS },
        )
      }
      throw err
    }
    const components = builtComponents.length ? builtComponents : undefined
```

O restante da rota (linhas 126+) permanece — `components` já é usado no `sendTemplate` (linha 153) e no `content` salvo (linha 178), então header e botões passam a ser persistidos no histórico automaticamente.

- [ ] **Step 3: Compilar e rodar a suite**

Rodar: `npx tsc --noEmit` e `npm run test`
Esperado: zero erros; suite PASS.

- [ ] **Step 4: Verificação manual (dev server + template real com header de imagem)**

Com `npm run dev` e uma conversa Cloud existente (`<CONV_ID>`), template aprovado `<TPL>` com header IMAGE e 1 variável de body:

1. Sem `headerMediaUrl`:
`curl -X POST http://localhost:3000/api/whatsapp/inbox/conversations/<CONV_ID>/send-template -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"templateName\":\"<TPL>\",\"language\":\"pt_BR\",\"parameters\":[\"Ana\"]}"`
Esperado: `400 { "error": "Este template exige uma midia de cabecalho (IMAGE)...", "code": "missing_header_media" }`.

2. Com `headerMediaUrl` https válida:
`curl -X POST ... -d "{\"templateName\":\"<TPL>\",\"language\":\"pt_BR\",\"parameters\":[\"Ana\"],\"headerMediaUrl\":\"https://.../foto.jpg\"}"`
Esperado: `200 { "success": true, ... }` e a mensagem chega no WhatsApp com a imagem no topo.

3. Regressão: template só-texto com o payload antigo `{ templateName, language, parameters }` continua retornando 200.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/send-template/route.ts"
git commit -m "fix(whatsapp): send-template do inbox monta header de midia e botoes URL dinamicos via builder (antes a Meta rejeitava o envio)"
```

---

### Task 4: TemplatePickerModal coleta mídia do header (URL ou upload) e variáveis de botão

**Files:**
- Modify: `src/components/whatsapp/inbox/TemplatePickerModal.tsx:26-30` (payload), `:32-42` (TemplateRow), `:89-90` (state), `:156-160` (handlePick), `:167-185` (submit), `:347-409` (JSX do template selecionado)
- Test: verificação manual (sem infra de teste React no repo — vitest `environment: 'node'`, sem @testing-library).

**Interfaces:**
- Consumes: `getHeaderFormat`, `getDynamicUrlButtonIndexes` de `@/lib/whatsapp/template-components` (Task 1); endpoint `POST /api/whatsapp/inbox/template-header-media` → `{ url }` (Task 2); rota send-template aceitando `headerMediaUrl`/`buttonParameters` (Task 3).
- Produces: `SendTemplatePayload` passa a ser `{ templateName: string; language: string; parameters: string[]; headerMediaUrl?: string; buttonParameters?: string[] }`. `ChatPanel.tsx` NÃO precisa mudar: `handleSendTemplate` (ChatPanel.tsx:358-377) serializa o payload inteiro com `JSON.stringify(payload)`, então os campos novos fluem até a rota.

- [ ] **Step 1: Estender tipos e estado**

Em `src/components/whatsapp/inbox/TemplatePickerModal.tsx`:

1. Payload (linhas 26-30):

```ts
export interface SendTemplatePayload {
  templateName: string
  language: string
  parameters: string[]
  headerMediaUrl?: string
  buttonParameters?: string[]
}
```

2. `TemplateRow` (linhas 32-42) ganha os campos que o `GET /api/whatsapp/templates` (select `*`) já retorna:

```ts
interface TemplateRow {
  id: string
  name: string
  language: string
  category: string
  status: string
  body_text: string | null
  body_variables: number | null
  header_type: string | null
  header_text: string | null
  header_media_url: string | null
  footer_text: string | null
  components: any[] | null
  buttons: any[] | null
}
```

3. Import do builder (junto dos imports existentes):

```ts
import { getHeaderFormat, getDynamicUrlButtonIndexes } from '@/lib/whatsapp/template-components'
```

4. Estado novo (após a linha 90, `const [params, setParams] = useState...`):

```ts
  const [headerMediaUrl, setHeaderMediaUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [buttonVars, setButtonVars] = useState<string[]>([])
```

E no reset do `useEffect` de `open` (linhas 93-98), adicionar `setHeaderMediaUrl('')` e `setButtonVars([])`.

- [ ] **Step 2: Pré-preencher ao selecionar template**

Substituir `handlePickTemplate` (linhas 156-160):

```ts
  function handlePickTemplate(t: TemplateRow) {
    const n = countBodyVariables(t.body_text)
    setSelected(t)
    setParams(Array(n).fill(''))
    // Header de midia: pre-preenche com a URL de exemplo sincronizada, se houver
    setHeaderMediaUrl(t.header_media_url || '')
    setButtonVars(Array(getDynamicUrlButtonIndexes(t).length).fill(''))
  }
```

- [ ] **Step 3: Derivados + upload handler**

Logo antes do `if (!open) return null` (linha 187), adicionar:

```ts
  const headerFormat = selected ? getHeaderFormat(selected) : null
  const isMediaHeader = headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT'
  const dynButtonIndexes = selected ? getDynamicUrlButtonIndexes(selected) : []
  const headerLabel = headerFormat === 'IMAGE' ? 'Imagem'
    : headerFormat === 'VIDEO' ? 'Video'
    : 'Documento'
  const headerAccept = headerFormat === 'IMAGE' ? 'image/jpeg,image/png,image/webp'
    : headerFormat === 'VIDEO' ? 'video/mp4,video/3gpp'
    : 'application/pdf'

  async function handleUploadHeaderMedia(file: File) {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mediaType', (headerFormat || 'IMAGE').toLowerCase())
      // authedFetch com FormData: NAO definir Content-Type manualmente
      const res = await authedFetch('/api/whatsapp/inbox/template-header-media', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setHeaderMediaUrl(data.url)
    } catch (e: any) {
      setError(e?.message || 'Falha no upload da midia')
    } finally {
      setUploading(false)
    }
  }
```

- [ ] **Step 4: Validar e enviar no submit**

Substituir `handleSubmitTemplate` (linhas 167-185):

```ts
  async function handleSubmitTemplate() {
    if (!selected) return
    const expected = countBodyVariables(selected.body_text)
    if (params.some((p, i) => i < expected && !p.trim())) {
      setError('Preencha todas as variaveis')
      return
    }
    if (isMediaHeader && !/^https:\/\//i.test(headerMediaUrl.trim())) {
      setError(`Este template tem cabecalho de ${headerLabel.toLowerCase()}. Informe uma URL https publica ou faca upload do arquivo.`)
      return
    }
    if (dynButtonIndexes.length > 0 && buttonVars.some(v => !v.trim())) {
      setError('Preencha o valor de todos os botoes de URL dinamica')
      return
    }
    setError(null)
    try {
      await onSendTemplate({
        templateName: selected.name,
        language: selected.language,
        parameters: params.slice(0, expected),
        ...(isMediaHeader ? { headerMediaUrl: headerMediaUrl.trim() } : {}),
        ...(dynButtonIndexes.length > 0 ? { buttonParameters: buttonVars.map(v => v.trim()) } : {}),
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Falha ao enviar template')
    }
  }
```

- [ ] **Step 5: JSX — seção de mídia do header e inputs de botão**

Dentro do bloco `{selected && (...)}` (linha 347+), logo ANTES do bloco `{selected.header_text && (...)}` (linha 350), adicionar:

```tsx
              {isMediaHeader && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    CABECALHO — {headerLabel.toUpperCase()} (obrigatorio)
                  </p>
                  <input
                    type="url"
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder={`URL https publica da ${headerLabel.toLowerCase()}`}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-primary-600 cursor-pointer hover:underline">
                    {uploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo...</>
                    ) : (
                      <>ou fazer upload do arquivo</>
                    )}
                    <input
                      type="file"
                      accept={headerAccept}
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleUploadHeaderMedia(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              )}
```

E logo APÓS o bloco de variáveis de body (`{params.length > 0 && (...)}`, fecha na linha 402), adicionar os inputs de botão:

```tsx
              {dynButtonIndexes.length > 0 && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Botoes de URL dinamica</p>
                  {dynButtonIndexes.map((btnIdx, i) => (
                    <div key={btnIdx}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Botao {btnIdx + 1} — sufixo da URL {'{{1}}'}
                      </label>
                      <input
                        type="text"
                        value={buttonVars[i] || ''}
                        onChange={(e) => {
                          const next = buttonVars.slice()
                          next[i] = e.target.value
                          setButtonVars(next)
                        }}
                        placeholder="Ex.: codigo-do-pedido"
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ))}
                </div>
              )}
```

Também desabilitar o botão "Enviar template" durante upload: trocar `disabled={isSending}` do botão de envio (linha 421) por `disabled={isSending || uploading}`.

- [ ] **Step 6: Compilar e rodar suite**

Rodar: `npx tsc --noEmit` e `npm run test`
Esperado: zero erros; suite PASS.

- [ ] **Step 7: Verificação manual no browser**

Com `npm run dev`, abrir o inbox, conversa Cloud, botão de templates:

1. Template só-texto: fluxo antigo intacto (variáveis + enviar → mensagem sai).
2. Template com header IMAGE: seção "CABECALHO — IMAGEM (obrigatorio)" aparece; enviar sem URL mostra o erro em PT; colar URL https → envia e a mensagem chega com imagem; alternativamente "fazer upload do arquivo" preenche a URL sozinho após o upload.
3. Template com botão de URL dinâmica: campo "Botao N — sufixo da URL" aparece e é obrigatório.

- [ ] **Step 8: Commit**

```bash
git add src/components/whatsapp/inbox/TemplatePickerModal.tsx
git commit -m "feat(whatsapp): picker de templates do inbox coleta midia do header (URL ou upload) e variaveis de botao URL dinamica"
```

---

### Task 5: Validação na criação — header de mídia exige example.header_handle

**Files:**
- Modify: `src/app/api/whatsapp/cloud/templates/route.ts:208-220` (estender o bloco de validação de HEADER)
- Test: verificação manual (validação inline de rota; a lógica não-trivial já vive testada no builder da Task 1).

**Interfaces:**
- Consumes: nada novo — validação local sobre o array `components` recebido no POST.
- Produces: POST `/api/whatsapp/cloud/templates` com HEADER `format` IMAGE/VIDEO/DOCUMENT sem `example.header_handle[0]` string não-vazia → `400 { error: string (PT) }` antes de chamar a Meta.

**Justificativa fase 1 (validar em vez de implementar o upload do exemplo):** o `example.header_handle` que a Meta exige na CRIAÇÃO de template NÃO é um media id — ele vem da **Resumable Upload API** (`POST /{app_id}/uploads` + `POST /{upload_session_id}`), que requer o App ID do app Meta e roda num namespace diferente do que `WhatsAppCloudAPI` conhece hoje (`src/lib/whatsapp/cloud-api.ts` só carrega `phoneNumberId`/`accessToken`/`wabaId`; o `uploadMedia` de `cloud-api.ts:530-560` usa `/{phone_number_id}/media` e devolve um media id de ENVIO, inválido como `header_handle`). Implementar o upload correto = nova superfície de API + configuração de App ID por conta → fase 2. A fase 1 elimina a falha silenciosa: hoje o template é submetido, a Meta rejeita tardiamente e o usuário não recebe feedback acionável.

- [ ] **Step 1: Escrever a validação**

Em `src/app/api/whatsapp/cloud/templates/route.ts`, logo após o bloco existente de header TEXT (fecha na linha 220), adicionar:

```ts
    // Header de midia (IMAGE/VIDEO/DOCUMENT): a Meta exige um exemplo
    // enviado via Resumable Upload API (example.header_handle). Sem isso
    // ela rejeita a criacao tardiamente e sem feedback claro — barra aqui.
    const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT']
    const headerFormat = String(headerComponent?.format || '').toUpperCase()
    if (headerComponent && MEDIA_HEADER_FORMATS.includes(headerFormat)) {
      const handles = headerComponent.example?.header_handle
      if (!Array.isArray(handles) || handles.length === 0 ||
          typeof handles[0] !== 'string' || handles[0].trim() === '') {
        return NextResponse.json({
          error: `Header de midia (${headerFormat}) exige um exemplo enviado via Resumable Upload API da Meta: preencha components[HEADER].example.header_handle com o handle retornado pelo upload (formato "4::..."). Sem isso a Meta rejeita o template.`,
        }, { status: 400 });
      }
    }
```

Observação: `headerComponent` já existe no escopo (declarado na linha 208); não redeclarar.

- [ ] **Step 2: Compilar e rodar suite**

Rodar: `npx tsc --noEmit` e `npm run test`
Esperado: zero erros; suite PASS.

- [ ] **Step 3: Verificação manual**

Com `npm run dev` e uma conta válida (`<ACCOUNT_ID>`):

1. Header IMAGE sem handle:
`curl -X POST http://localhost:3000/api/whatsapp/cloud/templates -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"accountId\":\"<ACCOUNT_ID>\",\"name\":\"promo_img_teste\",\"category\":\"MARKETING\",\"components\":[{\"type\":\"HEADER\",\"format\":\"IMAGE\"},{\"type\":\"BODY\",\"text\":\"Oferta especial!\"}]}"`
Esperado: `400` com a mensagem PT sobre `example.header_handle` — SEM chamada à Meta.

2. Header IMAGE com `\"example\":{\"header_handle\":[\"4::abc\"]}` no HEADER: passa da validação (a Meta valida o handle em si).
3. Regressão: template só-BODY continua criando normalmente (200 com `success: true`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/cloud/templates/route.ts
git commit -m "fix(whatsapp): criacao de template valida header de midia (exige example.header_handle) com erro claro em PT — fase 1, sem resumable upload"
```

---

## Cobertura da falha auditada

| Item da auditoria | Task |
|---|---|
| send-template só monta BODY (route.ts:35-40,114-124) | Task 3 (via builder da Task 1) |
| send-template sem parâmetros de botão | Tasks 1 e 3 (`buttonParameters`) |
| Picker só coleta variáveis de body (TemplatePickerModal.tsx:26-30,176-180) | Task 4 |
| Coleta de mídia por URL pública OU upload | Tasks 2 e 4 |
| Criação valida só header TEXT (cloud/templates route.ts:209) | Task 5 |
| `uploadMedia` (cloud-api.ts:530-560) nunca chamada | Já era usada pela media route (inbox media route:177); NÃO serve para `header_handle` (gera media id de envio, não handle de Resumable Upload) — decisão registrada na Task 5 |
| Testes unitários do builder (função pura extraída) | Task 1 |
