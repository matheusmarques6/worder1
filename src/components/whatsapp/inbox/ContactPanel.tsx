'use client'

import { useState, useEffect } from 'react'
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
  Bot,
  MessageCircle,
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
  InboxConversation,
} from '@/types/inbox'

// Import tabs components
import { TasksTab } from './tabs/TasksTab'
import { InvoicesTab } from './tabs/InvoicesTab'
import { TimelineTab } from './tabs/TimelineTab'
import { NotesTab } from './tabs/NotesTab'

// Import modals
import { CreateDealModal } from './modals/CreateDealModal'
import { AssignModal } from './modals/AssignModal'

interface ContactPanelProps {
  contact: InboxContact | null
  conversation?: InboxConversation | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
  tasks?: InboxTask[]
  invoices?: InboxInvoice[]
  comments?: InboxComment[]
  isLoading: boolean
  conversationId: string
  onUpdateContact: (id: string, updates: Partial<InboxContact>) => Promise<void>
  onAddTag: (id: string, tag: string) => Promise<void>
  onRemoveTag: (id: string, tag: string) => Promise<void>
  onAddNote: (id: string, content: string, conversationId?: string, attachments?: any[]) => Promise<void>
  onDeleteNote?: (id: string, noteId: string) => Promise<void>
  onBlockContact: (id: string, reason?: string) => Promise<void>
  onUnblockContact: (id: string) => Promise<void>
  onCreateDeal: (id: string, params: any) => Promise<any>
  onAssignConversation?: (conversationId: string, userId: string | null) => Promise<void>
  onToggleBot?: (conversationId: string, active: boolean) => Promise<void>
  // Novos callbacks
  onCreateTask?: (contactId: string, task: Partial<InboxTask>) => Promise<void>
  onCompleteTask?: (taskId: string, outcome?: string) => Promise<void>
  onDeleteTask?: (taskId: string) => Promise<void>
  onUploadInvoice?: (data: FormData) => Promise<void>
  onDeleteInvoice?: (invoiceId: string) => Promise<void>
  onAddComment?: (contactId: string, content: string, type?: string, mentions?: string[]) => Promise<void>
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

// Tab types
type TabId = 'info' | 'crm' | 'pedidos' | 'notas' | 'timeline'

// Main Component
export function ContactPanel({
  contact,
  conversation,
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
  onDeleteNote,
  onBlockContact,
  onUnblockContact,
  onCreateDeal,
  onAssignConversation,
  onToggleBot,
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
  
  // Modals
  const [showCreateDeal, setShowCreateDeal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  
  // Bot toggle
  const [isBotActive, setIsBotActive] = useState(conversation?.is_bot_active ?? true)
  const [isTogglingBot, setIsTogglingBot] = useState(false)

  // Atualizar estado do bot quando conversation mudar
  useEffect(() => {
    if (conversation) {
      setIsBotActive(conversation.is_bot_active)
    }
  }, [conversation?.is_bot_active])

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

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    try {
      await onAddTag(contact.id, newTag.trim())
      setNewTag('')
      setShowAddTag(false)
    } catch (error) {
      console.error('Error adding tag:', error)
    }
  }

  const handleToggleBot = async () => {
    if (!onToggleBot || isTogglingBot) return
    
    setIsTogglingBot(true)
    try {
      await onToggleBot(conversationId, !isBotActive)
      setIsBotActive(!isBotActive)
    } catch (error) {
      console.error('Error toggling bot:', error)
    } finally {
      setIsTogglingBot(false)
    }
  }

  const handleAssign = async (userId: string | null) => {
    if (!onAssignConversation) return
    await onAssignConversation(conversationId, userId)
  }

  const handleCreateDeal = async (params: any) => {
    return await onCreateDeal(contact.id, params)
  }

  // Tabs simplificadas como na imagem
  const tabs: { id: TabId; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'crm', label: 'CRM' },
    { id: 'pedidos', label: 'Pedidos' },
    { id: 'notas', label: 'Notas' },
    { id: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="w-full flex flex-col h-full bg-dark-900 overflow-hidden">
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
        </div>
      </div>

      {/* ========== TABS - CORRIGIDO: Sem scroll horizontal ========== */}
      <div className="border-b border-dark-700/50 overflow-hidden">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 py-3 text-[11px] font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-primary-400 border-primary-500'
                  : 'text-dark-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========== TAB CONTENT ========== */}
      <div className="flex-1 overflow-y-auto">
        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Contact Fields */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                <Phone className="w-5 h-5 text-dark-400" />
                <div className="flex-1">
                  <p className="text-xs text-dark-500">Telefone</p>
                  <p className="text-sm text-white">{contact.phone_number || contact.whatsapp}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                <Calendar className="w-5 h-5 text-dark-400" />
                <div className="flex-1">
                  <p className="text-xs text-dark-500">Contato desde</p>
                  <p className="text-sm text-white">{formatDate(contact.created_at)}</p>
                </div>
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
                    className="px-2.5 py-1 bg-primary-500/20 text-primary-400 text-xs rounded-lg 
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
                    <button onClick={handleAddTag} className="p-1 bg-primary-500 text-white rounded">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => { setShowAddTag(false); setNewTag('') }} className="p-1 bg-dark-600 text-dark-300 rounded">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Message Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">
                  {contact.total_messages_received || 0}
                </p>
                <p className="text-xs text-dark-400">Msg Recebidas</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">
                  {contact.total_messages_sent || 0}
                </p>
                <p className="text-xs text-dark-400">Msg Enviadas</p>
              </div>
            </div>
          </div>
        )}

