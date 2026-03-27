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
  Calendar,
  XCircle,
  Briefcase,
  MapPin,
  ShoppingBag,
  TrendingUp,
  Star,
  User,
  CreditCard,
  Activity,
  BadgeCheck,
  MailCheck,
  MessageCircle,
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

// Tag colors - matching DataCrazy CRM style
const TAG_COLORS: Record<string, string> = {
  // Standard tags
  cliente: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  vip: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  prospect: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  // Source tags
  inbound: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'ads facebook': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'ads google': 'bg-red-500/20 text-red-400 border-red-500/30',
  'tráfego pago': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  youtube: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'tiktok ads': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'site principal': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  outbound: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'social selling': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  // Default
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
  const formResponses = customFields.form_responses || []
  const referrer = customFields.referrer
  const submittedAt = customFields.submitted_at
  const hasUtms = utmSource || utmMedium || utmCampaign || utmTerm || utmContent
  const hasOrigin = hasUtms || source || formName || formId
  const hasFormResponses = Array.isArray(formResponses) && formResponses.length > 0

  // Extract contact data from form_responses as fallback
  const extractFormData = () => {
    const result: { email?: string; phone?: string; name?: string } = {}
    for (const response of formResponses) {
      const label = (response.label || '').toLowerCase()
      const value = response.value
      const type = (response.type || '').toLowerCase()
      if (!value) continue
      if (!result.email && (type === 'email' || label.includes('email') || label.includes('e-mail') || (typeof value === 'string' && value.includes('@')))) {
        result.email = String(value)
      }
      if (!result.phone && (type === 'phone' || type === 'tel' || label.includes('telefone') || label.includes('celular') || label.includes('whatsapp') || label.includes('phone'))) {
        result.phone = String(value)
      }
      if (!result.name && (label.includes('nome') || label.includes('name'))) {
        result.name = String(value)
      }
    }
    return result
  }
  const formData = extractFormData()

  // Use contact data OR form data as fallback
  const contactEmail = contact?.email || formData.email
  const contactPhone = contact?.whatsapp || contact?.phone || formData.phone
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Contato'
    : formData.name || deal.title
  const contactInitials = contact
    ? `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || '?'
    : (formData.name || deal.title)?.substring(0, 2).toUpperCase() || '?'

  // Check if we have any contact info
  const hasContactInfo = contactEmail || contactPhone || contact?.company

  // Helper to detect if value is a URL
  const isUrl = (value: any): boolean => {
    if (typeof value !== 'string') return false
    return value.startsWith('http://') || value.startsWith('https://') || value.includes('calendly.com') || value.includes('cal.com')
  }

  // Helper to render form response value
  const renderFormValue = (value: any, type: string) => {
    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-400 hover:text-primary-300 underline break-all"
        >
          {value.length > 50 ? value.substring(0, 50) + '...' : value}
        </a>
      )
    }
    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Não'
    }
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    return String(value)
  }

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
            className="fixed right-0 top-0 h-full w-full max-w-xl bg-white border-l border-gray-200 shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                {deal.status === 'won' ? (
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-green-400" />
                  </div>
                ) : deal.status === 'lost' ? (
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-4 h-4 text-red-400" />
                  </div>
                ) : (
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentStage?.color || '#f97316' }} />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {isEditing ? 'Editando Deal' : 'Detalhes do Deal'}
                  </h2>
                  {deal.status !== 'open' && (
                    <p className={`text-xs ${deal.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                      {deal.status === 'won' ? '🎉 Deal Ganho' : '❌ Deal Perdido'}
                    </p>
                  )}
                  <button onClick={onClose} className="p-1.5 rounded-md text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && deal.status === 'open' && (
                  <>
                    <button onClick={() => setIsEditing(true)} className="p-2 rounded-lg hover:bg-white text-gray-500 hover:text-white transition-colors" title="Editar">
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors" title="Excluir">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    <button onClick={() => setIsEditing(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2">
                      {saving ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Salvando...</>) : (<><Check className="w-4 h-4" />Salvar</>)}
                    </button>
                  </>
                )}
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* STATUS BANNER */}
              {deal.status !== 'open' && (
                <div className={`p-4 rounded-xl border ${deal.status === 'won' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {deal.status === 'won' ? <Trophy className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
                      <div>
                        <p className={`font-semibold ${deal.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                          {deal.status === 'won' ? 'Deal Ganho!' : 'Deal Perdido'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {deal.status === 'won' && deal.won_at && <>Fechado em {formatDate(deal.won_at)}</>}
                          {deal.status === 'lost' && deal.lost_at && <>Perdido em {formatDate(deal.lost_at)}</>}
                        </p>
                        {cycleTime !== null && <p className="text-xs text-gray-400 mt-1">Ciclo de vendas: {cycleTime} dias</p>}
                      </div>
                      <a
                        href={`mailto:${contactEmail}`}
                        className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 text-xs font-medium transition-colors"
                      >
                        Enviar
                      </a>
                    </div>
                    <button onClick={handleReopenDeal} disabled={statusChanging} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-gray-100 text-gray-600 hover:text-white transition-colors disabled:opacity-50">
                      {statusChanging ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      <span className="text-sm">Reabrir</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {deal.status === 'open' && !isEditing && (
                <div className="flex gap-3">
                  <button onClick={handleMarkAsWon} disabled={statusChanging} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-all disabled:opacity-50 shadow-lg shadow-green-500/20">
                    {statusChanging ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Trophy className="w-5 h-5" />Marcar como Ganho</>}
                  </button>
                  <button onClick={() => setShowLostReasonModal(true)} disabled={statusChanging} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-all disabled:opacity-50 shadow-lg shadow-red-500/20">
                    <XCircle className="w-5 h-5" />Marcar como Perdido
                  </button>
                </div>
              )}

              {/* Title */}
              <div>
                {isEditing ? (
                  <input type="text" value={editedDeal.title || ''} onChange={(e) => setEditedDeal({ ...editedDeal, title: e.target.value })} className="w-full text-xl font-bold bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary-500 transition-colors" placeholder="Título do deal" />
                ) : (
                  <h3 className="text-xl font-bold text-gray-900">{deal.title}</h3>
                )}
              </div>
                        {stage.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Origin Info - Form + UTM + Source */}
              {hasOrigin && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Valor</label>
                  {isEditing ? (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                      <input type="number" value={editedDeal.value || ''} onChange={(e) => setEditedDeal({ ...editedDeal, value: Number(e.target.value) || 0 })} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors" placeholder="0" min="0" />
                    </div>
                  ) : (
                    <p className={`text-2xl font-bold ${deal.status === 'won' ? 'text-green-400' : deal.status === 'lost' ? 'text-red-400' : 'text-success-400'}`}>{formatCurrency(deal.value)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Probabilidade</label>
                  {isEditing ? (
                    <div className="relative">
                      <input type="number" value={editedDeal.probability || ''} onChange={(e) => setEditedDeal({ ...editedDeal, probability: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors" placeholder="50" min="0" max="100" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${deal.status === 'won' ? 'bg-green-500' : deal.status === 'lost' ? 'bg-red-500' : 'bg-gradient-to-r from-primary-500 to-accent-500'}`} style={{ width: `${deal.probability}%` }} />
                      </div>
                      <span className="text-lg font-semibold text-gray-900">{deal.probability}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expected Close Date */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2"><Calendar className="w-4 h-4 inline mr-2" />Data de Fechamento Esperada</label>
                {isEditing ? (
                  <input type="date" value={editedDeal.expected_close_date || ''} onChange={(e) => setEditedDeal({ ...editedDeal, expected_close_date: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white focus:outline-none focus:border-primary-500 transition-colors" />
                ) : (
                  <p className="text-white">{deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString('pt-BR') : 'Não definida'}</p>
                )}
              </div>

              {/* Commit Level */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">Nível de Comprometimento (Forecast)</label>
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'omit' as const, label: 'Omitir', color: 'bg-gray-200', desc: 'Não incluir no forecast' },
                      { value: 'pipeline' as const, label: 'Pipeline', color: 'bg-yellow-500', desc: 'Deal padrão' },
                      { value: 'best_case' as const, label: 'Best Case', color: 'bg-blue-500', desc: 'Cenário otimista' },
                      { value: 'commit' as const, label: 'Commit', color: 'bg-green-500', desc: 'Praticamente garantido' },
                    ]).map((option) => (
                      <button key={option.value} type="button" onClick={() => setEditedDeal({ ...editedDeal, commit_level: option.value })} className={`p-3 rounded-xl border transition-all text-left ${editedDeal.commit_level === option.value ? 'border-primary-500 bg-brand-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3 h-3 rounded-full ${option.color}`} />
                          <span className="text-sm font-medium text-gray-900">{option.label}</span>
                        </div>
                        <p className="text-xs text-gray-500">{option.desc}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${deal.commit_level === 'commit' ? 'bg-green-500' : deal.commit_level === 'best_case' ? 'bg-blue-500' : deal.commit_level === 'omit' ? 'bg-gray-200' : 'bg-yellow-500'}`} />
                    <span className="text-white">{deal.commit_level === 'commit' ? 'Commit' : deal.commit_level === 'best_case' ? 'Best Case' : deal.commit_level === 'omit' ? 'Omitido' : 'Pipeline'}</span>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">Contato</label>
                {isEditing ? (
                  <ContactSelector selectedId={editedDeal.contact_id} onSelect={(contactId) => setEditedDeal({ ...editedDeal, contact_id: contactId })} />
                ) : deal.contact ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">{getContactInitials()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{getContactName()}</p>
                        {deal.contact.company && <p className="text-sm text-gray-500 flex items-center gap-1"><Building2 className="w-3 h-3" />{deal.contact.company}</p>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {deal.contact.email && <a href={`mailto:${deal.contact.email}`} className="p-2 rounded-lg bg-white hover:bg-gray-100 text-gray-500 hover:text-white transition-colors" title={deal.contact.email}><Mail className="w-5 h-5" /></a>}
                        {deal.contact.phone && <a href={`tel:${deal.contact.phone}`} className="p-2 rounded-lg bg-white hover:bg-gray-100 text-gray-500 hover:text-white transition-colors" title={deal.contact.phone}><Phone className="w-5 h-5" /></a>}
                        {deal.contact.whatsapp && <a href={`https://wa.me/${deal.contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-success-500 hover:bg-success-600 text-white transition-colors" title={deal.contact.whatsapp}><MessageSquare className="w-5 h-5" /></a>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400">Nenhum contato vinculado</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-2">Notas</label>
                {isEditing ? (
                  <textarea value={editedDeal.notes || ''} onChange={(e) => setEditedDeal({ ...editedDeal, notes: e.target.value })} rows={4} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white focus:outline-none focus:border-primary-500 resize-none transition-colors" placeholder="Adicione notas sobre este deal..." />
                ) : (
                  <p className="text-gray-600 whitespace-pre-wrap">{deal.notes || 'Nenhuma nota adicionada'}</p>
                )}
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />Criado em</p>
                    <p className="text-gray-600">{formatDate(deal.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Última atualização</p>
                    <p className="text-gray-600">{formatDate(deal.updated_at)}</p>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2"><Clock className="w-4 h-4" />Histórico de Estágios</h3>
                <DealTimeline dealId={deal.id} />
              </div>
            </div>

            {/* Lost Modal */}
            <AnimatePresence>
              {showLostReasonModal && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-10">
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Marcar como Perdido</h3>
                        <p className="text-sm text-gray-500">Qual foi o motivo da perda?</p>
                      </div>
                    </div>
                    <textarea value={lostReason} onChange={(e) => setLostReason(e.target.value)} rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-red-500 resize-none mb-4" placeholder="Ex: Preço alto, concorrente, sem budget..." autoFocus />
                    <div className="flex gap-3">
                      <button onClick={() => { setShowLostReasonModal(false); setLostReason(''); }} disabled={statusChanging} className="flex-1 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-white transition-colors disabled:opacity-50">Cancelar</button>
                      <button onClick={handleMarkAsLost} disabled={statusChanging} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {statusChanging ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Salvando...</>) : (<><XCircle className="w-4 h-4" />Confirmar Perda</>)}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete Modal */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-10">
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Excluir deal?</h3>
                    <p className="text-gray-500 mb-6">Esta ação não pode ser desfeita. O deal "{deal.title}" será permanentemente excluído.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 px-4 py-2 rounded-lg bg-white hover:bg-gray-100 text-white transition-colors disabled:opacity-50">Cancelar</button>
                      <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                        {deleting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Excluindo...</>) : 'Excluir'}
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
