'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  Calendar,
  Clock,
  Check,
  MessageSquare,
  Building2
} from 'lucide-react'
import { ContactSelector } from './ContactSelector'
import { DealTimeline } from './DealTimeline'
import type { Deal, PipelineStage } from '@/types'

interface DealDrawerProps {
  deal: Deal | null
  stages: PipelineStage[]
  onClose: () => void
  onUpdate: (id: string, data: Partial<Deal>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value)
}

export function DealDrawer({ deal, stages, onClose, onUpdate, onDelete }: DealDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDeal, setEditedDeal] = useState<Partial<Deal>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (deal) {
      setEditedDeal({
        title: deal.title,
        value: deal.value,
        probability: deal.probability,
        expected_close_date: deal.expected_close_date,
        notes: deal.notes,
        contact_id: deal.contact_id,
        commit_level: deal.commit_level || 'pipeline',
      })
      setIsEditing(false)
      setShowDeleteConfirm(false)
    }
  }, [deal])

  if (!deal) return null

  const currentStage = stages.find(s => s.id === deal.stage_id)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(deal.id, editedDeal)
      setIsEditing(false)
    } catch (error) {
      console.error('Erro ao salvar:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(deal.id)
      onClose()
    } catch (error) {
      console.error('Erro ao deletar:', error)
    } finally {
      setDeleting(false)
    }
  }

  const handleStageChange = async (stageId: string) => {
    try {
      await onUpdate(deal.id, { stage_id: stageId } as Partial<Deal>)
    } catch (error) {
      console.error('Erro ao mudar estágio:', error)
    }
  }

  const getContactInitials = () => {
    const first = deal.contact?.first_name?.[0] || ''
    const last = deal.contact?.last_name?.[0] || ''
    return (first + last).toUpperCase() || '?'
  }

  const getContactName = () => {
    if (deal.contact?.first_name || deal.contact?.last_name) {
      return `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim()
    }
    return deal.contact?.email || 'Sem nome'
  }

  return (
    <AnimatePresence>
      {deal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-xl bg-dark-900 border-l border-dark-700 shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-dark-700">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentStage?.color || '#f97316' }}
                />
                <h2 className="text-lg font-semibold text-white">
                  {isEditing ? 'Editando Deal' : 'Detalhes do Deal'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-dark-400 hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-dark-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Salvar
                        </>
                      )}
                    </button>
                  </>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title */}
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedDeal.title || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, title: e.target.value })}
                    className="w-full text-xl font-bold bg-dark-800/50 border border-dark-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-500 transition-colors"
                    placeholder="Título do deal"
                  />
                ) : (
                  <h3 className="text-xl font-bold text-white">{deal.title}</h3>
                )}
              </div>

              {/* Stage Selector */}
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Estágio</label>
                <div className="flex flex-wrap gap-2">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => handleStageChange(stage.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        deal.stage_id === stage.id
                          ? 'text-white shadow-lg'
                          : 'bg-dark-800/50 text-dark-400 hover:bg-dark-700/50'
                      }`}
                      style={
                        deal.stage_id === stage.id
                          ? { backgroundColor: stage.color }
                          : undefined
                      }
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value & Probability */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-400 mb-2">Valor</label>
                  {isEditing ? (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm">R$</span>
                      <input
                        type="number"
                        value={editedDeal.value || ''}
                        onChange={(e) => setEditedDeal({ ...editedDeal, value: Number(e.target.value) || 0 })}
                        className="w-full pl-10 pr-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-success-400">{formatCurrency(deal.value)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-400 mb-2">Probabilidade</label>
                  {isEditing ? (
                    <div className="relative">
                      <input
                        type="number"
                        value={editedDeal.probability || ''}
                        onChange={(e) => setEditedDeal({ ...editedDeal, probability: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                        placeholder="50"
                        min="0"
                        max="100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-300"
                          style={{ width: `${deal.probability}%` }}
                        />
                      </div>
                      <span className="text-lg font-semibold text-white">{deal.probability}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expected Close Date */}
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Data de Fechamento Esperada
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedDeal.expected_close_date || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, expected_close_date: e.target.value })}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors"
                  />
                ) : (
                  <p className="text-white">
                    {deal.expected_close_date
                      ? new Date(deal.expected_close_date).toLocaleDateString('pt-BR')
                      : 'Não definida'}
                  </p>
                )}
              </div>

              {/* Commit Level */}
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">
                  Nível de Comprometimento (Forecast)
                </label>
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'omit', label: 'Omitir', color: 'bg-dark-600', desc: 'Não incluir no forecast' },
                      { value: 'pipeline', label: 'Pipeline', color: 'bg-yellow-500', desc: 'Deal padrão' },
                      { value: 'best_case', label: 'Best Case', color: 'bg-blue-500', desc: 'Cenário otimista' },
                      { value: 'commit', label: 'Commit', color: 'bg-green-500', desc: 'Praticamente garantido' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setEditedDeal({ ...editedDeal, commit_level: option.value })}
                        className={`p-3 rounded-xl border transition-all text-left ${
                          editedDeal.commit_level === option.value
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3 h-3 rounded-full ${option.color}`} />
                          <span className="text-sm font-medium text-white">{option.label}</span>
                        </div>
                        <p className="text-xs text-dark-400">{option.desc}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      deal.commit_level === 'commit' ? 'bg-green-500' :
                      deal.commit_level === 'best_case' ? 'bg-blue-500' :
                      deal.commit_level === 'omit' ? 'bg-dark-600' :
                      'bg-yellow-500'
                    }`} />
                    <span className="text-white">
                      {deal.commit_level === 'commit' ? 'Commit' :
                       deal.commit_level === 'best_case' ? 'Best Case' :
                       deal.commit_level === 'omit' ? 'Omitido' :
                       'Pipeline'}
                    </span>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Contato</label>
                {isEditing ? (
                  <ContactSelector
                    selectedId={editedDeal.contact_id}
                    onSelect={(contactId) => setEditedDeal({ ...editedDeal, contact_id: contactId })}
                  />
                ) : deal.contact ? (
                  <div className="p-4 bg-dark-800/30 border border-dark-700/50 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">{getContactInitials()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{getContactName()}</p>
                        {deal.contact.company && (
                          <p className="text-sm text-dark-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {deal.contact.company}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {deal.contact.email && (
                          <a
                            href={`mailto:${deal.contact.email}`}
                            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                            title={deal.contact.email}
                          >
                            <Mail className="w-5 h-5" />
                          </a>
                        )}
                        {deal.contact.phone && (
                          <a
                            href={`tel:${deal.contact.phone}`}
                            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                            title={deal.contact.phone}
                          >
                            <Phone className="w-5 h-5" />
                          </a>
                        )}
                        {deal.contact.whatsapp && (
                          <a
                            href={`https://wa.me/${deal.contact.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-success-500 hover:bg-success-600 text-white transition-colors"
                            title={deal.contact.whatsapp}
                          >
                            <MessageSquare className="w-5 h-5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-dark-500">Nenhum contato vinculado</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Notas</label>
                {isEditing ? (
                  <textarea
                    value={editedDeal.notes || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, notes: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 resize-none transition-colors"
                    placeholder="Adicione notas sobre este deal..."
                  />
                ) : (
                  <p className="text-dark-300 whitespace-pre-wrap">
                    {deal.notes || 'Nenhuma nota adicionada'}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t border-dark-700">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-dark-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Criado em
                    </p>
                    <p className="text-dark-300">
                      {new Date(deal.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-dark-500">Última atualização</p>
                    <p className="text-dark-300">
                      {new Date(deal.updated_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stage History Timeline */}
              <div className="pt-4 border-t border-dark-700">
                <h3 className="text-sm font-medium text-dark-400 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Histórico de Estágios
                </h3>
                <DealTimeline dealId={deal.id} />
              </div>
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-10"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-sm w-full"
                  >
                    <h3 className="text-lg font-semibold text-white mb-2">Excluir deal?</h3>
                    <p className="text-dark-400 mb-6">
                      Esta ação não pode ser desfeita. O deal "{deal.title}" será permanentemente excluído.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deleting}
                        className="flex-1 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-white transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {deleting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Excluindo...
                          </>
                        ) : (
                          'Excluir'
                        )}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
