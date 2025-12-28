'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
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
// DEAL CARD COMPONENT
// ==========================================

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
  onClick?: () => void
}

function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const contactName = deal.contact
    ? `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim() || deal.contact.email
    : null

  return (
    <div
      onClick={onClick}
      className={`
        p-4 bg-dark-800/60 border border-dark-700/50 rounded-xl cursor-pointer
        hover:border-dark-600 hover:bg-dark-800/80 transition-all group
        ${isDragging ? 'opacity-50 scale-105 shadow-xl shadow-primary-500/10 rotate-2' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-primary-300 transition-colors">
          {deal.title}
        </h4>
        <button 
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
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
              <p className="text-[10px] text-dark-400 truncate">{deal.contact.company}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-success-400">{formatCurrency(deal.value)}</span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 rounded-full bg-dark-700 overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-300"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-[10px] text-dark-400">{deal.probability}%</span>
        </div>
      </div>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {deal.tags.slice(0, 2).map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 text-[10px]"
            >
              {tag}
            </span>
          ))}
          {deal.tags.length > 2 && (
            <span className="px-2 py-0.5 rounded-full bg-dark-700/50 text-dark-400 text-[10px]">
              +{deal.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      {deal.expected_close_date && (
        <div className="flex items-center gap-1.5 text-xs text-dark-400">
          <Clock className="w-3 h-3" />
          <span>{new Date(deal.expected_close_date).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
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
  
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0)
  const weightedValue = deals.reduce((sum, deal) => sum + (deal.value * deal.probability / 100), 0)

  return (
    <div className="flex-shrink-0 w-80">
      <div
        ref={setNodeRef}
        className={`
          h-full flex flex-col bg-dark-900/30 rounded-2xl border transition-all duration-200
          ${isOver ? 'border-primary-500/50 bg-primary-500/5 scale-[1.02]' : 'border-dark-800/50'}
        `}
      >
        {/* Column Header */}
        <div className="p-4 border-b border-dark-800/50">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => onEditStage(stage)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity group"
              title="Clique para editar este estágio"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <h3 className="font-semibold text-white group-hover:text-primary-300 transition-colors">{stage.name}</h3>
              <span className="px-2 py-0.5 rounded-full bg-dark-800/50 text-xs text-dark-400">
                {deals.length}
              </span>
              <Pencil className="w-3 h-3 text-dark-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button 
              onClick={onAddDeal}
              className="p-1.5 rounded-lg hover:bg-dark-800/50 text-dark-400 hover:text-white transition-colors"
              title="Adicionar deal"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-success-400 font-medium">{formatCurrency(totalValue)}</span>
            <span className="text-dark-500 text-xs">
              Ponderado: {formatCurrency(weightedValue)}
            </span>
          </div>
        </div>

        {/* Deals */}
        <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar min-h-[200px]">
          <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
            {deals.map(deal => (
              <SortableDeal key={deal.id} deal={deal} onDealClick={onDealClick} />
            ))}
          </SortableContext>
          
          {deals.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm text-dark-500">Arraste deals para cá</p>
            </div>
          )}
        </div>

        {/* Add Deal Button */}
        <div className="p-2 border-t border-dark-800/50">
          <button
            onClick={onAddDeal}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-dark-500 hover:text-white hover:bg-dark-800/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Adicionar</span>
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
  const { createPipeline: createPipelineHook, updatePipeline, deletePipeline: deletePipelineHook, updateStage, deleteStage } = usePipelines()
  
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null)
  const [showPipelineDropdown, setShowPipelineDropdown] = useState(false)
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null)
  const [showCreateDealModal, setShowCreateDealModal] = useState(false)
  const [createDealStageId, setCreateDealStageId] = useState<string>('')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [showEditStageModal, setShowEditStageModal] = useState(false)
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filters, setFilters] = useState({
    minValue: '',
    maxValue: '',
    hasContact: 'all' as 'all' | 'yes' | 'no',
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
  
  // Check if any filters are active
  const hasActiveFilters = filters.minValue || filters.maxValue || filters.hasContact !== 'all'
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({ minValue: '', maxValue: '', hasContact: 'all' })
    setSearchQuery('')
  }

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const dealId = event.active.id as string
    const deal = deals.find(d => d.id === dealId)
    if (deal) setActiveDeal(deal)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // Handle drag over logic if needed
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeal(null)
    const { active, over } = event
    
    if (!over) return
    
    const dealId = active.id as string
    const overId = over.id as string
    
    // Check if dropped on a stage
    const targetStage = stages.find(s => s.id === overId)
    if (targetStage) {
      const deal = deals.find(d => d.id === dealId)
      if (deal && deal.stage_id !== targetStage.id) {
        await moveDeal(dealId, targetStage.id)
      }
    }
  }

  // Pipeline handlers
  const handlePipelineSelect = (pipeline: Pipeline) => {
    setActivePipeline(pipeline)
    setShowPipelineDropdown(false)
  }

  const handleCreatePipeline = async (data: { name: string; description?: string; color?: string; stages: { name: string; color: string; position: number }[] }) => {
    if (editingPipeline) {
      // Ao editar, não podemos enviar stages diretamente - stages é uma tabela separada
      const { stages, ...pipelineData } = data
      await updatePipeline(editingPipeline.id, pipelineData)
      
      // Se precisar atualizar stages, fazer separadamente
      // Por enquanto, stages só são gerenciados na criação
    } else {
      await createPipelineHook(data)
    }
    await refetchPipelines()
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

  const handleUpdateStage = async (stageId: string, data: { name: string; color: string }) => {
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
  const pipelineStageIds = new Set(stages.map(s => s.id))
  const pipelineDeals = deals.filter(d => pipelineStageIds.has(d.stage_id))
  const uniqueContacts = new Set(pipelineDeals.filter(d => d.contact_id).map(d => d.contact_id)).size
  const pipelineStats = {
    weightedValue: pipelineDeals.reduce((sum, d) => sum + (d.value * d.probability / 100), 0),
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
    <div className="h-[calc(100vh-200px)] flex flex-col">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {/* Pipeline Selector */}
        <div className="relative">
          <button 
            onClick={() => setShowPipelineDropdown(!showPipelineDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white hover:bg-dark-800 transition-colors"
          >
            <span className="font-medium">{activePipeline?.name || 'Selecionar'}</span>
            <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showPipelineDropdown ? 'rotate-180' : ''}`} />
          </button>
          
          {/* Dropdown */}
          <AnimatePresence>
            {showPipelineDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 top-full mt-2 w-72 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                <div className="p-2">
                    {pipelines.map(pipeline => (
                      <div
                        key={pipeline.id}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors group ${
                          activePipeline?.id === pipeline.id
                            ? 'bg-primary-500/20'
                            : 'hover:bg-dark-700/50'
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
                            activePipeline?.id === pipeline.id ? 'text-primary-400' : 'text-dark-300'
                          }`}>
                            {pipeline.name}
                          </span>
                          {activePipeline?.id === pipeline.id && (
                            <span className="text-xs text-primary-400 flex-shrink-0">Ativo</span>
                          )}
                        </button>
                        
                        {/* Edit/Delete buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditPipeline(pipeline)
                            }}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-600 transition-colors"
                            title="Editar pipeline"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeletePipeline(pipeline)
                            }}
                            className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Excluir pipeline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-dark-700 p-2">
                    <button
                      onClick={() => {
                        setShowPipelineDropdown(false)
                        setEditingPipeline(null)
                        setShowPipelineModal(true)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-primary-400 hover:bg-primary-500/10 transition-colors"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Buscar deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 w-64 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter */}
          <div className="relative">
            <button 
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`p-2.5 rounded-xl border transition-all ${
                hasActiveFilters 
                  ? 'bg-primary-500/20 border-primary-500/50 text-primary-400' 
                  : 'bg-dark-800/50 border-dark-700/50 text-dark-400 hover:text-white hover:bg-dark-800'
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
                  className="absolute right-0 top-full mt-2 w-80 bg-dark-800/95 backdrop-blur-xl border border-dark-700/50 rounded-2xl shadow-2xl shadow-black/20 z-20 overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-dark-700/50 bg-dark-900/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-primary-400" />
                        <h3 className="text-sm font-semibold text-white">Filtros</h3>
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="text-xs text-dark-400 hover:text-white transition-colors flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Filters Content */}
                  <div className="p-5 space-y-5">
                    {/* Value Range */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-3">
                        <DollarSign className="w-3.5 h-3.5" />
                        Valor do Deal
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">R$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={filters.minValue}
                            onChange={(e) => setFilters(f => ({ ...f, minValue: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2.5 bg-dark-900/80 border border-dark-600/50 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                        <div className="text-dark-500 text-sm font-medium">até</div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">R$</span>
                          <input
                            type="number"
                            placeholder="∞"
                            value={filters.maxValue}
                            onChange={(e) => setFilters(f => ({ ...f, maxValue: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2.5 bg-dark-900/80 border border-dark-600/50 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Has Contact */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-3">
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
                                : 'bg-dark-900/80 text-dark-400 border border-dark-600/50 hover:border-dark-500 hover:text-dark-300'
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
                  <div className="px-5 py-4 border-t border-dark-700/50 bg-dark-900/30 flex gap-3">
                    <button
                      onClick={() => {
                        clearFilters()
                        setShowFilterDropdown(false)
                      }}
                      className="flex-1 px-4 py-2.5 bg-dark-700/50 hover:bg-dark-700 rounded-xl text-dark-300 text-sm font-medium transition-colors"
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
      <div className="flex items-center gap-6 mb-6 p-4 bg-dark-800/30 rounded-xl border border-dark-700/50">
        <div>
          <p className="text-sm text-dark-400">Valor Ponderado</p>
          <p className="text-xl font-bold text-success-400">{formatCurrency(pipelineStats.weightedValue)}</p>
        </div>
        <div className="w-px h-10 bg-dark-700" />
        <div>
          <p className="text-sm text-dark-400">Contatos na Pipeline</p>
          <p className="text-xl font-bold text-white">{pipelineStats.totalContacts}</p>
        </div>
        <div className="w-px h-10 bg-dark-700" />
        <div>
          <p className="text-sm text-dark-400">Deals Abertos</p>
          <p className="text-xl font-bold text-white">{pipelineStats.totalDeals}</p>
        </div>
        <div className="w-px h-10 bg-dark-700" />
        <div>
          <p className="text-sm text-dark-400">Estágios</p>
          <p className="text-xl font-bold text-white">{stages.length}</p>
        </div>
        
        {/* Refresh Button */}
        <div className="ml-auto">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
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
              className="flex-shrink-0 w-80 h-full min-h-[400px] flex flex-col items-center justify-center gap-2 bg-dark-900/20 border-2 border-dashed border-dark-800/50 rounded-2xl text-dark-500 hover:text-primary-400 hover:border-primary-500/30 transition-all"
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
