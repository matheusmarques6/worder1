# AI Agents Product Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar 3 lacunas de produto dos Agentes IA: crawl de URL multi-página com detecção honesta de SPA, persistência das ações pré-configuradas dos templates de nicho (o único gap real dos templates), e CSAT real (whatsapp_csat_ratings) nos relatórios com discriminador real/estimado.

**Architecture:** Frente A extrai o crawl para módulo puro `src/lib/ai/crawler.ts` (parse de sitemap, extração de links, limpeza de HTML testáveis em unidade) e o route só orquestra. Frente B adiciona um adaptador puro `TemplateAction → ai_agent_actions` e um seeding best-effort no `CreateAgentFlow` pós-criação. Frente C adiciona função pura `resolveCsat` em `reports-metrics.ts` e duas queries novas em `getReportSummary`, mudando o shape de `csat` para `{ value, source, sampleSize }` (consumidor único: `ReportsView`).

**Tech Stack:** Next.js 14 App Router (rotas em `src/app/api`), Supabase (service role via `getSupabaseAdmin`), Vitest (`npx vitest run`, config em `vitest.config.ts`, testes em `src/lib/ai/__tests__/`), `getAuthClient` p/ auth de rota, `wlog` (`@/lib/observability/whatsapp-logger`) p/ logging estruturado.

---

## Contexto e Análise de Impacto

### Divergências encontradas vs. o briefing (código real lido em D:\worder1-fwrle)

1. **Frente B — premissa "dead code" é FALSA.** `src/components/agents/create/steps/Step1Niche.tsx:7` importa `ALL_TEMPLATES` e renderiza o seletor de nicho como Step 1 do wizard. `CreateAgentFlow.tsx:28-33` usa `getTemplateById`, `getTemplateDefaultsExtended` e `generatePromptFromTemplate`, e o wizard está vivo na página (`src/app/(dashboard)/whatsapp/ai-agents/page.tsx:98` → `AIAgentList` → `CreateAgentFlow`). O passo "Começar de um modelo" JÁ EXISTE. **Gaps reais remanescentes:**
   - `template.defaultActions` nunca são persistidas em `ai_agent_actions` (em `buildFullPrompt` os ids vão em `enabledActions`, mas `generatePromptFromTemplate` ignora esse campo). Há **drift de shape**: condição do template é `{type:'intent', value:'human'}` e o engine (`actions-engine.ts:151-171`) espera `{type:'intent', intent:'human'}`, `{type:'contains', keywords:[...]}` etc. Ação do template é `{type:'transfer', value:'queue'}` e o engine espera `{type:'transfer', transfer_to:'queue'}`, `{type:'exact_message', message:...}`, `{type:'ask_for', ask_field:...}`.
   - `template.defaultGuidelines` são ignoradas: `CreateAgentFlow` envia `persona.guidelines = agentFunction.mainTasks` (linhas 335, 403, 459).
2. **Frente C — vínculo CSAT↔agente.** `whatsapp_csat_ratings` (DDL em `sql/whatsapp-migration-final.sql:250`) tem `conversation_id` com FK → `whatsapp_conversations(id)`. **ARMADILHA:** a coluna `agent_id` dessa tabela é o **usuário humano autenticado** (`src/app/api/whatsapp/inbox/conversations/[id]/csat/route.ts:34` grava `authUserId`) — NÃO é o agente de IA. O vínculo honesto é via `conversation_id` → conversas com `ai_agent_id = agente`. Existem DUAS tabelas de conversa com `ai_agent_id`: `whatsapp_cloud_conversations` (usada hoje por `getReportSummary`) e `whatsapp_conversations` (legado, coluna adicionada em `whatsapp-migration-final.sql:14`). O plano consulta as duas e intersecta em JS (evita `.in()` com URLs gigantes do PostgREST).
3. **`wlog` existe** em `src/lib/observability/whatsapp-logger.ts` (não em `@/lib/wlog`).
4. **Reprocess apaga chunks antigos** (`sources/[sourceId]/reprocess/route.ts:47-48` deleta `ai_agent_chunks`) — reprocessar fonte URL com o crawler novo substitui a base, sem duplicação.
5. `/api/ai/process/document` **não tem auth** (é chamado server-to-server por `sources/route.ts:175`, `upload/route.ts:166`, `reprocess/route.ts:70`). Endurecer isso está FORA do escopo (mudaria 3 callers; risco alto, valor ortogonal). [Nota: coberto pelo plano P1 v2.]

### Impacto por frente

