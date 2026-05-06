'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStoreStore } from '@/stores'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, RefreshCw, CheckCircle, AlertCircle, Loader2, Activity,
  Eye, ShoppingCart, CreditCard, Package, Mail, User, Clock, Zap,
} from 'lucide-react'

interface DiagResponse {
  store: { id: string; shop_domain: string; shop_name: string; connection_type: string; api_version: string }
  install: {
    pixelInstalled: boolean
    embedInstalled: boolean
    loaderInstalled: boolean
    scriptTagId: string | null
    webhooksRegistered: number | null
    webhooks: Array<{ topic: string; address: string; matches_expected?: boolean }>
    checkoutTopicsRegistered?: boolean
    webhookUrlMismatchCount?: number
    expectedWebhookUrl?: string
    apiSecretConfigured?: boolean
    syncCheckoutsEnabled?: boolean
    scopes: string[]
    manualPixelLoaderCode?: string
    shopDomainAliases?: string[]
  }
  counts: {
    last1h: number
    last24h: number
    resolved: number
    anonymous: number
    byType: Record<string, number>
    bySource: Record<string, number>
  }
  identity?: {
    totalIdentities: number
    identifiedCount: number
    anonymousCount: number
    stitchedByFingerprint: number
  }
  recommendations?: {
    totalRecsRows: number
  }
  pixelDiagnostics?: {
    fetchCount: number
    lastFetchAt: string | null
    lastFetchUserAgent: string | null
    pingCount: number
    lastPingAt: string | null
    hint: string
  }
  recentEvents: Array<{
    id: string
    event_type: string
    event_source: string
    contact_id: string | null
    anonymous_id: string | null
    session_id: string | null
    page_url: string | null
    product_title: string | null
    product_id: string | null
    email: string | null
    monetary_value: number | null
    currency: string | null
    occurred_at: string
    received_at: string
  }>
  recentContacts: Array<{
    id: string
    email: string
    name: string | null
    total_orders: number
    total_spent: number
    last_event_at: string | null
    created_at: string
  }>
  recentWebhooks?: Array<{
    id: string
    topic: string
    status: string
    shopify_resource_id: string | null
    received_at: string
    processed_at: string | null
    error_message: string | null
    attempts: number
  }>
  recentCheckouts?: Array<{
    id: string
    shopify_checkout_id: string
    email: string | null
    total_price: number | null
    currency: string | null
    status: string
    has_contact: boolean
    saved_at: string
    shopify_created_at: string
  }>
}

const EVENT_ICONS: Record<string, any> = {
  viewed_product: Eye,
  added_to_cart: ShoppingCart,
  checkout_started: CreditCard,
  placed_order: Package,
  email_captured: Mail,
  active_on_site: Activity,
  page_view: Eye,
}

