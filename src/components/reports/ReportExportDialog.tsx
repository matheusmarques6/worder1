'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
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

  const { isExporting, downloadReport } = useReportExport({
    onSuccess: (type) => {
      setOpen(false)
      onSuccess?.(type)
    },
  })

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
    <Button variant="outline">
      <FileDown className="mr-2 h-4 w-4" />
      Exportar Relatório
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Relatório PDF</DialogTitle>
          <DialogDescription>
            Selecione o tipo de relatório e o período desejado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Tipo de Relatório */}
          <div className="grid gap-2">
            <Label htmlFor="report-type">Tipo de Relatório</Label>
            <Select 
              value={selectedType} 
              onValueChange={(v) => setSelectedType(v as ReportType)}
            >
              <SelectTrigger id="report-type">
                <SelectValue placeholder="Selecione o relatório" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.type} value={opt.type}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Período */}
          <div className="grid gap-2">
            <Label htmlFor="period">Período</Label>
            <Select 
              value={selectedPeriod} 
              onValueChange={(v) => setSelectedPeriod(v as PeriodOption)}
            >
              <SelectTrigger id="period">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plataforma de Ads (condicional) */}
          {selectedType === 'ads' && (
            <div className="grid gap-2">
              <Label htmlFor="platform">Plataforma de Ads</Label>
              <Select 
                value={selectedPlatform} 
                onValueChange={(v) => setSelectedPlatform(v as AdsPlatform)}
              >
                <SelectTrigger id="platform">
                  <SelectValue placeholder="Selecione a plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {ADS_PLATFORM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Exportar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
