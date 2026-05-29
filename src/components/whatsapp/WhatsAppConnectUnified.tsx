'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useStoreStore } from '@/stores'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useFacebookEmbeddedSignup } from '@/hooks/useFacebookEmbeddedSignup'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  MessageSquare,
  Check,
  AlertCircle,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Info,
  Loader2,
  CheckCircle2,
  QrCode,
  Cloud,
  Smartphone,
  RefreshCw,
  Wifi,
  WifiOff,
  Settings2,
  Zap,
  Facebook,
  Sparkles
} from 'lucide-react'

// =============================================
// TYPES
// =============================================

type ConnectionMethod = 'embedded' | 'official' | 'qrcode'
type ConnectionStatus = 'idle' | 'generating' | 'connecting' | 'connected' | 'error' | 'timeout'

interface WhatsAppConnectUnifiedProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (instance: any) => void
  organizationId: string
  storeId?: string | null
  existingConfig?: any
}

interface EvolutionConfig {
  apiUrl: string
  apiKey: string
  instanceName: string
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function WhatsAppConnectUnified({
  isOpen,
  onClose,
  onSuccess,
  organizationId,
  storeId,
  existingConfig
}: WhatsAppConnectUnifiedProps) {
  const { currentStore } = useStoreStore()
  const effectiveStoreId = storeId || currentStore?.id

  // State
  const [method, setMethod] = useState<ConnectionMethod>('official')
  const [embeddedEnabled, setEmbeddedEnabled] = useState(false)
  const [embeddedFlagLoaded, setEmbeddedFlagLoaded] = useState(false)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // QR Code State
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<ConnectionStatus>('idle')
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const qrTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // API Official State
  const [phoneNumberId, setPhoneNumberId] = useState(existingConfig?.phone_number_id || '')
  const [wabaId, setWabaId] = useState(existingConfig?.waba_id || '')
  const [accessToken, setAccessToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [result, setResult] = useState<any>(null)
  
  // Evolution Config State
  const [showEvolutionConfig, setShowEvolutionConfig] = useState(false)
  const [evolutionConfig, setEvolutionConfig] = useState<EvolutionConfig>({
    apiUrl: process.env.NEXT_PUBLIC_EVOLUTION_API_URL || '',
    apiKey: process.env.NEXT_PUBLIC_EVOLUTION_API_KEY || '',
    instanceName: ''
  })
  
  // Guide state
  const [expandedGuide, setExpandedGuide] = useState<number | null>(1)

  // =============================================
  // EFFECTS
  // =============================================

  useEffect(() => {
    if (existingConfig) {
      setPhoneNumberId(existingConfig.phone_number_id || '')
      setWabaId(existingConfig.waba_id || '')
    }
  }, [existingConfig])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (qrTimeoutRef.current) clearTimeout(qrTimeoutRef.current)
    }
  }, [])

  // Resolve embedded-signup feature flag and default to the embedded tab when enabled.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        const token = session?.access_token || ''
        const res = await fetch('/api/feature-flags?key=whatsapp_embedded_signup', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const enabled = !!data.enabled
        setEmbeddedEnabled(enabled)
        if (enabled) setMethod('embedded')
      } catch {
        // silent — falls back to official/qrcode
      } finally {
        if (!cancelled) setEmbeddedFlagLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  // Embedded Signup hook (FB.login + postMessage + backend exchange).
  const embedded = useFacebookEmbeddedSignup({
    storeId: effectiveStoreId || null,
    onSuccess: (account: any) => {
      setResult({
        config: {
          phone_number: account?.phoneNumber || account?.phone_number,
          business_name: account?.verifiedName || account?.verified_name,
          phone_number_id: account?.phoneNumberId || account?.phone_number_id,
          waba_id: account?.wabaId || account?.waba_id,
        },
        account,
      })
      setStep(3)
    },
  })

  // =============================================
  // QR CODE METHODS
  // =============================================

  const generateQRCode = async () => {
    setLoading(true)
    setError('')
    setQrStatus('generating')
    setQrCode(null)

    try {
      // 1. Criar instância
      const uniqueId = `${organizationId.slice(0, 8)}_${Date.now()}`
      
      const createResponse = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: organizationId,
          store_id: effectiveStoreId,
          title: evolutionConfig.instanceName || 'WhatsApp Business',
          api_type: 'EVOLUTION',
          api_url: evolutionConfig.apiUrl,
          api_key: evolutionConfig.apiKey
        })
      })

      const createData = await createResponse.json()

      if (!createResponse.ok) {
        // ✅ CORREÇÃO: Mensagem mais clara quando Evolution API não está configurada
        if (createData.code === 'EVOLUTION_NOT_CONFIGURED') {
          throw new Error('A conexão via QR Code requer a Evolution API configurada. Use a opção "API Oficial" ou configure EVOLUTION_API_KEY nas variáveis de ambiente.')
        }
        throw new Error(createData.error || 'Erro ao criar instância')
      }

      const newInstanceId = createData.instance?.id
      setInstanceId(newInstanceId)

      // 2. Usar QR que veio do create (se disponível) ou buscar novo
      if (createData.qr_code || createData.qr) {
        setQrCode(createData.qr_code || createData.qr)
        setQrStatus('generating')
      } else {
        await requestQRCode(newInstanceId)
      }
      
      // 3. Iniciar polling
      startStatusPolling(newInstanceId)
      
      // 4. Timeout de 2 minutos
      qrTimeoutRef.current = setTimeout(() => {
        if (qrStatus !== 'connected') {
          setQrStatus('timeout')
          stopPolling()
        }
      }, 120000)

    } catch (err: any) {
      setError(err.message)
      setQrStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const requestQRCode = async (instId: string) => {
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'qr',
          instance_id: instId,
          organization_id: organizationId
        })
      })

      const data = await response.json()

      // Aceitar tanto qr_code quanto qrcode
      const qrCodeValue = data.qr_code || data.qrcode
      
      if (qrCodeValue) {
        setQrCode(qrCodeValue)
        setQrStatus('generating')
      } else if (data.connected || data.status === 'ACTIVE') {
        setQrStatus('connected')
        setConnectedNumber(data.phoneNumber || data.phone_number)
        stopPolling()
      }
    } catch (err: any) {
      console.error('QR request error:', err)
    }
  }

  const startStatusPolling = useCallback((instId: string) => {
    // Poll a cada 3 segundos
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/whatsapp/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'status',
            instance_id: instId
          })
        })

        const data = await response.json()

        if (data.connected) {
          setQrStatus('connected')
          setConnectedNumber(data.phoneNumber)
          stopPolling()
          
          // Atualizar instância e ir para step 3
          setStep(3)
        } else if (data.state === 'close') {
          // QR expirou, gerar novo
          await requestQRCode(instId)
        }
      } catch (err) {
        console.error('Status polling error:', err)
      }
    }, 3000)
  }, [])

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (qrTimeoutRef.current) {
      clearTimeout(qrTimeoutRef.current)
      qrTimeoutRef.current = null
    }
  }

  const refreshQRCode = async () => {
    if (!instanceId) return
    setQrCode(null)
    setQrStatus('generating')
    await requestQRCode(instanceId)
  }

  // =============================================
  // API OFFICIAL METHODS
  // =============================================

  const handleOfficialConnect = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim() || undefined,
          accessToken: accessToken.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao conectar')
      }

      setResult(data)
      setStep(3)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // =============================================
  // UTILS
  // =============================================

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleClose = () => {
    stopPolling()
    setStep(1)
    setQrCode(null)
    setQrStatus('idle')
    setInstanceId(null)
    setError('')
    embedded.reset()
    onClose()
  }

  const handleFinish = () => {
    const instanceData = method === 'qrcode'
      ? { id: instanceId, phone_number: connectedNumber, type: 'EVOLUTION' }
      : { ...result?.config, type: 'META_CLOUD' }

    onSuccess(instanceData)
    handleClose()
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Conectar WhatsApp</h2>
                <p className="text-sm text-gray-500">
                  {method === 'embedded'
                    ? 'Login com Facebook (recomendado)'
                    : method === 'official'
                      ? 'API Oficial Meta (manual)'
                      : 'Via QR Code'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Method Selector - Step 1 Only */}
          {step === 1 && (
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex gap-2 p-1 bg-gray-50 rounded-xl">
                {embeddedEnabled && (
                  <button
                    onClick={() => setMethod('embedded')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-medium text-sm transition-all relative ${
                      method === 'embedded'
                        ? 'bg-[#1877F2] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-white'
                    }`}
                  >
                    <Facebook className="w-4 h-4" />
                    Facebook
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      method === 'embedded' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      RECOMENDADO
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setMethod('official')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                    method === 'official'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-white'
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  Manual
                </button>
                <button
                  onClick={() => setMethod('qrcode')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                    method === 'qrcode'
                      ? 'bg-green-500 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
              </div>
            </div>
          )}

          {/* Progress Steps */}
          {step > 1 && (
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-center gap-4">
                {[
                  { num: 1, label: method === 'qrcode' ? 'QR Code' : 'Credenciais' },
                  { num: 2, label: 'Conectando' },
                  { num: 3, label: 'Concluído' }
                ].map((s, i) => {
                  const activeColor = method === 'qrcode'
                    ? 'bg-green-500'
                    : method === 'embedded'
                      ? 'bg-[#1877F2]'
                      : 'bg-blue-500'
                  return (
                    <div key={s.num} className="flex items-center">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                        ${step >= s.num ? `${activeColor} text-white` : 'bg-gray-100 text-gray-500'}
                      `}>
                        {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                      </div>
                      {i < 2 && (
                        <div className={`w-12 h-0.5 mx-2 ${
                          step > s.num ? activeColor : 'bg-gray-100'
                        }`} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* =============================================
                STEP 1 - EMBEDDED SIGNUP (FACEBOOK LOGIN)
            ============================================= */}
            {step === 1 && method === 'embedded' && (
              <div className="space-y-6">
                <div className="p-4 bg-[#1877F2]/5 border border-[#1877F2]/20 rounded-xl">
                  <div className="flex gap-3">
                    <Sparkles className="w-5 h-5 text-[#1877F2] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Login com Facebook — Conexão Oficial</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Autentique-se no Facebook, selecione ou crie sua WhatsApp Business Account e o Worder cuida do resto. Sem precisar colar tokens.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <Cloud className="w-5 h-5 text-[#1877F2] mb-2" />
                    <h4 className="font-medium text-gray-900 text-sm">API Oficial</h4>
                    <p className="text-xs text-gray-500 mt-1">Estável, sem risco de ban, ideal para produção</p>
                  </div>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <Zap className="w-5 h-5 text-yellow-500 mb-2" />
                    <h4 className="font-medium text-gray-900 text-sm">Setup em 2 minutos</h4>
                    <p className="text-xs text-gray-500 mt-1">Sem precisar gerar tokens manualmente</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={embedded.start}
                    disabled={embedded.running || !embedded.sdkReady || !embedded.configured}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {embedded.running ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aguardando Facebook…
                      </>
                    ) : (
                      <>
                        <Facebook className="h-4 w-4" />
                        Continuar com Facebook
                      </>
                    )}
                  </button>
                </div>

                {!embedded.configured && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-700">
                        <p className="font-medium">Embedded Signup não configurado</p>
                        <p className="mt-1">
                          Defina <code className="px-1 bg-amber-100 rounded">NEXT_PUBLIC_META_APP_ID</code> e <code className="px-1 bg-amber-100 rounded">NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID</code> ou use o método Manual.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {embedded.error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{embedded.error}</p>
                  </div>
                )}
              </div>
            )}

            {/* =============================================
                STEP 1 - QR CODE METHOD
            ============================================= */}
            {step === 1 && method === 'qrcode' && (
              <div className="space-y-6">
                {/* Info Box */}
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex gap-3">
                    <Smartphone className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-green-300 font-medium">Conexão Rápida via QR Code</p>
                      <p className="text-sm text-green-300/70 mt-1">
                        Escaneie o QR Code com seu WhatsApp para conectar instantaneamente. 
                        Ideal para testes e contas pessoais.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vantagens */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <Zap className="w-5 h-5 text-yellow-400 mb-2" />
                    <h4 className="font-medium text-gray-900 text-sm">Conexão Instantânea</h4>
                    <p className="text-xs text-gray-500 mt-1">Conecte em segundos, sem configurações complexas</p>
                  </div>
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-blue-400 mb-2" />
                    <h4 className="font-medium text-gray-900 text-sm">Qualquer Número</h4>
                    <p className="text-xs text-gray-500 mt-1">Use seu WhatsApp pessoal ou Business</p>
                  </div>
                </div>

                {/* Evolution API Config (Advanced) */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowEvolutionConfig(!showEvolutionConfig)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Settings2 className="w-5 h-5 text-gray-500" />
                      <span className="text-sm text-gray-600">Configurações Avançadas</span>
                    </div>
                    {showEvolutionConfig ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                  
                  {showEvolutionConfig && (
                    <div className="px-4 pb-4 space-y-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nome da Instância</label>
                        <input
                          type="text"
                          value={evolutionConfig.instanceName}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, instanceName: e.target.value }))}
                          placeholder="Ex: Atendimento Principal"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-dark-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">API URL (Evolution)</label>
                        <input
                          type="text"
                          value={evolutionConfig.apiUrl}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                          placeholder="https://api.evolution.com"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-dark-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">API Key</label>
                        <input
                          type="password"
                          value={evolutionConfig.apiKey}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="Sua chave de API"
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-dark-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Warning */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-300">
                      <p className="font-medium">Importante:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-amber-300/80">
                        <li>Use WhatsApp atualizado no celular</li>
                        <li>Mantenha o celular conectado à internet</li>
                        <li>A sessão pode expirar se ficar offline por muito tempo</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* =============================================
                STEP 1 - API OFFICIAL METHOD
            ============================================= */}
            {step === 1 && method === 'official' && (
              <div className="space-y-4">
                {/* Info Box */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="flex gap-3">
                    <Cloud className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300 font-medium">API Oficial Meta Cloud</p>
                      <p className="text-sm text-blue-300/70 mt-1">
                        Conexão oficial e estável via Meta Business Suite. Recomendado para produção.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Guia Expandível */}
                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGuide(expandedGuide === 1 ? null : 1)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-medium">1</span>
                        <span className="font-medium text-gray-900">Como obter as credenciais</span>
                      </div>
                      {expandedGuide === 1 ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                    </button>
                    {expandedGuide === 1 && (
                      <div className="px-4 pb-4 text-sm text-gray-600 space-y-2">
                        <p>1. Acesse <a href="https://developers.facebook.com" target="_blank" className="text-blue-400 hover:underline">developers.facebook.com</a></p>
                        <p>2. Vá em <strong>My Apps</strong> e selecione seu app</p>
                        <p>3. No menu, clique em <strong>WhatsApp {'>'} API Setup</strong></p>
                        <p>4. Copie o <strong>Phone Number ID</strong> e <strong>Access Token</strong></p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Phone Number ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      WABA ID <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="Ex: 987654321098765"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Access Token <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="EAAG..."
                        className="w-full px-4 py-3 pr-12 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
                      >
                        {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* =============================================
                STEP 2 - QR CODE DISPLAY
            ============================================= */}
            {step === 2 && method === 'qrcode' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Escaneie o QR Code</h3>
                  <p className="text-sm text-gray-500">
                    Abra o WhatsApp no celular {'>'} Menu {'>'} Aparelhos conectados {'>'} Conectar
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="flex justify-center">
                  <div className="relative w-64 h-64 bg-white rounded-2xl p-4 flex items-center justify-center">
                    {qrStatus === 'generating' && !qrCode && (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        <p className="text-sm text-gray-500">Gerando QR Code...</p>
                      </div>
                    )}

                    {qrCode && qrStatus !== 'connected' && (
                      <img 
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="QR Code"
                        className="w-full h-full object-contain"
                      />
                    )}

                    {qrStatus === 'connected' && (
                      <div className="flex flex-col items-center gap-3">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                        <p className="text-sm text-gray-700 font-medium">Conectado!</p>
                      </div>
                    )}

                    {qrStatus === 'timeout' && (
                      <div className="flex flex-col items-center gap-3">
                        <WifiOff className="w-8 h-8 text-red-400" />
                        <p className="text-sm text-gray-500">QR expirado</p>
                      </div>
                    )}

                    {qrStatus === 'error' && (
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                        <p className="text-sm text-red-500">Erro</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-center gap-2">
                  {qrStatus === 'generating' && (
                    <>
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                      <span className="text-sm text-yellow-400">Aguardando leitura do QR Code...</span>
                    </>
                  )}
                  {qrStatus === 'connected' && (
                    <>
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                      <span className="text-sm text-green-400">Conectado: {connectedNumber}</span>
                    </>
                  )}
                  {qrStatus === 'timeout' && (
                    <>
                      <div className="w-2 h-2 bg-red-400 rounded-full" />
                      <span className="text-sm text-red-400">QR Code expirou</span>
                    </>
                  )}
                </div>

                {/* Refresh Button */}
                {(qrStatus === 'timeout' || qrStatus === 'error' || (qrCode && qrStatus === 'generating')) && (
                  <div className="flex justify-center">
                    <button
                      onClick={refreshQRCode}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 rounded-xl text-sm text-gray-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Gerar novo QR Code
                    </button>
                  </div>
                )}

                {/* Instructions */}
                <div className="p-4 bg-white rounded-xl">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    Instruções
                  </h4>
                  <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                    <li>Abra o WhatsApp no seu celular</li>
                    <li>Toque em <strong>Menu</strong> (⋮) ou <strong>Configurações</strong></li>
                    <li>Selecione <strong>Aparelhos conectados</strong></li>
                    <li>Toque em <strong>Conectar um aparelho</strong></li>
                    <li>Aponte a câmera para o QR Code acima</li>
                  </ol>
                </div>
              </div>
            )}

            {/* =============================================
                STEP 3 - SUCCESS
            ============================================= */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center py-6">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    method === 'qrcode'
                      ? 'bg-green-500/20'
                      : method === 'embedded'
                        ? 'bg-[#1877F2]/15'
                        : 'bg-blue-500/20'
                  }`}>
                    <CheckCircle2 className={`w-8 h-8 ${
                      method === 'qrcode'
                        ? 'text-green-500'
                        : method === 'embedded'
                          ? 'text-[#1877F2]'
                          : 'text-blue-500'
                    }`} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Conectado com Sucesso!</h3>
                  <p className="text-gray-500">
                    {method === 'qrcode'
                      ? `WhatsApp: ${connectedNumber || 'Número conectado'}`
                      : `${result?.config?.business_name || 'WhatsApp Business'} • ${result?.config?.phone_number || ''}`
                    }
                  </p>
                </div>

                {/* Webhook Config - Only for Official API */}
                {method === 'official' && result?.config && (
                  <div className="p-4 bg-white rounded-xl space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      Configure o Webhook no Meta
                    </h4>
                    
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Callback URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={result.config?.webhook_url || `${window.location.origin}/api/whatsapp/webhook`}
                          className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
                        />
                        <button
                          onClick={() => copyToClipboard(result.config?.webhook_url || `${window.location.origin}/api/whatsapp/webhook`)}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Verify Token</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={result.config?.webhook_verify_token || ''}
                          className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
                        />
                        <button
                          onClick={() => copyToClipboard(result.config?.webhook_verify_token || '')}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* QR Code Success Info */}
                {method === 'qrcode' && (
                  <div className="p-4 bg-white rounded-xl">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                      <Wifi className="w-4 h-4 text-green-400" />
                      Conexão Ativa
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-400" />
                        Mensagens sincronizadas em tempo real
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-400" />
                        Envio e recebimento ativos
                      </li>
                      <li className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        Mantenha o celular conectado à internet
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            {step === 1 && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                {method === 'embedded' ? (
                  <span className="text-xs text-gray-400">
                    {embeddedFlagLoaded ? 'Use o botão acima para autenticar' : 'Carregando…'}
                  </span>
                ) : (
                  <button
                    onClick={
                      method === 'qrcode'
                        ? () => { generateQRCode(); setStep(2); }
                        : handleOfficialConnect
                    }
                    disabled={loading || (method === 'official' && (!phoneNumberId || !accessToken))}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      method === 'qrcode'
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {method === 'qrcode' ? 'Iniciando...' : 'Conectando...'}
                      </>
                    ) : (
                      <>
                        {method === 'qrcode' ? (
                          <>Gerar QR Code <ChevronRight className="w-4 h-4" /></>
                        ) : (
                          <><Check className="w-4 h-4" /> Conectar</>
                        )}
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {step === 2 && method === 'qrcode' && (
              <>
                <button
                  onClick={() => { stopPolling(); setStep(1); }}
                  className="px-4 py-2.5 text-gray-500 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                {qrStatus === 'connected' && (
                  <button
                    onClick={() => setStep(3)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-gray-900 font-medium transition-colors"
                  >
                    Continuar
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <div />
                <button
                  onClick={handleFinish}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-colors ${
                    method === 'qrcode'
                      ? 'bg-green-500 hover:bg-green-600'
                      : method === 'embedded'
                        ? 'bg-[#1877F2] hover:bg-[#166FE5]'
                        : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  Concluir
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
