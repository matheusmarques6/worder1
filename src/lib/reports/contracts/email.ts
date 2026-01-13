/**
 * Contrato de dados para Relatório de Email Marketing (Klaviyo)
 */

export interface EmailReportData {
  period: string
  generatedAt: string
  accountName?: string
  
  // KPIs gerais
  kpis: {
    totalSent: number
    totalSentChange: number
    totalOpens: number
    totalClicks: number
    totalRevenue: number
    totalRevenueChange: number
    
    // Taxas
    openRate: number
    openRateChange: number
    clickRate: number
    clickRateChange: number
    conversionRate: number
    conversionRateChange: number
    unsubscribeRate: number
    bounceRate: number
  }
  
  // Campanhas
  campaigns: Array<{
    id: string
    name: string
    sentAt: string
    status: 'sent' | 'scheduled' | 'draft'
    sent: number
    opens: number
    clicks: number
    revenue: number
    openRate: number
    clickRate: number
    conversionRate: number
  }>
  
  // Flows (automações)
  flows?: Array<{
    id: string
    name: string
    status: 'active' | 'paused' | 'draft'
    sent: number
    opens: number
    clicks: number
    revenue: number
    openRate: number
    clickRate: number
  }>
  
  // Timeline (opcional)
  timeline?: Array<{
    date: string
    sent: number
    opens: number
    clicks: number
    revenue: number
  }>
  
  // Métricas de lista
  listMetrics?: {
    totalSubscribers: number
    newSubscribers: number
    unsubscribes: number
    growthRate: number
  }
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_EMAIL_REPORT: EmailReportData = {
  period: '',
  generatedAt: '',
  kpis: {
    totalSent: 0,
    totalSentChange: 0,
    totalOpens: 0,
    totalClicks: 0,
    totalRevenue: 0,
    totalRevenueChange: 0,
    openRate: 0,
    openRateChange: 0,
    clickRate: 0,
    clickRateChange: 0,
    conversionRate: 0,
    conversionRateChange: 0,
    unsubscribeRate: 0,
    bounceRate: 0,
  },
  campaigns: [],
}
