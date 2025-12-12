'use client'

import { useState, useCallback } from 'react'
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
  useDraggable,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  MoreHorizontal,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  DollarSign,
  User,
  Building2,
  Tag,
  Clock,
  ChevronDown,
  Search,
  Filter,
  SlidersHorizontal,
  X,
  Check,
  Edit2,
  Trash2,
  GripVertical
} from 'lucide-react'

interface Deal {
  id: string
  title: string
  value: number
  contact: {
    name: string
    email: string
    phone: string
    company?: string
  }
  probability: number
  dueDate?: string
  tags: string[]
  columnId: string
  createdAt: string
}

interface Column {
  id: string
  title: string
  color: string
  deals: string[]
}

interface Pipeline {
  id: string
  name: string
  columns: Column[]
}

const initialPipelines: Pipeline[] = [
  {
    id: 'sales',
    name: 'Vendas',
    columns: [
      { id: 'lead', title: 'Leads', color: '#8b5cf6', deals: ['deal-1', 'deal-2'] },
      { id: 'contacted', title: 'Contatados', color: '#06b6d4', deals: ['deal-3'] },
      { id: 'qualified', title: 'Qualificados', color: '#10b981', deals: ['deal-4', 'deal-5'] },
      { id: 'proposal', title: 'Proposta Enviada', color: '#f59e0b', deals: ['deal-6'] },
      { id: 'negotiation', title: 'Negociação', color: '#ef4444', deals: [] },
      { id: 'won', title: 'Fechados', color: '#22c55e', deals: ['deal-7'] },
    ]
  },
  {
    id: 'support',
    name: 'Suporte',
    columns: [
      { id: 'new', title: 'Novos', color: '#8b5cf6', deals: [] },
      { id: 'inprogress', title: 'Em Andamento', color: '#f59e0b', deals: [] },
      { id: 'resolved', title: 'Resolvidos', color: '#22c55e', deals: [] },
    ]
  }
]

const initialDeals: Deal[] = [
  {
    id: 'deal-1',
    title: 'Implementação E-commerce',
    value: 15000,
    contact: { name: 'Maria Silva', email: 'maria@empresa.com', phone: '+55 11 99999-0001', company: 'Tech Store' },
    probability: 25,
    dueDate: '2024-02-15',
    tags: ['e-commerce', 'novo'],
    columnId: 'lead',
    createdAt: '2024-01-10'
  },
  {
    id: 'deal-2',
    title: 'Email Marketing Setup',
    value: 8500,
    contact: { name: 'João Santos', email: 'joao@loja.com', phone: '+55 11 99999-0002', company: 'Loja Virtual' },
    probability: 30,
    dueDate: '2024-02-20',
    tags: ['email', 'klaviyo'],
    columnId: 'lead',
    createdAt: '2024-01-12'
  },
  {
    id: 'deal-3',
    title: 'Integração Shopify',
    value: 12000,
    contact: { name: 'Ana Costa', email: 'ana@moda.com', phone: '+55 11 99999-0003', company: 'Moda Fashion' },
    probability: 50,
    tags: ['shopify', 'integração'],
    columnId: 'contacted',
    createdAt: '2024-01-08'
  },
  {
    id: 'deal-4',
    title: 'Automação WhatsApp',
    value: 6000,
    contact: { name: 'Pedro Lima', email: 'pedro@tech.com', phone: '+55 11 99999-0004', company: 'TechBr' },
    probability: 60,
    dueDate: '2024-02-10',
    tags: ['whatsapp', 'automação'],
    columnId: 'qualified',
    createdAt: '2024-01-05'
  },
  {
    id: 'deal-5',
    title: 'CRM Customizado',
    value: 20000,
    contact: { name: 'Carla Souza', email: 'carla@mega.com', phone: '+55 11 99999-0005', company: 'Mega Store' },
    probability: 70,
    tags: ['crm', 'enterprise'],
    columnId: 'qualified',
    createdAt: '2024-01-03'
  },
  {
    id: 'deal-6',
    title: 'Pacote Completo',
    value: 35000,
    contact: { name: 'Roberto Dias', email: 'roberto@global.com', phone: '+55 11 99999-0006', company: 'Global Shop' },
    probability: 80,
    dueDate: '2024-02-05',
    tags: ['enterprise', 'prioritário'],
    columnId: 'proposal',
    createdAt: '2024-01-01'
  },
  {
    id: 'deal-7',
    title: 'Setup Inicial',
    value: 5000,
    contact: { name: 'Fernanda Reis', email: 'fernanda@startup.com', phone: '+55 11 99999-0007', company: 'StartupX' },
    probability: 100,
    tags: ['fechado'],
    columnId: 'won',
    createdAt: '2023-12-28'
  },
]

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value)
}

const tagColors: Record<string, string> = {
  'e-commerce': 'bg-violet-500/20 text-violet-400',
  'novo': 'bg-cyan-500/20 text-cyan-400',
  'email': 'bg-blue-500/20 text-blue-400',
  'klaviyo': 'bg-pink-500/20 text-pink-400',
  'shopify': 'bg-green-500/20 text-green-400',
  'integração': 'bg-amber-500/20 text-amber-400',
  'whatsapp': 'bg-emerald-500/20 text-emerald-400',
  'automação': 'bg-purple-500/20 text-purple-400',
  'crm': 'bg-indigo-500/20 text-indigo-400',
  'enterprise': 'bg-orange-500/20 text-orange-400',
  'prioritário': 'bg-red-500/20 text-red-400',
  'fechado': 'bg-green-500/20 text-green-400',
}

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
}

