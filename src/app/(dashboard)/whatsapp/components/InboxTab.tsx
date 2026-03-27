'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Image,
  Mic,
  Video,
  StopCircle,
  Camera,
} from 'lucide-react'

// Connection components
import WhatsAppConnectionManager from '@/components/whatsapp/inbox/WhatsAppConnectionManager'
import WhatsAppConnectUnified from '@/components/whatsapp/WhatsAppConnectUnified'
import { useWhatsAppConnection, type WhatsAppInstance } from '@/hooks/useWhatsAppConnectionManager'

// Realtime hook
import { useInboxRealtime } from '@/hooks/useInboxRealtime'

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
  ai_enabled?: boolean
  ai_agent_id?: string
  last_message_at?: string
  last_message_preview?: string
  unread_count: number
  can_send_template_only: boolean
  contact_name?: string
  contact_avatar?: string
  contact_tags?: string[]
}

interface AIAgent {
  id: string
  name: string
  type: string
  is_active: boolean
  status?: string
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
    case 'pending': return <Clock className="w-4 h-4 text-gray-400" />
    case 'sent': return <Check className="w-4 h-4 text-gray-400" />
    case 'delivered': return <CheckCheck className="w-4 h-4 text-gray-400" />
    case 'read': return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'failed': return <AlertCircle className="w-4 h-4 text-red-400" />
    default: return <Clock className="w-4 h-4 text-gray-400" />
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
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
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

  const handleConnectionSuccess = useCallback((instance: any) => {
    console.log('[Connection] Success! Refreshing instances...')
    fetchInstances()
    setShowConnectModal(false)
  }, [fetchInstances])

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
  
  // AI Agent states
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(false)
  
