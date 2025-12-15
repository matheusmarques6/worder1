'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, GripVertical, Trash2 } from 'lucide-react'
import type { Pipeline, PipelineStage } from '@/types'

interface StageInput {
  id?: string
  name: string
  color: string
  position: number
}

interface PipelineModalProps {
  isOpen: boolean
  pipeline?: Pipeline | null
  onClose: () => void
  onSave: (data: { name: string; description?: string; stages: StageInput[] }) => Promise<void>
}

const defaultColors = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
]

const defaultStages: StageInput[] = [
  { name: 'Lead', color: '#6366f1', position: 0 },
  { name: 'Qualificado', color: '#8b5cf6', position: 1 },
  { name: 'Proposta', color: '#a855f7', position: 2 },
  { name: 'Negociação', color: '#f59e0b', position: 3 },
  { name: 'Fechado Ganho', color: '#22c55e', position: 4 },
  { name: 'Fechado Perdido', color: '#ef4444', position: 5 },
]

export function PipelineModal({ isOpen, pipeline, onClose, onSave }: PipelineModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages] = useState<StageInput[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!pipeline

  useEffect(() => {
    if (isOpen) {
      if (pipeline) {
        setName(pipeline.name)
        setDescription(pipeline.description || '')
        setStages(
          pipeline.stages?.map((s, i) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            position: i,
          })) || defaultStages
        )
      } else {
        setName('')
        setDescription('')
        setStages([...defaultStages])
      }
      setError(null)
    }
  }, [pipeline, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Nome do pipeline é obrigatório')
      return
    }

    if (stages.length < 2) {
      setError('Pipeline precisa ter pelo menos 2 estágios')
      return
    }

    if (stages.some(s => !s.name.trim())) {
      setError('Todos os estágios precisam ter nome')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onSave({ name, description, stages })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pipeline')
    } finally {
      setLoading(false)
    }
  }

  const addStage = () => {
    const newPosition = stages.length
    setStages([
      ...stages,
      {
        name: `Estágio ${newPosition + 1}`,
        color: defaultColors[newPosition % defaultColors.length],
        position: newPosition,
      },
    ])
  }

  const updateStage = (index: number, data: Partial<StageInput>) => {
    setStages(stages.map((s, i) => (i === index ? { ...s, ...data } : s)))
  }

  const removeStage = (index: number) => {
    if (stages.length <= 2) return
    setStages(
      stages
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, position: i }))
    )
  }

  const moveStage = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === stages.length - 1)
    ) {
      return
    }

    const newStages = [...stages]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]]
    
    setStages(newStages.map((s, i) => ({ ...s, position: i })))
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-800">
                <h2 className="text-lg font-semibold text-white">
                  {isEditing ? 'Editar Pipeline' : 'Novo Pipeline'}
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {/* Pipeline Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Nome do Pipeline *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    placeholder="Ex: Vendas, Suporte, Onboarding"
                    required
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    placeholder="Descrição opcional do pipeline"
                  />
                </div>

                {/* Stages */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-slate-300">
                      Estágios ({stages.length})
                    </label>
                    <button
                      type="button"
                      onClick={addStage}
                      className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar
                    </button>
                  </div>

                  <div className="space-y-2">
                    {stages.map((stage, index) => (
                      <div
                        key={stage.id || `new-${index}`}
                        className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl group"
                      >
                        {/* Drag Handle / Position */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveStage(index, 'up')}
                            disabled={index === 0}
                            className="p-0.5 text-slate-600 hover:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(index, 'down')}
                            disabled={index === stages.length - 1}
                            className="p-0.5 text-slate-600 hover:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* Position Number */}
                        <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                          {index + 1}
                        </span>
                        
                        {/* Color Picker */}
                        <div className="relative">
                          <input
                            type="color"
                            value={stage.color}
                            onChange={(e) => updateStage(index, { color: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            style={{ backgroundColor: stage.color }}
                          />
                        </div>

                        {/* Stage Name */}
                        <input
                          type="text"
                          value={stage.name}
                          onChange={(e) => updateStage(index, { name: e.target.value })}
                          className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                          placeholder="Nome do estágio"
                        />

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeStage(index)}
                          disabled={stages.length <= 2}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
                          title={stages.length <= 2 ? 'Mínimo 2 estágios' : 'Remover estágio'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    Mínimo de 2 estágios. Use as setas para reordenar.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:opacity-90 text-white font-medium transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando...
                    </>
                  ) : isEditing ? (
                    'Salvar Alterações'
                  ) : (
                    'Criar Pipeline'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
