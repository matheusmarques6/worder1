# AI Knowledge/RAG Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a base de conhecimento (RAG) dos Agentes IA robusta: extração real de PDF/DOCX (pdf-parse + mammoth com fallback), nenhuma falha silenciosa no upload/processamento de fontes, e nenhuma fonte presa em `pending` para sempre.

**Architecture:** Next.js 14 App Router + Supabase (Postgres com pgvector, Storage, service-role via `getSupabaseAdmin`). O pipeline de conhecimento é: upload/criação de fonte (`ai_agent_sources`) → trigger async via fetch interno para `/api/ai/process/document` → extração de texto → `chunkText` → embeddings OpenAI (`text-embedding-ada-002`) → insert em `ai_agent_chunks` (pgvector). A extração vira módulo testável em `src/lib/ai/processors/file-extractor.ts`; o storage ganha bucket real (`ai-sources`, privado) via migration; o reprocess de arquivos passa a baixar o original do storage; o GET de fontes recupera fontes órfãs marcando-as como `error` (sem cron — YAGNI).

**Tech Stack:** TypeScript, Next.js 14.0.4, Supabase JS v2, pdf-parse v1 (deep import `pdf-parse/lib/pdf-parse.js`), mammoth, Vitest 1.x (`npx vitest run`), pnpm.

**Worktree:** `D:\worder1-fwrle` (branch `claude/debug-console-error-FWrLE`, HEAD `8a378fe4`, working tree limpo — confirmado). Todos os comandos assumem cwd nesse diretório.

---

## Contexto e Análise de Impacto

### Relação com o plano P3 (IMPORTANTE)

**Este plano SUBSTITUI integralmente duas tasks do plano `docs/superpowers/plans/2026-06-10-p3-todos-cleanup.md`:**

- **P3 Task 5** ("Upload de fonte de conhecimento — falhas visíveis") → absorvida e ampliada nas Tasks 5–7 deste plano (a análise do P3 estava correta, mas incompleta: faltava o bucket inexistente e o reprocess quebrado para arquivos).
- **P3 Task 7** ("Extração real de PDF/DOCX") → absorvida e ampliada nas Tasks 1–4 deste plano (acrescenta declaração de módulo `.d.ts` para o deep import e testes de integração com fixtures reais, que o P3 deixava só como fumaça manual).

Quem executar o P3 deve **pular as Tasks 5 e 7 de lá** — a Task 9 deste plano anota isso no próprio documento P3.

### O que a leitura do código real revelou

1. **Extração artesanal confirmada** — `src/app/api/ai/process/document/route.ts:180-237` tem `extractTextFromPDF` (regex `\(([^)]+)\)` sobre o binário) e `extractTextFromDOCX` (regex `<w:t>` sobre o zip cru, que só funciona se o XML não estiver comprimido — na prática quase nunca). O próprio código pede `pdf-parse`/`mammoth`. Nenhum dos dois está no `package.json`. `next.config.js:4` já usa `serverComponentsExternalPackages: ['undici']` — padrão confirmado.

2. **Bucket `ai-sources` NUNCA é criado** — nenhuma migration em `supabase/migrations/` (nem nos `.sql` soltos de `supabase/` e `sql/`) cria bucket algum (`grep storage.buckets` → zero resultados). Ou seja: a menos que tenha sido criado manualmente no dashboard, **todo upload de storage falha hoje** e cai no caminho silencioso da linha 96-101 do upload route (`file_url: null`). A migration mais recente é `20260615_whatsapp_campaign_pipeline.sql`; `20260616` está reservada para P1 v2 → usamos **`20260617`**.

3. **Reprocess está QUEBRADO para fontes de arquivo** — `sources/[sourceId]/reprocess/route.ts:70-76` dispara `process/document` só com `source_id` + `organization_id`. Para `source_type='file'`, `process/document` exige `file_content` no body (linha 62) — sem ele cai no `else` da linha 68 e lança `Tipo de fonte não suportado: file`. Resultado: reprocessar um arquivo sempre termina em `error`. Para `url` e `text` o reprocess funciona (o conteúdo vem do próprio registro). `source_type='products'` também não é suportado pelo `process/document` — gap pré-existente, **fora de escopo** (anotado, não corrigido aqui).

4. **Fontes órfãs em `pending`/`processing` existem por 3 caminhos**: (a) fetch do `processFileAsync`/`processSourceAsync` falha (rede, `NEXT_PUBLIC_APP_URL` errado, deploy) → `pending` eterno; (b) a função `process/document` morre no meio (`maxDuration = 60` — Vercel mata aos 60s) → `processing` eterno; (c) o processo Node morre antes do fetch fire-and-forget completar (em serverless o runtime pode ser congelado após a resposta) → `pending` eterno. A UI (`SourcesTab.tsx:44-45`) mostra "Pendente" para sempre, **sem botão de ação** — o botão "Reprocessar" só aparece para `status === 'error'` (linha 331). Logo, converter órfãs em `error` no GET destrava a recuperação pelo próprio usuário com UI já existente.

5. **`file_url` usa `getPublicUrl`** — com o bucket privado (decisão deste plano: dados de conhecimento da org não devem ser públicos), essa URL não é acessível publicamente, mas continua servindo como **referência de path**: o DELETE (`sources/[sourceId]/route.ts:87`) já extrai o path com `split('/ai-sources/')`. O download server-side no reprocess usa `storage.download(path)` com service-role — funciona com bucket privado. **Nenhuma coluna nova necessária** (sem migration de schema).

