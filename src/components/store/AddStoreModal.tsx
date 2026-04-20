'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Store, ArrowRight, CheckCircle, Loader2, Building2, Globe, ShoppingBag, ArrowLeft } from 'lucide-react'

interface AddStoreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (store: any) => void
}

type Step = 'info' | 'integration'

export function AddStoreModal({ isOpen, onClose, onSuccess }: AddStoreModalProps) {
  const [step, setStep] = useState<Step>('info')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Store info
  const [storeName, setStoreName] = useState('')
  const [storeSegment, setStoreSegment] = useState('')
  const [storeCurrency, setStoreCurrency] = useState('BRL')

  // Step 2: Shopify integration
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null)

  const handleClose = () => {
    setStep('info')
    setStoreName('')
    setStoreSegment('')
    setStoreCurrency('BRL')
    setShopifyDomain('')
    setError('')
    setLoading(false)
    setCreatedStoreId(null)
    onClose()
  }

  const handleCreateStore = async () => {
    if (!storeName.trim()) {
      setError('Informe o nome da loja')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName.trim(),
          segment: storeSegment,
          currency: storeCurrency,
        }),
      })
      const data = await res.json()

      if (res.ok && (data.store || data.id)) {
        const store = data.store || data
        setCreatedStoreId(store.id)
        setStep('integration')
      } else {
        setError(data.error || 'Erro ao criar loja')
      }
    } catch {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  const handleConnectShopify = async () => {
    const domain = shopifyDomain.trim().replace('.myshopify.com', '').replace(/[^a-z0-9-]/gi, '')
    if (!domain) {
      setError('Informe o domínio Shopify')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/integrations/shopify/auth?shop=${domain}.myshopify.com`)
      const data = await res.json()

      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError(data.error || 'Erro ao gerar URL de autorização')
        setLoading(false)
      }
    } catch {
      setError('Erro de conexão')
      setLoading(false)
    }
  }

  const handleSkipIntegration = () => {
    onSuccess({ id: createdStoreId, name: storeName })
    handleClose()
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
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        >
          <button onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors z-10">
            <X className="w-5 h-5" />
          </button>

          {/* Step indicator */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'info' ? 'bg-brand-500 text-white' : 'bg-emerald-500 text-white'}`}>
                {step === 'info' ? '1' : <CheckCircle className="w-4 h-4" />}
              </div>
              <div className={`h-0.5 flex-1 ${step === 'integration' ? 'bg-emerald-500' : 'bg-gray-200'}`} />
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'integration' ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                2
              </div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-500">Dados da Loja</span>
              <span className="text-[10px] text-gray-500">Integração</span>
            </div>
          </div>

          {/* ── STEP 1: Store Info ── */}
          {step === 'info' && (
            <div className="px-8 pb-8">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-brand-50 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-brand-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Nova Loja</h2>
                <p className="text-sm text-gray-500 mt-1">Informe os dados básicos da sua loja</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da loja *</label>
                  <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)}
                    placeholder="Ex: Minha Loja Online"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none"
                    autoFocus onKeyDown={e => e.key === 'Enter' && !loading && handleCreateStore()} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Segmento</label>
                  <select value={storeSegment} onChange={e => setStoreSegment(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
                    <option value="">Selecione...</option>
                    <option value="moda">Moda e Vestuário</option>
                    <option value="eletronicos">Eletrônicos</option>
                    <option value="beleza">Beleza e Cosméticos</option>
                    <option value="casa">Casa e Decoração</option>
                    <option value="esportes">Esportes e Fitness</option>
                    <option value="alimentos">Alimentos e Bebidas</option>
                    <option value="joias">Joias e Acessórios</option>
                    <option value="pet">Pet Shop</option>
                    <option value="saude">Saúde e Bem-estar</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Moeda</label>
                  <select value={storeCurrency} onChange={e => setStoreCurrency(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
                    <option value="BRL">Real (BRL)</option>
                    <option value="USD">Dólar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button onClick={handleCreateStore} disabled={!storeName.trim() || loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 mt-6 rounded-lg font-medium bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 transition-colors">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continuar <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          )}

          {/* ── STEP 2: Integration ── */}
          {step === 'integration' && (
            <div className="px-8 pb-8">
              <button onClick={() => setStep('info')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-50 flex items-center justify-center">
                  <Image src="/integrations/icone shopify .png" alt="Shopify" width={32} height={32} className="object-contain" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Conectar Plataforma</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Loja <span className="font-medium text-gray-700">{storeName}</span> criada com sucesso!
                  <br />Agora conecte sua plataforma de e-commerce.
                </p>
              </div>

              {/* Shopify connection */}
              <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Image src="/integrations/icone shopify .png" alt="Shopify" width={24} height={24} className="object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Shopify</p>
                    <p className="text-xs text-gray-500">Sincronize pedidos, clientes e produtos</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Domínio da loja</label>
                  <div className="flex">
                    <input type="text" value={shopifyDomain}
                      onChange={e => setShopifyDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="minhaloja"
                      className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-l-lg text-sm text-gray-900 focus:border-[#95BF47] focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && !loading && handleConnectShopify()} />
                    <span className="px-3 py-2.5 bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg text-xs text-gray-400 flex items-center">
                      .myshopify.com
                    </span>
                  </div>
                </div>

                <button onClick={handleConnectShopify} disabled={!shopifyDomain.trim() || loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-[#95BF47] hover:bg-[#7da03a] text-white disabled:opacity-50 transition-colors text-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                    <Store className="w-4 h-4" /> Conectar Shopify <ArrowRight className="w-4 h-4" />
                  </>}
                </button>
              </div>

              {/* Other platforms (coming soon) */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { name: 'WooCommerce', emoji: '🛒' },
                  { name: 'Nuvemshop', emoji: '☁️' },
                ].map(p => (
                  <div key={p.name} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg opacity-50">
                    <span className="text-lg">{p.emoji}</span>
                    <div>
                      <p className="text-xs font-medium text-gray-600">{p.name}</p>
                      <p className="text-[10px] text-gray-400">Em breve</p>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Skip integration */}
              <button onClick={handleSkipIntegration}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-4 py-2 transition-colors">
                Pular — configurar integração depois
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
