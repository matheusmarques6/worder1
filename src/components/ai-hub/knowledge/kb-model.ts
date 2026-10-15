// Conhecimento no formato do protótipo (KB): cores das pastas, tipo e ícone
// de cada fonte, situação, datas e texto puro. Puro e testado; a tela só lê.

import { parseMd, type MdBlock } from '@/lib/ai/processors/markdown-processor'

export const KT = {
  green: ['#EAF7EF', '#15803D'], blue: ['#EEF3FE', '#2F62D8'], teal: ['#E7F6F5', '#0F8A84'],
  purple: ['#F2EEFD', '#7446D6'], sky: ['#E9F4FC', '#1A7FC4'], amber: ['#FEF4E6', '#C46A06'],
  red: ['#FDEEEE', '#D23B3B'], violet: ['#F5EEFE', '#9447DC'], pink: ['#FCEEF5', '#C0367A'],
  slate: ['#F1F3F5', '#4B5563'],
} as const
export type Tone = keyof typeof KT

/** Ordem das cores das pastas, a mesma do protótipo. */
const FOLDER_TONES: Tone[] = ['blue', 'sky', 'green', 'purple', 'pink', 'amber', 'teal', 'violet', 'red']

export interface KbNote {
  id: string
  name: string
  folder: string
  kind: string
  status: string | null
  read_only: boolean | null
  tags: string[] | null
  links: string[] | null
  updated_at: string | null
  readers: string[]
  uses_7d?: number
  error_message?: string | null
}

export interface KbFolder { id: string; label: string; tone: Tone; sync: boolean; notes: KbNote[] }

/** Pastas com cor fixa pela posição; uma pasta só de notas sincronizadas é
 *  cinza e não aceita "Nova nota" (o conteúdo vem da integração). */
export function kbFolders(tree: Array<{ folder: string; notes: KbNote[] }>): KbFolder[] {
  let k = 0
  return tree.map((f) => {
    const sync = f.notes.length > 0 && f.notes.every((n) => n.read_only)
    const tone: Tone = sync ? 'slate' : FOLDER_TONES[k++ % FOLDER_TONES.length]
    return { id: f.folder, label: folderLabel(f.folder), tone, sync, notes: f.notes }
  })
}

export function folderLabel(folder: string): string {
  const f = (folder || 'geral').trim()
  return f.charAt(0).toUpperCase() + f.slice(1)
}

export const KIND: Record<string, { label: string; icon: string }> = {
  note: { label: 'Nota', icon: 'file' },
  faq: { label: 'Perguntas e respostas', icon: 'file' },
  document: { label: 'Documento', icon: 'bookOpen' },
  catalog: { label: 'Catálogo', icon: 'database' },
  site_page: { label: 'Página do site', icon: 'globe' },
  url: { label: 'Página do site', icon: 'globe' },
}
export const kindOf = (kind: string) => KIND[kind] ?? { label: kind, icon: 'file' }

/** ok (pronta), proc (processando), sync (sincronizando) ou err. */
export function noteState(n: Pick<KbNote, 'status' | 'read_only'>): 'ok' | 'proc' | 'sync' | 'err' {
  if (n.status === 'error') return 'err'
  if (n.status === 'ready' || n.status === null) return 'ok'
  return n.read_only ? 'sync' : 'proc'
}

/** "22/09" como no protótipo; hoje vira "agora" se foi há menos de 1 min. */
export function shortDate(iso: string | null, now = new Date()): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (now.getTime() - d.getTime() < 60_000) return 'agora'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const plain = (s: string) => s.replace(/\*\*|\[\[|\]\]/g, '')

export function wordCount(markdown: string): number {
  // Marcadores de título, lista e destaque não contam como palavra.
  return plain(markdown).split(/\s+/).filter((w) => w && !/^(#+|[-*+>]|\d+[.)]|\[![a-zç]+\])$/i.test(w)).length
}

/** Títulos [[...]] citados no texto (sem o rótulo depois de |). */
export function outLinks(markdown: string): string[] {
  return [...new Set((markdown.match(/\[\[([^\]]+)\]\]/g) ?? []).map((m) => m.slice(2, -2).split('|')[0].trim()))]
}

/** "Sem título", "Sem título 2"… sem repetir um nome que já existe. */
export function freshTitle(base: string, taken: string[]): string {
  const set = new Set(taken.map((t) => t.trim().toLowerCase()))
  if (!set.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!set.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

/** Nome da nota criada a partir de uma lacuna (protótipo fromGap). */
export function titleFromQuestion(q: string): string {
  const t = q.trim().replace(/\?$/, '').replace(/^(vocês|o|a|os|as)\s/i, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const blockText = (b: MdBlock) => (b.type === 'list' ? b.items.join(' ') : b.text)
const flat = (s: string) => plain(s).replace(/^#+\s*|^>\s*|\[![a-zç]+\]/gim, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Índice do bloco da nota de onde veio um trecho da busca ("Ver trecho"). */
export function findBlock(markdown: string, content: string): number | null {
  const c = flat(content)
  if (!c) return null
  const blocks = parseMd(markdown)
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'heading') continue
    const t = flat(blockText(blocks[i]))
    if (t && (c.includes(t.slice(0, 40)) || t.includes(c.slice(0, 40)))) return i
  }
  return null
}

/** Títulos da nota para a Estrutura do painel Links. */
export function headings(markdown: string): Array<{ i: number; level: number; text: string }> {
  return parseMd(markdown).flatMap((b, i) => (b.type === 'heading' ? [{ i, level: b.level, text: plain(b.text) }] : []))
}
