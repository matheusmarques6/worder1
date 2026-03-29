// =============================================
// Component: CreateTicketModal
// Modal para criar novo ticket
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Ticket,
  User,
  Phone,
  Mail,
  Package,
  ShoppingBag,
  AlertCircle,
  Loader2,
} from 'lucide-react'

interface CreateTicketModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (params: {
    title: string
    description?: string
    category: string
    priority: string
    contact_id?: string
    contact_name?: string
    contact_email?: string
    contact_phone?: string
    order_id?: string
    order_number?: string
  }) => Promise<boolean>
  // Pré-preenchimento
  contactId?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  orderId?: string
  orderNumber?: string
}

const CATEGORIES = [
  { value: 'delivery', label: 'Entrega', emoji: '📦' },
  { value: 'payment', label: 'Pagamento', emoji: '💳' },
  { value: 'product', label: 'Produto', emoji: '📱' },
  { value: 'refund', label: 'Reembolso', emoji: '💰' },
  { value: 'question', label: 'Dúvida', emoji: '❓' },
  { value: 'bug', label: 'Problema', emoji: '🐛' },
  { value: 'feature', label: 'Sugestão', emoji: '💡' },
  { value: 'other', label: 'Outro', emoji: '📋' },
]

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'text-gray-500' },
  { value: 'normal', label: 'Normal', color: 'text-blue-400' },
  { value: 'high', label: 'Alta', color: 'text-amber-400' },
  { value: 'urgent', label: 'Urgente', color: 'text-error-400' },
]

export function CreateTicketModal({
  isOpen,
  onClose,
  onCreate,
  contactId,
  contactName,
  contactEmail,
  contactPhone,
  orderId,
  orderNumber,
}: CreateTicketModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('question')
  const [priority, setPriority] = useState('normal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form quando abrir
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setCategory('question')
      setPriority('normal')
      setError(null)
    }
  }, [isOpen])

  // =============================================
  // HANDLERS
  // =============================================

  const handleSubmit = async () => {
    setError(null)

    if (!title.trim()) {
      setError('Digite o título do ticket')
      return
    }

    setIsSubmitting(true)

    try {
      const success = await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        contact_id: contactId,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        order_id: orderId,
        order_number: orderNumber,
      })

      if (success) {
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar ticket')
    } finally {
      setIsSubmitting(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-50 rounded-xl">
                <Ticket className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Novo Ticket</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Contexto */}
            {(contactName || orderNumber) && (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-100 rounded-xl">
                {contactName && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-200 rounded-lg text-sm text-gray-700">
                    <User className="w-3.5 h-3.5 text-brand-600" />
                    {contactName}
                  </span>
                )}
                {contactPhone && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-200 rounded-lg text-sm text-gray-600">
                    <Phone className="w-3.5 h-3.5" />
                    {contactPhone}
                  </span>
                )}
                {contactEmail && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-200 rounded-lg text-sm text-gray-600">
                    <Mail className="w-3.5 h-3.5" />
                    {contactEmail}
                  </span>
                )}
                {orderNumber && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-200 rounded-lg text-sm text-success-400">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Pedido #{orderNumber}
                  </span>
                )}
              </div>
            )}

            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Título *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Produto não chegou no prazo"
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl 
                           text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 
                           transition-colors"
                autoFocus
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Categoria
              </label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                      category === cat.value
                        ? 'bg-gray-100 border-primary-500'
                        : 'bg-white border-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="text-xs text-gray-600">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prioridade */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Prioridade
              </label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-all ${
                      priority === p.value
                        ? `${p.color} bg-gray-100 border-current`
                        : 'bg-white border-gray-300 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Descrição (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o problema ou solicitação em detalhes..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl 
                           text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 
                           resize-none transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-error-500/10 border border-error-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-error-400 shrink-0" />
                <p className="text-sm text-error-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl 
                           hover:bg-gray-200 hover:text-white transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="flex-1 py-3 bg-primary-500 text-white rounded-xl 
                           hover:bg-primary-600 transition-colors font-medium
                           disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar Ticket'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default CreateTicketModal
