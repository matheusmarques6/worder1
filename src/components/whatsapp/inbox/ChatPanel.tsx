'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Bot,
  MoreVertical,
  UserPlus,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Smile,
  Paperclip,
  Image,
  FileText,
  Mic,
  X,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { InboxConversation, InboxMessage } from '@/types/inbox'

interface ChatPanelProps {
  conversation: InboxConversation
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  onSendMessage: (content: string, type?: string) => Promise<void>
  onToggleBot: () => Promise<void>
  onBack: () => void
  onToggleContactPanel: () => void
  showContactPanel: boolean
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

const formatMessageTime = (date?: string) => {
  if (!date) return ''
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const getInitials = (name?: string) => {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Status Icon
function MessageStatus({ status }: { status: InboxMessage['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-dark-500" />
    case 'sent':
      return <Check className="w-4 h-4 text-dark-500" />
    case 'delivered':
      return <CheckCheck className="w-4 h-4 text-dark-500" />
    case 'read':
      return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'failed':
      return <AlertCircle className="w-4 h-4 text-error-400" />
    default:
      return <Clock className="w-4 h-4 text-dark-500" />
  }
}

// Message Bubble
function MessageBubble({ message, contactName }: { message: InboxMessage, contactName?: string }) {
  const isOutbound = message.direction === 'outbound'
  const isBot = message.sent_by_bot

  return (
    <div className={`flex gap-3 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar for inbound */}
      {!isOutbound && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 
                        flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-white text-xs font-semibold">
            {getInitials(contactName)}
          </span>
        </div>
      )}

      <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div className={`
          relative rounded-2xl px-4 py-2.5
          ${isOutbound 
            ? isBot 
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 rounded-tr-md' 
              : 'bg-primary-500 rounded-tr-md'
            : 'bg-dark-800 border border-dark-700/50 rounded-tl-md'
          }
        `}>
          {/* Bot indicator */}
          {isBot && (
            <div className="absolute top-2 right-2">
              <Bot className="w-3 h-3 text-white/50" />
            </div>
          )}

          {/* Media content */}
          {message.message_type === 'image' && message.media_url && (
            <img 
              src={message.media_url} 
              alt="Imagem"
              className="rounded-lg max-w-full mb-2 cursor-pointer hover:opacity-90"
            />
          )}

          {message.message_type === 'video' && message.media_url && (
            <video 
              src={message.media_url}
              controls
              className="rounded-lg max-w-full mb-2"
            />
          )}

          {message.message_type === 'audio' && message.media_url && (
            <audio 
              src={message.media_url}
              controls
              className="mb-2"
            />
          )}

          {message.message_type === 'document' && message.media_url && (
            <a 
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-dark-700/50 rounded-lg mb-2 hover:bg-dark-700"
            >
              <FileText className="w-5 h-5 text-primary-400" />
              <span className="text-sm text-white truncate">
                {message.media_filename || 'Documento'}
              </span>
            </a>
          )}

          {/* Text content */}
          {message.content && (
            <p className={`text-sm whitespace-pre-wrap break-words ${
              isOutbound ? 'text-white' : 'text-dark-100'
            }`}>
              {message.content}
            </p>
          )}
        </div>

        {/* Meta info */}
        <div className={`flex items-center gap-1.5 mt-1 px-1 ${
          isOutbound ? 'justify-end' : 'justify-start'
        }`}>
          {isBot && isOutbound && (
            <span className="text-[10px] text-dark-500">via Bot</span>
          )}
          <span className="text-[10px] text-dark-500">
            {formatMessageTime(message.created_at)}
          </span>
          {isOutbound && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  )
}

// Date Separator
function DateSeparator({ date }: { date: string }) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return 'Hoje'
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  }

  return (
    <div className="flex items-center gap-4 my-4">
      <div className="flex-1 h-px bg-dark-700/50" />
      <span className="text-xs text-dark-500 bg-dark-900 px-3 py-1 rounded-full">
        {formatDate(date)}
      </span>
      <div className="flex-1 h-px bg-dark-700/50" />
    </div>
  )
}

// Typing Indicator
function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500" />
      <div className="bg-dark-800 border border-dark-700/50 rounded-2xl rounded-tl-md px-4 py-3">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// Main Component
export function ChatPanel({
  conversation,
  messages,
  isLoading,
  isSending,
  onSendMessage,
  onToggleBot,
  onBack,
  onToggleContactPanel,
  showContactPanel,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  const handleSend = async () => {
    if (!input.trim() || isSending) return
    const content = input.trim()
    setInput('')
    await onSendMessage(content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const contactName = conversation.contact_name || formatPhone(conversation.phone_number)

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700/50 bg-dark-800/30">
        <div className="flex items-center gap-3">
          {/* Back button (mobile) */}
          <button 
            onClick={onBack}
            className="md:hidden p-2 rounded-lg hover:bg-dark-700/50 text-dark-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Avatar */}
          {conversation.contact_avatar ? (
            <img 
              src={conversation.contact_avatar} 
              alt={contactName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 
                            flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {getInitials(contactName)}
              </span>
            </div>
          )}

          {/* Info */}
          <div>
            <h3 className="font-semibold text-white">{contactName}</h3>
            <p className="text-xs text-dark-400">
              {formatPhone(conversation.phone_number)}
              {conversation.status === 'open' && ' • Online'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Bot Toggle */}
          <button
            onClick={onToggleBot}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              conversation.is_bot_active
                ? 'bg-primary-500/10 text-primary-400 border border-primary-500/30'
                : 'bg-dark-700/50 text-dark-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">
              {conversation.is_bot_active ? 'Bot Ativo' : 'Bot Off'}
            </span>
          </button>

          {/* Assign */}
          <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors">
            <UserPlus className="w-5 h-5" />
          </button>

          {/* More */}
          <button className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* Toggle Contact Panel */}
          <button 
            onClick={onToggleContactPanel}
            className="hidden lg:block p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors"
          >
            {showContactPanel ? (
              <PanelRightClose className="w-5 h-5" />
            ) : (
              <PanelRightOpen className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* ========== MESSAGES ========== */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-dark-400">
            <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Nenhuma mensagem ainda</p>
            <p className="text-xs text-dark-500 mt-1">
              Envie uma mensagem para iniciar a conversa
            </p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex}>
                <DateSeparator date={group.date} />
                <div className="space-y-3">
                  {group.messages.map((message) => (
                    <MessageBubble 
                      key={message.id} 
                      message={message} 
                      contactName={contactName}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* ========== INPUT ========== */}
      <div className="p-4 border-t border-dark-700/50 bg-dark-800/30">
        {/* Window expired alert */}
        {conversation.can_send_template_only && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
            <span className="text-sm text-warning-400">
              Janela de 24h expirada. Use um template para iniciar conversa.
            </span>
            <button className="ml-auto text-sm text-primary-400 font-medium hover:underline whitespace-nowrap">
              Enviar Template
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Emoji */}
          <button 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2.5 rounded-xl hover:bg-dark-700/50 text-dark-400 hover:text-primary-400 transition-colors"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Attach */}
          <button className="p-2.5 rounded-xl hover:bg-dark-700/50 text-dark-400 hover:text-primary-400 transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Input */}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={isSending}
              rows={1}
              className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white 
                         placeholder-dark-400 focus:outline-none focus:border-primary-500/50 resize-none
                         transition-colors disabled:opacity-50"
              style={{ maxHeight: '120px' }}
            />
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-2">
          <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700 transition-colors">
            /atalhos
          </button>
          <button className="px-3 py-1.5 text-xs bg-dark-700/50 text-dark-400 rounded-lg hover:text-white hover:bg-dark-700 transition-colors">
            📋 Templates
          </button>
        </div>
      </div>
    </div>
  )
}