6. **Padrões do repo confirmados**: testes Vitest com mocks hoisted (`src/lib/whatsapp/opt-out-guard.test.ts`), `vitest.config.ts` inclui `src/**/*.test.ts`, alias `@/`. Logger estruturado `wlog` existe (`src/lib/observability/whatsapp-logger.ts`) mas é escopado a WhatsApp; o módulo AI usa `console.*` (e `removeConsole` em produção preserva `error`/`warn`) — mantemos `console.warn/error` por consistência local. Package manager: **pnpm** (`pnpm-lock.yaml` na raiz).

### Quem consome o texto extraído (análise de impacto obrigatória)

- **Fluxo**: texto extraído → `cleanTextForIndexing` + `chunkText` (`src/lib/ai/processors/text-processor.ts`, 500 tokens/chunk, overlap 50) → `generateEmbeddingsBatch` (`src/lib/ai/embeddings.ts`, `text-embedding-ada-002`) → `ai_agent_chunks` (pgvector) → busca semântica em `src/lib/ai/rag.ts` (consumida por `ai-chat-service.ts` / `ai-chatbot-service.ts` nas respostas dos agentes).
- **Fontes antigas NÃO melhoram sozinhas**: os chunks de PDFs/DOCXs já processados continuam com o lixo da extração regex até serem **reprocessados** (o reprocess deleta os chunks e re-extrai+re-embeda). Como a UI só mostra "Reprocessar" para `error`, a Task 8 também exibe o botão para fontes `ready` — sem isso não há caminho de UI para melhorar fontes antigas.
- **Custo de reprocessamento**: `text-embedding-ada-002` custa US$0,10/1M tokens. Um PDF de 100 páginas (~50k tokens) ≈ **US$0,005** por reprocessamento. Desprezível por fonte; reprocessamento é manual (botão), nunca em massa automática — sem risco de custo surpresa.
- **Bundle/cold start**: `pdf-parse` (~1MB + pdf.js) e `mammoth` (~2MB) ficam **fora do bundle** via `serverComponentsExternalPackages` (resolvidos de `node_modules` em runtime, mesmo padrão do `undici`). Além disso, os imports são **dinâmicos dentro das funções** — só carregam quando um PDF/DOCX é de fato processado; rotas quentes (chat, webhook) não pagam nada.
- **Retrocompatibilidade**: respostas de API só **ganham** campos (`storage_uploaded`, `warning`); nenhum campo removido/renomeado. Fontes existentes com `file_url: null` reprocessadas recebem `error` com mensagem clara pedindo reenvio (comportamento honesto vs. o erro críptico atual).
- **Deploy**: a migration do bucket (Task 5) deve ser aplicada **antes** do deploy do código da Task 6 (sem o bucket, o upload continua caindo no fallback — que agora fica visível, então nada quebra; apenas a experiência fica completa com o bucket).

### Decisões de design (com justificativa)

| Decisão | Justificativa |
|---|---|
| Fallback para o regex atual quando pdf-parse/mammoth falham | PDF corrompido/escaneado não deve regredir o comportamento; melhor algum texto do que erro, e o erro final ("não foi possível extrair") continua existindo quando nem o fallback acha texto. |
| Deep import `pdf-parse/lib/pdf-parse.js` + `.d.ts` próprio | O index do pdf-parse v1 tem código de debug (`if (isDebugMode)`) que tenta ler `./test/data/05-versions-space.pdf` e quebra em produção. `@types/pdf-parse` só declara o módulo raiz → precisamos da declaração para o deep import. |
| Fixture DOCX **binária commitada** (~1KB), gerada uma única vez via PowerShell/.NET `ZipArchive`; PDF mínimo **inline no teste** | NÃO adicionar JSZip como dependência só para teste (briefing proíbe; YAGNI). DOCX é zip — impossível construir em teste sem lib; PowerShell/.NET gera zip válido com separadores `/` sem nenhuma dependência. PDF é texto plano construível inline (pdf.js tolera xref ausente via recovery scan). |
| Bucket `ai-sources` **privado** | Conteúdo de conhecimento é dado da organização; acesso é 100% server-side via service-role. `file_url` permanece como referência de path (padrão já usado pelo DELETE). |
| Recuperação de órfãs no **GET de sources** (não cron) | Mais simples que resolve (YAGNI): o GET é chamado toda vez que a UI abre a aba; threshold de 1h é seguro pois `maxDuration=60s` torna impossível um processamento legítimo durar 1h. Cron adicionaria infra para cobrir só o caso "ninguém nunca mais abriu a tela". |
| `processing` também é considerado órfão (não só `pending`) | A função pode morrer DEPOIS de marcar `processing` (timeout de 60s da Vercel) — caso real do briefing item (b). |

---

## File Structure

```
src/
  types/pdf-parse-lib.d.ts                                  # T1: criar (declaração do deep import)
  lib/ai/processors/file-extractor.ts                       # T2: criar (pdf-parse/mammoth + fallback)
  lib/ai/processors/file-extractor.test.ts                  # T2: criar (unit, mocks hoisted)
  lib/ai/processors/file-extractor.integration.test.ts      # T3: criar (libs reais + fixtures)
  lib/ai/__tests__/fixtures/minimal.docx                    # T3: criar (binário ~1KB, gerado 1x)
  app/api/ai/process/document/route.ts                      # T4: usar extractor / T7: download do storage
  lib/ai/source-storage.ts                                  # T7: criar (path do storage a partir do file_url)
  lib/ai/source-storage.test.ts                             # T7: criar
  app/api/ai/agents/[id]/sources/upload/route.ts            # T6: modificar (falhas visíveis)
  lib/ai/stale-sources.ts                                   # T8: criar (detecção pura de órfãs)
  lib/ai/stale-sources.test.ts                              # T8: criar
  app/api/ai/agents/[id]/sources/route.ts                   # T8: modificar (GET recupera órfãs)
  components/agents/tabs/SourcesTab.tsx                     # T8: modificar (Reprocessar p/ ready)
next.config.js                                              # T1: modificar (externalPackages)
package.json / pnpm-lock.yaml                               # T1: modificar (deps)
supabase/migrations/20260617_ai_sources_bucket.sql          # T5: criar (única migration)
docs/superpowers/plans/2026-06-10-p3-todos-cleanup.md       # T9: anotar T5/T7 como substituídas
```

