'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Trophy, XCircle, AlertTriangle } from 'lucide-react'
import type { PipelineStage } from '@/types'

interface EditStageModalProps {
  isOpen: boolean
  stage: PipelineStage | null
  totalStages: number
  onClose: () => void
  onSave: (stageId: string, data: { name: string; color: string; probability?: number; is_won?: boolean; is_lost?: boolean }) => Promise<void>
  onDelete: (stageId: string) => Promise<void>
}

const stageColors = [
  '#f97316', '#ea580c', '#eab308', '#facc15',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#ef4444',
]

export function EditStageModal({ 
  isOpen, 
  stage, 
  totalStages,
  onClose, 
  onSave, 
  onDelete 
}: EditStageModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#f97316')
  const [probability, setProbability] = useState(50)
  const [isWon, setIsWon] = useState(false)
  const [isLost, setIsLost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && stage) {
      setName(stage.name)
      setColor(stage.color)
      setProbability(stage.probability ?? 50)
      setIsWon(stage.is_won ?? false)
      setIsLost(stage.is_lost ?? false)
      setError(null)
    }
  }, [stage, isOpen])

  // Auto-adjust probability when is_won/is_lost changes
  const handleIsWonChange = (checked: boolean) => {
    setIsWon(checked)
    if (checked) {
      setIsLost(false)
      setProbability(100)
    }
  }

  const handleIsLostChange = (checked: boolean) => {
    setIsLost(checked)
    if (checked) {
      setIsWon(false)
      setProbability(0)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Nome do estágio é obrigatório')
      return
    }

    if (!stage) return

    setLoading(true)
    setError(null)

    try {
      await onSave(stage.id, { name, color, probability, is_won: isWon, is_lost: isLost })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar estágio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!stage) return
    
    if (totalStages <= 2) {
      setError('Pipeline precisa ter pelo menos 2 estágios')
      return
    }

    if (!confirm(`Tem certeza que deseja excluir o estágio "${stage.name}"? Deals neste estágio serão afetados.`)) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onDelete(stage.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir estágio')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && stage && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
            >
              <form onSubmit={handleSubmit}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-dark-700">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <h2 className="text-lg font-semibold text-white">
                      Editar Estágio
                    </h2>
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
                <div className="p-5 space-y-5">
                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Stage Name */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Nome do Estágio *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                      placeholder="Ex: Lead, Qualificado, Proposta"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Stage Color */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Cor do Estágio
                    </label>
                    <div className="flex items-center gap-3">
                      {/* Color Preview */}
                      <div 
                        className="w-10 h-10 rounded-lg border-2 border-dark-600 flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {/* Color Grid */}
                      <div className="flex flex-wrap gap-2">
                        {stageColors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={`w-7 h-7 rounded-lg transition-all ${
                              color === c 
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-900 scale-110' 
                                : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Probability */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Probabilidade de Fechamento
                    </label>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={probability}
                          onChange={(e) => setProbability(Number(e.target.value))}
                          disabled={isWon || isLost}
                          className="flex-1 h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500 disabled:opacity-50"
                        />
                        <div className="flex items-center gap-1 min-w-[60px]">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={probability}
                            onChange={(e) => setProbability(Math.min(100, Math.max(0, Number(e.target.value))))}
                            disabled={isWon || isLost}
                            className="w-14 px-2 py-1 bg-dark-800 border border-dark-700 rounded-lg text-white text-center text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50"
                          />
                          <span className="text-dark-400 text-sm">%</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-dark-500">
                        <span>0% (Perdido)</span>
                        <span>50% (Em aberto)</span>
                        <span>100% (Ganho)</span>
                      </div>
                    </div>
                    <p className="text-xs text-dark-500 mt-2">
                      Usado para calcular o valor ponderado do pipeline (Forecast)
                    </p>
                  </div>

                  {/* ==========================================
                      STAGE TYPE - Is Won / Is Lost
                      ========================================== */}
                  <div className="pt-4 border-t border-dark-700">
                    <label className="block text-sm font-medium text-dark-300 mb-3">
                      Tipo de Estágio (Automação)
                    </label>
                    
                    <div className="space-y-3">
                      {/* Is Won */}
                      <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isWon 
                          ? 'border-green-500/50 bg-green-500/10' 
                          : 'border-dark-700 bg-dark-800/30 hover:border-dark-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isWon}
                          onChange={(e) => handleIsWonChange(e.target.checked)}
                          className="w-5 h-5 rounded border-dark-600 bg-dark-700 text-green-500 focus:ring-green-500 focus:ring-offset-dark-900"
                        />
                        <Trophy className={`w-5 h-5 ${isWon ? 'text-green-400' : 'text-dark-500'}`} />
                        <div className="flex-1">
                          <span className={`font-medium ${isWon ? 'text-green-400' : 'text-white'}`}>
                            Estágio de Ganho
                          </span>
                          <p className="text-xs text-dark-400 mt-0.5">
                            Deals movidos para cá serão marcados como "Ganho" automaticamente
                          </p>
                        </div>
                      </label>

                      {/* Is Lost */}
                      <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isLost 
                          ? 'border-red-500/50 bg-red-500/10' 
                          : 'border-dark-700 bg-dark-800/30 hover:border-dark-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isLost}
                          onChange={(e) => handleIsLostChange(e.target.checked)}
                          className="w-5 h-5 rounded border-dark-600 bg-dark-700 text-red-500 focus:ring-red-500 focus:ring-offset-dark-900"
                        />
                        <XCircle className={`w-5 h-5 ${isLost ? 'text-red-400' : 'text-dark-500'}`} />
                        <div className="flex-1">
                          <span className={`font-medium ${isLost ? 'text-red-400' : 'text-white'}`}>
                            Estágio de Perda
                          </span>
                          <p className="text-xs text-dark-400 mt-0.5">
                            Deals movidos para cá serão marcados como "Perdido" automaticamente
                          </p>
                        </div>
                      </label>
                    </div>

                    {(isWon || isLost) && (
                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">
                          {isWon 
                            ? 'Quando um deal for movido para este estágio, ele será automaticamente marcado como "Ganho" com a data de hoje.'
                            : 'Quando um deal for movido para este estágio, ele será automaticamente marcado como "Perdido" com a data de hoje.'
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Stage Info */}
                  <div className="p-3 bg-dark-800/30 rounded-lg text-xs text-dark-400">
                    <p><strong>Posição:</strong> {stage.position + 1}º estágio</p>
                    {stage.deal_count !== undefined && (
                      <p><strong>Deals:</strong> {stage.deal_count} deal(s) neste estágio</p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-5 border-t border-dark-700 bg-dark-900/50">
                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={loading || totalStages <= 2}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={totalStages <= 2 ? 'Mínimo 2 estágios' : 'Excluir estágio'}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir</span>
                  </button>

                  <div className="flex items-center gap-3">
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
                      disabled={loading || !name.trim()}
                      className="px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary-500/20"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
