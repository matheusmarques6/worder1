'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Phone,
  Mail,
  Calendar,
  Clock,
  Check,
  MessageSquare,
  Building2,
  Trophy,
  XCircle,
  RotateCcw,
  DollarSign,
  TrendingUp,
  Tag,
  FileText,
  ChevronRight,
  Pencil,
  Trash2,
  User,
  ExternalLink,
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

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Avatar colors
const avatarColors = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

export function DealDrawer({ deal, stages, onClose, onUpdate, onDelete }: DealDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDeal, setEditedDeal] = useState<Partial<Deal>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info')

  useEffect(() => {
    if (deal) {
      setEditedDeal({
        title: deal.title,
        value: deal.value,
        probability: deal.probability,
        expected_close_date: deal.expected_close_date,
        notes: deal.notes,
        contact_id: deal.contact_id,
      })
      setIsEditing(false)
      setShowDeleteConfirm(false)
      setShowLostModal(false)
      setLostReason('')
      setActiveTab('info')
    }
  }, [deal])

  if (!deal) return null

  const currentStage = stages.find(s => s.id === deal.stage_id)
  const contactName = deal.contact
    ? `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim() || deal.contact.email || 'Contato'
    : null
  const contactInitials = deal.contact
    ? `${deal.contact.first_name?.[0] || ''}${deal.contact.last_name?.[0] || ''}`.toUpperCase() || '?'
    : '?'

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(deal.id, editedDeal)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await onDelete(deal.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleStageChange = async (stageId: string) => {
    await onUpdate(deal.id, { stage_id: stageId } as Partial<Deal>)
  }

  const handleMarkAsWon = async () => {
    setSaving(true)
    try {
      await onUpdate(deal.id, { status: 'won', won_at: new Date().toISOString(), probability: 100 } as Partial<Deal>)
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAsLost = async () => {
    setSaving(true)
    try {
      const notes = lostReason ? (deal.notes ? `${deal.notes}\n\nMotivo: ${lostReason}` : `Motivo: ${lostReason}`) : deal.notes
      await onUpdate(deal.id, { status: 'lost', lost_at: new Date().toISOString(), probability: 0, notes } as Partial<Deal>)
      setShowLostModal(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReopen = async () => {
    setSaving(true)
    try {
      await onUpdate(deal.id, { status: 'open', won_at: undefined, lost_at: undefined } as Partial<Deal>)
    } finally {
      setSaving(false)
    }
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
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-dark-900 border-l border-dark-800 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-800">
              <div className="flex items-center gap-2">
                {deal.status === 'won' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                {deal.status === 'lost' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                {deal.status === 'open' && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStage?.color || '#6366f1' }} />}
                <span className="text-sm font-medium text-dark-300">
                  {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : currentStage?.name || 'Deal'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {deal.status === 'open' && !isEditing && (
                  <>
                    <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-md text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-1.5 rounded-md text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button onClick={onClose} className="p-1.5 rounded-md text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Deal Title & Value */}
              <div className="px-4 py-4 border-b border-dark-800/50">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedDeal.title || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, title: e.target.value })}
                    className="w-full text-lg font-semibold bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                  />
                ) : (
                  <h2 className="text-lg font-semibold text-white mb-1">{deal.title}</h2>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <span className="text-dark-400 text-sm">R$</span>
                      <input
                        type="number"
                        value={editedDeal.value || 0}
                        onChange={(e) => setEditedDeal({ ...editedDeal, value: Number(e.target.value) || 0 })}
                        className="w-32 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ) : (
                    <span className={`text-xl font-bold ${deal.status === 'won' ? 'text-emerald-400' : deal.status === 'lost' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {formatCurrency(deal.value)}
                    </span>
                  )}
                  {!isEditing && deal.probability > 0 && deal.status === 'open' && (
                    <span className="text-sm text-dark-400">{deal.probability}% chance</span>
                  )}
                </div>
              </div>

              {/* Status Banner */}
              {deal.status !== 'open' && (
                <div className={`mx-4 mt-4 p-3 rounded-lg border ${deal.status === 'won' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {deal.status === 'won' ? <Trophy className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <span className={`text-sm font-medium ${deal.status === 'won' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {deal.status === 'won' ? 'Deal ganho' : 'Deal perdido'}
                      </span>
                    </div>
                    <button onClick={handleReopen} disabled={saving} className="text-xs text-dark-400 hover:text-white flex items-center gap-1 transition-colors">
                      <RotateCcw className="w-3 h-3" />
                      Reabrir
                    </button>
                  </div>
                </div>
              )}

              {/* Contact Card */}
              {deal.contact ? (
                <div className="mx-4 mt-4 p-3 bg-dark-800/50 rounded-lg border border-dark-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(contactName || '')} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-sm font-bold text-white">{contactInitials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{contactName}</p>
                      {deal.contact.company && (
                        <p className="text-xs text-dark-400 truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {deal.contact.company}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Contact actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-700/50">
                    {deal.contact.phone && (
                      <a href={`tel:${deal.contact.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-dark-700/50 hover:bg-dark-700 text-dark-300 hover:text-white text-xs transition-colors">
                        <Phone className="w-3.5 h-3.5" />
                        Ligar
                      </a>
                    )}
                    {deal.contact.email && (
                      <a href={`mailto:${deal.contact.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-dark-700/50 hover:bg-dark-700 text-dark-300 hover:text-white text-xs transition-colors">
                        <Mail className="w-3.5 h-3.5" />
                        E-mail
                      </a>
                    )}
                    {deal.contact.whatsapp && (
                      <a href={`https://wa.me/${deal.contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ) : isEditing ? (
                <div className="mx-4 mt-4">
                  <label className="block text-xs font-medium text-dark-400 mb-1.5">Contato</label>
                  <ContactSelector selectedId={editedDeal.contact_id} onSelect={(id) => setEditedDeal({ ...editedDeal, contact_id: id })} />
                </div>
              ) : (
                <div className="mx-4 mt-4 p-3 bg-dark-800/30 rounded-lg border border-dashed border-dark-700/50 text-center">
                  <User className="w-5 h-5 text-dark-500 mx-auto mb-1" />
                  <p className="text-xs text-dark-500">Sem contato vinculado</p>
                </div>
              )}

              {/* Action Buttons */}
              {deal.status === 'open' && !isEditing && (
                <div className="mx-4 mt-4 flex gap-2">
                  <button onClick={handleMarkAsWon} disabled={saving} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <Trophy className="w-4 h-4" />
                    Ganho
                  </button>
                  <button onClick={() => setShowLostModal(true)} disabled={saving} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Perdido
                  </button>
                </div>
              )}

              {/* Stage Selector */}
              {deal.status === 'open' && (
                <div className="mx-4 mt-4">
                  <label className="block text-xs font-medium text-dark-400 mb-2">Estágio</label>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((stage) => (
                      <button
                        key={stage.id}
                        onClick={() => handleStageChange(stage.id)}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-50 ${
                          deal.stage_id === stage.id
                            ? 'text-white shadow-sm'
                            : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
                        }`}
                        style={deal.stage_id === stage.id ? { backgroundColor: stage.color } : undefined}
                      >
                        {stage.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Grid */}
              <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
                {/* Probability */}
                {deal.status === 'open' && (
                  <div className="p-3 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-xs">Probabilidade</span>
                    </div>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editedDeal.probability || 0}
                        onChange={(e) => setEditedDeal({ ...editedDeal, probability: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-full bg-dark-800 border border-dark-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${deal.probability}%` }} />
                        </div>
                        <span className="text-sm font-medium text-white">{deal.probability}%</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Expected Close */}
                <div className="p-3 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs">Previsão fechamento</span>
                  </div>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editedDeal.expected_close_date || ''}
                      onChange={(e) => setEditedDeal({ ...editedDeal, expected_close_date: e.target.value })}
                      className="w-full bg-dark-800 border border-dark-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary-500"
                    />
                  ) : (
                    <p className="text-sm font-medium text-white">
                      {deal.expected_close_date ? formatDate(deal.expected_close_date) : '-'}
                    </p>
                  )}
                </div>

                {/* Created */}
                <div className="p-3 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs">Criado em</span>
                  </div>
                  <p className="text-sm font-medium text-white">{formatDateTime(deal.created_at)}</p>
                </div>

                {/* Source */}
                {(deal as any).source && (
                  <div className="p-3 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span className="text-xs">Origem</span>
                    </div>
                    <p className="text-sm font-medium text-white capitalize">{(deal as any).source}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mx-4 mt-4">
                <label className="block text-xs font-medium text-dark-400 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Observações
                </label>
                {isEditing ? (
                  <textarea
                    value={editedDeal.notes || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, notes: e.target.value })}
                    rows={3}
                    className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 resize-none"
                    placeholder="Adicione observações..."
                  />
                ) : deal.notes ? (
                  <p className="text-sm text-dark-300 whitespace-pre-wrap bg-dark-800/30 rounded-lg p-3">{deal.notes}</p>
                ) : (
                  <p className="text-sm text-dark-500 italic">Nenhuma observação</p>
                )}
              </div>

              {/* Edit Actions */}
              {isEditing && (
                <div className="mx-4 mt-4 flex gap-2">
                  <button onClick={() => setIsEditing(false)} disabled={saving} className="flex-1 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50">
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                    Salvar
                  </button>
                </div>
              )}

              {/* Timeline */}
              <div className="mx-4 mt-6 mb-4">
                <div className="flex items-center gap-1.5 text-dark-400 mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Histórico</span>
                </div>
                <DealTimeline dealId={deal.id} />
              </div>
            </div>

            {/* Lost Modal */}
            <AnimatePresence>
              {showLostModal && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-dark-900 border border-dark-700 rounded-xl p-4 w-full max-w-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <h3 className="text-base font-semibold text-white">Marcar como perdido</h3>
                    </div>
                    <textarea
                      value={lostReason}
                      onChange={(e) => setLostReason(e.target.value)}
                      rows={2}
                      className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-red-500 resize-none mb-3"
                      placeholder="Motivo da perda (opcional)"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowLostModal(false); setLostReason('') }} disabled={saving} className="flex-1 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50">
                        Cancelar
                      </button>
                      <button onClick={handleMarkAsLost} disabled={saving} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirmar'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete Modal */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-dark-900 border border-dark-700 rounded-xl p-4 w-full max-w-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Trash2 className="w-5 h-5 text-red-400" />
                      <h3 className="text-base font-semibold text-white">Excluir deal</h3>
                    </div>
                    <p className="text-sm text-dark-400 mb-4">Esta ação não pode ser desfeita.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowDeleteConfirm(false)} disabled={saving} className="flex-1 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50">
                        Cancelar
                      </button>
                      <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Excluir'}
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