---

### Task 1: Dependências + configuração (pdf-parse, mammoth)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm)
- Modify: `next.config.js:4`
- Create: `src/types/pdf-parse-lib.d.ts`

- [ ] **Step 1: Instalar dependências**

Run: `pnpm add pdf-parse@^1.1.1 mammoth` e depois `pnpm add -D @types/pdf-parse`

**PIN OBRIGATÓRIO em pdf-parse v1**: existem releases 2.x (novo mantenedor, 2025) com exports reorganizados — sem o pin, o deep import `pdf-parse/lib/pdf-parse.js` falha com `ERR_PACKAGE_PATH_NOT_EXPORTED` e os testes quebram de forma confusa. Todo o design desta task (deep import, .d.ts, @types) assume v1.
Expected: `pdf-parse`, `mammoth` em `dependencies`; `@types/pdf-parse` em `devDependencies`.

- [ ] **Step 2: Registrar como pacotes externos no Next**

Em `next.config.js`, linha 4:

```js
    serverComponentsExternalPackages: ['undici', 'pdf-parse', 'mammoth'],
```

- [ ] **Step 3: Declaração de módulo para o deep import**

Criar `src/types/pdf-parse-lib.d.ts`:

```ts
// O import raiz de 'pdf-parse' v1 executa código de debug que tenta ler
// './test/data/05-versions-space.pdf' e quebra em produção. Por isso o
// código importa 'pdf-parse/lib/pdf-parse.js' — que @types/pdf-parse não
// declara. Esta declaração reusa os tipos do módulo raiz.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse'
  export default pdfParse
}
```

- [ ] **Step 4: Verificar compilação e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -i "pdf-parse"` — Expected: vazio.

```bash
git add package.json pnpm-lock.yaml next.config.js src/types/pdf-parse-lib.d.ts
git commit -m "chore(ai): adiciona pdf-parse e mammoth como external packages do Next"
```

---

### Task 2: Módulo `file-extractor` (TDD, mocks)

**Files:**
- Create: `src/lib/ai/processors/file-extractor.ts`
- Test: `src/lib/ai/processors/file-extractor.test.ts`

- [ ] **Step 1: Escrever os testes unitários que falham**

`src/lib/ai/processors/file-extractor.test.ts` (padrão de mocks hoisted do repo — `opt-out-guard.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES do import — vitest hoist. Os imports das libs são dinâmicos
// dentro das funções, então vi.mock intercepta na resolução.
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn(async () => ({ text: 'texto extraído do pdf' })),
}))
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })) },
  extractRawText: vi.fn(async () => ({ value: 'texto extraído do docx' })),
}))