        {/* CRM TAB */}
        {activeTab === 'crm' && (
          <div className="p-4 space-y-4">
            {/* Active Deal ou botão de criar */}
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
                </div>
                <h4 className="font-semibold text-white mb-1">{activeDeal.title}</h4>
                <p className="text-2xl font-bold text-primary-400 mb-1">
                  {formatCurrency(activeDeal.value)}
                </p>
                <div className="mt-3 flex gap-2">
                  <a 
                    href={`/crm?deal=${activeDeal.id}`}
                    target="_blank"
                    className="flex-1 py-2 bg-dark-700/50 text-dark-300 text-sm rounded-lg 
                               hover:bg-dark-700 transition-colors text-center">
                    Ver Deal
                  </a>
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

            {/* Deal Stats */}
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
                          {formatCurrency(deal.value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PEDIDOS TAB */}
        {activeTab === 'pedidos' && (
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
            {orders.length > 0 ? (
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
            ) : (
              <div className="text-center py-8 text-dark-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum pedido encontrado</p>
              </div>
            )}
          </div>
        )}

        {/* NOTAS TAB */}
        {activeTab === 'notas' && (
          <NotesTab
            contactId={contact.id}
            notes={notes}
            isLoading={false}
            onAddNote={async (content, attachments) => {
              await onAddNote(contact.id, content, conversationId, attachments)
            }}
            onDeleteNote={onDeleteNote ? async (noteId) => {
              await onDeleteNote(contact.id, noteId)
            } : undefined}
          />
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <TimelineTab
            contactId={contact.id}
            organizationId={contact.organization_id}
            activities={activities}
            comments={comments}
            isLoading={false}
            onAddComment={async (content, type, mentions) => {
              if (onAddComment) {
                await onAddComment(contact.id, content, type, mentions)
              }
            }}
            onRefresh={onRefreshContact || (() => {})}
          />
        )}
      </div>

      {/* ========== QUICK ACTIONS ========== */}
      <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setShowAddTag(true)}
            className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                       text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <Tag className="w-4 h-4" />
            <span className="text-xs">Tag</span>
          </button>
          <button 
            onClick={() => setShowAssignModal(true)}
            className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                       text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <UserPlus className="w-4 h-4" />
            <span className="text-xs">Atribuir</span>
          </button>
          <button 
            onClick={() => setShowCreateDeal(true)}
            className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                       text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs">Deal</span>
          </button>
          <button 
            onClick={() => contact.is_blocked 
              ? onUnblockContact(contact.id) 
              : onBlockContact(contact.id)
            }
            className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-all ${
              contact.is_blocked
                ? 'bg-success-500/10 text-success-400 hover:bg-success-500/20'
                : 'bg-error-500/10 text-error-400 hover:bg-error-500/20'
            }`}
          >
            <Ban className="w-4 h-4" />
            <span className="text-xs">{contact.is_blocked ? 'Liberar' : 'Bloquear'}</span>
          </button>
        </div>
      </div>

      {/* ========== MODALS ========== */}
      <CreateDealModal
        isOpen={showCreateDeal}
        onClose={() => setShowCreateDeal(false)}
        onCreateDeal={handleCreateDeal}
        contactName={contact.name || contact.phone_number}
        contactId={contact.id}
      />

      <AssignModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onAssign={handleAssign}
        currentAssignedId={conversation?.assigned_agent_id}
        conversationId={conversationId}
      />
    </div>
  )
}

export default ContactPanel
