'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase'
import { useAuthStore } from '@/stores'
import { RefreshCw, ChevronDown } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// Worder Dashboard — grayscale + single orange highlight card
// Design spec: 1200px max, DM Sans, gray.900 chart, gray rankings.
// ═══════════════════════════════════════════════════════════════

type Period = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'custom'
type Granularity = 'daily' | 'weekly' | 'monthly'
type ChartTab = 'revenue' | 'orders'

interface DashboardData {
  worderRevenue: number
  worderOrders: number
  worderShare: number // percentage of total store revenue
  worderDelta: number // % vs previous period
  campaignsRevenue: number
  campaignsOrders: number
  automationsRevenue: number
  automationsOrders: number
  storeRevenue: number
  storeOrders: number
  series: Array<{ label: string; campanhas: number; automacoes: number; fora: number }>
  channels: { email: number; whatsapp: number; sms: number }
  recentCampaigns: Array<{ id: string; name: string; status: string; sends: number; openRate: number; clickRate: number; revenue: number }>
  topAutomations: Array<{ id: string; name: string; status: string; sends: number; conversionRate: number; revenue: number }>
}

const PLACEHOLDER: DashboardData = {
  worderRevenue: 89800,
  worderOrders: 847,
  worderShare: 28.7,
  worderDelta: 18,
  campaignsRevenue: 28100,
  campaignsOrders: 312,
  automationsRevenue: 61700,
  automationsOrders: 535,
  storeRevenue: 312480,
  storeOrders: 2847,
  series: [
    { label: 'Mar 16', campanhas: 14000, automacoes: 19000, fora: 30000 },
    { label: 'Mar 23', campanhas: 13000, automacoes: 20000, fora: 30000 },
    { label: 'Mar 30', campanhas: 17000, automacoes: 26000, fora: 36000 },
    { label: 'Abr 6',  campanhas: 16000, automacoes: 23000, fora: 33000 },
    { label: 'Abr 13', campanhas: 18000, automacoes: 25000, fora: 35000 },
  ],
  channels: { email: 65400, whatsapp: 16800, sms: 7600 },
  recentCampaigns: [
    { id: '1', name: 'Promoção de Páscoa',     status: 'Enviada', sends: 12480, openRate: 42.3, clickRate: 8.1, revenue: 8420 },
    { id: '2', name: 'Newsletter Semanal #14', status: 'Enviada', sends: 11200, openRate: 38.7, clickRate: 5.4, revenue: 3180 },
    { id: '3', name: 'Flash Sale Abril',       status: 'Enviada', sends:  9800, openRate: 44.1, clickRate: 9.2, revenue: 5640 },
  ],
  topAutomations: [
    { id: '1', name: 'Carrinho abandonado', status: 'Ativo', sends: 4280, conversionRate: 8.4,  revenue: 24600 },
    { id: '2', name: 'Boas-vindas',         status: 'Ativo', sends: 2140, conversionRate: 12.1, revenue: 18200 },
    { id: '3', name: 'Win-back 30 dias',    status: 'Ativo', sends: 1860, conversionRate: 4.2,  revenue:  6800 },
  ],
}

// ── Count-up animation (spec: only for Receita via Worder) ────
function useCountUp(target: number, duration = 1800): number {
  const [val, setVal] = useState(target * 0.6)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const start = performance.now()
    const from = target * 0.6
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setVal(from + (target - from) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])
  return val
}

