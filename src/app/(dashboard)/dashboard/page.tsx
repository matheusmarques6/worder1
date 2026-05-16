'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuthStore, useStoreStore } from '@/stores'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { RefreshCw, ChevronDown, TrendingUp, TrendingDown, Info, ExternalLink, Download } from 'lucide-react'
import { ShopifySyncProgress } from '@/components/shopify/ShopifySyncProgress'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month'
type Granularity = 'daily' | 'weekly' | 'monthly'
type ChartTab = 'revenue' | 'orders'

interface RecentCampaign {
  id: string
  name: string
  status: string
  sends: number
  openRate: number
  clickRate: number
  revenue: number
}

interface TopAutomation {
  id: string
  name: string
  status: string
  sends: number
  conversionRate: number
  revenue: number
}

interface Overview {
  worderRevenue: number
  worderOrders: number
  worderShare: number
  worderDelta: number
  campaignsRevenue: number
  campaignsOrders: number
  automationsRevenue: number
  automationsOrders: number
  storeRevenue: number
  storeOrders: number
  series: Array<{ label: string; campanhas: number; automacoes: number; fora: number }>
  sparklines: { campanhas: number[]; automacoes: number[] }
  channels: { email: number; whatsapp: number; sms: number }
  recentCampaigns: RecentCampaign[]
  topAutomations: TopAutomation[]
  hasShopify: boolean
  needsSync?: boolean
  syncTriggered?: boolean
}

const EMPTY_OVERVIEW: Overview = {
  worderRevenue: 0, worderOrders: 0, worderShare: 0, worderDelta: 0,
  campaignsRevenue: 0, campaignsOrders: 0,
  automationsRevenue: 0, automationsOrders: 0,
  storeRevenue: 0, storeOrders: 0,
  series: [],
  sparklines: { campanhas: [], automacoes: [] },
  channels: { email: 0, whatsapp: 0, sms: 0 },
  recentCampaigns: [], topAutomations: [],
  hasShopify: false,
  needsSync: false,
  syncTriggered: false,
}

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'month', label: 'Este mês' },
]

const GRANULARITY_OPTIONS: Array<{ value: Granularity; label: string }> = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
]

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatBRL(v: number, currency = 'BRL'): string {
  const rounded = Math.round(v)
  // Render in the store's actual currency. The label below the hero is
  // built from the same `currency` so a GBP store doesn't see R$ next to
  // a £ chart. Falls back to a `CCC 1.234` shape if Intl rejects the
  // currency code (paranoia: shop_domain.currency is text from Shopify).
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(rounded)
  } catch {
    if (rounded === 0) return `${currency} 0`
    return `${currency} ${rounded.toLocaleString('pt-BR')}`
  }
}

function formatBRLCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1000) return `${Math.round(v / 1000)}k`
  return `${Math.round(v)}`
}

function formatPct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}

