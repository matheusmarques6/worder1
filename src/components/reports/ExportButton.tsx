'use client'

import { useState, useRef, useEffect } from 'react'
import { FileDown, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
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
  variant?: 'primary' | 'secondary' | 'ghost'
  /** Tamanho do botão */
  size?: 'sm' | 'md' | 'lg'
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
  variant = 'secondary',
  size = 'md',
  className,
  onSuccess,
  onError,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const { isExporting, exportingType, downloadReport } = useReportExport({
    onSuccess: (type) => {
      setOpen(false)
      onSuccess?.(type)
    },
    onError,
  })

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

    if (type === 'ads') {
      params.platform = platform
    }

    await downloadReport(params)
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <Button 
        variant={variant} 
        size={size} 
        className={className}
        disabled={isExporting}
        onClick={() => setOpen(!open)}
        leftIcon={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        rightIcon={<ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />}
      >
        Exportar PDF
      </Button>
      
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-dark-800 border border-dark-600 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-dark-600">
            <span className="text-xs font-medium text-dark-400">Escolha o relatório</span>
          </div>
          
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.type}
                onClick={() => handleExport(option.type)}
                disabled={isExporting || option.disabled}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-dark-700 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  {exportingType === option.type ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  ) : (
                    <FileDown className="w-4 h-4 text-dark-400" />
                  )}
                  <span className="text-sm font-medium text-dark-100">{option.label}</span>
                </div>
                {option.description && (
                  <p className="text-xs text-dark-500 mt-0.5 ml-6">
                    {option.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
