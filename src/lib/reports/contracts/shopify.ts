/**
 * Contrato de dados para Relatório Shopify
 */

export interface ShopifyReportData {
  period: string
  generatedAt: string
  storeName?: string
  storeDomain?: string
  
  // KPIs de vendas
  kpis: {
    vendasBrutas: number
    vendasBrutasChange: number
    vendasLiquidas: number
    vendasLiquidasChange: number
    totalVendas: number
    totalVendasChange: number
    pedidos: number
    pedidosChange: number
    ticketMedio: number
    ticketMedioChange: number
  }
  
  // Clientes
  customers: {
    novos: number
    novosChange: number
    recorrentes: number
    recorrentesChange: number
    taxaRecorrencia: number
    taxaRecorrenciaChange: number
  }
  
  // Detalhamento financeiro
  financial: {
    descontos: number
    descontosChange: number
    devolucoes: number
    devolucoesChange: number
    frete: number
    freteChange: number
    tributos: number
    tributosChange: number
  }
  
  // Top produtos
  topProducts: Array<{
    id: string
    name: string
    sku?: string
    vendas: number
    quantidade: number
    change: number
  }>
  
  // Vendas por canal
  byChannel: Array<{
    name: string
    vendas: number
    pedidos: number
    percentage: number
  }>
  
  // Timeline (opcional)
  timeline?: Array<{
    date: string
    vendas: number
    pedidos: number
    anterior?: number
  }>
}

/**
 * Valores padrão para quando não há dados
 */
export const DEFAULT_SHOPIFY_REPORT: ShopifyReportData = {
  period: '',
  generatedAt: '',
  kpis: {
    vendasBrutas: 0,
    vendasBrutasChange: 0,
    vendasLiquidas: 0,
    vendasLiquidasChange: 0,
    totalVendas: 0,
    totalVendasChange: 0,
    pedidos: 0,
    pedidosChange: 0,
    ticketMedio: 0,
    ticketMedioChange: 0,
  },
  customers: {
    novos: 0,
    novosChange: 0,
    recorrentes: 0,
    recorrentesChange: 0,
    taxaRecorrencia: 0,
    taxaRecorrenciaChange: 0,
  },
  financial: {
    descontos: 0,
    descontosChange: 0,
    devolucoes: 0,
    devolucoesChange: 0,
    frete: 0,
    freteChange: 0,
    tributos: 0,
    tributosChange: 0,
  },
  topProducts: [],
  byChannel: [],
}