export default function TrackingDebugPage() {
  const router = useRouter()
  const { currentStore } = useStoreStore()
  const [data, setData] = useState<DiagResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testEventType, setTestEventType] = useState('viewed_product')
  const intervalRef = useRef<any>(null)

  async function fetchDiag() {
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/diagnostics/tracking?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setData(j)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDiag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (autoRefresh) intervalRef.current = setInterval(fetchDiag, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, currentStore?.id])

  async function fireTestEvent() {
    if (!currentStore?.id) return
    setTesting(true)
    try {
      await fetch('/api/diagnostics/test-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.id, eventType: testEventType }),
      })
      // Immediate refresh so the merchant sees the synthetic event right away
      await fetchDiag()
    } finally {
      setTesting(false)
    }
  }

  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)
  const [reinstalling, setReinstalling] = useState(false)
  const [reinstallResult, setReinstallResult] = useState<string | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  // Domain aliases (Shopify canonical myshopifyDomain mismatch fix)
  const [newAlias, setNewAlias] = useState('')
  const [savingAlias, setSavingAlias] = useState(false)
  const [aliasError, setAliasError] = useState<string | null>(null)
  async function addAlias() {
    if (!currentStore?.id || !newAlias.trim()) return
    setSavingAlias(true)
    setAliasError(null)
    try {
      const res = await fetch('/api/integrations/shopify/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.id, domain: newAlias.trim() }),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        setAliasError(j.error || 'Falhou')
      } else {
        setNewAlias('')
        await fetchDiag()
      }
    } catch (e: any) {
      setAliasError(e?.message || 'Erro de rede')
    } finally {
      setSavingAlias(false)
    }
  }
  async function removeAlias(domain: string) {
    if (!currentStore?.id) return
    try {
      await fetch('/api/integrations/shopify/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.id, domain }),
      })
      await fetchDiag()
    } catch { /* silent */ }
  }
  async function reinstallEverything() {
    if (!currentStore?.id) return
    setReinstalling(true)
    setReinstallResult(null)
    try {
      const res = await fetch('/api/shopify/install-extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.id }),
      })
      const j = await res.json()
      if (j.success) {
        const w = j.webhooks || {}
        const parts: string[] = []
        if ((w.staleDeleted || 0) > 0) parts.push(`${w.staleDeleted} URL${w.staleDeleted > 1 ? 's' : ''} antiga${w.staleDeleted > 1 ? 's' : ''} removida${w.staleDeleted > 1 ? 's' : ''}`)
        parts.push(`webhooks: ${w.created || 0} criados, ${w.existing || 0} já existiam` + (w.failed ? `, ${w.failed} falharam` : ''))
        if (j.pixel?.installed) parts.push('pixel ✓')
        if (j.loader?.installed) parts.push('loader ✓')
        else if (j.loader?.missingScope) parts.push('loader: faltam scopes')
        setReinstallResult(parts.join(' · '))
      } else {
        setReinstallResult(j.error || 'Falhou.')
      }
      await fetchDiag()
    } catch (e: any) {
      setReinstallResult(e?.message || 'Erro de rede')
    } finally {
      setReinstalling(false)
      setTimeout(() => setReinstallResult(null), 12000)
    }
  }
  async function reprocessCheckouts() {
    if (!currentStore?.id) return
    setReprocessing(true)
    setReprocessResult(null)
    try {
      const res = await fetch('/api/diagnostics/reprocess-checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.id }),
      })
      const j = await res.json()
      if (j.success) {
        setReprocessResult(`${j.processed} eventos criados, ${j.skipped} já existiam${j.errors ? `, ${j.errors} erros` : ''}.`)
      } else {
        setReprocessResult(j.error || 'Falhou.')
      }
      await fetchDiag()
    } finally {
      setReprocessing(false)
      setTimeout(() => setReprocessResult(null), 6000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Nenhuma loja Shopify conectada para diagnosticar.
        </div>
      </div>
    )
  }

  const store = data.store
  const i = data.install
  const c = data.counts
  const total24h = c.last24h
  const hasAny = total24h > 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Diagnóstico de Tracking</h1>
            <p className="text-sm text-gray-500 mt-0.5">{store.shop_name} — {store.shop_domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-zinc-900" />
            Auto-refresh (5s)
          </label>
          <button onClick={fetchDiag} className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {/* Install status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard label="Custom Pixel" ok={i.pixelInstalled} hint={i.pixelInstalled ? 'Instalado e capturando eventos' : 'Não instalado'} />
        <StatusCard label="Loader Storefront" ok={i.loaderInstalled} hint={i.loaderInstalled ? 'ScriptTag injetando popups' : 'Não instalado — ative em Integrações'} />
        <StatusCard label="Webhooks" ok={(i.webhooksRegistered ?? 0) >= 10} hint={i.webhooksRegistered != null ? `${i.webhooksRegistered} registrados` : 'Não foi possível verificar'} />
        <StatusCard label="Eventos última hora" ok={c.last1h > 0} value={c.last1h} hint={c.last1h > 0 ? 'Tracking ativo' : 'Nenhum evento — verifique o pixel'} />
      </div>

      {/* Identity graph + Recommendations status */}
      {(data.identity || data.recommendations) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusCard
            label="Visitantes únicos"
            ok={(data.identity?.totalIdentities || 0) > 0}
            value={data.identity?.totalIdentities || 0}
            hint="Linhas na tabela visitor_identities"
          />
          <StatusCard
            label="Identificados"
            ok={(data.identity?.identifiedCount || 0) > 0}
            value={data.identity?.identifiedCount || 0}
            hint={`${data.identity?.anonymousCount || 0} ainda anônimos`}
          />
          <StatusCard
            label="Re-stitch por fingerprint"
            ok={(data.identity?.stitchedByFingerprint || 0) > 0}
            value={data.identity?.stitchedByFingerprint || 0}
            hint="Identidades recuperadas após ITP wipe"
          />
          <StatusCard
            label="Recomendações"
            ok={(data.recommendations?.totalRecsRows || 0) > 0}
            value={data.recommendations?.totalRecsRows || 0}
            hint={(data.recommendations?.totalRecsRows || 0) > 0 ? 'Cron materializou recs' : 'Cron ainda não rodou (4am UTC)'}
          />
        </div>
      )}

      {/* Pixel diagnostic — surfaces whether the Custom Pixel is even
          reaching us, and whether it executes after loading. Three
          possible states:
            - Zero fetches: sandbox isn't downloading the script (CSP,
              wrong domain, pixel not "Conectado" in Customer Events)
            - Fetches but zero pings: script downloads but JS error
              prevents subscribe phase
            - Fetches AND pings but no behavioral events: subscribers
              aren't matching Shopify's event names */}
      {data.pixelDiagnostics && (
        <div className={cn(
          'rounded-xl border overflow-hidden',
          data.pixelDiagnostics.fetchCount === 0
            ? 'bg-red-50 border-red-200'
            : data.pixelDiagnostics.pingCount === 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
        )}>
          <div className="px-4 py-3 border-b border-current border-opacity-20">
            <p className="text-[13px] font-semibold text-gray-900">Atividade do pixel</p>
            <p className="text-[11px] text-gray-600 mt-0.5">{data.pixelDiagnostics.hint}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-current divide-opacity-20">
            <div className="p-4 bg-white/50">
              <p className="text-[10.5px] uppercase tracking-wide font-semibold text-gray-500">1. Sandbox baixou o script?</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-gray-900">{data.pixelDiagnostics.fetchCount}</span>
                <span className="text-[11px] text-gray-500">fetches últimos 30 dias</span>
              </div>
              {data.pixelDiagnostics.lastFetchAt && (
                <p className="text-[11px] text-gray-600 mt-1">
                  Último: {new Date(data.pixelDiagnostics.lastFetchAt).toLocaleString('pt-BR')}
                </p>
              )}
              {data.pixelDiagnostics.lastFetchUserAgent && (
                <p className="text-[10px] text-gray-500 mt-0.5 font-mono truncate" title={data.pixelDiagnostics.lastFetchUserAgent}>
                  UA: {data.pixelDiagnostics.lastFetchUserAgent.slice(0, 80)}
                </p>
              )}
            </div>
            <div className="p-4 bg-white/50">
              <p className="text-[10.5px] uppercase tracking-wide font-semibold text-gray-500">2. Script executou e chamou /track/event?</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-gray-900">{data.pixelDiagnostics.pingCount}</span>
                <span className="text-[11px] text-gray-500">pings pixel_loaded</span>
              </div>
              {data.pixelDiagnostics.lastPingAt && (
                <p className="text-[11px] text-gray-600 mt-1">
                  Último: {new Date(data.pixelDiagnostics.lastPingAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test event row */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-end gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-gray-900 mb-0.5 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Disparar evento de teste
          </p>
          <p className="text-[11px] text-gray-500">
            Cria um evento sintético com <code className="font-mono">event_source=diagnostic</code> pra verificar a inserção em <code className="font-mono">contact_events</code>.
          </p>
        </div>
        <select
          value={testEventType}
          onChange={e => setTestEventType(e.target.value)}
          className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-zinc-900"
        >
          <option value="viewed_product">viewed_product</option>
          <option value="added_to_cart">added_to_cart</option>
          <option value="checkout_started">checkout_started</option>
          <option value="placed_order">placed_order</option>
          <option value="email_captured">email_captured</option>
          <option value="active_on_site">active_on_site</option>
        </select>
        <button
          onClick={fireTestEvent}
          disabled={testing}
          className="px-4 py-2 text-[13px] font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Disparar
        </button>
      </div>

      {/* Webhook deliveries (Shopify -> us) — shows whether Shopify is
          actually reaching our endpoint, and whether we processed each
          delivery. If checkouts/orders aren't producing contact_events,
          this panel tells you whether the failure is at Shopify->us or
          us->contact_events.

          We render the panel even when empty: an empty list IS the
          diagnostic signal — it means Shopify isn't reaching us (or
          we're rejecting before logging). */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-gray-900">Webhooks recebidos do Shopify</p>
            <p className="text-[11px] text-gray-400">Últimas 30 entregas — confirma se o Shopify está mandando os eventos</p>
          </div>
          {data.recentCheckouts && data.recentCheckouts.length > 0 && (
            <button
              onClick={reprocessCheckouts}
              disabled={reprocessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-zinc-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              title="Reprocessa checkouts existentes para criar eventos checkout_started que talvez tenham sido perdidos."
            >
              {reprocessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reprocessar checkouts
            </button>
          )}
        </div>
        {reprocessResult && (
          <div className="px-4 py-2 bg-emerald-50 text-[12px] text-emerald-700 border-b border-emerald-100">
            {reprocessResult}
          </div>
        )}
        {!data.recentWebhooks || data.recentWebhooks.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-[12.5px] font-medium text-gray-700 mb-1.5">
              Nenhuma entrega registrada nos últimos 30 envios.
            </p>
            <p className="text-[11.5px] text-gray-500 leading-relaxed">
              Se a loja teve atividade recente (pedido, checkout, customer atualizado) e nada apareceu aqui,
              é porque <strong>o Shopify não está chegando neste endpoint</strong> ou estamos rejeitando antes de logar.
              Causas comuns:
            </p>
            <ul className="mt-2 space-y-1 text-[11.5px] text-gray-600 list-disc list-inside">
              <li><strong>HMAC inválido:</strong> o <code className="font-mono">api_secret</code> salvo não bate com o que o Shopify usa pra assinar — entregas voltam com 401 e ficam invisíveis. Reconecte a loja.</li>
              <li><strong>Topics não registrados:</strong> mesmo com webhooks no Shopify, pode faltar <code className="font-mono">checkouts/create</code>. Confira a lista de topics abaixo.</li>
              <li><strong>URL errada:</strong> webhooks registrados em outro endpoint que não <code className="font-mono">/api/webhooks/shopify</code>.</li>
            </ul>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 max-h-[280px] overflow-y-auto">
            {data.recentWebhooks.map(w => {
              const ageMs = Date.now() - new Date(w.received_at).getTime()
              const ageStr = ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s` : ageMs < 3600000 ? `${Math.floor(ageMs / 60000)}m` : ageMs < 86400000 ? `${Math.floor(ageMs / 3600000)}h` : `${Math.floor(ageMs / 86400000)}d`
              const ok = w.status === 'processed' || w.status === 'success' || w.status === 'completed'
              const failed = w.status === 'failed' || w.status === 'hmac_failed' || w.status === 'no_secret' || !!w.error_message
              return (
                <div key={w.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-gray-100 hover:bg-gray-50">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500' : failed ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-mono font-semibold text-gray-900 truncate">{w.topic}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {w.shopify_resource_id ? `#${w.shopify_resource_id} · ` : ''}{w.status}{w.error_message ? ` — ${w.error_message.slice(0, 60)}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{ageStr}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reinstall everything — one-click recovery: registers webhooks,
          installs Custom Pixel (if write_pixels scope), installs the
          storefront loader ScriptTag. Idempotent. Most useful when the
          merchant sees "pixel não instalado" or webhook URL mismatches. */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-end gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-gray-900 mb-0.5 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-blue-500" /> Reinstalar pixel + webhooks + loader
          </p>
          <p className="text-[11px] text-gray-500">
            Re-executa <code className="font-mono">install-extras</code> — registra os 17 webhooks no endpoint correto, instala o Web Pixel
            (se tiver scope <code className="font-mono">write_pixels</code>) e o ScriptTag do loader. Idempotente, pode rodar quantas vezes quiser.
          </p>
        </div>
        <button
          onClick={reinstallEverything}
          disabled={reinstalling}
          className="px-4 py-2 text-[13px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {reinstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reinstalar tudo
        </button>
      </div>
      {reinstallResult && (
        <div className="px-4 py-2.5 bg-emerald-50 text-[12px] text-emerald-800 border border-emerald-200 rounded-lg">
          {reinstallResult}
        </div>
      )}

      {/* Domain aliases — fixes the case where Shopify's canonical
          myshopifyDomain differs from what was entered during connect.
          Example: merchant connected with sourosa.myshopify.com but
          Shopify sends webhooks under lojalaclode.myshopify.com (the
          original/permanent name). Without an alias, those webhooks
          come back 410 and tracking is broken. */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[13px] font-semibold text-gray-900">Domínios da loja</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Shopify pode enviar webhooks por <strong>qualquer um</strong> dos seus myshopifyDomains.
            O domínio principal foi cadastrado na conexão; adicione aliases pra qualquer myshopifyDomain extra
            (ex: <code className="font-mono">lojalaclode.myshopify.com</code>) sob o qual a loja seja conhecida na Shopify.
          </p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-100">
            <span className="text-[10.5px] uppercase tracking-wide font-semibold text-gray-500 w-16 flex-shrink-0">primário</span>
            <code className="flex-1 text-[12px] font-mono text-gray-900 truncate">{data.store.shop_domain}</code>
          </div>
          {(data.install.shopDomainAliases || []).map((alias) => (
            <div key={alias} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-100">
              <span className="text-[10.5px] uppercase tracking-wide font-semibold text-gray-500 w-16 flex-shrink-0">alias</span>
              <code className="flex-1 text-[12px] font-mono text-gray-900 truncate">{alias}</code>
              <button
                onClick={() => removeAlias(alias)}
                className="text-[11px] font-medium text-red-600 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50"
              >
                Remover
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="exemplo.myshopify.com"
              className="flex-1 px-3 py-2 text-[12.5px] font-mono border border-gray-200 rounded-md focus:outline-none focus:border-zinc-900"
              onKeyDown={(e) => { if (e.key === 'Enter') addAlias() }}
              disabled={savingAlias}
            />
            <button
              onClick={addAlias}
              disabled={savingAlias || !newAlias.trim()}
              className="px-3 py-2 text-[12.5px] font-semibold bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {savingAlias ? 'Salvando…' : 'Adicionar alias'}
            </button>
          </div>
          {aliasError && (
            <p className="text-[11.5px] text-red-600">{aliasError}</p>
          )}
        </div>
      </div>

      {/* Manual Custom Pixel install fallback — the auto-install via
          webPixelCreate only works when the merchant has our published
          Web Pixel Extension. For Custom App / manual integrations, the
          mutation succeeds without actually installing anything visible
          on the storefront. We surface the loader snippet so the
          merchant can paste it into Customer Events directly. */}
      {!data.install.pixelInstalled && data.install.manualPixelLoaderCode && (
        <div className="bg-white border border-amber-200 rounded-xl">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
            <p className="text-[13px] font-semibold text-amber-900">
              Pixel não instalado — instalação manual necessária
            </p>
            <p className="text-[11.5px] text-amber-800 mt-0.5">
              O auto-install via API falhou (provável: integração manual sem nossa Web Pixel Extension publicada).
              Cole o código abaixo em <strong>Shopify Admin → Configurações → Customer Events → Adicionar pixel personalizado</strong> e marque "Não obrigatório" em privacidade.
            </p>
          </div>
          <div className="p-4 space-y-2">
            <div className="relative">
              <pre className="text-[11px] font-mono bg-gray-900 text-emerald-400 p-3 rounded-lg overflow-x-auto whitespace-pre">{data.install.manualPixelLoaderCode}</pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(data.install.manualPixelLoaderCode || '')
                  setCopiedSnippet(true)
                  setTimeout(() => setCopiedSnippet(false), 2000)
                }}
                className="absolute top-2 right-2 px-2.5 py-1 text-[11px] font-medium bg-white text-gray-700 hover:bg-gray-50 rounded border border-gray-300 shadow-sm"
              >
                {copiedSnippet ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <ol className="text-[11.5px] text-gray-600 space-y-0.5 pl-4 list-decimal">
              <li>No admin da Shopify, abra <strong>Configurações → Customer Events</strong>.</li>
              <li>Clique em <strong>Adicionar pixel personalizado</strong> e nomeie como "Worder".</li>
              <li>Cole o código acima no editor.</li>
              <li>Em "Privacidade do cliente", mantenha <strong>Não obrigatório</strong> (ou ajuste conforme sua política LGPD).</li>
              <li>Clique em <strong>Salvar</strong> e depois em <strong>Conectar</strong>.</li>
              <li>Volte aqui e clique em "Atualizar" — pixelInstalled deve virar verde após o primeiro evento.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Webhook subscriptions on Shopify — shows the FULL address of
          each subscription (not just the topic) so the merchant can spot
          stale URLs (ngrok tunnels, wrong domains, old preview deploys).
          A subscription's address must equal expectedWebhookUrl exactly
          for our handler to receive deliveries. */}
      {data.install.webhooks && data.install.webhooks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">Webhook subscriptions na Shopify</p>
              <p className="text-[11px] text-gray-400 truncate">
                Endpoint esperado: <code className="font-mono text-gray-600">{data.install.expectedWebhookUrl || '—'}</code>
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {data.install.checkoutTopicsRegistered === false && (
                <span className="text-[10.5px] px-2 py-1 bg-red-50 text-red-700 rounded font-semibold border border-red-200">
                  FALTA: checkouts/*
                </span>
              )}
              {(data.install.webhookUrlMismatchCount || 0) > 0 && (
                <span className="text-[10.5px] px-2 py-1 bg-red-50 text-red-700 rounded font-semibold border border-red-200">
                  {data.install.webhookUrlMismatchCount} URL{(data.install.webhookUrlMismatchCount || 0) > 1 ? 's' : ''} fora do esperado
                </span>
              )}
              {data.install.apiSecretConfigured === false && (
                <span className="text-[10.5px] px-2 py-1 bg-amber-50 text-amber-700 rounded font-semibold border border-amber-200">
                  api_secret ausente
                </span>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
            {data.install.webhooks.map((w, i) => (
              <div key={i} className="px-4 py-2 flex items-center gap-2.5">
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  w.matches_expected ? 'bg-emerald-500' : 'bg-red-500'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-mono font-semibold text-gray-900 truncate">{w.topic}</p>
                  <p className={cn(
                    'text-[10.5px] truncate font-mono',
                    w.matches_expected ? 'text-gray-500' : 'text-red-600'
                  )}>{w.address}</p>
                </div>
                {!w.matches_expected && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 rounded font-semibold flex-shrink-0">
                    URL ERRADA
                  </span>
                )}
              </div>
            ))}
          </div>
          {(data.install.webhookUrlMismatchCount || 0) > 0 && (
            <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-[11.5px] text-red-800">
              ⚠️ <strong>{data.install.webhookUrlMismatchCount} subscription{(data.install.webhookUrlMismatchCount || 0) > 1 ? 's' : ''} apontando pra URL errada.</strong>{' '}
              Shopify está mandando os eventos pra um endpoint que não é o nosso. Use <strong>"Reinstalar tudo"</strong> acima — ele apaga as antigas e cria no endpoint certo.
            </div>
          )}
          {data.install.syncCheckoutsEnabled === false && (
            <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-[11.5px] text-amber-800">
              ⚠️ <strong>sync_checkouts está desativado</strong> nesta loja — webhooks de checkout chegam mas são ignorados antes de virar evento.
            </div>
          )}
        </div>
      )}

      {/* Abandoned checkouts saved in our DB — shows whether the row
          made it to shopify_checkouts. If it did but no checkout_started
          event exists, click "Reprocessar checkouts" above. */}
      {data.recentCheckouts && data.recentCheckouts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[13px] font-semibold text-gray-900">Checkouts no banco</p>
            <p className="text-[11px] text-gray-400">Últimos 10 — se há checkout aqui mas falta evento, use Reprocessar</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-[280px] overflow-y-auto">
            {data.recentCheckouts.map(c => {
              const ageMs = Date.now() - new Date(c.shopify_created_at).getTime()
              const ageStr = ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s` : ageMs < 3600000 ? `${Math.floor(ageMs / 60000)}m` : ageMs < 86400000 ? `${Math.floor(ageMs / 3600000)}h` : `${Math.floor(ageMs / 86400000)}d`
              return (
                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <CreditCard className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-gray-900 truncate">
                      {c.email || <span className="italic text-gray-500">sem email</span>}
                      {c.has_contact && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">contato vinculado</span>}
                    </p>
                    <p className="text-[10.5px] text-gray-500">
                      #{c.shopify_checkout_id} · {c.status} · {c.currency} {Number(c.total_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{ageStr} atrás</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live event feed */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-900">Eventos recentes</p>
            <span className="text-[11px] text-gray-400">{data.recentEvents.length} mais novos</span>
          </div>
          {data.recentEvents.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] font-medium text-gray-700">Nenhum evento ainda</p>
              <p className="text-[11px] text-gray-500 mt-1">
                Abra sua loja em outra aba, navegue produtos e os eventos aparecem aqui em segundos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {data.recentEvents.map(e => {
                const Icon = EVENT_ICONS[e.event_type] || Activity
                const ageMs = Date.now() - new Date(e.received_at).getTime()
                const ageStr = ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s` : ageMs < 3600000 ? `${Math.floor(ageMs / 60000)}m` : `${Math.floor(ageMs / 3600000)}h`
                return (
                  <div key={e.id} className="px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${e.contact_id ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-gray-900">{e.event_type}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">{e.event_source}</span>
                          {e.contact_id ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">Identificado</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">Anônimo</span>
                          )}
                          <span className="text-[10px] text-gray-400 ml-auto">{ageStr} atrás</span>
                        </div>
                        <div className="text-[11.5px] text-gray-600 mt-1 space-y-0.5">
                          {e.product_title && <p>📦 {e.product_title} {e.product_id && <span className="text-gray-400">· #{e.product_id}</span>}</p>}
                          {e.email && <p>✉️ {e.email}</p>}
                          {e.page_url && <p className="truncate">🔗 {e.page_url}</p>}
                          {e.monetary_value != null && <p>💰 {e.currency || 'BRL'} {Number(e.monetary_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
                          <p className="text-gray-400">
                            session: <code className="font-mono">{(e.session_id || '—').slice(0, 12)}</code>
                            {e.anonymous_id && <> · anon: <code className="font-mono">{e.anonymous_id.slice(0, 12)}</code></>}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column: counts + recent contacts */}
        <div className="space-y-5">
          {/* Counts by type */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[13px] font-semibold text-gray-900">Por tipo (24h)</p>
              <p className="text-[11px] text-gray-400">Total: {total24h}</p>
            </div>
            {!hasAny ? (
              <p className="p-4 text-[12px] text-gray-500">Sem eventos nas últimas 24h.</p>
            ) : (
              <div className="p-3 space-y-1.5">
                {Object.entries(c.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[12px] text-gray-700 flex-1 truncate">{type}</span>
                    <div className="flex-1 max-w-[80px] h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-zinc-900" style={{ width: `${(count / total24h) * 100}%` }} />
                    </div>
                    <span className="text-[12px] font-semibold text-gray-900 tabular-nums w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolution */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[13px] font-semibold text-gray-900 mb-2">Identificação (24h)</p>
            <div className="flex h-2.5 rounded overflow-hidden bg-gray-100">
              <div className="bg-emerald-500" style={{ width: `${total24h > 0 ? (c.resolved / total24h) * 100 : 0}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-emerald-700 font-medium">✓ {c.resolved} identificados</span>
              <span className="text-gray-500">{c.anonymous} anônimos</span>
            </div>
          </div>

          {/* Recent contacts */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[13px] font-semibold text-gray-900">Contatos recentes</p>
            </div>
            {data.recentContacts.length === 0 ? (
              <p className="p-4 text-[12px] text-gray-500">Nenhum contato salvo ainda.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentContacts.map(ct => (
                  <div key={ct.id} className="px-4 py-2.5 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-900 truncate">{ct.email}</p>
                      <p className="text-[10px] text-gray-500">
                        {ct.name && <>{ct.name} · </>}{ct.total_orders} pedidos
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, ok, value, hint }: { label: string; ok: boolean; value?: number; hint: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        {ok ? (
          <CheckCircle className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertCircle className="w-4 h-4 text-amber-500" />
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">
        {value != null ? value : (ok ? 'OK' : '—')}
      </p>
      <p className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">{hint}</p>
    </div>
  )
}
