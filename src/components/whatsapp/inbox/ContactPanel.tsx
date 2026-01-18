'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Tag,
  Plus,
  X,
  Pencil,
  DollarSign,
  ShoppingCart,
  Package,
  FileText,
  Send,
  UserPlus,
  Ban,
  ExternalLink,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  CheckSquare,
  Activity,
  Building,
  Briefcase,
  MessageSquare,
} from 'lucide-react'
import type { 
  InboxContact, 
  InboxNote, 
  InboxActivity, 
  InboxOrder, 
  InboxCart,
  InboxDeal,
  InboxTask,
  InboxInvoice,
  InboxComment,
} from '@/types/inbox'

// Import tabs components
import { TasksTab } from './tabs/TasksTab'
import { InvoicesTab } from './tabs/InvoicesTab'
import { TimelineTab } from './tabs/TimelineTab'

interface ContactPanelProps {
  contact: InboxContact | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
  // Novos props
  tasks?: InboxTask[]
  invoices?: InboxInvoice[]
  comments?: InboxComment[]
  isLoading: boolean
  conversationId: string
  onUpdateContact: (id: string, updates: Partial<InboxContact>) => Promise<void>
  onAddTag: (id: string, tag: string) => Promise<void>
  onRemoveTag: (id: string, tag: string) => Promise<void>
  onAddNote: (id: string, content: string, conversationId?: string) => Promise<void>
  onBlockContact: (id: string, reason?: string) => Promise<void>
  onUnblockContact: (id: string) => Promise<void>
  onCreateDeal: (id: string, params: any) => Promise<any>
  // Novos callbacks
  onCreateTask?: (contactId: string, task: Partial<InboxTask>) => Promise<void>
  onCompleteTask?: (taskId: string, outcome?: string) => Promise<void>
  onDeleteTask?: (taskId: string) => Promise<void>
  onUploadInvoice?: (data: FormData) => Promise<void>
  onDeleteInvoice?: (invoiceId: string) => Promise<void>
  onAddComment?: (contactId: string, content: string, type?: string) => Promise<void>
  onRefreshContact?: () => void
}

// Helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