- **Frente A:** ao reprocessar fontes URL existentes: (a) sites estáticos passam a indexar até 20 páginas → mais chunks e mais custo de embedding (mitigado por caps de página/tamanho); (b) fontes de SPAs que hoje ficam "ready" com lixo (menu/footer ou nada) passam a `status='error'` com mensagem acionável — comportamento intencional e honesto. `KnowledgeBasePanel` já exibe `status`/`error_message` de fontes, sem mudança de UI.
- **Frente B:** seeding de ações é **pós-criação e best-effort** (falha não bloqueia nem reverte a criação do agente) — fluxo atual do wizard intocado nos steps. Limite de 20 ações por agente já é validado pela API (`actions/route.ts:13`).
- **Frente C:** **breaking change** no shape de `summary.csat` da resposta de `GET /api/ai/agents/[id]/reports` (`number` → objeto). Consumidores: apenas `ReportsView.tsx` (interface local `Summary`) e o tipo `ReportSummary` em `proposals.ts` — ambos atualizados no mesmo PR. Verificação obrigatória de outros usos no Task 6. Sem migration: as tabelas já existem (20260616-17 ficam reservadas, 20260618+ não é necessário).

### Cortes YAGNI (justificados)

| Corte | Justificativa |
|---|---|
| Headless browser (Playwright/Puppeteer) no crawl | Proibido pelo briefing: serverless (maxDuration 60s), binário chromium >50MB, custo e cold start. Decisão documentada no header de `crawler.ts`. SPAs → erro honesto direcionando para upload/integração de produtos. |
| Endpoint `GET /api/ai/templates` | Templates são TS estático bundlado no client; o wizard já os importa direto (`Step1Niche.tsx:7`). Um endpoint autenticado duplicaria o caminho de acesso com zero consumidor. Se um dia houver consumo externo (API pública), cria-se na hora. |
| Novo passo/card "Começar de um modelo" no wizard | Já existe: é o Step 1 (Nicho) do `CreateAgentFlow`. |
| Sitemap index recursivo / robots.txt parsing | 1 nível de sitemapindex (pega o primeiro child) cobre a vasta maioria de lojas; robots.txt parsing completo é overkill para 20 páginas com UA identificável. |
| Coleta de CSAT (envio de pesquisa ao fechar conversa) | É o plano P2, fora de escopo. Frente C é resiliente: com poucos dados reais, cai no proxy com `source:'estimated'`. |
| Migration nova p/ CSAT | `whatsapp_csat_ratings`, `whatsapp_conversations.ai_agent_id` e `whatsapp_cloud_conversations.ai_agent_id` já existem. |
| Fila/job real p/ crawl | O fire-and-forget atual via `processSourceAsync` permanece; caps + deadline interno cabem nos 60s do route. |

---

## File Structure

```
src/lib/ai/crawler.ts                                   (CRIAR — funções puras + orquestrador crawlSite)
src/lib/ai/__tests__/crawler.test.ts                    (CRIAR)
src/app/api/ai/process/document/route.ts                (MODIFICAR — usa crawlSite, remove crawlUrl)
src/lib/ai/templates/action-adapter.ts                  (CRIAR — adaptador puro TemplateAction → payload da API)
src/lib/ai/__tests__/action-adapter.test.ts             (CRIAR)
src/components/agents/create/CreateAgentFlow.tsx        (MODIFICAR — seed de ações + defaultGuidelines)
src/lib/ai/reports-metrics.ts                           (MODIFICAR — resolveCsat + tipo CsatSummary)
src/lib/ai/__tests__/reports-metrics.test.ts            (MODIFICAR — testes resolveCsat)
src/lib/ai/proposals.ts                                 (MODIFICAR — getReportSummary busca CSAT real; ReportSummary.csat)
src/components/agents/reports/ReportsView.tsx           (MODIFICAR — badge real/estimado)
```

---

## Frente A — Crawl de URL melhorado

### Task 1: Funções puras do crawler (`crawler.ts`)

**Files:**
- Create: `src/lib/ai/crawler.ts`
- Test: `src/lib/ai/__tests__/crawler.test.ts`

- [ ] **Step 1: Escrever testes falhando para as funções puras**

```ts
// src/lib/ai/__tests__/crawler.test.ts
// =============================================
// crawler.ts — testes das funções puras (sem rede)
// =============================================
import { describe, it, expect } from 'vitest'
import {
  stripHtmlToText,
  extractSitemapUrls,
  extractInternalLinks,
  MIN_USEFUL_CHARS,
} from '../crawler'

describe('stripHtmlToText', () => {
  it('remove script/style/nav/header/footer e tags, mantém texto e título', () => {
    const html = `<html><head><title>Loja X</title><style>.a{}</style></head>
      <body><nav>menu</nav><header>topo</header>
      <script>var x=1</script>
      <p>Camiseta b&aacute;sica &amp; shorts</p>
      <footer>rodape</footer></body></html>`
    const { title, text } = stripHtmlToText(html)
    expect(title).toBe('Loja X')
    expect(text).toContain('Camiseta')
    expect(text).toContain('&') // entidade decodificada
    expect(text).not.toContain('menu')
    expect(text).not.toContain('var x=1')
    expect(text).not.toContain('rodape')
  })

  it('html vazio → texto vazio', () => {
    expect(stripHtmlToText('').text).toBe('')
  })
})

describe('extractSitemapUrls', () => {
  it('parseia <urlset> e devolve locs', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/p1</loc></url>
      <url><loc>https://a.com/p2</loc></url></urlset>`
    expect(extractSitemapUrls(xml)).toEqual(['https://a.com/p1', 'https://a.com/p2'])
  })

  it('parseia <sitemapindex> devolvendo locs dos sitemaps filhos', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://a.com/sitemap_products.xml</loc></sitemap></sitemapindex>`
    expect(extractSitemapUrls(xml)).toEqual(['https://a.com/sitemap_products.xml'])
  })

  it('xml inválido → []', () => {
    expect(extractSitemapUrls('not xml at all')).toEqual([])
  })
})

