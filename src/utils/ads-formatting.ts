/**
 * UTILITÁRIOS DE FORMATAÇÃO - ADS
 * 
 * Helpers para formatar valores monetários, porcentagens e métricas
 */

// ==================== MOEDA ====================

export function formatCurrency(
  value: number | null | undefined, 
  currency: string = 'BRL'
): string {
  if (value === null || value === undefined) return '-';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCurrencyCompact(
  value: number | null | undefined, 
  currency: string = 'BRL'
): string {
  if (value === null || value === undefined) return '-';
  
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`;
  }
  
  return formatCurrency(value, currency);
}

// ==================== NÚMEROS ====================

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatNumberCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  
  return formatNumber(value);
}

export function formatDecimal(
  value: number | null | undefined, 
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '-';
  
  return value.toFixed(decimals);
}

// ==================== PORCENTAGEM ====================

export function formatPercent(
  value: number | null | undefined, 
  decimals: number = 2
): string {
  if (value === null || value === undefined) return '-';
  
  return `${value.toFixed(decimals)}%`;
}

export function formatChange(value: number | null | undefined): {
  text: string;
  isPositive: boolean;
  isNegative: boolean;
} {
  if (value === null || value === undefined) {
    return { text: '-', isPositive: false, isNegative: false };
  }
  
  const isPositive = value > 0;
  const isNegative = value < 0;
  const prefix = isPositive ? '+' : '';
  
  return {
    text: `${prefix}${value.toFixed(1)}%`,
    isPositive,
    isNegative,
  };
}

// ==================== ROAS ====================

export function formatROAS(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  
  return `${value.toFixed(2)}x`;
}

export function getROASColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-gray-500';
  
  if (value >= 3) return 'text-green-600';
  if (value >= 2) return 'text-green-500';
  if (value >= 1) return 'text-yellow-500';
  return 'text-red-500';
}

// ==================== STATUS ====================

export type AdStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' | string;

export function getStatusLabel(status: AdStatus): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Ativo',
    PAUSED: 'Pausado',
    DELETED: 'Excluído',
    ARCHIVED: 'Arquivado',
  };
  
  return labels[status] || status;
}

export function getStatusColor(status: AdStatus): {
  bg: string;
  text: string;
  dot: string;
} {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    ACTIVE: { 
      bg: 'bg-green-100', 
      text: 'text-green-800', 
      dot: 'bg-green-500' 
    },
    PAUSED: { 
      bg: 'bg-yellow-100', 
      text: 'text-yellow-800', 
      dot: 'bg-yellow-500' 
    },
    DELETED: { 
      bg: 'bg-red-100', 
      text: 'text-red-800', 
      dot: 'bg-red-500' 
    },
    ARCHIVED: { 
      bg: 'bg-gray-100', 
      text: 'text-gray-800', 
      dot: 'bg-gray-500' 
    },
  };
  
  return colors[status] || colors.PAUSED;
}

// ==================== OBJETIVOS ====================

export function getObjectiveLabel(objective: string): string {
  const labels: Record<string, string> = {
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_LEADS: 'Leads',
    OUTCOME_SALES: 'Vendas',
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_APP_PROMOTION: 'Promoção de App',
    CONVERSIONS: 'Conversões',
    LINK_CLICKS: 'Cliques no Link',
    POST_ENGAGEMENT: 'Engajamento',
    VIDEO_VIEWS: 'Visualizações',
    REACH: 'Alcance',
    BRAND_AWARENESS: 'Reconhecimento',
    MESSAGES: 'Mensagens',
  };
  
  return labels[objective] || objective;
}

// ==================== DATAS ====================

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  
  return formatDate(d);
}

// ==================== ORÇAMENTO ====================

export function formatBudget(
  daily: number | null | undefined, 
  lifetime: number | null | undefined
): string {
  if (daily) {
    return `${formatCurrency(daily)}/dia`;
  }
  if (lifetime) {
    return `${formatCurrency(lifetime)} total`;
  }
  return '-';
}

// ==================== CORES PARA GRÁFICOS ====================

export const CHART_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
];

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
