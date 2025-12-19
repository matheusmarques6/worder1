'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores'
import {
  Search,
  RefreshCw,
  Plus,
  MessageSquare,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Bot,
  ArrowLeft,
  MoreVertical,
  UserPlus,
  Send,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Tag,
  X,
  DollarSign,
  ShoppingCart,
  Package,
  FileText,
  Ban,
  CheckCircle,
  Wifi,
  WifiOff,
} from 'lucide-react'

// Connection components
import WhatsAppConnectionManager from '@/components/whatsapp/inbox/WhatsAppConnectionManager'
import WhatsAppConnectUnified from '@/components/whatsapp/WhatsAppConnectUnified'
import { useWhatsAppConnection, type WhatsAppInstance } from '@/hooks/useWhatsAppConnectionManager'

// Types
interface InboxContact {
  id: string
  organization_id: string
  phone_number: string
  name?: string
  email?: string
  profile_picture_url?: string
  address?: {
    city?: string
    state?: string
  }
  tags: string[]
  total_orders: number
  total_spent: number
  is_blocked: boolean
  total_messages_received: number
  total_messages_sent: number
  created_at: string
}

interface InboxConversation {
  id: string
  organization_id: string
  contact_id: string
  phone_number: string
  status: string
  is_bot_active: boolean
  last_message_at?: string
  last_message_preview?: string
  unread_count: number
  can_send_template_only: boolean
  contact_name?: string
  contact_avatar?: string
  contact_tags?: string[]
}

interface InboxMessage {
  id: string
  conversation_id: string
  direction: string
  message_type: string
  content?: string
  media_url?: string
  media_filename?: string
  status: string
  sent_by_bot: boolean
  created_at: string
}

interface InboxNote {
  id: string
  content: string
  created_by_name?: string
  created_at: string
}

interface InboxDeal {
  id: string
  title: string
  value: number
  status: string
  pipeline?: { name: string }
  stage?: { name: string }
  created_at: string
}

interface InboxOrder {
  id: string
  order_number: string
  total_price: number
  fulfillment_status?: string
  line_items?: any[]
  created_at: string
}

interface InboxCart {
  id: string
  total_price: number
  line_items?: any[]
  created_at: string
}

// Helpers
const formatPhone = (phone?: string) => {
  if (!phone) return ''
  const clean = phone.replace(/\D/g, '')
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} ${clean.slice(2, 4)} ${clean.slice(4, 9)}-${clean.slice(9)}`
  }
  return phone
}

const formatTime = (date?: string) => {
  if (!date) return ''
  const now = new Date()
  const dt = new Date(date)
  const diffMinutes = Math.floor((now.getTime() - dt.getTime()) / 60000)
  
  if (diffMinutes < 1) return 'Agora'
  if (diffMinutes < 60) return `${diffMinutes}min`
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`
  if (diffMinutes < 2880) return 'Ontem'
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const formatMessageTime = (date?: string) => {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatRelativeTime = (date?: string) => {
  if (!date) return ''
  const diffMins = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diffMins < 60) return `há ${diffMins}min`
  if (diffMins < 1440) return `há ${Math.floor(diffMins / 60)}h`
  return `há ${Math.floor(diffMins / 1440)}d`
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const getInitials = (name?: string) => {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Status Icon
function MessageStatus({ status }: { status: string }) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4 text-dark-500" />
    case 'sent': return <Check className="w-4 h-4 text-dark-500" />
    case 'delivered': return <CheckCheck className="w-4 h-4 text-dark-500" />
    case 'read': return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'failed': return <AlertCircle className="w-4 h-4 text-red-400" />
    default: return <Clock className="w-4 h-4 text-dark-500" />
  }
}

// Date Separator
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  
  let label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  if (d.toDateString() === today.toDateString()) label = 'Hoje'
  if (d.toDateString() === yesterday.toDateString()) label = 'Ontem'

  return (
    <div className="flex items-center gap-4 my-4">
      <div className="flex-1 h-px bg-dark-700/50" />
      <span className="text-xs text-dark-500 bg-dark-900 px-3 py-1 rounded-full">{label}</span>
      <div className="flex-1 h-px bg-dark-700/50" />
    </div>
  )
}

