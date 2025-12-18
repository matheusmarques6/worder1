'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  MessageSquare,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
} from 'lucide-react'

// Components
import { ConversationList } from '@/components/whatsapp/inbox/ConversationList'
import { ChatPanel } from '@/components/whatsapp/inbox/ChatPanel'
import { ContactPanel } from '@/components/whatsapp/inbox/ContactPanel'

// Hooks
import { useInboxConversations } from '@/hooks/useInboxConversations'
import { useInboxMessages } from '@/hooks/useInboxMessages'
import { useInboxContact } from '@/hooks/useInboxContact'
import { useWhatsAppRealtime } from '@/hooks/useWhatsAppRealtime'

// Types
import type { InboxConversation, ConversationFilters } from '@/types/inbox'

export default function InboxPage() {
  const { user } = useAuthStore()
  // Usar organization_id do user ou 'default-org' (a API vai resolver)
  const organizationId = user?.organization_id || 'default-org'
  
  // Hooks
  const {
    conversations,
    selectedConversation,
    isLoading: conversationsLoading,
    error: conversationsError,
    filters,
    selectConversation,
    fetchConversations,
    updateConversation,
    toggleBot,
    markAsRead,
    setFilters,
    refresh: refreshConversations,
  } = useInboxConversations(organizationId)

  const {
    messages,
    isLoading: messagesLoading,
    isSending,
    fetchMessages,
    sendMessage,
    addMessage,
    updateMessageStatus,
    clear: clearMessages,
  } = useInboxMessages()

  const {
    contact,
    notes,
    activities,
    orders,
    cart,
    activeDeal,
    deals,
    isLoading: contactLoading,
    fetchContact,
    updateContact,
    addTag,
    removeTag,
    addNote,
    blockContact,
    unblockContact,
    fetchOrders,
    fetchDeals,
    createDeal,
    clear: clearContact,
  } = useInboxContact()

  // Realtime subscription
  const handleNewConversation = useCallback((conv: any) => {
    console.log('📥 New conversation via realtime:', conv)
    refreshConversations()
  }, [refreshConversations])

  const handleNewMessage = useCallback((msg: any) => {
    console.log('📨 New message via realtime:', msg)
    if (selectedConversation) {
      addMessage(msg)
    }
    // Atualizar lista de conversas para mostrar nova mensagem
    refreshConversations()
  }, [selectedConversation, addMessage, refreshConversations])

  // Hook de realtime
  useWhatsAppRealtime({
    organizationId,
    conversationId: selectedConversation?.id,
    onConversationUpdate: handleNewConversation,
    onNewMessage: handleNewMessage,
  })

  // State
  const [showContactPanel, setShowContactPanel] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [search, setSearch] = useState('')

  // Load conversations on mount and when organizationId changes
  useEffect(() => {
    console.log('🔄 Loading conversations for org:', organizationId)
    fetchConversations()
  }, [organizationId])

  // Load messages and contact when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
      if (selectedConversation.contact_id) {
        fetchContact(selectedConversation.contact_id)
        fetchOrders(selectedConversation.contact_id)
        fetchDeals(selectedConversation.contact_id)
      }
    } else {
      clearMessages()
      clearContact()
    }
  }, [selectedConversation?.id])

  // Handlers
  const handleSelectConversation = (conv: InboxConversation) => {
    selectConversation(conv)
    setMobileView('chat')
  }

  const handleBackToList = () => {
    setMobileView('list')
  }

  const handleSendMessage = async (content: string, type?: string) => {
    if (!selectedConversation) return
    
    await sendMessage({
      conversationId: selectedConversation.id,
      content,
      messageType: type as any || 'text',
    })
  }

  const handleToggleBot = async () => {
    if (!selectedConversation) return
    await toggleBot(selectedConversation.id, !selectedConversation.is_bot_active)
  }

  const handleFilterChange = (newFilters: ConversationFilters) => {
    setFilters(newFilters)
    fetchConversations(newFilters)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    fetchConversations({ ...filters, search: value })
  }

  // Filter conversations locally for instant feedback
  const filteredConversations = conversations.filter(conv => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      conv.contact_name?.toLowerCase().includes(searchLower) ||
      conv.phone_number?.includes(search)
    )
  })

  return (
    <div className="h-[calc(100vh-80px)] flex bg-dark-900/50 rounded-2xl border border-dark-700/50 overflow-hidden">
      {/* ========== CONVERSATION LIST ========== */}
      <div className={`
        w-full md:w-[360px] flex-shrink-0 border-r border-dark-700/50 flex flex-col bg-dark-900/30
        ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-dark-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Conversas</h2>
            <div className="flex gap-2">
              <button
                onClick={() => refreshConversations()}
                disabled={conversationsLoading}
                className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${conversationsLoading ? 'animate-spin' : ''}`} />
              </button>
              <button className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl 
                         text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 transition-colors"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'open', label: 'Abertas' },
              { id: 'pending', label: 'Pendentes' },
              { id: 'closed', label: 'Fechadas' },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => handleFilterChange({ ...filters, status: filter.id as any })}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  (filters.status || 'all') === filter.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedConversation?.id}
          isLoading={conversationsLoading}
          onSelect={handleSelectConversation}
        />
      </div>

      {/* ========== CHAT PANEL ========== */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}
      `}>
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            messages={messages}
            isLoading={messagesLoading}
            isSending={isSending}
            onSendMessage={handleSendMessage}
            onToggleBot={handleToggleBot}
            onBack={handleBackToList}
            onToggleContactPanel={() => setShowContactPanel(!showContactPanel)}
            showContactPanel={showContactPanel}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-dark-400">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm text-dark-500 mt-1">
              Escolha uma conversa da lista para começar
            </p>
          </div>
        )}
      </div>

      {/* ========== CONTACT PANEL ========== */}
      <AnimatePresence>
        {selectedConversation && showContactPanel && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:flex flex-shrink-0 border-l border-dark-700/50 bg-dark-900/30 overflow-hidden"
          >
            <ContactPanel
              contact={contact}
              notes={notes}
              activities={activities}
              orders={orders}
              cart={cart}
              activeDeal={activeDeal}
              deals={deals}
              isLoading={contactLoading}
              conversationId={selectedConversation.id}
              onUpdateContact={updateContact}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onAddNote={addNote}
              onBlockContact={blockContact}
              onUnblockContact={unblockContact}
              onCreateDeal={createDeal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
