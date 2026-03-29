'use client'

import * as React from 'react'
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
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn, formatCurrency, getInitials, stringToColor } from '@/lib/utils'
import { Card, Avatar, Badge, Button, Input } from '@/components/ui'
import { useCRMStore } from '@/stores'
import type { Pipeline, PipelineStage, Deal, Contact } from '@/types'
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  GripVertical,
  DollarSign,
  Calendar,
  User,
  Phone,
  Mail,
  Building,
  Tag,
  X,
  Check,
} from 'lucide-react'

// Export new components
export { ContactSelector } from './ContactSelector'
export { CreateContactModal } from './CreateContactModal'
export { CreateDealModal } from './CreateDealModal'
export { BulkDeleteModal } from './BulkDeleteModal'
export { BulkActionsToolbar } from './BulkActionsToolbar'
export { DealDrawer } from './DealDrawer'
export { PipelineModal } from './PipelineModal'
export { EditStageModal } from './EditStageModal'
export { ContactDrawer } from './ContactDrawer'

// New CRM components
export { MergeContactsModal } from './MergeContactsModal'
export { ImportContactsModal } from './ImportContactsModal'
export { CustomFieldsManager } from './CustomFieldsManager'
export { DealTimeline } from './DealTimeline'
export { CustomFieldRenderer, CustomFieldsForm, useCustomFields, validateCustomFields } from './CustomFieldRenderer'
export type { CustomFieldDefinition } from './CustomFieldRenderer'

// ===============================
// KANBAN CARD
// ===============================
interface KanbanCardProps {
  deal: Deal
  onClick?: () => void
}

