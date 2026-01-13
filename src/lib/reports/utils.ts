/**
 * Utilitários para formatação em relatórios PDF
 */

/**
 * Formata valor como moeda brasileira
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'R$ 0,00'
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Formata valor como porcentagem
 */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%'
  }
  return `${value.toFixed(decimals)}%`
}

/**
 * Formata número com separadores de milhar
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0'
  }
  return new Intl.NumberFormat('pt-BR').format(value)
}

/**
 * Formata data no padrão brasileiro
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR')
}

/**
 * Formata data e hora no padrão brasileiro
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Formata período para exibição no relatório
 */
export function formatReportPeriod(
  startDate: Date | string,
  endDate: Date | string
): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate
  return `${formatDate(start)} - ${formatDate(end)}`
}

/**
 * Retorna texto seguro (nunca null/undefined)
 */
export function safeText(
  value: string | number | null | undefined,
  fallback = '-'
): string {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  return String(value)
}

/**
 * Trunca texto longo para caber em célula
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

/**
 * Formata variação percentual com seta
 */
export function formatChange(value: number | null | undefined): {
  text: string
  isPositive: boolean
} {
  if (value === null || value === undefined || isNaN(value)) {
    return { text: '-', isPositive: true }
  }
  const isPositive = value >= 0
  const arrow = isPositive ? '▲' : '▼'
  return {
    text: `${arrow} ${Math.abs(value).toFixed(1)}%`,
    isPositive,
  }
}

/**
 * Gera nome do arquivo de relatório
 */
export function generateReportFilename(type: string, extension = 'pdf'): string {
  const date = new Date().toISOString().split('T')[0]
  return `relatorio-${type}-${date}.${extension}`
}

/**
 * Calcula período baseado em string de período
 */
export function calculatePeriodDates(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date()
  let startDate = new Date()

  switch (period) {
    case '7d':
      startDate.setDate(endDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(endDate.getDate() - 30)
      break
    case '90d':
      startDate.setDate(endDate.getDate() - 90)
      break
    case 'month':
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      break
    case 'quarter':
      const quarter = Math.floor(endDate.getMonth() / 3)
      startDate = new Date(endDate.getFullYear(), quarter * 3, 1)
      break
    case 'year':
      startDate = new Date(endDate.getFullYear(), 0, 1)
      break
    default:
      startDate.setDate(endDate.getDate() - 30) // Default: 30 dias
  }

  return { startDate, endDate }
}

/**
 * Formata duração em dias
 */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || isNaN(days)) {
    return '-'
  }
  if (days === 1) return '1 dia'
  return `${Math.round(days)} dias`
}

/**
 * Formata ROAS
 */
export function formatROAS(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00x'
  }
  return `${value.toFixed(2)}x`
}

/**
 * Calcula variação percentual entre dois valores (atual vs anterior)
 * @param current Valor atual
 * @param previous Valor do período anterior
 * @returns Variação percentual (ex: 20 para +20%, -15 para -15%)
 */
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) {
    // Se anterior é 0, retornar 100 se atual > 0, senão 0
    return current > 0 ? 100 : 0
  }
  // Calcular variação percentual com 1 casa decimal
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

/**
 * Calcula período anterior baseado no período atual
 * @param startDate Data início do período atual
 * @param endDate Data fim do período atual
 * @returns Datas do período anterior com mesma duração
 */
export function calculatePreviousPeriod(
  startDate: Date,
  endDate: Date
): { previousStartDate: Date; previousEndDate: Date } {
  const periodDays = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  
  const previousEndDate = new Date(startDate)
  previousEndDate.setDate(previousEndDate.getDate() - 1)
  
  const previousStartDate = new Date(previousEndDate)
  previousStartDate.setDate(previousStartDate.getDate() - periodDays)
  
  return { previousStartDate, previousEndDate }
}
