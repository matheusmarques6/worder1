'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Store,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  Package,
  Users,
  ShoppingCart,
  Zap,
  Eye,
  ShoppingBag,
} from 'lucide-react'

interface AddStoreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (store: { name: string; domain: string; accessToken: string; apiSecret?: string }) => void
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Autorização negada pelo Shopify',
  missing_params: 'Parâmetros inválidos na resposta',
  invalid_state: 'Sessão inválida — tente novamente',
  state_expired: 'Sessão expirada — tente novamente',
  save_failed: 'Erro ao salvar configuração',
  oauth_not_configured: 'Credenciais OAuth não configuradas no servidor',
}

export function AddStoreModal({ isOpen, onClose, onSuccess }: AddStoreModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [storeDomain, setStoreDomain] = useState('')

  const handleConnect = async () => {
    const domain = storeDomain.trim().replace('.myshopify.com', '').replace(/[^a-z0-9-]/gi, '')
    if (!domain) {
      setError('Informe o domínio da sua loja')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/integrations/shopify/auth?shop=${domain}.myshopify.com`)
      const data = await res.json()

      if (data.authUrl) {
        // Redirect to Shopify OAuth consent screen
        window.location.href = data.authUrl
      } else {
        setError(data.error || 'Erro ao gerar URL de autorização')
        setIsLoading(false)
      }
    } catch {
      setError('Erro de conexão com o servidor')
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setStoreDomain('')
    setError('')
    setIsLoading(false)
    onClose()
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
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="pt-8 pb-4 px-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#95BF47] to-[#5E8E3E] flex items-center justify-center">
              <Store className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Conecte sua loja Shopify</h2>
            <p className="text-gray-500 mt-2">
              Autorize o Worder a acessar sua loja para sincronizar dados automaticamente
            </p>
          </div>

          {/* Form */}
          <div className="px-8 pb-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Domínio Shopify
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={storeDomain}
                    onChange={(e) => setStoreDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="minhaloja"
                    className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-l-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#95BF47] focus:border-[#95BF47] transition-colors"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleConnect()}
                  />
                  <span className="px-4 py-3 bg-gray-50 border border-l-0 border-gray-300 rounded-r-xl text-gray-500 text-sm flex items-center">
                    .myshopify.com
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Encontre em: Shopify Admin &rarr; Configurações &rarr; Domínios
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Connect Button */}
            <button
              onClick={handleConnect}
              disabled={!storeDomain.trim() || isLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 mt-6 rounded-xl font-medium transition-all bg-[#95BF47] hover:bg-[#7da03a] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Redirecionando para Shopify...
                </>
              ) : (
                <>
                  <Store className="w-5 h-5" />
                  Conectar Loja Shopify
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            {/* What syncs */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">O que será sincronizado</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Package, label: 'Pedidos em tempo real' },
                  { icon: Users, label: 'Clientes e contatos' },
                  { icon: ShoppingCart, label: 'Carrinhos abandonados' },
                  { icon: ShoppingBag, label: 'Catálogo de produtos' },
                  { icon: Eye, label: 'Tracking comportamental' },
                  { icon: Zap, label: 'Rastreio e entregas' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default AddStoreModal
