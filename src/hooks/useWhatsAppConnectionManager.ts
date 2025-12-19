'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// =============================================
// TYPES
// =============================================

export interface WhatsAppInstance {
  id: string
  organization_id: string
  title: string
  phone_number: string | null
  phone_number_id: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'GENERATING' | 'connected' | 'disconnected'
  online_status: 'available' | 'unavailable' | null
  api_type: 'EVOLUTION' | 'META_CLOUD'
  api_url?: string
  api_key?: string
  access_token?: string
  unique_id: string
  qr_code?: string
  created_at: string
  updated_at: string
}

export interface WhatsAppConfig {
  id: string
  organization_id: string
  phone_number_id: string
  waba_id?: string
  access_token: string
  business_name?: string
  phone_number?: string
  webhook_verify_token: string
  webhook_verified: boolean
  is_active: boolean
}

interface UseWhatsAppConnectionReturn {
  // State
  instances: WhatsAppInstance[]
  selectedInstance: WhatsAppInstance | null
  loading: boolean
  error: string | null
  qrCode: string | null
  connectionStatus: 'idle' | 'generating' | 'connecting' | 'connected' | 'error' | 'timeout'
  
  // Actions
  fetchInstances: () => Promise<void>
  selectInstance: (instance: WhatsAppInstance | null) => void
  createInstance: (params: CreateInstanceParams) => Promise<WhatsAppInstance | null>
  generateQR: (instanceId: string) => Promise<string | null>
  checkStatus: (instanceId: string) => Promise<ConnectionStatusResult>
  disconnectInstance: (instanceId: string) => Promise<boolean>
  deleteInstance: (instanceId: string) => Promise<boolean>
  connectOfficial: (params: ConnectOfficialParams) => Promise<ConnectOfficialResult>
  
  // QR Polling
  startQRPolling: (instanceId: string) => void
  stopQRPolling: () => void
}

interface CreateInstanceParams {
  organizationId: string
  title: string
  apiType?: 'EVOLUTION' | 'META_CLOUD'
  apiUrl?: string
  apiKey?: string
}

interface ConnectOfficialParams {
  organizationId: string
  phoneNumberId: string
  wabaId?: string
  accessToken: string
}

interface ConnectOfficialResult {
  success: boolean
  config?: WhatsAppConfig
  error?: string
}

interface ConnectionStatusResult {
  connected: boolean
  state?: string
  phoneNumber?: string
  error?: string
}

// =============================================
// HOOK
// =============================================

