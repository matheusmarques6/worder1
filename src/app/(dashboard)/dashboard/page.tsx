'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { RefreshCw, ChevronDown } from 'lucide-react'

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
  channels: { email: number; whatsapp: number; sms: number }
  recentCampaigns: RecentCampaign[]
  topAutomations: TopAutomation[]
  hasShopify: boolean
}

const EMPTY_OVERVIEW: Overview = {
  worderRevenue: 0, worderOrders: 0, worderShare: 0, worderDelta: 0,
  campaignsRevenue: 0, campaignsOrders: 0,
  automationsRevenue: 0, automationsOrders: 0,
  storeRevenue: 0, storeOrders: 0,
  series: [],
  channels: { email: 0, whatsapp: 0, sms: 0 },
  recentCampaigns: [], topAutomations: [],
  hasShopify: false,
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

function formatBRL(v: number): string {
  const rounded = Math.round(v)
  if (rounded === 0) return 'R$ 0'
  return 'R$ ' + rounded.toLocaleString('pt-BR')
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
  const firstName = (user?.name?.split(' ')[0]) || user?.email?.split('@')[0] || 'por aí'

  const [range, setRange] = useState<RangeKey>('30d')
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const [tab, setTab] = useState<ChartTab>('revenue')
  const [data, setData] = useState<Overview>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date>(new Date())
  const [, setNow] = useState<Date>(new Date())

  // "Atualizado há N min" tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/overview?range=${range}&granularity=${granularity}`, { cache: 'no-store' })
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

  useEffect(() => { fetchData() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range, granularity])

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

        {/* ── Section header ── */}
        <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
          <div>
            <h2 className="text-[20px] font-bold text-[#18181B] leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Desempenho de vendas
            </h2>
            <button className="text-[13px] text-[#71717A] hover:text-[#3F3F46] mt-1 transition-colors">
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
                    className="text-[12px] font-bold px-[10px] py-[3px] rounded-full"
                    style={{ background: 'rgba(255,255,255,0.18)' }}
                  >
                    {data.worderDelta > 0 ? '+' : ''}{data.worderDelta}%
                  </span>
                )}
              </div>
              <div
                className="text-[34px] font-bold mt-2"
                style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatBRL(heroAnim)}
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
              <MiniKPI label="Campanhas" value={data.campaignsRevenue} sub={`${data.campaignsOrders.toLocaleString('pt-BR')} pedidos`} />
              <MiniKPI label="Automações" value={data.automationsRevenue} sub={`${data.automationsOrders.toLocaleString('pt-BR')} pedidos`} />
            </div>

            {/* Receita total da loja */}
            <div className="rounded-[12px] bg-white px-5 py-[18px]" style={{ border: '1px solid #E4E4E7' }}>
              <div className="text-[12px] font-semibold text-[#71717A] mb-2">Receita total da loja</div>
              <div
                className="text-[24px] font-bold text-[#18181B]"
                style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatBRL(data.storeRevenue)}
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
                <LegendDot color="#18181B" label="Campanhas" />
                <LegendDot color="#71717A" label="Automações" />
                <LegendDot color="#E4E4E7" label="Fora da Worder" border="#D4D4D8" />
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
                      contentStyle={{
                        background: 'white',
                        border: '1px solid #E4E4E7',
                        borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                        fontSize: 12.5,
                        padding: '10px 12px',
                      }}
                      labelStyle={{ color: '#71717A', fontWeight: 600, marginBottom: 6 }}
                      formatter={(value: number, nameKey: string) => {
                        const names: Record<string, string> = {
                          campanhas: 'Campanhas',
                          automacoes: 'Automações',
                          fora: 'Fora da Worder',
                        }
                        return [tab === 'revenue' ? formatBRL(value) : value.toLocaleString('pt-BR'), names[nameKey] || nameKey]
                      }}
                    />
                    <Bar dataKey="campanhas" stackId="a" fill="#18181B" barSize={34} />
                    <Bar dataKey="automacoes" stackId="a" fill="#71717A" barSize={34} />
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
            <div style={{ width: `${channelPct.email}%`, background: '#18181B' }} />
            <div style={{ width: `${channelPct.whatsapp}%`, background: '#71717A' }} />
            <div style={{ width: `${channelPct.sms}%`, background: '#D4D4D8' }} />
          </div>
          <div className="grid grid-cols-3 gap-5 mt-6">
            <ChannelItem label="Email" value={data.channels.email} pct={channelPct.email} color="#18181B" />
            <ChannelItem label="WhatsApp" value={data.channels.whatsapp} pct={channelPct.whatsapp} color="#71717A" />
            <ChannelItem label="SMS" value={data.channels.sms} pct={channelPct.sms} color="#D4D4D8" />
          </div>
        </section>

        {/* ── Rankings ── */}
        <section className="flex gap-5 flex-wrap lg:flex-nowrap">
          <RankingCard
            title="Campanhas recentes"
            seeAllHref="/campaigns"
            items={data.recentCampaigns}
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
            renderDetails={(a: TopAutomation) =>
              `${a.sends.toLocaleString('pt-BR')} envios · Conversão ${formatPct(a.conversionRate)}`
            }
            emptyLabel="Ainda sem automações ativas."
            emptyHref="/automations"
            emptyAction="Criar automação"
          />
        </section>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function MiniKPI({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex-1 rounded-[12px] bg-white px-5 py-[18px]" style={{ border: '1px solid #E4E4E7' }}>
      <div className="text-[12px] font-semibold text-[#71717A] mb-2">{label}</div>
      <div className="text-[19px] font-bold text-[#18181B]" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(value)}
      </div>
      <div className="text-[12px] text-[#A1A1AA] mt-[6px]">{sub}</div>
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
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#71717A]">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="text-[22px] font-bold text-[#18181B] mt-2" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(value)}
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
        className="appearance-none bg-white text-[13.5px] font-medium text-[#18181B] px-4 py-2 pr-8 rounded-[8px] cursor-pointer"
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
        className="appearance-none bg-white text-[13.5px] font-medium text-[#18181B] px-4 py-2 pr-8 rounded-[8px] cursor-pointer"
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
  renderDetails,
  emptyLabel,
  emptyHref,
  emptyAction,
}: {
  title: string
  seeAllHref: string
  items: T[]
  renderDetails: (item: T) => string
  emptyLabel: string
  emptyHref: string
  emptyAction: string
}) {
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
        items.map((item) => (
          <div key={item.id} className="py-4" style={{ borderTop: '1px solid #F4F4F5' }}>
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
              {formatBRL(item.revenue)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
