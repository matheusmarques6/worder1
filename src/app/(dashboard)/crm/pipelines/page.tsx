'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  GripVertical,
  ChevronRight,
} from 'lucide-react'
import { useDeals, usePipelines } from '@/hooks'
import { PipelineModal } from '@/components/crm'

export default function PipelinesPage() {
  const { pipelines, loading, refetchPipelines } = useDeals()
  const { createPipeline, updatePipeline, deletePipeline } = usePipelines()
  const [showModal, setShowModal] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<any>(null)
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null)

  const handleCreate = async (data: any) => {
    await createPipeline(data)
    await refetchPipelines()
    setShowModal(false)
  }

  const handleUpdate = async (data: any) => {
    if (editingPipeline) {
      await updatePipeline(editingPipeline.id, data)
      await refetchPipelines()
      setEditingPipeline(null)
    }
  }

  const handleDelete = async (pipeline: any) => {
    if (confirm(`Tem certeza que deseja excluir a pipeline "${pipeline.name}"? Todos os deals serão removidos.`)) {
      await deletePipeline(pipeline.id)
      await refetchPipelines()
    }
  }

  if (loading && pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-dark-400">
          {pipelines.length} {pipelines.length === 1 ? 'pipeline' : 'pipelines'}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Pipeline</span>
        </button>
      </div>

      {/* Pipelines List */}
      {pipelines.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Nenhuma pipeline ainda</h3>
          <p className="text-dark-400 mb-4">Crie sua primeira pipeline para começar a gerenciar seus deals</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Pipeline
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {pipelines.map((pipeline) => (
            <div
              key={pipeline.id}
              className="bg-dark-800/30 border border-dark-700/50 rounded-xl overflow-hidden"
            >
              {/* Pipeline Header */}
              <div className="flex items-center gap-4 p-4">
                <button
                  onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                  className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                >
                  <ChevronRight className={`w-5 h-5 transition-transform ${expandedPipeline === pipeline.id ? 'rotate-90' : ''}`} />
                </button>
                
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: pipeline.color || '#f97316' }}
                />
                
                <div className="flex-1">
                  <h3 className="text-white font-medium">{pipeline.name}</h3>
                  <p className="text-dark-400 text-sm">
                    {pipeline.stages?.length || 0} estágios
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingPipeline(pipeline)}
                    className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(pipeline)}
                    className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stages */}
              <AnimatePresence>
                {expandedPipeline === pipeline.id && pipeline.stages && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-dark-700/50 overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {pipeline.stages
                        .sort((a: any, b: any) => a.position - b.position)
                        .map((stage: any, index: number) => (
                          <div
                            key={stage.id}
                            className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg"
                          >
                            <GripVertical className="w-4 h-4 text-dark-500" />
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: stage.color || '#8b5cf6' }}
                            />
                            <span className="text-white flex-1">{stage.name}</span>
                            <span className="text-dark-500 text-sm">
                              Posição {index + 1}
                            </span>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <PipelineModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreate}
      />

      {/* Edit Modal */}
      <PipelineModal
        isOpen={!!editingPipeline}
        pipeline={editingPipeline}
        onClose={() => setEditingPipeline(null)}
        onSave={handleUpdate}
      />
    </div>
  )
}
