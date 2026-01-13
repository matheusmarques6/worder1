/**
 * Constantes globais do sistema de relatórios
 */

// Limites para evitar PDFs muito grandes
export const REPORT_LIMITS = {
  MAX_ROWS_TABLE: 50,
  TOP_N_DEALS: 10,
  TOP_N_PRODUCTS: 10,
  TOP_N_CAMPAIGNS: 20,
  MAX_INSIGHTS: 5,
  MAX_STORES: 20,
} as const

// Mensagens padrão
export const REPORT_MESSAGES = {
  TRUNCATED: (shown: number, total: number) =>
    `Mostrando ${shown} de ${total} registros`,
  NO_DATA: 'Nenhum dado disponível para o período selecionado',
  LOADING: 'Gerando relatório...',
  ERROR: 'Erro ao gerar relatório',
} as const

// Cores do tema Worder
export const COLORS = {
  primary: '#f97316',      // Laranja Worder
  secondary: '#1f2937',    // Cinza escuro
  success: '#22c55e',      // Verde
  danger: '#ef4444',       // Vermelho
  warning: '#eab308',      // Amarelo
  info: '#3b82f6',         // Azul
  
  text: {
    primary: '#111827',
    secondary: '#6b7280',
    muted: '#9ca3af',
    white: '#ffffff',
  },
  
  background: {
    white: '#ffffff',
    gray: '#f9fafb',
    lightGray: '#f3f4f6',
    dark: '#1f2937',
  },
  
  border: {
    light: '#e5e7eb',
    medium: '#d1d5db',
    dark: '#9ca3af',
  },
} as const

// Configurações de período padrão
export const PERIOD_OPTIONS = {
  '7d': { label: 'Últimos 7 dias', days: 7 },
  '30d': { label: 'Últimos 30 dias', days: 30 },
  '90d': { label: 'Últimos 90 dias', days: 90 },
  'month': { label: 'Este mês', days: 0 },
  'quarter': { label: 'Este trimestre', days: 0 },
  'year': { label: 'Este ano', days: 0 },
} as const

// Tipos de relatório disponíveis
export const REPORT_TYPES = [
  'general',
  'sales',
  'forecast',
  'shopify',
  'email',
  'ads',
] as const

export type ReportType = typeof REPORT_TYPES[number]

// Plataformas de ads suportadas
export const ADS_PLATFORMS = ['meta', 'google', 'tiktok'] as const
export type AdsPlatform = typeof ADS_PLATFORMS[number]
