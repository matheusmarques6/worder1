'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Send,
  Paperclip,
  MoreVertical,
  User,
  CheckCheck,
  Check,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  CheckCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { useAgentPermissions } from '@/hooks/useAgentPermissions'

interface Conversation {
  id: string
  contact_name: string
  contact_phone: string
  last_message: string
  last_message_at: string
  unread_count: number
  status: 'open' | 'pending' | 'closed'
  assigned_agent_id?: string
  whatsapp_number_id: string
}

interface Message {
  id: string
  content: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document'
  direction: 'inbound' | 'outbound'
  status: 'sent' | 'delivered' | 'read' | 'failed'
  created_at: string
  media_url?: string
}

export default function AgentInboxPage() {
  const { user } = useAuthStore()
  const { isAgent, permissions, canAccessNumber, canSendMessages, isLoading: permissionsLoading } = useAgentPermissions()
  
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  const agentId = user?.user_metadata?.agent_id
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine' | 'queue'>('all')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const fetchConversations = useCallback(async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      let url = `/api/whatsapp/conversations?organization_id=${organizationId}`
      if (isAgent && agentId) {
        url += `&agent_id=${agentId}`
      }
      
      const res = await fetch(url)
      const data = await res.json()
      let convs = data.conversations || []
      
      if (isAgent && permissions && !permissions.whatsappAccessAll) {
        convs = convs.filter((c: Conversation) => canAccessNumber(c.whatsapp_number_id))
      }
      
      setConversations(convs)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId, isAgent, agentId, permissions, canAccessNumber])
  
  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!organizationId) return
    
    setLoadingMessages(true)
    try {
      const res = await fetch(
        `/api/whatsapp/messages?organization_id=${organizationId}&conversation_id=${conversationId}`
      )
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }, [organizationId])
  
  useEffect(() => {
    if (organizationId && !permissionsLoading) {
      fetchConversations()
    }
  }, [organizationId, permissionsLoading, fetchConversations])
  
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation, fetchMessages])
  
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !canSendMessages || sending) return
    
    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          conversation_id: selectedConversation.id,
          content: newMessage,
          type: 'text',
        }),
      })
      
      if (res.ok) {
        setNewMessage('')
        fetchMessages(selectedConversation.id)
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }
  
  const handleAssumeConversation = async (conversation: Conversation) => {
    if (!agentId || !organizationId) return
    
    try {
      await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          organization_id: organizationId,
          conversation_id: conversation.id,
          agent_id: agentId,
        }),
      })
      fetchConversations()
    } catch (error) {
      console.error('Error assuming conversation:', error)
    }
  }
  
  const handleResolveConversation = async () => {
    if (!selectedConversation || !organizationId) return
    
    try {
      await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          organization_id: organizationId,
          conversation_id: selectedConversation.id,
        }),
      })
      setSelectedConversation(null)
      fetchConversations()
    } catch (error) {
      console.error('Error resolving conversation:', error)
    }
  }
  
  const filteredConversations = conversations.filter(conv => {
    if (search) {
      const searchLower = search.toLowerCase()
      if (!conv.contact_name?.toLowerCase().includes(searchLower) &&
          !conv.contact_phone?.includes(search)) {
        return false
      }
    }
    if (filter === 'mine') return conv.assigned_agent_id === agentId
    if (filter === 'queue') return !conv.assigned_agent_id && conv.status === 'open'
    return true
  })
  
  const stats = {
    queue: conversations.filter(c => !c.assigned_agent_id && c.status === 'open').length,
    mine: conversations.filter(c => c.assigned_agent_id === agentId).length,
    total: conversations.length,
  }
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Agora'
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  
  const MessageStatus = ({ status }: { status: Message['status'] }) => {
    switch (status) {
      case 'sent': return <Check className="w-3.5 h-3.5 text-dark-500" />
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-dark-500" />
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
      default: return null
    }
  }

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-dark-900 rounded-xl border border-dark-800 overflow-hidden flex" style={{ height: 'calc(100vh - 180px)', minHeight: '500px' }}>
      {/* Sidebar - Lista de Conversas */}
      <div className="w-80 border-r border-dark-800 flex flex-col bg-dark-900 flex-shrink-0">
        <div className="p-4 border-b border-dark-800">
          <h1 className="text-lg font-semibold text-white mb-3">Conversas</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full pl-9 pr-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
        </div>
        
        <div className="flex border-b border-dark-800">
          {[
            { id: 'all', label: 'Todas', count: stats.total },
            { id: 'queue', label: 'Fila', count: stats.queue },
            { id: 'mine', label: 'Minhas', count: stats.mine },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                filter === tab.id
                  ? 'text-primary-400 border-b-2 border-primary-500'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  filter === tab.id ? 'bg-primary-500/20' : 'bg-dark-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-12" />
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`w-full p-3 flex items-start gap-3 border-b border-dark-800/50 hover:bg-dark-800/50 transition-colors text-left ${
                  selectedConversation?.id === conv.id ? 'bg-dark-800' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-white truncate">
                      {conv.contact_name || conv.contact_phone}
                    </span>
                    <span className="text-xs text-dark-500 flex-shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <p className="text-sm text-dark-400 truncate">{conv.last_message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-primary-500 text-white rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                    {!conv.assigned_agent_id && conv.status === 'open' && (
                      <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                        Na fila
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        
        <div className="p-3 border-t border-dark-800">
          <button
            onClick={fetchConversations}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>
      
      {/* Área Principal do Chat */}
      <div className="flex-1 flex flex-col bg-dark-950">
        {selectedConversation ? (
          <>
            <div className="h-16 px-4 flex items-center justify-between border-b border-dark-800 bg-dark-900 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
                  <User className="w-5 h-5 text-dark-400" />
                </div>
                <div>
                  <h2 className="font-medium text-white">
                    {selectedConversation.contact_name || selectedConversation.contact_phone}
                  </h2>
                  <p className="text-xs text-dark-400">{selectedConversation.contact_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!selectedConversation.assigned_agent_id && (
                  <button
                    onClick={() => handleAssumeConversation(selectedConversation)}
                    className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-sm rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Assumir
                  </button>
                )}
                {selectedConversation.assigned_agent_id === agentId && (
                  <button
                    onClick={handleResolveConversation}
                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Resolver
                  </button>
                )}
                <button className="p-2 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-dark-500">
                  Nenhuma mensagem ainda
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      msg.direction === 'outbound' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-white'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${
                        msg.direction === 'outbound' ? 'text-white/70' : 'text-dark-500'
                      }`}>
                        <span className="text-xs">
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.direction === 'outbound' && <MessageStatus status={msg.status} />}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {canSendMessages && selectedConversation.assigned_agent_id === agentId ? (
              <div className="p-4 border-t border-dark-800 bg-dark-900 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <button className="p-2.5 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Digite uma mensagem..."
                      rows={1}
                      className="w-full px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="p-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-700 disabled:text-dark-500 text-white rounded-xl transition-colors"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 border-t border-dark-800 bg-dark-900 flex-shrink-0">
                <div className="text-center text-sm text-dark-500">
                  {!canSendMessages ? 'Você não tem permissão para enviar mensagens' : 'Assuma esta conversa para enviar mensagens'}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-xl font-semibold text-white mb-2">Selecione uma conversa</h2>
            <p className="text-dark-400 max-w-sm">
              Escolha uma conversa da lista ao lado para começar a atender seus clientes.
            </p>
            <div className="flex gap-6 mt-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{stats.queue}</div>
                <div className="text-sm text-dark-400">Na fila</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-400">{stats.mine}</div>
                <div className="text-sm text-dark-400">Minhas</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
