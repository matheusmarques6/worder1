'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface DateRange {
  start: string
  end: string
}

export interface RevenueReport {
  total: number
  growth: number
  average_ticket: number
  deals_closed: number
  target: number
  target_progress: number
}

export interface ConversionReport {
  total_leads: number
  qualified_leads: number
  opportunities: number
  deals_won: number
  deals_lost: number
  conversion_rate: number
  qualification_rate: number
  win_rate: number
  average_cycle_days: number
}

export interface ChannelReport {
  channels: Array<{
    name: string
    leads: number
    conversions: number
    revenue: number
    conversion_rate: number
    cost?: number
    roi?: number
  }>
}

export interface ROIReport {
  total_investment: number
  total_return: number
  roi_percentage: number
  cac: number
  ltv: number
  ltv_cac_ratio: number
  payback_months: number
  campaigns: Array<{
    name: string
    investment: number
    return_value: number
    roi: number
    leads_generated: number
    conversions: number
  }>
}

export interface SalesReport {
  by_agent: Array<{
    agent_id: string
    agent_name: string
    leads_assigned: number
    deals_won: number
    deals_lost: number
    revenue: number
    win_rate: number
    average_ticket: number
  }>
  by_product: Array<{
    product_name: string
    units_sold: number
    revenue: number
    average_price: number
  }>
  by_stage: Array<{
    stage_name: string
    deals_count: number
    total_value: number
    average_time_days: number
  }>
}

export interface TrendData {
  date: string
  leads: number
  conversions: number
  revenue: number
}

export interface FullReport {
  revenue?: RevenueReport
  conversions?: ConversionReport
  channels?: ChannelReport
  roi?: ROIReport
  sales?: SalesReport
  trends?: TrendData[]
}

export type ReportPeriod = '7d' | '30d' | '90d' | '1y' | 'mtd' | 'ytd'
export type ReportType = 'all' | 'revenue' | 'conversions' | 'channels' | 'roi' | 'sales' | 'trends'

interface UseReportsOptions {
  organizationId: string
  period?: ReportPeriod
  pipelineId?: string | null
  autoLoad?: boolean
}

interface UseReportsReturn {
  report: FullReport
  dateRange: DateRange | null
  isLoading: boolean
  error: string | null
  period: ReportPeriod
  setPeriod: (period: ReportPeriod) => void
  loadReport: (type?: ReportType) => Promise<void>
  loadRevenueReport: () => Promise<RevenueReport | null>
  loadConversionReport: () => Promise<ConversionReport | null>
  loadChannelReport: () => Promise<ChannelReport | null>
  loadROIReport: () => Promise<ROIReport | null>
  loadSalesReport: () => Promise<SalesReport | null>
  loadTrends: () => Promise<TrendData[]>
  exportReport: (format: 'csv' | 'pdf') => void
}

// =============================================
// Hook
// =============================================

