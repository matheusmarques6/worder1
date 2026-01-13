'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { ReportParams, ReportType } from './types'

interface UseReportExportOptions {
  onSuccess?: (type: ReportType) => void
  onError?: (error: Error) => void
}

interface UseReportExportReturn {
  isExporting: boolean
  exportingType: ReportType | null
  exportReport: (params: ReportParams) => Promise<void>
  downloadReport: (params: ReportParams) => Promise<void>
}

/**
 * Hook para exportar relatórios em PDF
 */
export function useReportExport(options?: UseReportExportOptions): UseReportExportReturn {
  const [isExporting, setIsExporting] = useState(false)
  const [exportingType, setExportingType] = useState<ReportType | null>(null)

  const buildUrl = useCallback((params: ReportParams): string => {
    const baseUrl = `/api/reports/${params.type}`
    const searchParams = new URLSearchParams()

    if (params.storeId) searchParams.set('storeId', params.storeId)
    if (params.pipelineId) searchParams.set('pipelineId', params.pipelineId)
    if (params.period) searchParams.set('period', params.period)
    if (params.platform) searchParams.set('platform', params.platform)
    if (params.startDate) searchParams.set('startDate', params.startDate)
    if (params.endDate) searchParams.set('endDate', params.endDate)

    const queryString = searchParams.toString()
    return queryString ? `${baseUrl}?${queryString}` : baseUrl
  }, [])

  const downloadReport = useCallback(async (params: ReportParams) => {
    setIsExporting(true)
    setExportingType(params.type)

    try {
      const url = buildUrl(params)
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erro ao gerar relatório: ${response.status}`)
      }

      // Extrair nome do arquivo do header ou gerar
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `relatorio-${params.type}-${new Date().toISOString().split('T')[0]}.pdf`
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/)
        if (match) filename = match[1]
      }

      // Criar blob e fazer download
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      window.URL.revokeObjectURL(downloadUrl)

      toast.success('Relatório gerado com sucesso!')
      options?.onSuccess?.(params.type)

    } catch (error) {
      console.error('[REPORT_EXPORT_ERROR]', error)
      const err = error instanceof Error ? error : new Error('Erro desconhecido')
      toast.error(err.message)
      options?.onError?.(err)
    } finally {
      setIsExporting(false)
      setExportingType(null)
    }
  }, [buildUrl, options])

  // Alias para downloadReport
  const exportReport = downloadReport

  return {
    isExporting,
    exportingType,
    exportReport,
    downloadReport,
  }
}
