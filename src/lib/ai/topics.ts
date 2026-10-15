// Assuntos das conversas (plano IA M5 passo 28): lista fixa, curta e
// comum a toda loja, mais "outro". A classificação é uma chamada barata
// (gpt-4o-mini, purpose topic) feita no fechamento da conversa.

export const TOPICS = [
  'pedido e entrega',
  'troca e devolução',
  'dúvida de produto',
  'pagamento',
  'preço e desconto',
  'reclamação',
  'outro',
] as const
export type Topic = (typeof TOPICS)[number]

export function topicMessages(lines: string[]) {
  return [
    {
      role: 'system' as const,
      content:
        'Classifique o assunto principal da conversa de atendimento em UMA das opções: ' +
        TOPICS.join(', ') + '. Responda só com a opção, exatamente como escrita.',
    },
    { role: 'user' as const, content: lines.slice(0, 12).join('\n').slice(0, 2000) },
  ]
}

/** Lê a resposta do modelo; qualquer coisa fora da lista vira "outro". */
export function parseTopic(text: string | null | undefined): Topic {
  const t = (text ?? '').toLowerCase().trim().replace(/[."']/g, '')
  return (TOPICS.find((topic) => t === topic || t.startsWith(topic)) ?? 'outro') as Topic
}
