// Modelos de agente da tela "Novo agente" (protótipo, CreateAgent). Um
// modelo é só o PONTO DE PARTIDA de uma linha de ai_agents: persona,
// adaptação, ferramentas, regras, transferência, revisão e as famílias de
// missão que nascem em rascunho, ligadas ao agente. Ativar é ato explícito.
// Módulo puro: importado pela rota POST /api/ai/agents e pela UI.

import type { AgentPersona } from './types'
import { FAMILY_LABELS } from './missions'
import { TOOL_CATALOG } from './tools/catalog'

export interface AgentTemplate {
  id: string
  /** Título do cartão ("Vendas no WhatsApp"). */
  title: string
  /** Nome sugerido no passo 2. */
  name: string
  /** Função sugerida no passo 2 ("Vendas"). */
  role: string
  summary: string
  /** Ícone do protótipo (proto/icons). */
  icon: string
  system_prompt: string
  persona: Partial<AgentPersona>
  client_adaptation: Record<string, boolean>
  tools: string[]
  blocked_topics: string[]
  /** Regras que nunca quebra (persona.guidelines). */
  rules: string[]
  /** Critérios de revisão: cada um vira um juiz ativo (settings.judges.custom). */
  review: string[]
  handoff_keywords: string[]
  handoff_confirmation_message: string
  /** Famílias de missão do modelo (seed em rascunho, só estas). */
  mission_families: string[]
  /** Passo 2: tipos de fonte (ai_sources.kind) sempre marcados... */
  knowledge_kinds: string[]
  /** ...e fontes de qualquer tipo cujo nome combina com o modelo. */
  knowledge_match: RegExp
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'vendas-whatsapp',
    title: 'Vendas no WhatsApp',
    name: 'Nina',
    role: 'Vendas',
    summary: 'Responde quem chama a loja, tira dúvidas de produto e fecha o pedido.',
    icon: 'cart',
    system_prompt:
      'Você é o atendente de vendas da loja no WhatsApp. Responda com objetividade, ' +
      'confirme o que o cliente procura antes de sugerir, e conduza para a compra sem ' +
      'pressionar. Nunca invente preço, prazo ou estoque: use as ferramentas.',
    persona: { tone: 'friendly', response_length: 'short', language: 'pt-BR' },
    client_adaptation: { espelhar_tom: true, resumir_para_apressado: true },
    tools: ['transfer_to_human', 'search_knowledge', 'product_lookup', 'order_status', 'save_customer', 'save_interests'],
    blocked_topics: ['política', 'religião'],
    rules: ['Não promete prazo de entrega fora da tabela', 'Não fala de concorrentes'],
    review: ['Não inventa preço, prazo ou estoque'],
    handoff_keywords: ['falar com humano', 'atendente', 'pessoa de verdade'],
    handoff_confirmation_message: 'Claro! Já estou passando para uma pessoa da equipe.',
    mission_families: ['whatsapp.received'],
    knowledge_kinds: ['catalog', 'faq'],
    knowledge_match: /frete|pagamento|produto|cat[aá]logo|medida|tamanho|promo|pre[cç]o/i,
  },
  {
    id: 'pos-compra',
    title: 'Pós-compra',
    name: 'Nina',
    role: 'Pós-compra',
    summary: 'Acompanha o pedido, responde sobre troca e entrega e pede avaliação.',
    icon: 'box',
    system_prompt:
      'Você cuida do pós-compra. Responda status de pedido, prazo e troca com dados ' +
      'reais das ferramentas. Nunca prometa prazo que a transportadora não deu. ' +
      'Reclamação vira transferência para a equipe.',
    persona: { tone: 'professional', response_length: 'medium', language: 'pt-BR' },
    client_adaptation: { espelhar_tom: false, resumir_para_apressado: true },
    tools: ['transfer_to_human', 'search_knowledge', 'order_status', 'timeline'],
    blocked_topics: ['política', 'religião'],
    rules: ['Não aprova troca fora da política', 'Não altera endereço depois do envio'],
    review: ['Não promete prazo que a transportadora não deu'],
    handoff_keywords: ['reclamação', 'procon', 'cancelar tudo'],
    handoff_confirmation_message: 'Entendi. Uma pessoa da equipe vai assumir daqui.',
    mission_families: ['order.fulfilled'],
    knowledge_kinds: ['faq'],
    knowledge_match: /troca|devolu|entrega|prazo|garantia|rastre|envio|assist[eê]ncia/i,
  },
  {
    id: 'recuperacao',
    title: 'Recuperação de carrinho e PIX',
    name: 'Nina',
    role: 'Recuperação',
    summary: 'Lembra quem parou no checkout ou deixou o PIX e o boleto em aberto.',
    icon: 'recover',
    system_prompt:
      'Você retoma compras não concluídas. Uma mensagem curta, útil, sem insistir. ' +
      'Se a pessoa disser que não quer, respeite e encerre com simpatia.',
    persona: { tone: 'casual', response_length: 'short', language: 'pt-BR' },
    client_adaptation: { espelhar_tom: true, resumir_para_apressado: true },
    tools: ['transfer_to_human', 'product_lookup', 'create_coupon'],
    blocked_topics: [],
    rules: ['Não insiste depois de 2 toques sem resposta', 'Não oferece incentivo sem autorização do fluxo'],
    review: ['Não pressiona quem disse que não quer'],
    handoff_keywords: ['não quero mais', 'para de mandar'],
    handoff_confirmation_message: 'Combinado, não vou mais insistir. Qualquer coisa é só chamar.',
    mission_families: ['cart.abandoned', 'checkout.abandoned', 'payment.pix.abandoned', 'payment.boleto.abandoned'],
    knowledge_kinds: ['catalog'],
    knowledge_match: /pagamento|pix|boleto|frete|cupom/i,
  },
]