export function useWhatsAppConnection(organizationId: string): UseWhatsAppConnectionReturn {
  // State
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<UseWhatsAppConnectionReturn['connectionStatus']>('idle')
  
  // Refs
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // =============================================
  // FETCH INSTANCES
  // =============================================

  const fetchInstances = useCallback(async () => {
    if (!organizationId) return
    
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/whatsapp/instances?organization_id=${organizationId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar instâncias')
      }

      setInstances(data.instances || [])

      // Auto-select first active if none selected
      if (!selectedInstance && data.instances?.length > 0) {
        const active = data.instances.find(
          (i: WhatsAppInstance) => i.status === 'ACTIVE' || i.status === 'connected'
        )
        if (active) {
          setSelectedInstance(active)
        }
      }
    } catch (err: any) {
      setError(err.message)
      console.error('fetchInstances error:', err)
    } finally {
      setLoading(false)
    }
  }, [organizationId, selectedInstance])

  // Initial fetch
  useEffect(() => {
    fetchInstances()
  }, [organizationId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // =============================================
  // SELECT INSTANCE
  // =============================================

  const selectInstance = useCallback((instance: WhatsAppInstance | null) => {
    setSelectedInstance(instance)
    // Salvar no localStorage para persistência
    if (instance) {
      localStorage.setItem(`whatsapp_selected_${organizationId}`, instance.id)
    } else {
      localStorage.removeItem(`whatsapp_selected_${organizationId}`)
    }
  }, [organizationId])

  // Restaurar seleção do localStorage
  useEffect(() => {
    if (instances.length > 0 && !selectedInstance) {
      const savedId = localStorage.getItem(`whatsapp_selected_${organizationId}`)
      if (savedId) {
        const saved = instances.find(i => i.id === savedId)
        if (saved) {
          setSelectedInstance(saved)
        }
      }
    }
  }, [instances, organizationId])

  // =============================================
  // CREATE INSTANCE
  // =============================================

  const createInstance = useCallback(async (params: CreateInstanceParams): Promise<WhatsAppInstance | null> => {
    try {
      setError(null)
      setConnectionStatus('generating')

      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: params.organizationId,
          title: params.title,
          api_type: params.apiType || 'EVOLUTION',
          api_url: params.apiUrl,
          api_key: params.apiKey
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar instância')
      }

      // Refresh list
      await fetchInstances()

      return data.instance
    } catch (err: any) {
      setError(err.message)
      setConnectionStatus('error')
      console.error('createInstance error:', err)
      return null
    }
  }, [fetchInstances])

  // =============================================
  // GENERATE QR
  // =============================================

  const generateQR = useCallback(async (instanceId: string): Promise<string | null> => {
    try {
      setError(null)
      setConnectionStatus('generating')
      setQrCode(null)

      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'qr',
          id: instanceId,
          organization_id: organizationId
        })
      })

      const data = await response.json()

      if (data.qr_code) {
        setQrCode(data.qr_code)
        return data.qr_code
      }

      if (data.status === 'ACTIVE') {
        setConnectionStatus('connected')
        await fetchInstances()
        return null
      }

      throw new Error(data.error || 'Erro ao gerar QR Code')
    } catch (err: any) {
      setError(err.message)
      setConnectionStatus('error')
      console.error('generateQR error:', err)
      return null
    }
  }, [organizationId, fetchInstances])

  // =============================================
  // CHECK STATUS
  // =============================================

  const checkStatus = useCallback(async (instanceId: string): Promise<ConnectionStatusResult> => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'status',
          id: instanceId
        })
      })

      const data = await response.json()

      if (data.connected) {
        setConnectionStatus('connected')
        await fetchInstances()
      }

      return {
        connected: data.connected || false,
        state: data.state,
        phoneNumber: data.phoneNumber
      }
    } catch (err: any) {
      console.error('checkStatus error:', err)
      return { connected: false, error: err.message }
    }
  }, [fetchInstances])

  // =============================================
  // QR POLLING
  // =============================================

  const startQRPolling = useCallback((instanceId: string) => {
    // Clear existing polling
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    // Set timeout (2 minutes)
    timeoutRef.current = setTimeout(() => {
      setConnectionStatus('timeout')
      if (pollingRef.current) clearInterval(pollingRef.current)
    }, 120000)

    // Start polling every 3 seconds
    pollingRef.current = setInterval(async () => {
      const status = await checkStatus(instanceId)
      
      if (status.connected) {
        // Connected! Stop polling
        if (pollingRef.current) clearInterval(pollingRef.current)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setConnectionStatus('connected')
      } else if (status.state === 'close') {
        // QR expired, generate new one
        await generateQR(instanceId)
      }
    }, 3000)
  }, [checkStatus, generateQR])

  const stopQRPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // =============================================
  // DISCONNECT INSTANCE
  // =============================================

  const disconnectInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      setError(null)

      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect',
          id: instanceId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao desconectar')
      }

      // Clear selection if disconnected current
      if (selectedInstance?.id === instanceId) {
        setSelectedInstance(null)
      }

      await fetchInstances()
      return true
    } catch (err: any) {
      setError(err.message)
      console.error('disconnectInstance error:', err)
      return false
    }
  }, [selectedInstance, fetchInstances])

  // =============================================
  // DELETE INSTANCE
  // =============================================

  const deleteInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      setError(null)

      const response = await fetch(`/api/whatsapp/instances?id=${instanceId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover instância')
      }

      // Clear selection if deleted current
      if (selectedInstance?.id === instanceId) {
        setSelectedInstance(null)
      }

      await fetchInstances()
      return true
    } catch (err: any) {
      setError(err.message)
      console.error('deleteInstance error:', err)
      return false
    }
  }, [selectedInstance, fetchInstances])

  // =============================================
  // CONNECT OFFICIAL API
  // =============================================

  const connectOfficial = useCallback(async (params: ConnectOfficialParams): Promise<ConnectOfficialResult> => {
    try {
      setError(null)
      setConnectionStatus('connecting')

      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: params.organizationId,
          phoneNumberId: params.phoneNumberId,
          wabaId: params.wabaId,
          accessToken: params.accessToken
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao conectar')
      }

      setConnectionStatus('connected')
      await fetchInstances()

      return {
        success: true,
        config: data.config
      }
    } catch (err: any) {
      setError(err.message)
      setConnectionStatus('error')
      console.error('connectOfficial error:', err)
      return { success: false, error: err.message }
    }
  }, [fetchInstances])

  // =============================================
  // RETURN
  // =============================================

  return {
    // State
    instances,
    selectedInstance,
    loading,
    error,
    qrCode,
    connectionStatus,
    
    // Actions
    fetchInstances,
    selectInstance,
    createInstance,
    generateQR,
    checkStatus,
    disconnectInstance,
    deleteInstance,
    connectOfficial,
    
    // QR Polling
    startQRPolling,
    stopQRPolling
  }
}

export default useWhatsAppConnection
