'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/stores'
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
import { useWhatsAppRealtime } from '@/hooks/useWhatsAppRealtime'
import { useWhatsAppConnection, type WhatsAppInstance } from '@/hooks/useWhatsAppConnectionManager'

// Types
import type { InboxConversation, ConversationFilters } from '@/types/inbox'

const POLLING_INTERVAL = 5000

export default function InboxPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || 'default-org'
  
  // WhatsApp Connection
  const { instances, selectedInstance, loading: instancesLoading, selectInstance, fetchInstances } = useWhatsAppConnection(organizationId)
  const [showConnectModal, setShowConnectModal] = useState(false)

  // Inbox Hooks
  const {
    conversations, selectedConversation, isLoading: conversationsLoading, filters,
    selectConversation, fetchConversations, updateConversation, toggleBot, setFilters, refresh: refreshConversations,
  } = useInboxConversations(organizationId)

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
    console.log('📥 [Inbox] New conversation:', conv.id)
    refreshConversations()
  }, [refreshConversations])

  const handleConversationUpdate = useCallback((conv: any) => {
    console.log('📝 [Inbox] Conversation update:', conv.id)
    updateConversation(conv.id, conv)
  }, [updateConversation])

  const handleNewMessage = useCallback((msg: any) => {
    console.log('📨 [Inbox] New message:', msg.id)
    if (selectedConversation?.id === msg.conversation_id) {
      addMessage(msg)
    }
    refreshConversations()
  }, [selectedConversation?.id, addMessage, refreshConversations])

  // ✅ CORREÇÃO: Conectar status updates
  const handleStatusUpdate = useCallback((msg: any) => {
    console.log('✓ [Inbox] Status update:', msg.id, '->', msg.status)
    if (msg.id && msg.status) {
      updateMessageStatus(msg.id, msg.status)
    }
  }, [updateMessageStatus])

  // Realtime Hook
  const { isConnected, reconnect } = useWhatsAppRealtime({
    organizationId,
    conversationId: selectedConversation?.id,
    onConversationInsert: handleConversationInsert,
    onConversationUpdate: handleConversationUpdate,
    onNewMessage: handleNewMessage,
    onStatusUpdate: handleStatusUpdate,
    enabled: true,
  })

  // =============================================
  // ✅ CORREÇÃO: POLLING FALLBACK
  // =============================================
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    // Polling quando realtime desconectado
    if (selectedConversation && !isConnected) {
      console.log('[Inbox] Starting polling (realtime disconnected)')
      pollingRef.current = setInterval(() => {
        refetchLatest()
      }, POLLING_INTERVAL)
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [selectedConversation?.id, isConnected, refetchLatest])

  // State
  const [showContactPanel, setShowContactPanel] = useState(true)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [search, setSearch] = useState('')

  // Effects
  useEffect(() => { fetchConversations() }, [organizationId])
  
  useEffect(() => {
    if (selectedInstance) refreshConversations()
  }, [selectedInstance?.id, refreshConversations])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
      if (selectedConversation.contact_id) {
        fetchContact(selectedConversation.contact_id, selectedConversation.id)
        fetchOrders(selectedConversation.contact_id)
        fetchDeals(selectedConversation.contact_id)
      }
    } else {
      clearMessages()
      clearContact()
    }
  }, [selectedConversation?.id])

  // Handlers
  const handleConnectionSuccess = () => { fetchInstances(); setShowConnectModal(false) }
  const handleInstanceSelect = (instance: WhatsAppInstance | null) => { selectInstance(instance); if (instance) refreshConversations() }
  const handleSelectConversation = (conv: InboxConversation) => { selectConversation(conv); setMobileView('chat') }
  const handleBackToList = () => setMobileView('list')

  const handleSendMessage = async (content: string, type?: string) => {
    if (!selectedConversation) return
    await sendMessage({ conversationId: selectedConversation.id, content, messageType: type as any || 'text' })
  }

  const handleSendMedia = async (file: File, mediaType: string, caption?: string) => {
    if (!selectedConversation) return
    await sendMedia({
      conversationId: selectedConversation.id, file,
      mediaType: mediaType as 'image' | 'video' | 'audio' | 'document', caption,
    })
  }

  const handleToggleBot = async () => {
    if (!selectedConversation) return
    await toggleBot(selectedConversation.id, !selectedConversation.is_bot_active)
  }

  const handleFilterChange = (newFilters: ConversationFilters) => { setFilters(newFilters); fetchConversations(newFilters) }
  const handleSearch = (value: string) => { setSearch(value); fetchConversations({ ...filters, search: value }) }

  // Contact handlers
  const handleAssignConversation = async (userId: string) => { if (selectedConversation?.id) await assignConversation(selectedConversation.id, userId) }
  const handleContactToggleBot = async (enabled: boolean) => { if (selectedConversation?.id) await toggleContactBot(selectedConversation.id, enabled) }
  const handleCreateTask = async (data: any) => { if (contact?.id) await createTask(contact.id, data) }
  const handleRefreshContact = async () => { if (contact?.id && selectedConversation?.id) await refreshContact(contact.id, selectedConversation.id) }
  const handleUploadInvoice = async (data: FormData): Promise<void> => { if (contact?.id) await uploadInvoice(contact.id, data) }

  const filteredConversations = conversations.filter(conv => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return conv.contact_name?.toLowerCase().includes(searchLower) || conv.phone_number?.includes(search)
  })

  const hasConnectedInstance = instances.some(i => i.status === 'ACTIVE' || i.status === 'connected')

  return (
    <>
      <WhatsAppConnectUnified isOpen={showConnectModal} onClose={() => setShowConnectModal(false)}
        onSuccess={handleConnectionSuccess} organizationId={organizationId} />

      <div className="h-[calc(100vh-80px)] flex bg-dark-900/50 rounded-2xl border border-dark-700/50 overflow-hidden">
        {/* Conversation List */}
        <div className={`w-full md:w-[360px] flex-shrink-0 border-r border-dark-700/50 flex flex-col bg-dark-900/30 ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-dark-700/50">
            <div className="mb-4">
              <WhatsAppConnectionManager organizationId={organizationId} selectedInstance={selectedInstance}
                onSelectInstance={handleInstanceSelect} onConnectClick={() => setShowConnectModal(true)} />
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">Conversas</h2>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {isConnected ? <><Wifi className="w-3 h-3" /> Live</> : <><WifiOff className="w-3 h-3" /> Polling</>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => refreshConversations()} disabled={conversationsLoading}
                  className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white disabled:opacity-50">
                  <RefreshCw className={`w-5 h-5 ${conversationsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input type="text" placeholder="Buscar por nome ou telefone..." value={search} onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50" />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {[{ id: 'all', label: 'Todas' }, { id: 'open', label: 'Abertas' }, { id: 'pending', label: 'Pendentes' }, { id: 'closed', label: 'Fechadas' }].map((filter) => (
                <button key={filter.id} onClick={() => handleFilterChange({ ...filters, status: filter.id as any })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${(filters.status || 'all') === filter.id ? 'bg-primary-500 text-white' : 'bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-700/50'}`}>
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {!hasConnectedInstance && !instancesLoading && (
            <div className="p-4 mx-4 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">WhatsApp não conectado</p>
                  <button onClick={() => setShowConnectModal(true)} className="mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium">
                    Conectar agora →
                  </button>
                </div>
              </div>
            </div>
          )}

          <ConversationList conversations={filteredConversations} selectedId={selectedConversation?.id}
            isLoading={conversationsLoading} onSelect={handleSelectConversation} />
        </div>

        {/* Chat Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          {selectedConversation ? (
            <ChatPanel
              conversation={selectedConversation} messages={messages} isLoading={messagesLoading}
              isSending={isSending} isUploading={isUploading}
              onSendMessage={handleSendMessage} onSendMedia={handleSendMedia}
              onToggleBot={handleToggleBot} onBack={handleBackToList}
              onToggleContactPanel={() => setShowContactPanel(!showContactPanel)} showContactPanel={showContactPanel}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-dark-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
            </div>
          )}
        </div>

        {/* Contact Panel */}
        <AnimatePresence>
          {selectedConversation && showContactPanel && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="hidden lg:flex flex-shrink-0 border-l border-dark-700/50 bg-dark-900/30 overflow-hidden">
              <ContactPanel
                contact={contact} conversation={contactConversation || selectedConversation}
                notes={notes} activities={activities} orders={orders} cart={cart}
                activeDeal={activeDeal} deals={deals} tasks={tasks} invoices={invoices} comments={comments}
                isLoading={contactLoading} conversationId={selectedConversation.id}
                onUpdateContact={updateContact} onAddTag={addTag} onRemoveTag={removeTag}
                onAddNote={addNote} onDeleteNote={deleteNote} onBlockContact={blockContact}
                onUnblockContact={unblockContact} onCreateDeal={createDeal}
                onAssignConversation={handleAssignConversation} onToggleBot={handleContactToggleBot}
                onCreateTask={handleCreateTask} onCompleteTask={completeTask} onDeleteTask={deleteTask}
                onUploadInvoice={handleUploadInvoice} onDeleteInvoice={deleteInvoice}
                onAddComment={addComment} onRefreshContact={handleRefreshContact}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
