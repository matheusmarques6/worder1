'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, CheckCircle, Loader2, Building2, Store, ArrowLeft, KeyRound, Eye, EyeOff, ExternalLink } from 'lucide-react'

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

  // Step 2: Manual Shopify integration
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const handleClose = () => {
    setStep('info')
    setStoreName('')
    setStoreSegment('')
    setStoreCurrency('BRL')
    setShopifyDomain('')
    setClientId('')
    setClientSecret('')
    setShowSecret(false)
    setError('')
    setLoading(false)
    setConnecting(false)
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

  const handleManualConnect = async () => {
    const domain = shopifyDomain.trim().replace('.myshopify.com', '').replace(/[^a-z0-9-]/gi, '')
    if (!domain) {
      setError('Informe o domínio Shopify')
      return
    }
    if (!clientId.trim()) {
      setError('Informe o Client ID')
      return
    }
    if (!clientSecret.trim()) {
      setError('Informe o Client Secret')
      return
    }

    setConnecting(true)
    setError('')

    try {
      const res = await fetch('/api/integrations/shopify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: `${domain}.myshopify.com`,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        let errorMsg = data.error || 'Erro ao conectar loja.'
        if (data.missingScopes?.length > 0) {
          errorMsg = `Permissões obrigatórias ausentes: ${data.missingScopes.join(', ')}. Configure os escopos no Shopify Dev Dashboard e reinstale o app.`
        }
        setError(errorMsg)
        setConnecting(false)
        return
      }

      // Manual integration succeeded — real store was created.
      // Clean up the placeholder .worder.local row.
      if (createdStoreId) {
        fetch(`/api/stores/${createdStoreId}`, { method: 'DELETE' }).catch(() => {})
      }

      const realStore = data.store
      const storeId = realStore?.id

      // Trigger post-connect cascade (webhooks, pixel, sync)
      if (storeId) {
        fetch('/api/shopify/install-extras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId }),
          keepalive: true,
        }).catch(() => {})

        fetch('/api/shopify/sync-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, syncType: 'all', historical: true }),
          keepalive: true,
        }).catch(() => {})
      }

      onSuccess({
        id: storeId,
        name: realStore?.name || storeName,
        domain: realStore?.domain,
      })
      handleClose()
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setConnecting(false)
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

          {/* Step 1: Store Info */}
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

          {/* Step 2: Manual Shopify Integration */}
          {step === 'integration' && (
            <div className="px-8 pb-8">
              <button onClick={() => { setStep('info'); setError('') }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-50 flex items-center justify-center">
                  <Image src="/integrations/icone shopify .png" alt="Shopify" width={32} height={32} className="object-contain" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Conectar Shopify</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Loja <span className="font-medium text-gray-700">{storeName}</span> criada com sucesso!
                  <br />Conecte sua loja Shopify via Custom App.
                </p>
              </div>

              {/* Manual integration form */}
              <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-[#95BF47]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Integração via Custom App</p>
                    <p className="text-xs text-gray-500">Use as credenciais do seu app customizado</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Domínio da loja</label>
                  <div className="flex">
                    <input type="text" value={shopifyDomain}
                      onChange={e => setShopifyDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="minhaloja"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-l-lg text-sm text-gray-900 focus:border-[#95BF47] focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && e.preventDefault()} />
                    <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-200 rounded-r-lg text-xs text-gray-400 flex items-center">
                      .myshopify.com
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Client ID</label>
                  <input type="text" value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    placeholder="Cole o Client ID do Dev Dashboard"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-[#95BF47] focus:outline-none font-mono text-xs"
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Client Secret</label>
                  <div className="relative">
                    <input type={showSecret ? 'text' : 'password'} value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      placeholder="Cole o Client Secret do Dev Dashboard"
                      className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-[#95BF47] focus:outline-none font-mono text-xs"
                      onKeyDown={e => e.key === 'Enter' && !connecting && handleManualConnect()} />
                    <button type="button" onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button onClick={handleManualConnect}
                  disabled={connecting || !shopifyDomain.trim() || !clientId.trim() || !clientSecret.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-[#95BF47] hover:bg-[#7da03a] text-white disabled:opacity-50 transition-colors text-sm">
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                    <Store className="w-4 h-4" /> Conectar Shopify <ArrowRight className="w-4 h-4" />
                  </>}
                </button>

                {/* Help link */}
                <div className="pt-1 border-t border-gray-100">
                  <a href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    Como criar um Custom App no Shopify
                  </a>
                </div>
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
