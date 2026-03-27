'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// =============================================
// TYPES
// =============================================

export interface WhatsAppInstance {
  id: string
  organization_id: string
  store_id?: string // ✅ NOVO
  title: string
  phone_number: string | null
  phone_number_id: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'GENERATING' | 'connected' | 'disconnected' | 'qr_pending'
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
  instances: WhatsAppInstance[]
  selectedInstance: WhatsAppInstance | null
  loading: boolean
  error: string | null
  qrCode: string | null
  connectionStatus: 'idle' | 'generating' | 'connecting' | 'connected' | 'error' | 'timeout'
  
  fetchInstances: () => Promise<void>
  selectInstance: (instance: WhatsAppInstance | null) => void
  createInstance: (params: CreateInstanceParams) => Promise<WhatsAppInstance | null>
  generateQR: (instanceId: string) => Promise<string | null>
  checkStatus: (instanceId: string) => Promise<ConnectionStatusResult>
  disconnectInstance: (instanceId: string) => Promise<boolean>
  deleteInstance: (instanceId: string) => Promise<boolean>
  connectOfficial: (params: ConnectOfficialParams) => Promise<ConnectOfficialResult>
  
  startQRPolling: (instanceId: string) => void
  stopQRPolling: () => void
}

interface CreateInstanceParams {
  organizationId: string
  storeId: string // ✅ NOVO: Obrigatório
  title: string
  apiType?: 'EVOLUTION' | 'META_CLOUD'
  apiUrl?: string
  apiKey?: string
}