import { extractTextFromFile } from './file-extractor'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('extractTextFromFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('text/plain: decodifica utf-8 direto', async () => {
    const b64 = Buffer.from('olá mundo', 'utf-8').toString('base64')
    expect(await extractTextFromFile(b64, 'text/plain')).toBe('olá mundo')
  })

  it('text/csv: decodifica utf-8 direto', async () => {
    const b64 = Buffer.from('a,b\n1,2', 'utf-8').toString('base64')
    expect(await extractTextFromFile(b64, 'text/csv')).toBe('a,b\n1,2')
  })

  it('pdf: usa pdf-parse', async () => {
    const b64 = Buffer.from('%PDF-1.4 fake').toString('base64')
    expect(await extractTextFromFile(b64, 'application/pdf')).toBe('texto extraído do pdf')
  })

  it('docx: usa mammoth', async () => {
    const b64 = Buffer.from('PK fake zip').toString('base64')
    expect(await extractTextFromFile(b64, DOCX_MIME)).toBe('texto extraído do docx')
  })

  it('pdf: cai no fallback regex quando pdf-parse lança', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockRejectedValueOnce(new Error('corrupt'))
    const b64 = Buffer.from('stream (Hello) (World) endstream').toString('base64')
    const out = await extractTextFromFile(b64, 'application/pdf')
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('pdf: cai no fallback quando pdf-parse retorna texto vazio (escaneado)', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockResolvedValueOnce({ text: '   ' })
    const b64 = Buffer.from('(Fallback)').toString('base64')
    expect(await extractTextFromFile(b64, 'application/pdf')).toContain('Fallback')
  })

  it('pdf: lança erro claro quando nem o fallback acha texto', async () => {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as any
    pdfParse.mockRejectedValueOnce(new Error('corrupt'))
    const b64 = Buffer.from('sem parenteses aqui').toString('base64')
    await expect(extractTextFromFile(b64, 'application/pdf')).rejects.toThrow(/PDF/)
  })

  it('docx: cai no fallback regex <w:t> quando mammoth lança', async () => {
    const mammoth = (await import('mammoth')) as any
    mammoth.extractRawText.mockRejectedValueOnce(new Error('bad zip'))
    if (mammoth.default?.extractRawText) {
      mammoth.default.extractRawText.mockRejectedValueOnce(new Error('bad zip'))
    }
    const b64 = Buffer.from('<w:t>Olá</w:t><w:t xml:space="preserve"> Mundo</w:t>').toString('base64')
    const out = await extractTextFromFile(b64, DOCX_MIME)
    expect(out).toContain('Olá')
    expect(out).toContain('Mundo')
  })

  it('mime desconhecido: lança erro', async () => {
    await expect(
      extractTextFromFile(Buffer.from('x').toString('base64'), 'image/png')
    ).rejects.toThrow(/não suportado/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/processors/file-extractor.test.ts`
Expected: FAIL — `Cannot find module './file-extractor'`.

- [ ] **Step 3: Implementar `src/lib/ai/processors/file-extractor.ts`**

```ts
// =============================================
// Extração de texto de arquivos (PDF/DOCX/TXT/CSV) para a base de
// conhecimento dos Agentes IA.
//
// pdf-parse + mammoth com fallback regex (comportamento anterior do
// process/document) quando o parser falha ou não acha texto.
//
// NOTA: importar 'pdf-parse/lib/pdf-parse.js' (NUNCA 'pdf-parse') —
// o index do pacote tem código de debug que tenta ler um arquivo de
// teste local e quebra em produção. Declaração de tipos em
// src/types/pdf-parse-lib.d.ts.
//
// Imports dinâmicos: as libs só carregam quando um PDF/DOCX é
// processado (zero custo de cold start nas demais rotas). Ambas estão
// em serverComponentsExternalPackages no next.config.js.
// =============================================

export async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(base64Content, 'base64')

  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return buffer.toString('utf-8')
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer)
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return extractTextFromDOCX(buffer)
  }
  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`)
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
    const result = await pdfParse(buffer)
    if (result?.text?.trim()) return result.text
    console.warn('[file-extractor] pdf-parse retornou texto vazio (PDF escaneado?), tentando fallback')
  } catch (e: any) {
    console.warn('[file-extractor] pdf-parse falhou, usando fallback regex:', e?.message)
  }
  // Fallback: extração ingênua (comportamento anterior do route)
  const raw = buffer.toString('utf-8')
  const extracted = raw.match(/\(([^)]+)\)/g) || []
  const text = extracted.map((s) => s.slice(1, -1)).join(' ')
  if (!text.trim()) {
    throw new Error('Não foi possível extrair texto do PDF (arquivo corrompido ou sem camada de texto)')
  }
  return text
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammothMod: any = await import('mammoth')
    const extractRawText = mammothMod.extractRawText || mammothMod.default?.extractRawText
    const result = await extractRawText({ buffer })
    if (result?.value?.trim()) return result.value
    console.warn('[file-extractor] mammoth retornou texto vazio, tentando fallback')
  } catch (e: any) {
    console.warn('[file-extractor] mammoth falhou, usando fallback regex:', e?.message)
  }
  // Fallback: regex sobre o XML cru (só funciona se o zip não comprimir o XML)
  const raw = buffer.toString('utf-8')
  const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
  const text = matches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ').trim()
  if (!text) {
    throw new Error('Não foi possível extrair texto do DOCX (arquivo corrompido?)')
  }
  return text
}
```

- [ ] **Step 4: Rodar testes — passar**

Run: `npx vitest run src/lib/ai/processors/file-extractor.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/processors/file-extractor.ts src/lib/ai/processors/file-extractor.test.ts
git commit -m "feat(ai): modulo file-extractor com pdf-parse e mammoth + fallback regex"
```

---

### Task 3: Fixtures reais + testes de integração

Decisão: PDF mínimo construído **inline** no teste (PDF é formato textual; pdf.js reconstrói o índice quando o xref está ausente — recovery scan). DOCX é zip → **fixture binária pequena commitada** (~1KB), gerada uma única vez com .NET `ZipArchive` via PowerShell (sem nenhuma dependência nova; `Compress-Archive` do PS 5.1 foi evitado por gravar separadores `\` nas entries, que quebram leitores de zip).

**Files:**
- Create: `src/lib/ai/__tests__/fixtures/minimal.docx` (binário, gerado 1x)
- Test: `src/lib/ai/processors/file-extractor.integration.test.ts`

- [ ] **Step 1: Gerar a fixture DOCX (uma única vez)**

Rodar este script PowerShell na raiz do worktree (cria zip válido com `[Content_Types].xml`, `_rels/.rels` e `word/document.xml`):

```powershell
New-Item -ItemType Directory -Force "src/lib/ai/__tests__/fixtures" | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$path = Join-Path (Get-Location) "src/lib/ai/__tests__/fixtures/minimal.docx"
if (Test-Path $path) { Remove-Item $path -Force -Confirm:$false }
$fs = [System.IO.File]::Create($path)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
function Add-Entry($zip, $name, $content) {
  $entry = $zip.CreateEntry($name)
  $writer = New-Object System.IO.StreamWriter($entry.Open())
  $writer.Write($content)
  $writer.Dispose()
}
Add-Entry $zip '[Content_Types].xml' '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
Add-Entry $zip '_rels/.rels' '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="R1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
Add-Entry $zip 'word/document.xml' '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Worder fixture DOCX para teste de extracao real</w:t></w:r></w:p></w:body></w:document>'
$zip.Dispose(); $fs.Dispose()
Write-Host "OK: $((Get-Item $path).Length) bytes"
```

Expected: `OK: <~700-1100> bytes`.

- [ ] **Step 2: Escrever o teste de integração (libs REAIS, sem mocks)**

`src/lib/ai/processors/file-extractor.integration.test.ts`:

```ts
// Testes de integração: pdf-parse e mammoth REAIS (sem vi.mock).
// Mantidos em arquivo separado do unit test porque os mocks de lá
// são hoisted para o módulo inteiro.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractTextFromFile } from './file-extractor'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// PDF mínimo válido construído inline (PDF é formato textual).
// Sem tabela xref: o pdf.js (motor do pdf-parse) reconstrói o índice
// de objetos via recovery scan quando o xref está ausente/quebrado.
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  '4 0 obj<</Length 58>>stream',
  'BT /F1 18 Tf 36 740 Td (Worder fixture PDF de teste) Tj ET',
  'endstream',
  'endobj',
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  'trailer<</Root 1 0 R/Size 6>>',
  '%%EOF',
].join('\n')

describe('file-extractor (integração, libs reais)', () => {
  it('extrai texto de um PDF mínimo real com pdf-parse', async () => {
    const b64 = Buffer.from(MINIMAL_PDF, 'latin1').toString('base64')
    const text = await extractTextFromFile(b64, 'application/pdf')
    expect(text).toContain('Worder fixture PDF de teste')
  })

  it('extrai texto de um DOCX mínimo real com mammoth', async () => {
    const fixture = readFileSync(
      join(__dirname, '..', '__tests__', 'fixtures', 'minimal.docx')
    )
    const text = await extractTextFromFile(fixture.toString('base64'), DOCX_MIME)
    expect(text).toContain('Worder fixture DOCX para teste de extracao real')
  })

  it('DOCX fixture NÃO seria extraível pelo fallback regex (prova de valor)', () => {
    // O zip comprime word/document.xml — o regex <w:t> sobre o binário
    // cru (método antigo) não encontra nada. mammoth é necessário.
    const fixture = readFileSync(
      join(__dirname, '..', '__tests__', 'fixtures', 'minimal.docx')
    )
    const raw = fixture.toString('utf-8')
    expect(raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)).toBeNull()
  })
})
```

Nota: se o `ZipArchive` gravar a entry sem compressão (arquivo muito pequeno), o terceiro teste pode falhar — nesse caso, removê-lo (é apenas documentação executável, não contrato). Se o pdf.js rejeitar o PDF sintético (improvável), a contingência é commitar um PDF real de 1 página em `src/lib/ai/__tests__/fixtures/minimal.pdf` e ler via `readFileSync` como no DOCX.

- [ ] **Step 3: Rodar — passar**

Run: `npx vitest run src/lib/ai/processors/file-extractor.integration.test.ts`
Expected: 3 passed (PDF real extraído pelo pdf-parse; DOCX real extraído pelo mammoth).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/__tests__/fixtures/minimal.docx src/lib/ai/processors/file-extractor.integration.test.ts
git commit -m "test(ai): testes de integracao do file-extractor com fixtures reais de PDF e DOCX"
```