const DealCard = ({ deal, isDragging }: DealCardProps) => {
  return (
    <div
      className={`
        p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl cursor-grab
        hover:border-slate-600/50 hover:bg-slate-800/70 transition-all
        ${isDragging ? 'opacity-50 scale-105 shadow-xl shadow-violet-500/10' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-sm font-medium text-white line-clamp-2">{deal.title}</h4>
        <button className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">{deal.contact.name.split(' ').map(n => n[0]).join('')}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-white truncate">{deal.contact.name}</p>
          {deal.contact.company && (
            <p className="text-[10px] text-slate-400 truncate">{deal.contact.company}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-emerald-400">{formatCurrency(deal.value)}</span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1.5 rounded-full bg-slate-700 overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400">{deal.probability}%</span>
        </div>
      </div>

      {deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {deal.tags.slice(0, 2).map(tag => (
            <span
              key={tag}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tagColors[tag] || 'bg-slate-700/50 text-slate-400'}`}
            >
              {tag}
            </span>
          ))}
          {deal.tags.length > 2 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-400">
              +{deal.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {deal.dueDate && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          <span>{new Date(deal.dueDate).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
    </div>
  )
}

interface SortableDealProps {
  deal: Deal
}

const SortableDeal = ({ deal }: SortableDealProps) => {
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="group">
      <DealCard deal={deal} isDragging={isDragging} />
    </div>
  )
}

interface KanbanColumnProps {
  column: Column
  deals: Deal[]
}

const KanbanColumn = ({ column, deals }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0)

  return (
    <div className="flex-shrink-0 w-80">
      <div
        ref={setNodeRef}
        className={`
          h-full flex flex-col bg-slate-900/30 rounded-2xl border transition-all
          ${isOver ? 'border-violet-500/50 bg-violet-500/5' : 'border-slate-800/50'}
        `}
      >
        {/* Column Header */}
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
              <h3 className="font-semibold text-white">{column.title}</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800/50 text-xs text-slate-400">
                {deals.length}
              </span>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-emerald-400 font-medium">{formatCurrency(totalValue)}</p>
        </div>

        {/* Deals */}
        <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
          <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
            {deals.map(deal => (
              <SortableDeal key={deal.id} deal={deal} />
            ))}
          </SortableContext>
          
          {deals.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm text-slate-500">Arraste deals para cá</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CRMPage() {
  const [pipelines, setPipelines] = useState(initialPipelines)
  const [deals, setDeals] = useState(initialDeals)
  const [activePipeline, setActivePipeline] = useState(pipelines[0])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeDeal = deals.find(d => d.id === activeId)
    if (!activeDeal) return

    // Check if we're over a column
    const overColumn = activePipeline.columns.find(c => c.id === overId)
    if (overColumn && activeDeal.columnId !== overId) {
      setDeals(deals.map(deal => 
        deal.id === activeId ? { ...deal, columnId: overId } : deal
      ))
    }

    // Check if we're over another deal
    const overDeal = deals.find(d => d.id === overId)
    if (overDeal && activeDeal.columnId !== overDeal.columnId) {
      setDeals(deals.map(deal => 
        deal.id === activeId ? { ...deal, columnId: overDeal.columnId } : deal
      ))
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
  }

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null

  const getColumnDeals = (columnId: string) => {
    return deals.filter(d => d.columnId === columnId)
  }

  const totalPipelineValue = deals
    .filter(d => activePipeline.columns.some(c => c.id === d.columnId))
    .reduce((sum, deal) => sum + deal.value, 0)

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <p className="text-slate-400 mt-1">Gerencie seus deals e oportunidades</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Pipeline Selector */}
          <div className="relative">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white hover:bg-slate-800 transition-colors">
              <span className="font-medium">{activePipeline.name}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50 w-64"
            />
          </div>

          <button className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Filter className="w-5 h-5" />
          </button>
          
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-xl text-white font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-5 h-5" />
            <span>Novo Deal</span>
          </button>
        </div>
      </div>

      {/* Pipeline Stats */}
      <div className="flex items-center gap-6 mb-6 p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
        <div>
          <p className="text-sm text-slate-400">Valor Total</p>
          <p className="text-xl font-bold text-white">{formatCurrency(totalPipelineValue)}</p>
        </div>
        <div className="w-px h-10 bg-slate-800" />
        <div>
          <p className="text-sm text-slate-400">Deals Abertos</p>
          <p className="text-xl font-bold text-white">{deals.length}</p>
        </div>
        <div className="w-px h-10 bg-slate-800" />
        <div>
          <p className="text-sm text-slate-400">Taxa de Conversão</p>
          <p className="text-xl font-bold text-emerald-400">23.5%</p>
        </div>
        <div className="w-px h-10 bg-slate-800" />
        <div>
          <p className="text-sm text-slate-400">Tempo Médio</p>
          <p className="text-xl font-bold text-white">14 dias</p>
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
            {activePipeline.columns.map(column => (
              <KanbanColumn
                key={column.id}
                column={column}
                deals={getColumnDeals(column.id)}
              />
            ))}
            
            {/* Add Column Button */}
            <button className="flex-shrink-0 w-80 h-full min-h-[400px] flex flex-col items-center justify-center gap-2 bg-slate-900/20 border-2 border-dashed border-slate-800/50 rounded-2xl text-slate-500 hover:text-slate-400 hover:border-slate-700/50 transition-all">
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Nova Coluna</span>
            </button>
          </div>

          <DragOverlay>
            {activeDeal && <DealCard deal={activeDeal} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
