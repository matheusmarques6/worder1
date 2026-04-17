'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Store, ArrowRight, ArrowLeft, ExternalLink, CheckCircle, AlertCircle,
  Loader2, LogOut, KeyRound, Globe, Copy, Check, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = 'domain' | 'credentials' | 'connecting' | 'success'

const GUIDE_STEPS = [
  'Acesse partners.shopify.com e crie um app customizado',
  'Em "Configurações da API", adicione os escopos necessários',
  'Instale o app na loja',
  'Copie o Client ID e Client Secret',
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('domain')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [storeDomain, setStoreDomain] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const [result, setResult] = useState<any>(null)

  const handleConnect = async () => {
    if (!storeDomain.trim() || !clientId.trim() || !clientSecret.trim()) {
      setError('Preencha todos os campos')
      return
    }

    setStep('connecting')
    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/integrations/shopify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: storeDomain.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao conectar')

      setResult(data)
      setStep('success')
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar loja')
      setStep('credentials')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {})
    router.push('/')
    router.refresh()
  }

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // ─── Success ───
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-xl p-8"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Loja conectada!</h2>
            <p className="text-sm text-gray-500 mt-1">
              {result?.store?.name || storeDomain} foi integrada com sucesso.
            </p>
          </div>

          {/* Status cards */}
          <div className="space-y-2 mb-6">
            <StatusRow
              label="Token de acesso"
              ok={result?.token?.obtained}
              detail={`Expira em ${Math.round((result?.token?.expiresIn || 86400) / 3600)}h (auto-renovado)`}
            />
            <StatusRow
              label="Webhooks"
              ok={(result?.webhooks?.created || 0) + (result?.webhooks?.existing || 0) > 0}
              detail={`${(result?.webhooks?.created || 0) + (result?.webhooks?.existing || 0)} de ${result?.webhooks?.total || 17} registrados`}
            />
            <StatusRow
              label="Sync inicial"
              ok={result?.sync?.triggered}
              detail="Importação de pedidos, clientes e produtos iniciada"
            />
          </div>

          {/* Next steps */}
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-brand-800 mb-2">Próximos passos</p>
            <ol className="text-sm text-brand-700 space-y-1.5 list-decimal list-inside">
              <li>Instale o <strong>Custom Pixel</strong> para rastrear conversões</li>
              <li>Ative o <strong>App Embed</strong> no tema da loja</li>
              <li>Aguarde a sincronização inicial (pode levar alguns minutos)</li>
            </ol>
          </div>

          <button
            onClick={() => { router.push('/integrations'); router.refresh() }}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm rounded-lg transition-colors"
          >
            Ir para Integrações
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { router.push('/dashboard'); router.refresh() }}
            className="w-full mt-2 py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            Ir para o Dashboard
          </button>
        </motion.div>
      </div>
    )
  }

  // ─── Connecting ───
  if (step === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-sm text-center"
        >
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Conectando sua loja...</h2>
          <p className="text-sm text-gray-500">
            Autenticando, registrando webhooks e iniciando sincronização.
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Form Steps ───
  const stepIdx = step === 'domain' ? 0 : 1

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="pt-8 pb-2 px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="text-lg font-bold text-gray-900">Worder</span>
          </div>
          <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-brand-50 flex items-center justify-center">
            <Store className="w-7 h-7 text-brand-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Conecte sua loja Shopify</h2>
          <p className="text-sm text-gray-500 mt-1">
            Use as credenciais do seu app customizado no Shopify Dev Dashboard.
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 px-8 py-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i <= stepIdx ? 'w-12 bg-brand-500' : 'w-12 bg-gray-100',
              )}
            />
          ))}
        </div>

        <div className="px-8 pb-8">
          <AnimatePresence mode="wait">
            {step === 'domain' && (
              <motion.div
                key="domain"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-gray-400" />
                      Domínio Shopify
                    </div>
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={storeDomain}
                      onChange={(e) => setStoreDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="minha-loja"
                      autoFocus
                      className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-l-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <span className="px-3 py-2.5 bg-gray-50 border border-l-0 border-gray-300 rounded-r-lg text-sm text-gray-500">
                      .myshopify.com
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Encontre em Shopify Admin → Configurações → Domínios
                  </p>
                </div>
              </motion.div>
            )}

            {step === 'credentials' && (
              <motion.div
                key="creds"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-gray-400" />
                      Client ID
                    </div>
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Cole o Client ID do app"
                    autoFocus
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono placeholder:text-gray-400 placeholder:font-sans focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-gray-400" />
                      Client Secret
                    </div>
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Cole o Client Secret do app"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 font-mono placeholder:text-gray-400 placeholder:font-sans focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  />
                </div>

                {/* Guide */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                    Como obter as credenciais
                  </p>
                  <ol className="space-y-1.5">
                    {GUIDE_STEPS.map((text, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">
                          {i + 1}
                        </span>
                        {text}
                      </li>
                    ))}
                  </ol>
                  <a
                    href="https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Ver documentação completa
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Required scopes info */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800">
                    <strong>Escopos necessários:</strong> read_orders, read_customers, read_products.
                    Adicione-os na configuração do app antes de instalar.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <div className="flex items-center gap-3 mt-6">
            {step === 'credentials' && (
              <button
                onClick={() => { setStep('domain'); setError('') }}
                className="flex items-center gap-1 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            )}
            <button
              onClick={() => {
                if (step === 'domain') {
                  if (!storeDomain.trim()) { setError('Informe o domínio'); return }
                  setStep('credentials')
                  setError('')
                } else {
                  handleConnect()
                }
              }}
              disabled={
                (step === 'domain' && !storeDomain.trim()) ||
                (step === 'credentials' && (!clientId.trim() || !clientSecret.trim())) ||
                isLoading
              }
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 'domain' ? (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Conectar Loja
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <button
            onClick={() => { router.push('/dashboard'); router.refresh() }}
            className="w-full mt-3 py-2 text-gray-400 hover:text-gray-500 text-sm transition-colors"
          >
            Configurar depois
          </button>
        </div>

        <div className="px-8 pb-6 pt-2 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 w-full py-2 text-gray-400 hover:text-gray-500 transition-colors text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair da conta
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {ok ? (
        <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </div>
  )
}