  // Media states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  
  // Media Preview state (antes de enviar)
  const [mediaPreview, setMediaPreview] = useState<{
    file: File
    url: string
    type: 'image' | 'video' | 'audio' | 'document'
  } | null>(null)
  const [mediaCaption, setMediaCaption] = useState('')
  
  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recordingInterval = useRef<NodeJS.Timeout | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // =============================================
  // DEBUG STATE
  // =============================================
  const [debugEvents, setDebugEvents] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)
  
  const addDebugEvent = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR')
    setDebugEvents(prev => [`[${timestamp}] ${event}`, ...prev.slice(0, 19)])
  }, [])

  // =============================================
  // REALTIME HANDLERS
  // =============================================
  
  const handleNewMessage = useCallback((message: InboxMessage) => {
    console.log('[Realtime] 🔔 New message received:', message)
    addDebugEvent(`📩 MSG: ${message.content?.substring(0, 30) || '[mídia]'} (conv: ${message.conversation_id?.substring(0, 8)})`)
    
    // Adicionar mensagem se for da conversa selecionada
    if (selectedConversation && message.conversation_id === selectedConversation.id) {
      console.log('[Realtime] ✅ Adding message to current conversation')
      addDebugEvent(`✅ Adicionado à conversa atual`)
      setMessages(prev => {
        // Evitar duplicatas
        if (prev.find(m => m.id === message.id)) {
          console.log('[Realtime] ⚠️ Message already exists, skipping')
          return prev
        }
        return [...prev, message]
      })
    } else {
      console.log('[Realtime] ℹ️ Message for different conversation:', message.conversation_id, 'Current:', selectedConversation?.id)
      addDebugEvent(`ℹ️ Msg para outra conversa`)
    }
    
    // Atualizar lista de conversas
    setConversations(prev => prev.map(conv => {
      if (conv.id === message.conversation_id) {
        return {
          ...conv,
          last_message_at: message.created_at,
          last_message_preview: message.content || '[Mídia]',
          unread_count: selectedConversation?.id === conv.id ? 0 : conv.unread_count + 1
        }
      }
      return conv
    }))
  }, [selectedConversation, addDebugEvent])

  const handleMessageUpdate = useCallback((message: InboxMessage) => {
    console.log('[Realtime] 🔄 Message updated:', message)
    addDebugEvent(`🔄 MSG UPDATE: status=${message.status}`)
    setMessages(prev => prev.map(m => m.id === message.id ? message : m))
  }, [addDebugEvent])

  const handleConversationUpdate = useCallback((conversation: InboxConversation) => {
    console.log('[Realtime] 🔄 Conversation updated:', conversation)
    addDebugEvent(`🔄 CONV: ${conversation.contact_name || conversation.phone_number}`)
    setConversations(prev => prev.map(c => c.id === conversation.id ? { ...c, ...conversation } : c))
    
    // Atualizar selecionada se for a mesma
    if (selectedConversation?.id === conversation.id) {
      setSelectedConversation(prev => prev ? { ...prev, ...conversation } : null)
    }
  }, [selectedConversation, addDebugEvent])

  const handleNewConversation = useCallback((conversation: InboxConversation) => {
    console.log('[Realtime] 🆕 New conversation:', conversation)
    addDebugEvent(`🆕 NOVA CONV: ${conversation.contact_name || conversation.phone_number}`)
    setConversations(prev => {
      if (prev.find(c => c.id === conversation.id)) return prev
      return [conversation, ...prev]
    })
  }, [addDebugEvent])

  const handleInstanceUpdate = useCallback((instance: WhatsAppInstance) => {
    console.log('[Realtime] 📱 Instance updated:', instance)
    addDebugEvent(`📱 INSTÂNCIA: status=${instance?.status}`)
    // Atualizar a lista de instâncias quando houver mudança de status
    fetchInstances()
  }, [fetchInstances, addDebugEvent])

  // =============================================
  // SUPABASE REALTIME
  // =============================================
  const { isConnected: realtimeConnected, hasError: realtimeError, status: realtimeStatus, lastEvent } = useInboxRealtime({
    organizationId,
    conversationId: selectedConversation?.id || null,
    onNewMessage: handleNewMessage,
    onMessageUpdate: handleMessageUpdate,
    onConversationUpdate: handleConversationUpdate,
    onNewConversation: handleNewConversation,
    onInstanceUpdate: handleInstanceUpdate,
    enabled: !!organizationId
  })

  // Log realtime events to debug panel
  useEffect(() => {
    if (lastEvent) {
      addDebugEvent(`⚡ REALTIME: ${lastEvent}`)
    }
  }, [lastEvent, addDebugEvent])

  // Log connection status changes
  useEffect(() => {
    addDebugEvent(`🔌 Status: conv=${realtimeStatus.conversations}, msg=${realtimeStatus.messages}, inst=${realtimeStatus.instances}`)
  }, [realtimeStatus, addDebugEvent])

  // =============================================
  // FALLBACK POLLING (quando Realtime falha)
  // =============================================
  useEffect(() => {
    // Se realtime está funcionando, não precisa de polling
    if (realtimeConnected && !realtimeError) {
      console.log('[Polling] Realtime connected, skipping polling')
      return
    }

    // Polling a cada 5s como fallback
    console.log('[Polling] Starting fallback polling (realtime not connected)')
    
    const pollInterval = setInterval(() => {
      console.log('[Polling] Fetching conversations silently...')
      fetchConversations(true) // silent = true
      
      if (selectedConversation?.id) {
        fetchMessages(selectedConversation.id, true) // silent = true
      }
    }, 5000)

    return () => {
      console.log('[Polling] Stopping fallback polling')
      clearInterval(pollInterval)
    }
  }, [realtimeConnected, realtimeError, selectedConversation?.id])

  // =============================================
  // DATA FETCHING
  // =============================================

  // Fetch conversations
  const fetchConversations = async (silent?: boolean | React.MouseEvent) => {
    const isSilent = typeof silent === 'boolean' ? silent : false
    
    if (!organizationId) return
    if (!isSilent) setConversationsLoading(true)
    try {
      const params = new URLSearchParams({ organizationId })
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/whatsapp/inbox/conversations?${params}`)
      const data = await res.json()
      
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (!isSilent) setConversationsLoading(false)
    }
  }

  // Fetch messages
  const fetchMessages = async (conversationId: string, silent = false) => {
    if (!silent) setMessagesLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${conversationId}/messages`)
      const data = await res.json()
      
      setMessages(data.messages || [])
    } catch (error) {
      console.error('[fetchMessages] Error:', error)
    } finally {
      if (!silent) setMessagesLoading(false)
    }
  }

  // Fetch contact
  const fetchContact = async (contactId: string, silent = false) => {
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

  // =============================================
  // ACTIONS
  // =============================================

  // Send message
  const handleSendMessage = async () => {
    if (!input.trim() || !selectedConversation || isSending) return
    const content = input.trim()
    setInput('')
    setIsSending(true)
    
    // Otimistic update - adicionar mensagem imediatamente
    const tempId = `temp-${Date.now()}`
    const tempMessage: InboxMessage = {
      id: tempId,
      conversation_id: selectedConversation.id,
      direction: 'outbound',
      message_type: 'text',
      content,
      status: 'pending',
      sent_by_bot: false,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempMessage])
    
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, messageType: 'text' })
      })
      const data = await res.json()
      
      if (data.message) {
        // Substituir mensagem temporária pela real
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remover mensagem temporária em caso de erro
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setIsSending(false)
    }
  }

  // Toggle bot
  const handleToggleBot = async () => {
    if (!selectedConversation) return
    
    // Se bot está ativo, desativar
    if (selectedConversation.is_bot_active) {
      try {
        await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false })
        })
        setSelectedConversation(prev => prev ? { ...prev, is_bot_active: false, ai_enabled: false } : null)
      } catch (error) {
        console.error('Error toggling bot:', error)
      }
    } else {
      // Se bot está inativo, mostrar seletor de agentes
      setShowAgentSelector(true)
      fetchAgents()
    }
  }

  // Fetch AI Agents
  const fetchAgents = async () => {
    if (!organizationId) return
    setLoadingAgents(true)
    try {
      const res = await fetch(`/api/whatsapp/agents?organization_id=${organizationId}&type=ai`)
      const data = await res.json()
      setAiAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  // Activate bot with specific agent
  const handleActivateBot = async (agentId: string) => {
    if (!selectedConversation) return
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true, agentId })
      })
      const data = await res.json()
      if (data.conversation) {
        setSelectedConversation(prev => prev ? { 
          ...prev, 
          is_bot_active: true, 
          ai_enabled: true,
          ai_agent_id: agentId 
        } : null)
      }
      setShowAgentSelector(false)
    } catch (error) {
      console.error('Error activating bot:', error)
    }
  }

  // =============================================
  // MEDIA FUNCTIONS
  // =============================================

  // Handle file selection (image/video/document)
  // Handle file selection - mostra preview antes de enviar
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedConversation) return

    setShowMediaMenu(false)

    // Determinar tipo de mídia
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
    if (file.type.startsWith('image/')) mediaType = 'image'
    else if (file.type.startsWith('video/')) mediaType = 'video'
    else if (file.type.startsWith('audio/')) mediaType = 'audio'

    // Criar URL para preview
    const previewUrl = URL.createObjectURL(file)

    // Mostrar preview
    setMediaPreview({
      file,
      url: previewUrl,
      type: mediaType,
    })
    setMediaCaption('')

    // Limpar input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Cancelar envio de mídia
  const cancelMediaPreview = () => {
    if (mediaPreview?.url) {
      URL.revokeObjectURL(mediaPreview.url)
    }
    setMediaPreview(null)
    setMediaCaption('')
  }

  // Enviar mídia com caption
  const sendMediaWithCaption = async () => {
    if (!mediaPreview || !selectedConversation) return

    setUploadingMedia(true)

    try {
      const formData = new FormData()
      formData.append('file', mediaPreview.file)
      formData.append('mediaType', mediaPreview.type)
      if (mediaCaption.trim()) {
        formData.append('caption', mediaCaption.trim())
      }

      const res = await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/media`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      
      if (data.message) {
        setMessages(prev => [...prev, {
          id: data.message.id,
          conversation_id: selectedConversation.id,
          direction: 'outbound',
          message_type: mediaPreview.type,
          content: mediaCaption.trim() || '',
          media_url: data.message.media_url,
          media_filename: mediaPreview.file.name,
          status: data.success ? 'sent' : 'failed',
          sent_by_bot: false,
          created_at: new Date().toISOString()
        }])
      }

      // Limpar preview
      cancelMediaPreview()
    } catch (error) {
      console.error('Error sending media:', error)
    } finally {
      setUploadingMedia(false)
    }
  }

  // Start audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' })
        await sendAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      setRecordingTime(0)

      // Timer
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }

  // Stop audio recording
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      setIsRecording(false)
      setMediaRecorder(null)
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
        recordingInterval.current = null
      }
    }
  }

  // Cancel recording
  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      setMediaRecorder(null)
      setRecordingTime(0)
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current)
        recordingInterval.current = null
      }
    }
  }

  // Send audio
  const sendAudio = async (audioBlob: Blob) => {
    if (!selectedConversation) return

    setUploadingMedia(true)

    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.ogg')
      formData.append('mediaType', 'audio')

      const res = await fetch(`/api/whatsapp/inbox/conversations/${selectedConversation.id}/media`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      
      if (data.message) {
        setMessages(prev => [...prev, {
          id: data.message.id,
          conversation_id: selectedConversation.id,
          direction: 'outbound',
          message_type: 'audio',
          content: '',
          media_url: data.message.media_url,
          status: data.success ? 'sent' : 'failed',
          sent_by_bot: false,
          created_at: new Date().toISOString()
        }])
      }
    } catch (error) {
      console.error('Error sending audio:', error)
    } finally {
      setUploadingMedia(false)
      setRecordingTime(0)
    }
  }

  // Format recording time
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  // Create Deal
  const handleCreateDeal = async () => {
    if (!contact) return
    try {
      const res = await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `Deal - ${contact.name || contact.phone_number}`,
          value: 0,
        })
      })
      const data = await res.json()
      if (data.deal) {
        setDeals(prev => [data.deal, ...prev])
        setActiveTab('crm')
      }
    } catch (error) {
      console.error('Error creating deal:', error)
    }
  }

  // Select conversation
  const handleSelectConversation = (conv: InboxConversation) => {
    if (selectedConversation?.id === conv.id) return
    
    // Zerar unread_count localmente
    const updatedConv = { ...conv, unread_count: 0 }
    setSelectedConversation(updatedConv)
    
    // Atualizar lista
    setConversations(prev => prev.map(c => 
      c.id === conv.id ? { ...c, unread_count: 0 } : c
    ))
    
    // Limpar dados anteriores
    setMessages([])
    setContact(null)
    setNotes([])
    setDeals([])
    setOrders([])
    setCart(null)
    
    setMobileView('chat')
    
    // Carregar dados
    fetchMessages(conv.id, false)
    
    if (conv.contact_id) {
      fetchContact(conv.contact_id, false)
      fetchOrders(conv.contact_id)
      fetchDeals(conv.contact_id)
    }
    
    // Marcar como lido no banco
    fetch(`/api/whatsapp/inbox/conversations/${conv.id}/read`, { method: 'POST' }).catch(() => {})
  }

  // =============================================
  // EFFECTS
  // =============================================
  
  // Load conversations on mount and filter change
  useEffect(() => { 
    if (organizationId) fetchConversations() 
  }, [statusFilter, organizationId])
  
  // Scroll to bottom on new messages
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) 
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Polling de instâncias para atualizar status de conexão (a cada 10s)
  useEffect(() => {
    if (!organizationId) return
    
    const interval = setInterval(() => {
      fetchInstances()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [organizationId, fetchInstances])

  // Keyboard shortcut for debug panel (Ctrl+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        setShowDebug(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // =============================================
  // DERIVED STATE
  // =============================================

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
    <div className="h-[calc(100vh-80px)] flex bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
      {/* ========== CONVERSATION LIST ========== */}
      <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-gray-200 flex flex-col bg-white/30 ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-200">
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
              <h2 className="text-lg font-semibold text-gray-900">Conversas</h2>
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
              {/* Realtime Status Indicator */}
              <div 
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-help ${
                  realtimeConnected && !realtimeError
                    ? 'bg-green-500/20 text-green-400'
                    : realtimeError
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}
                title={`Realtime: ${realtimeConnected ? 'Conectado' : 'Desconectado'}${realtimeError ? ' (com erros)' : ''}`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  realtimeConnected && !realtimeError
                    ? 'bg-green-400 animate-pulse'
                    : realtimeError
                    ? 'bg-red-400'
                    : 'bg-yellow-400 animate-pulse'
                }`} />
                <span className="hidden sm:inline">
                  {realtimeConnected && !realtimeError ? 'Live' : realtimeError ? 'Erro' : 'Polling'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchConversations} disabled={conversationsLoading} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-white transition-colors disabled:opacity-50">
                <RefreshCw className={`w-5 h-5 ${conversationsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchConversations()}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-400 text-sm focus:outline-none focus:border-brand-400"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'open', 'pending', 'closed'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === status
                    ? 'bg-brand-100 text-brand-600'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-white'
                }`}
              >
                {status === 'all' ? 'Todas' : status === 'open' ? 'Abertas' : status === 'pending' ? 'Pendentes' : 'Fechadas'}
              </button>
            ))}
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversationsLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    selectedConversation?.id === conv.id
                      ? 'bg-brand-50 border border-primary-500/20'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative">
                    {conv.contact_avatar ? (
                      <img src={conv.contact_avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/20 to-yellow-500/20 flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-900">{getInitials(conv.contact_name)}</span>
                      </div>
                    )}
                    {conv.is_bot_active && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center border-2 border-gray-200">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conv.contact_name || formatPhone(conv.phone_number)}
                      </p>
                      <span className="text-xs text-gray-400">{formatTime(conv.last_message_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{conv.last_message_preview || 'Sem mensagens'}</p>
                    {conv.contact_tags && conv.contact_tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {conv.contact_tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-brand-50 text-brand-600 text-[10px] rounded">
                            {tag}
                          </span>
                        ))}
                        {conv.contact_tags.length > 2 && (
                          <span className="text-[10px] text-gray-400">+{conv.contact_tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Unread Badge */}
                  {conv.unread_count > 0 && (
                    <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========== CHAT AREA ========== */}
      <div className={`flex-1 flex flex-col bg-white/20 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/20 to-yellow-500/20 flex items-center justify-center mb-6">
              <MessageSquare className="w-10 h-10 text-brand-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Selecione uma conversa</h3>
            <p className="text-gray-500 text-sm max-w-sm">Escolha uma conversa na lista à esquerda para começar a responder</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-3">
                <button onClick={() => setMobileView('list')} className="md:hidden p-2 hover:bg-gray-100 rounded-lg">
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                {selectedConversation.contact_avatar ? (
                  <img src={selectedConversation.contact_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-yellow-500/20 flex items-center justify-center">
                    <span className="text-sm font-semibold text-gray-900">{getInitials(selectedConversation.contact_name)}</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">{contactName}</p>
                  <p className="text-xs text-gray-500">{formatPhone(selectedConversation.phone_number)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleBot}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedConversation.is_bot_active
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-gray-100 text-gray-500 hover:text-white'
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  {selectedConversation.is_bot_active ? 'Bot Ativo' : 'Bot Inativo'}
                </button>
                <button
                  onClick={() => setShowContactPanel(!showContactPanel)}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-white transition-colors"
                >
                  {showContactPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <>
                  {groupedMessages.map((group, idx) => (
                    <div key={idx}>
                      <DateSeparator date={group.date} />
                      {group.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex mb-3 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] p-3 rounded-2xl ${
                              msg.direction === 'outbound'
                                ? 'bg-primary-500 text-white rounded-br-md'
                                : 'bg-white text-white rounded-bl-md'
                            }`}
                          >
                            {msg.sent_by_bot && msg.direction === 'outbound' && (
                              <div className="flex items-center gap-1 mb-1 opacity-70">
                                <Bot className="w-3 h-3" />
                                <span className="text-[10px]">Bot</span>
                              </div>
                            )}
                            {msg.message_type === 'image' && (
                              <div className="mb-1">
                                {msg.media_url ? (
                                  <img 
                                    src={msg.media_url} 
                                    alt="" 
                                    className="rounded-lg w-full max-w-[400px] max-h-[450px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement
                                      if (!target.src.includes('/api/whatsapp/media')) {
                                        target.src = `/api/whatsapp/media?messageId=${msg.id}`
                                      } else {
                                        target.style.display = 'none'
                                        target.parentElement?.querySelector('.media-fallback')?.classList.remove('hidden')
                                      }
                                    }}
                                    onClick={() => msg.media_url && setLightboxImage(msg.media_url)}
                                  />
                                ) : null}
                                <div className="media-fallback hidden flex items-center gap-2 p-3 bg-gray-100 rounded-lg text-gray-500">
                                  <FileText className="w-5 h-5" />
                                  <span className="text-sm">Imagem não disponível</span>
                                </div>
                              </div>
                            )}
                            {msg.message_type === 'audio' && (
                              <div className="mb-1 min-w-[240px]">
                                {msg.media_url ? (
                                  <audio 
                                    controls 
                                    src={msg.media_url} 
                                    className="w-full max-w-[320px]"
                                    onError={(e) => {
                                      const target = e.target as HTMLAudioElement
                                      if (!target.src.includes('/api/whatsapp/media')) {
                                        target.src = `/api/whatsapp/media?messageId=${msg.id}`
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg text-gray-500">
                                    <span className="text-sm">🎵 Áudio não disponível</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {msg.message_type === 'video' && (
                              <div className="mb-1">
                                {msg.media_url ? (
                                  <video 
                                    controls 
                                    src={msg.media_url} 
                                    className="rounded-lg w-full max-w-[400px] max-h-[450px]"
                                    onError={(e) => {
                                      const target = e.target as HTMLVideoElement
                                      if (!target.src.includes('/api/whatsapp/media')) {
                                        target.src = `/api/whatsapp/media?messageId=${msg.id}`
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg text-gray-500">
                                    <span className="text-sm">🎬 Vídeo não disponível</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {msg.message_type === 'sticker' && msg.media_url && (
                              <div className="mb-1">
                                <img 
                                  src={msg.media_url} 
                                  alt="" 
                                  className="w-40 h-40 object-contain cursor-pointer"
                                  onClick={() => msg.media_url && setLightboxImage(msg.media_url)}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    if (!target.src.includes('/api/whatsapp/media')) {
                                      target.src = `/api/whatsapp/media?messageId=${msg.id}`
                                    }
                                  }}
                                />
                              </div>
                            )}
                            {msg.media_url && msg.message_type === 'document' && (
                              <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg mb-1 hover:bg-gray-200/50 transition-colors">
                                <FileText className="w-5 h-5 text-brand-600" />
                                <span className="text-sm truncate">{msg.media_filename || 'Documento'}</span>
                              </a>
                            )}
                            {/* Mostrar content apenas se não for placeholder de mídia e não for nome de arquivo */}
                            {msg.content && 
                              !['[Imagem]', '[Áudio]', '[Vídeo]', '[Sticker]', '[Documento]'].includes(msg.content) &&
                              !(msg.message_type !== 'text' && msg.content === msg.media_filename) &&
                              !msg.content.match(/\.(png|jpg|jpeg|gif|webp|mp4|mov|avi|mp3|ogg|wav|pdf|doc|docx)$/i) && (
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                            <div className={`flex items-center gap-1 mt-1 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[10px] opacity-70">{formatMessageTime(msg.created_at)}</span>
                              {msg.direction === 'outbound' && <MessageStatus status={msg.status} />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              {selectedConversation.can_send_template_only ? (
                <div className="text-center py-4">
                  <p className="text-sm text-yellow-400 mb-2">Janela de 24h expirada</p>
                  <p className="text-xs text-gray-500">Envie um template para reabrir a conversa</p>
                </div>
              ) : mediaPreview ? (
                /* Media Preview UI - igual WhatsApp */
                <div className="space-y-3">
                  {/* Preview da mídia */}
                  <div className="relative bg-white rounded-xl overflow-hidden">
                    {/* Botão fechar */}
                    <button
                      onClick={cancelMediaPreview}
                      className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    
                    {/* Conteúdo da preview */}
                    <div className="flex items-center justify-center p-4 min-h-[200px] max-h-[300px]">
                      {mediaPreview.type === 'image' && (
                        <img 
                          src={mediaPreview.url} 
                          alt="Preview" 
                          className="max-w-full max-h-[280px] object-contain rounded-lg"
                        />
                      )}
                      {mediaPreview.type === 'video' && (
                        <video 
                          src={mediaPreview.url} 
                          controls 
                          className="max-w-full max-h-[280px] rounded-lg"
                        />
                      )}
                      {mediaPreview.type === 'audio' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                          <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
                            <Mic className="w-8 h-8 text-brand-600" />
                          </div>
                          <audio src={mediaPreview.url} controls className="w-full max-w-[300px]" />
                          <p className="text-sm text-gray-500">{mediaPreview.file.name}</p>
                        </div>
                      )}
                      {mediaPreview.type === 'document' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                          <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <FileText className="w-8 h-8 text-orange-400" />
                          </div>
                          <p className="text-sm text-white font-medium">{mediaPreview.file.name}</p>
                          <p className="text-xs text-gray-500">
                            {(mediaPreview.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Input de legenda + botão enviar */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMediaWithCaption()
                          }
                        }}
                        placeholder="Adicionar legenda..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-400 text-sm focus:outline-none focus:border-brand-400"
                      />
                    </div>
                    <button
                      onClick={sendMediaWithCaption}
                      disabled={uploadingMedia}
                      className="p-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
                    >
                      {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              ) : isRecording ? (
                /* Recording UI */
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                  <button
                    onClick={cancelRecording}
                    className="p-2 hover:bg-gray-100 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                    title="Cancelar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex-1 flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm text-white font-medium">{formatRecordingTime(recordingTime)}</span>
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="p-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
                    title="Enviar"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                /* Normal Input */
                <div className="flex items-end gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {/* Media menu button */}
                  <div className="relative">
                    <button 
                      onClick={() => setShowMediaMenu(!showMediaMenu)}
                      className={`p-2 rounded-lg transition-colors ${
                        showMediaMenu 
                          ? 'bg-brand-100 text-brand-600' 
                          : 'hover:bg-gray-100 text-gray-500 hover:text-white'
                      }`}
                      disabled={uploadingMedia}
                    >
                      {uploadingMedia ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Paperclip className="w-5 h-5" />
                      )}
                    </button>
                    
                    {/* Media menu dropdown */}
                    <AnimatePresence>
                      {showMediaMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[180px]"
                        >
                          <button
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = 'image/*'
                                fileInputRef.current.click()
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <Image className="w-4 h-4 text-purple-400" />
                            </div>
                            <span className="text-sm text-white">Imagem</span>
                          </button>
                          <button
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = 'video/*'
                                fileInputRef.current.click()
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                              <Video className="w-4 h-4 text-blue-400" />
                            </div>
                            <span className="text-sm text-white">Vídeo</span>
                          </button>
                          <button
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt'
                                fileInputRef.current.click()
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-orange-400" />
                            </div>
                            <span className="text-sm text-white">Documento</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowMediaMenu(false)
                              // Usar camera API se disponível
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = 'image/*'
                                fileInputRef.current.capture = 'environment'
                                fileInputRef.current.click()
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                              <Camera className="w-4 h-4 text-green-400" />
                            </div>
                            <span className="text-sm text-white">Câmera</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Text input */}
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Digite sua mensagem..."
                      rows={1}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-400 text-sm focus:outline-none focus:border-brand-400 resize-none max-h-[120px]"
                    />
                  </div>
                  
                  {/* Emoji button (placeholder) */}
                  <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Smile className="w-5 h-5" />
                  </button>
                  
                  {/* Send or Record button */}
                  {input.trim() ? (
                    <button
                      onClick={handleSendMessage}
                      disabled={isSending}
                      className="p-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={uploadingMedia}
                      className="p-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
                      title="Gravar áudio"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ========== CONTACT PANEL ========== */}
      <AnimatePresence>
        {showContactPanel && selectedConversation && contact && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:flex flex-col border-l border-gray-200 bg-white/30 overflow-hidden"
          >
            {contactLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Contact Header */}
                <div className="p-6 text-center border-b border-gray-200">
                  {contact.profile_picture_url ? (
                    <img src={contact.profile_picture_url} alt="" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-gradient-to-br from-primary-500/20 to-yellow-500/20 flex items-center justify-center">
                      <span className="text-2xl font-semibold text-gray-900">{getInitials(contact.name)}</span>
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{contact.name || 'Sem nome'}</h3>
                  <p className="text-sm text-gray-500">{formatPhone(contact.phone_number)}</p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 py-3 text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'text-brand-600 border-b-2 border-primary-400'
                          : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto">
                  {activeTab === 'info' && (
                    <div className="p-4 space-y-4">
                      {contact.email && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                          <Mail className="w-5 h-5 text-gray-500" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-400">Email</p>
                            <p className="text-sm text-white">{contact.email}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <Phone className="w-5 h-5 text-gray-500" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-400">Telefone</p>
                          <p className="text-sm text-white">{contact.phone_number}</p>
                        </div>
                      </div>
                      {contact.address?.city && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                          <MapPin className="w-5 h-5 text-gray-500" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-400">Cidade</p>
                            <p className="text-sm text-white">{contact.address.city}{contact.address.state ? `, ${contact.address.state}` : ''}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-400">Contato desde</p>
                          <p className="text-sm text-white">{formatDate(contact.created_at)}</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-600">Tags</h4>
                          <button onClick={() => setShowAddTag(true)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                            <Plus className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {contact.tags?.map((tag, i) => (
                            <span key={i} className="px-2.5 py-1 bg-brand-50 text-brand-600 text-xs rounded-lg flex items-center gap-1 group">
                              {tag}
                              <button onClick={() => handleRemoveTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity">
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
                                className="w-24 px-2 py-1 text-xs bg-gray-100 border border-gray-300 rounded text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
                                autoFocus
                              />
                              <button onClick={handleAddTag} className="text-brand-600 hover:text-brand-500">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => setShowAddTag(false)} className="text-gray-500 hover:text-white">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {(!contact.tags || contact.tags.length === 0) && !showAddTag && (
                            <span className="text-xs text-gray-400">Nenhuma tag</span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-gray-900">{contact.total_messages_received}</p>
                          <p className="text-xs text-gray-500">Msg Recebidas</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-gray-900">{contact.total_messages_sent}</p>
                          <p className="text-xs text-gray-500">Msg Enviadas</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'crm' && (
                    <div className="p-4 space-y-4">
                      {activeDeal ? (
                        <div className="p-4 bg-gradient-to-br from-primary-500/10 to-yellow-500/10 border border-primary-500/20 rounded-xl">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-white">Deal Ativo</h4>
                            <span className="px-2 py-0.5 bg-primary-500 text-white text-xs rounded">{activeDeal.stage?.name || 'Em andamento'}</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900 mb-1">{formatCurrency(activeDeal.value)}</p>
                          <p className="text-sm text-gray-500">{activeDeal.pipeline?.name || 'Pipeline'}</p>
                        </div>
                      ) : (
                        <button onClick={handleCreateDeal} className="w-full py-4 border border-dashed border-gray-300 rounded-xl text-gray-500 hover:text-white hover:border-primary-500 transition-all flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" />Criar Novo Deal
                        </button>
                      )}
                      {deals.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-600 mb-3">Histórico</h4>
                          <div className="space-y-2">
                            {deals.filter(d => d.id !== activeDeal?.id).slice(0, 5).map((deal) => (
                              <div key={deal.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className={`w-2 h-2 rounded-full ${deal.status === 'won' ? 'bg-green-500' : deal.status === 'lost' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">{deal.title}</p>
                                  <p className="text-xs text-gray-500">{formatCurrency(deal.value)}</p>
                                </div>
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
                        <div className="p-3 bg-gray-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-gray-900">{contact.total_orders}</p>
                          <p className="text-xs text-gray-500">Pedidos</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl text-center">
                          <p className="text-2xl font-bold text-brand-600">{formatCurrency(contact.total_spent)}</p>
                          <p className="text-xs text-gray-500">Total Gasto</p>
                        </div>
                      </div>
                      {cart && (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <ShoppingCart className="w-5 h-5 text-yellow-400" />
                            <h4 className="font-medium text-yellow-400">Carrinho Abandonado</h4>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{cart.line_items?.length || 0} itens • {formatCurrency(cart.total_price)}</p>
                          <p className="text-xs text-gray-400 mb-3">Abandonado {formatRelativeTime(cart.created_at)}</p>
                          <button className="w-full py-2 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 transition-colors">Enviar Recuperação</button>
                        </div>
                      )}
                      {orders.length > 0 && (
                        <div className="p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-white">Último Pedido</h4>
                            <span className={`px-2 py-0.5 text-xs rounded ${orders[0].fulfillment_status === 'fulfilled' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                              {orders[0].fulfillment_status === 'fulfilled' ? 'Entregue' : 'Pendente'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">#{orders[0].order_number} • {orders[0].line_items?.length || 0} itens</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(orders[0].total_price)}</p>
                        </div>
                      )}
                      {orders.length === 0 && !cart && (
                        <div className="text-center py-8 text-gray-500">
                          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">Nenhum pedido encontrado</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'notes' && (
                    <div className="p-4 space-y-4">
                      <div className="relative">
                        <textarea
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="Adicionar uma nota..."
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-brand-400 resize-none min-h-[80px]"
                        />
                        <button
                          onClick={handleAddNote}
                          disabled={!newNote.trim() || isSavingNote}
                          className="absolute bottom-3 right-3 p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                        >
                          {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="space-y-4">
                        {notes.length > 0 ? notes.map((note) => (
                          <div key={note.id} className="relative pl-6 border-l-2 border-gray-200">
                            <div className="absolute left-[-5px] top-0 w-2 h-2 bg-primary-500 rounded-full" />
                            <div className="pb-4">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900">{note.created_by_name || 'Usuário'}</span>
                                <span className="text-xs text-gray-400">{formatRelativeTime(note.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-600">{note.content}</p>
                            </div>
                          </div>
                        )) : (
                          <div className="text-center py-8 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Nenhuma nota ainda</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact Actions */}
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowAddTag(true)} className="flex items-center justify-center gap-2 p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-100 hover:text-white transition-all">
                      <Tag className="w-4 h-4" /><span className="text-sm">Tag</span>
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-100 hover:text-white transition-all">
                      <UserPlus className="w-4 h-4" /><span className="text-sm">Atribuir</span>
                    </button>
                    <button onClick={handleCreateDeal} className="flex items-center justify-center gap-2 p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-100 hover:text-white transition-all">
                      <DollarSign className="w-4 h-4" /><span className="text-sm">Deal</span>
                    </button>
                    <button onClick={handleBlockContact} className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-all ${contact.is_blocked ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                      <Ban className="w-4 h-4" /><span className="text-sm">{contact.is_blocked ? 'Desbloquear' : 'Bloquear'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Panel - Toggle com Ctrl+D ou clique no indicador */}
      <div className="fixed bottom-4 right-4 z-50">
        {/* Toggle Button */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`p-3 rounded-full shadow-lg transition-all ${
            realtimeConnected && !realtimeError
              ? 'bg-green-500 hover:bg-green-600'
              : realtimeError
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-yellow-500 hover:bg-yellow-600'
          }`}
          title="Toggle Debug Panel (Ctrl+D)"
        >
          <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
        </button>

        {/* Debug Panel */}
        {showDebug && (
          <div className="absolute bottom-14 right-0 w-96 max-h-80 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">🔧 Debug Realtime</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  realtimeConnected && !realtimeError
                    ? 'bg-green-500/20 text-green-400'
                    : realtimeError
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {realtimeConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <button
                onClick={() => setDebugEvents([])}
                className="text-xs text-gray-500 hover:text-white"
              >
                Limpar
              </button>
            </div>
            
            {/* Status dos canais */}
            <div className="p-2 border-b border-gray-200 bg-gray-50 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-1.5 rounded text-center ${
                  realtimeStatus.conversations === 'connected' ? 'bg-green-500/20 text-green-400' :
                  realtimeStatus.conversations === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  Conv: {realtimeStatus.conversations}
                </div>
                <div className={`p-1.5 rounded text-center ${
                  realtimeStatus.messages === 'connected' ? 'bg-green-500/20 text-green-400' :
                  realtimeStatus.messages === 'error' ? 'bg-red-500/20 text-red-400' :
                  realtimeStatus.messages === 'disconnected' ? 'bg-gray-200 text-gray-500' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  Msg: {realtimeStatus.messages}
                </div>
                <div className={`p-1.5 rounded text-center ${
                  realtimeStatus.instances === 'connected' ? 'bg-green-500/20 text-green-400' :
                  realtimeStatus.instances === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  Inst: {realtimeStatus.instances}
                </div>
              </div>
              <div className="mt-2 text-gray-500">
                Org: {organizationId?.substring(0, 8)}... | Conv: {selectedConversation?.id?.substring(0, 8) || 'nenhuma'}
              </div>
            </div>
            
            {/* Event Log */}
            <div className="max-h-40 overflow-y-auto p-2 space-y-1">
              {debugEvents.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">
                  Aguardando eventos...
                </div>
              ) : (
                debugEvents.map((event, i) => (
                  <div key={i} className="text-xs text-gray-600 font-mono">
                    {event}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Connect Modal */}
      <WhatsAppConnectUnified
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={handleConnectionSuccess}
        organizationId={organizationId}
      />

      {/* Image Lightbox Modal */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setLightboxImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              
              {/* Image */}
              <img 
                src={lightboxImage} 
                alt="" 
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              
              {/* Actions */}
              <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-4">
                <a
                  href={lightboxImage}
                  download
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FileText className="w-4 h-4" />
                  Baixar
                </a>
                <button
                  onClick={() => window.open(lightboxImage, '_blank')}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                >
                  <PanelRightOpen className="w-4 h-4" />
                  Abrir em nova aba
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Selector Modal */}
      <AnimatePresence>
        {showAgentSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAgentSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Selecionar Agente de IA</h3>
                <button
                  onClick={() => setShowAgentSelector(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingAgents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
              ) : aiAgents.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm mb-4">Nenhum agente de IA configurado</p>
                  <a 
                    href="/settings/agents" 
                    className="text-brand-600 hover:text-brand-500 text-sm"
                  >
                    Criar agente de IA →
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {aiAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleActivateBot(agent.id)}
                      className="w-full flex items-center gap-3 p-3 bg-white hover:bg-gray-100 rounded-lg transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                        <p className="text-xs text-gray-500">
                          {agent.type === 'ai' ? 'Agente de IA' : 'Agente Humano'}
                        </p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        agent.status === 'online' || agent.is_active ? 'bg-green-400' : 'bg-gray-300'
                      }`} />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
