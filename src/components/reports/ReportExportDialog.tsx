'use client'

import { useState, useEffect, useRef } from 'react'
import { FileDown, Loader2, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useReportExport } from './useReportExport'
import type { ReportType, PeriodOption, AdsPlatform } from './types'
import { REPORT_OPTIONS, PERIOD_OPTIONS, ADS_PLATFORM_OPTIONS } from './types'

interface ReportExportDialogProps {
  /** Tipos de relatório disponíveis */
  availableTypes?: ReportType[]
  /** ID da loja */
  storeId?: string
  /** ID do pipeline */
  pipelineId?: string
  /** Período inicial */
  defaultPeriod?: PeriodOption
  /** Plataforma de ads inicial */
  defaultPlatform?: AdsPlatform
  /** Elemento trigger (default: botão) */
  trigger?: React.ReactNode
  /** Callback após sucesso */
  onSuccess?: (type: ReportType) => void
}

/**
 * Dialog modal para exportação de relatórios com opções
 */
export function ReportExportDialog({
  availableTypes,
  storeId,
  pipelineId,
  defaultPeriod = '30d',
  defaultPlatform = 'meta',
  trigger,
  onSuccess,
}: ReportExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<ReportType>('general')
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(defaultPeriod)
  const [selectedPlatform, setSelectedPlatform] = useState<AdsPlatform>(defaultPlatform)
  const modalRef = useRef<HTMLDivElement>(null)

  const { isExporting, downloadReport } = useReportExport({
    onSuccess: (type) => {
      setOpen(false)
      onSuccess?.(type)
    },
  })

  // Fechar com ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = 'unset'
    }
  }, [open])

  const options = availableTypes
    ? REPORT_OPTIONS.filter(opt => availableTypes.includes(opt.type))
    : REPORT_OPTIONS

  const handleExport = async () => {
    await downloadReport({
      type: selectedType,
      storeId,
      pipelineId,
      period: selectedPeriod,
      platform: selectedType === 'ads' ? selectedPlatform : undefined,
    })
  }

  const defaultTrigger = (
    <Button variant="secondary" leftIcon={<FileDown className="w-4 h-4" />}>
      Exportar Relatório
    </Button>
  )

  return (
    <>
      {/* Trigger */}
      <div onClick={() => setOpen(true)}>
        {trigger || defaultTrigger}
      </div>

      {/* Modal Backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          
          {/* Modal */}
          <div 
            ref={modalRef}
            className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
              <div>
                <h2 className="text-lg font-semibold text-dark-100">Exportar Relatório PDF</h2>
                <p className="text-sm text-dark-400 mt-0.5">Selecione o tipo e período</p>
              </div>
              <button 
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-dark-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Tipo de Relatório */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Tipo de Relatório
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as ReportType)}
                  className={cn(
                    "w-full bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3",
                    "text-dark-100 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20",
                    "transition-all duration-300"
                  )}
                >
                  {options.map((opt) => (
                    <option key={opt.type} value={opt.type}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Período */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Período
                </label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value as PeriodOption)}
                  className={cn(
                    "w-full bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3",
                    "text-dark-100 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20",
                    "transition-all duration-300"
                  )}
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Plataforma de Ads (condicional) */}
              {selectedType === 'ads' && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Plataforma de Ads
                  </label>
                  <select
                    value={selectedPlatform}
                    onChange={(e) => setSelectedPlatform(e.target.value as AdsPlatform)}
                    className={cn(
                      "w-full bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3",
                      "text-dark-100 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20",
                      "transition-all duration-300"
                    )}
                  >
                    {ADS_PLATFORM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-700 bg-dark-800/50">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button 
                variant="primary" 
                onClick={handleExport} 
                disabled={isExporting}
                leftIcon={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              >
                {isExporting ? 'Gerando...' : 'Exportar PDF'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
