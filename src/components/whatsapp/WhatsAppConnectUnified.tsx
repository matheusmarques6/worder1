'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Zap
} from 'lucide-react'

// =============================================
// TYPES
// =============================================

type ConnectionMethod = 'official' | 'qrcode'
type ConnectionStatus = 'idle' | 'generating' | 'connecting' | 'connected' | 'error' | 'timeout'

interface WhatsAppConnectUnifiedProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (instance: any) => void
  organizationId: string
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
  existingConfig
}: WhatsAppConnectUnifiedProps) {
  // State
  const [method, setMethod] = useState<ConnectionMethod>('qrcode')
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
          title: evolutionConfig.instanceName || 'WhatsApp Business',
          api_type: 'EVOLUTION',
          api_url: evolutionConfig.apiUrl,
          api_key: evolutionConfig.apiKey
        })
      })

      const createData = await createResponse.json()
      
      if (!createResponse.ok) {
        throw new Error(createData.error || 'Erro ao criar instância')
      }

      const newInstanceId = createData.instance?.id
      setInstanceId(newInstanceId)

      // 2. Gerar QR Code
      await requestQRCode(newInstanceId)
      
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
          id: instId,
          organization_id: organizationId
        })
      })

      const data = await response.json()

      if (data.qr_code) {
        setQrCode(data.qr_code)
        setQrStatus('generating')
      } else if (data.status === 'ACTIVE') {
        setQrStatus('connected')
        setConnectedNumber(data.phone_number)
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
            id: instId
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
          className="w-full max-w-2xl max-h-[90vh] bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-dark-700 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Conectar WhatsApp</h2>
                <p className="text-sm text-dark-400">
                  {method === 'qrcode' ? 'Via QR Code' : 'API Oficial Meta'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-dark-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>

          {/* Method Selector - Step 1 Only */}
          {step === 1 && (
            <div className="px-6 py-4 border-b border-dark-700/50">
              <div className="flex gap-2 p-1 bg-dark-800 rounded-xl">
                <button
                  onClick={() => setMethod('qrcode')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-all ${
                    method === 'qrcode'
                      ? 'bg-green-500 text-white'
                      : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
                <button
                  onClick={() => setMethod('official')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-all ${
                    method === 'official'
                      ? 'bg-blue-500 text-white'
                      : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  API Oficial
                </button>
              </div>
            </div>
          )}

          {/* Progress Steps */}
          {step > 1 && (
            <div className="px-6 py-4 border-b border-dark-700/50">
              <div className="flex items-center justify-center gap-4">
                {[
                  { num: 1, label: method === 'qrcode' ? 'QR Code' : 'Credenciais' },
                  { num: 2, label: 'Conectando' },
                  { num: 3, label: 'Concluído' }
                ].map((s, i) => (
                  <div key={s.num} className="flex items-center">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                      ${step >= s.num 
                        ? method === 'qrcode' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                        : 'bg-dark-700 text-dark-400'
                      }
                    `}>
                      {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                    </div>
                    {i < 2 && (
                      <div className={`w-12 h-0.5 mx-2 ${
                        step > s.num 
                          ? method === 'qrcode' ? 'bg-green-500' : 'bg-blue-500'
                          : 'bg-dark-700'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
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
                  <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <Zap className="w-5 h-5 text-yellow-400 mb-2" />
                    <h4 className="font-medium text-white text-sm">Conexão Instantânea</h4>
                    <p className="text-xs text-dark-400 mt-1">Conecte em segundos, sem configurações complexas</p>
                  </div>
                  <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-blue-400 mb-2" />
                    <h4 className="font-medium text-white text-sm">Qualquer Número</h4>
                    <p className="text-xs text-dark-400 mt-1">Use seu WhatsApp pessoal ou Business</p>
                  </div>
                </div>

                {/* Evolution API Config (Advanced) */}
                <div className="border border-dark-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowEvolutionConfig(!showEvolutionConfig)}
                    className="w-full p-4 flex items-center justify-between hover:bg-dark-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Settings2 className="w-5 h-5 text-dark-400" />
                      <span className="text-sm text-dark-300">Configurações Avançadas</span>
                    </div>
                    {showEvolutionConfig ? (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-dark-400" />
                    )}
                  </button>
                  
                  {showEvolutionConfig && (
                    <div className="px-4 pb-4 space-y-4">
                      <div>
                        <label className="block text-xs text-dark-400 mb-1">Nome da Instância</label>
                        <input
                          type="text"
                          value={evolutionConfig.instanceName}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, instanceName: e.target.value }))}
                          placeholder="Ex: Atendimento Principal"
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-dark-400 mb-1">API URL (Evolution)</label>
                        <input
                          type="text"
                          value={evolutionConfig.apiUrl}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                          placeholder="https://api.evolution.com"
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-dark-400 mb-1">API Key</label>
                        <input
                          type="password"
                          value={evolutionConfig.apiKey}
                          onChange={(e) => setEvolutionConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="Sua chave de API"
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500"
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
                  <div className="border border-dark-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGuide(expandedGuide === 1 ? null : 1)}
                      className="w-full p-4 flex items-center justify-between hover:bg-dark-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-medium">1</span>
                        <span className="font-medium text-white">Como obter as credenciais</span>
                      </div>
                      {expandedGuide === 1 ? <ChevronDown className="w-5 h-5 text-dark-400" /> : <ChevronRight className="w-5 h-5 text-dark-400" />}
                    </button>
                    {expandedGuide === 1 && (
                      <div className="px-4 pb-4 text-sm text-dark-300 space-y-2">
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
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Phone Number ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      WABA ID <span className="text-dark-500">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      placeholder="Ex: 987654321098765"
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Access Token <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="EAAG..."
                        className="w-full px-4 py-3 pr-12 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-white"
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
                  <h3 className="text-lg font-bold text-white mb-2">Escaneie o QR Code</h3>
                  <p className="text-sm text-dark-400">
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
                      className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 rounded-xl text-sm text-white transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Gerar novo QR Code
                    </button>
                  </div>
                )}

                {/* Instructions */}
                <div className="p-4 bg-dark-800 rounded-xl">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    Instruções
                  </h4>
                  <ol className="text-sm text-dark-300 space-y-2 list-decimal list-inside">
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
                    method === 'qrcode' ? 'bg-green-500/20' : 'bg-blue-500/20'
                  }`}>
                    <CheckCircle2 className={`w-8 h-8 ${
                      method === 'qrcode' ? 'text-green-400' : 'text-blue-400'
                    }`} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Conectado com Sucesso!</h3>
                  <p className="text-dark-400">
                    {method === 'qrcode' 
                      ? `WhatsApp: ${connectedNumber || 'Número conectado'}`
                      : `${result?.config?.business_name || 'WhatsApp Business'} • ${result?.config?.phone_number}`
                    }
                  </p>
                </div>

                {/* Webhook Config - Only for Official API */}
                {method === 'official' && result?.config && (
                  <div className="p-4 bg-dark-800 rounded-xl space-y-4">
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-400" />
                      Configure o Webhook no Meta
                    </h4>
                    
                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Callback URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={result.config?.webhook_url || `${window.location.origin}/api/whatsapp/webhook`}
                          className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-300"
                        />
                        <button
                          onClick={() => copyToClipboard(result.config?.webhook_url || `${window.location.origin}/api/whatsapp/webhook`)}
                          className="px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4 text-dark-300" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-dark-400 mb-1">Verify Token</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={result.config?.webhook_verify_token || ''}
                          className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-dark-300"
                        />
                        <button
                          onClick={() => copyToClipboard(result.config?.webhook_verify_token || '')}
                          className="px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
                        >
                          <Copy className="w-4 h-4 text-dark-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* QR Code Success Info */}
                {method === 'qrcode' && (
                  <div className="p-4 bg-dark-800 rounded-xl">
                    <h4 className="font-medium text-white flex items-center gap-2 mb-3">
                      <Wifi className="w-4 h-4 text-green-400" />
                      Conexão Ativa
                    </h4>
                    <ul className="text-sm text-dark-300 space-y-2">
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
          <div className="p-6 border-t border-dark-700 flex items-center justify-between">
            {step === 1 && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={method === 'qrcode' ? () => { generateQRCode(); setStep(2); } : () => setStep(2)}
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
                      Iniciando...
                    </>
                  ) : (
                    <>
                      {method === 'qrcode' ? 'Gerar QR Code' : 'Continuar'}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}

            {step === 2 && method === 'official' && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleOfficialConnect}
                  disabled={loading || !phoneNumberId || !accessToken}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Conectar
                    </>
                  )}
                </button>
              </>
            )}

            {step === 2 && method === 'qrcode' && (
              <>
                <button
                  onClick={() => { stopPolling(); setStep(1); }}
                  className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                {qrStatus === 'connected' && (
                  <button
                    onClick={() => setStep(3)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-white font-medium transition-colors"
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
                    method === 'qrcode' ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'
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
