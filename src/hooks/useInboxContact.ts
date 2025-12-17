import { useState, useCallback } from 'react'
import type { 
  InboxContact, 
  InboxNote, 
  InboxActivity, 
  InboxOrder, 
  InboxCart,
  InboxDeal 
} from '@/types/inbox'

interface UseInboxContactReturn {
  contact: InboxContact | null
  notes: InboxNote[]
  activities: InboxActivity[]
  orders: InboxOrder[]
  cart: InboxCart | null
  activeDeal: InboxDeal | null
  deals: InboxDeal[]
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateContact = useCallback(async (contactId: string, updates: Partial<InboxContact>) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`, {
        method: 'PUT',
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
        body: JSON.stringify({ content, conversationId })
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

  const clear = useCallback(() => {
    setContact(null)
    setNotes([])
    setActivities([])
    setOrders([])
    setCart(null)
    setActiveDeal(null)
    setDeals([])
  }, [])

  return {
    contact,
    notes,
    activities,
    orders,
    cart,
    activeDeal,
    deals,
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
    clear
  }
}
