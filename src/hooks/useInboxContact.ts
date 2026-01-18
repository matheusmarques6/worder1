import { useState, useCallback } from 'react'
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
} from '@/types/inbox'

interface UseInboxContactReturn {
  contact: InboxContact | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
  // Novos campos
  tasks: InboxTask[]
  invoices: InboxInvoice[]
  comments: InboxComment[]
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchContact: (contactId: string) => Promise<void>
  updateContact: (contactId: string, updates: Partial<InboxContact>) => Promise<void>
  addTag: (contactId: string, tag: string) => Promise<void>
  removeTag: (contactId: string, tag: string) => Promise<void>
  addNote: (contactId: string, content: string, conversationId?: string) => Promise<void>
  blockContact: (contactId: string, reason?: string) => Promise<void>
  unblockContact: (contactId: string) => Promise<void>
  fetchOrders: (contactId: string) => Promise<void>
  fetchDeals: (contactId: string) => Promise<void>
  createDeal: (contactId: string, params: CreateDealParams) => Promise<InboxDeal | null>
  // Novas actions
  fetchTasks: (contactId: string) => Promise<void>
  createTask: (contactId: string, task: Partial<InboxTask>) => Promise<InboxTask | null>
  completeTask: (taskId: string, outcome?: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  fetchInvoices: (contactId: string) => Promise<void>
  uploadInvoice: (contactId: string, data: FormData) => Promise<void>
  deleteInvoice: (invoiceId: string) => Promise<void>
  addComment: (contactId: string, content: string, type?: string) => Promise<void>
  refreshContact: (contactId: string) => Promise<void>
  clear: () => void
}

interface CreateDealParams {
  pipelineId: string
  stageId: string
  title?: string
  value?: number
}

export function useInboxContact(): UseInboxContactReturn {
  const [contact, setContact] = useState<InboxContact | null>(null)
  const [notes, setNotes] = useState<InboxNote[]>([])
  const [activities, setActivities] = useState<InboxActivity[]>([])
  const [orders, setOrders] = useState<InboxOrder[]>([])
  const [cart, setCart] = useState<InboxCart | null>(null)
  const [activeDeal, setActiveDeal] = useState<InboxDeal | null>(null)
  const [deals, setDeals] = useState<InboxDeal[]>([])
  // Novos estados
  const [tasks, setTasks] = useState<InboxTask[]>([])
  const [invoices, setInvoices] = useState<InboxInvoice[]>([])
  const [comments, setComments] = useState<InboxComment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchContact = useCallback(async (contactId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch contact')

      setContact(data.contact)
      setNotes(data.notes || [])
      setActivities(data.activities || [])
      // Novos dados da API unificada
      setDeals(data.deals || [])
      setTasks(data.tasks || [])
      setInvoices(data.invoices || [])
      
      // Definir deal ativo
      const openDeals = (data.deals || []).filter((d: InboxDeal) => d.status === 'open')
      setActiveDeal(openDeals[0] || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshContact = useCallback(async (contactId: string) => {
    // Re-fetch tudo sem mostrar loading
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`)
      const data = await response.json()

      if (response.ok) {
        setContact(data.contact)
        setNotes(data.notes || [])
        setActivities(data.activities || [])
        setDeals(data.deals || [])
        setTasks(data.tasks || [])
        setInvoices(data.invoices || [])
        
        const openDeals = (data.deals || []).filter((d: InboxDeal) => d.status === 'open')
        setActiveDeal(openDeals[0] || null)
      }
    } catch (err) {
      console.error('Error refreshing contact:', err)
    }
  }, [])

  const updateContact = useCallback(async (contactId: string, updates: Partial<InboxContact>) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) throw new Error('Failed to update contact')

      const { contact: updated } = await response.json()
      setContact(prev => prev ? { ...prev, ...updated } : null)
    } catch (err) {
      throw err
    }
  }, [])

  const addTag = useCallback(async (contactId: string, tag: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, action: 'add' })
      })

      if (!response.ok) throw new Error('Failed to add tag')

      const { contact: updated } = await response.json()
      setContact(prev => prev ? { ...prev, tags: updated.tags } : null)
    } catch (err) {
      throw err
    }
  }, [])

  const removeTag = useCallback(async (contactId: string, tag: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, action: 'remove' })
      })

      if (!response.ok) throw new Error('Failed to remove tag')

      const { contact: updated } = await response.json()
      setContact(prev => prev ? { ...prev, tags: updated.tags } : null)
    } catch (err) {
      throw err
    }
  }, [])

  const addNote = useCallback(async (contactId: string, content: string, conversationId?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, conversation_id: conversationId })
      })

      if (!response.ok) throw new Error('Failed to add note')

      const { note } = await response.json()
      setNotes(prev => [note, ...prev])
    } catch (err) {
      throw err
    }
  }, [])

  const blockContact = useCallback(async (contactId: string, reason?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: true, reason })
      })

      if (!response.ok) throw new Error('Failed to block contact')

      setContact(prev => prev ? { ...prev, is_blocked: true, blocked_reason: reason } : null)
    } catch (err) {
      throw err
    }
  }, [])

  const unblockContact = useCallback(async (contactId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: false })
      })

      if (!response.ok) throw new Error('Failed to unblock contact')

      setContact(prev => prev ? { ...prev, is_blocked: false, blocked_reason: undefined } : null)
    } catch (err) {
      throw err
    }
  }, [])

  const fetchOrders = useCallback(async (contactId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/orders`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch orders')

      setOrders(data.orders || [])
      setCart(data.cart || null)
    } catch (err) {
      console.error('Error fetching orders:', err)
    }
  }, [])

  const fetchDeals = useCallback(async (contactId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/deals`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch deals')

      setActiveDeal(data.activeDeal || null)
      setDeals(data.deals || [])
    } catch (err) {
      console.error('Error fetching deals:', err)
    }
  }, [])

  const createDeal = useCallback(async (contactId: string, params: CreateDealParams): Promise<InboxDeal | null> => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })

      if (!response.ok) throw new Error('Failed to create deal')

      const { deal } = await response.json()
      setActiveDeal(deal)
      setDeals(prev => [deal, ...prev])
      
      return deal
    } catch (err) {
      throw err
    }
  }, [])

  // ========== TASKS ==========
  const fetchTasks = useCallback(async (contactId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/tasks`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch tasks')

      setTasks(data.tasks || [])
    } catch (err) {
      console.error('Error fetching tasks:', err)
    }
  }, [])

  const createTask = useCallback(async (contactId: string, task: Partial<InboxTask>): Promise<InboxTask | null> => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      })

      if (!response.ok) throw new Error('Failed to create task')

      const { task: newTask } = await response.json()
      setTasks(prev => [newTask, ...prev])
      
      return newTask
    } catch (err) {
      throw err
    }
  }, [])

  const completeTask = useCallback(async (taskId: string, outcome?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contact?.id}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task_id: taskId, 
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
    } catch (err) {
      throw err
    }
  }, [contact?.id])

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete task')

      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err) {
      throw err
    }
  }, [])

  // ========== INVOICES ==========
  const fetchInvoices = useCallback(async (contactId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/invoices`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch invoices')

      setInvoices(data.invoices || [])
    } catch (err) {
      console.error('Error fetching invoices:', err)
    }
  }, [])

  const uploadInvoice = useCallback(async (contactId: string, formData: FormData) => {
    try {
      // Converter FormData para JSON (simplificado)
      const data: Record<string, any> = {}
      formData.forEach((value, key) => {
        data[key] = value
      })

      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) throw new Error('Failed to upload invoice')

      const { invoice } = await response.json()
      setInvoices(prev => [invoice, ...prev])
    } catch (err) {
      throw err
    }
  }, [])

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    try {
      const response = await fetch(
        `/api/whatsapp/inbox/contacts/${contact?.id}/invoices?invoice_id=${invoiceId}`,
        { method: 'DELETE' }
      )

      if (!response.ok) throw new Error('Failed to delete invoice')

      setInvoices(prev => prev.filter(i => i.id !== invoiceId))
    } catch (err) {
      throw err
    }
  }, [contact?.id])

  // ========== COMMENTS ==========
  const addComment = useCallback(async (contactId: string, content: string, type?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, comment_type: type || 'note' })
      })

      if (!response.ok) throw new Error('Failed to add comment')

      const { comment } = await response.json()
      setComments(prev => [comment, ...prev])
      // Também adicionar às activities para aparecer na timeline
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
    } catch (err) {
      throw err
    }
  }, [])

  const clear = useCallback(() => {
    setContact(null)
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

  return {
    contact,
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
    blockContact,
    unblockContact,
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