---

### Task 4: Usar o extractor no `process/document` (remover versões inline)

**Files:**
- Modify: `src/app/api/ai/process/document/route.ts` (linhas 1-2 e 176-237)

- [ ] **Step 1: Trocar o import e deletar as funções inline**

No topo do arquivo, adicionar:

```ts
import { extractTextFromFile } from '@/lib/ai/processors/file-extractor'
```

**Remover** integralmente as funções inline `extractTextFromFile`, `extractTextFromPDF` e `extractTextFromDOCX` (linhas 176-237, incluindo os banners de comentário). `crawlUrl` permanece intocada. A chamada na linha 64 (`text = await extractTextFromFile(file_content, mime_type || source.mime_type)`) continua válida sem mudanças.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit 2>&1 | grep "process/document"` — Expected: vazio.
Run: `npx vitest run src/lib/ai` — Expected: tudo verde.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/process/document/route.ts
git commit -m "feat(ai): process/document usa file-extractor real (pdf-parse/mammoth) no lugar do regex artesanal"
```

---

### Task 5: Migration — bucket `ai-sources` (que nunca foi criado)

**Files:**
- Create: `supabase/migrations/20260617_ai_sources_bucket.sql`

- [ ] **Step 1: Escrever a migration (idempotente)**

```sql
-- =============================================
-- Bucket de storage para arquivos de fontes de conhecimento dos
-- Agentes IA (ai_agent_sources com source_type='file').
--
-- NUNCA foi criado por migration — o codigo em
-- src/app/api/ai/agents/[id]/sources/upload/route.ts referencia
-- 'ai-sources' desde sempre e caia silenciosamente no fallback
-- "processa sem storage" quando o bucket nao existia.
--
-- PRIVADO: acesso exclusivamente server-side via service-role
-- (upload, download p/ reprocess, delete). Sem policies em
-- storage.objects: o default-deny do RLS bloqueia anon/authenticated.
-- O file_url gravado na fonte serve como referencia de path
-- (padrao ja usado pelo DELETE em sources/[sourceId]/route.ts).
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-sources',
  'ai-sources',
  false,
  26214400, -- 25MB (mesmo MAX_FILE_SIZE do upload/route.ts)
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar no projeto Supabase**

Via MCP `apply_migration` (ou dashboard) — **antes** do deploy da Task 6. Verificar: `select id, public from storage.buckets where id = 'ai-sources'` → 1 linha, `public = false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617_ai_sources_bucket.sql
git commit -m "feat(ai): migration do bucket privado ai-sources (nunca existiu — upload caia no fallback silencioso)"
```

---

### Task 6: Upload — falha de storage visível + trigger de processamento que marca `error` (substitui P3 Task 5)

Decisão de design (mesma do P3, validada de novo no código): o fallback "processa sem storage" é legítimo — o buffer segue em base64 para `process/document` e a fonte fica `ready` mesmo sem `file_url`. **Não** retornar 5xx no upload quando só o storage falha. Os fixes: expor a falha na resposta, e garantir que falha no trigger async marque a fonte como `error` (nunca `pending` órfã).

**Files:**
- Modify: `src/app/api/ai/agents/[id]/sources/upload/route.ts` (linhas 96-101, 145, 157-179)

- [ ] **Step 1: Expor falha de storage na resposta**

Substituir o bloco das linhas 96-101 por:

```ts
    let storageUploaded = true
    if (uploadError) {
      storageUploaded = false
      console.error('[ai/sources/upload] Storage upload failed (bucket ai-sources):', uploadError.message)
      // Fallback explícito: o processamento abaixo usa o buffer em memória
      // (base64), então a fonte ainda será indexada — mas sem arquivo
      // arquivado (file_url = null), o que torna o REPROCESS impossível
      // para esta fonte. O cliente é informado via storage_uploaded: false.
    }
