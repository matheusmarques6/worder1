'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { X, ArrowRight, Clock, History } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// =============================================
// Types
// =============================================

export interface CategoryChange {
  previous_category: string
  new_category: string
  changed_at: string
}

interface TemplateCategoryHistoryModalProps {
  open: boolean
  onClose: () => void
  templateName: string
  history: CategoryChange[]
}

// =============================================
// Constants
// =============================================

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
  AUTHENTICATION: 'Autenticacao',
}

const CATEGORY_COLORS: Record<string, string> = {
  MARKETING: 'bg-orange-50 text-orange-700 border border-orange-200',
  UTILITY: 'bg-blue-50 text-blue-700 border border-blue-200',
  AUTHENTICATION: 'bg-purple-50 text-purple-700 border border-purple-200',
}

// =============================================
// Component
// =============================================

export function TemplateCategoryHistoryModal({
  open,
  onClose,
  templateName,
  history,
}: TemplateCategoryHistoryModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Historico de Categoria
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{templateName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="p-5 max-h-[400px] overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Nenhuma mudanca de categoria registrada
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" />

              <div className="space-y-4">
                {history.map((change, index) => {
                  const date = new Date(change.changed_at)
                  const formattedDate = date.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                  const formattedTime = date.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  const fromLabel = CATEGORY_LABELS[change.previous_category] || change.previous_category
                  const toLabel = CATEGORY_LABELS[change.new_category] || change.new_category
                  const fromColor = CATEGORY_COLORS[change.previous_category] || 'bg-gray-100 text-gray-500'
                  const toColor = CATEGORY_COLORS[change.new_category] || 'bg-gray-100 text-gray-500'

                  return (
                    <div key={index} className="relative flex gap-4 pl-2">
                      {/* Dot */}
                      <div className="relative z-10 flex-shrink-0 mt-1">
                        <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-gray-400" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full font-medium px-2 py-0.5 text-xs',
                              fromColor
                            )}
                          >
                            {fromLabel}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full font-medium px-2 py-0.5 text-xs',
                              toColor
                            )}
                          >
                            {toLabel}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {formattedDate} as {formattedTime}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default TemplateCategoryHistoryModal
