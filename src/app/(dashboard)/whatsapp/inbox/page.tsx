'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useStoreStore } from '@/stores'
import { Search, RefreshCw, Plus, MessageSquare, AlertCircle, Wifi, WifiOff } from 'lucide-react'

// Components
import { ConversationList } from '@/components/whatsapp/inbox/ConversationList'
import { ChatPanel } from '@/components/whatsapp/inbox/ChatPanel'
import { ContactPanel } from '@/components/whatsapp/inbox/ContactPanel'
import WhatsAppConnectionManager from '@/components/whatsapp/inbox/WhatsAppConnectionManager'
import WhatsAppConnectUnified from '@/components/whatsapp/WhatsAppConnectUnified'

// Hooks
import { useInboxConversations } from '@/hooks/useInboxConversations'
import { useInboxMessages } from '@/hooks/useInboxMessages'
import { useInboxContact } from '@/hooks/useInboxContact'
import { useWhatsAppConnection, type WhatsAppInstance } from '@/hooks/useWhatsAppConnectionManager'

// Types
import type { InboxConversation, ConversationFilters, InboxTask } from '@/types/inbox'

const POLLING_INTERVAL = 5000

export default function InboxPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore() // ✅ NOVO: Pegar loja atual
  
  const organizationId = user?.organization_id || 'default-org'
  const storeId = currentStore?.id || null // ✅ CRÍTICO: ID da loja atual
  
  // ✅ CORREÇÃO: Passar storeId para filtrar instâncias por loja
  const { instances, selectedInstance, loading: instancesLoading, selectInstance, fetchInstances } = useWhatsAppConnection(organizationId, storeId)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showContactPanel, setShowContactPanel] = useState(true)

  // ✅ CORREÇÃO: Passar storeId para os hooks
  const {
    conversations, selectedConversation, isLoading: conversationsLoading, isRefreshing, filters,
    selectConversation, fetchConversations, updateConversation, toggleBot, setFilters, refresh: refreshConversations,
  } = useInboxConversations(organizationId, storeId)

  const {
    messages, isLoading: messagesLoading, isSending, isUploading,
    fetchMessages, sendMessage, sendMedia, addMessage, updateMessageStatus, clear: clearMessages, refetchLatest,
  } = useInboxMessages()

  const {
    contact, conversation: contactConversation, notes, activities, orders, cart, activeDeal, deals,
    tasks, invoices, comments, isLoading: contactLoading, fetchContact, updateContact, addTag, removeTag,
    addNote, deleteNote, blockContact, unblockContact, fetchOrders, fetchDeals, createDeal, assignConversation,
    toggleBot: toggleContactBot, createTask, completeTask, deleteTask, uploadInvoice, deleteInvoice,
    addComment, refreshContact, clear: clearContact,
  } = useInboxContact()

  // =============================================
  // REALTIME CALLBACKS
  // =============================================
  const handleConversationInsert = useCallback((conv: any) => {
    // ✅ CRÍTICO: Verificar se conversa pertence à loja atual
    if (storeId && conv.store_id !== storeId) {
      console.log('📥 [Inbox] Ignoring conversation from different store')
      return
    }
    console.log('📥 [Inbox] New conversation:', conv.id)
    refreshConversations()
  }, [refreshConversations, storeId])

  const handleConversationUpdate = useCallback((conv: any) => {
    // ✅ CRÍTICO: Verificar se conversa pertence à loja atual
    if (storeId && conv.store_id !== storeId) {
      return
    }
    console.log('📝 [Inbox] Conversation update:', conv.id)
    updateConversation(conv.id, conv)
  }, [updateConversation, storeId])

  const handleNewMessage = useCallback((msg: any) => {
    console.log('📨 [Inbox] New message:', msg.id)
    if (selectedConversation?.id === msg.conversation_id) {
      addMessage(msg)
    }
    refreshConversations()
  }, [selectedConversation?.id, addMessage, refreshConversations])

  const handleStatusUpdate = useCallback((msg: any) => {
    console.log('✓ [Inbox] Status update:', msg.id, '->', msg.status)
    if (msg.id && msg.status) {
      updateMessageStatus(msg.id, msg.status)
    }
  }, [updateMessageStatus])

  // =============================================
  // REALTIME SUBSCRIPTIONS
  // =============================================
  // =============================================
  // REALTIME via POLLING (mais confiável)
  // O polling já está implementado abaixo e funciona bem
  // =============================================

  // =============================================
  // EFFECTS
  // =============================================
  
  // ✅ CORREÇÃO: Refetch quando trocar de loja
  useEffect(() => {
    if (storeId) {
      console.log('🏪 [Inbox] Store changed to:', storeId)
      fetchConversations()
      fetchInstances()
    }
  }, [storeId])

  // Fetch conversations on mount
  useEffect(() => { 
    if (organizationId && storeId) {
      fetchConversations() 
    }
  }, [organizationId, storeId])

  // Fetch messages when conversation selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
      
      // Fetch contact se tiver contact_id ou unified_contact_id
      const contactId = selectedConversation.unified_contact_id || selectedConversation.contact_id
      if (contactId) {
        fetchContact(contactId, organizationId)
      }
    } else {
      clearMessages()
      clearContact()
    }
  }, [selectedConversation?.id])

  // Polling fallback
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    pollingRef.current = setInterval(() => {
      if (selectedConversation) {
        refetchLatest()
      }
      refreshConversations()
    }, POLLING_INTERVAL)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [selectedConversation?.id, refetchLatest, refreshConversations])

  // =============================================
  // HANDLERS
  // =============================================

  const handleSendMessage = async (content: string) => {
    if (!selectedInstance || !selectedConversation) return
    await sendMessage({
      conversationId: selectedConversation.id,
      content,
    })
  }

  const handleSendMedia = async (file: File, mediaType: string, caption?: string) => {
    if (!selectedInstance || !selectedConversation) return
    
    await sendMedia({
      conversationId: selectedConversation.id,
      file,
      mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
      caption,
    })
  }

  const handleToggleBot = async (conversationId: string, isActive: boolean) => {
    await toggleBot(conversationId, isActive)
  }

  // Wrapper para ChatPanel que não recebe argumentos
  const handleChatToggleBot = async () => {
    if (!selectedConversation) return
    await toggleBot(selectedConversation.id, !selectedConversation.is_bot_active)
  }

  const handleContactToggleBot = async (isActive: boolean) => {
    if (!selectedConversation) return
    await toggleBot(selectedConversation.id, isActive)
  }

  const handleBack = () => {
    selectConversation(null)
  }

  const handleToggleContactPanel = () => {
    setShowContactPanel(prev => !prev)
  }

  const handleConnectionSuccess = () => {
    setShowConnectModal(false)
    fetchInstances()
  }

  // ✅ FASE 1: Wrappers para corrigir tipos TypeScript
  // ContactPanel espera Promise<void>, mas hook retorna Promise<InboxTask | null>
  const handleCreateTask = async (contactId: string, task: Partial<InboxTask>): Promise<void> => {
    await createTask(contactId, task)
  }

  // ContactPanel espera (data: FormData), mas hook recebe (contactId, data)
  const handleUploadInvoice = async (data: FormData): Promise<void> => {
    if (!contact?.id) return
    await uploadInvoice(contact.id, data)
  }

  // ContactPanel espera () => void, mas hook recebe (contactId, conversationId?)
  const handleRefreshContact = (): void => {
    if (contact?.id && selectedConversation?.id) {
      refreshContact(contact.id, selectedConversation.id)
    }
  }

  // =============================================
  // RENDER
  // =============================================
  
  // ✅ NOVO: Mensagem se não tiver loja selecionada
  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Selecione uma loja</h2>
          <p className="text-gray-500">Escolha uma loja no menu para ver as conversas do WhatsApp.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden min-h-0">
      {/* Connect Modal */}
      <AnimatePresence>
        {showConnectModal && (
          <WhatsAppConnectUnified
            isOpen={showConnectModal}
            onClose={() => setShowConnectModal(false)}
            onSuccess={handleConnectionSuccess} 
            organizationId={organizationId}
          />
        )}
      </AnimatePresence>

      {/* Left Panel - Connection Manager + Conversations */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        {/* Connection Manager */}
        <div className="p-3 border-b border-gray-200">
          <WhatsAppConnectionManager
            organizationId={organizationId}
            storeId={storeId} // ✅ NOVO: Passar storeId
            selectedInstance={selectedInstance}
            onSelectInstance={selectInstance}
            onConnectClick={() => setShowConnectModal(true)}
          />
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar conversas..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {/* ✅ CORREÇÃO: Só mostra spinner na PRIMEIRA carga (lista vazia) */}
          {conversationsLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <MessageSquare className="w-8 h-8 mb-2" />
              <p className="text-sm">Nenhuma conversa</p>
              <p className="text-xs mt-1">para esta loja</p>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversation?.id}
              isLoading={false} // ✅ Nunca mostrar loading interno após primeira carga
              onSelect={selectConversation}
            />
          )}
        </div>
      </div>

      {/* Center Panel - Chat */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selectedConversation ? (
          <ChatPanel
            conversation={selectedConversation}
            messages={messages}
            isLoading={messagesLoading}
            isSending={isSending}
            isUploading={isUploading}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onToggleBot={handleChatToggleBot}
            onBack={handleBack}
            onToggleContactPanel={handleToggleContactPanel}
            showContactPanel={showContactPanel}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Selecione uma conversa</p>
              <p className="text-sm mt-1">para começar a conversar</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Contact Details */}
      {selectedConversation && showContactPanel && (
        <div className="w-80 lg:w-[380px] flex-shrink-0 border-l border-gray-200 overflow-hidden">
          <ContactPanel
            contact={contact}
            conversation={contactConversation || selectedConversation}
            notes={notes}
            activities={activities}
            orders={orders}
            cart={cart}
            activeDeal={activeDeal}
            deals={deals}
            tasks={tasks}
            invoices={invoices}
            comments={comments}
            isLoading={contactLoading}
            conversationId={selectedConversation.id}
            onUpdateContact={updateContact}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onAddNote={addNote}
            onDeleteNote={deleteNote}
            onBlockContact={blockContact}
            onUnblockContact={unblockContact}
            onCreateDeal={createDeal}
            onAssignConversation={assignConversation}
            onToggleBot={handleToggleBot}
            onCreateTask={handleCreateTask}
            onCompleteTask={completeTask}
            onDeleteTask={deleteTask}
            onUploadInvoice={handleUploadInvoice}
            onDeleteInvoice={deleteInvoice}
            onAddComment={addComment}
            onRefreshContact={handleRefreshContact}
          />
        </div>
      )}
    </div>
  )
}