```

E substituir o `return` da linha 145 por:

```ts
    return NextResponse.json(
      {
        source,
        storage_uploaded: storageUploaded,
        ...(storageUploaded ? {} : {
          warning: 'Arquivo será indexado, mas não pôde ser arquivado no storage (bucket ai-sources indisponível). Reprocessamento futuro exigirá novo upload.',
        }),
      },
      { status: 201 }
    )
```

- [ ] **Step 2: `processFileAsync` marca a fonte como `error` quando o trigger falha**

Substituir a função `processFileAsync` inteira (linhas 157-179):

```ts
async function processFileAsync(
  sourceId: string,
  organizationId: string,
  fileBuffer: Buffer,
  mimeType: string
) {
  const supabase = getSupabase()
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
        file_content: fileBuffer.toString('base64'),
        mime_type: mimeType,
      }),
    })

    if (!res.ok) {
      // process/document já marca a fonte como error no catch dele;
      // este throw cobre respostas de erro ANTES do processamento
      // (404 fonte não encontrada, 400 etc.).
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering file processing:', error)
    // Sem isso a fonte ficaria presa em 'pending' para sempre.
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'error',
        error_message: `Falha ao iniciar processamento: ${error?.message || 'erro desconhecido'}. Clique em Reprocessar.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .then(undefined, () => {})
  }
}
```

- [ ] **Step 3: Mesmo tratamento no `processSourceAsync` de `sources/route.ts`**

Em `src/app/api/ai/agents/[id]/sources/route.ts`, substituir `processSourceAsync` (linhas 170-186) pela mesma estrutura (sem `file_content`):

```ts
async function processSourceAsync(sourceId: string, organizationId: string) {
  const supabase = getSupabase()
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId, organization_id: organizationId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering source processing:', error)
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'error',
        error_message: `Falha ao iniciar processamento: ${error?.message || 'erro desconhecido'}. Clique em Reprocessar.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .then(undefined, () => {})
  }
}
```

- [ ] **Step 4: Verificar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -E "sources/upload|sources/route"` — Expected: vazio.
Manual (com dev server): subir um `.txt` → fonte `ready`; derrubar `OPENAI_API_KEY` e subir outro → fonte `error` com mensagem visível na UI (nunca `pending` eterno).

```bash
git add "src/app/api/ai/agents/[id]/sources/upload/route.ts" "src/app/api/ai/agents/[id]/sources/route.ts"
git commit -m "fix(ai-sources): falha de storage exposta na resposta e fonte marcada como error quando o trigger de processamento falha"
```

---

### Task 7: Consertar reprocess de fontes de arquivo (download do storage)

Bug encontrado na leitura do código (não estava no briefing nem no P3): `reprocess` não envia `file_content`, e `process/document` exige-o para `source_type='file'` → reprocessar arquivo **sempre** termina em `error: Tipo de fonte não suportado: file`. Fix: quando for `file` sem `file_content`, baixar o original do bucket usando o path derivado de `file_url` (mesmo padrão do DELETE).

**Files:**
- Create: `src/lib/ai/source-storage.ts`
- Test: `src/lib/ai/source-storage.test.ts`
- Modify: `src/app/api/ai/process/document/route.ts` (bloco das linhas 59-70)

- [ ] **Step 1: Teste do helper puro (falha primeiro)**

`src/lib/ai/source-storage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractStoragePathFromFileUrl, AI_SOURCES_BUCKET } from './source-storage'

describe('extractStoragePathFromFileUrl', () => {
  it('extrai o path de uma URL pública do Supabase', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/ai-sources/org-1/agent-1/123_doc.pdf'
    expect(extractStoragePathFromFileUrl(url)).toBe('org-1/agent-1/123_doc.pdf')
  })

  it('retorna null para null/undefined/vazio', () => {
    expect(extractStoragePathFromFileUrl(null)).toBeNull()
    expect(extractStoragePathFromFileUrl(undefined)).toBeNull()
    expect(extractStoragePathFromFileUrl('')).toBeNull()
  })

  it('retorna null quando a URL não contém o bucket', () => {
    expect(extractStoragePathFromFileUrl('https://exemplo.com/outro/arquivo.pdf')).toBeNull()
  })

  it('expõe o nome do bucket como constante', () => {
    expect(AI_SOURCES_BUCKET).toBe('ai-sources')
  })
})
```

Run: `npx vitest run src/lib/ai/source-storage.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar `src/lib/ai/source-storage.ts`**

```ts
// =============================================
// Helpers de storage para fontes de conhecimento (bucket ai-sources).
// O file_url gravado em ai_agent_sources é uma URL "pública" do
// Supabase usada como referência de path (o bucket é PRIVADO — o
// download real é server-side via service-role).
// Mesmo padrão de derivação já usado pelo DELETE em
// sources/[sourceId]/route.ts.
// =============================================

export const AI_SOURCES_BUCKET = 'ai-sources'

