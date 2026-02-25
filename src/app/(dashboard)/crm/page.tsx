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

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
  onClick?: () => void
}

function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const contactName = deal.contact
    ? `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim() || deal.contact.email
    : null
  const displayName = contactName || deal.title

  return (
    <div
      onClick={onClick}
      className={`
        bg-dark-800 border border-dark-700/60 rounded-lg cursor-pointer
        hover:border-dark-500 transition-all group
        ${isDragging ? 'opacity-60 shadow-2xl shadow-black/40 scale-[1.02] rotate-1' : ''}
      `}
    >
      <div className="p-3">
        {/* Top row: Avatar + Name + Time */}
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(displayName)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <span className="text-[11px] font-bold text-white">
              {getInitials(deal.contact?.first_name || deal.title?.split(' ')[0], deal.contact?.last_name || deal.title?.split(' ')[1])}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-white truncate leading-tight">
                {displayName}
              </h4>
              <span className="text-[10px] text-dark-500 flex-shrink-0">
                {getRelativeTime(deal.updated_at || deal.created_at)}
              </span>
            </div>
            {deal.contact?.company && (
              <p className="text-[11px] text-dark-400 truncate mt-0.5">{deal.contact.company}</p>
            )}
            {contactName && contactName !== deal.title && (
              <p className="text-[11px] text-dark-500 truncate mt-0.5">{deal.title}</p>
            )}
          </div>
        </div>

        {/* Bottom row: Value + Tags + Actions */}
        <div className="flex items-center justify-between mt-2.5 pl-[42px]">
          <div className="flex items-center gap-2 min-w-0">
            {deal.value > 0 && (
              <span className="text-[12px] font-semibold text-emerald-400">
                {formatCurrency(deal.value)}
              </span>
            )}
            {(deal as any).source && (
              <span className="px-1.5 py-0.5 rounded bg-dark-700/80 text-[10px] text-dark-400 capitalize">
                {(deal as any).source}
              </span>
            )}
            {deal.tags && deal.tags.length > 0 && (
              <>
                {deal.tags.slice(0, 1).map((tag, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-primary-500/15 text-[10px] text-primary-400 truncate max-w-[80px]">
                    {tag}
                  </span>
                ))}
                {deal.tags.length > 1 && (
                  <span className="text-[10px] text-dark-500">+{deal.tags.length - 1}</span>
                )}
              </>
            )}
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {deal.contact?.phone && (
              <button onClick={(e) => { e.stopPropagation(); window.open(`tel:${deal.contact!.phone}`) }} className="p-1 rounded text-dark-500 hover:text-white hover:bg-dark-700 transition-colors" title="Ligar">
                <Phone className="w-3 h-3" />
              </button>
            )}
            {deal.contact?.email && (
              <button onClick={(e) => { e.stopPropagation(); window.open(`mailto:${deal.contact!.email}`) }} className="p-1 rounded text-dark-500 hover:text-white hover:bg-dark-700 transition-colors" title="E-mail">
                <Mail className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
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
          h-full flex flex-col rounded-xl transition-all duration-200
          ${isOver ? 'bg-primary-500/5' : ''}
        `}
      >
        {/* Column Header - Compact */}
        <div className="px-3 py-2.5 mb-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => onEditStage(stage)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity group min-w-0"
              title="Editar estágio"
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-[13px] font-semibold text-dark-200 uppercase tracking-wide truncate">{stage.name}</span>
              <span className="text-[12px] text-dark-500 font-medium flex-shrink-0">
                {safeDeals.length}
              </span>
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
          {/* Stage color bar */}
          <div className="h-[2px] rounded-full mt-2 opacity-60" style={{ backgroundColor: stage.color }} />
        </div>

        {/* Deals */}
        <div className="flex-1 px-1 space-y-1.5 overflow-y-auto custom-scrollbar min-h-[200px]">
          <SortableContext items={safeDeals.map(d => d.id)} strategy={verticalListSortingStrategy}>
            {safeDeals.map(deal => (
              <SortableDeal key={deal.id} deal={deal} onDealClick={onDealClick} />
            ))}
          </SortableContext>

          {safeDeals.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-[12px] text-dark-600">Sem deals neste estágio</p>
            </div>
          )}
        </div>

        {/* Add Deal Button */}
        <div className="px-1 py-1.5">
          <button
            onClick={onAddDeal}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-dark-500 hover:text-primary-400 hover:bg-dark-800/60 transition-colors"
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
        <p className="text-dark-400">Carregando CRM...</p>
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
        <h3 className="text-lg font-semibold text-white mb-2">Erro ao carregar</h3>
        <p className="text-dark-400 mb-4 max-w-sm">{error.message}</p>
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
        <div className="w-20 h-20 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Settings className="w-10 h-10 text-primary-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Nenhum pipeline encontrado</h3>
        <p className="text-dark-400 mb-6">
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
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700/60 rounded-lg text-white hover:bg-dark-750 transition-colors"
          >
            {activePipeline?.color && (
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: activePipeline.color }} />
            )}
            <span className="text-sm font-medium">{activePipeline?.name || 'Pipeline'}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-dark-400 transition-transform ${showPipelineDropdown ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showPipelineDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute left-0 top-full mt-1 w-64 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20 overflow-hidden"
              >
                <div className="py-1">
                  {pipelines.map(pipeline => (
                    <div
                      key={pipeline.id}
                      className={`flex items-center gap-2 px-3 py-2 transition-colors group ${
                        activePipeline?.id === pipeline.id ? 'bg-primary-500/10' : 'hover:bg-dark-700/50'
                      }`}
                    >
                      <button
                        onClick={() => handlePipelineSelect(pipeline)}
                        className="flex items-center gap-2.5 flex-1 min-w-0"
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pipeline.color || '#f97316' }} />
                        <span className={`text-sm flex-1 text-left truncate ${activePipeline?.id === pipeline.id ? 'text-primary-400 font-medium' : 'text-dark-300'}`}>
                          {pipeline.name}
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleEditPipeline(pipeline) }} className="p-1 rounded text-dark-400 hover:text-white hover:bg-dark-600 transition-colors" title="Editar">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePipeline(pipeline) }} className="p-1 rounded text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Excluir">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dark-700 p-1">
                  <button
                    onClick={() => { setShowPipelineDropdown(false); setEditingPipeline(null); setShowPipelineModal(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-primary-400 hover:bg-primary-500/10 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Pipeline
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-dark-700/50" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-2 bg-dark-800 border border-dark-700/60 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 w-48 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
              hasActiveFilters
                ? 'bg-primary-500/10 border-primary-500/40 text-primary-400'
                : 'bg-dark-800 border-dark-700/60 text-dark-400 hover:text-white'
            }`}
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
            
            {/* Add Stage */}
            <div className="flex-shrink-0 w-[60px] flex items-start pt-10 justify-center">
              <button
                onClick={() => { setEditingPipeline(activePipeline); setShowPipelineModal(true) }}
                className="p-2 rounded-lg border border-dashed border-dark-700/50 text-dark-600 hover:text-primary-400 hover:border-primary-500/40 transition-all"
                title="Adicionar estágio"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
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