// ── Formatters ────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(v))
const fmtInt = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))
const fmtK = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0] || 'Convertfy'

  const [period, setPeriod] = useState<Period>('30d')
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const [chartTab, setChartTab] = useState<ChartTab>('revenue')
  const [data, setData] = useState<DashboardData>(PLACEHOLDER)
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date())

  // Real-data fetch (best-effort; falls back to placeholder on any error).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createBrowserClient()
        const sinceDate = new Date()
        const days = period === 'today' ? 1 : period === 'yesterday' ? 2
          : period === '7d' ? 7 : period === '30d' ? 30
          : period === '90d' ? 90 : period === 'month' ? 30 : 30
        sinceDate.setDate(sinceDate.getDate() - days)
        const since = sinceDate.toISOString()

        // Total store revenue + orders
        const ordersRes = await supabase
          .from('orders')
          .select('total_price')
          .gte('created_at', since)
        const storeRevenue = ordersRes.data?.reduce((s, o: any) => s + (Number(o.total_price) || 0), 0) ?? 0
        const storeOrders = ordersRes.data?.length ?? 0

        if (cancelled) return
        if (storeRevenue > 0) {
          // Approximate splits until we have attribution wired end-to-end.
          const worderRevenue = storeRevenue * 0.287
          const campaignsRevenue = worderRevenue * 0.31
          const automationsRevenue = worderRevenue * 0.69
          setData((prev) => ({
            ...prev,
            storeRevenue,
            storeOrders,
            worderRevenue,
            worderOrders: Math.round(storeOrders * 0.3),
            worderShare: 28.7,
            campaignsRevenue,
            automationsRevenue,
          }))
        }
      } catch {
        // keep placeholder
      }
    }
    load()
    return () => { cancelled = true }
  }, [period])

  const handleRefresh = () => setRefreshedAt(new Date())
  const refreshedAgo = useMemo(() => {
    const mins = Math.max(0, Math.floor((Date.now() - refreshedAt.getTime()) / 60000))
    return mins === 0 ? 'agora' : `há ${mins} min`
  }, [refreshedAt])

  return (
    <div
      style={{
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        backgroundColor: '#FAFAFA',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px 48px 64px',
        }}
      >
        {/* ── Saudação ── */}
        <div style={{ marginBottom: 44 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: '#18181B',
            letterSpacing: '-0.03em', margin: 0,
          }}>
            {getGreeting()}, {firstName}
          </h1>
          <p style={{ fontSize: 14, color: '#A1A1AA', margin: '4px 0 0 0' }}>
            Aqui está o resumo da sua operação.
          </p>
        </div>

        {/* ── Header da seção Desempenho ── */}
        <SectionHeader
          period={period} setPeriod={setPeriod}
          granularity={granularity} setGranularity={setGranularity}
          refreshedAgo={refreshedAgo} onRefresh={handleRefresh}
        />

        {/* ── KPI Stack + Chart ── */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 56 }}>
          <KPIStack data={data} />
          <ChartCard data={data} tab={chartTab} setTab={setChartTab} />
        </div>

        {/* ── Receita por canal ── */}
        <ChannelsCard channels={data.channels} />

        {/* ── Rankings ── */}
        <div style={{ display: 'flex', gap: 20, marginTop: 56 }}>
          <RecentCampaigns items={data.recentCampaigns} />
          <TopAutomations items={data.topAutomations} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Section header
// ═══════════════════════════════════════════════════════════════
function SectionHeader({
  period, setPeriod, granularity, setGranularity, refreshedAgo, onRefresh,
}: {
  period: Period; setPeriod: (p: Period) => void
  granularity: Granularity; setGranularity: (g: Granularity) => void
  refreshedAgo: string; onRefresh: () => void
}) {
  const periodOptions: Array<{ value: Period; label: string }> = [
    { value: 'today',     label: 'Hoje' },
    { value: 'yesterday', label: 'Ontem' },
    { value: '7d',        label: 'Últimos 7 dias' },
    { value: '30d',       label: 'Últimos 30 dias' },
    { value: '90d',       label: 'Últimos 90 dias' },
    { value: 'month',     label: 'Este mês' },
    { value: 'custom',    label: 'Personalizado' },
  ]
  const granOptions: Array<{ value: Granularity; label: string }> = [
    { value: 'daily',   label: 'Diário' },
    { value: 'weekly',  label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
  ]

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#18181B', margin: 0, letterSpacing: '-0.02em' }}>
          Desempenho de vendas
        </h2>
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{ fontSize: 13, color: '#71717A', textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
        >
          Como calculamos as vendas
        </a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onRefresh}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, color: '#A1A1AA',
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          }}
          title="Atualizar"
        >
          <RefreshCw size={13} />
          Atualizado {refreshedAgo}
        </button>
        <NativeSelect
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={periodOptions}
        />
        <NativeSelect
          value={granularity}
          onChange={(v) => setGranularity(v as Granularity)}
          options={granOptions}
        />
      </div>
    </div>
  )
}

