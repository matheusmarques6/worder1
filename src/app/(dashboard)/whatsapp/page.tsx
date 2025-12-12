'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  Send,
  Check,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  File,
  MapPin,
  User,
  Building2,
  Mail,
  Tag,
  ShoppingCart,
  DollarSign,
  Calendar,
  MessageSquare,
  Filter,
  Archive,
  Star,
  StarOff,
  Pin,
  X,
  ChevronLeft,
  Plus
} from 'lucide-react'

interface Message {
  id: string
  content: string
  timestamp: string
  sender: 'user' | 'contact'
  status: 'sending' | 'sent' | 'delivered' | 'read'
  type: 'text' | 'image' | 'file' | 'audio'
}

interface Conversation {
  id: string
  contact: {
    name: string
    phone: string
    avatar?: string
    email?: string
    company?: string
    tags: string[]
  }
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  isStarred: boolean
  isPinned: boolean
  status: 'online' | 'offline' | 'typing'
}

interface CustomerInfo {
  totalOrders: number
  totalSpent: number
  lastOrder?: {
    id: string
    date: string
    total: number
    status: string
  }
  activities: {
    type: string
    description: string
    date: string
  }[]
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    contact: {
      name: 'Maria Silva',
      phone: '+55 11 99999-0001',
      email: 'maria@empresa.com',
      company: 'Tech Store',
      tags: ['cliente', 'vip']
    },
    lastMessage: 'Olá! Gostaria de saber sobre o status do meu pedido',
    lastMessageTime: '10:30',
    unreadCount: 2,
    isStarred: true,
    isPinned: true,
    status: 'online'
  },
  {
    id: '2',
    contact: {
      name: 'João Santos',
      phone: '+55 11 99999-0002',
      email: 'joao@loja.com',
      company: 'Loja Virtual',
      tags: ['prospect']
    },
    lastMessage: 'Obrigado pela informação!',
    lastMessageTime: '09:45',
    unreadCount: 0,
    isStarred: false,
    isPinned: false,
    status: 'offline'
  },
  {
    id: '3',
    contact: {
      name: 'Ana Costa',
      phone: '+55 11 99999-0003',
      email: 'ana@moda.com',
      company: 'Moda Fashion',
      tags: ['cliente', 'email']
    },
    lastMessage: 'Vocês têm essa peça em outra cor?',
    lastMessageTime: '09:15',
    unreadCount: 1,
    isStarred: false,
    isPinned: false,
    status: 'typing'
  },
  {
    id: '4',
    contact: {
      name: 'Pedro Lima',
      phone: '+55 11 99999-0004',
      email: 'pedro@tech.com',
      company: 'TechBr',
      tags: ['suporte']
    },
    lastMessage: 'Pode me ajudar com a integração?',
    lastMessageTime: 'Ontem',
    unreadCount: 0,
    isStarred: false,
    isPinned: false,
    status: 'offline'
  },
  {
    id: '5',
    contact: {
      name: 'Carla Souza',
      phone: '+55 11 99999-0005',
      company: 'Mega Store',
      tags: ['lead']
    },
    lastMessage: 'Qual o prazo de entrega?',
    lastMessageTime: 'Ontem',
    unreadCount: 0,
    isStarred: true,
    isPinned: false,
    status: 'offline'
  },
]

const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 'm1', content: 'Olá! Bom dia!', timestamp: '10:00', sender: 'contact', status: 'read', type: 'text' },
    { id: 'm2', content: 'Bom dia Maria! Como posso ajudar?', timestamp: '10:02', sender: 'user', status: 'read', type: 'text' },
    { id: 'm3', content: 'Gostaria de saber sobre o status do meu pedido #12345', timestamp: '10:05', sender: 'contact', status: 'read', type: 'text' },
    { id: 'm4', content: 'Claro! Deixe-me verificar para você. Um momento...', timestamp: '10:06', sender: 'user', status: 'read', type: 'text' },
    { id: 'm5', content: 'Seu pedido está em separação e será despachado hoje! Você receberá o código de rastreio assim que sair para entrega.', timestamp: '10:10', sender: 'user', status: 'read', type: 'text' },
    { id: 'm6', content: 'Maravilha! Muito obrigada! 😊', timestamp: '10:15', sender: 'contact', status: 'read', type: 'text' },
    { id: 'm7', content: 'Por nada! Qualquer dúvida estou à disposição.', timestamp: '10:16', sender: 'user', status: 'delivered', type: 'text' },
    { id: 'm8', content: 'Olá! Gostaria de saber sobre o status do meu pedido', timestamp: '10:30', sender: 'contact', status: 'delivered', type: 'text' },
  ],
}

