'use client'

import { useState, useEffect } from 'react'
import { useStoreStore } from '@/stores'
import { getSupabaseClient } from '@/lib/supabase-client'
import { authedFetch } from '@/lib/api/authed-fetch'
import { useFacebookEmbeddedSignup } from '@/hooks/useFacebookEmbeddedSignup'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  MessageSquare,
  Check,
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Info,
  Loader2,
  CheckCircle2,
  Cloud,
  Zap,
  Facebook,
  Sparkles
} from 'lucide-react'

// =============================================
// TYPES
// =============================================

type ConnectionMethod = 'embedded' | 'official'

interface WhatsAppConnectUnifiedProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (instance: any) => void
  organizationId: string
  storeId?: string | null
  existingConfig?: any
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

  // API Official State
  const [phoneNumberId, setPhoneNumberId] = useState(existingConfig?.phone_number_id || '')
  const [wabaId, setWabaId] = useState(existingConfig?.waba_id || '')
  const [accessToken, setAccessToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [result, setResult] = useState<any>(null)

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
        // silent — falls back to official
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
  // API OFFICIAL METHODS
  // =============================================

  const handleOfficialConnect = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await authedFetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          storeId: effectiveStoreId,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim() || undefined,
          accessToken: accessToken.trim()
        })
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        const parts: string[] = []
        if (data.error) parts.push(data.error)
        if (data.instructions) parts.push(data.instructions)
        if (data.details) {
          const d = data.details
          const flags: string[] = []
          if (d.subscribed === false) flags.push(`subscribe falhou${d.subscription_error ? ': ' + d.subscription_error : ''}`)
          if (d.registered === false) flags.push(`register falhou${d.register_error ? ': ' + d.register_error : ''}`)
          if (d.waba_id_detected === false) flags.push('WABA ID não detectado')
          if (flags.length) parts.push(`Diagnóstico: ${flags.join(' | ')}`)
        }
        const msg = parts.join('\n\n') || 'Erro ao conectar'
        setError(msg)
        return
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
    setStep(1)
    setError('')
    embedded.reset()
    onClose()
  }

  const handleFinish = () => {
    const instanceData = { ...result?.config, type: 'META_CLOUD' }
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
                    : 'API Oficial Meta (manual)'}
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
              </div>
            </div>
          )}

          {/* Progress Steps */}
          {step > 1 && (
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-center gap-4">
                {[
                  { num: 1, label: 'Credenciais' },
                  { num: 2, label: 'Conectando' },
                  { num: 3, label: 'Concluído' }
                ].map((s, i) => {
                  const activeColor = method === 'embedded' ? 'bg-[#1877F2]' : 'bg-blue-500'
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
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
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
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
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
                        className="w-full px-4 py-3 pr-12 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                      >
                        {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* =============================================
                STEP 3 - SUCCESS
            ============================================= */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center py-6">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    method === 'embedded' ? 'bg-[#1877F2]/15' : 'bg-blue-500/20'
                  }`}>
                    <CheckCircle2 className={`w-8 h-8 ${
                      method === 'embedded' ? 'text-[#1877F2]' : 'text-blue-500'
                    }`} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Conectado com Sucesso!</h3>
                  <p className="text-gray-500">
                    {`${result?.config?.business_name || 'WhatsApp Business'} • ${result?.config?.phone_number || ''}`}
                  </p>
                </div>

                {/* Subscription status (Manual Cloud only) */}
                {method === 'official' && result && (
                  result.app_subscribed ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <p className="text-sm text-emerald-700 font-medium">
                        ✅ App inscrito no WABA — a Meta vai enviar mensagens recebidas para o seu webhook.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm text-amber-800 font-medium">⚠️  App ainda não inscrito no WABA</p>
                      <p className="text-xs text-amber-700 mt-1">
                        {result.subscription_error || 'Sem subscription, a Meta valida o webhook mas não envia mensagens.'} Volte ao Meta Business Suite → WhatsApp → Configuração → Webhooks → seção <strong>Campos do webhook</strong> e clique em <strong>Assinar</strong> nos campos <code>messages</code> e <code>message_status</code>.
                      </p>
                    </div>
                  )
                )}

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
                          value={result.config?.webhook_url || `${window.location.origin}/api/whatsapp/cloud/webhook`}
                          className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
                        />
                        <button
                          onClick={() => copyToClipboard(result.config?.webhook_url || `${window.location.origin}/api/whatsapp/cloud/webhook`)}
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
                    onClick={handleOfficialConnect}
                    disabled={loading || !phoneNumberId || !accessToken}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-600"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> Conectar
                      </>
                    )}
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
                    method === 'embedded'
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