export function extractStoragePathFromFileUrl(
  fileUrl: string | null | undefined
): string | null {
  if (!fileUrl) return null
  const parts = fileUrl.split(`/${AI_SOURCES_BUCKET}/`)
  return parts.length > 1 && parts[1] ? parts[1] : null
}
```

Run: `npx vitest run src/lib/ai/source-storage.test.ts` — Expected: 4 passed.

- [ ] **Step 3: Usar no `process/document` (caminho de reprocess)**

Em `src/app/api/ai/process/document/route.ts`, adicionar o import:

```ts
import { extractStoragePathFromFileUrl, AI_SOURCES_BUCKET } from '@/lib/ai/source-storage'
```

E substituir o bloco de extração (linhas 59-70) por:

```ts
    if (source.source_type === 'text') {
      // Texto direto
      text = source.text_content || ''
    } else if (source.source_type === 'file') {
      let contentBase64: string | undefined = file_content
      if (!contentBase64) {
        // Reprocess: o body não traz o arquivo — baixar o original do storage.
        const storagePath = extractStoragePathFromFileUrl(source.file_url)
        if (!storagePath) {
          throw new Error(
            'Arquivo original não está arquivado no storage. Exclua esta fonte e envie o arquivo novamente.'
          )
        }
        const { data: blob, error: downloadError } = await supabase.storage
          .from(AI_SOURCES_BUCKET)
          .download(storagePath)
        if (downloadError || !blob) {
          throw new Error(
            `Falha ao baixar o arquivo original do storage: ${downloadError?.message || 'arquivo não encontrado'}`
          )
        }
        contentBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      }
      text = await extractTextFromFile(contentBase64, mime_type || source.mime_type)
    } else if (source.source_type === 'url') {
      // Crawl de URL
      text = await crawlUrl(source.url)
    } else {
      // Nota: source_type='products' pode ser criado por sources/route.ts mas
      // nunca foi suportado aqui (gap pré-existente, fora do escopo deste plano).
      throw new Error(`Tipo de fonte não suportado: ${source.source_type}`)
    }
```

(Falhas de download caem no `catch` existente da rota, que já marca a fonte como `error` com `error_message` — comportamento correto e visível.)

- [ ] **Step 4: Verificar e commitar**

Run: `npx tsc --noEmit 2>&1 | grep -E "process/document|source-storage"` — Expected: vazio.
Run: `npx vitest run src/lib/ai` — Expected: tudo verde.
Manual (com bucket da Task 5 aplicado): subir um PDF → `ready`; clicar Reprocessar → volta a `ready` com chunks (antes: `error: Tipo de fonte não suportado: file`).

```bash
git add src/lib/ai/source-storage.ts src/lib/ai/source-storage.test.ts src/app/api/ai/process/document/route.ts
git commit -m "fix(ai): reprocess de fontes de arquivo baixa o original do storage (antes falhava sempre)"
```

---

### Task 8: Recuperação de fontes órfãs em `pending`/`processing`

Mecanismo mais barato que resolve (YAGNI — sem cron): no GET de sources, fontes em `pending`/`processing` há mais de 1h são marcadas como `error` com mensagem acionável. Como `process/document` tem `maxDuration = 60` (segundos), nenhum processamento legítimo dura 1h — zero falso positivo. A conversão para `error` destrava o botão "Reprocessar" da UI existente; também passamos a exibir o botão para fontes `ready` (única forma de fontes antigas se beneficiarem da extração melhorada).

**Files:**
- Create: `src/lib/ai/stale-sources.ts`
- Test: `src/lib/ai/stale-sources.test.ts`
- Modify: `src/app/api/ai/agents/[id]/sources/route.ts` (GET, linhas ~32-55)
- Modify: `src/components/agents/tabs/SourcesTab.tsx` (linha 331)

- [ ] **Step 1: Teste do detector puro (falha primeiro)**

`src/lib/ai/stale-sources.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findStaleSourceIds, STALE_SOURCE_THRESHOLD_MS, STALE_SOURCE_MESSAGE } from './stale-sources'

const NOW = new Date('2026-06-10T12:00:00Z').getTime()
const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()
const tenMinAgo = new Date(NOW - 10 * 60 * 1000).toISOString()

