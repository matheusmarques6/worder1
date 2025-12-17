// ============================================
// TYPES - WhatsApp AI Agents Analytics
// ============================================

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

export type InteractionStatus = 'pending' | 'success' | 'error' | 'timeout';

// Agente de IA com métricas
export interface AIAgentWithMetrics {
  id: string;
  name: string;
  description?: string;
  provider: AIProvider;
  model: string;
  is_active: boolean;
  temperature?: number;
  max_tokens?: number;
  total_interactions: number;
  total_tokens_used: number;
  total_cost_usd: number;
  avg_response_time_ms?: number;
  success_rate?: number;
  resolution_rate?: number;
  last_interaction_at?: string;
  created_at: string;
}

// Summary de analytics de IA
export interface AIAnalyticsSummary {
  total_agents: number;
  active_agents: number;
  total_interactions: number;
  total_conversations: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost_usd: number;
  avg_response_time_ms: number;
  success_rate: number;
  error_rate: number;
  resolution_rate: number;
  transfer_rate: number;
}

// Tendências de IA
export interface AIAnalyticsTrends {
  interactions_change: number;
  tokens_change: number;
  cost_change: number;
  latency_change: number;
  success_rate_change: number;
  resolution_rate_change: number;
}

// Ponto de dados do gráfico
export interface AIChartDataPoint {
  date: string;
  interactions: number;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
}

// Breakdown por provedor
export interface ProviderBreakdown {
  [provider: string]: {
    interactions: number;
    tokens: number;
    cost_usd: number;
    percent: number;
  };
}

// Breakdown por modelo
export interface ModelBreakdown {
  [model: string]: {
    provider: AIProvider;
    interactions: number;
    tokens: number;
    cost_usd: number;
    percent: number;
  };
}

// Distribuição por hora
export interface AIHourlyDistribution {
  hour: number;
  interactions: number;
  avg_latency_ms: number;
  success_rate: number;
}

// Métricas de performance
export interface PerformanceMetrics {
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  success_rate: number;
  error_rate: number;
  timeout_rate: number;
}

// Métricas de qualidade
export interface QualityMetrics {
  resolution_rate: number;
  transfer_rate: number;
  abandonment_rate: number;
  avg_messages_per_conversation: number;
}

// Breakdown de erros
export interface AIErrorBreakdown {
  [errorType: string]: {
    count: number;
    percent: number;
    last_at?: string;
  };
}

// Response da API principal
export interface AIAnalyticsResponse {
  summary: AIAnalyticsSummary;
  trends: AIAnalyticsTrends;
  agents: AIAgentWithMetrics[];
  chart_data: AIChartDataPoint[];
  by_provider: ProviderBreakdown;
  by_model: ModelBreakdown;
  hourly_distribution: AIHourlyDistribution[];
  performance: PerformanceMetrics;
  quality: QualityMetrics;
  error_breakdown: AIErrorBreakdown;
}

// Interação de IA (log)
export interface AIInteractionLog {
  id: string;
  conversation_id?: string;
  provider: AIProvider;
  model: string;
  user_message: string;
  ai_response?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  response_time_ms: number;
  status: InteractionStatus;
  error_code?: string;
  error_message?: string;
  was_transferred: boolean;
  conversation_resolved: boolean;
  created_at: string;
}

// Detalhes de um agente específico
export interface AIAgentDetailResponse {
  agent: {
    id: string;
    name: string;
    description?: string;
    provider: AIProvider;
    model: string;
    temperature: number;
    max_tokens: number;
    system_prompt?: string;
    is_active: boolean;
    created_at: string;
    updated_at?: string;
  };
  metrics: {
    total_interactions: number;
    total_conversations: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    avg_response_time_ms: number;
    avg_tokens_per_interaction: number;
    avg_cost_per_conversation: number;
  };
  performance: PerformanceMetrics;
  quality: QualityMetrics;
  timeline: AIChartDataPoint[];
  hourly_heatmap: AIHourlyDistribution[];
  recent_interactions: AIInteractionLog[];
  errors: Array<{
    code: string;
    count: number;
    last_at?: string;
  }>;
}

// Cores por provedor
export const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai: '#10b981',   // Verde
  anthropic: '#d97706', // Marrom/Âmbar
  gemini: '#3b82f6',   // Azul
  deepseek: '#8b5cf6', // Roxo
};

// Nomes dos provedores
export const PROVIDER_NAMES: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
};

// Logos dos provedores (ícones)
export const PROVIDER_ICONS: Record<AIProvider, string> = {
  openai: '🤖',
  anthropic: '🧠',
  gemini: '✨',
  deepseek: '🌊',
};

// Cores do tema de IA
export const AI_COLORS = {
  interactions: '#a855f7',  // Roxo
  tokens: '#f59e0b',        // Âmbar
  cost: '#f97316',          // Laranja
  latency: '#06b6d4',       // Ciano
  success: '#10b981',       // Verde
  error: '#ef4444',         // Vermelho
  resolution: '#84cc16',    // Lime
  transfer: '#f97316',      // Laranja
  grid: 'rgba(255,255,255,0.05)',
  axis: '#6b7280',
} as const;

// Helper para formatar custo
export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${(usd * 100).toFixed(2)}¢`;
  } else if (usd < 1) {
    return `$${usd.toFixed(3)}`;
  } else if (usd < 100) {
    return `$${usd.toFixed(2)}`;
  } else {
    return `$${usd.toFixed(0)}`;
  }
}

// Helper para formatar tokens
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

// Helper para formatar latência
export function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
}

// Helper para cor baseada em latência
export function getLatencyColor(ms: number): string {
  if (ms < 500) return 'text-emerald-400';
  if (ms < 1000) return 'text-green-400';
  if (ms < 2000) return 'text-yellow-400';
  if (ms < 3000) return 'text-orange-400';
  return 'text-red-400';
}

// Helper para cor baseada em taxa de sucesso
export function getSuccessRateColor(rate: number): string {
  if (rate >= 99) return 'text-emerald-400';
  if (rate >= 95) return 'text-green-400';
  if (rate >= 90) return 'text-yellow-400';
  if (rate >= 80) return 'text-orange-400';
  return 'text-red-400';
}

// Helper para cor de heatmap baseada em interações
export function getHeatmapColor(value: number, max: number): string {
  const intensity = max > 0 ? value / max : 0;
  
  if (intensity < 0.1) return 'bg-dark-700';
  if (intensity < 0.25) return 'bg-purple-900/30';
  if (intensity < 0.5) return 'bg-purple-700/40';
  if (intensity < 0.75) return 'bg-purple-600/60';
  return 'bg-purple-500/80';
}

// Preços de referência (USD por 1M tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
};

// Calcular custo estimado
export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] || { input: 0.5, output: 1.5 };
  return (inputTokens / 1000000 * pricing.input) + (outputTokens / 1000000 * pricing.output);
}
