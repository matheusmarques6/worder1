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
} from 'lucide-react'
import type { 
  InboxContact, 
  InboxNote, 
  InboxActivity, 
  InboxOrder, 
  InboxCart,
  InboxDeal 
} from '@/types/inbox'

interface ContactPanelProps {
  contact: InboxContact | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
  isLoading: boolean
  conversationId: string
  onUpdateContact: (id: string, updates: Partial<InboxContact>) => Promise<void>
  onAddTag: (id: string, tag: string) => Promise<void>
  onRemoveTag: (id: string, tag: string) => Promise<void>
  onAddNote: (id: string, content: string, conversationId?: string) => Promise<void>
  onBlockContact: (id: string, reason?: string) => Promise<void>
  onUnblockContact: (id: string) => Promise<void>
  onCreateDeal: (id: string, params: any) => Promise<any>
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
type TabId = 'info' | 'crm' | 'orders' | 'notes'

// Main Component
export function ContactPanel({
  contact,
  notes,
  activities,
  orders,
  cart,
  activeDeal,
  deals,
  isLoading,
  conversationId,
  onUpdateContact,
  onAddTag,
  onRemoveTag,
  onAddNote,
  onBlockContact,
  onUnblockContact,
  onCreateDeal,
}: ContactPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [newNote, setNewNote] = useState('')
  const [newTag, setNewTag] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)