describe('findStaleSourceIds', () => {
  it('marca pending com mais de 1h como órfã', () => {
    const sources = [{ id: 'a', status: 'pending', updated_at: twoHoursAgo, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['a'])
  })

  it('marca processing com mais de 1h como órfã (função morta no meio)', () => {
    const sources = [{ id: 'b', status: 'processing', updated_at: twoHoursAgo, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['b'])
  })

  it('NÃO marca pending recente (processamento em andamento)', () => {
    const sources = [{ id: 'c', status: 'pending', updated_at: tenMinAgo, created_at: tenMinAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual([])
  })

  it('NÃO marca ready nem error, mesmo antigas', () => {
    const sources = [
      { id: 'd', status: 'ready', updated_at: twoHoursAgo, created_at: twoHoursAgo },
      { id: 'e', status: 'error', updated_at: twoHoursAgo, created_at: twoHoursAgo },
    ]
    expect(findStaleSourceIds(sources, NOW)).toEqual([])
  })

  it('usa created_at quando updated_at está ausente', () => {
    const sources = [{ id: 'f', status: 'pending', updated_at: null, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['f'])
  })

  it('threshold é 1 hora e a mensagem orienta o reprocess', () => {
    expect(STALE_SOURCE_THRESHOLD_MS).toBe(60 * 60 * 1000)
    expect(STALE_SOURCE_MESSAGE).toContain('Reprocessar')
  })
})
```

Run: `npx vitest run src/lib/ai/stale-sources.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar `src/lib/ai/stale-sources.ts`**

```ts
// =============================================
// Detecção de fontes de conhecimento órfãs.
//
// Uma fonte fica presa em 'pending'/'processing' quando o trigger
// async falha sem marcar erro ou quando process/document morre no
// meio (maxDuration=60s na Vercel). Como nenhum processamento
// legítimo dura 1h, qualquer fonte nesses status há mais de 1h é
// órfã — convertida em 'error' pelo GET de sources, o que destrava
// o botão "Reprocessar" da UI.
// =============================================

export const STALE_SOURCE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hora

export const STALE_SOURCE_MESSAGE =
  'O processamento não foi concluído no tempo esperado. Clique em Reprocessar para tentar novamente.'

interface SourceLike {
  id: string
  status: string
  updated_at?: string | null
  created_at?: string | null
}

export function findStaleSourceIds(
  sources: SourceLike[],
  now: number = Date.now()
): string[] {
  return sources
    .filter((s) => {
      if (s.status !== 'pending' && s.status !== 'processing') return false
      const ref = s.updated_at || s.created_at
      if (!ref) return false
      return now - new Date(ref).getTime() > STALE_SOURCE_THRESHOLD_MS
    })
    .map((s) => s.id)
}
```

Run: `npx vitest run src/lib/ai/stale-sources.test.ts` — Expected: 6 passed.

- [ ] **Step 3: Integrar no GET de sources**

Em `src/app/api/ai/agents/[id]/sources/route.ts`, adicionar o import:

```ts
import { findStaleSourceIds, STALE_SOURCE_MESSAGE } from '@/lib/ai/stale-sources'
```

E no GET, entre o fetch das fontes (linha 43) e o cálculo de `stats` (linha 46), inserir:

```ts
    // Recuperação de fontes órfãs: pending/processing há >1h viram 'error'
    // (com mensagem acionável) — o botão Reprocessar da UI faz o resto.
    const staleIds = findStaleSourceIds(sources || [])
    if (staleIds.length > 0) {
      console.warn(`[ai/sources] Marcando ${staleIds.length} fonte(s) órfã(s) como error:`, staleIds)
      const nowIso = new Date().toISOString()
      await supabase
        .from('ai_agent_sources')
        .update({ status: 'error', error_message: STALE_SOURCE_MESSAGE, updated_at: nowIso })
        .in('id', staleIds)
        .eq('organization_id', organizationId)
      for (const s of sources || []) {
        if (staleIds.includes(s.id)) {
          s.status = 'error'
          s.error_message = STALE_SOURCE_MESSAGE
          s.updated_at = nowIso
        }
      }
    }
```

(As `stats` são calculadas depois da mutação — os contadores já refletem a conversão.)

- [ ] **Step 4: Exibir "Reprocessar" também para fontes `ready`**

Em `src/components/agents/tabs/SourcesTab.tsx`, linha 331, trocar:

```tsx
                    {(source.status === 'error' || source.status === 'ready') && (
```

(Motivação documentada: fontes PDF/DOCX antigas só se beneficiam da extração melhorada se reprocessadas — sem isso não existe caminho de UI.)

- [ ] **Step 5: Verificar e commitar**

Run: `npx vitest run src/lib/ai` — Expected: tudo verde.
Run: `npx tsc --noEmit 2>&1 | grep -E "sources/route|stale-sources|SourcesTab"` — Expected: vazio.
Manual: forçar uma fonte para `pending` com `updated_at` antigo via SQL (`update ai_agent_sources set status='pending', updated_at = now() - interval '2 hours' where id = '<id>'`) → abrir a aba de fontes → fonte aparece como "Erro" com a mensagem e botão Reprocessar.

```bash
git add src/lib/ai/stale-sources.ts src/lib/ai/stale-sources.test.ts "src/app/api/ai/agents/[id]/sources/route.ts" src/components/agents/tabs/SourcesTab.tsx
git commit -m "feat(ai): fontes presas em pending/processing >1h viram error com recuperacao via Reprocessar (tambem habilitado para ready)"
```

---

### Task 9: Anotar substituição no plano P3 + verificação final

**Files:**
- Modify: `docs/superpowers/plans/2026-06-10-p3-todos-cleanup.md` (cabeçalhos das Tasks 5 e 7)

- [ ] **Step 1: Marcar as tasks do P3 como substituídas**

No P3, logo abaixo do título `### Task 5: Upload de fonte de conhecimento — falhas visíveis (item 10)` adicionar a linha:

```markdown
> **SUBSTITUÍDA** pelo plano `2026-06-10-ai-rag-robustness.md` (Tasks 5–7 de lá, que incluem também o bucket ai-sources e o conserto do reprocess de arquivos). NÃO executar esta task.
```

E abaixo de `### Task 7: Extração real de PDF/DOCX com pdf-parse e mammoth (item 9)`:

```markdown
> **SUBSTITUÍDA** pelo plano `2026-06-10-ai-rag-robustness.md` (Tasks 1–4 de lá, que incluem também o .d.ts do deep import e testes de integração com fixtures reais). NÃO executar esta task.
```

- [ ] **Step 2: Suite completa + typecheck**

Run: `npx vitest run`
Expected: todos os testes passando (incluindo os 19+ novos deste plano).

Run: `npx tsc --noEmit`
Expected: sem erros novos (comparar com a baseline da branch antes do plano, se houver erros pré-existentes).

- [ ] **Step 3: Smoke test manual de ponta a ponta**

Com dev server + bucket aplicado: (1) subir um PDF real de 1 página → fonte `ready`, chunks legíveis em `ai_agent_chunks.content` (não mais fragmentos de parênteses do binário); (2) subir um `.docx` real → idem; (3) clicar Reprocessar em ambos → voltam a `ready`; (4) testar o agente no chat e confirmar que ele responde com conteúdo do documento.

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/plans/2026-06-10-p3-todos-cleanup.md
git commit -m "docs(plans): marca tasks 5 e 7 do P3 como substituidas pelo plano de robustez RAG"
```

---

### Critical Files for Implementation
- D:\worder1-fwrle\src\app\api\ai\process\document\route.ts
- D:\worder1-fwrle\src\app\api\ai\agents\[id]\sources\upload\route.ts
- D:\worder1-fwrle\src\app\api\ai\agents\[id]\sources\route.ts
- D:\worder1-fwrle\src\app\api\ai\agents\[id]\sources\[sourceId]\reprocess\route.ts
- D:\worder1-fwrle\next.config.js
