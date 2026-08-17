'use client'

/**
 * INBOX CONTENT COMPONENT
 * 
 * Componente principal do Inbox que substitui o InboxTab antigo.
 * 
 * ✅ DIFERENÇAS CRÍTICAS DO InboxTab.tsx ANTIGO:
 * - Usa storeId para filtrar conversas por loja
 * - Refetch automático ao trocar de loja
 * - Verifica store_id nos callbacks de realtime
 * - Mensagem clara se não tiver loja selecionada
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore, useStoreStore } from '@/stores'
import { Search, RefreshCw, MessageSquare, AlertCircle } from 'lucide-react'

// Components
import { ConversationList } from '@/components/whatsapp/inbox/ConversationList'
import { ChatPanel } from '@/components/whatsapp/inbox/ChatPanel'
import { ContactPanel } from '@/components/whatsapp/inbox/ContactPanel'
import { ReactivateAiBanner } from '@/components/whatsapp/inbox/ReactivateAiBanner'
import WhatsAppConnectionManager from '@/components/whatsapp/inbox/WhatsAppConnectionManager'
import WhatsAppConnectUnified from '@/components/whatsapp/WhatsAppConnectUnified'

// Hooks
import { authedFetch } from '@/lib/api/authed-fetch'
import { useInboxConversations } from '@/hooks/useInboxConversations'
import { useInboxMessages } from '@/hooks/useInboxMessages'
import { useInboxContact } from '@/hooks/useInboxContact'
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnectionManager'
import { useCloudInboxRealtime, type AgentRunStepEvent } from '@/hooks/useCloudInboxRealtime'
import { isTerminalStep } from '@/components/whatsapp/inbox/AgentActivity'

// Types
import type { InboxConversation, InboxTask } from '@/types/inbox'

// Polling e FALLBACK: 5s quando o realtime esta caido, 30s quando o
// canal esta SUBSCRIBED (so pra pegar o que o realtime nao cobre, ex.
// conversas legacy provider=evolution).
const POLLING_INTERVAL_FALLBACK = 5000
const POLLING_INTERVAL_REALTIME = 30000

interface InboxContentProps {
  /** Altura customizada (default: calc(100vh - 4rem)) */
  height?: string
}

