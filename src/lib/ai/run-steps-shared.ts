// =============================================
// Vocabulario dos passos do agente — PURO, sem dependencia de servidor.
//
// Separado de run-steps.ts porque aquele importa supabaseAdmin, e o painel do
// inbox (AgentActivity.tsx, 'use client') precisa da MESMA lista de passos
// terminais. Importar o modulo do servidor num client component arrastaria o
// service-role client para o bundle do browser — o mesmo tipo de erro que ja
// derrubou o editor de e-mail neste repo.
//
// A alternativa era duplicar a lista nos dois lados, com o risco classico: um
// passo terminal novo entra no runner, ninguem atualiza a copia do client, e o
// painel fica preso "trabalhando" para sempre.
// =============================================

export const AI_RUN_STEPS = {
  /** Inbound chegou; janela de debounce agendada (agente ainda nao rodou). */
  QUEUED: 'queued',
  /** Guards passaram, agente resolvido, run comecou. */
  STARTED: 'started',
  /** Transcrevendo audio inbound. */
  TRANSCRIBING: 'transcribing',
  /** Interpretando imagem inbound. */
  ANALYZING_IMAGE: 'analyzing_image',
  /** Chamada ao LLM em andamento. */
  GENERATING: 'generating',
  /** Ferramentas executadas no turno. */
  TOOLS: 'tools',
  /** Enviando para o WhatsApp (inclui os delays humanizados). */
  SENDING: 'sending',
  /** Terminal: mensagem enviada. */
  SENT: 'sent',
  /** Terminal: transferido para humano. */
  TRANSFERRED: 'transferred',
  /** Terminal: nao respondeu (guard, cooldown, opt-out...). */
  SKIPPED: 'skipped',
  /** Terminal: falhou (transitorio ou permanente). */
  FAILED: 'failed',
} as const;

export type AiRunStep = (typeof AI_RUN_STEPS)[keyof typeof AI_RUN_STEPS];

/** Passos que encerram o run — o painel para de mostrar "trabalhando". */
export const TERMINAL_AI_RUN_STEPS: readonly AiRunStep[] = [
  AI_RUN_STEPS.SENT,
  AI_RUN_STEPS.TRANSFERRED,
  AI_RUN_STEPS.SKIPPED,
  AI_RUN_STEPS.FAILED,
];

/**
 * Passo desconhecido NAO e terminal: um passo novo no runner que chegue a um
 * client desatualizado deve manter o painel vivo, nunca encerra-lo por engano.
 */
export function isTerminalAiRunStep(step: string): boolean {
  return (TERMINAL_AI_RUN_STEPS as readonly string[]).includes(step);
}

/** Rotulo de fallback, usado quando o passo nao trouxe `detail`. */
export const AI_RUN_STEP_LABELS: Record<string, string> = {
  queued: 'Agente vai responder',
  started: 'Agente assumiu a conversa',
  transcribing: 'Transcrevendo áudio',
  analyzing_image: 'Analisando imagem',
  generating: 'Gerando resposta',
  tools: 'Consultando dados',
  sending: 'Enviando resposta',
  sent: 'Resposta enviada',
  transferred: 'Transferido para humano',
  skipped: 'Não respondeu',
  failed: 'Falhou',
};

/**
 * Rotulo de exibicao de uma tool call. Nomes de tool sao snake_case tecnicos
 * (get_order_status); o lojista olhando o inbox precisa de portugues.
 */
export function describeToolCall(toolName: string): string {
  const map: Record<string, string> = {
    get_order_status: 'Consultando status do pedido',
    get_orders: 'Consultando pedidos',
    get_order: 'Consultando pedido',
    search_products: 'Buscando produtos',
    get_product: 'Consultando produto',
    get_customer: 'Consultando cliente',
    create_ticket: 'Abrindo ticket',
    transfer_to_human: 'Transferindo para atendente',
    get_tracking: 'Consultando rastreio',
    search_knowledge: 'Consultando base de conhecimento',
  };
  return map[toolName] || `Usando ${toolName.replace(/_/g, ' ')}`;
}
