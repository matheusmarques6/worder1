/**
 * Contrato de dados para Relatório Geral (Dashboard)
 */

export interface GeneralReportData {
  period: string
  generatedAt: string
  
  // KPIs principais
  kpis: {
    receita: number
    receitaChange: number
    custos: number
    custosChange: number
    marketing: number
    marketingChange: number
    impostos: number
    impostosChange: number
    margem: number
    margemChange: number
    lucro: number
    lucroChange: number
    pedidos: number
    pedidosChange: number
    ticketMedio: number
    ticketMedioChange: number
  }
  
  // Performance por loja
  stores: Array<{
    id: string
    name: string
    domain?: string
    pedidos: number
    receita: number
    custos: number
    lucro: number
    margem: number
  }>
  
  // Timeline (opcional, para gráficos futuros)
  timeline?: Array<{
    date: string
    receita: number
    custos: number
    marketing: number
    impostos: number
    lucro: number
  }>
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_GENERAL_REPORT: GeneralReportData = {
  period: '',
  generatedAt: '',
  kpis: {
    receita: 0,
    receitaChange: 0,
    custos: 0,
    custosChange: 0,
    marketing: 0,
    marketingChange: 0,
    impostos: 0,
    impostosChange: 0,
    margem: 0,
    margemChange: 0,
    lucro: 0,
    lucroChange: 0,
    pedidos: 0,
    pedidosChange: 0,
    ticketMedio: 0,
    ticketMedioChange: 0,
  },
  stores: [],
}
