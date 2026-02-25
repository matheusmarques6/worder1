'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Phone,
  Mail,
  Building2,
  DollarSign,
  Tag,
  FileText,
  Pencil,
  Trash2,
  MessageSquare,
  Clock,
  Check,
  Globe,
  Target,
  Megaphone,
  Link2,
  Plus,
  ExternalLink,
  Copy,
  User,
  Calendar,
  Zap,
} from 'lucide-react'
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

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

// Tag colors
const TAG_COLORS: Record<string, string> = {
  cliente: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  vip: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  prospect: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  default: 'bg-dark-600/50 text-dark-300 border-dark-500/30',
}

export function DealDrawer({ deal, stages, onClose, onUpdate, onDelete }: DealDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDeal, setEditedDeal] = useState<Partial<Deal>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)

  useEffect(() => {
    if (deal) {
      setEditedDeal({
        title: deal.title,
        value: deal.value,
        notes: deal.notes,
        contact_id: deal.contact_id,
      })
      setIsEditing(false)
      setShowDeleteConfirm(false)
      setShowLostModal(false)
      setLostReason('')
    }
  }, [deal])

  if (!deal) return null

  const currentStage = stages.find(s => s.id === deal.stage_id)
  const contact = deal.contact
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Contato'
    : deal.title
  const contactInitials = contact
    ? `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || '?'
    : deal.title?.substring(0, 2).toUpperCase() || '?'

  // Extract UTM and source info from custom_fields
  const customFields = (deal as any).custom_fields || {}
  const utmSource = customFields.utm_source
  const utmMedium = customFields.utm_medium
  const utmCampaign = customFields.utm_campaign
  const utmTerm = customFields.utm_term
  const utmContent = customFields.utm_content
  const source = customFields.source || (deal as any).source
  const formName = customFields.form_name || customFields.formName
  const formId = customFields.form_id || customFields.formId
  const hasUtms = utmSource || utmMedium || utmCampaign || utmTerm || utmContent
  const hasOrigin = hasUtms || source || formName || formId

  // Tags
  const dealTags = deal.tags || []

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
      await onUpdate(deal.id, { status: 'won', won_at: new Date().toISOString() } as Partial<Deal>)
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAsLost = async () => {
    setSaving(true)
    try {
      const notes = lostReason ? (deal.notes ? `${deal.notes}\n\nMotivo: ${lostReason}` : `Motivo: ${lostReason}`) : deal.notes
      await onUpdate(deal.id, { status: 'lost', lost_at: new Date().toISOString(), notes } as Partial<Deal>)
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

  const handleAddTag = async (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase()
    if (!trimmedTag || dealTags.includes(trimmedTag)) return

    const newTags = [...dealTags, trimmedTag]
    await onUpdate(deal.id, { tags: newTags } as Partial<Deal>)
    setNewTag('')
    setShowTagInput(false)
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const newTags = dealTags.filter(t => t !== tagToRemove)
    await onUpdate(deal.id, { tags: newTags } as Partial<Deal>)
  }

  const getTagColor = (tag: string) => {
    return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default
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
            className="fixed right-0 top-0 h-full w-full max-w-md bg-dark-900 border-l border-dark-700/50 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-xl border-b border-dark-700/50 p-6">
              <div className="flex items-center justify-between mb-6">
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

              {/* Avatar & Name */}
              <div className="flex flex-col items-center text-center">
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getAvatarColor(contactName)} flex items-center justify-center mb-4 ring-4 ring-dark-800`}>
                  <span className="text-2xl font-bold text-white">{contactInitials}</span>
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedDeal.title || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, title: e.target.value })}
                    className="w-full text-xl font-bold text-center bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                  />
                ) : (
                  <h3 className="text-xl font-bold text-white">{deal.title}</h3>
                )}
                {contact?.phone && (
                  <p className="text-dark-400 mt-1">{contact.phone}</p>
                )}
                {/* Value */}
                <div className="mt-3">
                  {isEditing ? (
                    <div className="flex items-center gap-2 justify-center">
                      <span className="text-dark-400">R$</span>
                      <input
                        type="number"
                        value={editedDeal.value || 0}
                        onChange={(e) => setEditedDeal({ ...editedDeal, value: Number(e.target.value) || 0 })}
                        className="w-32 bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-white text-center focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ) : (
                    <span className={`text-2xl font-bold ${deal.status === 'won' ? 'text-emerald-400' : deal.status === 'lost' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {formatCurrency(deal.value)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Contact Info */}
              {contact && (
                <div className="space-y-3">
                  {contact.email && (
                    <div className="flex items-center gap-3 text-dark-300">
                      <Mail className="w-4 h-4 text-dark-500" />
                      <span>{contact.email}</span>
                    </div>
                  )}
                  {(contact.whatsapp || contact.phone) && (
                    <div className="flex items-center gap-3 text-dark-300">
                      <Phone className="w-4 h-4 text-dark-500" />
                      <span>{contact.whatsapp || contact.phone}</span>
                    </div>
                  )}
                  {contact.company && (
                    <div className="flex items-center gap-3 text-dark-300">
                      <Building2 className="w-4 h-4 text-dark-500" />
                      <span>{contact.company}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              {contact && (
                <div className="flex gap-2">
                  {(contact.whatsapp || contact.phone) && (
                    <a
                      href={`https://wa.me/${(contact.whatsapp || contact.phone || '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm font-medium transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      Ligar
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-600 text-dark-300 text-sm font-medium transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      E-mail
                    </a>
                  )}
                </div>
              )}


              {/* Stage Selector */}
              {deal.status === 'open' && (
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Estagio</label>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((stage) => (
                      <button
                        key={stage.id}
                        onClick={() => handleStageChange(stage.id)}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
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

              {/* Origin Info - Form + UTM + Source */}
              {hasOrigin && (
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-3">Origem do Lead</label>
                  <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl space-y-3">
                    {/* Form Name - destacado */}
                    {(formName || formId) && (
                      <div className="flex items-center gap-3 pb-3 border-b border-dark-700/50">
                        <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary-400" />
                        </div>
                        <div>
                          <span className="text-xs text-dark-500">Formulario</span>
                          <p className="text-sm font-medium text-white">{formName || 'Formulario sem nome'}</p>
                        </div>
                      </div>
                    )}

                    {source && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-dark-500" />
                        <span className="text-dark-400 text-sm">Fonte:</span>
                        <span className="text-white text-sm font-medium">{source}</span>
                      </div>
                    )}
                    {utmSource && (
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-400" />
                        <span className="text-dark-400 text-sm">utm_source:</span>
                        <span className="text-white text-sm font-medium">{utmSource}</span>
                      </div>
                    )}
                    {utmMedium && (
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-purple-400" />
                        <span className="text-dark-400 text-sm">utm_medium:</span>
                        <span className="text-white text-sm font-medium">{utmMedium}</span>
                      </div>
                    )}
                    {utmCampaign && (
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-orange-400" />
                        <span className="text-dark-400 text-sm">utm_campaign:</span>
                        <span className="text-white text-sm font-medium">{utmCampaign}</span>
                      </div>
                    )}
                    {utmTerm && (
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-cyan-400" />
                        <span className="text-dark-400 text-sm">utm_term:</span>
                        <span className="text-white text-sm font-medium">{utmTerm}</span>
                      </div>
                    )}
                    {utmContent && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-pink-400" />
                        <span className="text-dark-400 text-sm">utm_content:</span>
                        <span className="text-white text-sm font-medium">{utmContent}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Tags</span>
                  <button
                    onClick={() => setShowTagInput(!showTagInput)}
                    className="p-1 rounded text-dark-400 hover:text-primary-400 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Tag Input */}
                <AnimatePresence>
                  {showTagInput && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mb-3 overflow-hidden"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTag)}
                          placeholder="Nova tag..."
                          className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        />
                        <button
                          onClick={() => handleAddTag(newTag)}
                          disabled={!newTag.trim()}
                          className="px-3 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                        >
                          Adicionar
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Current Tags */}
                <div className="flex flex-wrap gap-2">
                  {dealTags.length > 0 ? (
                    dealTags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:opacity-70 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-dark-500 text-sm">Nenhuma tag</span>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Created */}
                <div className="p-3 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs">Criado em</span>
                  </div>
                  <p className="text-sm font-medium text-white">{formatDateTime(deal.created_at)}</p>
                </div>

                {/* Updated */}
                {deal.updated_at && deal.updated_at !== deal.created_at && (
                  <div className="p-3 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-1.5 text-dark-400 mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs">Atualizado em</span>
                    </div>
                    <p className="text-sm font-medium text-white">{formatDateTime(deal.updated_at)}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Observacoes
                </label>
                {isEditing ? (
                  <textarea
                    value={editedDeal.notes || ''}
                    onChange={(e) => setEditedDeal({ ...editedDeal, notes: e.target.value })}
                    rows={3}
                    className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 resize-none"
                    placeholder="Adicione observacoes..."
                  />
                ) : deal.notes ? (
                  <p className="text-sm text-dark-300 whitespace-pre-wrap bg-dark-800/30 rounded-lg p-3">{deal.notes}</p>
                ) : (
                  <p className="text-sm text-dark-500 italic">Nenhuma observacao</p>
                )}
              </div>

              {/* Edit Actions */}
              {isEditing && (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-sm font-medium transition-colors disabled:opacity-50">
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                    Salvar
                  </button>
                </div>
              )}

              {/* Timeline */}
              <div>
                <div className="flex items-center gap-1.5 text-dark-400 mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Historico</span>
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
                    <p className="text-sm text-dark-400 mb-4">Esta acao nao pode ser desfeita.</p>
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
