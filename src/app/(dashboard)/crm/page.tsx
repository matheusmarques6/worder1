'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  MoreHorizontal,
  Clock,
  ChevronDown,
  Search,
  Filter,
  AlertCircle,
  Settings,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  DollarSign,
  User,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Star,
  ShoppingBag,
  TrendingUp,
  MapPin,
} from 'lucide-react'
import { useDeals, usePipelines } from '@/hooks'
import { useCRMStore, useAuthStore } from '@/stores'
import { CreateDealModal, DealDrawer, PipelineModal, EditStageModal } from '@/components/crm'
import type { Deal, Pipeline, PipelineStage, CreateDealData } from '@/types'

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value)
}

const getInitials = (firstName?: string, lastName?: string) => {
  const first = firstName?.[0] || ''
  const last = lastName?.[0] || ''
  return (first + last).toUpperCase() || '?'
}

// ==========================================
// CUSTOM COLLISION DETECTION
// Usa closestCenter que funciona melhor com múltiplos itens
// ==========================================
const customCollisionDetection: CollisionDetection = (args) => {
  // Primeiro tenta pointerWithin para detecção precisa
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    return pointerCollisions
  }
  
  // Fallback para closestCenter
  return closestCenter(args)
}

// ==========================================
// DEAL CARD COMPONENT - Design inspirado Pipedrive/Kommo
// ==========================================

