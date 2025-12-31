'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, Info } from 'lucide-react'
import { ContactSelector } from './ContactSelector'
import type { PipelineStage, CreateDealData } from '@/types'

interface CreateDealModalProps {
  isOpen: boolean
  pipelineId: string
  stageId: string
  stages: PipelineStage[]
  onClose: () => void
  onCreate: (data: CreateDealData) => Promise<void>
}

export function CreateDealModal({
  isOpen,
  pipelineId,
  stageId,
  stages,
  onClose,
  onCreate,
}: CreateDealModalProps) {
  // Get initial stage probability
  const getStageProb = (sId: string) => {
    const s = stages.find(st => st.id === sId)
    return s?.probability ?? 50
  }

  const [formData, setFormData] = useState<CreateDealData>({
    title: '',
    value: 0,
    probability: getStageProb(stageId),
    stage_id: stageId,
    pipeline_id: pipelineId,
    commit_level: 'pipeline',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens with new stageId
  useEffect(() => {
    if (isOpen) {
      const initialStage = stages.find(s => s.id === stageId)
      setFormData({
        title: '',
        value: 0,
        probability: initialStage?.probability ?? 50,
        stage_id: stageId,
        pipeline_id: pipelineId,
        commit_level: 'pipeline',
      })
      setError(null)
    }
  }, [isOpen, stageId, pipelineId, stages])

  // Handle stage change - inherit probability
  const handleStageChange = (newStageId: string) => {
    const newStage = stages.find(s => s.id === newStageId)
    setFormData({ 
      ...formData, 
      stage_id: newStageId,
      probability: newStage?.probability ?? formData.probability,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      setError('Título é obrigatório')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onCreate(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar deal')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  // Get current stage info
  const currentStage = stages.find(s => s.id === formData.stage_id)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              <form onSubmit={handleSubmit}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-dark-700">
                  <div className="flex items-center gap-3">
                    {currentStage && (
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: currentStage.color }}
                      />
                    )}
                    <h2 className="text-lg font-semibold text-white">Novo Deal</h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Título *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                      placeholder="Ex: Implementação E-commerce"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Stage - Visual selector */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Estágio
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {stages.filter(s => !s.is_won && !s.is_lost).map((stage) => (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => handleStageChange(stage.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            formData.stage_id === stage.id
                              ? 'text-white shadow-lg'
                              : 'bg-dark-800/50 text-dark-400 hover:bg-dark-700/50'
                          }`}
                          style={
                            formData.stage_id === stage.id
                              ? { backgroundColor: stage.color }
                              : undefined
                          }
                        >
                          {stage.name}
                          <span className="ml-1 opacity-70">({stage.probability ?? 50}%)</span>
                        </button>
                      ))}
                    </div>
                    {(currentStage?.is_won || currentStage?.is_lost) && (
                      <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Deals novos não podem ser criados em estágios de ganho/perda
                      </p>
                    )}
                  </div>

                  {/* Value & Probability */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Valor
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">R$</span>
                        <input
                          type="number"
                          value={formData.value || ''}
                          onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) || 0 })}
                          className="w-full pl-10 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                          placeholder="0"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Probabilidade
                        <span className="ml-1 text-xs text-dark-500">(do estágio)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.probability || ''}
                          onChange={(e) => setFormData({ ...formData, probability: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                          className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                          placeholder="50"
                          min="0"
                          max="100"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Commit Level */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Nível de Comprometimento (Forecast)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { value: 'omit', label: 'Omitir', color: 'bg-dark-600' },
                        { value: 'pipeline', label: 'Pipeline', color: 'bg-yellow-500' },
                        { value: 'best_case', label: 'Best Case', color: 'bg-blue-500' },
                        { value: 'commit', label: 'Commit', color: 'bg-green-500' },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, commit_level: option.value })}
                          className={`p-2 rounded-lg border text-center transition-all ${
                            formData.commit_level === option.value
                              ? 'border-primary-500 bg-primary-500/10'
                              : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${option.color} mx-auto mb-1`} />
                          <span className="text-xs text-white">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expected Close Date */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Data de Fechamento Esperada
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                      <input
                        type="date"
                        value={formData.expected_close_date || ''}
                        onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Contact Selector */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Contato
                    </label>
                    <ContactSelector
                      selectedId={formData.contact_id}
                      onSelect={(contactId) => setFormData({ ...formData, contact_id: contactId })}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Notas
                    </label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 resize-none transition-colors"
                      placeholder="Adicione notas sobre este deal..."
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-dark-700 bg-dark-900/50">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 text-white transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !formData.title.trim()}
                    className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors disabled:opacity-50 shadow-lg shadow-primary-500/20"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Criando...
                      </span>
                    ) : (
                      'Criar Deal'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
