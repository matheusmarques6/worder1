'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, DollarSign, ChevronDown } from 'lucide-react'

interface Pipeline {
  id: string
  name: string
  stages: Stage[]
}

interface Stage {
  id: string
  name: string
  color: string
  order: number
}

interface CreateDealModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateDeal: (params: {
    pipelineId: string
    stageId: string
    title: string
    value: number
  }) => Promise<any>
  contactName?: string
  contactId: string
}

export function CreateDealModal({
  isOpen,
  onClose,
  onCreateDeal,
  contactName,
  contactId,
}: CreateDealModalProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState('')

  // Carregar pipelines
  useEffect(() => {
    if (!isOpen) return

    async function loadPipelines() {
      setIsFetching(true)
      try {
        const response = await fetch('/api/crm/pipelines')
        const data = await response.json()
        
        if (response.ok && data.pipelines) {
          setPipelines(data.pipelines)
          
          // Selecionar primeiro pipeline por padrão
          if (data.pipelines.length > 0) {
            const firstPipeline = data.pipelines[0]
            setSelectedPipeline(firstPipeline.id)
            
            // Selecionar primeiro stage
            if (firstPipeline.stages?.length > 0) {
              setSelectedStage(firstPipeline.stages[0].id)
            }
          }
        }
      } catch (err) {
        console.error('Error loading pipelines:', err)
        setError('Erro ao carregar pipelines')
      } finally {
        setIsFetching(false)
      }
    }

    loadPipelines()
    
    // Reset form
    setTitle(`Deal - ${contactName || 'Novo'}`)
    setValue('')
    setError('')
  }, [isOpen, contactName])

  // Atualizar stages quando pipeline mudar
  useEffect(() => {
    if (selectedPipeline) {
      const pipeline = pipelines.find(p => p.id === selectedPipeline)
      if (pipeline?.stages && pipeline.stages.length > 0) {
        setSelectedStage(pipeline.stages[0].id)
      }
    }
  }, [selectedPipeline, pipelines])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedPipeline || !selectedStage || !title.trim()) {
      setError('Preencha todos os campos obrigatórios')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await onCreateDeal({
        pipelineId: selectedPipeline,
        stageId: selectedStage,
        title: title.trim(),
        value: parseFloat(value) || 0,
      })
      onClose()
    } catch (err) {
      setError('Erro ao criar deal')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const currentPipeline = pipelines.find(p => p.id === selectedPipeline)
  const stages = currentPipeline?.stages || []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md border border-gray-200 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Criar Novo Deal</h3>
              <p className="text-xs text-gray-500">{contactName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {isFetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
          ) : pipelines.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-gray-500">Nenhum pipeline encontrado</p>
              <p className="text-xs mt-1 text-gray-400">Crie um pipeline no CRM primeiro</p>
            </div>
          ) : (
            <>
              {/* Pipeline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Pipeline *
                </label>
                <div className="relative">
                  <select
                    value={selectedPipeline}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl
                               text-gray-900 appearance-none focus:outline-none focus:border-orange-400"
                  >
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Estágio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Estágio Inicial *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStage(stage.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedStage === stage.id
                          ? 'bg-orange-50 text-orange-600 border-2 border-orange-400'
                          : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:border-gray-300'
                      }`}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Título do Deal *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Proposta de Serviço"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl
                             text-gray-900 placeholder:text-gray-400
                             focus:outline-none focus:border-orange-400"
                />
              </div>

              {/* Valor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Valor (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">R$</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2.5 pl-12 bg-gray-50 border border-gray-200 rounded-xl
                               text-gray-900 placeholder:text-gray-400
                               focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl
                             hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !selectedPipeline || !selectedStage || !title.trim()}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl
                             hover:bg-orange-600 transition-colors font-medium
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Deal'
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

export default CreateDealModal
