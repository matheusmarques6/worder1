'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Store,
  ArrowRight,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  HelpCircle,
  Key,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddStoreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (store: { name: string; domain: string; accessToken: string; apiSecret?: string }) => void
}

export function AddStoreModal({ isOpen, onClose, onSuccess }: AddStoreModalProps) {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Form data
  const [storeName, setStoreName] = useState('')
  const [storeDomain, setStoreDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [apiSecret, setApiSecret] = useState('')

  const totalSteps = 4

  const handleSubmit = async () => {
    // ✅ apiSecret é opcional
    if (!storeName || !storeDomain || !accessToken) {
      setError('Preencha todos os campos obrigatórios')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Call API to connect store
      const response = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName,
          domain: storeDomain.replace('.myshopify.com', ''),
          accessToken,
          apiSecret: apiSecret || undefined, // ✅ Opcional
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao conectar loja')
      }

      // Success!
      onSuccess({
        name: storeName,
        domain: `${storeDomain}.myshopify.com`,
        accessToken,
        apiSecret: apiSecret || undefined, // ✅ Opcional
      })
      
      // Reset form
      setStoreName('')
      setStoreDomain('')
      setAccessToken('')
      setApiSecret('')
      setStep(1)
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar loja')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setStep(1)
    setStoreName('')
    setStoreDomain('')
    setAccessToken('')
    setApiSecret('')
    setError('')
    onClose()
  }

  const canProceed = () => {
    if (step === 1) return storeName.trim().length > 0
    if (step === 2) return storeDomain.trim().length > 0
    if (step === 3) return accessToken.trim().length > 0
    if (step === 4) return true // ✅ API Secret é opcional
    return false
  }

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1)
      setError('')
    } else {
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="pt-8 pb-4 px-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <Store className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Conecte sua loja Shopify</h2>
            <p className="text-gray-500 mt-2">
              Configure sua loja para começar a monitorar seus lucros
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 px-8 pb-6">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  s === step ? 'w-8 bg-primary-500' : 'w-8',
                  s < step ? 'bg-primary-500' : 'bg-gray-100'
                )}
              />
            ))}
          </div>

          {/* Form Steps */}
          <div className="px-8 pb-8">
            <AnimatePresence mode="wait">
              {/* Step 1: Store Name */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Nome da Loja
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Ex: Minha Loja Principal"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                      autoFocus
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Um nome para identificar sua loja no dashboard
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Domain */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Domínio Shopify
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={storeDomain}
                        onChange={(e) => setStoreDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="minha-loja"
                        className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-l-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                        autoFocus
                      />
                      <span className="px-4 py-3 bg-gray-100 border border-gray-200 rounded-r-xl text-gray-500 text-sm">
                        .myshopify.com
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Encontre em: Shopify Admin → Configurações → Domínios
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Access Token */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-brand-600" />
                        Access Token da API
                      </div>
                    </label>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="shpat_xxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors font-mono"
                      autoFocus
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Token de acesso da Admin API do Shopify.{' '}
                      <a
                        href="https://help.shopify.com/en/manual/apps/custom-apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-500 inline-flex items-center gap-1"
                      >
                        Como obter? <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Step 4: API Secret */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-green-400" />
                        API Secret Key <span className="text-gray-400 font-normal">(opcional)</span>
                      </div>
                    </label>
                    <input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="shpss_xxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors font-mono"
                      autoFocus
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Opcional. Usado para validar webhooks e receber eventos em tempo real.
                    </p>
                  </div>

                  {/* Help Box */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-gray-900 mb-1">Onde encontrar:</p>
                        <ol className="text-gray-500 space-y-1 list-decimal list-inside">
                          <li>Shopify Admin → Configurações → Apps</li>
                          <li>Clique no seu app customizado</li>
                          <li>Vá em "API credentials"</li>
                          <li>Copie o "API secret key"</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  {/* Info about webhooks */}
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <p className="text-xs text-green-400">
                      💡 Com o API Secret, você recebe atualizações em tempo real de pedidos, clientes e estoque.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-6">
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="px-6 py-3 text-gray-500 hover:text-white transition-colors"
                >
                  Voltar
                </button>
              )}
              <button
                onClick={nextStep}
                disabled={!canProceed() || isLoading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all',
                  canProceed() && !isLoading
                    ? 'bg-primary-500 hover:bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Conectando...
                  </>
                ) : step === totalSteps ? (
                  <>
                    Conectar Loja
                    <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default AddStoreModal