  if (isLoading || !contact) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  const handleAddNote = async () => {
    if (!newNote.trim() || isSavingNote) return
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'crm', label: 'CRM' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'notes', label: 'Notas' },
  ]

  return (
    <div className="w-[380px] flex flex-col h-full">
      {/* ========== HEADER ========== */}
      <div className="p-6 border-b border-dark-700/50 text-center">
        {/* Avatar */}
        {contact.profile_picture_url ? (
          <img
            src={contact.profile_picture_url}
            alt={contact.name || 'Contato'}
            className="w-20 h-20 mx-auto rounded-full object-cover mb-4 ring-4 ring-primary-500/20"
          />
        ) : (
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary-500 to-accent-500 
                          flex items-center justify-center mb-4 ring-4 ring-primary-500/20">
            <span className="text-white font-bold text-2xl">
              {getInitials(contact.name || contact.phone_number)}
            </span>
          </div>
        )}

        {/* Name & Phone */}
        <h3 className="text-lg font-semibold text-white mb-1">
          {contact.name || 'Sem nome'}
        </h3>
        <p className="text-sm text-dark-400 mb-3">{contact.phone_number}</p>

        {/* Status badges */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
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

      {/* ========== TABS ========== */}
      <div className="flex border-b border-dark-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-primary-400 border-primary-500'
                : 'text-dark-400 border-transparent hover:text-white'
            }`}
          >
            {tab.label}
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
                  <p className="text-sm text-white">{contact.phone_number}</p>
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
                  <p className="text-xs text-dark-500">Contato desde</p>
                  <p className="text-sm text-white">{formatDate(contact.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-dark-300">Tags</h4>
                <button 
                  onClick={() => setShowAddTag(true)}
                  className="p-1 hover:bg-dark-700 rounded transition-colors"
                >
                  <Plus className="w-4 h-4 text-dark-400" />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {contact.tags?.map((tag, i) => (
                  <span 
                    key={i}
                    className="px-2.5 py-1 bg-primary-500/10 text-primary-400 text-xs rounded-lg 
                               flex items-center gap-1 group"
                  >
                    {tag}
                    <button 
                      onClick={() => onRemoveTag(contact.id, tag)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 hover:text-white" />
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
                      className="w-24 px-2 py-1 text-xs bg-dark-700 border border-dark-600 rounded 
                                 text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
                      autoFocus
                    />
                    <button onClick={handleAddTag} className="text-primary-400 hover:text-primary-300">
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowAddTag(false)} className="text-dark-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {(!contact.tags || contact.tags.length === 0) && !showAddTag && (
                  <span className="text-xs text-dark-500">Nenhuma tag</span>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{contact.total_messages_received}</p>
                <p className="text-xs text-dark-400">Msg Recebidas</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{contact.total_messages_sent}</p>
                <p className="text-xs text-dark-400">Msg Enviadas</p>
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
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-white">Deal Ativo</h4>
                  <span className="px-2 py-0.5 bg-primary-500 text-white text-xs rounded">
                    {activeDeal.stage?.name || 'Em andamento'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white mb-1">
                  {formatCurrency(activeDeal.value)}
                </p>
                <p className="text-sm text-dark-400">
                  {activeDeal.pipeline?.name || 'Pipeline'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button className="flex-1 py-2 bg-dark-700/50 text-dark-300 text-sm rounded-lg 
                                     hover:bg-dark-700 transition-colors">
                    Ver Deal
                  </button>
                  <button className="flex-1 py-2 bg-primary-500 text-white text-sm rounded-lg 
                                     hover:bg-primary-600 transition-colors">
                    Avançar
                  </button>
                </div>
              </div>
            ) : (
              <button className="w-full py-4 border border-dashed border-dark-600 rounded-xl 
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

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{contact.total_orders}</p>
                <p className="text-xs text-dark-400">Pedidos</p>
              </div>
              <div className="p-3 bg-dark-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-primary-400">
                  {formatCurrency(contact.total_spent)}
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
                <button className="w-full py-2 bg-warning-500 text-white text-sm rounded-lg 
                                   hover:bg-warning-600 transition-colors">
                  Enviar Recuperação
                </button>
              </div>
            )}

            {/* Last Order */}
            {orders.length > 0 && (
              <div className="p-4 bg-dark-800/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-white">Último Pedido</h4>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    orders[0].fulfillment_status === 'fulfilled' 
                      ? 'bg-success-500/10 text-success-400'
                      : 'bg-warning-500/10 text-warning-400'
                  }`}>
                    {orders[0].fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente'}
                  </span>
                </div>
                <p className="text-sm text-dark-300 mb-2">
                  #{orders[0].order_number} • {orders[0].line_items?.length || 0} itens
                </p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(orders[0].total_price)}
                </p>
                <p className="text-xs text-dark-500 mt-1">
                  {formatDate(orders[0].created_at)}
                </p>
              </div>
            )}

            {/* Orders List */}
            {orders.length > 1 && (
              <div>
                <h4 className="text-sm font-medium text-dark-300 mb-3">Todos os Pedidos</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orders.slice(1).map((order) => (
                    <div 
                      key={order.id}
                      className="flex items-center justify-between p-3 bg-dark-800/30 rounded-lg"
                    >
                      <div>
                        <p className="text-sm text-white">#{order.order_number}</p>
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

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className="p-4 space-y-4">
            {/* Add Note */}
            <div className="relative">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Adicionar uma nota..."
                className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl 
                           text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 
                           resize-none min-h-[80px]"
              />
              <button 
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSavingNote}
                className="absolute bottom-3 right-3 p-2 bg-primary-500 text-white rounded-lg 
                           hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {isSavingNote ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Notes Timeline */}
            <div className="space-y-4">
              {notes.length > 0 ? (
                notes.map((note) => (
                  <div key={note.id} className="relative pl-6 border-l-2 border-dark-700">
                    <div className="absolute left-[-5px] top-0 w-2 h-2 bg-primary-500 rounded-full" />
                    <div className="pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">
                          {note.created_by_name || 'Usuário'}
                        </span>
                        <span className="text-xs text-dark-500">
                          {formatRelativeTime(note.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-dark-300">{note.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-dark-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma nota ainda</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========== QUICK ACTIONS ========== */}
      <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
        <div className="grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <Tag className="w-4 h-4" />
            <span className="text-sm">Tag</span>
          </button>
          <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <UserPlus className="w-4 h-4" />
            <span className="text-sm">Atribuir</span>
          </button>
          <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 
                             text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Deal</span>
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
            <span className="text-sm">{contact.is_blocked ? 'Desbloquear' : 'Bloquear'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
