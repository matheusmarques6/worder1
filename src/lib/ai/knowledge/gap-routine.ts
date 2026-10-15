// A rotina diária de lacunas (plano IA M3 passo 23) — a parte pura:
// agrupar perguntas parecidas por embedding, fundir o grupo numa lacuna só,
// reconhecer tema sensível e montar o pedido de sugestão. O cron lê, chama
// os provedores e grava; isto decide.

export const CLUSTER_THRESHOLD = 0.85
export const MAX_EXAMPLES = 10

export interface GapRow {
  id: string
  question: string
  count: number
  agent_ids: string[] | null
  examples: Array<{ text: string; conversation_id?: string | null; human_reply?: string | null }> | null
  first_seen: string
  last_seen: string
  outcome: string
  suggested_answer: string | null
  cluster_key: string | null
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

/**
 * Agrupamento guloso: a lacuna mais frequente abre um grupo e absorve as
 * que estão a ≥ threshold dela. Índices devolvidos; o primeiro de cada grupo
 * é a cabeça (a que sobrevive).
 */
export function clusterGaps(gaps: Array<Pick<GapRow, 'count'>>, vectors: number[][], threshold = CLUSTER_THRESHOLD): number[][] {
  const order = gaps.map((_, i) => i).sort((a, b) => gaps[b].count - gaps[a].count || a - b)
  const taken = new Set<number>()
  const clusters: number[][] = []
  for (const head of order) {
    if (taken.has(head)) continue
    taken.add(head)
    const group = [head]
    for (const other of order) {
      if (taken.has(other)) continue
      if (cosine(vectors[head], vectors[other]) >= threshold) { taken.add(other); group.push(other) }
    }
    clusters.push(group)
  }
  return clusters
}

const OUTCOME_RANK: Record<string, number> = { blocked: 3, transferred: 2, answered_without_source: 1, no_source: 0 }

/** O que a cabeça vira depois de absorver o grupo. */
export function mergeCluster(head: GapRow, others: GapRow[]): Pick<GapRow, 'count' | 'agent_ids' | 'examples' | 'first_seen' | 'last_seen' | 'outcome'> {
  const all = [head, ...others]
  const agentIds = [...new Set(all.flatMap((g) => g.agent_ids ?? []))]
  const examples: NonNullable<GapRow['examples']> = []
  const seen = new Set<string>()
  for (const g of all) {
    for (const ex of g.examples ?? [{ text: g.question }]) {
      const key = ex.text.trim().toLowerCase()
      if (seen.has(key) || examples.length >= MAX_EXAMPLES) continue
      seen.add(key)
      examples.push(ex)
    }
  }
  return {
    count: all.reduce((sum, g) => sum + (g.count || 1), 0),
    agent_ids: agentIds,
    examples,
    first_seen: all.map((g) => g.first_seen).sort()[0],
    last_seen: all.map((g) => g.last_seen).sort().slice(-1)[0],
    outcome: all.map((g) => g.outcome).sort((a, b) => (OUTCOME_RANK[b] ?? 0) - (OUTCOME_RANK[a] ?? 0))[0],
  }
}

// Temas em que ensinar o agente é pior que transferir (saúde, jurídico,
// segurança). Lista curta e conservadora: falso positivo só muda o aviso.
const SENSITIVE = [
  'remedio', 'medicamento', 'gravida', 'gestante', 'amamentando', 'doenca', 'alergia', 'alergico',
  'diagnostico', 'tratamento', 'medico', 'saude', 'dosagem', 'efeito colateral',
  'advogado', 'processo judicial', 'procon', 'juridico', 'policia', 'golpe', 'fraude',
]

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function isSensitive(texts: string[]): boolean {
  const all = normalizeText(texts.join(' \n '))
  return SENSITIVE.some((term) => all.includes(term))
}

export function suggestionMessages(question: string, examples: string[], humanReplies: string[]) {
  const system =
    'Você ajuda uma loja a preencher a base de conhecimento do atendente virtual. ' +
    'Escreva a resposta que o atendente deve dar a esta pergunta, em português do Brasil, ' +
    'curta (até 3 frases), sem inventar preço, prazo ou política. Se as respostas da equipe ' +
    'trouxerem o dado, use-o. Se não houver dado suficiente, escreva a resposta com ' +
    'marcadores entre colchetes para o lojista completar, como [prazo em dias].'
  const user = [
    `Pergunta: ${question}`,
    examples.length ? `Como os clientes perguntaram:\n${examples.map((e) => `- ${e}`).join('\n')}` : '',
    humanReplies.length ? `O que a equipe respondeu nessas conversas:\n${humanReplies.map((r) => `- ${r}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}

/** Texto de uma mensagem do inbox canônico (content jsonb em vários formatos). */
export function messageText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    const c = content as Record<string, any>
    const text = c.text ?? c.body ?? c.caption ?? c?.text?.body
    if (typeof text === 'string') return text
    if (text && typeof text.body === 'string') return text.body
  }
  return null
}
