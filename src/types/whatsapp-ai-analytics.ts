// ===============================
// WHATSAPP AI ANALYTICS TYPES
// ===============================

// DateRange deve ser consistente com whatsapp-analytics.ts
export type DateRange = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';

// ===============================
// AI PROVIDER TYPE
// ===============================

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'cohere' | 'mistral' | 'azure' | 'unknown';

// ===============================
// CONSTANTS
// ===============================

export const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai: '#10A37F',
  anthropic: '#D97706',
  google: '#4285F4',
  groq: '#F55036',
  cohere: '#39594D',
  mistral: '#FF7000',
  azure: '#0078D4',
  unknown: '#6B7280',
};

export const PROVIDER_NAMES: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  groq: 'Groq',
  cohere: 'Cohere',
  mistral: 'Mistral',
  azure: 'Azure OpenAI',
  unknown: 'Desconhecido',
};

export const AI_COLORS = {
  interactions: '#8B5CF6',
  tokens: '#10B981',
  cost: '#F59E0B',
  latency: '#3B82F6',
  success: '#22C55E',
  error: '#EF4444',
  input_tokens: '#06B6D4',
  output_tokens: '#8B5CF6',
  grid: 'rgba(255,255,255,0.05)',
  axis: '#6B7280',
} as const;

// ===============================
// HELPER FUNCTIONS
// ===============================

/**
 * Formata número de tokens para exibição
 * @example formatTokens(1500) => "1.5K"
 * @example formatTokens(1500000) => "1.5M"
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  }
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

/**
 * Formata custo em USD para exibição
 * @example formatCost(0.0012) => "$0.0012"
 * @example formatCost(1.5) => "$1.50"
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '$' + cost.toFixed(4);
  }
  if (cost < 1) {
    return '$' + cost.toFixed(3);
  }
  return '$' + cost.toFixed(2);
}

/**
 * Formata latência em milissegundos para exibição
 * @example formatLatency(150) => "150ms"
 * @example formatLatency(1500) => "1.5s"
 */
export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return (ms / 1000).toFixed(1) + 's';
  }
  return Math.round(ms) + 'ms';
}

// Interface para quando precisar de datas específicas
export interface DateRangeObject {
  startDate: string;
  endDate: string;
}

// ===============================
// SUMMARY & TRENDS
// ===============================

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

export interface AIAnalyticsTrends {
  interactions_change: number;
  tokens_change: number;
  cost_change: number;
  latency_change: number;
  success_rate_change: number;
  resolution_rate_change: number;
}

// ===============================
// AGENTS
// ===============================

export interface AIAgentWithMetrics {
  id: string;
  name: string;
  description?: string;
  provider: string;
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

// ===============================
// CHART DATA
// ===============================

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

// ===============================
// BREAKDOWNS
// ===============================

export interface ProviderBreakdownItem {
  interactions: number;
  tokens: number;
  cost_usd: number;
  percent: number;
}

export interface ProviderBreakdown {
  [provider: string]: ProviderBreakdownItem;
}

export interface ModelBreakdownItem {
  provider: string;
  interactions: number;
  tokens: number;
  cost_usd: number;
  percent: number;
}

export interface ModelBreakdown {
  [model: string]: ModelBreakdownItem;
}

// ===============================
// HOURLY DISTRIBUTION
// ===============================

export interface AIHourlyDistribution {
  hour: number;
  interactions: number;
  avg_latency_ms: number;
  success_rate: number;
}

// ===============================
// PERFORMANCE & QUALITY METRICS
// ===============================

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

export interface QualityMetrics {
  resolution_rate: number;
  transfer_rate: number;
  abandonment_rate: number;
  avg_messages_per_conversation: number;
}

// ===============================
// ERROR BREAKDOWN
// ===============================

export interface AIErrorBreakdownItem {
  count: number;
  percent: number;
  last_at?: string;
}

export interface AIErrorBreakdown {
  [errorCode: string]: AIErrorBreakdownItem;
}

// ===============================
// API RESPONSES
// ===============================

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

export interface AIAgentDetailResponse {
  agent: {
    id: string;
    name: string;
    description?: string;
    provider: string;
    model: string;
    temperature?: number;
    max_tokens?: number;
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
  recent_interactions: AIInteraction[];
  errors: Array<{
    code: string;
    count: number;
    last_at?: string;
  }>;
}

export interface AIInteraction {
  id: string;
  conversation_id?: string;
  provider: string;
  model: string;
  user_message?: string;
  ai_response?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  response_time_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_code?: string;
  error_message?: string;
  was_transferred?: boolean;
  conversation_resolved?: boolean;
  created_at: string;
}

// ===============================
// LEGACY TYPES - Backwards Compatibility
// ===============================

export interface AIAnalyticsOverview {
  totalConversations: number;
  aiHandledConversations: number;
  humanHandledConversations: number;
  aiHandleRate: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  customerSatisfactionScore: number;
  totalMessages: number;
  aiMessages: number;
  humanMessages: number;
}

export interface AIPerformanceMetrics {
  accuracy: number;
  accuracyChange: number;
  responseTime: number;
  responseTimeChange: number;
  resolutionRate: number;
  resolutionRateChange: number;
  escalationRate: number;
  escalationRateChange: number;
  satisfactionScore: number;
  satisfactionChange: number;
}

export interface ConversationMetrics {
  date: string;
  totalConversations: number;
  aiHandled: number;
  humanHandled: number;
  escalated: number;
  resolved: number;
}

export interface ResponseTimeMetrics {
  date: string;
  aiResponseTime: number;
  humanResponseTime: number;
  averageResponseTime: number;
}

export interface SatisfactionMetrics {
  date: string;
  score: number;
  responses: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface TopIntent {
  intent: string;
  count: number;
  percentage: number;
  aiResolutionRate: number;
  avgResponseTime: number;
}

export interface EscalationReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface HourlyMetrics {
  hour: number;
  conversations: number;
  aiHandled: number;
  responseTime: number;
}

export interface DailyMetrics {
  dayOfWeek: number;
  dayName: string;
  conversations: number;
  aiHandled: number;
  responseTime: number;
}

export interface AIModelMetrics {
  modelVersion: string;
  deployedAt: string;
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export interface ConversationSummary {
  id: string;
  contactName: string;
  contactPhone: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'resolved' | 'escalated';
  handledBy: 'ai' | 'human' | 'mixed';
  messagesCount: number;
  satisfactionScore?: number;
  primaryIntent?: string;
  resolutionTime?: number;
}

export interface AIAnalyticsFilters {
  dateRange: DateRange;
  handledBy?: 'all' | 'ai' | 'human';
  status?: 'all' | 'resolved' | 'escalated' | 'active';
  intent?: string;
  satisfactionMin?: number;
  satisfactionMax?: number;
}

export interface AIAnalyticsDashboard {
  overview: AIAnalyticsOverview;
  performance: AIPerformanceMetrics;
  conversationTrends: ConversationMetrics[];
  responseTimeTrends: ResponseTimeMetrics[];
  satisfactionTrends: SatisfactionMetrics[];
  topIntents: TopIntent[];
  escalationReasons: EscalationReason[];
  qualityMetrics: QualityMetrics;
  errorBreakdown: AIErrorBreakdown;
  hourlyPatterns: HourlyMetrics[];
  dailyPatterns: DailyMetrics[];
  modelMetrics: AIModelMetrics;
  recentConversations: ConversationSummary[];
}

export interface AIMetricsResponse {
  success: boolean;
  data?: AIPerformanceMetrics;
  error?: string;
}

export interface ConversationsResponse {
  success: boolean;
  data?: ConversationSummary[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