describe('extractInternalLinks', () => {
  it('resolve relativos, filtra outros domínios, dedup e remove fragments', () => {
    const html = `<a href="/sobre">s</a><a href="/sobre#x">s2</a>
      <a href="https://www.loja.com/faq">f</a>
      <a href="https://outra.com/x">fora</a>
      <a href="mailto:a@b.c">m</a><a href="/img/foto.jpg">img</a>`
    const links = extractInternalLinks(html, 'https://www.loja.com/')
    expect(links).toEqual(['https://www.loja.com/sobre', 'https://www.loja.com/faq'])
  })
})

describe('MIN_USEFUL_CHARS', () => {
  it('limiar de SPA é 200', () => {
    expect(MIN_USEFUL_CHARS).toBe(200)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/crawler.test.ts`
Expected: FAIL — `Cannot find module '../crawler'` (ou equivalente).

- [ ] **Step 3: Implementar as funções puras**

```ts
// src/lib/ai/crawler.ts
// =============================================
// Crawler de sites para Knowledge Base (Frente A)
//
// DECISÃO DE PRODUTO (travada): SEM headless browser. Rodamos em serverless
// (maxDuration 60s); Playwright/Chromium custa >50MB de binário, cold start e
// dinheiro. Sites que exigem JavaScript (SPA) NÃO são suportados: detectamos
// honestamente (texto útil < MIN_USEFUL_CHARS) e falhamos com mensagem
// acionável — NUNCA marcamos a fonte como pronta com base vazia.
//
// Funções puras (testáveis sem rede): stripHtmlToText, extractSitemapUrls,
// extractInternalLinks. Orquestração com fetch: crawlSite.
// =============================================

export const MIN_USEFUL_CHARS = 200
export const MAX_SITEMAP_PAGES = 20
export const MAX_LINK_PAGES = 8
export const MAX_TOTAL_TEXT_CHARS = 300_000
export const PAGE_TIMEOUT_MS = 8_000
export const TOTAL_BUDGET_MS = 40_000
export const CRAWLER_USER_AGENT = 'WorderBot/1.0 (+https://worder.com; crawler para base de conhecimento)'

export const SPA_ERROR_MESSAGE =
  'Não foi possível extrair conteúdo desta URL: o site requer JavaScript para renderizar (SPA). ' +
  'Use o upload de arquivo ou a integração de produtos para alimentar a base de conhecimento.'

/** Remove script/style/nav/header/footer, tags e decodifica entidades comuns. */
export function stripHtmlToText(html: string): { title: string; text: string } {
  if (!html) return { title: '', text: '' }
  let work = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')

  const titleMatch = work.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  let text = work.replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text).replace(/\s+/g, ' ').trim()
  return { title, text }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&atilde;/g, 'ã')
    .replace(/&otilde;/g, 'õ').replace(/&ccedil;/g, 'ç')
    .replace(/&#\d+;/g, ' ')
}

/** Extrai <loc> de urlset OU sitemapindex. XML inválido/sem locs → []. */
export function extractSitemapUrls(xml: string): string[] {
  if (!xml || (!xml.includes('<urlset') && !xml.includes('<sitemapindex'))) return []
  const locs = [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1].trim())
  return locs.filter((u) => /^https?:\/\//i.test(u))
}

const SKIP_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|ico|mp4|woff2?)(\?|$)/i

/** Links internos (mesmo hostname) absolutos, sem fragment, dedupados. */
export function extractInternalLinks(html: string, pageUrl: string): string[] {
  let base: URL
  try { base = new URL(pageUrl) } catch { return [] }
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].trim()
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue
    let u: URL
    try { u = new URL(raw, base) } catch { continue }
    if (u.hostname !== base.hostname) continue
    if (SKIP_EXTENSIONS.test(u.pathname)) continue
    u.hash = ''
    const normalized = u.toString()
    if (normalized === base.toString() || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/crawler.test.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/crawler.ts src/lib/ai/__tests__/crawler.test.ts
git commit -m "feat(ai): funcoes puras do crawler de knowledge base (sitemap, links, strip html)"
```

### Task 2: Orquestrador `crawlSite` (com fetch mockado em teste)

**Files:**
- Modify: `src/lib/ai/crawler.ts`
- Test: `src/lib/ai/__tests__/crawler.test.ts` (append)

- [ ] **Step 1: Testes falhando para `crawlSite`** (append no mesmo arquivo)

```ts
import { vi, beforeEach, afterEach } from 'vitest'
import { crawlSite, SPA_ERROR_MESSAGE } from '../crawler'

function htmlPage(body: string, title = 'T') {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`
}
const LONG = 'Produto excelente para o dia a dia com tecido confortável. '.repeat(10)

describe('crawlSite', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  function respond(map: Record<string, { status?: number; body: string }>) {
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input)
      const hit = map[url]
      if (!hit) return new Response('not found', { status: 404 })
      return new Response(hit.body, { status: hit.status ?? 200 })
    })
  }

  it('usa sitemap.xml quando existe e concatena texto das páginas (mesmo domínio)', async () => {
    respond({
      'https://loja.com/': { body: htmlPage(LONG) },
      'https://loja.com/sitemap.xml': {
        body: `<urlset><url><loc>https://loja.com/p1</loc></url>
               <url><loc>https://outra.com/x</loc></url></urlset>`,
      },
      'https://loja.com/p1': { body: htmlPage('Página 1 com detalhes. ' + LONG) },
    })
    const text = await crawlSite('https://loja.com/')
    expect(text).toContain('Página 1')
    // página de outro domínio não foi buscada
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain('https://outra.com/x')
  })

  it('sem sitemap → segue links internos da página inicial (cap)', async () => {
    respond({
      'https://loja.com/': { body: htmlPage(`<a href="/sobre">s</a>${LONG}`) },
      'https://loja.com/sitemap.xml': { status: 404, body: '' },
      'https://loja.com/sobre': { body: htmlPage('Sobre a loja. ' + LONG) },
    })
    const text = await crawlSite('https://loja.com/')
    expect(text).toContain('Sobre a loja')
  })

  it('SPA (texto útil < limiar) → lança SPA_ERROR_MESSAGE, nunca sucesso vazio', async () => {
    respond({
      'https://spa.com/': { body: '<html><body><div id="root"></div></body></html>' },
      'https://spa.com/sitemap.xml': { status: 404, body: '' },
    })
    await expect(crawlSite('https://spa.com/')).rejects.toThrow(SPA_ERROR_MESSAGE)
  })

  it('página inicial com erro HTTP → lança erro com status', async () => {
    respond({ 'https://down.com/': { status: 500, body: 'x' } })
    await expect(crawlSite('https://down.com/')).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/crawler.test.ts`
Expected: FAIL — `crawlSite is not a function`.

- [ ] **Step 3: Implementar `crawlSite`** (append em `crawler.ts`)

```ts
interface CrawlPageResult { url: string; title: string; text: string }

async function fetchPage(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': CRAWLER_USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

/** Busca o sitemap do domínio. sitemapindex: desce UM nível (primeiro filho). */
async function discoverSitemapUrls(origin: string): Promise<string[]> {
  try {
    const xml = await fetchPage(`${origin}/sitemap.xml`, 5_000)
    let urls = extractSitemapUrls(xml)
    if (urls.length > 0 && xml.includes('<sitemapindex')) {
      // urls são sitemaps filhos — busca o primeiro e usa as páginas dele
      const childXml = await fetchPage(urls[0], 5_000)
      urls = extractSitemapUrls(childXml)
    }
    return urls
  } catch {
    return []
  }
}

/**
 * Crawl multi-página: página inicial + (sitemap até MAX_SITEMAP_PAGES | links
 * internos até MAX_LINK_PAGES). Caps: PAGE_TIMEOUT_MS por página,
 * TOTAL_BUDGET_MS global, MAX_TOTAL_TEXT_CHARS de texto. Texto útil total
 * < MIN_USEFUL_CHARS → SPA_ERROR_MESSAGE (erro, nunca sucesso vazio).
 */
export async function crawlSite(rawUrl: string): Promise<string> {
  const start = Date.now()
  const rootUrl = new URL(rawUrl)
  const origin = rootUrl.origin

  let rootHtml: string
  try {
    rootHtml = await fetchPage(rootUrl.toString(), PAGE_TIMEOUT_MS)
  } catch (e: any) {
    throw new Error(`Erro ao acessar URL: ${e.message}`)
  }
  const rootPage = stripHtmlToText(rootHtml)
  const pages: CrawlPageResult[] = [{ url: rootUrl.toString(), ...rootPage }]

  // candidatas: sitemap → fallback links internos
  const sitemapUrls = await discoverSitemapUrls(origin)
  const sameHost = (u: string) => { try { return new URL(u).hostname === rootUrl.hostname } catch { return false } }
  const candidates =
    sitemapUrls.length > 0
      ? sitemapUrls.filter(sameHost).filter((u) => u !== rootUrl.toString()).slice(0, MAX_SITEMAP_PAGES)
      : extractInternalLinks(rootHtml, rootUrl.toString()).slice(0, MAX_LINK_PAGES)

  let totalChars = rootPage.text.length
  for (const url of candidates) {
    if (Date.now() - start > TOTAL_BUDGET_MS) break
    if (totalChars >= MAX_TOTAL_TEXT_CHARS) break
    try {
      const html = await fetchPage(url, PAGE_TIMEOUT_MS)
      const page = stripHtmlToText(html)
      if (page.text.length === 0) continue
      pages.push({ url, ...page })
      totalChars += page.text.length
    } catch {
      // página individual falhou: segue o crawl (best-effort)
    }
  }

  const combined = pages
    .map((p) => [p.title, p.text].filter(Boolean).join('\n\n'))
    .join('\n\n')
    .slice(0, MAX_TOTAL_TEXT_CHARS)

  if (combined.replace(/\s+/g, ' ').trim().length < MIN_USEFUL_CHARS) {
    throw new Error(SPA_ERROR_MESSAGE)
  }
  return combined
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/crawler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/crawler.ts src/lib/ai/__tests__/crawler.test.ts
git commit -m "feat(ai): crawlSite multi-pagina com sitemap, caps e deteccao honesta de SPA"
```

### Task 3: Plugar o crawler no route de processamento

**Files:**
- Modify: `src/app/api/ai/process/document/route.ts` (linhas 65-67 e 239-295)

- [ ] **Step 1: Substituir `crawlUrl` por `crawlSite`**

No topo do arquivo, adicionar import:

```ts
import { crawlSite } from '@/lib/ai/crawler'
```

Na linha 67, trocar `text = await crawlUrl(source.url)` por:

```ts
      text = await crawlSite(source.url)
```

**Deletar** toda a seção `CRAWL DE URL (Simplificado)` (linhas 239-295, função `crawlUrl`). O `catch` existente do route (linhas 157-173) já grava `status:'error'` + `error_message` na fonte — a mensagem de SPA chega lá sem mudança adicional.

ATENÇÃO de coordenação: o plano `2026-06-10-ai-rag-robustness.md` também modifica este arquivo (Tasks 4 e 7 de lá). Se aquele plano já tiver sido executado, as linhas terão mudado — localizar a chamada `crawlUrl(source.url)` pelo conteúdo, não pelo número da linha.

- [ ] **Step 2: Verificar typecheck e suíte**

Run: `npx tsc --noEmit && npx vitest run src/lib/ai/__tests__/`
Expected: sem erros de tipo; testes PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/process/document/route.ts
git commit -m "feat(ai): process/document usa crawlSite; remove crawlUrl single-page"
```

---

## Frente B — Templates de nicho: persistir defaultActions (gap real)

### Task 4: Adaptador puro `TemplateAction → ai_agent_actions`

**Files:**
- Create: `src/lib/ai/templates/action-adapter.ts`
- Test: `src/lib/ai/__tests__/action-adapter.test.ts`

- [ ] **Step 1: Teste falhando (mapeamento campo a campo do drift)**

```ts
// src/lib/ai/__tests__/action-adapter.test.ts
import { describe, it, expect } from 'vitest'
import { templateActionToAgentActionPayload } from '../templates/action-adapter'
import type { TemplateAction } from '../templates/types'

const base: TemplateAction = {
  id: 'a1', name: 'Transferir', description: 'desc',
  conditions: [{ type: 'intent', value: 'human' }],
  actions: [{ type: 'transfer', value: 'queue' }],
  matchType: 'any', enabled: true,
}

describe('templateActionToAgentActionPayload', () => {
  it('intent → {type, intent}; transfer → {type, transfer_to}', () => {
    const p = templateActionToAgentActionPayload(base)
    expect(p.conditions).toEqual({ match_type: 'any', items: [{ type: 'intent', intent: 'human' }] })
    expect(p.actions).toEqual([{ type: 'transfer', transfer_to: 'queue' }])
    expect(p.name).toBe('Transferir')
    expect(p.is_active).toBe(true)
  })

  it('contains vira keywords[] (split por vírgula); sentiment, exact_message, ask_for, dont_mention, use_source', () => {
    const p = templateActionToAgentActionPayload({
      ...base,
      conditions: [
        { type: 'contains', value: 'tamanho,medida, veste' },
        { type: 'sentiment', value: 'frustrated' },
      ],
      actions: [
        { type: 'exact_message', value: 'Calma!' },
        { type: 'ask_for', value: 'height_weight' },
        { type: 'dont_mention', value: 'concorrente' },
        { type: 'use_source', value: 'src-1' },
      ],
      matchType: 'all',
    })
    expect(p.conditions).toEqual({
      match_type: 'all',
      items: [
        { type: 'contains', keywords: ['tamanho', 'medida', 'veste'] },
        { type: 'sentiment', sentiment: 'frustrated' },
      ],
    })
    expect(p.actions).toEqual([
      { type: 'exact_message', message: 'Calma!' },
      { type: 'ask_for', ask_field: 'height_weight' },
      { type: 'dont_mention', topic: 'concorrente' },
      { type: 'use_source', source_id: 'src-1' },
    ])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/action-adapter.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o adaptador**

```ts
// src/lib/ai/templates/action-adapter.ts
// =============================================
// Adaptador: TemplateAction (templates de nicho) → payload aceito por
// POST /api/ai/agents/[id]/actions (shape do actions-engine).
//
// DRIFT documentado: templates usam {type, value} genérico; o engine espera
// campos nomeados por tipo (intent/sentiment/keywords | transfer_to/message/
// ask_field/topic/source_id). Função PURA — testada em unidade.
// =============================================
import type { TemplateAction } from './types'

export interface AgentActionPayload {
  name: string
  description: string | null
  is_active: boolean
  priority: number
  conditions: { match_type: 'all' | 'any'; items: Record<string, unknown>[] }
  actions: Record<string, unknown>[]
}

export function templateActionToAgentActionPayload(t: TemplateAction): AgentActionPayload {
  const items = t.conditions.map((c) => {
    switch (c.type) {
      case 'intent': return { type: 'intent', intent: c.value }
      case 'sentiment': return { type: 'sentiment', sentiment: c.value }
      case 'contains':
        return { type: 'contains', keywords: c.value.split(',').map((k) => k.trim()).filter(Boolean) }
      case 'time': return { type: 'time', time_range: c.value }
      default: return { type: c.type, value: c.value }
    }
  })

  const actions = t.actions.map((a) => {
    switch (a.type) {
      case 'transfer': return { type: 'transfer', transfer_to: a.value }
      case 'exact_message': return { type: 'exact_message', message: a.value }
      case 'ask_for': return { type: 'ask_for', ask_field: a.value }
      case 'dont_mention': return { type: 'dont_mention', topic: a.value }
      case 'use_source': return { type: 'use_source', source_id: a.value }
      default: return { type: a.type, value: a.value }
    }
  })

  return {
    name: t.name,
    description: t.description || null,
    is_active: t.enabled,
    priority: 0,
    conditions: { match_type: t.matchType, items },
    actions,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/action-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/templates/action-adapter.ts src/lib/ai/__tests__/action-adapter.test.ts
git commit -m "feat(ai): adaptador TemplateAction -> payload de ai_agent_actions (corrige drift de shape)"
```

### Task 5: Seeding de ações + defaultGuidelines no wizard (minimamente invasivo)

**Files:**
- Modify: `src/components/agents/create/CreateAgentFlow.tsx` (função `handleCreateAgent` ~linha 379; payloads de persona linhas 335, 403, 459)

- [ ] **Step 1: Adicionar helper de seeding best-effort**

Import no topo (junto aos imports de `@/lib/ai/templates`):

```ts
import { templateActionToAgentActionPayload } from '@/lib/ai/templates/action-adapter';
```

Dentro do componente, após `handleCreateAgent` ser definido, adicionar (e um state-guard):

```ts
  const [actionsSeeded, setActionsSeeded] = useState(false);

  // Best-effort: persiste as ações pré-configuradas do template no agente.
  // Falhas NÃO bloqueiam a criação (o agente já existe e funciona sem ações).
  const seedTemplateActions = async (agentId: string) => {
    if (actionsSeeded || !selectedTemplate) return;
    const enabled = (selectedTemplate.defaultActions || []).filter((a) => a.enabled);
    if (enabled.length === 0) return;
    setActionsSeeded(true);
    for (const ta of enabled) {
      try {
        await fetch(`/api/ai/agents/${agentId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: organizationId,
            ...templateActionToAgentActionPayload(ta),
          }),
        });
      } catch (err) {
        console.error('Error seeding template action:', err);
      }
    }
  };
```

NOTA de coordenação com o P1 v2: se o P1 v2 já tiver sido executado, a rota de actions deriva a org do token e ignora `organization_id` do body — o envio acima continua compatível (no-op aceito).

- [ ] **Step 2: Chamar o seeding nos dois ramos de sucesso de `handleCreateAgent`**

Após `setCreatedAgentId(draftAgentId)` (ramo update do draft):

```ts
        await seedTemplateActions(draftAgentId);
```

Após `setCreatedAgentId(data.agent.id)` (ramo create novo):

```ts
        await seedTemplateActions(data.agent.id);
```

- [ ] **Step 3: Incluir `defaultGuidelines` do template na persona**

Nos 3 payloads (linhas ~335, ~403, ~459), trocar `guidelines: agentFunction.mainTasks,` por:

```ts
              guidelines: [
                ...(selectedTemplate?.defaultGuidelines || []),
                ...agentFunction.mainTasks,
              ],
```

- [ ] **Step 4: Verificar typecheck + criação intacta**

Run: `npx tsc --noEmit`
Expected: sem erros. Verificação manual (ou em QA): criar agente sem mexer em nada extra — o fluxo é idêntico ao atual (template já era o Step 1; seeding é pós-sucesso e silencioso). Limite de 20 ações é tratado pela API (best-effort ignora 400).

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/create/CreateAgentFlow.tsx
git commit -m "feat(agents): wizard persiste defaultActions e defaultGuidelines do template de nicho"
```

---

## Frente C — CSAT real nos relatórios

### Task 6: Função pura `resolveCsat` em reports-metrics

**Files:**
- Modify: `src/lib/ai/reports-metrics.ts`
- Test: `src/lib/ai/__tests__/reports-metrics.test.ts` (append)

- [ ] **Step 1: Testes falhando** (append no test file existente; adicionar `resolveCsat, MIN_REAL_CSAT_SAMPLE` ao import de `../reports-metrics`)

```ts
describe('resolveCsat', () => {
  it('>= MIN_REAL_CSAT_SAMPLE respostas reais → source real, média 1 decimal, distribuição das reais', () => {
    const r = resolveCsat([5, 5, 4, 4, 3], [scoreToStars(10)])
    expect(r.csat).toEqual({ value: 4.2, source: 'real', sampleSize: 5 })
    expect(r.starsForDistribution).toEqual([5, 5, 4, 4, 3])
  })

  it('abaixo do limiar → proxy estimado (média das estrelas do juiz)', () => {
    const r = resolveCsat([5], [4.0, 3.0])
    expect(r.csat).toEqual({ value: 3.5, source: 'estimated', sampleSize: 2 })
    expect(r.starsForDistribution).toEqual([4.0, 3.0])
  })

  it('sem nada → estimated com value 0 e sampleSize 0', () => {
    expect(resolveCsat([], []).csat).toEqual({ value: 0, source: 'estimated', sampleSize: 0 })
  })

  it('ignora ratings fora de 1..5', () => {
    const r = resolveCsat([5, 4, 0, 9, 5, 4, 3], [])
    expect(r.csat.sampleSize).toBe(5)
    expect(r.csat.source).toBe('real')
  })

  it('limiar é 5', () => expect(MIN_REAL_CSAT_SAMPLE).toBe(5))
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/reports-metrics.test.ts`
Expected: FAIL — `resolveCsat` não exportado.

- [ ] **Step 3: Implementar em `reports-metrics.ts`** (append; atualizar o comentário de header do arquivo: a decisão "NÃO existe captura real" deixa de ser absoluta — agora há fallback discriminado)

```ts
/** Limiar mínimo de respostas reais para exibir CSAT real (senão, proxy IA). */
export const MIN_REAL_CSAT_SAMPLE = 5

export interface CsatSummary {
  value: number
  /** 'real' = média de whatsapp_csat_ratings; 'estimated' = proxy via juiz LLM */
  source: 'real' | 'estimated'
  /** real: nº de respostas de clientes; estimated: nº de notas de juiz usadas */
  sampleSize: number
}

/**
 * Decide entre CSAT REAL (ratings 1–5 coletados de clientes) e o PROXY
 * estimado (estrelas derivadas das notas do juiz). Real só com amostra
 * >= MIN_REAL_CSAT_SAMPLE. Devolve também a lista de estrelas que deve
 * alimentar o histograma (coerente com a fonte escolhida).
 */
export function resolveCsat(
  realRatings: number[],
  proxyStars: number[]
): { csat: CsatSummary; starsForDistribution: number[] } {
  const valid = realRatings.filter(
    (r) => typeof r === 'number' && Number.isFinite(r) && r >= 1 && r <= 5
  )
  if (valid.length >= MIN_REAL_CSAT_SAMPLE) {
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length
    return {
      csat: { value: Math.round(avg * 10) / 10, source: 'real', sampleSize: valid.length },
      starsForDistribution: valid,
    }
  }
  const value =
    proxyStars.length > 0
      ? Math.round((proxyStars.reduce((a, b) => a + b, 0) / proxyStars.length) * 10) / 10
      : 0
  return {
    csat: { value, source: 'estimated', sampleSize: proxyStars.length },
    starsForDistribution: proxyStars,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/reports-metrics.test.ts`
Expected: PASS (novos + antigos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/reports-metrics.ts src/lib/ai/__tests__/reports-metrics.test.ts
git commit -m "feat(ai): resolveCsat — CSAT real vs proxy estimado com limiar de amostra"
```

### Task 7: `getReportSummary` busca CSAT real (proposals.ts)

**Files:**
- Modify: `src/lib/ai/proposals.ts` (tipo `ReportSummary` ~linha 39; `getReportSummary` linhas 94-170)

- [ ] **Step 1: Verificar consumidores do shape antes de mudar**

Run: `grep -rn "summary.csat\|\.csat" src --include="*.ts" --include="*.tsx"`
Expected: ocorrências apenas em `proposals.ts`, `reports-metrics`(novo) e `ReportsView.tsx`. Se aparecer outro consumidor (ex. prompt de `generateProposals` interpolando `summary.csat`), incluir na atualização.

- [ ] **Step 2: Atualizar tipo e agregação**

Em `ReportSummary`, trocar `csat: number` por:

```ts
import { resolveCsat, type CsatSummary } from './reports-metrics'  // somar ao import existente

export interface ReportSummary {
  quality: number
  /** CSAT real (whatsapp_csat_ratings) quando amostra suficiente; senão proxy IA */
  csat: CsatSummary
  conversations: number
  resolutionRate: number
}
```

Em `getReportSummary`: (a) no select de `whatsapp_cloud_conversations` (linha ~142) adicionar `id`: `.select('id, ai_disabled_reason, created_at')`; (b) após o bloco de conversas, adicionar:

```ts
  // --- CSAT real (whatsapp_csat_ratings) das conversas deste agente ---
  // Vínculo honesto: conversation_id ∈ conversas com ai_agent_id = agente
  // (cloud + legado). NUNCA via csat.agent_id — lá é o ATENDENTE HUMANO.
  const { data: legacyConvRows } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('ai_agent_id', agentId)
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
    .limit(2000)
  const agentConvIds = new Set<string>([
    ...convs.map((c: any) => c.id),
    ...(legacyConvRows ?? []).map((c) => c.id),
  ])

  const { data: csatRows } = await supabase
    .from('whatsapp_csat_ratings')
    .select('conversation_id, rating, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', sinceISO)
    .limit(2000)
  const realRatings = (csatRows ?? [])
    .filter((r) => agentConvIds.has(r.conversation_id))
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === 'number')
```

(c) substituir o bloco final de csat/distribution (linhas ~158-164) por:

```ts
  // --- CSAT: real quando amostra >= limiar; senão proxy estimado (juiz) ---
  const proxyStars = allScores.map((s) => scoreToStars(s))
  const { csat, starsForDistribution } = resolveCsat(realRatings, proxyStars)
  const distribution = buildDistribution(starsForDistribution)
```

e manter `summary: { quality, csat, conversations, resolutionRate }`.

- [ ] **Step 3: Typecheck + suíte**

Run: `npx tsc --noEmit && npx vitest run src/lib/ai/__tests__/`
Expected: o typecheck VAI ACUSAR `ReportsView.tsx` se ele tipar `csat` como number localmente — confirma o contrato; corrigido no Task 8. Testes de lib PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/proposals.ts
git commit -m "feat(ai): getReportSummary agrega CSAT real de whatsapp_csat_ratings com fallback estimado"
```

### Task 8: Badge real/estimado na UI (ReportsView)

**Files:**
- Modify: `src/components/agents/reports/ReportsView.tsx` (interface `Summary` linha 38; card de satisfação linhas 248-291)

- [ ] **Step 1: Atualizar a interface local**

```ts
interface Summary {
  quality: number
  csat: { value: number; source: 'real' | 'estimated'; sampleSize: number }
  conversations: number
  resolutionRate: number
}
```

- [ ] **Step 2: Atualizar o card de satisfação (linhas ~248-291)**

Título e badge dinâmicos; substituir o header e o parágrafo do card, e os usos de `s.csat`:

```tsx
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="stat-ico" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>
                      <ThumbsUp style={{ width: 16, height: 16 }} />
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                      Satisfação (CSAT)
                    </span>
                    {s.csat.source === 'real' ? (
                      <span className="chip chip-green" style={{ marginLeft: 'auto' }}>
                        CSAT real · {s.csat.sampleSize} resposta{s.csat.sampleSize === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="chip" style={{ marginLeft: 'auto' }}>
                        Estimado por IA
                      </span>
                    )}
                  </div>
```

Trocar `s.csat.toFixed(1)` por `s.csat.value.toFixed(1)` (card e tile da linha 290), `RatingBar value={s.csat}` por `value={s.csat.value}`, e o parágrafo explicativo por:

```tsx
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.4 }}>
                    {s.csat.source === 'real'
                      ? `Média de ${s.csat.sampleSize} avaliações coletadas dos clientes no período.`
                      : 'Estimativa do modelo a partir das notas de avaliação — não é um CSAT coletado do cliente.'}
                  </p>
```

No tile (linha ~290), label dinâmico: `label={s.csat.source === 'real' ? 'CSAT real' : 'Satisfação estimada'}` e `value={s.csat.value.toFixed(1)}`.

- [ ] **Step 3: Typecheck + suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, sem erros de tipo (contrato fechado ponta a ponta).

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/reports/ReportsView.tsx
git commit -m "feat(reports): badge CSAT real (N respostas) vs estimado por IA no ReportsView"
```

---

## Verificação final (após as 3 frentes)

- [ ] `npx vitest run` — suíte inteira verde.
- [ ] `npx tsc --noEmit` — sem erros.
- [ ] Smoke manual: (1) adicionar fonte URL de site estático → `ready` com mais chunks; fonte URL de SPA → `error` com mensagem de JavaScript; (2) criar agente pelo wizard com template pet-shop → conferir em `ai_agent_actions` as ações seedadas; (3) abrir Relatórios → tile mostra "Estimado por IA" (sem dados reais) e, com ≥5 linhas em `whatsapp_csat_ratings` vinculadas, "CSAT real · N respostas".

---

### Critical Files for Implementation

- `D:\worder1-fwrle\src\app\api\ai\process\document\route.ts` (crawl atual a substituir; catch já trata erro de fonte)
- `D:\worder1-fwrle\src\components\agents\create\CreateAgentFlow.tsx` (wizard vivo; ponto do seeding de ações e guidelines)
- `D:\worder1-fwrle\src\lib\ai\proposals.ts` (getReportSummary + tipo ReportSummary)
- `D:\worder1-fwrle\src\lib\ai\reports-metrics.ts` (funções puras; recebe resolveCsat)
- `D:\worder1-fwrle\src\components\agents\reports\ReportsView.tsx` (consumidor único do shape de /reports)