const formatRelativeTime = (date?: string) => {
  if (!date) return ''
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays}d`
  return formatDate(date)
}

const getInitials = (name?: string) => {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Tab types - ATUALIZADO com novas tabs
type TabId = 'info' | 'crm' | 'orders' | 'tasks' | 'invoices' | 'timeline'

// Main Component
export function ContactPanel({
  contact,
  notes,
  activities,
  orders,
  cart,
  activeDeal,
  deals,
  tasks = [],
  invoices = [],
  comments = [],
  isLoading,
  conversationId,
  onUpdateContact,
  onAddTag,
  onRemoveTag,
  onAddNote,
  onBlockContact,
  onUnblockContact,
  onCreateDeal,
  onCreateTask,
  onCompleteTask,
  onDeleteTask,
  onUploadInvoice,
  onDeleteInvoice,
  onAddComment,
  onRefreshContact,
}: ContactPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [newTag, setNewTag] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [showCreateDeal, setShowCreateDeal] = useState(false)

  if (isLoading) {
    return (
      <div className="w-[380px] flex items-center justify-center h-full bg-dark-800/50">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="w-[380px] flex flex-col items-center justify-center h-full text-dark-400 p-8">
        <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-center">Selecione uma conversa para ver os detalhes do contato</p>
      </div>
    )
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setIsSavingNote(true)
    try {
      await onAddNote(contact.id, newNote.trim(), conversationId)
      setNewNote('')
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    await onAddTag(contact.id, newTag.trim())
    setNewTag('')
    setShowAddTag(false)
  }

  // Tabs atualizadas com novas tabs
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'info', label: 'Info' },
    { id: 'crm', label: 'CRM', badge: deals.filter(d => d.status === 'open').length },
    { id: 'tasks', label: 'Tarefas', badge: tasks.filter(t => t.status !== 'completed').length },
    { id: 'orders', label: 'Pedidos', badge: contact.total_orders },
    { id: 'invoices', label: 'NFs', badge: invoices.length },
    { id: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="w-[380px] flex flex-col h-full">
      {/* ========== HEADER ========== */}
      <div className="p-6 border-b border-dark-700/50 text-center">
        {/* Avatar */}
        {contact.profile_picture_url || contact.avatar_url ? (
          <img
            src={contact.profile_picture_url || contact.avatar_url}
            alt={contact.name || 'Contato'}
            className="w-20 h-20 mx-auto rounded-full object-cover mb-4 ring-4 ring-primary-500/20"
          />
        ) : (
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary-500 to-accent-500 
                          flex items-center justify-center mb-4 ring-4 ring-primary-500/20">
            <span className="text-white font-bold text-2xl">
              {getInitials(contact.name || contact.first_name || contact.phone_number)}
            </span>
          </div>
        )}

        {/* Name & Phone */}
        <h3 className="text-lg font-semibold text-white mb-1">
          {contact.name || contact.full_name || contact.first_name || 'Sem nome'}
        </h3>
        <p className="text-sm text-dark-400 mb-1">{contact.phone_number || contact.whatsapp}</p>
        
        {/* Company */}
        {contact.company && (
          <p className="text-xs text-dark-500 flex items-center justify-center gap-1">
            <Building className="w-3 h-3" />
            {contact.company}
            {contact.position && ` • ${contact.position}`}
          </p>
        )}

        {/* Status badges */}
        <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
          {contact.is_blocked ? (
            <span className="px-2.5 py-1 bg-error-500/10 text-error-400 text-xs font-medium rounded-lg">
              Bloqueado
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-success-500/10 text-success-400 text-xs font-medium rounded-lg">
              Ativo
            </span>
          )}
          {contact.total_orders > 0 && (
            <span className="px-2.5 py-1 bg-primary-500/10 text-primary-400 text-xs font-medium rounded-lg">
              Cliente
            </span>
          )}
          {tasks.filter(t => t.is_overdue).length > 0 && (
            <span className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg">
              Tarefa Atrasada
            </span>
          )}
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="flex border-b border-dark-700/50 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3 py-3 text-xs font-medium transition-all border-b-2 
                        flex items-center gap-1 ${
              activeTab === tab.id
                ? 'text-primary-400 border-primary-500'
                : 'text-dark-400 border-transparent hover:text-white'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                activeTab === tab.id 
                  ? 'bg-primary-500/20 text-primary-400' 
                  : 'bg-dark-700 text-dark-400'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========== TAB CONTENT ========== */}
      <div className="flex-1 overflow-y-auto">
        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Contact Fields */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                <Mail className="w-5 h-5 text-dark-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-dark-500">Email</p>
                  <p className="text-sm text-white truncate">
                    {contact.email || 'Não informado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                <Phone className="w-5 h-5 text-dark-400" />
                <div className="flex-1">
                  <p className="text-xs text-dark-500">Telefone</p>
                  <p className="text-sm text-white">{contact.phone_number || contact.whatsapp}</p>
                </div>
              </div>

              {contact.address?.city && (
                <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                  <MapPin className="w-5 h-5 text-dark-400" />
                  <div className="flex-1">
                    <p className="text-xs text-dark-500">Cidade</p>
                    <p className="text-sm text-white">
                      {contact.address.city}{contact.address.state ? `, ${contact.address.state}` : ''}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                <Calendar className="w-5 h-5 text-dark-400" />
                <div className="flex-1">
                  <p className="text-xs text-dark-500">Cliente desde</p>
                  <p className="text-sm text-white">{formatDate(contact.created_at)}</p>
                </div>
              </div>
              
              {contact.last_message_at && (
                <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-dark-400" />
                  <div className="flex-1">
                    <p className="text-xs text-dark-500">Última mensagem</p>
                    <p className="text-sm text-white">{formatRelativeTime(contact.last_message_at)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Métricas rápidas */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-lg font-bold text-white">{contact.total_orders || 0}</p>
                <p className="text-[10px] text-dark-400">Pedidos</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-lg font-bold text-primary-400">
                  {formatCurrency(contact.total_spent || 0).replace('R$', '').trim()}
                </p>
                <p className="text-[10px] text-dark-400">Gasto</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-lg font-bold text-white">{contact.total_conversations || 0}</p>
                <p className="text-[10px] text-dark-400">Conversas</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-white">Tags</h4>
                <button
                  onClick={() => setShowAddTag(true)}
                  className="p-1 text-primary-400 hover:bg-primary-500/10 rounded transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {(contact.tags || []).map((tag, i) => (
                  <span 
                    key={i}
                    className="px-2.5 py-1 bg-dark-700 text-dark-300 text-xs rounded-lg 
                               flex items-center gap-1 group"
                  >
                    {tag}
                    <button
                      onClick={() => onRemoveTag(contact.id, tag)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                
                {showAddTag && (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Nova tag"
                      className="px-2 py-1 bg-dark-700 border border-dark-600 rounded text-xs text-white 
                                 placeholder:text-dark-500 focus:outline-none focus:border-primary-500 w-24"
                      autoFocus
                    />
                    <button
                      onClick={handleAddTag}
                      className="p-1 bg-primary-500 text-white rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setShowAddTag(false); setNewTag('') }}
                      className="p-1 bg-dark-600 text-dark-300 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CRM TAB */}
        {activeTab === 'crm' && (
          <div className="p-4 space-y-4">
            {/* Active Deal */}
            {activeDeal ? (
              <div className="p-4 bg-gradient-to-br from-primary-500/10 to-accent-500/10 
                              border border-primary-500/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    activeDeal.status === 'won' ? 'bg-success-500/20 text-success-400' :
                    activeDeal.status === 'lost' ? 'bg-error-500/20 text-error-400' :
                    'bg-primary-500/20 text-primary-400'
                  }`}>
                    {activeDeal.stage?.name || 'Em progresso'}
                  </span>
                  <span className="text-xs text-dark-400">
                    {formatRelativeTime(activeDeal.updated_at || activeDeal.created_at)}
                  </span>
                </div>
                <h4 className="font-semibold text-white mb-1">{activeDeal.title}</h4>
                <p className="text-2xl font-bold text-primary-400 mb-1">
                  {formatCurrency(activeDeal.value)}
                </p>
                <p className="text-xs text-dark-400">
                  {activeDeal.pipeline?.name || 'Pipeline'}
                </p>
                <div className="mt-3 flex gap-2">
                  <a 
                    href={`/crm?deal=${activeDeal.id}`}
                    target="_blank"
                    className="flex-1 py-2 bg-dark-700/50 text-dark-300 text-sm rounded-lg 
                                     hover:bg-dark-700 transition-colors text-center">
                    Ver Deal
                  </a>
                  <button className="flex-1 py-2 bg-primary-500 text-white text-sm rounded-lg 
                                     hover:bg-primary-600 transition-colors">
                    Avançar
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setShowCreateDeal(true)}
                className="w-full py-4 border border-dashed border-dark-600 rounded-xl 
                                 text-dark-400 hover:text-white hover:border-primary-500 transition-all
                                 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Criar Novo Deal
              </button>
            )}

            {/* Deal History */}
            {deals.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-dark-300 mb-3">Histórico</h4>
                <div className="space-y-2">
                  {deals.filter(d => d.id !== activeDeal?.id).slice(0, 5).map((deal) => (
                    <div 
                      key={deal.id}
                      className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        deal.status === 'won' ? 'bg-success-500' : 
                        deal.status === 'lost' ? 'bg-error-500' : 'bg-warning-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{deal.title}</p>
                        <p className="text-xs text-dark-400">
                          {formatCurrency(deal.value)} • {deal.status === 'won' ? 'Ganho' : 
                           deal.status === 'lost' ? 'Perdido' : 'Aberto'}
                        </p>
                      </div>
                      <span className="text-xs text-dark-500">
                        {formatDate(deal.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-success-400">
                  {deals.filter(d => d.status === 'won').length}
                </p>
                <p className="text-xs text-dark-400">Deals Ganhos</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">
                  {formatCurrency(deals.filter(d => d.status === 'won')
                    .reduce((sum, d) => sum + d.value, 0))}
                </p>
                <p className="text-xs text-dark-400">Valor Total</p>
              </div>
            </div>
          </div>
        )}

        {/* TASKS TAB - NOVA */}
        {activeTab === 'tasks' && (
          <TasksTab
            contactId={contact.id}
            tasks={tasks}
            isLoading={false}
            onCreateTask={async (task) => {
              if (onCreateTask) await onCreateTask(contact.id, task)
            }}
            onCompleteTask={async (taskId, outcome) => {
              if (onCompleteTask) await onCompleteTask(taskId, outcome)
            }}
            onDeleteTask={async (taskId) => {
              if (onDeleteTask) await onDeleteTask(taskId)
            }}
            onRefresh={() => onRefreshContact?.()}
          />
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{contact.total_orders || 0}</p>
                <p className="text-xs text-dark-400">Pedidos</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-primary-400">
                  {formatCurrency(contact.total_spent || 0)}
                </p>
                <p className="text-xs text-dark-400">Total Gasto</p>
              </div>
            </div>

            {/* Abandoned Cart */}
            {cart && (
              <div className="p-4 bg-warning-500/10 border border-warning-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="w-5 h-5 text-warning-400" />
                  <h4 className="font-medium text-warning-400">Carrinho Abandonado</h4>
                </div>
                <p className="text-sm text-dark-300 mb-1">
                  {cart.line_items?.length || 0} itens • {formatCurrency(cart.total_price)}
                </p>
                <p className="text-xs text-dark-500 mb-3">
                  Abandonado {formatRelativeTime(cart.created_at)}
                </p>
                <button className="w-full py-2 bg-warning-500 text-white text-sm font-medium 
                                   rounded-lg hover:bg-warning-600 transition-colors">
                  Enviar Lembrete
                </button>
              </div>
            )}

            {/* Order History */}
            {orders.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-dark-300 mb-3">Últimos Pedidos</h4>
                <div className="space-y-2">
                  {orders.slice(0, 5).map((order) => (
                    <div 
                      key={order.id}
                      className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        order.fulfillment_status === 'fulfilled' 
                          ? 'bg-success-500/10' 
                          : 'bg-primary-500/10'
                      }`}>
                        {order.fulfillment_status === 'fulfilled' ? (
                          <CheckCircle className="w-5 h-5 text-success-400" />
                        ) : (
                          <Package className="w-5 h-5 text-primary-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">Pedido #{order.order_number}</p>
                        <p className="text-xs text-dark-400">
                          {order.line_items?.length || 0} itens
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">
                          {formatCurrency(order.total_price)}
                        </p>
                        <p className="text-xs text-dark-500">
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {orders.length === 0 && !cart && (
              <div className="text-center py-8 text-dark-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum pedido encontrado</p>
              </div>
            )}
          </div>
        )}

        {/* INVOICES TAB - NOVA */}
        {activeTab === 'invoices' && (
          <InvoicesTab
            contactId={contact.id}
            invoices={invoices}
            isLoading={false}
            onUploadInvoice={async (data) => {
              if (onUploadInvoice) await onUploadInvoice(data)
            }}
            onDeleteInvoice={async (invoiceId) => {
              if (onDeleteInvoice) await onDeleteInvoice(invoiceId)
            }}
            onRefresh={() => onRefreshContact?.()}
          />
        )}

        {/* TIMELINE TAB - NOVA */}
        {activeTab === 'timeline' && (
          <TimelineTab
            contactId={contact.id}
            activities={activities}
            comments={comments}
            isLoading={false}
            onAddComment={async (content, type) => {
              if (onAddComment) await onAddComment(contact.id, content, type)
            }}
            onRefresh={() => onRefreshContact?.()}
          />
        )}
      </div>

      {/* ========== QUICK ACTIONS ========== */}
      <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
        <div className="grid grid-cols-4 gap-2">
          <button 
            onClick={() => setShowAddTag(true)}
            className="flex flex-col items-center justify-center gap-1 p-2 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <Tag className="w-4 h-4" />
            <span className="text-[10px]">Tag</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-1 p-2 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <UserPlus className="w-4 h-4" />
            <span className="text-[10px]">Atribuir</span>
          </button>
          <button 
            onClick={() => setShowCreateDeal(true)}
            className="flex flex-col items-center justify-center gap-1 p-2 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <DollarSign className="w-4 h-4" />
            <span className="text-[10px]">Deal</span>
          </button>
          <button 
            onClick={() => contact.is_blocked 
              ? onUnblockContact(contact.id) 
              : onBlockContact(contact.id)
            }
            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all ${
              contact.is_blocked
                ? 'bg-success-500/10 text-success-400 hover:bg-success-500/20'
                : 'bg-error-500/10 text-error-400 hover:bg-error-500/20'
            }`}
          >
            <Ban className="w-4 h-4" />
            <span className="text-[10px]">{contact.is_blocked ? 'Liberar' : 'Bloquear'}</span>
          </button>
        </div>
        
        {/* Links rápidos para CRM e Tasks */}
        <div className="flex gap-2 mt-2">
          <a
            href={`/crm/contacts?id=${contact.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-dark-700/30 
                       text-dark-400 rounded-lg hover:bg-dark-700/50 hover:text-white transition-all text-xs"
          >
            <ExternalLink className="w-3 h-3" />
            Ver no CRM
          </a>
          <a
            href={`/tasks?contact_id=${contact.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 p-2 bg-dark-700/30 
                       text-dark-400 rounded-lg hover:bg-dark-700/50 hover:text-white transition-all text-xs"
          >
            <CheckSquare className="w-3 h-3" />
            Ver Tarefas
          </a>
        </div>
      </div>
    </div>
  )
}

export default ContactPanel
