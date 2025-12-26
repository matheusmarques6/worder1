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
  Heart,
  TrendingUp,
  Award,
  AlertTriangle,
  Zap,
  Star,
  Truck,
  CreditCard,
  ExternalLink,
} from 'lucide-react'
import type { Contact, Pipeline, PipelineStage } from '@/types'
import { useAuthStore } from '@/stores'

// RFM Segment badges
const RFM_SEGMENTS: Record<string, { label: string; color: string; icon: any }> = {
  champion: { label: 'Campeão', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50', icon: Award },
  loyal: { label: 'Leal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50', icon: Heart },
  potential_loyal: { label: 'Potencial Leal', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50', icon: TrendingUp },
  new_customer: { label: 'Novo Cliente', color: 'bg-green-500/20 text-green-400 border-green-500/50', icon: Zap },
  promising: { label: 'Promissor', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50', icon: Star },
  need_attention: { label: 'Precisa Atenção', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50', icon: AlertTriangle },
  about_to_sleep: { label: 'Adormecendo', color: 'bg-orange-500/20 text-orange-400 border-orange-500/50', icon: Clock },
  at_risk: { label: 'Em Risco', color: 'bg-red-500/20 text-red-400 border-red-500/50', icon: AlertTriangle },
  hibernating: { label: 'Hibernando', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50', icon: Clock },
  lost: { label: 'Perdido', color: 'bg-dark-600/50 text-dark-400 border-dark-500/50', icon: X },
}

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
  { type: 'order_placed', label: 'Pedido', icon: ShoppingCart, color: 'text-cyan-400 bg-cyan-500/20' },
  { type: 'order_paid', label: 'Pago', icon: CreditCard, color: 'text-green-400 bg-green-500/20' },
  { type: 'order_fulfilled', label: 'Enviado', icon: Truck, color: 'text-blue-400 bg-blue-500/20' },
  { type: 'order_cancelled', label: 'Cancelado', icon: X, color: 'text-red-400 bg-red-500/20' },
  { type: 'email', label: 'E-mail', icon: Mail, color: 'text-blue-400 bg-blue-500/20' },
  { type: 'call', label: 'Ligação', icon: PhoneCall, color: 'text-green-400 bg-green-500/20' },
  { type: 'meeting', label: 'Reunião', icon: Calendar, color: 'text-purple-400 bg-purple-500/20' },
  { type: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/20' },
  { type: 'whatsapp_sent', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/20' },
  { type: 'whatsapp_received', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/20' },
  { type: 'visit', label: 'Visita', icon: Eye, color: 'text-amber-400 bg-amber-500/20' },
  { type: 'page_view', label: 'Visita', icon: Eye, color: 'text-amber-400 bg-amber-500/20' },
  { type: 'product_view', label: 'Produto', icon: Package, color: 'text-purple-400 bg-purple-500/20' },
  { type: 'add_to_cart', label: 'Carrinho', icon: ShoppingCart, color: 'text-orange-400 bg-orange-500/20' },
  { type: 'note', label: 'Nota', icon: FileText, color: 'text-gray-400 bg-gray-500/20' },
  { type: 'proposal', label: 'Proposta', icon: Send, color: 'text-pink-400 bg-pink-500/20' },
]

interface Activity {
  id: string
  type: string
  title: string
  description?: string
  created_at: string
  occurred_at?: string
  source?: string
  metadata?: Record<string, any>
}

interface EnrichedData {
  last_order_products?: Array<{
    product_id: string
    title: string
    quantity: number
    price: number
    image_url?: string
  }>
  favorite_products?: Array<{
    product_id: string
    title: string
    count: number
  }>
  rfm_segment?: string
  rfm_recency_score?: number
  rfm_frequency_score?: number
  rfm_monetary_score?: number
  last_order_value?: number
  last_order_number?: string
  days_since_last_order?: number
  order_frequency_days?: number
  first_order_at?: string
  last_viewed_products?: Array<{
    product_id: string
    title: string
    price?: number
    url?: string
    viewed_at: string
  }>
}

interface OrderHistory {
  order_id: string
  order_number: string
  order_date: string
  total: number
  items: Array<{
    product_title: string
    product_sku?: string
    product_image_url?: string
    quantity: number
    unit_price: number
    total_price: number
  }>
}

interface BrowsingSession {
  id: string
  session_id: string
  started_at: string
  ended_at?: string
  page_views: number
  pages_visited: Array<{
    url: string
    title: string
    type: string
    timestamp: string
  }>
  products_viewed: Array<{
    product_id: string
    product_title: string
    product_price?: number
    viewed_at: string
  }>
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

interface ContactDrawerProps {
  contact: Contact | null
  onClose: () => void
  onUpdateTags: (contactId: string, tags: string[]) => Promise<void>
  pipelines?: Pipeline[]
  onCreateDeal?: (data: any) => Promise<void>
  onDeleteDeal?: (dealId: string) => Promise<void>
  onRefreshDeals?: () => Promise<void>
}

interface ContactDeal {
  id: string
  title: string
  value: number
  pipeline_id: string
  stage_id: string
  stage?: { name: string; color: string }
  pipeline?: { name: string; color: string }
}

export function ContactDrawer({ contact, onClose, onUpdateTags, pipelines = [], onCreateDeal, onDeleteDeal, onRefreshDeals }: ContactDrawerProps) {
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
  
  // Contact deals state
  const [contactDeals, setContactDeals] = useState<ContactDeal[]>([])
  const [loadingDeals, setLoadingDeals] = useState(false)
  
  // Delete deal confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [dealToDelete, setDealToDelete] = useState<string | null>(null)
  const [deletingDeal, setDeletingDeal] = useState(false)
  
  // Delete activity confirmation modal state
  const [showDeleteActivityConfirm, setShowDeleteActivityConfirm] = useState(false)
  const [activityToDelete, setActivityToDelete] = useState<string | null>(null)
  const [deletingActivity, setDeletingActivity] = useState(false)
  
  // Pipeline modal state
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null)
  const [dealTitle, setDealTitle] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [creatingDeal, setCreatingDeal] = useState(false)

  // Enriched data state (Shopify)
  const [enrichedData, setEnrichedData] = useState<EnrichedData | null>(null)
  const [loadingEnriched, setLoadingEnriched] = useState(false)
  const [showLastOrder, setShowLastOrder] = useState(true)
  const [showFavorites, setShowFavorites] = useState(false)
  
  // Orders and Sessions state (Shopify)
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([])
  const [browsingSessions, setBrowsingSessions] = useState<BrowsingSession[]>([])
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [showBrowsingHistory, setShowBrowsingHistory] = useState(false)

  // Fetch activities when contact changes
  useEffect(() => {
    if (contact && (user?.organization_id || contact.organization_id)) {
      fetchActivities()
      fetchContactDeals()
    }
  }, [contact?.id, user?.organization_id, contact?.organization_id])

  // Update deal info when pipelines load
  useEffect(() => {
    if (pipelines.length > 0 && contactDeals.length > 0) {
      const updatedDeals = contactDeals.map((deal) => {
        const pipeline = pipelines.find(p => p.id === deal.pipeline_id)
        const stage = pipeline?.stages?.find(s => s.id === deal.stage_id)
        return {
          ...deal,
          pipeline: pipeline ? { name: pipeline.name, color: pipeline.color } : deal.pipeline,
          stage: stage ? { name: stage.name, color: stage.color } : deal.stage,
        }
      })
      // Only update if there are actual changes
      const hasChanges = updatedDeals.some((d, i) => 
        d.pipeline?.name !== contactDeals[i]?.pipeline?.name ||
        d.stage?.name !== contactDeals[i]?.stage?.name
      )
      if (hasChanges) {
        setContactDeals(updatedDeals)
      }
    }
  }, [pipelines])

  // Set default deal title when contact changes
  useEffect(() => {
    if (contact) {
      const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      setDealTitle(name || contact.email || 'Novo Deal')
    }
  }, [contact])

  const fetchContactDeals = async () => {
    if (!contact) return
    
    const orgId = user?.organization_id || contact.organization_id
    if (!orgId) return
    
    setLoadingDeals(true)
    try {
      const response = await fetch(
        `/api/deals?organizationId=${orgId}&contactId=${contact.id}`
      )
      if (response.ok) {
        const data = await response.json()
        // Map deals with pipeline info
        const dealsWithInfo = (data.deals || []).map((deal: any) => {
          const pipeline = pipelines.find(p => p.id === deal.pipeline_id)
          const stage = pipeline?.stages?.find(s => s.id === deal.stage_id)
          return {
            ...deal,
            pipeline: pipeline ? { name: pipeline.name, color: pipeline.color } : null,
            stage: stage ? { name: stage.name, color: stage.color } : null,
          }
        })
        setContactDeals(dealsWithInfo)
      }
    } catch (error) {
      console.error('Error fetching contact deals:', error)
    } finally {
      setLoadingDeals(false)
    }
  }

  // Open delete confirmation modal
  const openDeleteConfirm = (dealId: string) => {
    setDealToDelete(dealId)
    setShowDeleteConfirm(true)
  }

  // Confirm and delete deal
  const confirmDeleteDeal = async () => {
    if (!dealToDelete) return
    
    setDeletingDeal(true)
    try {
      const orgId = user?.organization_id || contact?.organization_id
      
      if (onDeleteDeal) {
        await onDeleteDeal(dealToDelete)
      } else {
        // Fallback: delete via API directly
        const response = await fetch(
          `/api/deals?id=${dealToDelete}&organizationId=${orgId}`,
          { method: 'DELETE' }
        )
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to delete deal')
        }
      }
      
      // Remove from local state
      setContactDeals(prev => prev.filter(d => d.id !== dealToDelete))
      
      // Refresh deals list if callback provided
      if (onRefreshDeals) {
        await onRefreshDeals()
      }
      
      // Close modal
      setShowDeleteConfirm(false)
      setDealToDelete(null)
    } catch (error) {
      console.error('Error removing deal:', error)
    } finally {
      setDeletingDeal(false)
    }
  }

  const fetchActivities = async () => {
    if (!contact) return
    
    const orgId = user?.organization_id || contact.organization_id
    if (!orgId) return
    
    setLoadingActivities(true)
    setLoadingEnriched(true)
    
    try {
      // Tentar buscar da nova API de timeline (inclui dados enriquecidos)
      const timelineResponse = await fetch(
        `/api/contacts/${contact.id}/timeline?limit=30`
      )
      
      if (timelineResponse.ok) {
        const timelineData = await timelineResponse.json()
        
        // Usar atividades da timeline
        setActivities(timelineData.activities || [])
        
        // Extrair dados enriquecidos do contato
        if (timelineData.contact) {
          setEnrichedData({
            last_order_products: timelineData.contact.last_order_products || [],
            favorite_products: timelineData.contact.favorite_products || [],
            rfm_segment: timelineData.contact.rfm_segment,
            rfm_recency_score: timelineData.contact.rfm_recency_score,
            rfm_frequency_score: timelineData.contact.rfm_frequency_score,
            rfm_monetary_score: timelineData.contact.rfm_monetary_score,
            last_order_value: timelineData.contact.last_order_value,
            last_order_number: timelineData.contact.last_order_number,
            days_since_last_order: timelineData.contact.days_since_last_order,
            order_frequency_days: timelineData.contact.order_frequency_days,
            first_order_at: timelineData.contact.first_order_at,
            last_viewed_products: timelineData.contact.last_viewed_products || [],
          })
        }
        
        // Salvar histórico de pedidos
        if (timelineData.orders) {
          setOrderHistory(timelineData.orders)
        }
        
        // Salvar sessões de navegação
        if (timelineData.sessions) {
          setBrowsingSessions(timelineData.sessions)
        }
      } else {
        // Fallback para API antiga
        const response = await fetch(
          `/api/contact-activities?contactId=${contact.id}&organizationId=${orgId}`
        )
        if (response.ok) {
          const data = await response.json()
          setActivities(data.activities || [])
        }
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
      // Fallback
      try {
        const response = await fetch(
          `/api/contact-activities?contactId=${contact.id}&organizationId=${orgId}`
        )
        if (response.ok) {
          const data = await response.json()
          setActivities(data.activities || [])
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError)
      }
    } finally {
      setLoadingActivities(false)
      setLoadingEnriched(false)
    }
  }

  const handleAddActivity = async () => {
    if (!contact || !newActivityTitle.trim()) return
    
    const orgId = user?.organization_id || contact.organization_id

    if (!orgId) {
      console.error('No organization_id found')
      alert('Erro: Organization ID não encontrado')
      return
    }

    // Validate userId is a proper UUID (not "default-user" or similar)
    const isValidUUID = (id: string | undefined) => {
      if (!id) return false
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(id)
    }
    
    const userId = isValidUUID(user?.id) ? user?.id : null

    setSavingActivity(true)
    try {
      const response = await fetch('/api/contact-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          organizationId: orgId,
          userId: userId,
          type: newActivityType,
          title: newActivityTitle.trim(),
        }),
      })

      const data = await response.json()
      
      if (response.ok && data.activity) {
        setActivities(prev => [data.activity, ...prev])
        setNewActivityTitle('')
        setShowAddActivity(false)
        setNewActivityType('note')
      } else {
        console.error('Error response:', data)
        alert(`Erro ao adicionar atividade: ${data.error || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Error adding activity:', error)
      alert(`Erro ao adicionar atividade: ${error.message}`)
    } finally {
      setSavingActivity(false)
    }
  }

  // Open delete activity confirmation modal
  const openDeleteActivityConfirm = (activityId: string) => {
    setActivityToDelete(activityId)
    setShowDeleteActivityConfirm(true)
  }

  // Confirm and delete activity
  const confirmDeleteActivity = async () => {
    if (!activityToDelete) return
    
    const orgId = user?.organization_id || contact?.organization_id
    if (!orgId) return

    setDeletingActivity(true)
    try {
      const response = await fetch(
        `/api/contact-activities?id=${activityToDelete}&organizationId=${orgId}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        setActivities(prev => prev.filter(a => a.id !== activityToDelete))
        setShowDeleteActivityConfirm(false)
        setActivityToDelete(null)
      } else {
        const errorData = await response.json()
        alert(`Erro ao excluir: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Error deleting activity:', error)
    } finally {
      setDeletingActivity(false)
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
      
      // Refresh the contact deals list
      await fetchContactDeals()
      
      // Refresh main deals list if callback provided
      if (onRefreshDeals) {
        await onRefreshDeals()
      }
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

            {/* Contact Deals/Pipelines - Always show */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-dark-400">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Pipelines</span>
                </div>
                {pipelines.length > 0 && onCreateDeal && (
                  <button
                    onClick={() => setShowPipelineModal(true)}
                    className="p-1 rounded text-dark-400 hover:text-primary-400 transition-colors"
                    title="Adicionar em Pipeline"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {loadingDeals ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : contactDeals.length > 0 ? (
                <div className="space-y-2">
                  {contactDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center gap-3 p-3 bg-dark-800/50 border border-dark-700/50 rounded-xl group"
                    >
                      <div
                        className="w-2 h-full min-h-[40px] rounded-full flex-shrink-0"
                        style={{ backgroundColor: deal.stage?.color || deal.pipeline?.color || '#8b5cf6' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{deal.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-dark-400">{deal.pipeline?.name || 'Pipeline'}</span>
                          <span className="text-dark-600">•</span>
                          <span 
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ 
                              backgroundColor: `${deal.stage?.color || '#8b5cf6'}20`,
                              color: deal.stage?.color || '#8b5cf6'
                            }}
                          >
                            {deal.stage?.name || 'Estágio'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-success-400 text-sm font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value || 0)}
                        </p>
                      </div>
                      <button
                        onClick={() => openDeleteConfirm(deal.id)}
                        className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remover da pipeline"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 border border-dashed border-dark-700 rounded-xl">
                  <Briefcase className="w-6 h-6 mx-auto mb-2 text-dark-600" />
                  <p className="text-dark-500 text-sm">Nenhuma pipeline vinculada</p>
                  {pipelines.length > 0 && onCreateDeal && (
                    <button
                      onClick={() => setShowPipelineModal(true)}
                      className="mt-2 text-primary-400 text-sm hover:text-primary-300"
                    >
                      Adicionar em pipeline
                    </button>
                  )}
                </div>
              )}
            </div>

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

            {/* RFM Segment Badge */}
            {enrichedData?.rfm_segment && RFM_SEGMENTS[enrichedData.rfm_segment] && (
              <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const segment = RFM_SEGMENTS[enrichedData.rfm_segment!]
                      const SegmentIcon = segment.icon
                      return (
                        <>
                          <div className={`p-2 rounded-lg ${segment.color}`}>
                            <SegmentIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-white font-medium">{segment.label}</p>
                            <p className="text-dark-400 text-xs">Segmento RFM</p>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                  <div className="flex gap-1">
                    <div className="text-center px-2">
                      <p className="text-xs text-dark-500">R</p>
                      <p className="text-white font-bold">{enrichedData.rfm_recency_score || '-'}</p>
                    </div>
                    <div className="text-center px-2">
                      <p className="text-xs text-dark-500">F</p>
                      <p className="text-white font-bold">{enrichedData.rfm_frequency_score || '-'}</p>
                    </div>
                    <div className="text-center px-2">
                      <p className="text-xs text-dark-500">M</p>
                      <p className="text-white font-bold">{enrichedData.rfm_monetary_score || '-'}</p>
                    </div>
                  </div>
                </div>
                {enrichedData.days_since_last_order !== undefined && (
                  <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center gap-4 text-xs text-dark-400">
                    <span>Última compra: <span className="text-white">{enrichedData.days_since_last_order} dias atrás</span></span>
                    {enrichedData.order_frequency_days && (
                      <span>Frequência: <span className="text-white">~{Math.round(enrichedData.order_frequency_days)} dias</span></span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Última Compra */}
            {enrichedData?.last_order_products && enrichedData.last_order_products.length > 0 && (
              <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowLastOrder(!showLastOrder)}
                  className="w-full p-4 bg-dark-800/50 flex items-center justify-between hover:bg-dark-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                      Última Compra {enrichedData.last_order_number && `#${enrichedData.last_order_number}`}
                    </span>
                    {enrichedData.last_order_value && (
                      <span className="text-success-400 text-sm font-medium">
                        {formatCurrency(enrichedData.last_order_value)}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showLastOrder ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showLastOrder && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-2 bg-dark-900/30">
                        {enrichedData.last_order_products.slice(0, 5).map((product, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-dark-800/50">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
                                <Package className="w-5 h-5 text-dark-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{product.title}</p>
                              <p className="text-dark-400 text-xs">
                                {product.quantity}x {formatCurrency(product.price)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Produtos Favoritos */}
            {enrichedData?.favorite_products && enrichedData.favorite_products.length > 0 && (
              <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  className="w-full p-4 bg-dark-800/50 flex items-center justify-between hover:bg-dark-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                      Produtos Favoritos
                    </span>
                    <span className="text-dark-500 text-xs">
                      ({enrichedData.favorite_products.length})
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showFavorites ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showFavorites && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-2 bg-dark-900/30">
                        {enrichedData.favorite_products.slice(0, 5).map((product, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-dark-800/50">
                            <div className="flex items-center gap-2">
                              <span className="text-dark-500 text-xs font-bold w-5">#{idx + 1}</span>
                              <span className="text-white text-sm truncate">{product.title}</span>
                            </div>
                            <span className="text-primary-400 text-xs font-medium">
                              {product.count}x comprado
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Histórico de Compras */}
            {orderHistory && orderHistory.length > 0 && (
              <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowOrderHistory(!showOrderHistory)}
                  className="w-full p-4 bg-dark-800/50 flex items-center justify-between hover:bg-dark-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                      Histórico de Compras
                    </span>
                    <span className="text-dark-500 text-xs">
                      ({orderHistory.length} pedidos)
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showOrderHistory ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showOrderHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-3 bg-dark-900/30 max-h-80 overflow-y-auto">
                        {orderHistory.map((order, orderIdx) => (
                          <div key={orderIdx} className="border border-dark-700/30 rounded-lg overflow-hidden">
                            <div className="p-2 bg-dark-800/50 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-sm font-medium">
                                  Pedido #{order.order_number}
                                </span>
                                <span className="text-dark-500 text-xs">
                                  {new Date(order.order_date).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <span className="text-success-400 text-sm font-medium">
                                {formatCurrency(order.total)}
                              </span>
                            </div>
                            <div className="p-2 space-y-1">
                              {order.items.slice(0, 5).map((item, itemIdx) => (
                                <div key={itemIdx} className="flex items-center gap-2 p-1.5 rounded bg-dark-800/30">
                                  {item.product_image_url ? (
                                    <img
                                      src={item.product_image_url}
                                      alt={item.product_title}
                                      className="w-8 h-8 rounded object-cover"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded bg-dark-700 flex items-center justify-center">
                                      <Package className="w-4 h-4 text-dark-500" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs truncate">{item.product_title}</p>
                                    <p className="text-dark-500 text-xs">
                                      {item.quantity}x {formatCurrency(item.unit_price)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              {order.items.length > 5 && (
                                <p className="text-dark-500 text-xs text-center py-1">
                                  +{order.items.length - 5} outros itens
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Histórico de Navegação */}
            {((enrichedData?.last_viewed_products && enrichedData.last_viewed_products.length > 0) || 
              (browsingSessions && browsingSessions.length > 0)) && (
              <div className="border border-dark-700/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowBrowsingHistory(!showBrowsingHistory)}
                  className="w-full p-4 bg-dark-800/50 flex items-center justify-between hover:bg-dark-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                      Navegação no Site
                    </span>
                    {contact.total_page_views && (
                      <span className="text-dark-500 text-xs">
                        ({contact.total_page_views} páginas)
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showBrowsingHistory ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showBrowsingHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-3 bg-dark-900/30 max-h-80 overflow-y-auto">
                        {/* Produtos Visualizados Recentemente */}
                        {enrichedData?.last_viewed_products && enrichedData.last_viewed_products.length > 0 && (
                          <div>
                            <p className="text-dark-400 text-xs font-medium mb-2 flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              Produtos Visualizados
                            </p>
                            <div className="space-y-1">
                              {enrichedData.last_viewed_products.slice(0, 5).map((product, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-dark-800/50">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs truncate">{product.title}</p>
                                    <p className="text-dark-500 text-[10px]">
                                      {new Date(product.viewed_at).toLocaleString('pt-BR', { 
                                        day: '2-digit', 
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                  {product.price && (
                                    <span className="text-success-400 text-xs">
                                      {formatCurrency(product.price)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Sessões de Navegação */}
                        {browsingSessions && browsingSessions.length > 0 && (
                          <div>
                            <p className="text-dark-400 text-xs font-medium mb-2 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Sessões Recentes
                            </p>
                            <div className="space-y-2">
                              {browsingSessions.slice(0, 3).map((session, idx) => (
                                <div key={idx} className="p-2 rounded-lg bg-dark-800/50">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-white text-xs">
                                      {new Date(session.started_at).toLocaleDateString('pt-BR')} às {new Date(session.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="text-dark-400 text-xs">
                                      {session.page_views} páginas
                                    </span>
                                  </div>
                                  {session.utm_source && (
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-dark-700 text-dark-300">
                                        {session.utm_source}
                                        {session.utm_medium && ` / ${session.utm_medium}`}
                                      </span>
                                    </div>
                                  )}
                                  {session.products_viewed && session.products_viewed.length > 0 && (
                                    <div className="text-dark-500 text-[10px]">
                                      Viu: {session.products_viewed.slice(0, 2).map(p => p.product_title).join(', ')}
                                      {session.products_viewed.length > 2 && ` +${session.products_viewed.length - 2}`}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                    const isAutomatic = activity.source && activity.source !== 'manual'
                    const activityDate = activity.occurred_at || activity.created_at
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-dark-800/50 transition-colors group"
                      >
                        <div className={`p-2 rounded-lg ${actType.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white text-sm">{activity.title}</p>
                            {isAutomatic && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-dark-700 text-dark-400">
                                {activity.source === 'shopify' ? 'Shopify' : activity.source}
                              </span>
                            )}
                          </div>
                          <p className="text-dark-500 text-xs">{formatDate(activityDate)}</p>
                        </div>
                        {!isAutomatic && (
                          <button
                            onClick={() => openDeleteActivityConfirm(activity.id)}
                            className="p-1 rounded text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-60 flex items-center justify-center p-4"
              onClick={() => {
                setShowDeleteConfirm(false)
                setDealToDelete(null)
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Modal Content */}
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Trash2 className="w-7 h-7 text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Remover Deal?</h3>
                  <p className="text-dark-400 text-sm mb-6">
                    Tem certeza que deseja remover este deal da pipeline? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false)
                        setDealToDelete(null)
                      }}
                      disabled={deletingDeal}
                      className="flex-1 px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-dark-300 font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmDeleteDeal}
                      disabled={deletingDeal}
                      className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {deletingDeal ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Removendo...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Remover
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Activity Confirmation Modal */}
        <AnimatePresence>
          {showDeleteActivityConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-60 flex items-center justify-center p-4"
              onClick={() => {
                setShowDeleteActivityConfirm(false)
                setActivityToDelete(null)
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
              >
                {/* Modal Content */}
                <div className="p-6 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Trash2 className="w-7 h-7 text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Excluir Atividade?</h3>
                  <p className="text-dark-400 text-sm mb-6">
                    Tem certeza que deseja excluir esta atividade? Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteActivityConfirm(false)
                        setActivityToDelete(null)
                      }}
                      disabled={deletingActivity}
                      className="flex-1 px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-dark-300 font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmDeleteActivity}
                      disabled={deletingActivity}
                      className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {deletingActivity ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Excluindo...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
