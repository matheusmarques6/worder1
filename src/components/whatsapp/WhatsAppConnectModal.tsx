'use client'

import { useState, useEffect } from 'react'
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
  XCircle,
  HelpCircle
} from 'lucide-react'

interface WhatsAppConnectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  organizationId: string
  existingConfig?: any
}

export default function WhatsAppConnectModal({
  isOpen,
  onClose,
  onSuccess,
  organizationId,
  existingConfig
}: WhatsAppConnectModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [expandedGuide, setExpandedGuide] = useState<number | null>(1)
  
  // Form fields
  const [phoneNumberId, setPhoneNumberId] = useState(existingConfig?.phone_number_id || '')
  const [wabaId, setWabaId] = useState(existingConfig?.waba_id || '')
  const [accessToken, setAccessToken] = useState('')
  
  // Result
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    if (existingConfig) {
      setPhoneNumberId(existingConfig.phone_number_id || '')
      setWabaId(existingConfig.waba_id || '')
    }
  }, [existingConfig])

  const handleConnect = async () => {
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
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
                <h2 className="text-xl font-bold text-white">Conectar WhatsApp Business</h2>
                <p className="text-sm text-dark-400">Meta Cloud API</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-dark-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-dark-400" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="px-6 py-4 border-b border-dark-700/50">
            <div className="flex items-center justify-between">
              {[
                { num: 1, label: 'Guia' },
                { num: 2, label: 'Credenciais' },
                { num: 3, label: 'Concluído' }
              ].map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                    ${step >= s.num 
                      ? 'bg-green-500 text-white' 
                      : 'bg-dark-700 text-dark-400'
                    }
                  `}>
                    {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`ml-2 text-sm ${step >= s.num ? 'text-white' : 'text-dark-500'}`}>
                    {s.label}
                  </span>
                  {i < 2 && (
                    <div className={`w-16 h-0.5 mx-4 ${step > s.num ? 'bg-green-500' : 'bg-dark-700'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Step 1: Guia */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300">
                        Para conectar, você precisa de uma conta no <strong>Meta Business Suite</strong> com um número de WhatsApp Business registrado.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Guia Expandível */}
                <div className="space-y-3">
                  {/* Passo 1 */}
                  <div className="border border-dark-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGuide(expandedGuide === 1 ? null : 1)}
                      className="w-full p-4 flex items-center justify-between hover:bg-dark-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-medium">1</span>
                        <span className="font-medium text-white">Acessar Meta for Developers</span>
                      </div>
                      {expandedGuide === 1 ? <ChevronDown className="w-5 h-5 text-dark-400" /> : <ChevronRight className="w-5 h-5 text-dark-400" />}
                    </button>
                    {expandedGuide === 1 && (
                      <div className="px-4 pb-4 text-sm text-dark-300 space-y-2">
                        <p>1. Acesse <a href="https://developers.facebook.com" target="_blank" className="text-green-400 hover:underline">developers.facebook.com</a></p>
                        <p>2. Faça login com sua conta do Facebook</p>
                        <p>3. Vá em <strong>My Apps</strong> e selecione seu app com WhatsApp</p>
                        <p>4. No menu lateral, clique em <strong>WhatsApp {'>'} API Setup</strong></p>
                      </div>
                    )}
                  </div>

                  {/* Passo 2 */}
                  <div className="border border-dark-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGuide(expandedGuide === 2 ? null : 2)}
                      className="w-full p-4 flex items-center justify-between hover:bg-dark-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-medium">2</span>
                        <span className="font-medium text-white">Copiar Phone Number ID</span>
                      </div>
                      {expandedGuide === 2 ? <ChevronDown className="w-5 h-5 text-dark-400" /> : <ChevronRight className="w-5 h-5 text-dark-400" />}
                    </button>
                    {expandedGuide === 2 && (
                      <div className="px-4 pb-4 text-sm text-dark-300 space-y-2">
                        <p>Na página de API Setup, você verá:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li><strong>Phone Number ID</strong> - Um número tipo "123456789012345"</li>
                          <li><strong>WhatsApp Business Account ID</strong> - Outro número similar (opcional)</li>
                        </ul>
                        <p className="text-amber-400">⚠️ Copie esses IDs, não o número de telefone!</p>
                      </div>
                    )}
                  </div>

                  {/* Passo 3 */}
                  <div className="border border-dark-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGuide(expandedGuide === 3 ? null : 3)}
                      className="w-full p-4 flex items-center justify-between hover:bg-dark-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-medium">3</span>
                        <span className="font-medium text-white">Gerar Access Token Permanente</span>
                      </div>
                      {expandedGuide === 3 ? <ChevronDown className="w-5 h-5 text-dark-400" /> : <ChevronRight className="w-5 h-5 text-dark-400" />}
                    </button>
                    {expandedGuide === 3 && (
                      <div className="px-4 pb-4 text-sm text-dark-300 space-y-2">
                        <p className="text-amber-400">⚠️ O token temporário expira em 24h. Crie um permanente:</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>Vá em <strong>Business Settings {'>'} Users {'>'} System Users</strong></li>
                          <li>Clique em <strong>Add</strong> para criar um System User</li>
                          <li>Dê o nome (ex: "Worder API") e role <strong>Admin</strong></li>
                          <li>Clique em <strong>Add Assets</strong>, selecione seu App e WABA</li>
                          <li>Clique em <strong>Generate Token</strong></li>
                          <li>Selecione permissões: <code className="bg-dark-700 px-1 rounded">whatsapp_business_messaging</code> e <code className="bg-dark-700 px-1 rounded">whatsapp_business_management</code></li>
                          <li>Copie o token gerado (só aparece uma vez!)</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>

                <a
                  href="https://business.facebook.com/settings/whatsapp-business-accounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full p-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir Meta Business Suite
                </a>
              </div>
            )}

            {/* Step 2: Credenciais */}
            {step === 2 && (
              <div className="space-y-5">
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-300">{error}</p>
                    </div>
                  </div>
                )}

                {/* Phone Number ID */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Phone Number ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="Ex: 123456789012345"
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Encontre em: WhatsApp {'>'} API Setup {'>'} Phone Number ID
                  </p>
                </div>

                {/* WABA ID */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    WhatsApp Business Account ID
                    <span className="text-dark-500 ml-1">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    placeholder="Ex: 987654321098765"
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Necessário para gerenciar templates e ver métricas avançadas
                  </p>
                </div>

                {/* Access Token */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Access Token Permanente <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="EAAG..."
                      className="w-full px-4 py-3 pr-12 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-white"
                    >
                      {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-dark-500 mt-1">
                    Use um System User Token para não expirar
                  </p>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-300">
                      <p className="font-medium">Importante:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-amber-300/80">
                        <li>Nunca compartilhe seu Access Token</li>
                        <li>Use tokens permanentes (System User)</li>
                        <li>Tokens temporários expiram em 24h</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Sucesso */}
            {step === 3 && result && (
              <div className="space-y-6">
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Conectado com Sucesso!</h3>
                  <p className="text-dark-400">
                    {result.config?.business_name || 'WhatsApp Business'} • {result.config?.phone_number}
                  </p>
                </div>

                {/* Webhook Config */}
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

                  <div className="text-xs text-dark-500">
                    <p>Campos para se inscrever: <code className="bg-dark-700 px-1 rounded">messages</code></p>
                  </div>
                </div>

                <a
                  href={`https://developers.facebook.com/apps/${result.config?.phone_number_id?.slice(0, 15) || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full p-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Configurar Webhook no Meta
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-dark-700 flex items-center justify-between">
            {step === 1 && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-white font-medium transition-colors"
                >
                  Tenho as credenciais
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-dark-400 hover:text-white transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConnect}
                  disabled={loading || !phoneNumberId || !accessToken}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
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

            {step === 3 && (
              <>
                <div />
                <button
                  onClick={() => {
                    onSuccess()
                    onClose()
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-white font-medium transition-colors"
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