const mockCustomerInfo: CustomerInfo = {
  totalOrders: 8,
  totalSpent: 4580,
  lastOrder: {
    id: '#12345',
    date: '2024-01-15',
    total: 459.90,
    status: 'Em separação'
  },
  activities: [
    { type: 'order', description: 'Fez um pedido #12345', date: '2024-01-15' },
    { type: 'email', description: 'Abriu e-mail "Novidades de Janeiro"', date: '2024-01-14' },
    { type: 'visit', description: 'Visitou a página de produtos', date: '2024-01-13' },
    { type: 'chat', description: 'Conversou pelo WhatsApp', date: '2024-01-10' },
  ]
}

const tagColors: Record<string, string> = {
  'cliente': 'bg-emerald-500/20 text-emerald-400',
  'vip': 'bg-amber-500/20 text-amber-400',
  'prospect': 'bg-blue-500/20 text-blue-400',
  'lead': 'bg-violet-500/20 text-violet-400',
  'suporte': 'bg-red-500/20 text-red-400',
  'email': 'bg-cyan-500/20 text-cyan-400',
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState(mockConversations)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(mockConversations[0])
  const [messages, setMessages] = useState<Message[]>(mockMessages['1'] || [])
  const [inputMessage, setInputMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showContactInfo, setShowContactInfo] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv)
    setMessages(mockMessages[conv.id] || [])
    setMobileView('chat')
  }

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !selectedConversation) return

    const newMessage: Message = {
      id: `m${Date.now()}`,
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      sender: 'user',
      status: 'sending',
      type: 'text'
    }

    setMessages([...messages, newMessage])
    setInputMessage('')

    // Simulate message status updates
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, status: 'sent' as const } : m))
    }, 500)
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, status: 'delivered' as const } : m))
    }, 1000)
  }

  const MessageStatus = ({ status }: { status: Message['status'] }) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3.5 h-3.5 text-slate-500" />
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-slate-500" />
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />
      default:
        return null
    }
  }

  const filteredConversations = conversations.filter(conv =>
    conv.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.contact.phone.includes(searchQuery)
  )

  return (
    <div className="h-[calc(100vh-120px)] flex bg-slate-900/30 rounded-2xl border border-slate-800/50 overflow-hidden">
      {/* Conversations List */}
      <div className={`w-full md:w-96 flex-shrink-0 border-r border-slate-800/50 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Conversas</h2>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <Filter className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={`
                flex items-start gap-3 p-4 cursor-pointer transition-all border-b border-slate-800/30
                ${selectedConversation?.id === conv.id ? 'bg-violet-600/10' : 'hover:bg-slate-800/30'}
              `}
            >
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {conv.contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                {conv.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{conv.contact.name}</span>
                    {conv.isPinned && <Pin className="w-3 h-3 text-violet-400" />}
                    {conv.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  </div>
                  <span className={`text-xs ${conv.unreadCount > 0 ? 'text-violet-400 font-medium' : 'text-slate-500'}`}>
                    {conv.lastMessageTime}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                    {conv.status === 'typing' ? (
                      <span className="text-emerald-400 italic">Digitando...</span>
                    ) : conv.lastMessage}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-violet-600 rounded-full text-[10px] font-bold text-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConversation ? (
        <div className={`flex-1 flex flex-col ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800/50 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {selectedConversation.contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div>
                <h3 className="font-medium text-white">{selectedConversation.contact.name}</h3>
                <p className="text-xs text-slate-400">
                  {selectedConversation.status === 'online' && <span className="text-emerald-400">Online</span>}
                  {selectedConversation.status === 'typing' && <span className="text-emerald-400">Digitando...</span>}
                  {selectedConversation.status === 'offline' && 'Visto por último hoje às 09:30'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <Phone className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <Video className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowContactInfo(!showContactInfo)}
                className={`p-2 rounded-lg transition-colors ${showContactInfo ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-slate-800/50 text-slate-400 hover:text-white'}`}
              >
                <User className="w-5 h-5" />
              </button>
              <button className="p-2 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[70%] px-4 py-2.5 rounded-2xl
                    ${message.sender === 'user'
                      ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white rounded-br-md'
                      : 'bg-slate-800/70 text-white rounded-bl-md'
                    }
                  `}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <div className={`flex items-center gap-1 mt-1 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                    <span className="text-[10px] text-slate-300/70">{message.timestamp}</span>
                    {message.sender === 'user' && <MessageStatus status={message.status} />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <Smile className="w-5 h-5" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                type="text"
                placeholder="Digite uma mensagem..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
              />
              {inputMessage.trim() ? (
                <button
                  onClick={handleSendMessage}
                  className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button className="p-2.5 rounded-xl hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors">
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
            <p>Selecione uma conversa para começar</p>
          </div>
        </div>
      )}

      {/* Contact Info Sidebar */}
      <AnimatePresence>
        {showContactInfo && selectedConversation && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="hidden lg:flex flex-col border-l border-slate-800/50 overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
              <h3 className="font-semibold text-white">Informações do Contato</h3>
              <button
                onClick={() => setShowContactInfo(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Profile */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-bold text-white">
                    {selectedConversation.contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <h4 className="font-semibold text-white">{selectedConversation.contact.name}</h4>
                <p className="text-sm text-slate-400">{selectedConversation.contact.phone}</p>
              </div>

              {/* Quick Info */}
              <div className="space-y-3">
                {selectedConversation.contact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">{selectedConversation.contact.email}</span>
                  </div>
                )}
                {selectedConversation.contact.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">{selectedConversation.contact.company}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {selectedConversation.contact.tags.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Tags</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedConversation.contact.tags.map(tag => (
                      <span
                        key={tag}
                        className={`px-2 py-1 rounded-lg text-xs font-medium ${tagColors[tag] || 'bg-slate-700/50 text-slate-400'}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="w-4 h-4 text-violet-400" />
                    <span className="text-xs text-slate-400">Pedidos</span>
                  </div>
                  <p className="text-lg font-bold text-white">{mockCustomerInfo.totalOrders}</p>
                </div>
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-slate-400">Total Gasto</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatCurrency(mockCustomerInfo.totalSpent)}</p>
                </div>
              </div>

              {/* Last Order */}
              {mockCustomerInfo.lastOrder && (
                <div className="p-3 bg-slate-800/30 rounded-xl">
                  <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Último Pedido</h5>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{mockCustomerInfo.lastOrder.id}</span>
                    <span className="text-xs text-slate-400">{mockCustomerInfo.lastOrder.date}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-400 font-medium">
                      {formatCurrency(mockCustomerInfo.lastOrder.total)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                      {mockCustomerInfo.lastOrder.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Activity */}
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-3">Atividade Recente</h5>
                <div className="space-y-3">
                  {mockCustomerInfo.activities.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center flex-shrink-0">
                        {activity.type === 'order' && <ShoppingCart className="w-4 h-4 text-violet-400" />}
                        {activity.type === 'email' && <Mail className="w-4 h-4 text-cyan-400" />}
                        {activity.type === 'visit' && <User className="w-4 h-4 text-emerald-400" />}
                        {activity.type === 'chat' && <MessageSquare className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300">{activity.description}</p>
                        <p className="text-xs text-slate-500">{activity.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
