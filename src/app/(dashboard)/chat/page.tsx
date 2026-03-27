'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Instagram,
  Search,
  Filter,
  MoreVertical,
  Send,
  Paperclip,
  Image as ImageIcon,
  Smile,
  Phone,
  Video,
  Info,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  User,
  X,
  ChevronDown,
  RefreshCw,
  Settings,
  Plus,
  Archive,
  Star,
  Tag,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Types
interface Conversation {
  id: string
  type: 'whatsapp' | 'instagram'
  contact_name: string
  contact_phone?: string
  username?: string
  profile_picture_url?: string
  last_message_at: string
  last_message_preview: string
  last_message_direction: 'inbound' | 'outbound'
  unread_count: number
  status: 'open' | 'closed' | 'archived'
  assigned_to?: string
  is_window_open?: boolean
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  message_type: string
  text_body: string
  content?: any
  media_url?: string
  status: string
  timestamp: string
}

// Channel config
const channels = [
  { id: 'all', label: 'Todos', icon: MessageSquare, color: 'text-primary-400' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-400' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-400' },
]

export default function ChatPage() {
  const [activeChannel, setActiveChannel] = useState('all')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true)

      // Fetch from both channels based on filter
      const promises = []

      if (activeChannel === 'all' || activeChannel === 'whatsapp') {
        promises.push(
          fetch(`/api/whatsapp/conversations?status=${statusFilter}`)
            .then(res => res.ok ? res.json() : { conversations: [] })
            .then(data => (data.conversations || []).map((c: any) => ({ ...c, type: 'whatsapp' })))
        )
      }

      if (activeChannel === 'all' || activeChannel === 'instagram') {
        promises.push(
          fetch(`/api/instagram/conversations?status=${statusFilter}`)
            .then(res => res.ok ? res.json() : { conversations: [] })
            .then(data => (data.conversations || []).map((c: any) => ({ ...c, type: 'instagram' })))
        )
      }

      const results = await Promise.all(promises)
      const allConversations = results.flat()

      // Sort by last message time
      allConversations.sort((a, b) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
      )

      // Filter by search
      const filtered = searchQuery
        ? allConversations.filter(c =>
            c.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.contact_phone?.includes(searchQuery)
          )
        : allConversations

      setConversations(filtered)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [activeChannel, statusFilter, searchQuery])

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async () => {
    if (!selectedConversation) return

    try {
      const endpoint = selectedConversation.type === 'whatsapp'
        ? `/api/whatsapp/messages?conversation_id=${selectedConversation.id}`
        : `/api/instagram/messages?conversation_id=${selectedConversation.id}`

      const res = await fetch(endpoint)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    }
  }, [selectedConversation])

  // Initial fetch
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Fetch messages when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages()
    }
  }, [selectedConversation, fetchMessages])

  // Scroll to bottom when new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || isSending) return

    const text = newMessage.trim()
    setNewMessage('')
    setIsSending(true)

    try {
      const endpoint = selectedConversation.type === 'whatsapp'
        ? '/api/whatsapp/messages'
        : '/api/instagram/messages'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          message_type: 'text',
          text,
        }),
      })

      if (res.ok) {
        // Refresh messages
        await fetchMessages()
      } else {
        const error = await res.json()
        console.error('Error sending message:', error)
        // Show error toast
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSending(false)
    }
  }

  // Mark as read
  const handleMarkAsRead = async (conversation: Conversation) => {
    if (conversation.unread_count === 0) return

    try {
      const endpoint = conversation.type === 'whatsapp'
        ? '/api/whatsapp/conversations'
        : '/api/instagram/conversations'

      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          unread_count: 0,
        }),
      })

      // Update local state
      setConversations(prev =>
        prev.map(c => c.id === conversation.id ? { ...c, unread_count: 0 } : c)
      )
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  // Get channel icon
  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return <MessageSquare className="w-4 h-4 text-green-400" />
      case 'instagram':
        return <Instagram className="w-4 h-4 text-pink-400" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  // Get message status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Check className="w-3 h-3 text-gray-500" />
      case 'delivered':
        return <CheckCheck className="w-3 h-3 text-gray-500" />
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-400" />
      case 'pending':
        return <Clock className="w-3 h-3 text-gray-500" />
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-red-500" />
      default:
        return null
    }
  }

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Sidebar - Conversations List */}
      <div className="w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-white/50">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white">Chat</h1>
            <button className="p-2 hover:bg-white rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Channel Tabs */}
          <div className="flex gap-1 p-1 bg-white rounded-lg mb-3">
            {channels.map((channel) => {
              const Icon = channel.icon
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all',
                    activeChannel === channel.id
                      ? 'bg-gray-100 text-white'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  <Icon className={cn('w-4 h-4', activeChannel === channel.id && channel.color)} />
                  <span className="hidden sm:inline">{channel.label}</span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 mt-3">
            {(['open', 'closed', 'all'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                  statusFilter === status
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'bg-white text-gray-500 hover:text-gray-700'
                )}
              >
                {status === 'open' ? 'Abertos' : status === 'closed' ? 'Fechados' : 'Todos'}
              </button>
            ))}
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma conversa</p>
              <p className="text-gray-500 text-sm mt-1">
                As conversas aparecerao aqui quando voce receber mensagens
              </p>
            </div>
          ) : (
            <div className="divide-y divide-dark-700/50">
              {conversations.map((conversation) => (
                <button
                  key={`${conversation.type}-${conversation.id}`}
                  onClick={() => {
                    setSelectedConversation(conversation)
                    handleMarkAsRead(conversation)
                  }}
                  className={cn(
                    'w-full p-4 flex items-start gap-3 hover:bg-white transition-colors text-left',
                    selectedConversation?.id === conversation.id && 'bg-white'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {conversation.profile_picture_url ? (
                      <img
                        src={conversation.profile_picture_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    {/* Channel Badge */}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                      {getChannelIcon(conversation.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        'font-medium truncate',
                        conversation.unread_count > 0 ? 'text-white' : 'text-gray-700'
                      )}>
                        {conversation.contact_name || conversation.username || 'Usuario'}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                        {conversation.last_message_at &&
                          formatDistanceToNow(new Date(conversation.last_message_at), {
                            addSuffix: false,
                            locale: ptBR,
                          })
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {conversation.last_message_direction === 'outbound' && (
                        <CheckCheck className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <p className={cn(
                        'text-sm truncate',
                        conversation.unread_count > 0 ? 'text-gray-700' : 'text-gray-500'
                      )}>
                        {conversation.last_message_preview || 'Sem mensagens'}
                      </p>
                      {conversation.unread_count > 0 && (
                        <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-primary-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 bg-white/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {selectedConversation.profile_picture_url ? (
                    <img
                      src={selectedConversation.profile_picture_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                    {getChannelIcon(selectedConversation.type)}
                  </div>
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    {selectedConversation.contact_name || selectedConversation.username}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedConversation.type === 'whatsapp'
                      ? selectedConversation.contact_phone
                      : `@${selectedConversation.username}`
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!selectedConversation.is_window_open && selectedConversation.type === 'instagram' && (
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    Janela expirada
                  </span>
                )}
                <button className="p-2 hover:bg-white rounded-lg transition-colors">
                  <Phone className="w-5 h-5 text-gray-500" />
                </button>
                <button className="p-2 hover:bg-white rounded-lg transition-colors">
                  <Video className="w-5 h-5 text-gray-500" />
                </button>
                <button className="p-2 hover:bg-white rounded-lg transition-colors">
                  <Info className="w-5 h-5 text-gray-500" />
                </button>
                <button className="p-2 hover:bg-white rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => {
                const isOutbound = message.direction === 'outbound'
                const showDate = index === 0 ||
                  new Date(message.timestamp).toDateString() !==
                  new Date(messages[index - 1].timestamp).toDateString()

                return (
                  <div key={message.id}>
                    {/* Date Separator */}
                    {showDate && (
                      <div className="flex items-center justify-center my-4">
                        <span className="px-3 py-1 bg-white text-gray-500 text-xs rounded-full">
                          {format(new Date(message.timestamp), "d 'de' MMMM", { locale: ptBR })}
                        </span>
                      </div>
                    )}

                    {/* Message Bubble */}
                    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2',
                          isOutbound
                            ? 'bg-primary-500 text-white rounded-br-sm'
                            : 'bg-white text-white rounded-bl-sm'
                        )}
                      >
                        {/* Media */}
                        {message.media_url && ['image', 'video'].includes(message.message_type) && (
                          <div className="mb-2 -mx-2 -mt-1">
                            {message.message_type === 'image' ? (
                              <img
                                src={message.media_url}
                                alt=""
                                className="max-w-full rounded-xl"
                              />
                            ) : (
                              <video
                                src={message.media_url}
                                controls
                                className="max-w-full rounded-xl"
                              />
                            )}
                          </div>
                        )}

                        {/* Text */}
                        {message.text_body && (
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.text_body}
                          </p>
                        )}

                        {/* Story mention/reply */}
                        {message.content?.story_mention && (
                          <p className="text-sm italic opacity-80">Mencionou seu story</p>
                        )}
                        {message.content?.story_reply && (
                          <p className="text-sm italic opacity-80">Respondeu ao seu story</p>
                        )}

                        {/* Time and Status */}
                        <div className={cn(
                          'flex items-center gap-1 mt-1',
                          isOutbound ? 'justify-end' : 'justify-start'
                        )}>
                          <span className={cn(
                            'text-[10px]',
                            isOutbound ? 'text-white/70' : 'text-gray-500'
                          )}>
                            {format(new Date(message.timestamp), 'HH:mm')}
                          </span>
                          {isOutbound && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200 bg-white/50">
              {selectedConversation.type === 'instagram' && !selectedConversation.is_window_open ? (
                <div className="flex items-center justify-center gap-2 py-3 px-4 bg-amber-500/10 rounded-xl text-amber-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>A janela de mensagens expirou. O cliente precisa enviar uma mensagem primeiro.</span>
                </div>
              ) : (
                <div className="flex items-end gap-3">
                  <button className="p-2 hover:bg-white rounded-lg transition-colors">
                    <Paperclip className="w-5 h-5 text-gray-500" />
                  </button>
                  <button className="p-2 hover:bg-white rounded-lg transition-colors">
                    <ImageIcon className="w-5 h-5 text-gray-500" />
                  </button>

                  <div className="flex-1 relative">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Digite sua mensagem..."
                      rows={1}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500/50 resize-none max-h-32"
                    />
                  </div>

                  <button className="p-2 hover:bg-white rounded-lg transition-colors">
                    <Smile className="w-5 h-5 text-gray-500" />
                  </button>

                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || isSending}
                    className={cn(
                      'p-3 rounded-xl transition-colors',
                      newMessage.trim()
                        ? 'bg-primary-500 text-white hover:bg-primary-600'
                        : 'bg-white text-gray-500'
                    )}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Selecione uma conversa</h2>
            <p className="text-gray-500 max-w-md">
              Escolha uma conversa da lista para comecar a responder mensagens do WhatsApp e Instagram Direct
            </p>
            <div className="flex gap-3 mt-6">
              <a
                href="/integrations/whatsapp"
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 rounded-lg text-sm text-gray-600 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-green-400" />
                Conectar WhatsApp
              </a>
              <a
                href="/integrations/instagram-direct"
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 rounded-lg text-sm text-gray-600 transition-colors"
              >
                <Instagram className="w-4 h-4 text-pink-400" />
                Conectar Instagram
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