export default function InboxContent({ height = 'calc(100vh - 4rem)' }: InboxContentProps) {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  
  const organizationId = user?.organization_id || null
  const storeId = currentStore?.id || null // ✅ CRÍTICO: ID da loja atual

  // ✅ CORREÇÃO: Passar storeId para filtrar instâncias por loja
  const { 
    instances, 
    selectedInstance, 
    loading: instancesLoading, 
    selectInstance, 
    fetchInstances 
  } = useWhatsAppConnection(organizationId, storeId)
  
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showContactPanel, setShowContactPanel] = useState(true)

  // ✅ CORREÇÃO: Passar storeId para os hooks
  const {
    conversations, 
    selectedConversation, 
    isLoading: conversationsLoading,
    isRefreshing, // ✅ NOVO: polling silencioso (não mostra loader)
    filters,
    selectConversation,
    fetchConversations,
    toggleBot,
    setFilters,
    refresh: refreshConversations,
    markAsRead,
  } = useInboxConversations(organizationId, storeId)

  const {
    messages, 
    isLoading: messagesLoading, 
    isSending, 
    isUploading,
    fetchMessages, 
    sendMessage, 
    sendMedia, 
    addMessage, 
    updateMessageStatus, 
    clear: clearMessages, 
    refetchLatest,
  } = useInboxMessages()

  const {
    contact, 
    conversation: contactConversation, 
    notes, 
    activities, 
    orders, 
    cart, 
    activeDeal, 
    deals,
    tasks, 
    invoices, 
    comments, 
    isLoading: contactLoading, 
    fetchContact, 
    updateContact, 
    addTag, 
    removeTag,
    addNote, 
    deleteNote, 
    blockContact, 
    unblockContact, 
    fetchOrders, 
    fetchDeals, 
    createDeal, 
    assignConversation,
    toggleBot: toggleContactBot, 
    createTask, 
    completeTask, 
    deleteTask, 
    uploadInvoice, 
    deleteInvoice,
    addComment, 
    refreshContact, 
    clear: clearContact,
  } = useInboxContact()

  // =============================================
  // REALTIME CALLBACKS
  // =============================================
  
  const handleConversationInsert = useCallback((conv: any) => {
    // ✅ Filtro de loja no padrao "store-or-org" da API: descarta apenas
    // conversa de OUTRA loja; store_id NULL (orfa/legacy) e visivel.
    if (storeId && conv.store_id && conv.store_id !== storeId) {
      console.log('📥 [InboxContent] Ignoring conversation from different store')
      return
    }
    console.log('📥 [InboxContent] New conversation:', conv.id)
    refreshConversations()
  }, [refreshConversations, storeId])

  const handleConversationUpdate = useCallback((conv: any) => {
    if (storeId && conv.store_id && conv.store_id !== storeId) {
      return
    }
    console.log('📝 [InboxContent] Conversation update:', conv.id)
    // ⚠️ NAO usar updateConversation aqui: ela faz PUT na API — ecoar um
    // evento de realtime como write criaria loop UPDATE→PUT→UPDATE.
    // Refresh silencioso (isRefreshing, sem loader) traz o estado novo.
    refreshConversations()
  }, [refreshConversations, storeId])

  const handleNewMessage = useCallback((msg: any) => {
    console.log('📨 [InboxContent] New message:', msg.id)
    if (selectedConversation?.id === msg.conversation_id) {
      addMessage(msg)
      // Zerar o nao-lidas: markAsRead so rodava em selectConversation (ou
      // seja, no clique). Mensagem que chega com a conversa JA aberta
      // incrementava unread_count via RPC e ninguem zerava — o inbox marcava
      // "1 nao lida" numa conversa que o atendente esta lendo naquele instante.
      if (msg.direction === 'inbound') {
        markAsRead(msg.conversation_id)
      }
    }
    refreshConversations()
  }, [selectedConversation?.id, addMessage, refreshConversations, markAsRead])

  const handleStatusUpdate = useCallback((msg: any) => {
    console.log('✓ [InboxContent] Status update:', msg.id, '->', msg.status)
    if (msg.id && msg.status) {
      // Repassar delivered_at/read_at: o mapper ja os extrai da row, e sem isto
      // o hook fabricava o horario com o relogio do browser.
      updateMessageStatus(msg.id, msg.status, {
        deliveredAt: msg.delivered_at,
        readAt: msg.read_at,
      })
    }
  }, [updateMessageStatus])

  // ---- Progresso do agente na conversa aberta ----
  // Só recebe eventos ao vivo (nao ha fetch inicial): abrir a conversa no meio
  // de um run mostra o painel a partir do proximo passo.
  const [agentSteps, setAgentSteps] = useState<AgentRunStepEvent[]>([])

  const handleAgentStep = useCallback((s: AgentRunStepEvent) => {
    setAgentSteps(prev => {
      // Passo nao-terminal depois de um terminal = run novo: zera a trilha para
      // nao misturar duas execucoes no mesmo painel.
      const lastWasTerminal = prev.length > 0 && isTerminalStep(prev[prev.length - 1].step)
      const base = lastWasTerminal && !isTerminalStep(s.step) ? [] : prev
      if (base.some(p => p.id === s.id)) return base
      return [...base, s].slice(-12)
    })
  }, [])

  // Trocar de conversa nao deve carregar o progresso da anterior — e abrir
  // uma conversa CARREGA a trilha gravada (defeito 3 de 17/08: os passos
  // estao no banco, mas so o Realtime alimentava o painel e um refresh
  // zerava tudo). A carga inicial semeia; o Realtime segue dali.
  useEffect(() => {
    setAgentSteps([])
    const conversationId = selectedConversation?.id
    if (!conversationId) return
    let cancelled = false
    authedFetch(`/api/whatsapp/inbox/conversations/${conversationId}/ai-steps`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.steps) && d.steps.length > 0) {
          setAgentSteps(d.steps)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedConversation?.id])

  // Rede de seguranca do nao-lidas, cobrindo o caminho de POLLING: se o canal
  // de mensagens estiver caido, handleNewMessage nunca roda, mas a lista ainda
  // traz unread_count > 0 na conversa que esta aberta na tela. Zera de todo
  // jeito — badge de nao-lida no que o atendente esta lendo e sempre errado.
  useEffect(() => {
    if (!selectedConversation?.id) return
    const fresh = conversations.find((c) => c.id === selectedConversation.id)
    if (fresh && fresh.unread_count > 0) {
      markAsRead(fresh.id)
    }
  }, [conversations, selectedConversation?.id, markAsRead])

  // =============================================
  // REALTIME (Cloud API) — poll de 5s vira fallback
  // =============================================
  const { isConnected: realtimeConnected, channels: realtimeChannels } = useCloudInboxRealtime({
    organizationId,
    conversationId: selectedConversation?.id ?? null,
    onNewConversation: handleConversationInsert,
    onConversationUpdate: handleConversationUpdate,
    onNewMessage: handleNewMessage,
    onMessageUpdate: handleStatusUpdate,
    onAgentStep: handleAgentStep,
    enabled: Boolean(organizationId && storeId),
  })

  // Canal de mensagens caido com uma conversa aberta e o cenario que produz
  // "o cliente respondeu e a mensagem nao apareceu": a lista lateral atualiza
  // (canal de conversas vivo) e o corpo da conversa nao. Antes isso nao
  // aparecia em lugar nenhum — nem na UI, nem no console. O poll cai para 5s
  // sozinho (isConnected agora conta este canal); esta linha existe para dizer
  // QUAL canal caiu quando alguem for investigar.
  //
  // A dependencia e `realtimeChannels.messages` (string), NAO o objeto
  // `realtimeChannels`: o hook devolve um literal novo a cada render, entao
  // depender do objeto dispararia o aviso em todo render.
  const messagesChannelState = realtimeChannels.messages
  useEffect(() => {
    if (!selectedConversation?.id) return
    if (messagesChannelState === 'error') {
      console.warn(
        '[Inbox] canal de mensagens em erro — conversa aberta atualiza so por polling (5s).',
        { conversationId: selectedConversation.id },
      )
    }
  }, [messagesChannelState, selectedConversation?.id])

  // =============================================
  // EFFECTS
  // =============================================
  
  // ✅ CORREÇÃO: Refetch quando trocar de loja
  useEffect(() => {
    if (storeId) {
      console.log('🏪 [InboxContent] Store changed to:', storeId)
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
        fetchContact(contactId, selectedConversation.id)
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

    // Realtime conectado => poll relaxa pra 30s (fallback + legacy).
    // Canal caido/erro => volta pros 5s originais.
    const interval = realtimeConnected
      ? POLLING_INTERVAL_REALTIME
      : POLLING_INTERVAL_FALLBACK

    pollingRef.current = setInterval(() => {
      if (selectedConversation) {
        refetchLatest()
      }
      refreshConversations()
    }, interval)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [selectedConversation?.id, refetchLatest, refreshConversations, realtimeConnected])

  // =============================================
  // HANDLERS
  // =============================================

  // Onda 10 — quando guard retorna OPTED_OUT_OVERRIDABLE, pergunta razao
  // ao atendente e re-tenta com override. Marketing nao e overridable.
  const handleOptOutDialog = (signal: { overridable: boolean; opted_out_at?: string | null; opt_out_reason?: string | null }) => {
    if (!signal.overridable) {
      window.alert(
        `Contato optou por sair${signal.opted_out_at ? ' em ' + new Date(signal.opted_out_at).toLocaleDateString() : ''}. Esta categoria nao permite envio mesmo com override.`,
      )
      return null
    }
    const when = signal.opted_out_at ? new Date(signal.opted_out_at).toLocaleString() : 'data desconhecida'
    const reason = signal.opt_out_reason ? ` (motivo: "${signal.opt_out_reason}")` : ''
    const proceed = window.confirm(
      `Contato optou por sair em ${when}${reason}. Deseja enviar mesmo assim?`,
    )
    if (!proceed) return null
    const overrideReason = window.prompt('Justificativa do envio (obrigatorio para auditoria):')
    if (!overrideReason || !overrideReason.trim()) return null
    return overrideReason.trim()
  }

  const handleSendMessage = async (content: string) => {
    if (!selectedInstance || !selectedConversation) return
    const result = await sendMessage({
      conversationId: selectedConversation.id,
      content,
    })
    if (result && 'optedOut' in result && result.optedOut) {
      const overrideReason = handleOptOutDialog(result)
      if (overrideReason) {
        await sendMessage({
          conversationId: selectedConversation.id,
          content,
          override: { reason: overrideReason },
        })
      }
    }
  }

  const handleSendMedia = async (file: File, mediaType: string, caption?: string) => {
    if (!selectedInstance || !selectedConversation) return

    const result = await sendMedia({
      conversationId: selectedConversation.id,
      file,
      mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
      caption,
    })
    if (result && 'optedOut' in result && result.optedOut) {
      const overrideReason = handleOptOutDialog(result)
      if (overrideReason) {
        await sendMedia({
          conversationId: selectedConversation.id,
          file,
          mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
          caption,
          override: { reason: overrideReason },
        })
      }
    }
  }

  // NOVO: Função para tentar reenviar mensagem falha
  const handleRetryMessage = async (message: any) => {
    if (!selectedConversation || !message.content) return
    await sendMessage({
      conversationId: selectedConversation.id,
      content: message.content,
      messageType: message.message_type || 'text',
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

  // ✅ Wrappers para corrigir tipos TypeScript
  const handleCreateTask = async (contactId: string, task: Partial<InboxTask>): Promise<void> => {
    await createTask(contactId, task)
  }

  const handleUploadInvoice = async (data: FormData): Promise<void> => {
    if (!contact?.id) return
    await uploadInvoice(contact.id, data)
  }

  const handleRefreshContact = (): void => {
    if (contact?.id && selectedConversation?.id) {
      refreshContact(contact.id, selectedConversation.id)
    }
  }

  // =============================================
  // RENDER
  // =============================================
  
  // ✅ NOVO: Mensagem se não tiver loja selecionada
  if (!organizationId || !storeId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {!organizationId ? 'Carregando…' : 'Selecione uma loja'}
          </h2>
          <p className="text-gray-500">
            {!organizationId
              ? 'Aguardando dados da organização.'
              : 'Escolha uma loja no menu para ver as conversas do WhatsApp.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex bg-gray-50 overflow-hidden min-h-0" style={{ height }}>
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
            storeId={storeId}
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
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-dark-500 focus:outline-none focus:border-primary-500"
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>

        {/* Banner: religar IA pausada por causa automática (Onda 13) */}
        <ReactivateAiBanner onReactivated={refreshConversations} />

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {/* ✅ CORREÇÃO: Só mostra spinner na PRIMEIRA carga (lista vazia) */}
          {conversationsLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-primary-500 animate-spin" />
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
            onRetryMessage={handleRetryMessage}
            organizationId={organizationId}
            agentSteps={agentSteps}
            currentAgentId={user?.id}
            currentAgentName={user?.email || user?.id}
            onResolved={() => {
              selectConversation(null)
              refreshConversations()
            }}
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
        <div className="w-80 flex-shrink-0 border-l border-gray-200 overflow-y-auto">
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
            organizationId={organizationId}
            lastInboundMessage={messages.filter((m: any) => m.direction === 'inbound' && m.content).slice(-1)[0]?.content}
            onInsertCopilotSuggestion={(text: string) => {
              // Copy to clipboard as fallback; ChatPanel will pick it up via paste
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => {})
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