function NativeSelect<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  const current = options.find((o) => o.value === value)
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          appearance: 'none',
          padding: '8px 36px 8px 16px',
          fontSize: 13.5, fontWeight: 500,
          color: '#3F3F46',
          border: '1px solid #E4E4E7', borderRadius: 8,
          background: '#FFFFFF',
          cursor: 'pointer',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute', right: 12, top: '50%',
          transform: 'translateY(-50%)', color: '#71717A', pointerEvents: 'none',
        }}
      />
      {/* Hide the native arrow in webkit */}
      <style jsx>{`
        select::-ms-expand { display: none; }
      `}</style>
      {/* Preserve label rendering for a11y/SSR */}
      <span style={{ display: 'none' }}>{current?.label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// KPI Stack
// ═══════════════════════════════════════════════════════════════
function KPIStack({ data }: { data: DashboardData }) {
  const animated = useCountUp(data.worderRevenue)

  return (
    <div style={{
      width: 340, flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Card destaque (único gradiente laranja) */}
      <div
        style={{
          padding: '24px 26px',
          background: 'linear-gradient(135deg, #F97316 0%, #EA580C 60%, #C2410C 100%)',
          borderRadius: 14,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 100, height: 100, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Receita via Worder</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            background: 'rgba(255,255,255,0.18)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            +{data.worderDelta}%
          </span>
        </div>
        <div style={{
          fontSize: 34, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.04em',
          marginTop: 10, position: 'relative',
        }}>
          {fmtBRL(animated)}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 14, position: 'relative',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
            {data.worderShare.toFixed(1)}% do faturamento
          </span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {fmtInt(data.worderOrders)} pedidos
          </span>
        </div>
      </div>

      {/* Campanhas + Automações (row) */}
      <div style={{ display: 'flex', gap: 14 }}>
        <SmallKPI label="Campanhas" value={fmtBRL(data.campaignsRevenue)} sub={`${fmtInt(data.campaignsOrders)} pedidos`} />
        <SmallKPI label="Automações" value={fmtBRL(data.automationsRevenue)} sub={`${fmtInt(data.automationsOrders)} pedidos`} />
      </div>

      {/* Receita total da loja */}
      <div style={{
        padding: '18px 20px',
        border: '1px solid #E4E4E7',
        borderRadius: 12,
        background: '#FFFFFF',
      }}>
        <div style={{ fontSize: 12, color: '#71717A', fontWeight: 600, marginBottom: 8 }}>
          Receita total da loja
        </div>
        <div style={{
          fontSize: 24, fontWeight: 700, color: '#18181B',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
        }}>
          {fmtBRL(data.storeRevenue)}
        </div>
        <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 6 }}>
          {fmtInt(data.storeOrders)} pedidos
        </div>
      </div>
    </div>
  )
}

function SmallKPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      flex: 1, padding: '18px 20px',
      border: '1px solid #E4E4E7', borderRadius: 12, background: '#FFFFFF',
    }}>
      <div style={{ fontSize: 12, color: '#71717A', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 19, fontWeight: 700, color: '#18181B',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Chart card (stacked bar, pure SVG — no recharts for exact fidelity)
// ═══════════════════════════════════════════════════════════════
function ChartCard({ data, tab, setTab }: { data: DashboardData; tab: ChartTab; setTab: (t: ChartTab) => void }) {
  return (
    <div style={{
      flex: 1,
      padding: '24px 28px',
      border: '1px solid #E4E4E7', borderRadius: 14,
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      {/* Tabs + Legenda */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '2px solid #E4E4E7', marginBottom: 24,
      }}>
        <div style={{ display: 'flex' }}>
          <ChartTabButton active={tab === 'revenue'} onClick={() => setTab('revenue')}>Receita</ChartTabButton>
          <ChartTabButton active={tab === 'orders'}  onClick={() => setTab('orders')}>Pedidos</ChartTabButton>
        </div>
        <div style={{ display: 'flex', gap: 16, paddingBottom: 8 }}>
          <Legend color="#18181B" label="Campanhas" />
          <Legend color="#71717A" label="Automações" />
          <Legend color="#E4E4E7" border="#D4D4D8" label="Fora da Worder" muted />
        </div>
      </div>

      <StackedBarChart series={data.series} />
    </div>
  )
}

function ChartTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 14,
        fontWeight: active ? 700 : 400,
        color: active ? '#18181B' : '#A1A1AA',
        padding: '8px 24px',
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #18181B' : '2px solid transparent',
        marginBottom: -2,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function Legend({ color, border, label, muted }: { color: string; border?: string; label: string; muted?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, color: muted ? '#A1A1AA' : '#52525B',
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: 2,
        background: color,
        border: border ? `1px solid ${border}` : undefined,
        display: 'inline-block',
      }} />
      {label}
    </span>
  )
}

function StackedBarChart({ series }: { series: DashboardData['series'] }) {
  const W = 640, H = 280 // viewBox
  const padL = 40, padR = 8, padT = 8, padB = 32
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const totals = series.map((d) => d.campanhas + d.automacoes + d.fora)
  const max = Math.max(...totals, 1)
  // Y ticks: pick 5 "nice" values from 0..max rounded to thousands
  const step = Math.ceil(max / 5 / 1000) * 1000
  const ticks = [0, step, step * 2, step * 3, step * 4].filter((t) => t <= max * 1.05)
  const topTick = ticks[ticks.length - 1] + step
  const yScale = (v: number) => padT + plotH - (v / topTick) * plotH
  const barW = 48
  const slotW = plotW / series.length

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={280} style={{ display: 'block', overflow: 'visible' }}>
        {/* Grid + Y labels */}
        {[...ticks, topTick].map((t) => (
          <g key={t}>
            <line
              x1={padL} x2={W - padR} y1={yScale(t)} y2={yScale(t)}
              stroke="#F4F4F5" strokeWidth={0.5}
            />
            <text
              x={padL - 8} y={yScale(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="#A1A1AA"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtK(t)}
            </text>
          </g>
        ))}
        {/* Baseline */}
        <line x1={padL} x2={W - padR} y1={yScale(0)} y2={yScale(0)} stroke="#E4E4E7" strokeWidth={1} />

        {/* Bars (stacked) */}
        {series.map((d, i) => {
          const cx = padL + slotW * i + slotW / 2
          const x = cx - barW / 2
          const y0 = yScale(0)
          const hCamp = (d.campanhas / topTick) * plotH
          const hAuto = (d.automacoes / topTick) * plotH
          const hFora = (d.fora / topTick) * plotH
          const yCamp = y0 - hCamp
          const yAuto = yCamp - hAuto
          const yFora = yAuto - hFora
          return (
            <g key={d.label} style={{ opacity: 0.8 }}>
              {/* Campanhas — base */}
              <rect x={x} y={yCamp} width={barW} height={hCamp} fill="#18181B" />
              {/* Automações — middle */}
              <rect x={x} y={yAuto} width={barW} height={hAuto} fill="#71717A" />
              {/* Fora — top (rounded top) */}
              <path
                d={roundedTopRect(x, yFora, barW, hFora, 3)}
                fill="#E4E4E7"
              />
              {/* X label */}
              <text
                x={cx} y={H - 10}
                textAnchor="middle" fontSize={11.5} fill="#A1A1AA"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Build an SVG path: rectangle with rounded top corners only
function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2)
  return `
    M ${x},${y + h}
    L ${x},${y + radius}
    Q ${x},${y} ${x + radius},${y}
    L ${x + w - radius},${y}
    Q ${x + w},${y} ${x + w},${y + radius}
    L ${x + w},${y + h}
    Z
  `.replace(/\s+/g, ' ').trim()
}

// ═══════════════════════════════════════════════════════════════
// Channels card
// ═══════════════════════════════════════════════════════════════
function ChannelsCard({ channels }: { channels: DashboardData['channels'] }) {
  const total = channels.email + channels.whatsapp + channels.sms || 1
  const emailPct    = (channels.email    / total) * 100
  const whatsappPct = (channels.whatsapp / total) * 100
  const smsPct      = (channels.sms      / total) * 100

  return (
    <div style={{
      padding: '24px 28px',
      border: '1px solid #E4E4E7', borderRadius: 14, background: '#FFFFFF',
    }}>
      <h3 style={{
        fontSize: 16, fontWeight: 700, color: '#18181B',
        marginBottom: 22, marginTop: 0,
      }}>
        Receita por canal
      </h3>

      {/* Stacked progress bar */}
      <div style={{
        height: 5, borderRadius: 5,
        background: '#F4F4F5',
        display: 'flex', overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{ width: `${emailPct}%`, background: '#18181B' }} />
        <div style={{ width: `${whatsappPct}%`, background: '#71717A' }} />
        <div style={{ width: `${smsPct}%`, background: '#D4D4D8' }} />
      </div>

      {/* 3 columns */}
      <div style={{ display: 'flex', gap: 0 }}>
        <ChannelCol color="#18181B" label="Email"    value={channels.email}    pct={emailPct} />
        <ChannelCol color="#71717A" label="WhatsApp" value={channels.whatsapp} pct={whatsappPct} />
        <ChannelCol color="#D4D4D8" label="SMS"      value={channels.sms}      pct={smsPct} />
      </div>
    </div>
  )
}

function ChannelCol({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: color, display: 'inline-block',
        }} />
        <span style={{ fontSize: 13, color: '#71717A', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: '#18181B',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
        marginTop: 8,
      }}>
        {fmtBRL(value)}
      </div>
      <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 4 }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Rankings
// ═══════════════════════════════════════════════════════════════
function RankingsCard({ title, seeAllHref, children }: { title: string; seeAllHref: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      padding: '24px 28px',
      border: '1px solid #E4E4E7', borderRadius: 14, background: '#FFFFFF',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#18181B', margin: 0 }}>{title}</h3>
        <a
          href={seeAllHref}
          style={{ fontSize: 13, color: '#52525B', fontWeight: 600, textDecoration: 'none' }}
        >
          Ver todas
        </a>
      </div>
      <div>{children}</div>
    </div>
  )
}

function RankingItem({
  name, badge, details, value,
}: { name: string; badge: string; details: string; value: string }) {
  return (
    <div style={{ borderTop: '1px solid #F4F4F5', padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#18181B', lineHeight: 1.4 }}>{name}</div>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: '#52525B',
          background: '#F4F4F5',
          padding: '2px 10px', borderRadius: 99,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {badge}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: '#A1A1AA', marginTop: 5 }}>{details}</div>
      <div style={{
        fontSize: 16, fontWeight: 700, color: '#18181B',
        fontVariantNumeric: 'tabular-nums', marginTop: 5,
      }}>
        {value}
      </div>
    </div>
  )
}

function RecentCampaigns({ items }: { items: DashboardData['recentCampaigns'] }) {
  return (
    <RankingsCard title="Campanhas recentes" seeAllHref="/campaigns">
      {items.map((c) => (
        <RankingItem
          key={c.id}
          name={c.name}
          badge={c.status}
          details={`${fmtInt(c.sends)} envios · Abertura ${c.openRate.toFixed(1)}% · Clique ${c.clickRate.toFixed(1)}%`}
          value={fmtBRL(c.revenue)}
        />
      ))}
    </RankingsCard>
  )
}

function TopAutomations({ items }: { items: DashboardData['topAutomations'] }) {
  return (
    <RankingsCard title="Top automações" seeAllHref="/automations">
      {items.map((a) => (
        <RankingItem
          key={a.id}
          name={a.name}
          badge={a.status}
          details={`${fmtInt(a.sends)} envios · Conversão ${a.conversionRate.toFixed(1)}%`}
          value={fmtBRL(a.revenue)}
        />
      ))}
    </RankingsCard>
  )
}