export function useReports({
  organizationId,
  period: initialPeriod = '30d',
  pipelineId,
  autoLoad = true,
}: UseReportsOptions): UseReportsReturn {
  const [report, setReport] = useState<FullReport>({})
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod)

  // =============================================
  // Load Full Report
  // =============================================
  const loadReport = useCallback(async (type: ReportType = 'all') => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type,
        period,
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar relatorio')
      }

      if (type === 'all') {
        setReport(data.report)
      } else {
        setReport(prev => ({ ...prev, ...data.report }))
      }
      setDateRange(data.dateRange)
    } catch (err: any) {
      console.error('[useReports] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, period, pipelineId])

  // =============================================
  // Load Individual Reports
  // =============================================
  const loadRevenueReport = useCallback(async (): Promise<RevenueReport | null> => {
    if (!organizationId) return null

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'revenue',
        period,
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, revenue: data.report.revenue }))
      return data.report.revenue
    } catch (err: any) {
      console.error('[useReports] Revenue error:', err)
      return null
    }
  }, [organizationId, period, pipelineId])

  const loadConversionReport = useCallback(async (): Promise<ConversionReport | null> => {
    if (!organizationId) return null

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'conversions',
        period,
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, conversions: data.report.conversions }))
      return data.report.conversions
    } catch (err: any) {
      console.error('[useReports] Conversion error:', err)
      return null
    }
  }, [organizationId, period, pipelineId])

  const loadChannelReport = useCallback(async (): Promise<ChannelReport | null> => {
    if (!organizationId) return null

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'channels',
        period,
      })

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, channels: data.report.channels }))
      return data.report.channels
    } catch (err: any) {
      console.error('[useReports] Channel error:', err)
      return null
    }
  }, [organizationId, period])

  const loadROIReport = useCallback(async (): Promise<ROIReport | null> => {
    if (!organizationId) return null

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'roi',
        period,
      })

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, roi: data.report.roi }))
      return data.report.roi
    } catch (err: any) {
      console.error('[useReports] ROI error:', err)
      return null
    }
  }, [organizationId, period])

  const loadSalesReport = useCallback(async (): Promise<SalesReport | null> => {
    if (!organizationId) return null

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'sales',
        period,
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, sales: data.report.sales }))
      return data.report.sales
    } catch (err: any) {
      console.error('[useReports] Sales error:', err)
      return null
    }
  }, [organizationId, period, pipelineId])

  const loadTrends = useCallback(async (): Promise<TrendData[]> => {
    if (!organizationId) return []

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'trends',
        period,
      })

      const response = await fetch(`/api/reports?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      setReport(prev => ({ ...prev, trends: data.report.trends }))
      return data.report.trends || []
    } catch (err: any) {
      console.error('[useReports] Trends error:', err)
      return []
    }
  }, [organizationId, period])

  // =============================================
  // Export Report
  // =============================================
  const exportReport = useCallback((format: 'csv' | 'pdf') => {
    // Generate CSV
    if (format === 'csv') {
      const csvRows: string[] = []

      // Revenue section
      if (report.revenue) {
        csvRows.push('RECEITA')
        csvRows.push(`Total,${report.revenue.total}`)
        csvRows.push(`Crescimento,${report.revenue.growth}%`)
        csvRows.push(`Ticket Medio,${report.revenue.average_ticket}`)
        csvRows.push(`Negocios Fechados,${report.revenue.deals_closed}`)
        csvRows.push('')
      }

      // Conversion section
      if (report.conversions) {
        csvRows.push('CONVERSOES')
        csvRows.push(`Total Leads,${report.conversions.total_leads}`)
        csvRows.push(`Leads Qualificados,${report.conversions.qualified_leads}`)
        csvRows.push(`Negocios Ganhos,${report.conversions.deals_won}`)
        csvRows.push(`Taxa de Conversao,${report.conversions.conversion_rate}%`)
        csvRows.push(`Win Rate,${report.conversions.win_rate}%`)
        csvRows.push('')
      }

      // ROI section
      if (report.roi) {
        csvRows.push('ROI')
        csvRows.push(`Investimento,${report.roi.total_investment}`)
        csvRows.push(`Retorno,${report.roi.total_return}`)
        csvRows.push(`ROI,${report.roi.roi_percentage}%`)
        csvRows.push(`CAC,${report.roi.cac}`)
        csvRows.push(`LTV,${report.roi.ltv}`)
        csvRows.push('')
      }

      // Sales by agent
      if (report.sales?.by_agent && report.sales.by_agent.length > 0) {
        csvRows.push('VENDAS POR AGENTE')
        csvRows.push('Agente,Leads,Ganhos,Perdidos,Receita,Win Rate')
        report.sales.by_agent.forEach(agent => {
          csvRows.push(`${agent.agent_name},${agent.leads_assigned},${agent.deals_won},${agent.deals_lost},${agent.revenue},${agent.win_rate}%`)
        })
        csvRows.push('')
      }

      // Download
      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `relatorio-${period}-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }

    // For PDF, you would integrate with a PDF library like jsPDF
    if (format === 'pdf') {
      console.log('PDF export would require jsPDF integration')
      // Could trigger a server-side PDF generation instead
    }
  }, [report, period])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadReport()
    }
  }, [autoLoad, organizationId, period, pipelineId, loadReport])

  return {
    report,
    dateRange,
    isLoading,
    error,
    period,
    setPeriod,
    loadReport,
    loadRevenueReport,
    loadConversionReport,
    loadChannelReport,
    loadROIReport,
    loadSalesReport,
    loadTrends,
    exportReport,
  }
}

export default useReports