function timeAgoShort(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

// Count-up (ease-out cubic), used only on the hero number.
function useCountUp(target: number, duration = 1800): number {
  const [val, setVal] = useState(target * 0.6)
  const raf = useRef<number | null>(null)
  useEffect(() => {
    const start = performance.now()
    const from = target * 0.6
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (target - from) * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration])
  return val
}

// ──────────────────────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const firstName = (user?.name?.split(' ')[0]) || user?.email?.split('@')[0] || 'por aí'

  // Currency comes from the connected Shopify store. A merchant on a
  // GBP shop would otherwise see "R$" prefixes everywhere because the
  // formatter was hardcoded to BRL. Falls back to BRL when no store is
  // selected (first-time onboarding or manual organizations).
  const currency = (currentStore?.currency || 'BRL').toUpperCase()
  const fmtMoney = (v: number) => formatBRL(v, currency)

  // Persist filter choices across sessions so users land where they
  // left off. Defaults to 30d / weekly / revenue on first visit.
  const [range, setRange] = useState<RangeKey>('30d')
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const [tab, setTab] = useState<ChartTab>('revenue')

  useEffect(() => {
    try {
      const r = localStorage.getItem('wd:range') as RangeKey | null
      const g = localStorage.getItem('wd:granularity') as Granularity | null
      const t = localStorage.getItem('wd:chartTab') as ChartTab | null
      if (r && RANGE_OPTIONS.some((o) => o.value === r)) setRange(r)
      if (g && GRANULARITY_OPTIONS.some((o) => o.value === g)) setGranularity(g)
      if (t === 'revenue' || t === 'orders') setTab(t)
    } catch {}
  }, [])

  useEffect(() => { try { localStorage.setItem('wd:range', range) } catch {} }, [range])
  useEffect(() => { try { localStorage.setItem('wd:granularity', granularity) } catch {} }, [granularity])
  useEffect(() => { try { localStorage.setItem('wd:chartTab', tab) } catch {} }, [tab])
  // Active Shopify sync job — when set, the progress strip polls
  // /api/shopify/jobs/[id] every 2s and renders a horizontal bar
  // above the dashboard until status flips to completed/failed.
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [data, setData] = useState<Overview>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date>(new Date())
  const [, setNow] = useState<Date>(new Date())
  const [toast, setToast] = useState<string | null>(null)

  // "Atualizado há N min" tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // Transient toast for shortcut / export feedback.
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  const fetchData = async () => {
    if (!currentStore?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/overview?range=${range}&granularity=${granularity}&storeId=${currentStore.id}`, { cache: 'no-store' })
      if (res.ok) {
        const json = (await res.json()) as Overview
        setData({ ...EMPTY_OVERVIEW, ...json })
      }
    } catch {
      setData(EMPTY_OVERVIEW)
    } finally {
      setLoading(false)
      setLastFetch(new Date())
      setNow(new Date())
    }
  }

  // Hydration gate. currentStore is undefined for one render after
  // F5 (zustand reads localStorage async). Without this guard the
  // first fetch lands without a storeId; the overview endpoint
  // then picks the org's "first" store and the merchant sees the
  // wrong store's revenue / pedidos flash for ~1 frame.
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return
    fetchData()
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [range, granularity, currentStore?.id, hasHydrated])

  // Keyboard shortcut: "R" refreshes (ignored while typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        fetchData()
        showToast('Atualizado')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, granularity])

  // CSV export — exports the current period's time-series plus channel
  // totals and KPIs. Opens a download without leaving the page.
  const exportCSV = () => {
    const rows: string[][] = []
    rows.push(['Dashboard Worder — export', new Date().toISOString()])
    rows.push([])
    rows.push(['Período', range, 'Granularidade', granularity])
    rows.push([])
    rows.push(['KPIs'])
    rows.push(['Receita via Worder', String(data.worderRevenue)])
    rows.push(['% do faturamento', data.worderShare.toFixed(2) + '%'])
    rows.push(['Pedidos via Worder', String(data.worderOrders)])
    rows.push(['Campanhas (receita)', String(data.campaignsRevenue)])
    rows.push(['Campanhas (pedidos)', String(data.campaignsOrders)])
    rows.push(['Automações (receita)', String(data.automationsRevenue)])
    rows.push(['Automações (pedidos)', String(data.automationsOrders)])
    rows.push(['Receita total da loja', String(data.storeRevenue)])
    rows.push(['Pedidos totais', String(data.storeOrders)])
    rows.push([])
    rows.push(['Canal', 'Receita'])
    rows.push(['Email', String(data.channels.email)])
    rows.push(['WhatsApp', String(data.channels.whatsapp)])
    rows.push(['SMS', String(data.channels.sms)])
    rows.push([])
    rows.push(['Período', 'Campanhas', 'Automações', 'Receita total da loja'])
    for (const s of data.series) {
      rows.push([s.label, String(s.campanhas), String(s.automacoes), String(s.fora)])
    }

    const esc = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"'
      }
      return v
    }
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `worder-dashboard-${range}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('CSV baixado')
  }

  const heroAnim = useCountUp(data.worderRevenue)

  // Chart data — use revenue or order counts per bucket
  const chartRows = data.series.map((p) => {
    if (tab === 'revenue') return p
    const totalOrdersStore = data.storeOrders || 0
    const aov = totalOrdersStore > 0 && data.storeRevenue > 0 ? data.storeRevenue / totalOrdersStore : 1
    return {
      label: p.label,
      campanhas: Math.round(p.campanhas / (aov || 1)),
      automacoes: Math.round(p.automacoes / (aov || 1)),
      fora: Math.round(p.fora / (aov || 1)),
    }
  })

  const channelTotal = data.channels.email + data.channels.whatsapp + data.channels.sms || 1
  const channelPct = {
    email: (data.channels.email / channelTotal) * 100,
    whatsapp: (data.channels.whatsapp / channelTotal) * 100,
    sms: (data.channels.sms / channelTotal) * 100,
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]" style={{ fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif' }}>
      <div className="w-full px-8 py-10 lg:px-12 lg:py-12 pb-16">
        {/* ── Greeting ── */}
        <header className="mb-11">
          <h1 className="text-[26px] font-bold text-[#18181B] leading-tight" style={{ letterSpacing: '-0.03em' }}>
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-[14px] text-[#A1A1AA] mt-1">Aqui está o resumo da sua operação.</p>
        </header>

        {/* ── Onboarding banner: shown until a Shopify store is connected ── */}
        {!loading && !data.hasShopify && (
          <div
            className="mb-11 rounded-[14px] bg-white px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
            style={{ border: '1px solid #E4E4E7' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#18181B]" style={{ letterSpacing: '-0.01em' }}>
                Conecte sua loja para liberar a dashboard
              </div>
              <p className="text-[13px] text-[#71717A] mt-1 leading-relaxed">
                Vincule sua Shopify para ver receita, pedidos e atribuição das suas campanhas e automações em tempo real.
              </p>
            </div>
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#18181B] hover:bg-[#27272A] transition-colors px-4 py-2 rounded-[8px] shrink-0"
            >
              Conectar Shopify <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* ── Background sync progress (Shopify) ──
            Polled live while a worker drains GraphQL/Bulk results into
            shopify_orders. Shows order count + page progress; auto-
            dismisses once the job completes (we also refresh data). */}
        {activeJobId && (
          <div className="mb-6">
            <ShopifySyncProgress
              jobId={activeJobId}
              onComplete={() => { fetchData(); }}
              onDismiss={() => setActiveJobId(null)}
            />
          </div>
        )}

        {/* ── Sync banner: store connected but data not yet synced ──
            The dashboard endpoint detects this and auto-triggers sync-now
            in the background. We surface a banner so the merchant knows
            why values are R$ 0 and that data is on its way. */}
        {!loading && data.hasShopify && data.needsSync && (
          <div
            className="mb-11 rounded-[14px] px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
            style={{ border: '1px solid #FDE68A', background: '#FFFBEB' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#92400E] flex items-center gap-2" style={{ letterSpacing: '-0.01em' }}>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {data.syncTriggered ? 'Sincronizando dados da Shopify…' : 'Loja conectada — sem pedidos sincronizados'}
              </div>
              <p className="text-[13px] text-[#92400E] opacity-90 mt-1 leading-relaxed">
                {data.syncTriggered
                  ? 'Iniciamos uma sincronização automática (pedidos dos últimos 90 dias). Os valores aparecem nesta dashboard em alguns minutos. Pode atualizar a página.'
                  : 'Conexão ok mas ainda não importamos os pedidos. Clique em sincronizar para começar.'}
              </p>
            </div>
            <button
              onClick={async () => {
                if (!currentStore?.id) return;
                showToast('Iniciando sync…');
                try {
                  const res = await fetch('/api/shopify/sync-now', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // historical: true tells the server to skip the 90-day
                    // window for orders so the merchant gets the full
                    // backlog — that's what "Sincronizar tudo" implies.
                    body: JSON.stringify({ storeId: currentStore.id, syncType: 'all', historical: true }),
                  });
                  const data = await res.json().catch(() => ({}));
                  // Three response shapes:
                  //  - { mode: 'bulk', jobId, bulkOperationId } — Shopify
                  //    Bulk Operations path. Async on Shopify's side,
                  //    finalized via the bulk-finish webhook. The merchant
                  //    can navigate away; we'll keep polling the job.
                  //  - { mode: 'background', jobId } — QStash worker.
                  //  - inline result — small/incremental syncs that
                  //    finished within the 300s function budget.
                  if (data?.mode === 'bulk' && data?.jobId) {
                    setActiveJobId(data.jobId);
                    showToast('Exportação completa em andamento na Shopify. Pode demorar alguns minutos.');
                  } else if (data?.mode === 'background' && data?.jobId) {
                    setActiveJobId(data.jobId);
                    showToast('Sync rodando em background. Acompanhe abaixo.');
                  } else {
                    showToast('Sync iniciado. Atualizando…');
                    setTimeout(fetchData, 3000);
                  }
                } catch {
                  showToast('Falhou — tente em /integrations/shopify');
                }
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors px-4 py-2 rounded-[8px] shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar agora
            </button>
          </div>
        )}

        {/* ── Section header ── */}
        <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
          <div>
            <h2 className="text-[20px] font-bold text-[#18181B] leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Desempenho de vendas
            </h2>
            <button
              className="inline-flex items-center gap-1 text-[13px] text-[#71717A] hover:text-[#3F3F46] mt-1 transition-colors"
              title="Receita atribuída: pedidos realizados dentro da janela de atribuição após clique em email, WhatsApp ou SMS enviados pela Worder."
            >
              <Info className="w-3.5 h-3.5" />
              Como calculamos as vendas
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-[#A1A1AA] hover:text-[#52525B] transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-[13px] h-[13px] ${loading ? 'animate-spin' : ''}`} />
              Atualizado {timeAgoShort(lastFetch)}
            </button>
            <RangeSelect value={range} onChange={setRange} />
            <GranularitySelect value={granularity} onChange={setGranularity} />
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#52525B] hover:text-[#18181B] bg-white px-3 py-2 rounded-[8px] hover:border-[#D4D4D8] transition-colors"
              style={{ border: '1px solid #E4E4E7' }}
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* ── KPI Stack + Bar Chart ── */}
        <div className="flex gap-5 mb-14 flex-wrap lg:flex-nowrap">
          {/* KPI stack (340px) */}
          <div className="flex flex-col gap-3.5 w-full lg:w-[340px] lg:flex-shrink-0">
            {/* Hero card */}
            <div
              className="relative overflow-hidden rounded-[14px] text-white px-[26px] py-6"
              style={{ background: 'linear-gradient(135deg, #F97316 0%, #EA580C 60%, #C2410C 100%)' }}
            >
              <div
                aria-hidden
                className="absolute pointer-events-none"
                style={{ top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }}
              />
              <div className="flex items-center justify-between relative">
                <span className="text-[13px] font-semibold">Receita via Worder</span>
                {data.worderDelta !== 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[12px] font-bold px-[10px] py-[3px] rounded-full"
                    style={{ background: 'rgba(255,255,255,0.18)' }}
                    title={`${data.worderDelta > 0 ? 'Crescimento' : 'Queda'} em relação ao período anterior`}
                  >
                    {data.worderDelta > 0
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {data.worderDelta > 0 ? '+' : ''}{data.worderDelta}%
                  </span>
                )}
              </div>
              <div
                className="text-[34px] font-bold mt-2"
                style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', minHeight: 41 }}
              >
                {loading && data.worderRevenue === 0 ? (
                  <span className="inline-block w-36 h-7 rounded bg-white/15 animate-pulse" />
                ) : (
                  fmtMoney(heroAnim)
                )}
              </div>
              <div className="flex items-center justify-between mt-3 relative">
                <span className="text-[13px] font-semibold opacity-[0.85]">
                  {formatPct(data.worderShare)} do faturamento
                </span>
                <span className="text-[12px] opacity-50">
                  {data.worderOrders.toLocaleString('pt-BR')} pedidos
                </span>
              </div>
            </div>

            {/* Campanhas + Automações */}
            <div className="flex gap-3.5">
              <MiniKPI
                label="Campanhas"
                value={data.campaignsRevenue}
                sub={`${data.campaignsOrders.toLocaleString('pt-BR')} pedidos`}
                spark={data.sparklines?.campanhas}
              />
              <MiniKPI
                label="Automações"
                value={data.automationsRevenue}
                sub={`${data.automationsOrders.toLocaleString('pt-BR')} pedidos`}
                spark={data.sparklines?.automacoes}
              />
            </div>

            {/* Receita total da loja */}
            <div className="rounded-[12px] bg-white px-5 py-[18px] transition-colors hover:bg-[#FAFAFA]" style={{ border: '1px solid #E4E4E7' }}>
              <div className="text-[12px] font-semibold text-[#71717A] mb-2">Receita total da loja</div>
              <div
                className="text-[24px] font-bold text-[#18181B]"
                style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtMoney(data.storeRevenue)}
              </div>
              <div className="text-[12px] text-[#A1A1AA] mt-[6px]">
                {data.storeOrders.toLocaleString('pt-BR')} pedidos
              </div>
            </div>
          </div>

          {/* Chart (flex 1) */}
          <div className="flex-1 min-w-0 rounded-[14px] bg-white px-7 py-6" style={{ border: '1px solid #E4E4E7' }}>
            {/* Tabs + Legend */}
            <div className="flex items-center justify-between mb-5" style={{ borderBottom: '2px solid #E4E4E7' }}>
              <div className="flex">
                {(['revenue', 'orders'] as ChartTab[]).map((t) => {
                  const active = tab === t
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="text-[14px] px-6 py-2 -mb-[2px] transition-colors"
                      style={{
                        fontWeight: active ? 700 : 400,
                        color: active ? '#18181B' : '#A1A1AA',
                        borderBottom: active ? '2px solid #18181B' : '2px solid transparent',
                      }}
                    >
                      {t === 'revenue' ? 'Receita' : 'Pedidos'}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 pb-2">
                <LegendDot color="#F26B2A" label="Campanhas" />
                <LegendDot color="#8B5CF6" label="Automações" />
                <LegendDot color="#E4E4E7" label="Receita total da loja" border="#D4D4D8" />
              </div>
            </div>

            <div className="h-[280px]">
              {loading && chartRows.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-[13px] text-[#A1A1AA]">
                  Carregando…
                </div>
              ) : chartRows.every((p) => p.campanhas + p.automacoes + p.fora === 0) ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-[13px] text-[#A1A1AA] gap-2">
                  <span>Nenhuma venda registrada no período.</span>
                  <Link href="/campaigns/new" className="text-[#52525B] hover:text-[#18181B] underline underline-offset-2">
                    Criar primeira campanha
                  </Link>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 12, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F4F4F5" strokeWidth={0.5} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: '#E4E4E7' }}
                      tick={{ fontSize: 11.5, fill: '#A1A1AA' }}
                      dy={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#A1A1AA' } as any}
                      tickFormatter={(v) => (tab === 'revenue' ? formatBRLCompact(v) : String(v))}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: '#F4F4F5' }}
                      content={<RichTooltip isRevenue={tab === 'revenue'} />}
                      wrapperStyle={{ outline: 'none' }}
                    />
                    <Bar dataKey="campanhas" stackId="a" fill="#F26B2A" barSize={34} />
                    <Bar dataKey="automacoes" stackId="a" fill="#8B5CF6" barSize={34} />
                    <Bar dataKey="fora" stackId="a" fill="#E4E4E7" radius={[3, 3, 0, 0]} barSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── Receita por canal ── */}
        <section className="rounded-[14px] bg-white px-7 py-6 mb-14" style={{ border: '1px solid #E4E4E7' }}>
          <h3 className="text-[16px] font-bold text-[#18181B] mb-[22px]">Receita por canal</h3>
          <div
            className="relative w-full h-[5px] rounded-[5px] overflow-hidden flex"
            style={{ background: '#F4F4F5' }}
          >
            <div style={{ width: `${channelPct.email}%`, background: '#F26B2A' }} />
            <div style={{ width: `${channelPct.whatsapp}%`, background: '#25D366' }} />
            <div style={{ width: `${channelPct.sms}%`, background: '#6366F1' }} />
          </div>
          <div className="grid grid-cols-3 gap-5 mt-6">
            <ChannelItem label="Email" value={data.channels.email} pct={channelPct.email} color="#F26B2A" />
            <ChannelItem label="WhatsApp" value={data.channels.whatsapp} pct={channelPct.whatsapp} color="#25D366" />
            <ChannelItem label="SMS" value={data.channels.sms} pct={channelPct.sms} color="#6366F1" />
          </div>
        </section>

        {/* ── Rankings ── */}
        <section className="flex gap-5 flex-wrap lg:flex-nowrap">
          <RankingCard
            title="Campanhas recentes"
            seeAllHref="/campaigns"
            items={data.recentCampaigns}
            itemHref={(c: RecentCampaign) => `/campaigns/${c.id}`}
            renderDetails={(c: RecentCampaign) =>
              `${c.sends.toLocaleString('pt-BR')} envios · Abertura ${formatPct(c.openRate)} · Clique ${formatPct(c.clickRate)}`
            }
            emptyLabel="Ainda sem campanhas enviadas."
            emptyHref="/campaigns/new"
            emptyAction="Criar campanha"
          />
          <RankingCard
            title="Top automações"
            seeAllHref="/automations"
            items={data.topAutomations}
            itemHref={(a: TopAutomation) => `/automations/${a.id}`}
            renderDetails={(a: TopAutomation) =>
              `${a.sends.toLocaleString('pt-BR')} envios · Conversão ${formatPct(a.conversionRate)}`
            }
            emptyLabel="Ainda sem automações ativas."
            emptyHref="/automations"
            emptyAction="Criar automação"
          />
        </section>
      </div>

      {/* Floating toast for keyboard shortcut + export feedback */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-[10px] text-[13px] font-medium text-white shadow-lg"
          style={{ background: '#18181B' }}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function MiniKPI({ label, value, sub, spark }: { label: string; value: number; sub: string; spark?: number[] }) {
  const currency = (useStoreStore((s) => s.currentStore?.currency) || "BRL").toUpperCase()
  return (
    <div className="flex-1 rounded-[12px] bg-white px-5 py-[18px] transition-colors hover:bg-[#FAFAFA] relative overflow-hidden" style={{ border: '1px solid #E4E4E7' }}>
      <div className="text-[12px] font-semibold text-[#71717A] mb-2">{label}</div>
      <div className="text-[19px] font-bold text-[#18181B]" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(value, currency)}
      </div>
      <div className="text-[12px] text-[#A1A1AA] mt-[6px]">{sub}</div>
      {spark && spark.length > 1 && spark.some((v) => v > 0) && (
        <div className="mt-2 -mx-1 -mb-1 h-[22px] opacity-60">
          <Sparkline values={spark} />
        </div>
      )}
    </div>
  )
}

// Lightweight inline SVG sparkline — no deps, no tooltip, purely visual.
function Sparkline({ values }: { values: number[] }) {
  const w = 100
  const h = 22
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / span) * h).toFixed(2)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full block">
      <polyline points={points} fill="none" stroke="#A1A1AA" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Rich tooltip used by the stacked bar chart — shows a breakdown by
// category with color dots, tabular-nums values, and a separator above
// the total so it reads like the Klaviyo / Linear tooltip style.
function RichTooltip({ active, payload, label, isRevenue }: any) {
  if (!active || !payload || !payload.length) return null
  const currency = (useStoreStore((s) => s.currentStore?.currency) || "BRL").toUpperCase()
  const rows: Array<{ name: string; value: number; color: string }> = []
  const keyMap: Record<string, { name: string; color: string }> = {
    campanhas: { name: 'Campanhas', color: '#F26B2A' },
    automacoes: { name: 'Automações', color: '#8B5CF6' },
    fora: { name: 'Receita total da loja', color: '#D4D4D8' },
  }
  for (const p of payload) {
    const k = p?.dataKey as string
    const meta = keyMap[k]
    if (!meta) continue
    rows.push({ name: meta.name, value: Number(p?.value) || 0, color: meta.color })
  }
  const total = rows.reduce((s, r) => s + r.value, 0)
  const fmt = (v: number) => (isRevenue ? formatBRL(v, currency) : v.toLocaleString('pt-BR'))

  return (
    <div
      className="min-w-[200px]"
      style={{
        background: 'white',
        border: '1px solid #E4E4E7',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        padding: '10px 12px',
      }}
    >
      <div className="text-[11.5px] font-semibold text-[#71717A] mb-2">{label}</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-6 text-[12.5px]">
            <span className="flex items-center gap-2 text-[#52525B]">
              <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className="font-semibold text-[#18181B]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(r.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 flex items-center justify-between text-[12.5px]" style={{ borderTop: '1px solid #F4F4F5' }}>
        <span className="text-[#71717A] font-semibold">Total</span>
        <span className="font-bold text-[#18181B]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
      </div>
    </div>
  )
}

function LegendDot({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#71717A]">
      <span
        className="inline-block w-[10px] h-[10px] rounded-[2px]"
        style={{ background: color, ...(border ? { border: `1px solid ${border}` } : {}) }}
      />
      {label}
    </span>
  )
}

function ChannelItem({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  const currency = (useStoreStore((s) => s.currentStore?.currency) || "BRL").toUpperCase()
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#71717A]">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="text-[22px] font-bold text-[#18181B] mt-2" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(value, currency)}
      </div>
      <div className="text-[12px] text-[#A1A1AA] mt-1">{formatPct(pct)}</div>
    </div>
  )
}

function RangeSelect({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RangeKey)}
        className="appearance-none bg-white text-[13.5px] font-medium text-[#18181B] px-4 py-2 pr-8 rounded-[8px] cursor-pointer hover:border-[#D4D4D8] transition-colors focus:outline-none focus:border-[#A1A1AA]"
        style={{ border: '1px solid #E4E4E7' }}
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA] pointer-events-none" />
    </div>
  )
}

function GranularitySelect({ value, onChange }: { value: Granularity; onChange: (v: Granularity) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Granularity)}
        className="appearance-none bg-white text-[13.5px] font-medium text-[#18181B] px-4 py-2 pr-8 rounded-[8px] cursor-pointer hover:border-[#D4D4D8] transition-colors focus:outline-none focus:border-[#A1A1AA]"
        style={{ border: '1px solid #E4E4E7' }}
      >
        {GRANULARITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA] pointer-events-none" />
    </div>
  )
}

function RankingCard<T extends { id: string; name: string; status: string; revenue: number }>({
  title,
  seeAllHref,
  items,
  itemHref,
  renderDetails,
  emptyLabel,
  emptyHref,
  emptyAction,
}: {
  title: string
  seeAllHref: string
  // (currency captured below from the live store; not threaded through props)
  items: T[]
  itemHref?: (item: T) => string
  renderDetails: (item: T) => string
  emptyLabel: string
  emptyHref: string
  emptyAction: string
}) {
  const currency = (useStoreStore((s) => s.currentStore?.currency) || "BRL").toUpperCase()
  return (
    <div className="flex-1 min-w-0 rounded-[14px] bg-white px-7 py-6" style={{ border: '1px solid #E4E4E7' }}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[16px] font-bold text-[#18181B]">{title}</h3>
        <Link href={seeAllHref} className="text-[13px] font-semibold text-[#52525B] hover:text-[#18181B] transition-colors">
          Ver todas
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] text-[#A1A1AA]">{emptyLabel}</p>
          <Link href={emptyHref} className="inline-block mt-2 text-[13px] font-semibold text-[#52525B] hover:text-[#18181B] underline underline-offset-2">
            {emptyAction}
          </Link>
        </div>
      ) : (
        items.map((item) => {
          const row = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[#18181B] truncate">{item.name}</div>
                  <div className="text-[12.5px] text-[#A1A1AA] mt-[5px]">{renderDetails(item)}</div>
                </div>
                <span
                  className="text-[11.5px] font-semibold text-[#52525B] px-[10px] py-[2px] rounded-full shrink-0"
                  style={{ background: '#F4F4F5' }}
                >
                  {item.status}
                </span>
              </div>
              <div className="text-[16px] font-bold text-[#18181B] mt-[5px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatBRL(item.revenue, currency)}
              </div>
            </>
          )
          const commonClass = 'block py-4 -mx-2 px-2 rounded-[6px] transition-colors'
          if (itemHref) {
            return (
              <Link
                key={item.id}
                href={itemHref(item)}
                className={`${commonClass} hover:bg-[#FAFAFA]`}
                style={{ borderTop: '1px solid #F4F4F5' }}
              >
                {row}
              </Link>
            )
          }
          return (
            <div key={item.id} className={commonClass} style={{ borderTop: '1px solid #F4F4F5' }}>
              {row}
            </div>
          )
        })
      )}
    </div>
  )
}
