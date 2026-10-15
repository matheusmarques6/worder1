// Conhecimento da loja — regras puras da API (plano IA M3 passo 21):
// árvore por pasta, links entre notas, uso por nota, nota sugerida para uma
// lacuna e as edições de texto que a resolução de lacunas faz. Sem banco:
// as rotas leem, isto decide.

/** As ações da tela Lacunas (POST /api/ai/knowledge/gaps/[id]/resolve). */
export const GAP_ACTIONS = ['create_source', 'append_to', 'add_limit', 'ignore'] as const
export type GapAction = (typeof GAP_ACTIONS)[number]

export interface NoteRow {
  id: string
  name: string
  folder: string | null
  kind: string
  status: string | null
  read_only?: boolean | null
  tags?: string[] | null
  links?: string[] | null
  updated_at?: string | null
}

export interface FolderNode {
  folder: string
  notes: Array<NoteRow & { readers: string[] }>
}

/** Pastas em ordem alfabética ('geral' primeiro); notas por nome. */
export function buildTree(notes: NoteRow[], readers: Map<string, string[]>): FolderNode[] {
  const byFolder = new Map<string, Array<NoteRow & { readers: string[] }>>()
  for (const note of notes) {
    const folder = (note.folder || 'geral').trim() || 'geral'
    const list = byFolder.get(folder) ?? []
    list.push({ ...note, readers: readers.get(note.id) ?? [] })
    byFolder.set(folder, list)
  }
  return [...byFolder.entries()]
    .sort(([a], [b]) => (a === 'geral' ? -1 : b === 'geral' ? 1 : a.localeCompare(b, 'pt-BR')))
    .map(([folder, list]) => ({
      folder,
      notes: list.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
    }))
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Renomear uma nota reescreve [[Antigo]] e [[Antigo|rótulo]] nas outras. */
export function renameLinks(body: string, oldTitle: string, newTitle: string): string {
  const pattern = new RegExp(`\\[\\[\\s*${escapeRegExp(oldTitle)}\\s*(\\|[^\\]]*)?\\]\\]`, 'gi')
  return body.replace(pattern, (_m, label?: string) => `[[${newTitle}${label ?? ''}]]`)
}

/** Acrescenta uma resposta pronta ao fim da nota (resolver lacuna). */
export function appendAnswer(body: string | null | undefined, question: string, answer: string): string {
  const quoted = answer.trim().replace(/\r?\n/g, '\n> ')
  const block = `## ${question.trim()}\n\n> [!resposta]\n> ${quoted}`
  const base = (body ?? '').trimEnd()
  return base ? `${base}\n\n${block}\n` : `${block}\n`
}

/** Nota nova a partir de uma lacuna: título = pergunta, corpo = resposta. */
export function noteFromGap(question: string, answer: string): string {
  return appendAnswer(`# ${question.trim()}`, question, answer)
}

/** Notas que apontam para esta (backlinks), por título. */
export function backlinks(
  target: string,
  notes: Array<{ id: string; name: string; links?: string[] | null; body_markdown?: string | null }>,
): Array<{ id: string; name: string; before?: string; after?: string }> {
  const t = target.trim().toLowerCase()
  return notes
    .filter((n) => (n.links ?? []).some((l) => l.trim().toLowerCase() === t))
    .map((n) => {
      // O trecho em volta da menção, para "Links para cá" (…antes [[alvo]] depois…).
      const body = (n.body_markdown ?? '').replace(/\*\*/g, '')
      const at = body.toLowerCase().indexOf(`[[${t}`)
      if (at < 0) return { id: n.id, name: n.name }
      const end = body.indexOf(']]', at)
      const clean = (s: string) => s.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ')
      return {
        id: n.id, name: n.name,
        before: clean(body.slice(Math.max(0, at - 50), at)),
        after: clean(body.slice(end < 0 ? at : end + 2, (end < 0 ? at : end + 2) + 30)),
      }
    })
}

/**
 * Uso de uma nota nos últimos dias, a partir das chamadas `search_knowledge`
 * registradas (output.chunks[].source_id). `days` contagens, a mais antiga
 * primeiro, para o sparkline.
 */
export function usageByDay(
  calls: Array<{ created_at: string; output: any; conversation_id?: string | null }>,
  sourceId: string,
  now: Date,
  days = 7,
): { series: number[]; total: number; conversations: string[] } {
  const series = Array.from({ length: days }, () => 0)
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const conversations = new Set<string>()
  let total = 0
  for (const call of calls) {
    const chunks: any[] = Array.isArray(call.output?.chunks) ? call.output.chunks : []
    if (!chunks.some((c) => c?.source_id === sourceId)) continue
    const at = new Date(call.created_at)
    const index = Math.floor((at.getTime() - start.getTime()) / 86_400_000)
    if (index < 0 || index >= days) continue
    series[index] += 1
    total += 1
    if (call.conversation_id) conversations.add(call.conversation_id)
  }
  return { series, total, conversations: [...conversations] }
}

/** Quantas buscas da janela trouxeram cada fonte (bolinha do grafo, "Uso"). */
export function usesBySource(calls: Array<{ output: any }>): Map<string, number> {
  const out = new Map<string, number>()
  for (const call of calls) {
    const chunks: any[] = Array.isArray(call.output?.chunks) ? call.output.chunks : []
    for (const id of new Set(chunks.map((c) => c?.source_id).filter(Boolean))) {
      out.set(id, (out.get(id) ?? 0) + 1)
    }
  }
  return out
}

const GAP_STOP = new Set([
  'para', 'como', 'qual', 'quais', 'quanto', 'quantos', 'voces', 'vocês', 'posso', 'pode', 'tenho', 'esse', 'essa',
  'isso', 'sobre', 'ainda', 'mais', 'quero', 'minha', 'meu', 'tem', 'com', 'uma', 'que', 'dos', 'das', 'pra', 'pro',
])
const gapWords = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w.length >= 3 && !GAP_STOP.has(w))
// "trocar" acha "troca", "entregue" acha "entrega": compara pelo começo.
const stem = (w: string) => (w.length > 5 ? w.slice(0, w.length - 2) : w)

/** A nota onde responder uma lacuna ("Responder em …"): a editável cujo
 *  título, tags ou texto mais falam do assunto da pergunta. Título pesa 3,
 *  tag 2, texto 1. Nenhuma palavra em comum = sem sugestão. */
export function suggestNoteForGap<T extends { id: string; name: string; tags?: string[] | null; body_markdown?: string | null; read_only?: boolean | null }>(
  question: string, notes: T[],
): T | null {
  const q = [...new Set(gapWords(question).map(stem))]
  if (q.length === 0) return null
  let best: { note: T; score: number } | null = null
  for (const note of notes) {
    if (note.read_only) continue
    const title = gapWords(note.name)
    const tags = (note.tags ?? []).flatMap(gapWords)
    const body = new Set(gapWords(note.body_markdown ?? ''))
    let score = 0
    for (const s of q) {
      if (title.some((w) => w.startsWith(s))) score += 3
      else if (tags.some((w) => w.startsWith(s))) score += 2
      else if ([...body].some((w) => w.startsWith(s))) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { note, score }
  }
  return best?.note ?? null
}
