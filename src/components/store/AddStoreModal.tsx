'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ArrowRight, CheckCircle, Loader2, Building2, Store, ArrowLeft,
  KeyRound, Eye, EyeOff, ExternalLink, Copy, CheckCircle2, ChevronDown,
  ChevronUp, Shield, Zap, AlertCircle,
} from 'lucide-react'

interface AddStoreModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (store: any) => void
}

type Step = 'info' | 'integration' | 'pixel' | 'done'

const REQUIRED_SCOPES = [
  'read_orders', 'read_customers', 'read_products',
]
const RECOMMENDED_SCOPES = [
  'read_all_orders', 'write_pixels', 'read_customer_events',
  'read_fulfillments', 'read_discounts', 'write_script_tags',
]

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
  const [showGuide, setShowGuide] = useState(true)

  // Step 3: Pixel installation
  const [connectedStoreId, setConnectedStoreId] = useState<string | null>(null)
  const [connectedDomain, setConnectedDomain] = useState<string | null>(null)
  const [pixelCode, setPixelCode] = useState<string | null>(null)
  const [copiedPixel, setCopiedPixel] = useState(false)
  const [loadingPixel, setLoadingPixel] = useState(false)

  // Step 4: Done
  const [connectedStoreName, setConnectedStoreName] = useState<string>('')
  const [webhooksInfo, setWebhooksInfo] = useState<string>('')

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
    setConnectedStoreId(null)
    setConnectedDomain(null)
    setPixelCode(null)
    setCopiedPixel(false)
    setShowGuide(true)
    setConnectedStoreName('')
    setWebhooksInfo('')
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
      const fullDomain = `${domain}.myshopify.com`
      const res = await fetch('/api/integrations/shopify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: fullDomain,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          // A loja criada no passo 1 É a loja: a integração conecta NELA
          // (mesmo id). Antes, conectava numa linha nova e deletava o
          // placeholder — a loja do usuário "sumia" e nascia outra do zero.
          storeId: createdStoreId || undefined,
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

      const realStore = data.store
      const storeId = realStore?.id

      // Trigger post-connect cascade
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

      setConnectedStoreId(storeId)
      setConnectedDomain(realStore?.domain || fullDomain)
      setConnectedStoreName(realStore?.name || storeName)
      setWebhooksInfo(
        data.webhooks
          ? `${data.webhooks.created + data.webhooks.existing}/${data.webhooks.total} webhooks registrados`
          : ''
      )

      // Fetch pixel code
      setLoadingPixel(true)
      try {
        const pRes = await fetch(
          `/api/integrations/shopify/pixel-code?shop=${encodeURIComponent(realStore?.domain || fullDomain)}`
        )
        const pJson = await pRes.json()
        if (pRes.ok && pJson.code) setPixelCode(pJson.code)
      } catch { /* non-blocking */ }
      setLoadingPixel(false)

      // Move to pixel step
      setStep('pixel')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    }
    setConnecting(false)
  }

  const handleCopyPixel = async () => {
    if (!pixelCode) return
    try {
      await navigator.clipboard.writeText(pixelCode)
      setCopiedPixel(true)
      setTimeout(() => setCopiedPixel(false), 2500)
    } catch {}
  }

  const handleFinish = () => {
    onSuccess({
      id: connectedStoreId,
      name: connectedStoreName || storeName,
      domain: connectedDomain,
    })
    handleClose()
  }

  const handleSkipIntegration = () => {
    onSuccess({ id: createdStoreId, name: storeName })
    handleClose()
  }

  const handleSkipPixel = () => {
    setStep('done')
  }

  if (!isOpen) return null

  const steps: { key: Step; label: string }[] = [
    { key: 'info', label: 'Dados' },
    { key: 'integration', label: 'Integração' },
    { key: 'pixel', label: 'Pixel' },
    { key: 'done', label: 'Pronto' },
  ]
  const stepIndex = steps.findIndex(s => s.key === step)

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
          className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          <button onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors z-10">
            <X className="w-5 h-5" />
          </button>

          {/* Step indicator */}
          <div className="px-8 pt-6 pb-2 flex-shrink-0">
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    i < stepIndex ? 'bg-emerald-500 text-white' :
                    i === stepIndex ? 'bg-brand-500 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {i < stepIndex ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 ${i < stepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {steps.map(s => (
                <span key={s.key} className="text-[10px] text-gray-500">{s.label}</span>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1">

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
              <button onClick={() => { setStep('info'); setError('') }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>

              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-gray-50 flex items-center justify-center">
                  <Image src="/integrations/icone shopify .png" alt="Shopify" width={28} height={28} className="object-contain" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Conectar Shopify</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Conecte via <strong>Custom App</strong> para sincronizar pedidos, clientes e produtos.
                </p>
              </div>

              {/* Collapsible guide: How to create Custom App */}
              <div className="border border-blue-200 bg-blue-50/50 rounded-xl mb-4 overflow-hidden">
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span className="text-[13px] font-semibold text-blue-900">Como criar o Custom App no Shopify</span>
                  </div>
                  {showGuide ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
                </button>

                {showGuide && (
                  <div className="px-4 pb-4 space-y-3">
                    <ol className="space-y-2.5 text-[12px] text-blue-900">
                      <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                        <span>
                          No Shopify Admin, vá em <strong>Configurações</strong> {'->'} <strong>Apps e canais de vendas</strong> {'->'} <strong>Desenvolver apps</strong>
                          {shopifyDomain && (
                            <a href={`https://${shopifyDomain}.myshopify.com/admin/settings/apps/development`}
                              target="_blank" rel="noopener noreferrer"
                              className="ml-1 inline-flex items-center gap-0.5 text-blue-600 hover:underline font-medium">
                              abrir <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                        <span>Clique <strong>"Criar um app"</strong> e nomeie como <strong>"Worder"</strong></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                        <div>
                          <span>Clique <strong>"Configurar escopos da Admin API"</strong> e ative:</span>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {REQUIRED_SCOPES.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-mono">{s}</span>
                            ))}
                          </div>
                          <p className="text-[11px] text-blue-700 mt-1">
                            Recomendados (tracking completo):
                          </p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {RECOMMENDED_SCOPES.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-mono border border-blue-200">{s}</span>
                            ))}
                          </div>
                        </div>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
                        <span>Clique <strong>"Salvar"</strong> e depois <strong>"Instalar app"</strong></span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">5</span>
                        <span>Na aba <strong>"Credenciais da API"</strong>, copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> e cole abaixo</span>
                      </li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Credential form */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
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
                  {connecting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
                  ) : (
                    <><Store className="w-4 h-4" /> Conectar Shopify <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>

              {/* Other platforms */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { name: 'WooCommerce', emoji: '🛒' },
                  { name: 'Nuvemshop', emoji: '☁️' },
                ].map(p => (
                  <div key={p.name} className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg opacity-50">
                    <span className="text-base">{p.emoji}</span>
                    <div>
                      <p className="text-xs font-medium text-gray-600">{p.name}</p>
                      <p className="text-[10px] text-gray-400">Em breve</p>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 mt-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button onClick={handleSkipIntegration}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-3 py-2 transition-colors">
                Pular — configurar integração depois
              </button>
            </div>
          )}

          {/* ── STEP 3: Pixel Installation ── */}
          {step === 'pixel' && (
            <div className="px-8 pb-8">
              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Loja conectada!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  <strong>{connectedStoreName}</strong> sincronizando em segundo plano.
                  <br />Agora instale o Custom Pixel para tracking completo.
                </p>
              </div>

              {/* Why pixel matters */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-semibold text-amber-900">
                    Sem o pixel, apenas pedidos e checkouts são rastreados.
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    Visualizações de produto, carrinho, browse abandonment e identidade cross-device dependem do pixel. Leva 30 segundos.
                  </p>
                </div>
              </div>

              {/* Step A: Copy code */}
              <div className="border border-gray-200 rounded-xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  <span className="text-[13px] font-semibold text-gray-900">Copie o código do pixel</span>
                </div>
                {loadingPixel || !pixelCode ? (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando snippet...
                  </div>
                ) : (
                  <div className="relative">
                    <pre className="text-[10px] font-mono bg-gray-900 text-emerald-400 p-3 pr-20 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto leading-relaxed">
                      {pixelCode}
                    </pre>
                    <button onClick={handleCopyPixel}
                      className="absolute top-2 right-2 px-2.5 py-1 text-[11px] font-semibold bg-white text-gray-700 hover:bg-gray-50 rounded border border-gray-300 shadow-sm flex items-center gap-1">
                      {copiedPixel ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copiedPixel ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                )}
              </div>

              {/* Step B: Paste instructions */}
              <div className="border border-gray-200 rounded-xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  <span className="text-[13px] font-semibold text-gray-900">Cole no Shopify Admin</span>
                </div>
                <ol className="text-[12px] text-gray-700 space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">a.</span>
                    <span>
                      Vá em <strong>Configurações</strong> {'>'} <strong>Customer Events</strong>
                      {connectedDomain && (
                        <a href={`https://${connectedDomain}/admin/settings/customer_events`}
                          target="_blank" rel="noopener noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 text-blue-600 hover:underline font-medium">
                          abrir <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">b.</span>
                    <span>Clique <strong>"Adicionar pixel personalizado"</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">c.</span>
                    <span>Nome: <strong>Worder</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">d.</span>
                    <span>Cole o código acima no editor</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">e.</span>
                    <span>Privacidade do cliente: <strong>"Não obrigatório"</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 font-mono text-[11px] flex-shrink-0">f.</span>
                    <span>Clique <strong>"Salvar"</strong> e depois <strong>"Conectar"</strong></span>
                  </li>
                </ol>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('done')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors text-sm">
                  Já instalei o pixel <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={handleSkipPixel}
                  className="px-4 py-2.5 rounded-lg font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors text-sm">
                  Depois
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Done ── */}
          {step === 'done' && (
            <div className="px-8 pb-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Tudo pronto!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  <strong>{connectedStoreName}</strong> está configurada e sincronizando.
                </p>
              </div>

              <div className="space-y-2 mb-6">
                <StatusItem label="Loja conectada" done />
                <StatusItem label={webhooksInfo || 'Webhooks registrados'} done />
                <StatusItem label="Sincronização inicial em andamento" done />
                <StatusItem label="Custom Pixel" done={false} hint="Verifique no diagnóstico de tracking" />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                <p className="text-[12px] text-gray-600 leading-relaxed">
                  Os pedidos, clientes e produtos estão sendo importados em segundo plano.
                  O pixel pode levar alguns minutos para começar a receber eventos após ser instalado no Shopify.
                  Acompanhe tudo no <strong>diagnóstico de tracking</strong>.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={handleFinish}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium bg-gray-900 hover:bg-gray-800 text-white transition-colors text-sm">
                  Ir para o painel <ArrowRight className="w-4 h-4" />
                </button>
                {connectedStoreId && (
                  <button
                    onClick={() => {
                      handleFinish()
                      setTimeout(() => {
                        window.location.href = `/integrations/shopify/tracking-debug?storeId=${connectedStoreId}`
                      }, 300)
                    }}
                    className="px-4 py-3 rounded-lg font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm flex items-center gap-1.5">
                    <Eye className="w-4 h-4" /> Diagnóstico
                  </button>
                )}
              </div>
            </div>
          )}

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function StatusItem({ label, done, hint }: { label: string; done: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded-lg">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
      )}
      <div className="flex-1">
        <span className={`text-[13px] ${done ? 'text-gray-900' : 'text-amber-700'}`}>{label}</span>
        {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}
