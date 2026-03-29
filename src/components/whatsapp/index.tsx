'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, formatRelativeTime, formatPhoneNumber, getInitials, formatCurrency } from '@/lib/utils'
import { Card, Avatar, Badge, Input, Button, Spinner } from '@/components/ui'
import { useWhatsAppStore } from '@/stores'
import type { WhatsAppConversation, WhatsAppMessage, Contact } from '@/types'
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  MoreVertical,
  Check,
  CheckCheck,
  Image,
  File,
  Mic,
  X,
  MessageSquare,
  User,
  Mail,
  Building,
  ShoppingCart,
  DollarSign,
  Tag,
  Clock,
  ExternalLink,
} from 'lucide-react'

// ===============================
// CONVERSATION LIST
// ===============================
interface ConversationListProps {
  conversations: WhatsAppConversation[]
  selectedId: string | null
  onSelect: (conversation: WhatsAppConversation) => void
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredConversations = React.useMemo(() => {
    if (!searchQuery) return conversations
    return conversations.filter(
      (c) =>
        c.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone_number.includes(searchQuery)
    )
  }, [conversations, searchQuery])

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Conversas</h2>
          <Badge variant="primary">{conversations.length}</Badge>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 pl-10 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 transition-all"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-100 text-brand-600">
          Todas
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-white transition-colors">
          Não lidas
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-white transition-colors">
          Abertas
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {filteredConversations.map((conversation) => (
            <motion.div
              key={conversation.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button
                onClick={() => onSelect(conversation)}
                className={cn(
                  'w-full p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-200/30',
                  selectedId === conversation.id && 'bg-white/70'
                )}
              >
                <div className="relative">
                  <Avatar
                    fallback={getInitials(conversation.contact_name || 'UN')}
                    size="md"
                  />
                  {conversation.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 rounded-full text-xs text-white flex items-center justify-center font-medium">
                      {conversation.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-800 truncate">
                      {conversation.contact_name || formatPhoneNumber(conversation.phone_number)}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {conversation.last_message_at
                        ? formatRelativeTime(conversation.last_message_at)
                        : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {conversation.last_message || 'Nova conversa'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge
                      variant={
                        conversation.status === 'open'
                          ? 'success'
                          : conversation.status === 'pending'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {conversation.status === 'open'
                        ? 'Aberta'
                        : conversation.status === 'pending'
                        ? 'Pendente'
                        : 'Fechada'}
                    </Badge>
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredConversations.length === 0 && (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma conversa encontrada</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ===============================
// CHAT WINDOW
// ===============================
interface ChatWindowProps {
  conversation: WhatsAppConversation | null
  messages: WhatsAppMessage[]
  onSendMessage: (content: string) => void
  isLoading?: boolean
}

export function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  isLoading,
}: ChatWindowProps) {
  const [newMessage, setNewMessage] = React.useState('')
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!newMessage.trim()) return
    onSendMessage(newMessage)
    setNewMessage('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white/30">
        <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mb-4">
          <MessageSquare className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-600 mb-2">
          Selecione uma conversa
        </h3>
        <p className="text-gray-400 text-sm">
          Escolha uma conversa à esquerda para começar
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/50">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <Avatar
            fallback={getInitials(conversation.contact_name || 'UN')}
            size="md"
            status="online"
          />
          <div>
            <h3 className="font-medium text-gray-800">
              {conversation.contact_name || formatPhoneNumber(conversation.phone_number)}
            </h3>
            <p className="text-sm text-gray-400">
              {formatPhoneNumber(conversation.phone_number)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors">
            <Video className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex',
                  message.is_outgoing ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[70%] rounded-2xl px-4 py-2.5',
                    message.is_outgoing
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div
                    className={cn(
                      'flex items-center justify-end gap-1 mt-1',
                      message.is_outgoing ? 'text-primary-200' : 'text-gray-400'
                    )}
                  >
                    <span className="text-xs">
                      {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {message.is_outgoing && (
                      <span>
                        {message.status === 'read' ? (
                          <CheckCheck className="w-4 h-4 text-accent-400" />
                        ) : message.status === 'delivered' ? (
                          <CheckCheck className="w-4 h-4" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors">
              <Smile className="w-5 h-5" />
            </button>
            <button className="p-2 rounded-xl hover:bg-white text-gray-500 transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite uma mensagem..."
              rows={1}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 resize-none"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className={cn(
              'p-3 rounded-xl transition-all',
              newMessage.trim()
                ? 'bg-primary-500 text-white hover:bg-primary-400'
                : 'bg-white text-gray-400'
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ===============================
// CONTACT INFO PANEL
// ===============================
interface ContactInfoPanelProps {
  contact: Contact | null
  conversation: WhatsAppConversation | null
  onClose?: () => void
}

export function ContactInfoPanel({
  contact,
  conversation,
  onClose,
}: ContactInfoPanelProps) {
  if (!conversation) {
    return null
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Informações</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <div className="p-6 text-center border-b border-gray-200">
          <Avatar
            src={contact?.avatar_url}
            fallback={getInitials([contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || conversation.contact_name || 'UN')}
            size="xl"
            className="mx-auto mb-4"
          />
          <h3 className="text-lg font-semibold text-gray-800">
            {[contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || conversation.contact_name || 'Desconhecido'}
          </h3>
          <p className="text-gray-500 text-sm">
            {formatPhoneNumber(conversation.phone_number)}
          </p>
          {contact?.company && (
            <p className="text-gray-400 text-sm mt-1">{contact.company}</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-2">
            <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                <Phone className="w-5 h-5 text-brand-600" />
              </div>
              <span className="text-xs text-gray-500">Ligar</span>
            </button>
            <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-accent-400" />
              </div>
              <span className="text-xs text-gray-500">E-mail</span>
            </button>
            <button className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white transition-colors">
              <div className="w-10 h-10 rounded-full bg-success-500/20 flex items-center justify-center">
                <User className="w-5 h-5 text-success-400" />
              </div>
              <span className="text-xs text-gray-500">Perfil</span>
            </button>
          </div>
        </div>

        {/* Contact Details */}
        <div className="p-4 border-b border-gray-200">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Detalhes
          </h4>
          <div className="space-y-3">
            {contact?.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{contact.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                {formatPhoneNumber(conversation.phone_number)}
              </span>
            </div>
            {contact?.company && (
              <div className="flex items-center gap-3">
                <Building className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{contact.company}</span>
              </div>
            )}
          </div>
        </div>

        {/* Revenue Stats */}
        {contact && (
          <div className="p-4 border-b border-gray-200">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Estatísticas
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-success-400" />
                  <span className="text-xs text-gray-400">Receita Total</span>
                </div>
                <span className="text-lg font-semibold text-gray-800">
                  {formatCurrency(contact.total_spent || contact.total_revenue || 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4 text-brand-600" />
                  <span className="text-xs text-gray-400">Pedidos</span>
                </div>
                <span className="text-lg font-semibold text-gray-800">
                  {contact.total_orders || 0}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="p-4 border-b border-gray-200">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Tags
            </h4>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="primary" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Atividade Recente
          </h4>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-success-500/20 flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="w-4 h-4 text-success-400" />
              </div>
              <div>
                <p className="text-sm text-gray-700">Fez um pedido</p>
                <p className="text-xs text-gray-400">há 2 dias</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <p className="text-sm text-gray-700">Abriu e-mail de campanha</p>
                <p className="text-xs text-gray-400">há 5 dias</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200">
        <Button variant="secondary" className="w-full" leftIcon={<ExternalLink className="w-4 h-4" />}>
          Ver perfil completo
        </Button>
      </div>
    </div>
  )
}

// ===============================
// WHATSAPP PAGE LAYOUT
// ===============================
interface WhatsAppLayoutProps {
  children?: React.ReactNode
}

export function WhatsAppLayout({ children }: WhatsAppLayoutProps) {
  const {
    conversations,
    selectedConversation,
    messages,
    setSelectedConversation,
    addMessage,
    isLoading,
  } = useWhatsAppStore()

  const handleSendMessage = (content: string) => {
    if (!selectedConversation) return

    const newMessage = {
      id: Date.now().toString(),
      conversation_id: selectedConversation.id,
      from_number: '',
      to_number: selectedConversation.phone_number,
      type: 'text',
      content,
      status: 'sent',
      is_outgoing: true,
      created_at: new Date().toISOString(),
    }

    addMessage(selectedConversation.id, newMessage)
  }

  const currentMessages = selectedConversation
    ? messages[selectedConversation.id] || []
    : []

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Conversation List - 300px */}
      <div className="w-[350px] flex-shrink-0">
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id || null}
          onSelect={setSelectedConversation}
        />
      </div>

      {/* Chat Window - Flexible */}
      <div className="flex-1">
        <ChatWindow
          conversation={selectedConversation}
          messages={currentMessages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>

      {/* Contact Info Panel - 320px */}
      <div className="w-[320px] flex-shrink-0">
        <ContactInfoPanel
          contact={null}
          conversation={selectedConversation}
        />
      </div>
    </div>
  )
}
