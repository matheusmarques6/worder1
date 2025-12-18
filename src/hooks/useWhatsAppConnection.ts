'use client'

import { useState, useEffect, useCallback } from 'react'

interface WhatsAppConnectionStatus {
  connected: boolean
  loading: boolean
  config: {
    id: string
    phone_number_id: string
    waba_id: string | null
    business_name: string
    phone_number: string
    is_active: boolean
    webhook_verified: boolean
  } | null
  error: string | null
  refetch: () => Promise<void>
}

export function useWhatsAppConnection(organizationId: string | null | undefined): WhatsAppConnectionStatus {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<WhatsAppConnectionStatus['config']>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/whatsapp/connect?organizationId=${organizationId}`)
      const data = await response.json()
      
      if (response.ok) {
        setConnected(data.connected)
        setConfig(data.config)
      } else {
        setError(data.error || 'Erro ao verificar conexão')
        setConnected(false)
        setConfig(null)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar conexão')
      setConnected(false)
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return {
    connected,
    loading,
    config,
    error,
    refetch: fetchStatus
  }
}

export default useWhatsAppConnection
