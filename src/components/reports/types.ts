/**
 * Tipos para componentes de exportação de relatórios
 */

export type ReportType = 
  | 'general'
  | 'sales'
  | 'forecast'
  | 'shopify'
  | 'email'
  | 'ads'

export type AdsPlatform = 'meta' | 'google' | 'tiktok'

export type PeriodOption = '7d' | '30d' | '90d' | 'month' | 'quarter' | 'year'

export interface ReportParams {
  type: ReportType
  storeId?: string
  pipelineId?: string
  period?: PeriodOption
  platform?: AdsPlatform
  startDate?: string
  endDate?: string
}

export interface ReportOption {
  type: ReportType
  label: string
  description?: string
  icon?: string
  disabled?: boolean
}

export const REPORT_OPTIONS: ReportOption[] = [
  { type: 'general', label: 'Relatório Geral', description: 'Visão consolidada do dashboard' },
  { type: 'sales', label: 'Vendas CRM', description: 'Funil, deals e métricas de vendas' },
  { type: 'forecast', label: 'Forecast', description: 'Previsão de vendas por período' },
  { type: 'shopify', label: 'Shopify', description: 'Métricas de e-commerce' },
  { type: 'email', label: 'Email Marketing', description: 'Performance de campanhas Klaviyo' },
  { type: 'ads', label: 'Ads', description: 'Meta, Google e TikTok Ads' },
]

export const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Este ano' },
]

export const ADS_PLATFORM_OPTIONS: { value: AdsPlatform; label: string }[] = [
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok Ads' },
]
