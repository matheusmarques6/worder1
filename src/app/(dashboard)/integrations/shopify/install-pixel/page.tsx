'use client'

// =============================================
// /integrations/shopify/install-pixel
//
// Forced wizard for Custom Pixel installation in manual Shopify
// integrations. Without our app being on the public Shopify App Store,
// the merchant MUST paste the pixel snippet by hand. This page walks
// them through it and verifies in real time that the pixel is firing.
//
// Steps:
//   1. Copy the snippet (with one-click copy + ready-to-paste loader)
//   2. Walk through Customer Events panel in Shopify Admin (numbered)
//   3. Verify — polls the verify endpoint until the first event lands
//
// Once detected, shopify_stores.pixel_installed is flipped to true on
// the server side, the global "tracking incomplete" banner disappears,
// and the merchant is bounced to the diagnostic dashboard.
// =============================================

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStoreStore } from '@/stores'
import {
  ArrowLeft, Copy, CheckCircle2, Loader2, AlertCircle, ExternalLink,
  Clock, Zap, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface VerifyResponse {
  detected: boolean
  pixelInstalled: boolean
  stage?: 'not-fetched' | 'fetched-no-ping' | 'pinging-no-events' | 'detected'
  lastEventAt: string | null
  lastEventType: string | null
  recentEventCount: number
  recentEvents: Array<{ type: string; source: string; at: string; page_url: string | null }>
  diagnostics?: {
    fetchCount: number
    lastFetchAt: string | null
    lastFetchUserAgent: string | null
    pingCount: number
    lastPingAt: string | null
  }
  hint: string | null
}

export default function InstallPixelWizardPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { currentStore } = useStoreStore()
  const storeIdFromQuery = params?.get('storeId') || null
  const storeId = storeIdFromQuery || currentStore?.id || null

  const [snippet, setSnippet] = useState<string | null>(null)
  const [shopDomain, setShopDomain] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const [autoVerify, setAutoVerify] = useState(false)
  const pollRef = useRef<any>(null)

  // 1. Pull the snippet for this shop on mount
  useEffect(() => {
    async function load() {
      if (!storeId) return
      try {
        const sRes = await fetch(`/api/integrations/shopify/status?store_id=${storeId}`)
        const sJson = await sRes.json()
        const dom = sJson?.store?.shopDomain
        setShopDomain(dom || null)
        if (dom) {
          const pRes = await fetch(`/api/integrations/shopify/pixel-code?shop=${encodeURIComponent(dom)}`)
          const pJson = await pRes.json()
          if (pRes.ok && pJson.code) setSnippet(pJson.code)
        }
        if (sJson?.store?.pixelInstalled) {
          // Already installed — show success state immediately
          setVerifyResult({ detected: true, pixelInstalled: true, lastEventAt: null, lastEventType: null, recentEventCount: 0, recentEvents: [], hint: null })
        }
      } catch (e) {
        console.error('Failed to load pixel snippet', e)
      }
    }
    load()
  }, [storeId])

  async function copySnippet() {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }

  async function verifyOnce(): Promise<VerifyResponse | null> {
    if (!storeId) return null
    try {
      const res = await fetch('/api/integrations/shopify/pixel/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const j: VerifyResponse = await res.json()
      setVerifyResult(j)
      return j
    } catch {
      return null
    }
  }

  // Manual one-shot verification
  async function verifyNow() {
    setVerifying(true)
    await verifyOnce()
    setVerifying(false)
  }

  // Auto-verify: polls every 4 seconds for 3 minutes after the merchant
  // clicks "Já colei o código". Stops on detection or timeout.
  function startAutoVerify() {
    setAutoVerify(true)
    if (pollRef.current) clearInterval(pollRef.current)
    let elapsed = 0
    const tick = async () => {
      elapsed += 4
      const r = await verifyOnce()
      if (r?.detected || elapsed >= 180) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setAutoVerify(false)
      }
    }
    tick()
    pollRef.current = setInterval(tick, 4000)
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  if (!storeId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-sm text-gray-500">Selecione uma loja primeiro.</p>
      </div>
    )
  }

  const detected = !!verifyResult?.detected || !!verifyResult?.pixelInstalled

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900">Instalar Custom Pixel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {shopDomain ? `${shopDomain} — ` : ''}3 passos pra ativar tracking comportamental completo
          </p>
        </div>
        {detected && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[12px] font-semibold border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Pixel ativo
          </span>
        )}
      </div>

      {/* Why this matters — sets context for impatient merchants */}
      {!detected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900">
              Sem o Custom Pixel, só pedidos e checkouts são rastreados.
            </p>
            <p className="text-[12px] text-amber-800 mt-0.5 leading-relaxed">
              Visualizações de produto, adições ao carrinho, navegação, formulários, browse abandonment, fingerprint e identidade cross-device dependem do pixel.
              É um copy-paste de 30 segundos no Shopify Admin.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1: Copy snippet */}
      <Step
        number={1}
        title="Copie o código abaixo"
        done={!!snippet}
      >
        {!snippet ? (
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando snippet…
          </div>
        ) : (
          <div className="relative">
            <pre className="text-[11px] font-mono bg-gray-900 text-emerald-400 p-3 pr-20 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {snippet}
            </pre>
            <button
              onClick={copySnippet}
              className="absolute top-2 right-2 px-3 py-1.5 text-[11.5px] font-semibold bg-white text-gray-700 hover:bg-gray-50 rounded border border-gray-300 shadow-sm flex items-center gap-1.5"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}
      </Step>

      {/* STEP 2: Walk through Shopify Admin */}
      <Step
        number={2}
        title="Cole no Shopify Admin → Customer Events"
        done={false}
      >
        <ol className="text-[12.5px] text-gray-700 space-y-2 mt-1">
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">a.</span>
            <span>
              Abra <strong>Shopify Admin</strong> → <strong>Configurações</strong> → <strong>Customer Events</strong>
              {shopDomain && (
                <a
                  href={`https://${shopDomain}/admin/settings/customer_events`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                >
                  abrir <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">b.</span>
            <span>Clique em <strong>"Adicionar pixel personalizado"</strong></span>
          </li>
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">c.</span>
            <span>Nome do pixel: <strong>Worder</strong></span>
          </li>
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">d.</span>
            <span>Cole o código do passo 1 dentro do <em>editor de código</em></span>
          </li>
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">e.</span>
            <span>Em <strong>"Privacidade do cliente"</strong>, escolha <strong>"Não obrigatório"</strong></span>
          </li>
          <li className="flex gap-2.5">
            <span className="text-gray-400 font-mono text-[11px] flex-shrink-0 mt-0.5">f.</span>
            <span>Clique <strong>"Salvar"</strong> e depois <strong>"Conectar"</strong> (canto superior direito)</span>
          </li>
        </ol>
      </Step>

      {/* STEP 3: Verify */}
      <Step
        number={3}
        title="Verifique a instalação"
        done={detected}
      >
        {detected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-semibold">Pixel detectado e ativo!</span>
            </div>
            {verifyResult?.recentEvents && verifyResult.recentEvents.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-[11.5px] font-semibold text-emerald-900 mb-1.5">
                  Últimos {verifyResult.recentEvents.length} eventos recebidos:
                </p>
                <div className="space-y-1">
                  {verifyResult.recentEvents.slice(0, 5).map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-emerald-800 font-mono">
                      <Zap className="w-3 h-3" />
                      <span>{e.type}</span>
                      <span className="text-emerald-600">·</span>
                      <span className="text-emerald-600">{e.source}</span>
                      {e.page_url && <span className="text-emerald-600 truncate flex-1">— {e.page_url.slice(0, 60)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => router.push(`/integrations/shopify/tracking-debug${storeIdFromQuery ? `?storeId=${storeIdFromQuery}` : ''}`)}
                className="px-4 py-2 text-[13px] font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Ver dashboard de tracking
              </button>
              <button
                onClick={() => router.push('/integrations/shopify')}
                className="px-4 py-2 text-[13px] font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Voltar para integrações
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] text-gray-700 leading-relaxed">
              Depois de salvar e <strong>conectar</strong> o pixel no Shopify, abra sua loja em outra aba
              e navegue por algumas páginas. O primeiro evento chega aqui em segundos.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={startAutoVerify}
                disabled={autoVerify}
                className="px-4 py-2 text-[13px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {autoVerify ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                {autoVerify ? 'Aguardando primeiro evento…' : 'Já colei — começar verificação automática'}
              </button>
              <button
                onClick={verifyNow}
                disabled={verifying}
                className="px-3 py-2 text-[12.5px] font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Verificar agora
              </button>
              {shopDomain && (
                <a
                  href={`https://${shopDomain}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 text-[12.5px] font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir loja
                </a>
              )}
            </div>

            {/* Cascata de 3 checks: download → ping → evento. Mostra
                em qual etapa o pipeline está parando, em vez de só
                "aguardando" genérico. */}
            {verifyResult?.diagnostics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <DiagStep
                  num={1}
                  label="Sandbox baixou o script?"
                  count={verifyResult.diagnostics.fetchCount}
                  ok={verifyResult.diagnostics.fetchCount > 0}
                  detail={verifyResult.diagnostics.lastFetchAt ? `Último: ${new Date(verifyResult.diagnostics.lastFetchAt).toLocaleTimeString('pt-BR')}` : 'Nenhum fetch ainda'}
                />
                <DiagStep
                  num={2}
                  label="Pixel executou e POSTou?"
                  count={verifyResult.diagnostics.pingCount}
                  ok={verifyResult.diagnostics.pingCount > 0}
                  detail={verifyResult.diagnostics.lastPingAt ? `Último: ${new Date(verifyResult.diagnostics.lastPingAt).toLocaleTimeString('pt-BR')}` : 'Aguardando ping inicial'}
                />
                <DiagStep
                  num={3}
                  label="Eventos comportamentais?"
                  count={verifyResult.recentEventCount}
                  ok={verifyResult.recentEventCount > 0}
                  detail={verifyResult.lastEventAt ? `${verifyResult.lastEventType} às ${new Date(verifyResult.lastEventAt).toLocaleTimeString('pt-BR')}` : 'Aguardando page_view/viewed_product'}
                />
              </div>
            )}

            {verifyResult && !verifyResult.detected && verifyResult.hint && (
              <div className={cn(
                'border rounded-lg p-3 flex gap-2',
                verifyResult.stage === 'not-fetched' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              )}>
                <Clock className={cn('w-4 h-4 flex-shrink-0 mt-0.5', verifyResult.stage === 'not-fetched' ? 'text-red-600' : 'text-amber-600')} />
                <p className={cn('text-[11.5px] leading-relaxed', verifyResult.stage === 'not-fetched' ? 'text-red-800' : 'text-amber-800')}>
                  {verifyResult.hint}
                </p>
              </div>
            )}
          </div>
        )}
      </Step>
    </div>
  )
}

function DiagStep({ num, label, count, ok, detail }: { num: number; label: string; count: number; ok: boolean; detail: string }) {
  return (
    <div className={cn(
      'rounded-lg border p-2.5',
      ok ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
          ok ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'
        )}>{num}</span>
        <span className={cn('text-[10.5px] font-semibold', ok ? 'text-emerald-900' : 'text-gray-600')}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 ml-6">
        <span className={cn('text-lg font-bold', ok ? 'text-emerald-700' : 'text-gray-500')}>{count}</span>
        <span className="text-[10px] text-gray-500 truncate">{detail}</span>
      </div>
    </div>
  )
}

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(
      'bg-white border rounded-xl p-5',
      done ? 'border-emerald-200' : 'border-gray-200'
    )}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0',
          done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
        )}>
          {done ? <CheckCircle2 className="w-4 h-4" /> : number}
        </div>
        <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  )
}
