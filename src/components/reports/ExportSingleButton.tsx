'use client'

import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useReportExport } from './useReportExport'
import type { ReportType, ReportParams, PeriodOption, AdsPlatform } from './types'

interface ExportSingleButtonProps {
  /** Tipo de relatório a exportar */
  type: ReportType
  /** Label do botão (default: "Exportar PDF") */
  label?: string
  /** ID da loja */
  storeId?: string
  /** ID do pipeline */
  pipelineId?: string
  /** Período */
  period?: PeriodOption
  /** Plataforma de ads */
  platform?: AdsPlatform
  /** Variante do botão */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
  /** Tamanho do botão */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Classe CSS adicional */
  className?: string
  /** Mostrar ícone */
  showIcon?: boolean
  /** Callback após sucesso */
  onSuccess?: () => void
  /** Callback após erro */
  onError?: (error: Error) => void
}

/**
 * Botão simples para exportar um tipo específico de relatório
 */
export function ExportSingleButton({
  type,
  label = 'Exportar PDF',
  storeId,
  pipelineId,
  period = '30d',
  platform = 'meta',
  variant = 'outline',
  size = 'default',
  className,
  showIcon = true,
  onSuccess,
  onError,
}: ExportSingleButtonProps) {
  const { isExporting, downloadReport } = useReportExport({
    onSuccess: () => onSuccess?.(),
    onError,
  })

  const handleExport = async () => {
    const params: ReportParams = {
      type,
      storeId,
      pipelineId,
      period,
    }

    if (type === 'ads') {
      params.platform = platform
    }

    await downloadReport(params)
  }

  return (
    <Button 
      variant={variant} 
      size={size} 
      className={className}
      onClick={handleExport}
      disabled={isExporting}
    >
      {showIcon && (
        isExporting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="mr-2 h-4 w-4" />
        )
      )}
      {isExporting ? 'Gerando...' : label}
    </Button>
  )
}
