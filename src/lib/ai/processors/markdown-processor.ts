// Parser de notas da loja (plano IA, M3 passo 19) — compatível com o
// protótipo: títulos (#), listas (-, *, 1.), callouts [!regra] / [!resposta]
// / [!atencao] (como linha própria ou em blockquote "> [!regra] Título") e
// links [[Título de outra nota]]. Módulo PURO: usado pelo processador de
// documentos (chunks tipados) e, no passo 22, pela leitura MdView.

import { chunkText, estimateTokens } from './text-processor'

export type CalloutKind = 'regra' | 'resposta' | 'atencao'
export const CALLOUT_KINDS: CalloutKind[] = ['regra', 'resposta', 'atencao']

export type MdBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'callout'; kind: CalloutKind; title: string | null; text: string }

const CALLOUT_LINE = /^>?\s*\[!(regra|resposta|atencao|atenção)\]\s*(.*)$/i
const HEADING = /^(#{1,6})\s+(.*)$/
const UL_ITEM = /^\s*[-*+]\s+(.*)$/
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/
const LINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

function normalizeKind(raw: string): CalloutKind {
  const k = raw.toLowerCase()
  return k === 'atenção' ? 'atencao' : (k as CalloutKind)
}

/** Títulos referenciados por [[Título]] (sem duplicatas, na ordem). */
export function extractLinks(markdown: string): string[] {
  const out: string[] = []
  for (const m of markdown.matchAll(LINK)) {
    const title = m[1].trim()
    if (title && !out.includes(title)) out.push(title)
  }
  return out
}

/** Texto limpo para o modelo: [[Título|rótulo]] → rótulo, [[Título]] → Título. */
export function stripLinkSyntax(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, title: string, label?: string) =>
    (label ?? title).trim(),
  )
}

export function parseMd(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0
  const flushParagraph = (buf: string[]) => {
    const text = buf.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
  }
  let para: string[] = []

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { flushParagraph(para); para = []; i++; continue }

    const h = HEADING.exec(trimmed)
    if (h) { flushParagraph(para); para = []; blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() }); i++; continue }

    const c = CALLOUT_LINE.exec(trimmed)
    if (c) {
      flushParagraph(para); para = []
      const kind = normalizeKind(c[1])
      const title = c[2].trim() || null
      const quoted = trimmed.startsWith('>')
      const body: string[] = []
      i++
      while (i < lines.length) {
        const next = lines[i]
        const nextTrim = next.trim()
        if (!nextTrim) break
        if (quoted) {
          if (!nextTrim.startsWith('>')) break
          body.push(nextTrim.replace(/^>\s?/, ''))
        } else {
          if (HEADING.test(nextTrim) || CALLOUT_LINE.test(nextTrim)) break
          body.push(nextTrim)
        }
        i++
      }
      blocks.push({ type: 'callout', kind, title, text: body.join(' ').trim() })
      continue
    }

    if (UL_ITEM.test(trimmed) || OL_ITEM.test(trimmed)) {
      flushParagraph(para); para = []
      const ordered = OL_ITEM.test(trimmed)
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = ordered ? OL_ITEM.exec(t) : UL_ITEM.exec(t)
        if (!m) break
        items.push(m[1].trim())
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    para.push(trimmed)
    i++
  }
  flushParagraph(para)
  return blocks
}

export interface MdChunk {
  content: string
  chunk_kind: 'text' | CalloutKind
  position: number
  tokens: number
  metadata: { heading: string | null; callout_title?: string | null; links: string[] }
}

/**
 * Cada callout vira um chunk próprio (com o título da seção como contexto);
 * o texto corrido é agrupado por seção e dividido pelo chunker comum.
 */
export function markdownToChunks(markdown: string, options?: { maxTokens?: number; overlap?: number }): MdChunk[] {
  const maxTokens = options?.maxTokens ?? 500
  const overlap = options?.overlap ?? 50
  const blocks = parseMd(markdown)
  const out: MdChunk[] = []
  let heading: string | null = null
  let section: string[] = []

  const flushSection = () => {
    const text = section.join('\n\n').trim()
    section = []
    if (!text) return
    const prefixed = heading ? `${heading}\n\n${text}` : text
    for (const piece of chunkText(stripLinkSyntax(prefixed), { maxTokens, overlap })) {
      out.push({
        content: piece.content,
        chunk_kind: 'text',
        position: out.length,
        tokens: piece.tokens,
        metadata: { heading, links: extractLinks(text) },
      })
    }
  }

  for (const block of blocks) {
    if (block.type === 'heading') { flushSection(); heading = block.text; continue }
    if (block.type === 'callout') {
      flushSection()
      const label = block.kind === 'regra' ? 'Regra' : block.kind === 'resposta' ? 'Resposta pronta' : 'Atenção'
      const head = [heading, block.title].filter(Boolean).join(' · ')
      const content = stripLinkSyntax(`${label}${head ? ` (${head})` : ''}: ${block.text}`)
      out.push({
        content,
        chunk_kind: block.kind,
        position: out.length,
        tokens: estimateTokens(content),
        metadata: { heading, callout_title: block.title, links: extractLinks(block.text) },
      })
      continue
    }
    if (block.type === 'list') { section.push(block.items.map((it) => `- ${it}`).join('\n')); continue }
    section.push(block.text)
  }
  flushSection()
  return out
}

/** As regras de uma nota, para o bloco de limites do prompt (passo 20). */
export function extractRules(markdown: string): string[] {
  return parseMd(markdown)
    .filter((b): b is Extract<MdBlock, { type: 'callout' }> => b.type === 'callout' && b.kind === 'regra')
    .map((b) => stripLinkSyntax(b.text))
}
