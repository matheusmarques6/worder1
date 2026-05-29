// src/hooks/useInboxContact.ts
// VERSÃO CORRIGIDA - Limpa dados ao mudar de contato
import { useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores'
import { authedFetch } from '@/lib/api/authed-fetch'
import type { 
  InboxContact, 
  InboxNote, 
  InboxActivity, 
  InboxOrder, 
  InboxCart,
  InboxDeal,
  InboxTask,
  InboxInvoice,
  InboxComment,
  InboxConversation,
} from '@/types/inbox'

interface UseInboxContactReturn {
  contact: InboxContact | null
  conversation: InboxConversation | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
  tasks: InboxTask[]
  invoices: InboxInvoice[]
  comments: InboxComment[]
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchContact: (contactId: string, conversationId?: string) => Promise<void>
  updateContact: (contactId: string, updates: Partial<InboxContact>) => Promise<void>
  addTag: (contactId: string, tag: string) => Promise<void>
  removeTag: (contactId: string, tag: string) => Promise<void>
  addNote: (contactId: string, content: string, conversationId?: string, attachments?: any[]) => Promise<void>
  deleteNote: (contactId: string, noteId: string) => Promise<void>
  blockContact: (contactId: string, reason?: string) => Promise<void>
  unblockContact: (contactId: string) => Promise<void>
  fetchOrders: (contactId: string) => Promise<void>
  fetchDeals: (contactId: string) => Promise<void>
  createDeal: (contactId: string, params: CreateDealParams) => Promise<InboxDeal | null>
  // Novas actions
  assignConversation: (conversationId: string, userId: string | null) => Promise<void>
  toggleBot: (conversationId: string, active: boolean) => Promise<void>
  fetchTasks: (contactId: string) => Promise<void>
  createTask: (contactId: string, task: Partial<InboxTask>) => Promise<InboxTask | null>
  completeTask: (taskId: string, outcome?: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  fetchInvoices: (contactId: string) => Promise<void>
  uploadInvoice: (contactId: string, data: FormData) => Promise<void>
  deleteInvoice: (invoiceId: string) => Promise<void>
  addComment: (contactId: string, content: string, type?: string, mentions?: string[]) => Promise<void>
  refreshContact: (contactId: string, conversationId?: string) => Promise<void>
  clear: () => void
}

interface CreateDealParams {
  pipelineId: string
  stageId: string
  title?: string
  value?: number
}

export function useInboxContact(): UseInboxContactReturn {
  const { user } = useAuthStore()
  const [contact, setContact] = useState<InboxContact | null>(null)
  const [conversation, setConversation] = useState<InboxConversation | null>(null)
  const [notes, setNotes] = useState<InboxNote[]>([])
  const [activities, setActivities] = useState<InboxActivity[]>([])
  const [orders, setOrders] = useState<InboxOrder[]>([])
  const [cart, setCart] = useState<InboxCart | null>(null)
  const [activeDeal, setActiveDeal] = useState<InboxDeal | null>(null)
  const [deals, setDeals] = useState<InboxDeal[]>([])
  const [tasks, setTasks] = useState<InboxTask[]>([])
  const [invoices, setInvoices] = useState<InboxInvoice[]>([])
  const [comments, setComments] = useState<InboxComment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref para controlar qual contato está sendo carregado (evita race conditions)
  const currentContactIdRef = useRef<string | null>(null)

  // CORREÇÃO: Limpar todos os dados antes de carregar novo contato
  const clearAllData = useCallback(() => {
    setContact(null)
    setConversation(null)
    setNotes([])
    setActivities([])
    setOrders([])
    setCart(null)
    setActiveDeal(null)
    setDeals([])
    setTasks([])
    setInvoices([])
    setComments([])
  }, [])

  const fetchContact = useCallback(async (contactId: string, conversationId?: string) => {
    // CORREÇÃO: Salvar o ID atual para verificar depois
    currentContactIdRef.current = contactId
    
    // CORREÇÃO: Limpar dados ANTES de começar a buscar
    clearAllData()
    
    setIsLoading(true)
    setError(null)

    try {
      // Buscar contato
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}`)
      const data = await response.json()

      // CORREÇÃO: Verificar se ainda é o contato que queremos (evita race condition)
      if (currentContactIdRef.current !== contactId) {
        console.log('⚠️ Contact changed during fetch, ignoring response')
        return
      }

      if (!response.ok) throw new Error(data.error || 'Failed to fetch contact')

      setContact(data.contact)
      setNotes(data.notes || [])
      setActivities(data.activities || [])
      setDeals(data.deals || [])
      setTasks(data.tasks || [])
      setInvoices(data.invoices || [])
      setComments(data.comments || [])
      
      const openDeals = (data.deals || []).filter((d: InboxDeal) => d.status === 'open')
      setActiveDeal(openDeals[0] || null)

      // Buscar conversa se tiver conversationId
      if (conversationId) {
        const convResponse = await authedFetch(`/api/whatsapp/inbox/conversations/${conversationId}`)
        if (convResponse.ok && currentContactIdRef.current === contactId) {
          const convData = await convResponse.json()
          setConversation(convData.conversation || convData)
        }
      }

      // Buscar pedidos separadamente
      if (data.contact?.phone_number && currentContactIdRef.current === contactId) {
        fetchOrders(contactId)
      }
    } catch (err) {
      if (currentContactIdRef.current === contactId) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      if (currentContactIdRef.current === contactId) {
        setIsLoading(false)
      }
    }
  }, [clearAllData])

  const refreshContact = useCallback(async (contactId: string, conversationId?: string) => {
    // CORREÇÃO: Verificar se é o mesmo contato atual
    if (currentContactIdRef.current !== contactId) {
      return fetchContact(contactId, conversationId)
    }

    try {
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}`)
      const data = await response.json()

      if (response.ok && currentContactIdRef.current === contactId) {
        setContact(data.contact)
        setNotes(data.notes || [])
        setActivities(data.activities || [])
        setDeals(data.deals || [])
        setTasks(data.tasks || [])
        setInvoices(data.invoices || [])
        setComments(data.comments || [])
        
        const openDeals = (data.deals || []).filter((d: InboxDeal) => d.status === 'open')
        setActiveDeal(openDeals[0] || null)
      }

      if (conversationId && currentContactIdRef.current === contactId) {
        const convResponse = await authedFetch(`/api/whatsapp/inbox/conversations/${conversationId}`)
        if (convResponse.ok) {
          const convData = await convResponse.json()
          setConversation(convData.conversation || convData)
        }
      }
    } catch (err) {
      console.error('Error refreshing contact:', err)
    }
  }, [fetchContact])

  const updateContact = useCallback(async (contactId: string, updates: Partial<InboxContact>) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })

    if (!response.ok) throw new Error('Failed to update contact')

    const { contact: updated } = await response.json()
    
    // CORREÇÃO: Só atualizar se ainda é o mesmo contato
    if (currentContactIdRef.current === contactId) {
      setContact(prev => prev ? { ...prev, ...updated } : null)
    }
  }, [])

  const addTag = useCallback(async (contactId: string, tag: string) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, action: 'add' })
    })

    if (!response.ok) throw new Error('Failed to add tag')

    const { contact: updated } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setContact(prev => prev ? { ...prev, tags: updated.tags } : null)
    }
  }, [])

  const removeTag = useCallback(async (contactId: string, tag: string) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, action: 'remove' })
    })

    if (!response.ok) throw new Error('Failed to remove tag')

    const { contact: updated } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setContact(prev => prev ? { ...prev, tags: updated.tags } : null)
    }
  }, [])

  const addNote = useCallback(async (
    contactId: string, 
    content: string, 
    conversationId?: string,
    attachments?: any[]
  ) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content, 
        conversation_id: conversationId,
        attachments: attachments || []
      })
    })

    if (!response.ok) throw new Error('Failed to add note')

    const { note } = await response.json()
    
    // CORREÇÃO: Só adicionar se ainda é o mesmo contato
    if (currentContactIdRef.current === contactId) {
      setNotes(prev => [note, ...prev])
    }
  }, [])

  const deleteNote = useCallback(async (contactId: string, noteId: string) => {
    const response = await authedFetch(
      `/api/whatsapp/inbox/contacts/${contactId}/notes?note_id=${noteId}`,
      { method: 'DELETE' }
    )

    if (!response.ok) throw new Error('Failed to delete note')

    // CORREÇÃO: Só remover se ainda é o mesmo contato
    if (currentContactIdRef.current === contactId) {
      setNotes(prev => prev.filter(n => n.id !== noteId))
    }
  }, [])

  const blockContact = useCallback(async (contactId: string, reason?: string) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: true, reason })
    })

    if (!response.ok) throw new Error('Failed to block contact')

    if (currentContactIdRef.current === contactId) {
      setContact(prev => prev ? { ...prev, is_blocked: true, blocked_reason: reason } : null)
    }
  }, [])

  const unblockContact = useCallback(async (contactId: string) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: false })
    })

    if (!response.ok) throw new Error('Failed to unblock contact')

    if (currentContactIdRef.current === contactId) {
      setContact(prev => prev ? { ...prev, is_blocked: false, blocked_reason: undefined } : null)
    }
  }, [])

  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const response = await authedFetch(`/api/whatsapp/inbox/conversations/${conversationId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    })

    if (!response.ok) throw new Error('Failed to assign conversation')

    const { conversation: updated } = await response.json()
    setConversation(prev => prev ? { ...prev, ...updated } : null)
  }, [])

  const toggleBot = useCallback(async (conversationId: string, active: boolean) => {
    const response = await authedFetch(`/api/whatsapp/inbox/conversations/${conversationId}/bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_bot_active: active })
    })

    if (!response.ok) throw new Error('Failed to toggle bot')

    setConversation(prev => prev ? { ...prev, is_bot_active: active } : null)
  }, [])

  const fetchOrders = useCallback(async (contactId: string) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/orders`)
      const data = await response.json()

      if (response.ok && currentContactIdRef.current === contactId) {
        setOrders(data.orders || [])
        setCart(data.cart || null)
      }
    } catch (err) {
      console.error('Error fetching orders:', err)
    }
  }, [])

  const fetchDeals = useCallback(async (contactId: string) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/deals`)
      const data = await response.json()

      if (response.ok && currentContactIdRef.current === contactId) {
        setActiveDeal(data.activeDeal || null)
        setDeals(data.deals || [])
      }
    } catch (err) {
      console.error('Error fetching deals:', err)
    }
  }, [])

  const createDeal = useCallback(async (contactId: string, params: CreateDealParams): Promise<InboxDeal | null> => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    if (!response.ok) throw new Error('Failed to create deal')

    const { deal } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setActiveDeal(deal)
      setDeals(prev => [deal, ...prev])
    }
    
    return deal
  }, [])

  const fetchTasks = useCallback(async (contactId: string) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/tasks`)
      const data = await response.json()

      if (response.ok && currentContactIdRef.current === contactId) {
        setTasks(data.tasks || [])
      }
    } catch (err) {
      console.error('Error fetching tasks:', err)
    }
  }, [])

  const createTask = useCallback(async (contactId: string, task: Partial<InboxTask>): Promise<InboxTask | null> => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    })

    if (!response.ok) throw new Error('Failed to create task')

    const { task: newTask } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setTasks(prev => [newTask, ...prev])
    }
    
    return newTask
  }, [])

  const completeTask = useCallback(async (taskId: string, outcome?: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: 'completed',
        outcome,
        completed_at: new Date().toISOString()
      })
    })

    if (!response.ok) throw new Error('Failed to complete task')

    setTasks(prev => prev.map(t => 
      t.id === taskId 
        ? { ...t, status: 'completed', outcome, completed_at: new Date().toISOString() }
        : t
    ))
  }, [])

  const deleteTask = useCallback(async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    })

    if (!response.ok) throw new Error('Failed to delete task')

    setTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  const fetchInvoices = useCallback(async (contactId: string) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/invoices`)
      const data = await response.json()

      if (response.ok && currentContactIdRef.current === contactId) {
        setInvoices(data.invoices || [])
      }
    } catch (err) {
      console.error('Error fetching invoices:', err)
    }
  }, [])

  const uploadInvoice = useCallback(async (contactId: string, formData: FormData) => {
    const data: Record<string, any> = {}
    formData.forEach((value, key) => {
      data[key] = value
    })

    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) throw new Error('Failed to upload invoice')

    const { invoice } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setInvoices(prev => [invoice, ...prev])
    }
  }, [])

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    const contactId = currentContactIdRef.current
    if (!contactId) return

    const response = await authedFetch(
      `/api/whatsapp/inbox/contacts/${contactId}/invoices?invoice_id=${invoiceId}`,
      { method: 'DELETE' }
    )

    if (!response.ok) throw new Error('Failed to delete invoice')

    setInvoices(prev => prev.filter(i => i.id !== invoiceId))
  }, [])

  const addComment = useCallback(async (contactId: string, content: string, type?: string, mentions?: string[]) => {
    const response = await authedFetch(`/api/whatsapp/inbox/contacts/${contactId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content, 
        comment_type: type || 'note',
        mentions: mentions || [],
        created_by: user?.id,
        created_by_name: user?.name || user?.email?.split('@')[0],
      })
    })

    if (!response.ok) throw new Error('Failed to add comment')

    const { comment } = await response.json()
    
    if (currentContactIdRef.current === contactId) {
      setComments(prev => [comment, ...prev])
      setActivities(prev => [{
        id: comment.id,
        organization_id: comment.organization_id,
        contact_id: comment.contact_id,
        activity_type: 'note_added',
        title: 'Nota adicionada',
        description: content,
        created_by_name: comment.created_by_name,
        created_at: comment.created_at,
      }, ...prev])
    }
  }, [user])

  const clear = useCallback(() => {
    currentContactIdRef.current = null
    clearAllData()
  }, [clearAllData])

  return {
    contact,
    conversation,
    notes,
    activities,
    orders,
    cart,
    activeDeal,
    deals,
    tasks,
    invoices,
    comments,
    isLoading,
    error,
    fetchContact,
    updateContact,
    addTag,
    removeTag,
    addNote,
    deleteNote,
    blockContact,
    unblockContact,
    assignConversation,
    toggleBot,
    fetchOrders,
    fetchDeals,
    createDeal,
    fetchTasks,
    createTask,
    completeTask,
    deleteTask,
    fetchInvoices,
    uploadInvoice,
    deleteInvoice,
    addComment,
    refreshContact,
    clear
  }
}