const avatarColors = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function getRelativeTime(date: string) {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// Tag color helper
const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'inbound': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'ads facebook': { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  'ads google': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  'tráfego pago': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  'youtube': { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  'tiktok ads': { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  'site principal': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'outbound': { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  'social selling': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

function getTagColors(tag: string) {
  const key = tag.toLowerCase()
  return TAG_COLORS[key] || { bg: 'bg-dark-700/60', text: 'text-dark-300', border: 'border-dark-600/40' }
}

// Helper to detect calendly/booking URLs from custom_fields
function extractBookingUrl(deal: Deal): string | null {
  const customFields = (deal as any).custom_fields || {}
  const formResponses = customFields.form_responses || []

  for (const response of formResponses) {
    const value = String(response.value || '')
    if (value.includes('calendly.com') || value.includes('cal.com') || value.includes('booking')) {
      return value
    }
  }
  return null
}

// Helper to extract contact info from form_responses as fallback
function extractFormContactData(deal: Deal): { email?: string; phone?: string; name?: string } {
  const customFields = (deal as any).custom_fields || {}
  const formResponses = customFields.form_responses || []
  const result: { email?: string; phone?: string; name?: string } = {}

  for (const response of formResponses) {
    const label = (response.label || '').toLowerCase()
    const value = response.value
    const type = (response.type || '').toLowerCase()

    if (!value) continue

    // Email detection
    if (!result.email) {
      if (type === 'email' || label.includes('email') || label.includes('e-mail')) {
        result.email = String(value)
      } else if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
        result.email = value
      }
    }

    // Phone detection
    if (!result.phone) {
      if (type === 'phone' || type === 'tel' || label.includes('telefone') || label.includes('celular') || label.includes('whatsapp') || label.includes('phone')) {
        result.phone = String(value)
      }
    }

    // Name detection
    if (!result.name) {
      if (label.includes('nome') || label.includes('name') || label === 'nome completo' || label === 'seu nome') {
        result.name = String(value)
      }
    }
  }

  return result
}

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
  onClick?: () => void
}

function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const contact = deal.contact as any

  // Extract from custom_fields
  const customFields = (deal as any).custom_fields || {}
  const formName = customFields.form_name
  const formResponses = customFields.form_responses || []
  const bookingUrl = extractBookingUrl(deal)
  const assignedUser = deal.assigned_user
  const dealId = deal.id.split('-')[0]

  // Extract data from form_responses as fallback
  const formData = extractFormContactData(deal)

  // Use contact data OR fallback to form data
  const email = contact?.email || formData.email
  const phone = contact?.whatsapp || contact?.phone || formData.phone
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email
    : formData.name || deal.title
  const displayName = contactName || deal.title

  // UTM data
  const utmSource = customFields.utm_source
  const utmMedium = customFields.utm_medium
  const utmCampaign = customFields.utm_campaign
  const hasUtm = utmSource || utmMedium || utmCampaign

  // Contact metrics
  const lifetimeValue = contact?.lifetime_value || contact?.total_spent || 0
  const totalOrders = contact?.total_orders || 0
  const score = contact?.score || 0
  const position = contact?.position
  const city = contact?.city
  const country = contact?.country
  const company = contact?.company
  const hasCustomerHistory = lifetimeValue > 0 || totalOrders > 0

  return (
    <div
      onClick={onClick}
      className={`
        p-4 bg-white border border-gray-200 rounded-xl cursor-pointer
        hover:border-gray-300 hover:bg-white transition-all group
        ${isDragging ? 'opacity-50 scale-105 shadow-xl shadow-primary-500/10 rotate-2' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-brand-500 transition-colors">
          {deal.title}
        </h4>
        <button 
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {deal.contact && (
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-white">
              {getInitials(deal.contact.first_name, deal.contact.last_name)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-white truncate">{contactName}</p>
            {deal.contact.company && (
              <p className="text-[10px] text-gray-500 truncate">{deal.contact.company}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-success-400">{formatCurrency(deal.value)}</span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500">{deal.probability}%</span>
        </div>
      </div>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {deal.tags.slice(0, 2).map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-600 text-[10px]"
            >
              {tag}
            </span>
          ))}
          {deal.tags.length > 2 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px]">
              +{deal.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      {deal.expected_close_date && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{new Date(deal.expected_close_date).toLocaleDateString('pt-BR')}</span>
        </div>
      )}

      <div className="p-3">
        {/* Top row: Avatar + Name + ID */}
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(displayName)} flex items-center justify-center flex-shrink-0`}>
            <span className="text-[11px] font-bold text-white">
              {getInitials(contact?.first_name || deal.title?.split(' ')[0], contact?.last_name || deal.title?.split(' ')[1])}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-white truncate leading-tight">
                {displayName}
              </h4>
              <span className="text-[9px] text-dark-600 flex-shrink-0 font-mono">
                #{dealId}
              </span>
            </div>

            {/* Position row */}
            {position && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="flex items-center gap-1 text-[10px] text-dark-500 truncate">
                  <Briefcase className="w-3 h-3 flex-shrink-0" />
                  {position}
                </span>
              </div>
            )}

            {/* Form origin */}
            {formName && (
              <p className="text-[10px] text-primary-400 truncate mt-0.5">{formName}</p>
            )}
          </div>
        </div>

        {/* Contact Info - Always visible (from contact OR form_responses) */}
        <div className="mt-2 pl-[46px] space-y-1">
          {email && (
            <div className="flex items-center gap-1.5 text-[10px] text-dark-300">
              <Mail className="w-3 h-3 text-blue-400" />
              <span className="truncate">{email}</span>
            </div>
          )}
          {phone && (
            <div className="flex items-center gap-1.5 text-[10px] text-dark-300">
              <Phone className="w-3 h-3 text-emerald-400" />
              <span>{phone}</span>
            </div>
          )}
          {company && (
            <div className="flex items-center gap-1.5 text-[10px] text-dark-400">
              <Building2 className="w-3 h-3 text-dark-500" />
              <span className="truncate">{company}</span>
            </div>
          )}
          {(city || country) && (
            <div className="flex items-center gap-1.5 text-[10px] text-dark-500">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{[city, country].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>

        {/* UTM Info - Show source/campaign */}
        {hasUtm && (
          <div className="mt-1.5 pl-[46px] flex flex-wrap gap-1">
            {utmSource && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/30">
                {utmSource}
              </span>
            )}
            {utmMedium && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {utmMedium}
              </span>
            )}
            {utmCampaign && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 truncate max-w-[120px]">
                {utmCampaign}
              </span>
            )}
          </div>
        )}

        {/* Value & Time row */}
        <div className="flex items-center justify-between mt-2.5 pl-[46px]">
          <span className={`text-[13px] font-bold ${deal.value > 0 ? 'text-emerald-400' : 'text-dark-500'}`}>
            {formatCurrency(deal.value)}
          </span>
          <div className="flex items-center gap-1 text-dark-500 text-[10px]">
            <Clock className="w-3 h-3" />
            <span>{getRelativeTime(deal.updated_at || deal.created_at)}</span>
          </div>
        </div>

        {/* Assigned User */}
        {assignedUser && (
          <div className="flex items-center gap-1 mt-1.5 pl-[46px] text-[10px] text-dark-400">
            <User className="w-3 h-3" />
            <span className="truncate">{assignedUser.name || assignedUser.email}</span>
          </div>
        )}

        {/* Tags row */}
        {deal.tags && deal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pl-[46px]">
            {deal.tags.slice(0, 3).map((tag, i) => {
              const colors = getTagColors(tag)
              return (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {tag}
                </span>
              )
            })}
            {deal.tags.length > 3 && (
              <span className="text-[9px] text-dark-500 py-0.5">+{deal.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Quick actions - Always visible */}
        {(phone || email) && (
          <div className="flex items-center gap-1.5 mt-2.5 pl-[46px]">
            {phone && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(`https://wa.me/${phone.replace(/\D/g, '')}`)
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-[10px] font-medium"
                title="WhatsApp"
              >
                <Phone className="w-3 h-3" />
                WhatsApp
              </button>
            )}
            {email && (
              <button
                onClick={(e) => { e.stopPropagation(); window.open(`mailto:${email}`) }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors text-[10px] font-medium"
                title="E-mail"
              >
                <Mail className="w-3 h-3" />
                E-mail
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================
// SORTABLE DEAL COMPONENT
// ==========================================

interface SortableDealProps {
  deal: Deal
  onDealClick: (deal: Deal) => void
}

function SortableDeal({ deal, onDealClick }: SortableDealProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard deal={deal} isDragging={isDragging} onClick={() => onDealClick(deal)} />
    </div>
  )
}

// ==========================================
// KANBAN COLUMN COMPONENT
// ==========================================

interface KanbanColumnProps {
  stage: PipelineStage
  deals: Deal[]
  onAddDeal: () => void
  onDealClick: (deal: Deal) => void
  onEditStage: (stage: PipelineStage) => void
}

function KanbanColumn({ stage, deals, onAddDeal, onDealClick, onEditStage }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  const safeDeals = Array.isArray(deals) ? deals : []
  const totalValue = safeDeals.reduce((sum, deal) => sum + (deal.value || 0), 0)

  return (
    <div className="flex-shrink-0 w-[300px]">
      <div
        ref={setNodeRef}
        className={`
          h-full flex flex-col bg-white/30 rounded-2xl border transition-all duration-200
          ${isOver ? 'border-brand-400 bg-brand-50/50 scale-[1.02]' : 'border-gray-200'}
        `}
      >
        {/* Column Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => onEditStage(stage)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity group min-w-0"
              title="Editar estágio"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <h3 className="font-semibold text-white group-hover:text-brand-500 transition-colors">{stage.name}</h3>
              <span className="px-2 py-0.5 rounded-full bg-gray-50 text-xs text-gray-500">
                {safeDeals.length}
              </span>
              <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button 
              onClick={onAddDeal}
              className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-white transition-colors"
              title="Adicionar deal"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {totalValue > 0 && (
                <span className="text-[11px] text-dark-500 font-medium mr-1">{formatCurrency(totalValue)}</span>
              )}
              <button
                onClick={onAddDeal}
                className="p-1 rounded hover:bg-dark-800 text-dark-500 hover:text-white transition-colors"
                title="Adicionar deal"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-success-400 font-medium">{formatCurrency(totalValue)}</span>
            <span className="text-gray-400 text-xs">
              Ponderado: {formatCurrency(weightedValue)}
            </span>
          </div>
        </div>

        {/* Deals */}
        <div className="flex-1 px-1 space-y-1.5 overflow-y-auto custom-scrollbar min-h-[200px]">
          <SortableContext items={safeDeals.map(d => d.id)} strategy={verticalListSortingStrategy}>
            {safeDeals.map(deal => (
              <SortableDeal key={deal.id} deal={deal} onDealClick={onDealClick} />
            ))}
          </SortableContext>

          {safeDeals.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-400">Arraste deals para cá</p>
            </div>
          )}
        </div>

        {/* Add Deal Button */}
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={onAddDeal}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[12px]">Adicionar</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// LOADING STATE
// ==========================================

function LoadingState() {
  return (
    <div className="h-[calc(100vh-120px)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Carregando CRM...</p>
      </div>
    </div>
  )
}

// ==========================================
// ERROR STATE
// ==========================================

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="h-[calc(100vh-120px)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Erro ao carregar</h3>
        <p className="text-gray-500 mb-4 max-w-sm">{error.message}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  )
}

// ==========================================
// EMPTY STATE
// ==========================================

function EmptyState({ onCreatePipeline }: { onCreatePipeline: () => void }) {
  return (
    <div className="h-[calc(100vh-120px)] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Settings className="w-10 h-10 text-brand-500" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Nenhum pipeline encontrado</h3>
        <p className="text-gray-500 mb-6">
          Crie seu primeiro pipeline para começar a gerenciar seus deals e oportunidades.
        </p>
        <button
          onClick={onCreatePipeline}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          <Plus className="w-5 h-5" />
          Criar Pipeline
        </button>
      </div>
    </div>
  )
}

// ==========================================
// MAIN CRM PAGE
// ==========================================

export default function CRMPage() {
  const { user } = useAuthStore()
  const { 
    deals, 
    pipelines, 
    loading, 
    error,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDeal,
    refetch,
    refetchPipelines
  } = useDeals()
  const { createPipeline: createPipelineHook, updatePipeline, deletePipeline: deletePipelineHook, createStage, updateStage, deleteStage } = usePipelines()
  
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null)
  const [showPipelineDropdown, setShowPipelineDropdown] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null)
  const [showCreateDealModal, setShowCreateDealModal] = useState(false)
  const [createDealStageId, setCreateDealStageId] = useState<string>('')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [isMovingDeal, setIsMovingDeal] = useState(false) // ✅ NOVO: Controlar movimento em progresso
  const [showEditStageModal, setShowEditStageModal] = useState(false)
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filters, setFilters] = useState({
    minValue: '',
    maxValue: '',
    hasContact: 'all' as 'all' | 'yes' | 'no',
    status: 'open' as 'all' | 'open' | 'won' | 'lost', // Default: só deals abertos
  })

  // Set active pipeline when pipelines load
  useEffect(() => {
    if (pipelines.length > 0 && !activePipeline) {
      setActivePipeline(pipelines[0])
    }
  }, [pipelines, activePipeline])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Get stages for active pipeline
  const stages = activePipeline?.stages || []

  // Get deals for a specific stage with search and filters
  const getStageDeals = useCallback((stageId: string) => {
    let filteredDeals = deals.filter(deal => deal.stage_id === stageId)
    
    // Apply status filter (default: only open deals in Kanban)
    if (filters.status !== 'all') {
      filteredDeals = filteredDeals.filter(deal => deal.status === filters.status)
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filteredDeals = filteredDeals.filter(deal => 
        deal.title?.toLowerCase().includes(query) ||
        deal.contact?.first_name?.toLowerCase().includes(query) ||
        deal.contact?.last_name?.toLowerCase().includes(query) ||
        deal.contact?.email?.toLowerCase().includes(query) ||
        deal.contact?.company?.toLowerCase().includes(query) ||
        deal.value?.toString().includes(query)
      )
    }
    
    // Apply value filters
    if (filters.minValue) {
      const min = parseFloat(filters.minValue)
      if (!isNaN(min)) {
        filteredDeals = filteredDeals.filter(deal => deal.value >= min)
      }
    }
    
    if (filters.maxValue) {
      const max = parseFloat(filters.maxValue)
      if (!isNaN(max)) {
        filteredDeals = filteredDeals.filter(deal => deal.value <= max)
      }
    }
    
    // Apply contact filter
    if (filters.hasContact === 'yes') {
      filteredDeals = filteredDeals.filter(deal => deal.contact_id)
    } else if (filters.hasContact === 'no') {
      filteredDeals = filteredDeals.filter(deal => !deal.contact_id)
    }
    
    return filteredDeals
  }, [deals, searchQuery, filters])
  
  // Check if any filters are active (besides default status='open')
  const hasActiveFilters = filters.minValue || filters.maxValue || filters.hasContact !== 'all' || filters.status !== 'open'
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({ minValue: '', maxValue: '', hasContact: 'all', status: 'open' })
    setSearchQuery('')
  }

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const dealId = event.active.id as string
    const deal = deals.find((d: Deal) => d.id === dealId)
    if (deal) setActiveDeal(deal)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Handle drag over logic if needed
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null)
    const { active, over } = event
    
    if (!over) return
    
    // ✅ Evitar movimentos duplicados
    if (isMovingDeal) {
      console.log('[DnD] Movement already in progress, ignoring...')
      return
    }
    
    const dealId = active.id as string
    const overId = over.id as string
    
    // Se soltou no mesmo lugar, ignorar
    if (dealId === overId) return
    
    // Encontrar o deal que está sendo arrastado
    const draggedDeal = deals.find((d: Deal) => d.id === dealId)
    if (!draggedDeal) return
    
    // Função auxiliar para mover deal com controle de loading
    const executeMove = async (targetStageId: string, targetName: string) => {
      if (draggedDeal.stage_id === targetStageId) {
        console.log(`[DnD] Deal already in stage ${targetName}, skipping move`)
        return
      }
      
      try {
        setIsMovingDeal(true)
        console.log(`[DnD] Moving deal "${draggedDeal.title}" to stage "${targetName}"`)
        await moveDeal(dealId, targetStageId)
        console.log(`[DnD] Move completed successfully`)
      } catch (err) {
        console.error('[DnD] Move failed:', err)
      } finally {
        setIsMovingDeal(false)
      }
    }
    
    // Primeiro: verificar se soltou em um estágio (coluna)
    const targetStage = stages.find((s: PipelineStage) => s.id === overId)
    if (targetStage) {
      await executeMove(targetStage.id, targetStage.name)
      return
    }
    
    // Segundo: verificar se soltou em outro deal
    const targetDeal = deals.find((d: Deal) => d.id === overId)
    if (targetDeal) {
      const stage = stages.find((s: PipelineStage) => s.id === targetDeal.stage_id)
      await executeMove(targetDeal.stage_id, stage?.name || 'unknown')
      return
    }
    
    // Terceiro: fallback - buscar estágio pelo deal target
    console.log(`[DnD] Unknown target: ${overId}, trying fallback lookup...`)
    for (const stage of stages) {
      const stageDeals = deals.filter(d => d.stage_id === stage.id)
      if (stageDeals.some(d => d.id === overId)) {
        await executeMove(stage.id, stage.name)
        return
      }
    }
    
    console.log(`[DnD] Could not determine target stage for ${overId}`)
  }

  // Pipeline handlers
  const handlePipelineSelect = (pipeline: Pipeline) => {
    setActivePipeline(pipeline)
    setShowPipelineDropdown(false)
  }

  const handleCreatePipeline = async (data: { name: string; description?: string; color?: string; stages: { id?: string; name: string; color: string; position: number }[] }) => {
    const pipelineIdToUpdate = editingPipeline?.id
    
    if (editingPipeline) {
      // Atualizar pipeline
      const { stages: newStages, ...pipelineData } = data
      await updatePipeline(editingPipeline.id, pipelineData)
      
      // Atualizar estágios
      const existingStageIds = editingPipeline.stages?.map(s => s.id) || []
      const newStageIds = newStages.filter(s => s.id).map(s => s.id!)
      
      // 1. Deletar estágios removidos
      for (const existingId of existingStageIds) {
        if (!newStageIds.includes(existingId)) {
          await deleteStage(existingId)
        }
      }
      
      // 2. Atualizar/Criar estágios
      for (const stage of newStages) {
        if (stage.id && existingStageIds.includes(stage.id)) {
          // Atualizar existente
          await updateStage(stage.id, { 
            name: stage.name, 
            color: stage.color, 
            position: stage.position 
          })
        } else {
          // Criar novo
          await createStage(editingPipeline.id, { 
            name: stage.name, 
            color: stage.color 
          })
        }
      }
    } else {
      await createPipelineHook(data)
    }
    
    // Refetch e atualizar activePipeline
    await refetchPipelines()
    
    // Aguardar um tick para o state atualizar e depois atualizar activePipeline
    // Usar setTimeout 0 para permitir que o React processe o update do state
    setTimeout(async () => {
      // Buscar pipeline atualizado diretamente da API
      if (pipelineIdToUpdate) {
        try {
          const response = await fetch(
            `/api/deals?organizationId=${user?.organization_id}&type=pipelines`
          )
          if (response.ok) {
            const result = await response.json()
            const updatedPipeline = result.pipelines?.find((p: any) => p.id === pipelineIdToUpdate)
            if (updatedPipeline) {
              setActivePipeline(updatedPipeline)
            }
          }
        } catch (e) {
          console.error('Error fetching updated pipeline:', e)
        }
      }
    }, 100)
    
    setShowPipelineModal(false)
    setEditingPipeline(null)
  }

  const handleEditPipeline = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline)
    setShowPipelineDropdown(false)
    setShowPipelineModal(true)
  }

  const handleDeletePipeline = async (pipeline: Pipeline) => {
    if (!confirm(`Tem certeza que deseja excluir o pipeline "${pipeline.name}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    
    try {
      await deletePipelineHook(pipeline.id)
      await refetchPipelines()
      
      // Se deletou o pipeline ativo, seleciona o primeiro disponível
      if (activePipeline?.id === pipeline.id) {
        const remainingPipelines = pipelines.filter(p => p.id !== pipeline.id)
        setActivePipeline(remainingPipelines[0] || null)
      }
    } catch (error) {
      console.error('Error deleting pipeline:', error)
    }
    setShowPipelineDropdown(false)
  }

  // Stage handlers
  const handleEditStage = (stage: PipelineStage) => {
    setEditingStage(stage)
    setShowEditStageModal(true)
  }

  const handleUpdateStage = async (stageId: string, data: { name: string; color: string; probability?: number }) => {
    await updateStage(stageId, data)
    await refetchPipelines()
    setShowEditStageModal(false)
    setEditingStage(null)
  }

  const handleDeleteStage = async (stageId: string) => {
    await deleteStage(stageId)
    await refetchPipelines()
    setShowEditStageModal(false)
    setEditingStage(null)
  }

  // Deal handlers
  const handleAddDealToStage = (stageId: string) => {
    setCreateDealStageId(stageId)
    setShowCreateDealModal(true)
  }

  const handleCreateDeal = async (data: CreateDealData) => {
    await createDeal(data)
    await refetch()
  }

  const handleUpdateDeal = async (id: string, data: Partial<Deal>) => {
    await updateDeal(id, data)
    await refetch()
  }

  const handleDeleteDeal = async (id: string) => {
    await deleteDeal(id)
    await refetch()
  }

  // Calculate pipeline stats - FILTRAR PELA PIPELINE ATIVA
  // ✅ PROTEÇÃO: Garantir arrays antes de usar métodos
  const safeStages = Array.isArray(stages) ? stages : []
  const safeAllDeals = Array.isArray(deals) ? deals : []
  const pipelineStageIds = new Set(safeStages.map(s => s.id))
  const pipelineDeals = safeAllDeals.filter(d => pipelineStageIds.has(d.stage_id))
  const uniqueContacts = new Set(pipelineDeals.filter(d => d.contact_id).map(d => d.contact_id)).size
  const pipelineStats = {
    weightedValue: pipelineDeals.reduce((sum, d) => sum + ((d.value || 0) * (d.probability || 0) / 100), 0),
    totalDeals: pipelineDeals.length,
    totalContacts: uniqueContacts,
  }

  // Loading state
  if (loading && pipelines.length === 0) {
    return <LoadingState />
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={refetch} />
  }

  // Empty state - no pipelines
  if (pipelines.length === 0) {
    return (
      <>
        <EmptyState onCreatePipeline={() => setShowPipelineModal(true)} />
        <PipelineModal
          isOpen={showPipelineModal}
          onClose={() => setShowPipelineModal(false)}
          onSave={handleCreatePipeline}
        />
      </>
    )
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Top Bar - Compact */}
      <div className="flex items-center gap-2 mb-4">
        {/* Pipeline Selector */}
        <div className="relative">
          <button
            onClick={() => setShowPipelineDropdown(!showPipelineDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white hover:bg-white transition-colors"
          >
            <span className="font-medium">{activePipeline?.name || 'Selecionar'}</span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showPipelineDropdown ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showPipelineDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                <div className="p-2">
                    {pipelines.map(pipeline => (
                      <div
                        key={pipeline.id}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors group ${
                          activePipeline?.id === pipeline.id
                            ? 'bg-brand-100'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <button
                          onClick={() => handlePipelineSelect(pipeline)}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: pipeline.color || '#f97316' }}
                          />
                          <span className={`flex-1 text-left truncate ${
                            activePipeline?.id === pipeline.id ? 'text-brand-600' : 'text-gray-600'
                          }`}>
                            {pipeline.name}
                          </span>
                          {activePipeline?.id === pipeline.id && (
                            <span className="text-xs text-brand-600 flex-shrink-0">Ativo</span>
                          )}
                        </button>
                        
                        {/* Edit/Delete buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditPipeline(pipeline)
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-200 transition-colors"
                            title="Editar pipeline"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeletePipeline(pipeline)
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Excluir pipeline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 p-2">
                    <button
                      onClick={() => {
                        setShowPipelineDropdown(false)
                        setEditingPipeline(null)
                        setShowPipelineModal(true)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Pipeline</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-brand-400 w-64 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </AnimatePresence>
        </div>

          {/* Filter */}
          <div className="relative">
            <button 
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`p-2.5 rounded-xl border transition-all ${
                hasActiveFilters 
                  ? 'bg-brand-100 border-brand-400 text-brand-600' 
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-white hover:bg-white'
              }`}
            >
              <Filter className="w-5 h-5" />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary-500 rounded-full" />
              )}
            </button>
            
            {/* Filter Dropdown */}
            <AnimatePresence>
              {showFilterDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl shadow-black/20 z-20 overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-gray-200 bg-white/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-brand-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Filters Content */}
                  <div className="p-5 space-y-5">
                    {/* Status Filter */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-3">
                        📊 Status do Deal
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { value: 'open', label: 'Abertos', color: 'bg-yellow-500' },
                          { value: 'won', label: 'Ganhos', color: 'bg-green-500' },
                          { value: 'lost', label: 'Perdidos', color: 'bg-red-500' },
                          { value: 'all', label: 'Todos', color: 'bg-gray-300' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => setFilters(f => ({ ...f, status: option.value as any }))}
                            className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                              filters.status === option.value
                                ? `${option.color} text-white shadow-lg`
                                : 'bg-white/80 text-gray-500 border border-gray-300/50 hover:border-gray-300 hover:text-gray-600'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Value Range */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-3">
                        <DollarSign className="w-3.5 h-3.5" />
                        Valor do Deal
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={filters.minValue}
                            onChange={(e) => setFilters(f => ({ ...f, minValue: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2.5 bg-white/80 border border-gray-300/50 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                        <div className="text-gray-400 text-sm font-medium">até</div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                          <input
                            type="number"
                            placeholder="∞"
                            value={filters.maxValue}
                            onChange={(e) => setFilters(f => ({ ...f, maxValue: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2.5 bg-white/80 border border-gray-300/50 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Has Contact */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-3">
                        <User className="w-3.5 h-3.5" />
                        Contato Vinculado
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'all', label: 'Todos', icon: '📋' },
                          { value: 'yes', label: 'Com', icon: '✓' },
                          { value: 'no', label: 'Sem', icon: '✗' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => setFilters(f => ({ ...f, hasContact: option.value as any }))}
                            className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                              filters.hasContact === option.value
                                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                : 'bg-white/80 text-gray-500 border border-gray-300/50 hover:border-gray-300 hover:text-gray-600'
                            }`}
                          >
                            <span className="mr-1">{option.icon}</span>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="px-5 py-4 border-t border-gray-200 bg-white/30 flex gap-3">
                    <button
                      onClick={() => {
                        clearFilters()
                        setShowFilterDropdown(false)
                      }}
                      className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-100 rounded-xl text-gray-600 text-sm font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => setShowFilterDropdown(false)}
                      className="flex-1 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white text-sm font-medium transition-colors shadow-lg shadow-primary-500/25"
                    >
                      Aplicar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <button 
            onClick={() => {
              if (stages.length > 0) {
                handleAddDealToStage(stages[0].id)
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors shadow-lg shadow-primary-500/20"
          >
            <Plus className="w-5 h-5" />
            <span>Novo Deal</span>
          </button>
      </div>

      {/* Pipeline Stats */}
      <div className="flex items-center gap-6 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div>
          <p className="text-sm text-gray-500">Valor Ponderado</p>
          <p className="text-xl font-bold text-success-400">{formatCurrency(pipelineStats.weightedValue)}</p>
        </div>
        <div className="w-px h-10 bg-gray-100" />
        <div>
          <p className="text-sm text-gray-500">Contatos na Pipeline</p>
          <p className="text-xl font-bold text-gray-900">{pipelineStats.totalContacts}</p>
        </div>
        <div className="w-px h-10 bg-gray-100" />
        <div>
          <p className="text-sm text-gray-500">Deals Abertos</p>
          <p className="text-xl font-bold text-gray-900">{pipelineStats.totalDeals}</p>
        </div>
        <div className="w-px h-10 bg-gray-100" />
        <div>
          <p className="text-sm text-gray-500">Estágios</p>
          <p className="text-xl font-bold text-gray-900">{stages.length}</p>
        </div>
        
        {/* Refresh Button */}
        <div className="ml-auto">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Atualizar"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />}
          </button>

          <AnimatePresence>
            {showFilterDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute left-0 top-full mt-1 w-72 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20"
              >
                <div className="p-3 space-y-3">
                  {/* Status */}
                  <div>
                    <label className="text-[11px] font-medium text-dark-400 uppercase tracking-wider mb-2 block">Status</label>
                    <div className="flex gap-1">
                      {[
                        { value: 'open', label: 'Abertos' },
                        { value: 'won', label: 'Ganhos' },
                        { value: 'lost', label: 'Perdidos' },
                        { value: 'all', label: 'Todos' },
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => setFilters(f => ({ ...f, status: option.value as any }))}
                          className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                            filters.status === option.value
                              ? 'bg-primary-500 text-white'
                              : 'bg-dark-900/60 text-dark-400 hover:text-dark-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Value */}
                  <div>
                    <label className="text-[11px] font-medium text-dark-400 uppercase tracking-wider mb-2 block">Valor</label>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Min" value={filters.minValue} onChange={(e) => setFilters(f => ({ ...f, minValue: e.target.value }))} className="flex-1 px-2 py-1.5 bg-dark-900/60 border border-dark-600/40 rounded text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50" />
                      <span className="text-dark-500 text-xs">-</span>
                      <input type="number" placeholder="Max" value={filters.maxValue} onChange={(e) => setFilters(f => ({ ...f, maxValue: e.target.value }))} className="flex-1 px-2 py-1.5 bg-dark-900/60 border border-dark-600/40 rounded text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50" />
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="text-[11px] font-medium text-dark-400 uppercase tracking-wider mb-2 block">Contato</label>
                    <div className="flex gap-1">
                      {[
                        { value: 'all', label: 'Todos' },
                        { value: 'yes', label: 'Com contato' },
                        { value: 'no', label: 'Sem contato' },
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => setFilters(f => ({ ...f, hasContact: option.value as any }))}
                          className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                            filters.hasContact === option.value
                              ? 'bg-primary-500 text-white'
                              : 'bg-dark-900/60 text-dark-400 hover:text-dark-300'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="border-t border-dark-700 p-2">
                    <button onClick={() => { clearFilters(); setShowFilterDropdown(false) }} className="w-full text-center text-xs text-dark-400 hover:text-white py-1 transition-colors">
                      Limpar filtros
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer + Stats inline */}
        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-4 text-[12px] text-dark-500 mr-2">
          <span><span className="text-emerald-400 font-semibold">{formatCurrency(pipelineStats.weightedValue)}</span> ponderado</span>
          <span className="text-dark-700">|</span>
          <span><span className="text-white font-medium">{pipelineStats.totalDeals}</span> deals</span>
          <span className="text-dark-700">|</span>
          <span><span className="text-white font-medium">{pipelineStats.totalContacts}</span> contatos</span>
        </div>

        <button
          onClick={() => refetch()}
          disabled={loading}
          className="p-2 rounded-lg text-dark-500 hover:text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={() => { if (stages.length > 0) handleAddDealToStage(stages[0].id) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Deal</span>
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max">
            {stages.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={getStageDeals(stage.id)}
                onAddDeal={() => handleAddDealToStage(stage.id)}
                onDealClick={setSelectedDeal}
                onEditStage={handleEditStage}
              />
            ))}
            
            {/* Add Column Button */}
            <button 
              onClick={() => {
                setEditingPipeline(activePipeline)
                setShowPipelineModal(true)
              }}
              className="flex-shrink-0 w-80 h-full min-h-[400px] flex flex-col items-center justify-center gap-2 bg-white/20 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-all"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Editar Estágios</span>
            </button>
          </div>

          <DragOverlay>
            {activeDeal && <DealCard deal={activeDeal} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Create Deal Modal */}
      <CreateDealModal
        isOpen={showCreateDealModal}
        pipelineId={activePipeline?.id || ''}
        stageId={createDealStageId}
        stages={stages}
        onClose={() => setShowCreateDealModal(false)}
        onCreate={handleCreateDeal}
      />

      {/* Deal Drawer */}
      <DealDrawer
        deal={selectedDeal}
        stages={stages}
        onClose={() => setSelectedDeal(null)}
        onUpdate={handleUpdateDeal}
        onDelete={handleDeleteDeal}
      />

      {/* Pipeline Modal */}
      <PipelineModal
        isOpen={showPipelineModal}
        pipeline={editingPipeline}
        onClose={() => {
          setShowPipelineModal(false)
          setEditingPipeline(null)
        }}
        onSave={handleCreatePipeline}
      />

      {/* Edit Stage Modal */}
      <EditStageModal
        isOpen={showEditStageModal}
        stage={editingStage}
        totalStages={stages.length}
        onClose={() => {
          setShowEditStageModal(false)
          setEditingStage(null)
        }}
        onSave={handleUpdateStage}
        onDelete={handleDeleteStage}
      />

      {/* Close dropdown when clicking outside */}
      {showPipelineDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowPipelineDropdown(false)} 
        />
      )}
      {showFilterDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowFilterDropdown(false)} 
        />
      )}
    </div>
  )
}