function KanbanCard({ deal, onClick }: KanbanCardProps) {
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
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'kanban-card group',
        isDragging && 'opacity-50 shadow-2xl shadow-primary-500/20 border-brand-400'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-medium text-gray-800 group-hover:text-brand-600 transition-colors line-clamp-2">
          {deal.title}
        </h4>
        <button
          {...listeners}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      {deal.contact && (
        <div className="flex items-center gap-2 mb-3">
          <Avatar
            fallback={getInitials(`${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim() || deal.contact.email || '?')}
            size="sm"
          />
          <div className="min-w-0">
            <p className="text-sm text-gray-700 truncate">
              {`${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim() || deal.contact.email || 'Sem nome'}
            </p>
            {deal.contact.company && (
              <p className="text-xs text-gray-400 truncate">{deal.contact.company}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-success-400">
          <DollarSign className="w-4 h-4" />
          <span className="font-semibold">{formatCurrency(deal.value)}</span>
        </div>
        {deal.expected_close_date && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <Calendar className="w-3 h-3" />
            <span>{new Date(deal.expected_close_date).toLocaleDateString('pt-BR')}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-400">Probabilidade</span>
          <span className="text-gray-600 font-medium">{deal.probability}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${deal.probability}%` }}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ===============================
// KANBAN COLUMN
// ===============================
interface KanbanColumnProps {
  column: PipelineStage
  deals: Deal[]
  onAddDeal: () => void
  onEditColumn: () => void
  onDeleteColumn: () => void
  onDealClick: (deal: Deal) => void
}

function KanbanColumn({
  column,
  deals,
  onAddDeal,
  onEditColumn,
  onDeleteColumn,
  onDealClick,
}: KanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // ✅ PROTEÇÃO: Garantir que deals é array antes de usar reduce
  const safeDeals = Array.isArray(deals) ? deals : []
  const totalValue = safeDeals.reduce((sum, deal) => sum + (deal.value || 0), 0)

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'kanban-column flex flex-col',
        isDragging && 'opacity-50'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            {...listeners}
            className="p-1 rounded hover:bg-white text-gray-400 cursor-grab"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <div>
            <h3 className="font-semibold text-gray-800">{column.name}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">{safeDeals.length} deals</span>
              <span className="text-gray-400">•</span>
              <span className="text-success-400 font-medium">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddDeal}
            className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="relative group">
            <button className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-gray-800 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
              <button
                onClick={onEditColumn}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={onDeleteColumn}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-400 hover:bg-gray-100"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 -mr-1">
        <SortableContext
          items={deals.map((d: Deal) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence>
            {deals.map((deal: Deal) => (
              <KanbanCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </div>

      {/* Add Deal Button */}
      <button
        onClick={onAddDeal}
        className="mt-3 w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Adicionar deal
      </button>
    </motion.div>
  )
}

// ===============================
// KANBAN BOARD
// ===============================
interface KanbanBoardProps {
  pipeline: Pipeline
  deals: Deal[]
}

export function KanbanBoard({ pipeline, deals }: KanbanBoardProps) {
  const { moveDeal, updateDeal } = useCRMStore()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [showDealModal, setShowDealModal] = React.useState(false)
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveId(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    // Find the deal being dragged
    const activeDeal = deals.find((d: Deal) => d.id === activeId)
    if (!activeDeal) {
      setActiveId(null)
      return
    }

    // Check if dropped on a column
    const targetColumn = (pipeline.stages || []).find((c: PipelineStage) => c.id === overId)
    if (targetColumn) {
      moveDeal(activeId, targetColumn.id, 0)
    } else {
      // Dropped on another deal - find which column
      const targetDeal = deals.find((d: Deal) => d.id === overId)
      if (targetDeal) {
        moveDeal(activeId, targetDeal.stage_id, targetDeal.position)
      }
    }

    setActiveId(null)
  }

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal)
    setShowDealModal(true)
  }

  const activeDeal = activeId ? deals.find((d: Deal) => d.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
        <SortableContext
          items={(pipeline.stages || []).map((c: PipelineStage) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {(pipeline.stages || []).map((column: PipelineStage) => (
            <KanbanColumn
              key={column.id}
              column={column}
              deals={deals.filter((d: Deal) => d.stage_id === column.id)}
              onAddDeal={() => {
                setSelectedDeal(null)
                setShowDealModal(true)
              }}
              onEditColumn={() => {}}
              onDeleteColumn={() => {}}
              onDealClick={handleDealClick}
            />
          ))}
        </SortableContext>

        {/* Add Column Button */}
        <div className="min-w-[320px] max-w-[320px]">
          <button className="w-full h-full min-h-[200px] rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-brand-400 hover:text-brand-600 transition-colors flex flex-col items-center justify-center gap-2">
            <Plus className="w-6 h-6" />
            <span className="font-medium">Adicionar coluna</span>
          </button>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeDeal ? (
          <div className="kanban-card shadow-2xl shadow-primary-500/20 border-brand-400">
            <h4 className="font-medium text-gray-800 mb-2">{activeDeal.title}</h4>
            <div className="flex items-center gap-1.5 text-success-400">
              <DollarSign className="w-4 h-4" />
              <span className="font-semibold">{formatCurrency(activeDeal.value)}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* Deal Modal */}
      <AnimatePresence>
        {showDealModal && (
          <DealModal
            deal={selectedDeal}
            onClose={() => setShowDealModal(false)}
          />
        )}
      </AnimatePresence>
    </DndContext>
  )
}

// ===============================
// DEAL MODAL
// ===============================
interface DealModalProps {
  deal: Deal | null
  onClose: () => void
}

function DealModal({ deal, onClose }: DealModalProps) {
  const isEditing = !!deal

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-gray-50/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            {isEditing ? 'Editar Deal' : 'Novo Deal'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <Input
            label="Título"
            placeholder="Ex: Campanha Black Friday"
            defaultValue={deal?.title}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Valor"
              type="number"
              placeholder="0,00"
              leftIcon={<DollarSign className="w-4 h-4" />}
              defaultValue={deal?.value}
            />
            <Input
              label="Probabilidade (%)"
              type="number"
              placeholder="50"
              defaultValue={deal?.probability}
            />
          </div>

          <Input
            label="Data de fechamento esperada"
            type="date"
            defaultValue={deal?.expected_close_date}
          />

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Notas
            </label>
            <textarea
              className="input-field min-h-[100px] resize-none"
              placeholder="Adicione notas sobre este deal..."
              defaultValue={deal?.notes || ''}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary">
            <Check className="w-4 h-4" />
            {isEditing ? 'Salvar' : 'Criar Deal'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ===============================
// CONTACT CARD
// ===============================
interface ContactCardProps {
  contact: Contact
  onClick?: () => void
}

export function ContactCard({ contact, onClick }: ContactCardProps) {
  return (
    <Card
      variant="glass"
      hoverable
      className="cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <Avatar
          src={contact.avatar_url}
          fallback={getInitials(`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || '?')}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">
            {`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Sem nome'}
          </h3>
          {contact.company && (
            <p className="text-gray-500 text-sm truncate">{contact.company}</p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-3">
            {contact.email && (
              <div className="flex items-center gap-1 text-gray-400 text-sm">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-1 text-gray-400 text-sm">
                <Phone className="w-3.5 h-3.5" />
                <span>{contact.phone}</span>
              </div>
            )}
          </div>

          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {contact.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="primary" size="sm">
                  {tag}
                </Badge>
              ))}
              {contact.tags.length > 3 && (
                <Badge variant="default" size="sm">
                  +{contact.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="text-success-400 font-semibold">
            {formatCurrency(contact.total_spent || contact.total_revenue || 0)}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            {contact.total_orders || 0} pedidos
          </p>
        </div>
      </div>
    </Card>
  )
}

// ===============================
// PIPELINE SELECTOR
// ===============================
interface PipelineSelectorProps {
  pipelines: Pipeline[]
  selectedId: string | null
  onSelect: (pipeline: Pipeline) => void
  onCreateNew: () => void
}

export function PipelineSelector({
  pipelines,
  selectedId,
  onSelect,
  onCreateNew,
}: PipelineSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-gray-50 rounded-xl">
      {pipelines.map((pipeline: Pipeline) => (
        <button
          key={pipeline.id}
          onClick={() => onSelect(pipeline)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            selectedId === pipeline.id
              ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
          )}
        >
          {pipeline.name}
        </button>
      ))}
      <button
        onClick={onCreateNew}
        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Novo Pipeline
      </button>
    </div>
  )
}
