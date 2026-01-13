'use client'

import { useState } from 'react'
import { FileDown, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useReportExport } from './useReportExport'
import type { ReportType, ReportParams, PeriodOption, AdsPlatform } from './types'
import { REPORT_OPTIONS } from './types'

interface ExportButtonProps {
  /** Tipos de relatório disponíveis (default: todos) */
  availableTypes?: ReportType[]
  /** ID da loja selecionada */
  storeId?: string
  /** ID do pipeline selecionado */
  pipelineId?: string
  /** Período selecionado */
  period?: PeriodOption
  /** Plataforma de ads selecionada */
  platform?: AdsPlatform
  /** Variante do botão */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  /** Tamanho do botão */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Classe CSS adicional */
  className?: string
  /** Callback após sucesso */
  onSuccess?: (type: ReportType) => void
  /** Callback após erro */
  onError?: (error: Error) => void
}

/**
 * Botão de exportação de relatórios com dropdown
 */
export function ExportButton({
  availableTypes,
  storeId,
  pipelineId,
  period = '30d',
  platform = 'meta',
  variant = 'outline',
  size = 'default',
  className,
  onSuccess,
  onError,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const { isExporting, exportingType, downloadReport } = useReportExport({
    onSuccess: (type) => {
      setOpen(false)
      onSuccess?.(type)
    },
    onError,
  })

  // Filtrar opções disponíveis
  const options = availableTypes
    ? REPORT_OPTIONS.filter(opt => availableTypes.includes(opt.type))
    : REPORT_OPTIONS

  const handleExport = async (type: ReportType) => {
    const params: ReportParams = {
      type,
      storeId,
      pipelineId,
      period,
    }

    // Adicionar platform apenas para ads
    if (type === 'ads') {
      params.platform = platform
    }

    await downloadReport(params)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          size={size} 
          className={className}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          Exportar PDF
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Escolha o relatório</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {options.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => handleExport(option.type)}
            disabled={isExporting || option.disabled}
            className="flex flex-col items-start gap-1 py-2"
          >
            <div className="flex items-center gap-2 w-full">
              {exportingType === option.type ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              <span className="font-medium">{option.label}</span>
            </div>
            {option.description && (
              <span className="text-xs text-muted-foreground ml-6">
                {option.description}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