interface ConnectOfficialParams {
  organizationId: string
  storeId: string // ✅ NOVO
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

// ✅ CORREÇÃO: Recebe storeId e organizationId (ambos podem ser null)
export function useWhatsAppConnection(organizationId: string | null, storeId?: string | null): UseWhatsAppConnectionReturn {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<UseWhatsAppConnectionReturn['connectionStatus']>('idle')
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ✅ Debounce: evita chamadas simultâneas
  const isFetchingRef = useRef(false)

  // =============================================
  // FETCH INSTANCES - FILTRADO POR STORE_ID
  // =============================================

  const fetchInstances = useCallback(async () => {
    if (!organizationId) return

    // ✅ CRÍTICO: Não buscar se não tiver storeId
    if (!storeId) {
      console.log('[WhatsAppConnection] No storeId, clearing instances')
      setInstances([])
      setSelectedInstance(null)
      setLoading(false)
      return
    }

    // ✅ Debounce: ignora chamadas enquanto outra está em andamento
    if (isFetchingRef.current) {
      return
    }
    isFetchingRef.current = true

    try {
      setLoading(true)
      setError(null)

      // ✅ CRÍTICO: Passar store_id na query
      const response = await fetch(`/api/whatsapp/instances?organization_id=${organizationId}&store_id=${storeId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar instâncias')
      }

      console.log(`[WhatsAppConnection] Found ${data.instances?.length || 0} instances for store ${storeId}`)
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
      isFetchingRef.current = false
    }
  }, [organizationId, storeId, selectedInstance])

  // ✅ CORREÇÃO: Refetch quando storeId mudar
  useEffect(() => {
    console.log('[WhatsAppConnection] Store changed to:', storeId)
    setSelectedInstance(null) // Limpar seleção ao trocar loja
    fetchInstances()
  }, [organizationId, storeId])

  // Auto-refresh quando conectando - usando ref para evitar re-criação do interval
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null)
  const fetchInstancesRef = useRef(fetchInstances)

  useEffect(() => {
    fetchInstancesRef.current = fetchInstances
  }, [fetchInstances])

  useEffect(() => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current)
      statusPollingRef.current = null
    }

    if (connectionStatus === 'connecting' || connectionStatus === 'generating') {
      console.log('[WhatsAppConnection] Starting status polling...')
      statusPollingRef.current = setInterval(() => {
        fetchInstancesRef.current()
      }, 3000)
    }

    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current)
      }
    }
  }, [connectionStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (statusPollingRef.current) clearInterval(statusPollingRef.current)
    }
  }, [])

  // =============================================
  // SELECT INSTANCE
  // =============================================

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
        if (saved) {
          setSelectedInstance(saved)
        }
      }
    }
  }, [storeId, instances, selectedInstance])

  // =============================================
  // CREATE INSTANCE - COM STORE_ID
  // =============================================

  const createInstance = useCallback(async (params: CreateInstanceParams): Promise<WhatsAppInstance | null> => {
    // ✅ CRÍTICO: Validar storeId
    if (!params.storeId) {
      setError('storeId é obrigatório')
      return null
    }

    try {
      setLoading(true)
      setError(null)
      setConnectionStatus('generating')

      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: params.organizationId,
          store_id: params.storeId, // ✅ CRÍTICO
          title: params.title,
          api_type: params.apiType || 'EVOLUTION',
          api_url: params.apiUrl,
          api_key: params.apiKey,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar instância')
      }

      console.log('[WhatsAppConnection] Instance created:', data.instance?.id)
      await fetchInstances()
      return data.instance
    } catch (err: any) {
      setError(err.message)
      setConnectionStatus('error')
      return null
    } finally {
      setLoading(false)
    }
  }, [fetchInstances])

  // =============================================
  // GENERATE QR CODE
  // =============================================

  const generateQR = useCallback(async (instanceId: string): Promise<string | null> => {
    try {
      setConnectionStatus('generating')
      setError(null)

      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'qr',
          instance_id: instanceId,
        }),
      })

      const data = await response.json()

      if (data.connected) {
        setConnectionStatus('connected')
        setQrCode(null)
        await fetchInstances()
        return null
      }

      if (data.qrcode) {
        setQrCode(data.qrcode)
        setConnectionStatus('connecting')
        return data.qrcode
      }

      throw new Error(data.error || 'QR code não disponível')
    } catch (err: any) {
      setError(err.message)
      setConnectionStatus('error')
      return null
    }
  }, [fetchInstances])

  // =============================================
  // QR POLLING
  // =============================================

  const startQRPolling = useCallback((instanceId: string) => {
    stopQRPolling()

    timeoutRef.current = setTimeout(() => {
      console.log('[WhatsAppConnection] QR polling timeout')
      stopQRPolling()
      setConnectionStatus('timeout')
    }, 120000) // 2 minutos

    pollingRef.current = setInterval(async () => {
      const result = await checkStatus(instanceId)
      
      if (result.connected) {
        console.log('[WhatsAppConnection] Connected!')
        stopQRPolling()
        setConnectionStatus('connected')
        setQrCode(null)
        await fetchInstances()
      }
    }, 3000)
  }, [fetchInstances])

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
  // CHECK STATUS
  // =============================================

  const checkStatus = useCallback(async (instanceId: string): Promise<ConnectionStatusResult> => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'status',
          instance_id: instanceId,
        }),
      })

      const data = await response.json()
      return data
    } catch (err: any) {
      return { connected: false, error: err.message }
    }
  }, [])

  // =============================================
  // DISCONNECT
  // =============================================

  const disconnectInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect',
          instance_id: instanceId,
        }),
      })

      if (response.ok) {
        await fetchInstances()
        setConnectionStatus('idle')
        return true
      }
      return false
    } catch (err) {
      return false
    }
  }, [fetchInstances])

  // =============================================
  // DELETE
  // =============================================

  const deleteInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/whatsapp/instances?id=${instanceId}&organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        if (selectedInstance?.id === instanceId) {
          setSelectedInstance(null)
        }
        await fetchInstances()
        return true
      }
      return false
    } catch (err) {
      return false
    }
  }, [fetchInstances, selectedInstance])

  // =============================================
  // CONNECT OFFICIAL (META CLOUD)
  // =============================================

  const connectOfficial = useCallback(async (params: ConnectOfficialParams): Promise<ConnectOfficialResult> => {
    try {
      const response = await fetch('/api/whatsapp/cloud/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: params.organizationId,
          store_id: params.storeId, // ✅ NOVO
          phone_number_id: params.phoneNumberId,
          waba_id: params.wabaId,
          access_token: params.accessToken,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      await fetchInstances()
      return { success: true, config: data.config }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }, [fetchInstances])

  return {
    instances,
    selectedInstance,
    loading,
    error,
    qrCode,
    connectionStatus,
    fetchInstances,
    selectInstance,
    createInstance,
    generateQR,
    checkStatus,
    disconnectInstance,
    deleteInstance,
    connectOfficial,
    startQRPolling,
    stopQRPolling,
  }
}
