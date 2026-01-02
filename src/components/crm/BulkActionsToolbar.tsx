'use client'

// =============================================
// Bulk Actions Toolbar
// src/components/crm/BulkActionsToolbar.tsx
//
// Barra de ações em massa que aparece quando
// contatos são selecionados
// =============================================

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Trash2,
  Tag,
  Download,
  MoreHorizontal,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onDelete: () => void
  onAddTags: (tags: string[]) => void
  onRemoveTags: (tags: string[]) => void
  onExport: () => void
  loading?: boolean
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onAddTags,
  onRemoveTags,
  onExport,
  loading = false,
}: BulkActionsToolbarProps) {
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagAction, setTagAction] = useState<'add' | 'remove'>('add')
  const [tagInput, setTagInput] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const handleTagSubmit = () => {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    if (tags.length === 0) return

    if (tagAction === 'add') {
      onAddTags(tags)
    } else {
      onRemoveTags(tags)
    }
    setTagInput('')
    setShowTagInput(false)
  }

  if (selectedCount === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="sticky top-0 z-20 mb-4"
    >
      <div className="flex items-center justify-between p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl backdrop-blur-sm">
        {/* Left - Selection info */}
        <div className="flex items-center gap-3">
          <button
            onClick={onDeselectAll}
            className="p-1.5 text-primary-400 hover:text-white hover:bg-primary-500/20 rounded-lg transition-colors"
            title="Limpar seleção"
          >
            <X className="w-4 h-4" />
          </button>
          
          <span className="text-sm text-primary-300">
            <strong className="text-white">{selectedCount}</strong> de {totalCount} selecionado(s)
          </span>

          {!allSelected && selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="text-sm text-primary-400 hover:text-primary-300 underline"
            >
              Selecionar todos os {totalCount}
            </button>
          )}
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-2">
          {/* Tag Input */}
          <AnimatePresence>
            {showTagInput && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <select
                  value={tagAction}
                  onChange={(e) => setTagAction(e.target.value as 'add' | 'remove')}
                  className="px-2 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white"
                >
                  <option value="add">Adicionar</option>
                  <option value="remove">Remover</option>
                </select>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="tag1, tag2..."
                  className="w-40 px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white placeholder-dark-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
                />
                <button
                  onClick={handleTagSubmit}
                  disabled={!tagInput.trim()}
                  className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white text-sm rounded-lg"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowTagInput(false)}
                  className="p-1.5 text-dark-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!showTagInput && (
            <>
              {/* Tags Button */}
              <button
                onClick={() => setShowTagInput(true)}
                className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 text-white rounded-lg transition-colors"
                title="Gerenciar tags"
              >
                <Tag className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Tags</span>
              </button>

              {/* Export Button */}
              <button
                onClick={onExport}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 text-white rounded-lg transition-colors"
                title="Exportar selecionados"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="text-sm hidden sm:inline">Exportar</span>
              </button>

              {/* Delete Button */}
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                title="Excluir selecionados"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">Excluir</span>
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default BulkActionsToolbar
