'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Mail,
  Phone,
  Building2,
  Plus,
  ShoppingCart,
  DollarSign,
  Package,
  MessageSquare,
  Eye,
  Clock,
  Trash2,
  PhoneCall,
  Calendar,
  FileText,
  Send,
  Briefcase,
  ChevronDown,
} from 'lucide-react'
import type { Contact, Pipeline, PipelineStage } from '@/types'
import { useAuthStore } from '@/stores'

// Predefined tag colors
const TAG_COLORS: Record<string, string> = {
  cliente: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  vip: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  prospect: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  inativo: 'bg-red-500/20 text-red-400 border-red-500/30',
  novo: 'bg-green-500/20 text-green-400 border-green-500/30',
  recorrente: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  default: 'bg-dark-600/50 text-dark-300 border-dark-500/30',
}

// Suggested tags
const SUGGESTED_TAGS = ['cliente', 'vip', 'lead', 'prospect', 'novo', 'recorrente', 'inativo']

// Activity types with icons and colors
const ACTIVITY_TYPES = [
  { type: 'order', label: 'Pedido', icon: ShoppingCart, color: 'text-cyan-400 bg-cyan-500/20' },
  { type: 'email', label: 'E-mail', icon: Mail, color: 'text-blue-400 bg-blue-500/20' },
  { type: 'call', label: 'Ligação', icon: PhoneCall, color: 'text-green-400 bg-green-500/20' },
  { type: 'meeting', label: 'Reunião', icon: Calendar, color: 'text-purple-400 bg-purple-500/20' },
  { type: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/20' },
  { type: 'visit', label: 'Visita', icon: Eye, color: 'text-amber-400 bg-amber-500/20' },
  { type: 'note', label: 'Nota', icon: FileText, color: 'text-gray-400 bg-gray-500/20' },
  { type: 'proposal', label: 'Proposta', icon: Send, color: 'text-pink-400 bg-pink-500/20' },
]

interface Activity {
  id: string
  type: string
  title: string
  description?: string
  created_at: string
}

interface ContactDrawerProps {
  contact: Contact | null
  onClose: () => void
  onUpdateTags: (contactId: string, tags: string[]) => Promise<void>
  pipelines?: Pipeline[]
  onCreateDeal?: (data: any) => Promise<void>
}

export function ContactDrawer({ contact, onClose, onUpdateTags, pipelines = [], onCreateDeal }: ContactDrawerProps) {
  const { user } = useAuthStore()
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [savingTags, setSavingTags] = useState(false)
  
  // Activities state
  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [newActivityType, setNewActivityType] = useState('note')
  const [newActivityTitle, setNewActivityTitle] = useState('')
  const [savingActivity, setSavingActivity] = useState(false)
  
  // Pipeline modal state
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null)
  const [dealTitle, setDealTitle] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [creatingDeal, setCreatingDeal] = useState(false)

  // Fetch activities when contact changes
  useEffect(() => {
    if (contact && user?.organization_id) {
      fetchActivities()
    }
  }, [contact?.id, user?.organization_id])

  // Set default deal title when contact changes
  useEffect(() => {
    if (contact) {
      const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      setDealTitle(name || contact.email || 'Novo Deal')
    }
  }, [contact])

  const fetchActivities = async () => {
    if (!contact || !user?.organization_id) return
    
    setLoadingActivities(true)
    try {
      const response = await fetch(
        `/api/contact-activities?contactId=${contact.id}&organizationId=${user.organization_id}`
      )
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const handleAddActivity = async () => {
    if (!contact || !user?.organization_id || !newActivityTitle.trim()) return

    setSavingActivity(true)
    try {
      const response = await fetch('/api/contact-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          organizationId: user.organization_id,
          userId: user.id,
          type: newActivityType,
          title: newActivityTitle.trim(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setActivities(prev => [data.activity, ...prev])
        setNewActivityTitle('')
        setShowAddActivity(false)
      }
    } catch (error) {
      console.error('Error adding activity:', error)
    } finally {
      setSavingActivity(false)
    }
  }

  const handleDeleteActivity = async (activityId: string) => {
    if (!user?.organization_id) return

    try {
      const response = await fetch(
        `/api/contact-activities?id=${activityId}&organizationId=${user.organization_id}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        setActivities(prev => prev.filter(a => a.id !== activityId))
      }
    } catch (error) {
      console.error('Error deleting activity:', error)
    }
  }

  const handleAddToPipeline = async () => {
    if (!contact || !selectedPipeline || !selectedStage || !onCreateDeal) return

    setCreatingDeal(true)
    try {
      await onCreateDeal({
        title: dealTitle || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Novo Deal',
        value: parseFloat(dealValue) || 0,
        pipeline_id: selectedPipeline.id,
        stage_id: selectedStage.id,
        contact_id: contact.id,
        probability: selectedStage.probability || 50,
      })
      
      setShowPipelineModal(false)
      setSelectedPipeline(null)
      setSelectedStage(null)
      setDealValue('')
      // Optionally close drawer or show success message
    } catch (error) {
      console.error('Error creating deal:', error)
    } finally {
      setCreatingDeal(false)
    }
  }

  if (!contact) return null

  const initials = `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || '?'
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Sem nome'

  const getTagColor = (tag: string) => {
    return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default
  }

  const handleAddTag = async (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase()
    if (!trimmedTag || contact.tags?.includes(trimmedTag)) return

    setSavingTags(true)
    try {
      const newTags = [...(contact.tags || []), trimmedTag]
      await onUpdateTags(contact.id, newTags)
      setNewTag('')
      setShowTagInput(false)
    } catch (error) {
      console.error('Error adding tag:', error)
    } finally {
      setSavingTags(false)
    }
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    setSavingTags(true)
    try {
      const newTags = (contact.tags || []).filter(t => t !== tagToRemove)
      await onUpdateTags(contact.id, newTags)
    } catch (error) {
      console.error('Error removing tag:', error)
    } finally {
      setSavingTags(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  const getActivityIcon = (type: string) => {
    const activityType = ACTIVITY_TYPES.find(a => a.type === type)
    return activityType || ACTIVITY_TYPES.find(a => a.type === 'note')!
  }

  const availableSuggestions = SUGGESTED_TAGS.filter(
    tag => !contact.tags?.includes(tag)
  )

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="relative w-full max-w-md bg-dark-900 border-l border-dark-700/50 shadow-2xl overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-xl border-b border-dark-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Informações do Contato</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar & Name */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 ring-4 ring-dark-800">
                <span className="text-2xl font-bold text-white">{initials}</span>
              </div>
              <h3 className="text-xl font-bold text-white">{fullName}</h3>
              {contact.phone && (
                <p className="text-dark-400 mt-1">{contact.phone}</p>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Contact Info */}
            <div className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3 text-dark-300">
                  <Mail className="w-4 h-4 text-dark-500" />
                  <span>{contact.email}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3 text-dark-300">
                  <Building2 className="w-4 h-4 text-dark-500" />
                  <span>{contact.company}</span>
                </div>
              )}
            </div>

            {/* Add to Pipeline Button */}
            {pipelines.length > 0 && onCreateDeal && (
              <button
                onClick={() => setShowPipelineModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/30 rounded-xl text-primary-400 font-medium transition-colors"
              >
                <Briefcase className="w-5 h-5" />
                Adicionar em Pipeline
              </button>
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
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTag)}
                        placeholder="Nova tag..."
                        className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        disabled={savingTags}
                      />
                      <button
                        onClick={() => handleAddTag(newTag)}
                        disabled={!newTag.trim() || savingTags}
                        className="px-3 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                      >
                        Adicionar
                      </button>
                    </div>
                    
                    {availableSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {availableSuggestions.map(tag => (
                          <button
                            key={tag}
                            onClick={() => handleAddTag(tag)}
                            disabled={savingTags}
                            className="px-2 py-1 text-xs rounded-md bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Current Tags */}
              <div className="flex flex-wrap gap-2">
                {contact.tags && contact.tags.length > 0 ? (
                  contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        disabled={savingTags}
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

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-xs">Pedidos</span>
                </div>
                <p className="text-2xl font-bold text-white">{contact.total_orders || 0}</p>
              </div>
              <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">Total Gasto</span>
                </div>
                <p className="text-2xl font-bold text-success-400">
                  {formatCurrency(contact.total_spent || 0)}
                </p>
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-dark-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Atividade Recente</span>
                </div>
                <button
                  onClick={() => setShowAddActivity(!showAddActivity)}
                  className="p-1 rounded text-dark-400 hover:text-primary-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Add Activity Form */}
              <AnimatePresence>
                {showAddActivity && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mb-4 overflow-hidden"
                  >
                    <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl space-y-3">
                      {/* Activity Type Selector */}
                      <div className="flex flex-wrap gap-2">
                        {ACTIVITY_TYPES.map(actType => {
                          const Icon = actType.icon
                          return (
                            <button
                              key={actType.type}
                              onClick={() => setNewActivityType(actType.type)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                newActivityType === actType.type
                                  ? actType.color + ' ring-1 ring-current'
                                  : 'bg-dark-700 text-dark-400 hover:text-white'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {actType.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Activity Title */}
                      <input
                        type="text"
                        value={newActivityTitle}
                        onChange={(e) => setNewActivityTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddActivity()}
                        placeholder="Descreva a atividade..."
                        className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                        disabled={savingActivity}
                      />

                      {/* Actions */}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowAddActivity(false)}
                          className="px-3 py-1.5 text-dark-400 hover:text-white text-sm transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleAddActivity}
                          disabled={!newActivityTitle.trim() || savingActivity}
                          className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                        >
                          {savingActivity ? 'Salvando...' : 'Adicionar'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Activities List */}
              {loadingActivities ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-1">
                  {activities.map((activity) => {
                    const actType = getActivityIcon(activity.type)
                    const Icon = actType.icon
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-dark-800/50 transition-colors group"
                      >
                        <div className={`p-2 rounded-lg ${actType.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">{activity.title}</p>
                          <p className="text-dark-500 text-xs">{formatDate(activity.created_at)}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteActivity(activity.id)}
                          className="p-1 rounded text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-dark-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma atividade registrada</p>
                  <button
                    onClick={() => setShowAddActivity(true)}
                    className="mt-2 text-primary-400 text-sm hover:text-primary-300"
                  >
                    Adicionar primeira atividade
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-dark-700/50 space-y-2">
              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors">
                <MessageSquare className="w-4 h-4" />
                Enviar Mensagem
              </button>
              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-dark-800 hover:bg-dark-700 rounded-xl text-dark-300 font-medium transition-colors">
                <Mail className="w-4 h-4" />
                Enviar E-mail
              </button>
            </div>
          </div>
        </motion.div>

        {/* Pipeline Modal */}
        <AnimatePresence>
          {showPipelineModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-60 flex items-center justify-center p-4"
              onClick={() => setShowPipelineModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-dark-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                        <Briefcase className="w-5 h-5 text-primary-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">Adicionar em Pipeline</h3>
                        <p className="text-sm text-dark-400">Crie um deal para {contact.first_name || 'este contato'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPipelineModal(false)}
                      className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-5 space-y-4">
                  {/* Deal Title */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Título do Deal
                    </label>
                    <input
                      type="text"
                      value={dealTitle}
                      onChange={(e) => setDealTitle(e.target.value)}
                      placeholder="Ex: Implementação E-commerce"
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {/* Deal Value */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="0"
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                    />
                  </div>

                  {/* Pipeline Selector */}
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Pipeline
                    </label>
                    <div className="space-y-2">
                      {pipelines.map(pipeline => (
                        <button
                          key={pipeline.id}
                          onClick={() => {
                            setSelectedPipeline(pipeline)
                            setSelectedStage(pipeline.stages?.[0] || null)
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                            selectedPipeline?.id === pipeline.id
                              ? 'bg-primary-500/10 border-primary-500/50 text-white'
                              : 'bg-dark-900 border-dark-600 text-dark-300 hover:border-dark-500'
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: pipeline.color || '#f97316' }}
                          />
                          <span className="flex-1 text-left">{pipeline.name}</span>
                          {selectedPipeline?.id === pipeline.id && (
                            <ChevronDown className="w-4 h-4 text-primary-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stage Selector */}
                  {selectedPipeline && selectedPipeline.stages && (
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Estágio
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {selectedPipeline.stages
                          .sort((a, b) => a.position - b.position)
                          .map(stage => (
                            <button
                              key={stage.id}
                              onClick={() => setSelectedStage(stage)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                selectedStage?.id === stage.id
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                              }`}
                            >
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: stage.color || '#8b5cf6' }}
                              />
                              {stage.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-5 border-t border-dark-700 flex gap-3">
                  <button
                    onClick={() => setShowPipelineModal(false)}
                    className="flex-1 px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-dark-300 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddToPipeline}
                    disabled={!selectedPipeline || !selectedStage || creatingDeal}
                    className="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
                  >
                    {creatingDeal ? 'Criando...' : 'Criar Deal'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
