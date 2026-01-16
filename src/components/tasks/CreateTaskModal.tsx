// =============================================
// Component: CreateTaskModal
// Modal para criar nova tarefa
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  MessageSquare,
  Video,
  CheckSquare,
  Bell,
  DollarSign,
  Loader2,
  AlertCircle,
} from 'lucide-react'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (params: {
    title: string
    description?: string
    type: string
    priority: string
    due_date: string
    due_time?: string
    reminder_at?: string
    contact_id?: string
    deal_id?: string
  }) => Promise<boolean>
  // Pré-preenchimento
  contactId?: string
  contactName?: string
  dealId?: string
  dealTitle?: string
}

const TASK_TYPES = [
  { value: 'call', label: 'Ligação', icon: Phone, color: 'text-blue-400' },
  { value: 'email', label: 'E-mail', icon: Mail, color: 'text-amber-400' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-400' },
  { value: 'meeting', label: 'Reunião', icon: Video, color: 'text-purple-400' },
  { value: 'task', label: 'Tarefa', icon: CheckSquare, color: 'text-primary-400' },
  { value: 'followup', label: 'Follow-up', icon: Bell, color: 'text-pink-400' },
  { value: 'payment', label: 'Cobrança', icon: DollarSign, color: 'text-emerald-400' },
]

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'bg-dark-500 text-dark-300' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'high', label: 'Alta', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'urgent', label: 'Urgente', color: 'bg-error-500/20 text-error-400' },
]

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreate,
  contactId,
  contactName,
  dealId,
  dealTitle,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('task')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [setReminder, setSetReminder] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState('30')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form quando abrir
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setType('task')
      setPriority('normal')
      setDueTime('')
      setSetReminder(false)
      setReminderMinutes('30')
      setError(null)
      
      // Data padrão: hoje
      const today = new Date().toISOString().split('T')[0]
      setDueDate(today)
    }
  }, [isOpen])

  // =============================================
  // HANDLERS
  // =============================================

  const handleSubmit = async () => {
    setError(null)

    if (!title.trim()) {
      setError('Digite o título da tarefa')
      return
    }

    if (!dueDate) {
      setError('Selecione a data')
      return
    }

    setIsSubmitting(true)

    try {
      // Calcular reminder_at se necessário
      let reminderAt: string | undefined
      if (setReminder && dueDate && dueTime) {
        const dueDateTime = new Date(`${dueDate}T${dueTime}:00`)
        const reminderDate = new Date(dueDateTime.getTime() - parseInt(reminderMinutes) * 60000)
        reminderAt = reminderDate.toISOString()
      }

      const success = await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        due_date: dueDate,
        due_time: dueTime || undefined,
        reminder_at: reminderAt,
        contact_id: contactId,
        deal_id: dealId,
      })

      if (success) {
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar tarefa')
    } finally {
      setIsSubmitting(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen) return null

  const selectedType = TASK_TYPES.find(t => t.value === type)
  const TypeIcon = selectedType?.icon || CheckSquare

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-dark-700">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-dark-700 rounded-xl ${selectedType?.color}`}>
                <TypeIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Nova Tarefa</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Contexto (Contato/Deal) */}
            {(contactName || dealTitle) && (
              <div className="flex flex-wrap gap-2">
                {contactName && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-400 rounded-lg text-sm">
                    <User className="w-3.5 h-3.5" />
                    {contactName}
                  </span>
                )}
                {dealTitle && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success-500/10 text-success-400 rounded-lg text-sm">
                    <DollarSign className="w-3.5 h-3.5" />
                    {dealTitle}
                  </span>
                )}
              </div>
            )}

            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Título *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Ligar para confirmar proposta"
                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl 
                           text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 
                           transition-colors"
                autoFocus
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Tipo
              </label>
              <div className="grid grid-cols-4 gap-2">
                {TASK_TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        type === t.value
                          ? 'bg-dark-700 border-primary-500'
                          : 'bg-dark-800 border-dark-600 hover:border-dark-500'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${t.color}`} />
                      <span className="text-xs text-dark-300">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Data e Hora */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1.5" />
                  Data *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl 
                             text-white focus:outline-none focus:border-primary-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-1.5" />
                  Hora
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-xl 
                             text-white focus:outline-none focus:border-primary-500 transition-colors"
                />
              </div>
            </div>

            {/* Prioridade */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
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
                        ? `${p.color} border-current`
                        : 'bg-dark-800 border-dark-600 text-dark-400 hover:border-dark-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lembrete */}
            <div className="flex items-center justify-between p-4 bg-dark-700/50 rounded-xl">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-dark-400" />
                <span className="text-sm text-dark-300">Lembrete</span>
              </div>
              <div className="flex items-center gap-3">
                {setReminder && (
                  <select
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(e.target.value)}
                    className="px-3 py-1.5 bg-dark-600 border border-dark-500 rounded-lg 
                               text-sm text-white focus:outline-none"
                  >
                    <option value="15">15 min antes</option>
                    <option value="30">30 min antes</option>
                    <option value="60">1 hora antes</option>
                    <option value="1440">1 dia antes</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setSetReminder(!setReminder)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    setReminder ? 'bg-primary-500' : 'bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      setReminder ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Descrição (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes adicionais..."
                rows={3}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl 
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
                className="flex-1 py-3 bg-dark-700 text-dark-300 rounded-xl 
                           hover:bg-dark-600 hover:text-white transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim() || !dueDate}
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
                  'Criar Tarefa'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default CreateTaskModal