export function findAgentTemplate(id: unknown): AgentTemplate | null {
  if (typeof id !== 'string') return null
  return AGENT_TEMPLATES.find((t) => t.id === id) ?? null
}

/** As 9 áreas do agente, na ordem do protótipo. */
export const AGENT_AREAS = [
  { id: 'identity', label: 'Identidade' },
  { id: 'missions', label: 'Missões' },
  { id: 'adapt', label: 'Adaptação' },
  { id: 'knowledge', label: 'Conhecimento' },
  { id: 'tools', label: 'Ferramentas' },
  { id: 'limits', label: 'Limites' },
  { id: 'handoff', label: 'Transferência' },
  { id: 'review', label: 'Revisão' },
  { id: 'engine', label: 'Motor e custo' },
] as const

export type AgentAreaId = (typeof AGENT_AREAS)[number]['id']

/** Áreas que o modelo deixa prontas. Conhecimento vem no passo 2 e o motor
 *  usa a chave da conta, por isso nenhum dos dois entra na conta do modelo. */
export function templateAreas(t: AgentTemplate): AgentAreaId[] {
  const out: AgentAreaId[] = []
  if (t.system_prompt.trim()) out.push('identity')
  if (t.mission_families.length) out.push('missions')
  if (Object.values(t.client_adaptation).some(Boolean)) out.push('adapt')
  if (t.tools.some((x) => x !== 'transfer_to_human' && x !== 'search_knowledge')) out.push('tools')
  if (t.blocked_topics.length || t.rules.length) out.push('limits')
  if (t.handoff_keywords.length || t.tools.includes('transfer_to_human')) out.push('handoff')
  if (t.review.length) out.push('review')
  return out
}

const TOOL_LABEL = new Map<string, string>([
  ['create_coupon', 'Criar cupom (só com autorização)'],
  ...TOOL_CATALOG.map((x) => [x.name, x.label] as [string, string]),
])

/** Ferramentas do cartão "O que vem pronto", sem as que todo agente tem. */
export function templateToolLabels(t: AgentTemplate): string[] {
  return t.tools
    .filter((x) => x !== 'transfer_to_human' && x !== 'search_knowledge')
    .map((x) => TOOL_LABEL.get(x) ?? x)
}

export function templateMissionLabels(t: AgentTemplate): string[] {
  return t.mission_families.map((f) => FAMILY_LABELS[f] ?? f)
}

/** Juízes do modelo no formato de settings.judges.custom. */
export function templateJudges(t: AgentTemplate) {
  return t.review.map((criterion, i) => ({
    id: `judge-${t.id}-${i + 1}`, name: criterion.slice(0, 40), criterion, active: true,
  }))
}

/** Fontes marcadas no passo 2 para um modelo. */
export function suggestSources<T extends { id: string; kind: string; name: string }>(t: AgentTemplate, sources: T[]): string[] {
  return sources.filter((s) => t.knowledge_kinds.includes(s.kind) || t.knowledge_match.test(s.name)).map((s) => s.id)
}
