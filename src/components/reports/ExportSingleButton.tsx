'use client'

import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  /** Tamanho do botão */
  size?: 'sm' | 'md' | 'lg'
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
  variant = 'secondary',
  size = 'md',
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
      leftIcon={showIcon ? (
        isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />
      ) : undefined}
    >
      {isExporting ? 'Gerando...' : label}
    </Button>
  )
}