export default function InboxTab() {
  // Auth
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || ''

  // WhatsApp Connection Management
  const {
    instances,
    selectedInstance,
    loading: instancesLoading,
    selectInstance,
    fetchInstances,
  } = useWhatsAppConnection(organizationId)

  const [showConnectModal, setShowConnectModal] = useState(false)

  const handleInstanceSelect = (instance: WhatsAppInstance | null) => {
    selectInstance(instance)
    // Recarregar conversas para a nova instância
    if (instance) {
      fetchConversations()
    }
  }

  const handleConnectionSuccess = (instance: any) => {
    fetchInstances()
    setShowConnectModal(false)
  }

  // State
  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [contact, setContact] = useState<InboxContact | null>(null)
  const [notes, setNotes] = useState<InboxNote[]>([])
  const [deals, setDeals] = useState<InboxDeal[]>([])
  const [orders, setOrders] = useState<InboxOrder[]>([])
  const [cart, setCart] = useState<InboxCart | null>(null)
  
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showContactPanel, setShowContactPanel] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [activeTab, setActiveTab] = useState<'info' | 'crm' | 'orders' | 'notes'>('info')
  
  const [input, setInput] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newTag, setNewTag] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [isSavingNote, setIsSavingNote] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch conversations
  const fetchConversations = async (silent?: boolean | React.MouseEvent) => {
    // Se for um evento de clique, não é silent
    const isSilent = typeof silent === 'boolean' ? silent : false
    
    if (!organizationId) return
    if (!isSilent) setConversationsLoading(true)
    try {
      const params = new URLSearchParams({ organizationId })
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/whatsapp/inbox/conversations?${params}`)
      const data = await res.json()
      
      // Atualizar conversas mas preservar unread_count=0 da conversa selecionada
      const updatedConversations = (data.conversations || []).map((conv: InboxConversation) => {
        if (selectedConversation && conv.id === selectedConversation.id) {
          return { ...conv, unread_count: 0 }
        }
        return conv
      })
      setConversations(updatedConversations)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (!isSilent) setConversationsLoading(false)
    }
  }

  // Fetch messages - silencioso se já tem mensagens
  const fetchMessages = async (conversationId: string, silent = false) => {
    // Só mostra loading na primeira carga
    if (!silent && messages.length === 0) setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${conversationId}/messages`)
      const data = await res.json()
      const newMessages = data.messages || []
      
      // Só atualiza se houver diferença (evita re-render desnecessário)
      if (JSON.stringify(newMessages.map((m: any) => m.id)) !== JSON.stringify(messages.map(m => m.id))) {
        setMessages(newMessages)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setMessagesLoading(false)
    }
  }

  // Fetch contact - silencioso se já tem contato
  const fetchContact = async (contactId: string, silent = false) => {
    // Só mostra loading na primeira carga
    if (!silent && !contact) setContactLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`)
      const data = await res.json()
      if (data.contact) setContact(data.contact)
      setNotes(data.notes || [])
    } catch (error) {
      console.error('Error fetching contact:', error)
    } finally {
      setContactLoading(false)
    }
  }

  // Fetch orders
  const fetchOrders = async (contactId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/orders`)
      const data = await res.json()
      setOrders(data.orders || [])
      setCart(data.cart || null)
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  // Fetch deals
  const fetchDeals = async (contactId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/deals`)
      const data = await res.json()
      setDeals(data.deals || [])
    } catch (error) {
      console.error('Error fetching deals:', error)
    }
  }

  // Send message
  const handleSendMessage = async () => {
    if (!input.trim() || !selectedConversation || isSending) return
    const content = input.trim()
    setInput('')
    setIsSending(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, messageType: 'text' })
      })
      const data = await res.json()
      if (data.message) setMessages(prev => [...prev, data.message])
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSending(false)
    }
  }

  // Toggle bot
  const handleToggleBot = async () => {
    if (!selectedConversation) return
    try {
      await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !selectedConversation.is_bot_active })
      })
      setSelectedConversation(prev => prev ? { ...prev, is_bot_active: !prev.is_bot_active } : null)
    } catch (error) {
      console.error('Error toggling bot:', error)
    }
  }

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim() || !contact || isSavingNote) return
    setIsSavingNote(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim(), conversationId: selectedConversation?.id })
      })
      const data = await res.json()
      if (data.note) {
        setNotes(prev => [data.note, ...prev])
        setNewNote('')
      }
    } catch (error) {
      console.error('Error adding note:', error)
    } finally {
      setIsSavingNote(false)
    }
  }

  // Tags
  const handleAddTag = async () => {
    if (!newTag.trim() || !contact) return
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTag.trim(), action: 'add' })
      })
      const data = await res.json()
      if (data.contact) {
        setContact(prev => prev ? { ...prev, tags: data.contact.tags } : null)
        setNewTag('')
        setShowAddTag(false)
      }
    } catch (error) {
      console.error('Error adding tag:', error)
    }
  }

  const handleRemoveTag = async (tag: string) => {
    if (!contact) return
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, action: 'remove' })
      })
      const data = await res.json()
      if (data.contact) setContact(prev => prev ? { ...prev, tags: data.contact.tags } : null)
    } catch (error) {
      console.error('Error removing tag:', error)
    }
  }

  // Block
  const handleBlockContact = async () => {
    if (!contact) return
    try {
      await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: !contact.is_blocked })
      })
      setContact(prev => prev ? { ...prev, is_blocked: !prev.is_blocked } : null)
    } catch (error) {
      console.error('Error blocking contact:', error)
    }
  }

  // Select conversation
  const handleSelectConversation = (conv: InboxConversation) => {
    // Se é a mesma conversa, não faz nada
    if (selectedConversation?.id === conv.id) return
    
    // Zerar unread_count localmente imediatamente
    const updatedConv = { ...conv, unread_count: 0 }
    setSelectedConversation(updatedConv)
    
    // Atualizar lista de conversas localmente
    setConversations(prev => prev.map(c => 
      c.id === conv.id ? { ...c, unread_count: 0 } : c
    ))
    
    // Limpar dados antigos apenas se mudar de conversa
    setMessages([])
    setContact(null)
    setNotes([])
    setDeals([])
    setOrders([])
    setCart(null)
    
    setMobileView('chat')
    
    // Carregar novos dados (primeira carga, então mostra loading)
    fetchMessages(conv.id, false)
    if (conv.contact_id) {
      fetchContact(conv.contact_id, false)
      fetchOrders(conv.contact_id)
      fetchDeals(conv.contact_id)
    }
    
    // Zerar no banco
    fetch(`/api/whatsapp/inbox/conversations/${conv.id}/read`, { method: 'POST' }).catch(() => {})
  }

  // Effects
  useEffect(() => { if (organizationId) fetchConversations() }, [statusFilter, organizationId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Polling para conversas (a cada 5 segundos) - silencioso
  useEffect(() => {
    if (!organizationId) return
    const interval = setInterval(() => {
      fetchConversations(true) // silent = true
    }, 5000)
    return () => clearInterval(interval)
  }, [organizationId, statusFilter, selectedConversation?.id])

  // Polling para mensagens (a cada 3 segundos quando há conversa selecionada)
  useEffect(() => {
    if (!selectedConversation) return
    const interval = setInterval(() => {
      fetchMessages(selectedConversation.id, true) // silent = true
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedConversation?.id])
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Group messages by date
  const groupedMessages: { date: string; messages: InboxMessage[] }[] = []
  let currentDate = ''
  messages.forEach(msg => {
    const msgDate = new Date(msg.created_at).toDateString()
    if (msgDate !== currentDate) {
      currentDate = msgDate
      groupedMessages.push({ date: msg.created_at, messages: [msg] })
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg)
    }
  })

  const contactName = selectedConversation?.contact_name || formatPhone(selectedConversation?.phone_number)
  const activeDeal = deals.find(d => d.status === 'open')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() }
  }

  const tabs: { id: 'info' | 'crm' | 'orders' | 'notes'; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'crm', label: 'CRM' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'notes', label: 'Notas' },
  ]

  return (
    <div className="h-[calc(100vh-80px)] flex bg-dark-900/50 rounded-2xl border border-dark-700/50 overflow-hidden">
      {/* ========== CONVERSATION LIST ========== */}
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-dark-700/50 flex flex-col bg-dark-900/30 ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-dark-700/50">
          {/* Connection Manager */}
          <div className="mb-4">
            <WhatsAppConnectionManager
              organizationId={organizationId}
              selectedInstance={selectedInstance}
              onSelectInstance={handleInstanceSelect}
              onConnectClick={() => setShowConnectModal(true)}
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Conversas</h2>
              {/* Connection Status Indicator */}
              {selectedInstance && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  selectedInstance.status === 'ACTIVE' || selectedInstance.status === 'connected'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {selectedInstance.status === 'ACTIVE' || selectedInstance.status === 'connected' ? (
                    <><Wifi className="w-3 h-3" /> Online</>
                  ) : (
                    <><WifiOff className="w-3 h-3" /> Offline</>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={fetchConversations} disabled={conversationsLoading} className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors disabled:opacity-50">
                <RefreshCw className={`w-5 h-5 ${conversationsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input type="text" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchConversations()} className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 transition-colors" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ id: 'all', label: 'Todas' }, { id: 'open', label: 'Abertas' }, { id: 'pending', label: 'Pendentes' }, { id: 'closed', label: 'Fechadas' }].map((filter) => (
              <button key={filter.id} onClick={() => setStatusFilter(filter.id)} className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${statusFilter === filter.id ? 'bg-primary-500 text-white' : 'bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-700/50'}`}>
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversationsLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-primary-400 animate-spin" /></div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-dark-400 p-8">
              <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4"><MessageSquare className="w-8 h-8 opacity-50" /></div>
              <p className="text-sm font-medium">Nenhuma conversa</p>
              <p className="text-xs text-dark-500 mt-1 text-center">Aguardando novas mensagens ou inicie uma nova conversa</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const name = conv.contact_name || formatPhone(conv.phone_number)
              const hasUnread = conv.unread_count > 0
              return (
                <motion.div key={conv.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} onClick={() => handleSelectConversation(conv)} className={`flex items-start gap-3 p-4 cursor-pointer border-b border-dark-700/30 transition-all ${selectedConversation?.id === conv.id ? 'bg-primary-500/10 border-l-2 border-l-primary-500' : 'hover:bg-dark-800/50 border-l-2 border-l-transparent'}`}>
                  <div className="relative flex-shrink-0">
                    {conv.contact_avatar ? <img src={conv.contact_avatar} alt={name} className="w-12 h-12 rounded-full object-cover" /> : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">{getInitials(conv.contact_name || conv.phone_number)}</span>
                      </div>
                    )}
                    {conv.is_bot_active && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center border-2 border-dark-900"><Bot className="w-3 h-3 text-white" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`font-medium truncate ${hasUnread ? 'text-white' : 'text-dark-200'}`}>{name}</span>
                      <span className={`text-xs flex-shrink-0 ${hasUnread ? 'text-primary-400 font-medium' : 'text-dark-500'}`}>{formatTime(conv.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${hasUnread ? 'text-dark-300' : 'text-dark-500'}`}>{conv.last_message_preview || 'Nova conversa'}</p>
                      {hasUnread && <span className="flex-shrink-0 px-2 py-0.5 bg-primary-500 rounded-full text-[10px] font-bold text-white min-w-[20px] text-center">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>}
                    </div>
                    {conv.contact_tags && conv.contact_tags.length > 0 && (
                      <div className="flex gap-1 mt-2 overflow-hidden">
                        {conv.contact_tags.slice(0, 2).map((tag, i) => <span key={i} className="px-2 py-0.5 bg-dark-700/50 rounded text-[10px] text-dark-300 truncate max-w-[80px]">{tag}</span>)}
                        {conv.contact_tags.length > 2 && <span className="px-2 py-0.5 bg-dark-700/50 rounded text-[10px] text-dark-400">+{conv.contact_tags.length - 2}</span>}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      {/* ========== CHAT PANEL ========== */}
      <div className={`flex-1 flex flex-col min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {selectedConversation ? (
          <>
            <div className="flex items-center justify-between p-4 border-b border-dark-700/50 bg-dark-800/30">
              <div className="flex items-center gap-3">
                <button onClick={() => setMobileView('list')} className="md:hidden p-2 rounded-lg hover:bg-dark-700/50 text-dark-400"><ArrowLeft className="w-5 h-5" /></button>
                {selectedConversation.contact_avatar ? <img src={selectedConversation.contact_avatar} alt={contactName} className="w-10 h-10 rounded-full object-cover" /> : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center"><span className="text-white font-semibold text-sm">{getInitials(contactName)}</span></div>
                )}
                <div>
                  <h3 className="font-semibold text-white">{contactName}</h3>
                  <p className="text-xs text-dark-400">{formatPhone(selectedConversation.phone_number)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleToggleBot} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedConversation.is_bot_active ? 'bg-primary-500/10 text-primary-400 border border-primary-500/30' : 'bg-dark-700/50 text-dark-400 hover:text-white'}`}>
                  <Bot className="w-4 h-4" /><span className="hidden sm:inline">{selectedConversation.is_bot_active ? 'Bot Ativo' : 'Bot Off'}</span>
                </button>
                <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors"><UserPlus className="w-5 h-5" /></button>
                <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors"><MoreVertical className="w-5 h-5" /></button>
                <button onClick={() => setShowContactPanel(!showContactPanel)} className="hidden lg:block p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors">
                  {showContactPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-primary-400 animate-spin" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-dark-400">
                  <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4"><Send className="w-8 h-8 opacity-50" /></div>
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                  <p className="text-xs text-dark-500 mt-1">Envie uma mensagem para iniciar a conversa</p>
                </div>
              ) : (
                <>
                  {groupedMessages.map((group, gi) => (
                    <div key={gi}>
                      <DateSeparator date={group.date} />
                      <div className="space-y-3">
                        {group.messages.map((msg) => {
                          const isOutbound = msg.direction === 'outbound'
                          return (
                            <div key={msg.id} className={`flex gap-3 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                              {!isOutbound && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-1"><span className="text-white text-xs font-semibold">{getInitials(contactName)}</span></div>}
                              <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'}`}>
                                <div className={`relative rounded-2xl px-4 py-2.5 ${isOutbound ? msg.sent_by_bot ? 'bg-gradient-to-r from-primary-500 to-primary-600 rounded-tr-md' : 'bg-primary-500 rounded-tr-md' : 'bg-dark-800 border border-dark-700/50 rounded-tl-md'}`}>
                                  {msg.sent_by_bot && <div className="absolute top-2 right-2"><Bot className="w-3 h-3 text-white/50" /></div>}
                                  {msg.message_type === 'document' && msg.media_url && <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-dark-700/50 rounded-lg mb-2 hover:bg-dark-700"><FileText className="w-5 h-5 text-primary-400" /><span className="text-sm text-white truncate">{msg.media_filename || 'Documento'}</span></a>}
                                  {msg.content && <p className={`text-sm whitespace-pre-wrap break-words ${isOutbound ? 'text-white' : 'text-dark-100'}`}>{msg.content}</p>}
                                </div>
                                <div className={`flex items-center gap-1.5 mt-1 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                  {msg.sent_by_bot && isOutbound && <span className="text-[10px] text-dark-500">via Bot</span>}
                                  <span className="text-[10px] text-dark-500">{formatMessageTime(msg.created_at)}</span>
                                  {isOutbound && <MessageStatus status={msg.status} />}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
              {selectedConversation.can_send_template_only && (
                <div className="flex items-center gap-2 p-3 mb-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
                  <span className="text-sm text-warning-400">Janela de 24h expirada. Use um template.</span>
                  <button className="ml-auto text-sm text-primary-400 font-medium hover:underline whitespace-nowrap">Enviar Template</button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button className="p-2.5 rounded-xl hover:bg-dark-700/50 text-dark-400 hover:text-primary-400 transition-colors"><Smile className="w-5 h-5" /></button>
                <button className="p-2.5 rounded-xl hover:bg-dark-700/50 text-dark-400 hover:text-primary-400 transition-colors"><Paperclip className="w-5 h-5" /></button>
                <div className="flex-1 relative">
                  <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Digite uma mensagem..." disabled={isSending} rows={1} className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 resize-none transition-colors disabled:opacity-50" style={{ maxHeight: '120px' }} />
                </div>
                <button onClick={handleSendMessage} disabled={!input.trim() || isSending} className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700 transition-colors">/atalhos</button>
                <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700 transition-colors">📋 Templates</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-dark-400">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm text-dark-500 mt-1">Escolha uma conversa da lista para começar</p>
          </div>
        )}
      </div>

      {/* ========== CONTACT PANEL ========== */}
      <AnimatePresence>
        {selectedConversation && showContactPanel && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 380, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="hidden lg:flex flex-col flex-shrink-0 border-l border-dark-700/50 bg-dark-900/30 overflow-hidden">
            {contactLoading || !contact ? (
              <div className="w-[380px] h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary-400 animate-spin" /></div>
            ) : (
              <div className="w-[380px] flex flex-col h-full">
                <div className="p-6 border-b border-dark-700/50 text-center">
                  {contact.profile_picture_url ? <img src={contact.profile_picture_url} alt={contact.name || 'Contato'} className="w-20 h-20 mx-auto rounded-full object-cover mb-4 ring-4 ring-primary-500/20" /> : (
                    <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mb-4 ring-4 ring-primary-500/20"><span className="text-white font-bold text-2xl">{getInitials(contact.name || contact.phone_number)}</span></div>
                  )}
                  <h3 className="text-lg font-semibold text-white mb-1">{contact.name || 'Sem nome'}</h3>
                  <p className="text-sm text-dark-400 mb-3">{contact.phone_number}</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {contact.is_blocked ? <span className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg">Bloqueado</span> : <span className="px-2.5 py-1 bg-green-500/10 text-green-400 text-xs font-medium rounded-lg">Ativo</span>}
                    {contact.total_orders > 0 && <span className="px-2.5 py-1 bg-primary-500/10 text-primary-400 text-xs font-medium rounded-lg">Cliente</span>}
                  </div>
                </div>

                <div className="flex border-b border-dark-700/50">
                  {tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === tab.id ? 'text-primary-400 border-primary-500' : 'text-dark-400 border-transparent hover:text-white'}`}>{tab.label}</button>)}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activeTab === 'info' && (
                    <div className="p-4 space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"><Mail className="w-5 h-5 text-dark-400" /><div className="flex-1 min-w-0"><p className="text-xs text-dark-500">Email</p><p className="text-sm text-white truncate">{contact.email || 'Não informado'}</p></div></div>
                        <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"><Phone className="w-5 h-5 text-dark-400" /><div className="flex-1"><p className="text-xs text-dark-500">Telefone</p><p className="text-sm text-white">{contact.phone_number}</p></div></div>
                        {contact.address?.city && <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"><MapPin className="w-5 h-5 text-dark-400" /><div className="flex-1"><p className="text-xs text-dark-500">Cidade</p><p className="text-sm text-white">{contact.address.city}{contact.address.state ? `, ${contact.address.state}` : ''}</p></div></div>}
                        <div className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl"><Calendar className="w-5 h-5 text-dark-400" /><div className="flex-1"><p className="text-xs text-dark-500">Contato desde</p><p className="text-sm text-white">{formatDate(contact.created_at)}</p></div></div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-medium text-dark-300">Tags</h4><button onClick={() => setShowAddTag(true)} className="p-1 hover:bg-dark-700 rounded transition-colors"><Plus className="w-4 h-4 text-dark-400" /></button></div>
                        <div className="flex flex-wrap gap-2">
                          {contact.tags?.map((tag, i) => <span key={i} className="px-2.5 py-1 bg-primary-500/10 text-primary-400 text-xs rounded-lg flex items-center gap-1 group">{tag}<button onClick={() => handleRemoveTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3 hover:text-white" /></button></span>)}
                          {showAddTag && (
                            <div className="flex items-center gap-1">
                              <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Nova tag" className="w-24 px-2 py-1 text-xs bg-dark-700 border border-dark-600 rounded text-white placeholder-dark-400 focus:outline-none focus:border-primary-500" autoFocus />
                              <button onClick={handleAddTag} className="text-primary-400 hover:text-primary-300"><CheckCircle className="w-4 h-4" /></button>
                              <button onClick={() => setShowAddTag(false)} className="text-dark-400 hover:text-white"><X className="w-4 h-4" /></button>
                            </div>
                          )}
                          {(!contact.tags || contact.tags.length === 0) && !showAddTag && <span className="text-xs text-dark-500">Nenhuma tag</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-dark-800/50 rounded-xl text-center"><p className="text-2xl font-bold text-white">{contact.total_messages_received}</p><p className="text-xs text-dark-400">Msg Recebidas</p></div>
                        <div className="p-3 bg-dark-800/50 rounded-xl text-center"><p className="text-2xl font-bold text-white">{contact.total_messages_sent}</p><p className="text-xs text-dark-400">Msg Enviadas</p></div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'crm' && (
                    <div className="p-4 space-y-4">
                      {activeDeal ? (
                        <div className="p-4 bg-gradient-to-br from-primary-500/10 to-yellow-500/10 border border-primary-500/20 rounded-xl">
                          <div className="flex items-center justify-between mb-3"><h4 className="font-medium text-white">Deal Ativo</h4><span className="px-2 py-0.5 bg-primary-500 text-white text-xs rounded">{activeDeal.stage?.name || 'Em andamento'}</span></div>
                          <p className="text-2xl font-bold text-white mb-1">{formatCurrency(activeDeal.value)}</p>
                          <p className="text-sm text-dark-400">{activeDeal.pipeline?.name || 'Pipeline'}</p>
                        </div>
                      ) : (
                        <button className="w-full py-4 border border-dashed border-dark-600 rounded-xl text-dark-400 hover:text-white hover:border-primary-500 transition-all flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Criar Novo Deal</button>
                      )}
                      {deals.length > 0 && (
                        <div><h4 className="text-sm font-medium text-dark-300 mb-3">Histórico</h4>
                          <div className="space-y-2">
                            {deals.filter(d => d.id !== activeDeal?.id).slice(0, 5).map((deal) => (
                              <div key={deal.id} className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl">
                                <div className={`w-2 h-2 rounded-full ${deal.status === 'won' ? 'bg-green-500' : deal.status === 'lost' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{deal.title}</p><p className="text-xs text-dark-400">{formatCurrency(deal.value)}</p></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'orders' && (
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-dark-800/50 rounded-xl text-center"><p className="text-2xl font-bold text-white">{contact.total_orders}</p><p className="text-xs text-dark-400">Pedidos</p></div>
                        <div className="p-3 bg-dark-800/50 rounded-xl text-center"><p className="text-2xl font-bold text-primary-400">{formatCurrency(contact.total_spent)}</p><p className="text-xs text-dark-400">Total Gasto</p></div>
                      </div>
                      {cart && (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3"><ShoppingCart className="w-5 h-5 text-yellow-400" /><h4 className="font-medium text-yellow-400">Carrinho Abandonado</h4></div>
                          <p className="text-sm text-dark-300 mb-1">{cart.line_items?.length || 0} itens • {formatCurrency(cart.total_price)}</p>
                          <p className="text-xs text-dark-500 mb-3">Abandonado {formatRelativeTime(cart.created_at)}</p>
                          <button className="w-full py-2 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 transition-colors">Enviar Recuperação</button>
                        </div>
                      )}
                      {orders.length > 0 && (
                        <div className="p-4 bg-dark-800/50 rounded-xl">
                          <div className="flex items-center justify-between mb-3"><h4 className="font-medium text-white">Último Pedido</h4><span className={`px-2 py-0.5 text-xs rounded ${orders[0].fulfillment_status === 'fulfilled' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{orders[0].fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente'}</span></div>
                          <p className="text-sm text-dark-300 mb-2">#{orders[0].order_number} • {orders[0].line_items?.length || 0} itens</p>
                          <p className="text-lg font-semibold text-white">{formatCurrency(orders[0].total_price)}</p>
                        </div>
                      )}
                      {orders.length === 0 && !cart && <div className="text-center py-8 text-dark-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhum pedido encontrado</p></div>}
                    </div>
                  )}

                  {activeTab === 'notes' && (
                    <div className="p-4 space-y-4">
                      <div className="relative">
                        <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Adicionar uma nota..." className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 resize-none min-h-[80px]" />
                        <button onClick={handleAddNote} disabled={!newNote.trim() || isSavingNote} className="absolute bottom-3 right-3 p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50">
                          {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="space-y-4">
                        {notes.length > 0 ? notes.map((note) => (
                          <div key={note.id} className="relative pl-6 border-l-2 border-dark-700">
                            <div className="absolute left-[-5px] top-0 w-2 h-2 bg-primary-500 rounded-full" />
                            <div className="pb-4">
                              <div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium text-white">{note.created_by_name || 'Usuário'}</span><span className="text-xs text-dark-500">{formatRelativeTime(note.created_at)}</span></div>
                              <p className="text-sm text-dark-300">{note.content}</p>
                            </div>
                          </div>
                        )) : <div className="text-center py-8 text-dark-400"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhuma nota ainda</p></div>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
                  <div className="grid grid-cols-2 gap-2">
                    <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all"><Tag className="w-4 h-4" /><span className="text-sm">Tag</span></button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all"><UserPlus className="w-4 h-4" /><span className="text-sm">Atribuir</span></button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-dark-700/50 text-dark-300 rounded-xl hover:bg-dark-700 hover:text-white transition-all"><DollarSign className="w-4 h-4" /><span className="text-sm">Deal</span></button>
                    <button onClick={handleBlockContact} className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-all ${contact.is_blocked ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}><Ban className="w-4 h-4" /><span className="text-sm">{contact.is_blocked ? 'Desbloquear' : 'Bloquear'}</span></button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Connect Modal */}
      <WhatsAppConnectUnified
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={handleConnectionSuccess}
        organizationId={organizationId}
      />
    </div>
  )
}
