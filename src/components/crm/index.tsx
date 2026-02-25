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
// KANBAN CARD - Professional CRM Style
// ===============================
interface KanbanCardProps {
  deal: Deal
  onClick?: () => void
}

// Time ago helper
function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}min`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// Avatar colors
const cardAvatarColors = [
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
]

function getCardAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return cardAvatarColors[Math.abs(hash) % cardAvatarColors.length]
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

  // Extract info
  const customFields = (deal as any).custom_fields || {}
  const utmSource = customFields.utm_source
  const source = customFields.source || (deal as any).source
  const formName = customFields.form_name || customFields.formName
  const formId = customFields.form_id || customFields.formId

  // Contact info
  const contact = deal.contact
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email?.split('@')[0] || 'Lead'
    : deal.title
  const contactInitials = contact
    ? `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || contact.email?.[0]?.toUpperCase() || '?'
    : deal.title?.substring(0, 2).toUpperCase() || '?'
  const phone = contact?.whatsapp || contact?.phone
  const email = contact?.email

  // Origin badge
  const originLabel = formName || utmSource || source

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative bg-dark-850 border border-dark-700/60 rounded-xl p-3.5 cursor-pointer hover:border-dark-600 hover:bg-dark-800 transition-all',
        isDragging && 'opacity-50 shadow-2xl shadow-primary-500/20 border-primary-500/50'
      )}
      onClick={onClick}
    >
      {/* Drag Handle - Top Right */}
      <button
        {...listeners}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-dark-700 text-dark-500 cursor-grab active:cursor-grabbing transition-all"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Header: Avatar + Name + Time */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getCardAvatarColor(contactName)} flex items-center justify-center flex-shrink-0`}>
          <span className="text-sm font-semibold text-white">{contactInitials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-dark-100 group-hover:text-white transition-colors truncate text-sm">
            {contactName}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-dark-500">{timeAgo(deal.created_at)}</span>
            {deal.value > 0 && (
              <>
                <span className="text-dark-600">•</span>
                <span className="text-[11px] font-medium text-emerald-400">{formatCurrency(deal.value)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contact Details */}
      <div className="space-y-1.5 mb-3">
        {phone && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-emerald-500/15 flex items-center justify-center">
              <Phone className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-xs text-dark-300 truncate">{phone}</span>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center">
              <Mail className="w-3 h-3 text-blue-400" />
            </div>
            <span className="text-xs text-dark-300 truncate">{email}</span>
          </div>
        )}
      </div>

      {/* Origin Badge */}
      {originLabel && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-dark-700/50">
          <div className="w-4 h-4 rounded bg-purple-500/15 flex items-center justify-center">
            <Tag className="w-2.5 h-2.5 text-purple-400" />
          </div>
          <span className="text-[11px] text-dark-400 truncate">{originLabel}</span>
        </div>
      )}

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {deal.tags.slice(0, 2).map((tag: string) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-primary-500/15 text-primary-400 text-[10px] rounded-md font-medium"
            >
              {tag}
            </span>
          ))}
          {deal.tags.length > 2 && (
            <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[10px] rounded-md">
              +{deal.tags.length - 2}
            </span>
          )}
        </div>
      )}
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
            className="p-1 rounded hover:bg-dark-800 text-dark-500 cursor-grab"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <div>
            <h3 className="font-semibold text-dark-100">{column.name}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-dark-500">{safeDeals.length} deals</span>
              <span className="text-dark-600">•</span>
              <span className="text-success-400 font-medium">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddDeal}
            className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="relative group">
            <button className="p-1.5 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 py-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
              <button
                onClick={onEditColumn}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-dark-100"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={onDeleteColumn}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-400 hover:bg-dark-700"
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
        className="mt-3 w-full py-2.5 rounded-xl border-2 border-dashed border-dark-700 text-dark-500 hover:border-primary-500/50 hover:text-primary-400 transition-colors flex items-center justify-center gap-2"
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
          <button className="w-full h-full min-h-[200px] rounded-2xl border-2 border-dashed border-dark-700 text-dark-500 hover:border-primary-500/50 hover:text-primary-400 transition-colors flex flex-col items-center justify-center gap-2">
            <Plus className="w-6 h-6" />
            <span className="font-medium">Adicionar coluna</span>
          </button>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeDeal ? (
          <div className="kanban-card shadow-2xl shadow-primary-500/20 border-primary-500/50">
            <h4 className="font-medium text-dark-100 mb-2">{activeDeal.title}</h4>
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
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-xl font-semibold text-dark-100">
            {isEditing ? 'Editar Deal' : 'Novo Deal'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-800 text-dark-400 transition-colors"
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
            <label className="block text-sm font-medium text-dark-300 mb-2">
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
        <div className="flex items-center justify-end gap-3 p-6 border-t border-dark-700">
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
          <h3 className="font-semibold text-dark-100 truncate">
            {`${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Sem nome'}
          </h3>
          {contact.company && (
            <p className="text-dark-400 text-sm truncate">{contact.company}</p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-3">
            {contact.email && (
              <div className="flex items-center gap-1 text-dark-500 text-sm">
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-1 text-dark-500 text-sm">
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
          <p className="text-dark-500 text-xs mt-1">
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
    <div className="flex items-center gap-2 p-1 bg-dark-800/50 rounded-xl">
      {pipelines.map((pipeline: Pipeline) => (
        <button
          key={pipeline.id}
          onClick={() => onSelect(pipeline)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            selectedId === pipeline.id
              ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
              : 'text-dark-400 hover:text-dark-100 hover:bg-dark-700'
          )}
        >
          {pipeline.name}
        </button>
      ))}
      <button
        onClick={onCreateNew}
        className="px-4 py-2 rounded-lg text-sm font-medium text-dark-400 hover:text-dark-100 hover:bg-dark-700 transition-all flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Novo Pipeline
      </button>
    </div>
  )
}
