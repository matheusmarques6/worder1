'use client'

// =============================================
// Bulk Delete Contacts Modal
// src/components/crm/BulkDeleteModal.tsx
//
// Modal de confirmação para exclusão em massa
// com preview do que será afetado
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  AlertTriangle,
  Trash2,
  Users,
  Briefcase,
  MessageCircle,
  Activity,
  Loader2,
  CheckCircle,
} from 'lucide-react'

interface BulkDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: DeleteOptions) => Promise<void>
  selectedCount: number
  contactIds: string[]
  organizationId: string
}

interface DeleteOptions {
  deleteDeals: boolean
  deleteConversations: boolean
}

interface Preview {
  contactsCount: number
  dealsCount: number
  conversationsCount: number
  activitiesCount: number
}

export function BulkDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  contactIds,
  organizationId,
}: BulkDeleteModalProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteDeals, setDeleteDeals] = useState(false)
  const [deleteConversations, setDeleteConversations] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Carregar preview quando modal abre
  useEffect(() => {
    if (isOpen && contactIds.length > 0) {
      loadPreview()
    } else {
      // Reset state
      setPreview(null)
      setConfirmText('')
      setDeleteDeals(false)
      setDeleteConversations(false)
      setError(null)
      setSuccess(false)
    }
  }, [isOpen, contactIds])

  const loadPreview = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/contacts/bulk?organizationId=${organizationId}&contactIds=${contactIds.join(',')}`
      )
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar preview')
      }

      setPreview(data.preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirmText !== 'EXCLUIR') {
      setError('Digite EXCLUIR para confirmar')
      return
    }

    setDeleting(true)
    setError(null)

    try {
      await onConfirm({
        deleteDeals,
        deleteConversations,
      })
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  const canDelete = confirmText === 'EXCLUIR' && !deleting && !loading

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-dark-700 bg-red-500/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Excluir {selectedCount} Contato{selectedCount > 1 ? 's' : ''}
                </h2>
                <p className="text-sm text-red-400">
                  Esta ação não pode ser desfeita
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={deleting}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Success State */}
            {success && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="p-4 bg-green-500/20 rounded-full mb-4">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                </div>
                <p className="text-lg font-medium text-white">
                  Contatos excluídos com sucesso!
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && !success && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
              </div>
            )}

            {/* Preview */}
            {!loading && !success && preview && (
              <>
                {/* Warning */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-sm text-amber-300">
                    <strong>Atenção:</strong> Esta ação irá excluir permanentemente os contatos selecionados
                    e todos os dados associados que você escolher abaixo.
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-primary-400" />
                      <span className="text-sm text-dark-400">Contatos</span>
                    </div>
                    <p className="text-xl font-bold text-white">{preview.contactsCount}</p>
                  </div>

                  <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-dark-400">Deals</span>
                    </div>
                    <p className="text-xl font-bold text-white">{preview.dealsCount}</p>
                  </div>

                  <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-dark-400">Conversas</span>
                    </div>
                    <p className="text-xl font-bold text-white">{preview.conversationsCount}</p>
                  </div>

                  <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-dark-400">Atividades</span>
                    </div>
                    <p className="text-xl font-bold text-white">{preview.activitiesCount}</p>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-dark-300">Opções de exclusão:</p>
                  
                  <label className="flex items-center gap-3 p-3 bg-dark-800/50 border border-dark-700 rounded-xl cursor-pointer hover:bg-dark-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={deleteDeals}
                      onChange={(e) => setDeleteDeals(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-white">Excluir deals associados</p>
                      <p className="text-xs text-dark-500">
                        {deleteDeals 
                          ? `${preview.dealsCount} deal(s) serão excluídos`
                          : 'Deals serão mantidos, apenas desvinculados'
                        }
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-dark-800/50 border border-dark-700 rounded-xl cursor-pointer hover:bg-dark-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={deleteConversations}
                      onChange={(e) => setDeleteConversations(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-white">Excluir conversas WhatsApp</p>
                      <p className="text-xs text-dark-500">
                        {deleteConversations 
                          ? `${preview.conversationsCount} conversa(s) e mensagens serão excluídas`
                          : 'Conversas serão mantidas, apenas desvinculadas'
                        }
                      </p>
                    </div>
                  </label>
                </div>

                {/* Confirmation Input */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Digite <span className="text-red-400 font-bold">EXCLUIR</span> para confirmar:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="EXCLUIR"
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {!success && (
            <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
              <button
                onClick={onClose}
                disabled={deleting}
                className="px-4 py-2.5 text-dark-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Excluir Contatos
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default BulkDeleteModal
