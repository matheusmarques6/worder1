'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Bot, MoreVertical, UserPlus, PanelRightClose, PanelRightOpen,
  Send, Smile, Paperclip, Image as ImageIcon, FileText, Film, X,
  Check, CheckCheck, Clock, AlertCircle, Loader2, RefreshCw, CheckCircle,
  KeyRound, Mic,
} from 'lucide-react'
import { AudioRecorder } from './AudioRecorder'
import { AIToggleButton } from './AIToggleButton'
import { ServiceWindowBar } from './ServiceWindowBar'
import { QuickRepliesPicker } from './QuickRepliesPicker'
import { CSATModal } from './modals/CSATModal'
import { TransferModal } from './modals/TransferModal'
import { PaymentLinkModal } from './modals/PaymentLinkModal'
import { CreditCard, ShoppingBag } from 'lucide-react'
import type { InboxConversation, InboxMessage } from '@/types/inbox'
import { authedFetch } from '@/lib/api/authed-fetch'

interface ChatPanelProps {
  conversation: InboxConversation
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  isUploading?: boolean
  onSendMessage: (content: string, type?: string) => Promise<void>
  onSendMedia: (file: File, mediaType: string, caption?: string) => Promise<void>
  onToggleBot: () => Promise<void>
  onBack: () => void
  onToggleContactPanel: () => void
  showContactPanel: boolean
  onRetryMessage?: (message: InboxMessage) => Promise<void>
  // NEW: Module A integration
  organizationId?: string
  currentAgentId?: string
  currentAgentName?: string
  onResolved?: () => void
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

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Status Icon
function MessageStatus({ status }: { status: InboxMessage['status'] }) {
  switch (status) {
    case 'pending': return <Clock className="w-4 h-4 text-gray-400" />
    case 'sent': return <Check className="w-4 h-4 text-gray-400" />
    case 'delivered': return <CheckCheck className="w-4 h-4 text-gray-400" />
    case 'read': return <CheckCheck className="w-4 h-4 text-cyan-400" />
    case 'failed': return <AlertCircle className="w-4 h-4 text-error-400" />
    default: return <Clock className="w-4 h-4 text-gray-400" />
  }
}

// Message Bubble
function MessageBubble({ message, contactName, onRetry }: { message: InboxMessage, contactName?: string, onRetry?: (msg: InboxMessage) => void }) {
  const router = useRouter()
  const isOutbound = message.direction === 'outbound'
  const isBot = message.sent_by_bot
  const isFailed = message.status === 'failed'
  const isPending = message.status === 'pending'

  // Detect Meta auth error (code 190) so we can show a CTA that takes the
  // user to the settings page to refresh the token, instead of a useless
  // "Tentar novamente" that will hit the same dead token.
  const errMsg = (message as any).error || message.error_message || ''
  const errCode = (message as any).error_code
  const isAuthError =
    String(errCode) === '190' ||
    /Authentication Error/i.test(errMsg)

  return (
    <div className={`flex gap-3 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      {!isOutbound && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-white text-xs font-semibold">{getInitials(contactName)}</span>
        </div>
      )}

      <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'}`}>
        <div className={`relative rounded-2xl px-4 py-2.5 ${
          isFailed 
            ? 'bg-red-900/50 border border-red-500/50 rounded-tr-md' // ❌ Estilo de erro
            : isPending
              ? 'bg-gray-100 opacity-70 rounded-tr-md' // ⏳ Estilo de enviando
              : isOutbound 
                ? isBot ? 'bg-gradient-to-r from-primary-500 to-primary-600 rounded-tr-md' : 'bg-primary-500 rounded-tr-md'
                : 'bg-white border border-gray-200 rounded-tl-md'
        }`}>
          {isBot && <div className="absolute top-2 right-2"><Bot className="w-3 h-3 text-white/50" /></div>}

          {/* ✅ CORREÇÃO: Imagem com tamanho limitado + object-contain */}
          {message.message_type === 'image' && message.media_url && (
            <img 
              src={message.media_url} 
              alt="Imagem" 
              loading="lazy"
              className="rounded-lg mb-2 cursor-pointer hover:opacity-90 w-full max-w-[320px] max-h-[360px] object-contain bg-white/30"
              onClick={() => window.open(message.media_url, '_blank')} 
            />
          )}
          {/* ✅ CORREÇÃO: Vídeo com preload, playsInline e tamanho limitado */}
          {message.message_type === 'video' && message.media_url && (
            <video 
              src={message.media_url} 
              controls 
              preload="metadata"
              playsInline
              className="rounded-lg mb-2 w-full max-w-[360px] max-h-[360px] object-contain bg-white/30" 
            />
          )}
          {message.message_type === 'audio' && message.media_url && (
            <audio src={message.media_url} controls className="mb-2" />
          )}
          {message.message_type === 'document' && message.media_url && (
            <a href={message.media_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-2 hover:bg-gray-100">
              <FileText className="w-5 h-5 text-brand-600" />
              <span className="text-sm text-gray-700 truncate">{message.media_filename || 'Documento'}</span>
            </a>
          )}
          {message.content && (
            <p className={`text-sm whitespace-pre-wrap break-words ${isOutbound ? 'text-white' : 'text-gray-800'}`}>
              {message.content}
            </p>
          )}
          
          {/* ❌ Mostrar erro e botão de retry quando falha */}
          {isFailed && (
            <div className="mt-2 pt-2 border-t border-red-500/30">
              <p className="text-xs text-red-300 mb-1">
                {isAuthError ? 'Conexao WhatsApp expirou' : (errMsg || 'Falha ao enviar')}
              </p>
              {isAuthError ? (
                <button
                  onClick={() => router.push('/whatsapp/settings')}
                  className="text-xs text-red-300 hover:text-white flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" /> Atualizar conexao
                </button>
              ) : (
                onRetry && (
                  <button
                    onClick={() => onRetry(message)}
                    className="text-xs text-red-300 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Tentar novamente
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className={`flex items-center gap-1.5 mt-1 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          {isPending && <span className="text-[10px] text-gray-500">Enviando...</span>}
          {isBot && isOutbound && !isPending && <span className="text-[10px] text-gray-400">via Bot</span>}
          <span className="text-[10px] text-gray-400">{formatMessageTime(message.created_at)}</span>
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
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full">{formatDate(date)}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// Media Preview Modal
function MediaPreviewModal({ file, onClose, onSend, isSending }: { 
  file: File; onClose: () => void; onSend: (caption: string) => void; isSending: boolean 
}) {
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')

  useEffect(() => {
    if (file.size > 16 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 16MB')
      return
    }
    if (isImage || isVideo) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file, isImage, isVideo])

  const getMediaType = () => {
    if (file.type.startsWith('image/')) return 'Imagem'
    if (file.type.startsWith('video/')) return 'Vídeo'
    if (file.type.startsWith('audio/')) return 'Áudio'
    return 'Documento'
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-gray-900 font-semibold">Enviar {getMediaType()}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
          ) : (
            <>
              {isImage && preview && <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-lg object-contain" />}
              {isVideo && preview && <video src={preview} controls className="max-h-64 mx-auto rounded-lg" />}
              {!isImage && !isVideo && (
                <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-lg">
                  <FileText className="w-10 h-10 text-brand-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-medium truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!error && (
          <div className="px-4 pb-4">
            <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="Adicionar legenda (opcional)"
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500" />
          </div>
        )}

        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">
            Cancelar
          </button>
          <button onClick={() => !error && onSend(caption)} disabled={isSending || !!error}
            className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2">
            {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Enviar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// Main Component
export function ChatPanel({
  conversation, messages, isLoading, isSending, isUploading = false,
  onSendMessage, onSendMedia, onToggleBot, onBack, onToggleContactPanel, showContactPanel,
  onRetryMessage,
  organizationId,
  currentAgentId,
  currentAgentName,
  onResolved,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | 'document'>('document')
  const [recordingMode, setRecordingMode] = useState(false)
  // Module A: Modals and pickers
  const [showCSATModal, setShowCSATModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [isSendingTemplate, setIsSendingTemplate] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    setShowQuickReplies(false)
    await onSendMessage(content)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    // Detect /slash command at start
    if (value.startsWith('/') && !value.includes(' ')) {
      setSlashQuery(value)
      setShowQuickReplies(true)
    } else {
      setShowQuickReplies(false)
    }
  }

  const handleSelectQuickReply = (reply: { content: string; title: string }) => {
    // Replace variables with placeholder; caller can handle real substitution
    const content = reply.content
      .replace(/\{nome\}/g, conversation.contact_name || '')
      .replace(/\{telefone\}/g, conversation.phone_number || '')
    setInput(content)
    setShowQuickReplies(false)
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showQuickReplies) return // Let picker handle keys
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleResolveClick() {
    if (!organizationId) return
    setShowMoreMenu(false)
    setShowCSATModal(true)
  }

  async function handleCSATSubmit(rating: number, comment: string) {
    if (!organizationId) return
    try {
      // Save CSAT rating
      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/csat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
    } catch { /* */ }
    try {
      // Mark as resolved via close endpoint (existing)
      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: comment, rating }),
      })
    } catch { /* */ }
    if (onResolved) onResolved()
  }

  async function handleTransferSubmit(params: { toAgentId?: string; toQueueId?: string; reason?: string }) {
    if (!organizationId) return
    await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        fromAgentName: currentAgentName,
      }),
    })
    setShowTransferModal(false)
  }

  // Get last inbound message for copilot
  const lastInboundMessage = messages
    .filter(m => m.direction === 'inbound' && m.content)
    .slice(-1)[0]?.content

  async function handleSendPaymentLink(data: { amount: number; description: string; paymentUrl?: string }) {
    if (!organizationId) return
    await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/payment-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  }

  async function handleSendCatalog() {
    if (!organizationId) return
    // Prompt for product ids (simple approach, no selector UI for brevity)
    const ids = prompt('IDs dos produtos Shopify separados por virgula:')
    if (!ids) return
    const productIds = ids.split(',').map(s => s.trim()).filter(Boolean)
    await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds, bodyText: 'Confira nossos produtos' }),
    })
  }

  const handleFileTypeSelect = (type: 'image' | 'video' | 'document') => {
    setSelectedMediaType(type)
    if (!fileInputRef.current) return
    fileInputRef.current.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'
    fileInputRef.current.click()
    setShowAttachMenu(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    e.target.value = ''
  }

  const handleSendMedia = async (caption: string) => {
    if (!selectedFile) return
    await onSendMedia(selectedFile, selectedMediaType, caption)
    setSelectedFile(null)
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
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {selectedFile && (
        <MediaPreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} 
          onSend={handleSendMedia} isSending={isUploading} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>

          {conversation.contact_avatar ? (
            <img src={conversation.contact_avatar} alt={contactName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <span className="text-gray-900 font-semibold text-sm">{getInitials(contactName)}</span>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-900">{contactName}</h3>
            <p className="text-xs text-gray-500">{formatPhone(conversation.phone_number)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AIToggleButton conversationId={conversation.id} initialEnabled={conversation.ai_enabled !== false} variant="default" />

          <button onClick={onToggleBot}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              conversation.is_bot_active
                ? 'bg-brand-50 text-brand-600 border border-brand-300'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}>
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">{conversation.is_bot_active ? 'Bot Ativo' : 'Bot Off'}</span>
          </button>

          {/* Resolve conversation */}
          <button
            onClick={handleResolveClick}
            disabled={!organizationId}
            title="Resolver conversa"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Resolver</span>
          </button>

          {/* Transfer */}
          <button
            onClick={() => setShowTransferModal(true)}
            disabled={!organizationId}
            title="Transferir conversa"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-50"
          >
            <UserPlus className="w-5 h-5" />
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg min-w-[180px] z-50 py-1">
                  <button
                    onClick={async () => {
                      setShowMoreMenu(false)
                      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'pending' }),
                      })
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Marcar como pendente
                  </button>
                  <button
                    onClick={async () => {
                      setShowMoreMenu(false)
                      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'archived' }),
                      })
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Arquivar
                  </button>
                  <button
                    onClick={async () => {
                      setShowMoreMenu(false)
                      const tagName = prompt('Nome da tag:')
                      if (!tagName) return
                      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/tags`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: tagName }),
                      })
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Adicionar tag
                  </button>
                </div>
              </>
            )}
          </div>

          <button onClick={onToggleContactPanel} className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            {showContactPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Service Window 24h Bar */}
      <ServiceWindowBar expiresAt={conversation.window_expires_at} />

      {/* Modals */}
      {showCSATModal && organizationId && (
        <CSATModal
          isOpen={showCSATModal}
          onClose={() => setShowCSATModal(false)}
          onSubmit={handleCSATSubmit}
          contactName={conversation.contact_name}
        />
      )}

      {showTransferModal && organizationId && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          onTransfer={handleTransferSubmit}
          organizationId={organizationId}
          conversationId={conversation.id}
        />
      )}

      {showPaymentModal && organizationId && (
        <PaymentLinkModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSend={handleSendPaymentLink}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <>
            {/* ✅ CORREÇÃO: Key estável usando group.date em vez de índice */}
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <DateSeparator date={group.date} />
                <div className="space-y-3">
                  {group.messages.map((msg) => (
                    <MessageBubble 
                      key={msg.id} 
                      message={msg} 
                      contactName={contactName}
                      onRetry={onRetryMessage} // NOVO: Passar função de retry
                    />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        {conversation.can_send_template_only && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
            <span className="text-sm text-warning-400">Janela de 24h expirada. Use um template.</span>
            <button className="ml-auto text-sm text-brand-600 font-medium hover:underline">Enviar Template</button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-brand-600">
            <Smile className="w-5 h-5" />
          </button>

          {/* Attach Menu */}
          <div className="relative">
            <button onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={`p-2.5 rounded-xl ${showAttachMenu ? 'bg-brand-100 text-brand-600' : 'hover:bg-gray-100 text-gray-500 hover:text-brand-600'}`}>
              <Paperclip className="w-5 h-5" />
            </button>
            
            {showAttachMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <button onClick={() => handleFileTypeSelect('image')}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-100 text-left">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-white">Imagem</span>
                  </button>
                  <button onClick={() => handleFileTypeSelect('video')}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-100 text-left">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Film className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-white">Vídeo</span>
                  </button>
                  <button onClick={() => handleFileTypeSelect('document')}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-100 text-left">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-gray-900">Documento</span>
                  </button>
                  {organizationId && (
                    <>
                      <button
                        onClick={() => { setShowAttachMenu(false); handleSendCatalog() }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-100 text-left border-t"
                      >
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <ShoppingBag className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-gray-900">Enviar catalogo</span>
                      </button>
                      <button
                        onClick={() => { setShowAttachMenu(false); setShowPaymentModal(true) }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-100 text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-gray-900">Link de pagamento</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {recordingMode ? (
            <AudioRecorder
              isUploading={isUploading}
              onCancel={() => setRecordingMode(false)}
              onSend={async (file) => {
                await onSendMedia(file, 'audio')
                setRecordingMode(false)
              }}
            />
          ) : (
            <>
              <div className="flex-1 relative">
                <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                  placeholder="Digite uma mensagem ou /atalho..." disabled={isSending} rows={1}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 resize-none disabled:opacity-50"
                  style={{ maxHeight: '120px' }} />
                {showQuickReplies && organizationId && (
                  <QuickRepliesPicker
                    query={slashQuery}
                    organizationId={organizationId}
                    onSelect={handleSelectQuickReply}
                    onClose={() => setShowQuickReplies(false)}
                  />
                )}
              </div>

              {input.trim() ? (
                <button onClick={handleSend} disabled={!input.trim() || isSending}
                  className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              ) : (
                <button
                  onClick={() => setRecordingMode(true)}
                  disabled={isSending || isUploading}
                  title="Gravar audio"
                  className="p-3 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-primary-600 disabled:opacity-50"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => { setSlashQuery(''); setShowQuickReplies(true) }}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            /atalhos
          </button>
          <button
            type="button"
            onClick={() => setShowTemplatePicker(true)}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            📋 Templates
          </button>
        </div>
      </div>
    </div>
  )
}
