'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'

// =============================================
// TYPES
// =============================================
// Onda 1 — Evolution removido. O inbox passa a listar os NÚMEROS Cloud
// (WhatsApp Cloud API / Meta) via /api/whatsapp/numbers. Mantemos o shape
// WhatsAppInstance só para compatibilidade com os componentes que já o usam.

export interface WhatsAppInstance {
  id: string
  organization_id: string
  store_id?: string
  title: string
  phone_number: string | null
  phone_number_id: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'GENERATING' | 'connected' | 'disconnected' | 'qr_pending'
  online_status: 'available' | 'unavailable' | null
  api_type: 'META_CLOUD'
  api_url?: string
  api_key?: string
  access_token?: string
  unique_id: string
  qr_code?: string
  created_at: string
  updated_at: string
}

interface UseWhatsAppConnectionReturn {
  instances: WhatsAppInstance[]
  selectedInstance: WhatsAppInstance | null
  loading: boolean
  error: string | null
  fetchInstances: () => Promise<void>
  selectInstance: (instance: WhatsAppInstance | null) => void
}

// Mapeia um "número" Cloud (/api/whatsapp/numbers) para o shape WhatsAppInstance.
export function mapNumberToInstance(n: any): WhatsAppInstance {
  const connected = n.is_connected === true || n.connection_status === 'connected'
  return {
    id: n.id,
    organization_id: n.organization_id,
    store_id: n.store_id ?? undefined,
    title: n.display_name || n.phone_number || 'WhatsApp',
    phone_number: n.phone_number ?? null,
    phone_number_id: n.phone_number_id ?? null,
    status: connected ? 'connected' : 'disconnected',
    online_status: connected ? 'available' : 'unavailable',
    api_type: 'META_CLOUD',
    access_token: n.access_token,
    unique_id: n.id,
    created_at: n.created_at,
    updated_at: n.updated_at,
  }
}

// =============================================
// HOOK
// =============================================

export function useWhatsAppConnection(organizationId: string | null, storeId?: string | null): UseWhatsAppConnectionReturn {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isFetchingRef = useRef(false)

  const fetchInstances = useCallback(async () => {
    if (!organizationId) return

    if (!storeId) {
      setInstances([])
      setSelectedInstance(null)
      setLoading(false)
      return
    }

    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      setLoading(true)
      setError(null)

      const response = await authedFetch(`/api/whatsapp/numbers?organization_id=${organizationId}&store_id=${storeId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar números')
      }

      const mapped: WhatsAppInstance[] = (data.numbers || []).map(mapNumberToInstance)
      setInstances(mapped)

      // Auto-select first connected if none selected
      if (!selectedInstance && mapped.length > 0) {
        const active = mapped.find(i => i.status === 'connected') || mapped[0]
        if (active) setSelectedInstance(active)
      }
    } catch (err: any) {
      setError(err.message)
      console.error('fetchInstances error:', err)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [organizationId, storeId, selectedInstance])

  // Refetch quando a loja mudar
  useEffect(() => {
    setSelectedInstance(null)
    fetchInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId])

  const selectInstance = useCallback((instance: WhatsAppInstance | null) => {
    setSelectedInstance(instance)
    if (instance && storeId) {
      localStorage.setItem(`whatsapp_selected_${storeId}`, instance.id)
    } else if (storeId) {
      localStorage.removeItem(`whatsapp_selected_${storeId}`)
    }
  }, [storeId])

  // Restaurar seleção do localStorage
  useEffect(() => {
    if (storeId && instances.length > 0 && !selectedInstance) {
      const savedId = localStorage.getItem(`whatsapp_selected_${storeId}`)
      if (savedId) {
        const saved = instances.find(i => i.id === savedId)
        if (saved) setSelectedInstance(saved)
      }
    }
  }, [storeId, instances, selectedInstance])

  return {
    instances,
    selectedInstance,
    loading,
    error,
    fetchInstances,
    selectInstance,
  }
}
