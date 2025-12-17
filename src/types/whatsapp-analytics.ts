// ============================================
// TYPES - WhatsApp Campaign Analytics
// ============================================

export type DateRange = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';

export type CampaignStatus = 'PENDING' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Summary de analytics geral
export interface CampaignAnalyticsSummary {
  total_campaigns: number;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_replied: number;
  total_failed: number;
  delivery_rate: number;
  read_rate: number;
  reply_rate: number;
  failure_rate: number;
  avg_delivery_time_seconds: number;
  avg_read_time_seconds: number;
}

// Tendências (comparação com período anterior)
export interface CampaignAnalyticsTrends {
  sent_change: number;
  delivered_change: number;
  read_change: number;
  replied_change: number;
  delivery_rate_change: number;
  read_rate_change: number;
}

// Ponto de dados do gráfico
export interface CampaignChartDataPoint {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
}

// Campanha com métricas
export interface CampaignWithMetrics {
  id: string;
  title: string;
  status: CampaignStatus;
  template_name: string;
  total_contacts: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  delivery_rate: number;
  read_rate: number;
  reply_rate: number;
  failure_rate: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// Breakdown de erros
export interface ErrorBreakdownItem {
  count: number;
  description: string;
  percent?: number;
}

export interface ErrorBreakdown {
  [code: string]: ErrorBreakdownItem;
}

// Distribuição por hora
export interface HourlyDistributionItem {
  hour: number;
  sent: number;
  delivered: number;
  read: number;
  delivery_rate?: number;
  read_rate?: number;
}

// Melhores horários
export interface BestHours {
  delivery: { hour: number; rate: number } | null;
  read: { hour: number; rate: number } | null;
}

// Response da API principal
export interface CampaignAnalyticsResponse {
  summary: CampaignAnalyticsSummary;
  trends: CampaignAnalyticsTrends;
  chart_data: CampaignChartDataPoint[];
  campaigns: CampaignWithMetrics[];
  error_breakdown: ErrorBreakdown;
  hourly_distribution: HourlyDistributionItem[];
  best_hours: BestHours;
}

// Funnel de conversão
export interface FunnelStage {
  stage: string;
  value: number;
  percent: number;
  color: string;
}

// Log de campanha detalhado
export interface CampaignLogDetail {
  id: string;
  contact_name?: string;
  contact_mobile: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  message_id?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  replied_at?: string;
  error_code?: string;
  error_message?: string;
  delivery_time_seconds?: number;
  read_time_seconds?: number;
}

// Detalhes completos de uma campanha
export interface CampaignDetailResponse {
  campaign: {
    id: string;
    title: string;
    template_name: string;
    template_language?: string;
    phonebook?: {
      id: string;
      name: string;
    };
    status: CampaignStatus;
    total_contacts: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
  };
  metrics: {
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    optout: number;
    delivery_rate: number;
    read_rate: number;
    reply_rate: number;
    failure_rate: number;
    avg_delivery_time: string;
    avg_read_time: string;
  };
  funnel: FunnelStage[];
  timeline: Array<{
    time: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
  }>;
  hourly_stats: HourlyDistributionItem[];
  errors: Array<{
    code: string;
    count: number;
    description: string;
    percent: number;
    sample_contacts?: string[];
  }>;
  recent_logs: CampaignLogDetail[];
}

// Cores do tema
export const CAMPAIGN_COLORS = {
  sent: '#3b82f6',      // Azul
  delivered: '#10b981', // Verde
  read: '#22d3ee',      // Ciano
  replied: '#8b5cf6',   // Violeta
  failed: '#ef4444',    // Vermelho
  grid: 'rgba(255,255,255,0.05)',
  axis: '#6b7280',
} as const;

// Cores do funil
export const FUNNEL_COLORS = [
  '#3b82f6',  // Enviadas - Azul
  '#10b981',  // Entregues - Verde
  '#22d3ee',  // Lidas - Ciano
  '#8b5cf6',  // Respondidas - Violeta
] as const;

// Mapeamento de status
export const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bgColor: string }> = {
  PENDING: { label: 'Pendente', color: 'text-dark-400', bgColor: 'bg-dark-600' },
  SCHEDULED: { label: 'Agendada', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  RUNNING: { label: 'Executando', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  PAUSED: { label: 'Pausada', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  COMPLETED: { label: 'Concluída', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  FAILED: { label: 'Falhou', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  CANCELLED: { label: 'Cancelada', color: 'text-dark-400', bgColor: 'bg-dark-600' },
};

// Códigos de erro comuns do WhatsApp
export const WHATSAPP_ERROR_CODES: Record<string, string> = {
  '131047': 'Re-engagement message required (24h window expired)',
  '131051': 'Message type not supported',
  '131026': 'Message undeliverable',
  '131042': 'Business eligibility payment issue',
  '131053': 'Media upload error',
  '131031': 'Account locked for quality issues',
  '130472': 'User number not on WhatsApp',
  '131009': 'Parameter value is not valid',
  '132000': 'Template parameter count mismatch',
  '132001': 'Template does not exist',
  '132005': 'Template parameter format mismatch',
  '133004': 'Server temporarily unavailable',
  '133010': 'Phone number not registered',
  '135000': 'Generic error',
};

// Helper para formatar tempo
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

// Helper para formatar número
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Helper para formatar porcentagem
export function formatPercent(value: number): string {
  return value.toFixed(1) + '%';
}

// Helper para cor de tendência
export function getTrendColor(value: number, inverse: boolean = false): string {
  if (value === 0) return 'text-dark-400';
  const isPositive = inverse ? value < 0 : value > 0;
  return isPositive ? 'text-emerald-400' : 'text-red-400';
}

// Helper para ícone de tendência
export function getTrendIcon(value: number): 'up' | 'down' | 'neutral' {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}
