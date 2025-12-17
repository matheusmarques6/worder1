'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Phone, MoreVertical, Smile, Paperclip, Mic, Send, Check, CheckCheck,
  Clock, User, Building2, Mail, Tag, ShoppingCart, DollarSign, MessageSquare,
  Filter, X, Plus, RefreshCw, Bot, UserCircle, Loader2, AlertCircle, Settings,
  ChevronDown
} from 'lucide-react'
import { 
  useWhatsAppConversations, useWhatsAppMessages, useWhatsAppTags, useWhatsAppAgents
} from '@/hooks/useWhatsApp'

// Helpers
const formatPhone = (p?: string) => {
  if (!p) return ''
  const c = p.replace(/\D/g, '')
  if (c.length === 13) return `+${c.slice(0,2)} ${c.slice(2,4)} ${c.slice(4,9)}-${c.slice(9)}`
  return p
}

const formatTime = (d?: string) => {
  if (!d) return ''
  const now = new Date(), dt = new Date(d)
  const diff = Math.floor((now.getTime() - dt.getTime()) / 60000)
  if (diff < 1) return 'Agora'
  if (diff < 60) return `${diff}min`
  if (diff < 1440) return `${Math.floor(diff/60)}h`
  if (diff < 2880) return 'Ontem'
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const formatMsgTime = (d?: string) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

const getInitials = (n?: string) => (n || 'UN').split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase()

const formatCurrency = (v?: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

// Status Icon
const StatusIcon = ({ status }: { status: string }) => {
  const icons: Record<string, JSX.Element> = {
    pending: <Clock className="w-3.5 h-3.5 text-slate-500" />,
    sent: <Check className="w-3.5 h-3.5 text-slate-500" />,
    delivered: <CheckCheck className="w-3.5 h-3.5 text-slate-500" />,
    read: <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />,
    failed: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  }
  return icons[status] || <Check className="w-3.5 h-3.5 text-slate-500" />
}

export default function WhatsAppPage() {
  // Hooks
  const {
    conversations, selectedConversation, setSelectedConversation,
    isLoading: convsLoading, fetchConversations, updateConversation
  } = useWhatsAppConversations()

  const {
    messages, isLoading: msgsLoading, sendMessage, fetchMessages
  } = useWhatsAppMessages(selectedConversation?.id || null)

  const { tags, fetchTags } = useWhatsAppTags()
  const { agents, fetchAgents, assignChat } = useWhatsAppAgents()

  // State
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInfo, setShowInfo] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const msgEndRef = useRef<HTMLDivElement>(null)

  // Load data
  useEffect(() => {
    fetchConversations({ status: statusFilter !== 'all' ? statusFilter : undefined })
    fetchTags()
    fetchAgents()
  }, [statusFilter])

  // Scroll to bottom
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Handlers
  const handleSelect = (c: any) => { setSelectedConversation(c); setMobileView('chat') }

  const handleSend = async () => {
    if (!input.trim() || !selectedConversation) return
    try {
      await sendMessage(input)
      setInput('')
    } catch (e) { console.error(e) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const toggleBot = () => {
    if (selectedConversation) {
      updateConversation(selectedConversation.id, { is_bot_active: !selectedConversation.is_bot_active })
    }
  }

  // Filter
  const filtered = conversations.filter(c =>
    (c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
     c.phone_number?.includes(search))
  )

  return (
    <div className="h-[calc(100vh-120px)] flex bg-slate-900/30 rounded-2xl border border-slate-800/50 overflow-hidden">
      {/* ======= CONVERSATIONS LIST ======= */}
      <div className={`w-full md:w-96 flex-shrink-0 border-r border-slate-800/50 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Conversas</h2>
            <div className="flex gap-2">
              <button onClick={() => fetchConversations()} className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white">
                <RefreshCw className={`w-5 h-5 ${convsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div className="flex gap-2">
            {['all', 'open', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                  statusFilter === s ? 'bg-violet-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'Todas' : s === 'open' ? 'Abertas' : 'Fechadas'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500">
              <MessageSquare className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filtered.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv)}
                className={`flex items-start gap-3 p-4 cursor-pointer border-b border-slate-800/30 transition-colors ${
                  selectedConversation?.id === conv.id ? 'bg-violet-600/10' : 'hover:bg-slate-800/30'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                    <span className="text-white font-semibold">{getInitials(conv.contact_name || conv.phone_number)}</span>
                  </div>
                  {conv.is_bot_active && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center border-2 border-slate-900">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-white truncate">{conv.contact_name || formatPhone(conv.phone_number)}</span>
                    <span className={`text-xs ${conv.unread_count > 0 ? 'text-violet-400 font-medium' : 'text-slate-500'}`}>
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <p className={`text-sm truncate ${conv.unread_count > 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                      {conv.last_message_preview || 'Nova conversa'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-violet-600 rounded-full text-[10px] font-bold text-white">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      conv.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
                    }`}>
                      {conv.status === 'open' ? 'Aberta' : 'Fechada'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ======= CHAT WINDOW ======= */}
      {selectedConversation ? (
        <div className={`flex-1 flex flex-col ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileView('list')} className="md:hidden p-2 rounded-lg hover:bg-slate-800/50 text-slate-400">
                <X className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">{getInitials(selectedConversation.contact_name || selectedConversation.phone_number)}</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">{selectedConversation.contact_name || formatPhone(selectedConversation.phone_number)}</h3>
                <p className="text-xs text-slate-400">{formatPhone(selectedConversation.phone_number)}</p>
              </div>
            </div>
            
            <div className="flex gap-1">
              <button onClick={toggleBot} className={`p-2 rounded-lg ${selectedConversation.is_bot_active ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-slate-800/50 text-slate-400'}`} title="Bot">
                <Bot className="w-5 h-5" />
              </button>
              <button onClick={() => setShowInfo(!showInfo)} className={`p-2 rounded-lg ${showInfo ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-slate-800/50 text-slate-400'}`}>
                <User className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/30">
            {msgsLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                <p>Nenhuma mensagem</p>
              </div>
            ) : (
              messages.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                    msg.direction === 'outbound'
                      ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white rounded-br-md'
                      : 'bg-slate-800/70 text-white rounded-bl-md'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content || `[${msg.type}]`}</p>
                    <div className={`flex items-center gap-1 mt-1 ${msg.direction === 'outbound' ? 'justify-end' : ''}`}>
                      <span className="text-[10px] text-slate-300/70">{formatMsgTime(msg.sent_at)}</span>
                      {msg.direction === 'outbound' && <StatusIcon status={msg.status} />}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white">
                <Smile className="w-5 h-5" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white">
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
              />
              {input.trim() ? (
                <button onClick={handleSend} disabled={msgsLoading} className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  {msgsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              ) : (
                <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white">
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center text-slate-500">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Selecione uma conversa</p>
          </div>
        </div>
      )}

      {/* ======= CONTACT INFO ======= */}
      <AnimatePresence>
        {showInfo && selectedConversation && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="hidden lg:flex flex-col border-l border-slate-800/50 overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
              <h3 className="font-semibold text-white">Contato</h3>
              <button onClick={() => setShowInfo(false)} className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Profile */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-bold text-white">{getInitials(selectedConversation.contact_name || selectedConversation.phone_number)}</span>
                </div>
                <h4 className="font-semibold text-white">{selectedConversation.contact_name || 'Desconhecido'}</h4>
                <p className="text-sm text-slate-400">{formatPhone(selectedConversation.phone_number)}</p>
              </div>

              {/* Info */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">{formatPhone(selectedConversation.phone_number)}</span>
                </div>
                {selectedConversation.contact?.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">{selectedConversation.contact.email}</span>
                  </div>
                )}
              </div>

              {/* Bot Status */}
              <div className="p-3 bg-slate-800/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-violet-400" />
                    <span className="text-sm text-slate-300">Bot Automático</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    selectedConversation.is_bot_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
                  }`}>
                    {selectedConversation.is_bot_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>

              {/* Stats */}
              {selectedConversation.contact && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingCart className="w-4 h-4 text-violet-400" />
                      <span className="text-xs text-slate-400">Pedidos</span>
                    </div>
                    <p className="text-lg font-bold text-white">{selectedConversation.contact.total_orders || 0}</p>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-slate-400">Total</span>
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(selectedConversation.contact.total_spent)}</p>
                  </div>
                </div>
              )}

              {/* Tags */}
              {selectedConversation.tags && selectedConversation.tags.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Tags</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedConversation.tags.map((t: any) => (
                      <span key={t.tag?.id} style={{ backgroundColor: t.tag?.color + '30', color: t.tag?.color }} className="px-2 py-1 rounded-lg text-xs font-medium">
                        {t.tag?.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent */}
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Agente</h5>
                {selectedConversation.assigned_agent ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl">
                    <UserCircle className="w-8 h-8 text-violet-400" />
                    <div>
                      <p className="text-sm font-medium text-white">{selectedConversation.assigned_agent.name}</p>
                      <p className="text-xs text-slate-400">{selectedConversation.assigned_agent.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-800/30 rounded-xl text-center">
                    <p className="text-sm text-slate-400">Sem agente</p>
                    <button className="mt-2 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                      Atribuir
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Notas</h5>
                <textarea
                  placeholder="Adicionar nota..."
                  defaultValue={selectedConversation.chat_note || ''}
                  className="w-full p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 resize-none h-24 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
