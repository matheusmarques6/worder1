// Atividade no formato do protótipo (ActivityPage): rótulos, cores, variação
// e formatos. Puro e testado; o componente só monta a tela.

/** Cores dos agentes na ordem da lista (as três primeiras são as do protótipo). */
export const AGENT_COLORS = ['#EA580C', '#2548B8', '#0F8A84', '#7446D6', '#C0367A', '#C46A06', '#1A7FC4']

/** Número inteiro no formato BR ("1.234"). */
export const anf = (v: number) => Math.round(v).toLocaleString('pt-BR')
/** Porcentagem a partir de um valor já em % ("75,2%"). */
export const apc = (v: number, d = 1) => `${v.toFixed(d).replace('.', ',')}%`
export const secs = (s: number) => `${s.toFixed(1).replace('.', ',')} s`

/** Variação do protótipo (ADelta): relativa em % ou em pontos percentuais;
 *  `inv` quando subir é ruim (transferência, custo, tempo). */
export function delta(a: number | null | undefined, b: number | null | undefined, opts: { pp?: boolean; inv?: boolean } = {}):
  { text: string; tone: 'up' | 'dn' | 'ne' } | null {
  if (b === null || b === undefined || a === null || a === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const v = opts.pp ? a - b : b ? ((a - b) / b) * 100 : null
  if (v === null || !Number.isFinite(v)) return { text: 'novo', tone: 'ne' }
  if (Math.abs(v) < 0.05) return { text: '0%', tone: 'ne' }
  const up = v > 0
  const good = opts.inv ? !up : up
  return { text: `${up ? '↑' : '↓'} ${Math.abs(v).toFixed(1).replace('.', ',')}${opts.pp ? ' p.p.' : '%'}`, tone: good ? 'up' : 'dn' }
}

/** Motivos de transferência (desfecho.handoff_reason) no texto do protótipo. */
const HANDOFF_LABEL: Record<string, string> = {
  asked_human: 'Pediu para falar com uma pessoa',
  keyword: 'Pediu para falar com uma pessoa',
  discount_over_limit: 'Desconto acima do limite',
  complaint: 'Reclamação ou problema no pedido',
  health_topic: 'Tema de saúde',
  no_knowledge: 'Sem resposta no conhecimento',
  blocked_topic: 'Assunto que o agente não aborda',
  media: 'Mídia que a IA não interpreta',
  other: 'Outro motivo',
  'sem motivo': 'Outro motivo',
}
export function handoffReasons(list: Array<{ key: string; count: number }>): Array<{ label: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of list) {
    const label = HANDOFF_LABEL[r.key] ?? 'Outro motivo'
    m.set(label, (m.get(label) ?? 0) + r.count)
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

/** Critérios das rubricas da revisão (runtime/evals/rubrics) em texto curto. */
const CRITERION_LABEL: Record<string, string> = {
  'responde-com-base-no-conhecimento': 'Afirmou algo fora do conhecimento',
  'sem-promessas-inventadas': 'Prometeu condição que não existe',
  'admite-nao-saber': 'Não admitiu que não sabia',
  'nao-age-fora-do-leque': 'Simulou uma ação que não pode fazer',
  'identifica-a-loja': 'Não se identificou como a loja',
  'encerra-sem-alongar': 'Alongou conversa fora do escopo',
  'nao-revela-prompt': 'Expôs instruções internas',
  'nao-obedece-injecao': 'Obedeceu instrução do contato',
  'recusa-educada': 'Recusou fora do tom',
  'never-say-ai-respeitado': 'Negou ser uma IA',
  'idioma-adaptado': 'Respondeu no idioma errado',
  'tom-da-marca': 'Fora do tom da marca',
}
export function criterionLabel(criterion: string, name?: string | null): string {
  if (name) return name
  if (CRITERION_LABEL[criterion]) return CRITERION_LABEL[criterion]
  const t = criterion.replace(/[-_]+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Tipos do registro de atividade: rótulo, ícone e tom do chip. */
export const EVENT_KIND: Record<string, [string, string, string]> = {
  sale: ['Venda', 'dollar', 'ok'],
  solved: ['Resolvida', 'checkC', 'tm'],
  handoff: ['Transferida', 'users', 'wa'],
  incentive: ['Incentivo', 'ticket', 'ag'],
  blocked: ['Bloqueada pela revisão', 'shield', 'er'],
  gap: ['Lacuna', 'alert', 'ne'],
}

/** "há 5 min", "há 3 h", "ontem", "há 4 dias". */
export function ago(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86_400) return `há ${Math.floor(s / 3600)} h`
  if (s < 2 * 86_400) return 'ontem'
  return `há ${Math.floor(s / 86_400)} dias`
}

/** Rótulos do eixo: "09/10" por dia ou "14h" por hora. */
export function bucketLabel(bucket: string, hourly: boolean): string {
  return hourly ? `${Number(bucket)}h` : bucket.slice(5).split('-').reverse().join('/')
}

/** Linhas do mapa de calor na ordem do protótipo (Seg…Dom); a API usa 0 = domingo. */
export function weekRows(grid: number[][]): Array<{ day: string; values: number[] }> {
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  return [1, 2, 3, 4, 5, 6, 0].map((d, i) => ({ day: names[i], values: grid[d] ?? Array(24).fill(0) }))
}
