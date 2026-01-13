/**
 * Contrato de dados para Relatório de Vendas CRM
 */

export interface SalesReportData {
  period: string
  generatedAt: string
  
  // KPIs principais
  kpis: {
    pipelineTotal: number
    weightedTotal: number
    wonValue: number
    wonValueChange: number
    lostValue: number
    winRate: number
    winRateChange: number
    avgTicket: number
    avgTicketChange: number
    avgCycleDays: number
    avgCycleDaysChange: number
    totalDeals: number
    openDeals: number
    wonDeals: number
    lostDeals: number
  }
  
  // Funil de vendas
  funnel: Array<{
    id: string
    name: string
    color: string
    position: number
    dealCount: number
    value: number
    conversionRate: number
  }>
  
  // Por pipeline (opcional)
  byPipeline?: Array<{
    id: string
    name: string
    color: string
    totalValue: number
    wonValue: number
    winRate: number
    avgTicket: number
    totalDeals: number
  }>
  
  // Top deals
  topDeals: Array<{
    id: string
    title: string
    value: number
    stage: string
    probability: number
    contact?: {
      name: string
      email?: string
    }
  }>
  
  // Deals em risco
  dealsAtRisk: Array<{
    id: string
    title: string
    value: number
    reason: 'stale' | 'overdue' | 'low_engagement'
    daysInStage: number
  }>
  
  // Insights automáticos
  insights: Array<{
    type: 'positive' | 'warning' | 'info'
    title: string
    description: string
  }>
  
  // Timeline (opcional)
  timeline?: Array<{
    date: string
    won: number
    lost: number
    created: number
  }>
  
  // Velocidade por estágio (opcional)
  velocity?: Array<{
    stageId: string
    stageName: string
    avgDays: number
    dealCount: number
  }>
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_SALES_REPORT: SalesReportData = {
  period: '',
  generatedAt: '',
  kpis: {
    pipelineTotal: 0,
    weightedTotal: 0,
    wonValue: 0,
    wonValueChange: 0,
    lostValue: 0,
    winRate: 0,
    winRateChange: 0,
    avgTicket: 0,
    avgTicketChange: 0,
    avgCycleDays: 0,
    avgCycleDaysChange: 0,
    totalDeals: 0,
    openDeals: 0,
    wonDeals: 0,
    lostDeals: 0,
  },
  funnel: [],
  topDeals: [],
  dealsAtRisk: [],
  insights: [],
}
