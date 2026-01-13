/**
 * Contrato de dados para Relatório Geral (Dashboard)
 * v2.1 - Campos financeiros opcionais (number | null)
 */

export interface GeneralReportData {
  period: string
  generatedAt: string
  
  // KPIs principais
  kpis: {
    // Campos reais (sempre preenchidos com dados do CRM)
    receita: number
    receitaChange: number
    pedidos: number
    pedidosChange: number
    ticketMedio: number
    ticketMedioChange: number
    
    // Campos financeiros (opcionais - podem não existir no banco)
    custos: number | null
    custosChange: number | null
    marketing: number | null
    marketingChange: number | null
    impostos: number | null
    impostosChange: number | null
    margem: number | null
    margemChange: number | null
    lucro: number | null
    lucroChange: number | null
  }
  
  // Performance por loja
  stores: Array<{
    id: string
    name: string
    domain?: string
    pedidos: number
    receita: number
    // Campos financeiros opcionais por loja
    custos: number | null
    lucro: number | null
    margem: number | null
  }>
  
  // Timeline (opcional, para gráficos futuros)
  timeline?: Array<{
    date: string
    receita: number
    custos: number | null
    marketing: number | null
    impostos: number | null
    lucro: number | null
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
    pedidos: 0,
    pedidosChange: 0,
    ticketMedio: 0,
    ticketMedioChange: 0,
    // Financeiros como null (não disponíveis)
    custos: null,
    custosChange: null,
    marketing: null,
    marketingChange: null,
    impostos: null,
    impostosChange: null,
    margem: null,
    margemChange: null,
    lucro: null,
    lucroChange: null,
  },
  stores: [],
}
