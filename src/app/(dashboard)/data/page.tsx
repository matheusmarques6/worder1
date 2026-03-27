'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Database,
  Code,
  Crosshair,
  UsersThree,
  TrendUp,
  ArrowsClockwise,
  Eye,
  CursorClick,
  ShoppingCart,
  Star,
  Lightning,
  Copy,
  CheckCircle,
  Globe,
  Cookie,
  ToggleRight,
  ToggleLeft,
  ChartLineUp,
  UserCirclePlus,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const cdpKpis = [
  { title: 'Perfis Unificados', value: '24.500', change: '+820 esta semana', positive: true, icon: UsersThree },
  { title: 'Eventos Rastreados/Dia', value: '145.200', change: '+12%', positive: true, icon: Crosshair },
  { title: 'Score Médio', value: '64.2', change: '+3.8', positive: true, icon: Star },
  { title: 'CLV Médio Predito', value: 'R$ 342', change: '+8%', positive: true, icon: ChartLineUp },
]

const trackingEvents = [
  { event: 'page_view', count: 82400, label: 'Visualização de Página' },
  { event: 'product_view', count: 34200, label: 'Visualização de Produto' },
  { event: 'add_to_cart', count: 8900, label: 'Adicionar ao Carrinho' },
  { event: 'checkout_started', count: 4200, label: 'Início de Checkout' },
  { event: 'purchase', count: 1542, label: 'Compra Realizada' },
  { event: 'search', count: 12800, label: 'Busca no Site' },
]

const eventTrend = [
  { date: '01 Mar', events: 128000 },
  { date: '03 Mar', events: 135000 },
  { date: '05 Mar', events: 122000 },
  { date: '07 Mar', events: 148000 },
  { date: '09 Mar', events: 140000 },
  { date: '11 Mar', events: 156000 },
  { date: '13 Mar', events: 145200 },
]

const scoringRules = [
  { action: 'Abriu e-mail', points: 5, icon: Eye },
  { action: 'Clicou em link', points: 10, icon: CursorClick },
  { action: 'Visitou produto', points: 15, icon: ShoppingCart },
  { action: 'Adicionou ao carrinho', points: 25, icon: ShoppingCart },
  { action: 'Realizou compra', points: 50, icon: Star },
  { action: 'Inatividade 30d', points: -20, icon: ArrowsClockwise },
]

const scoringDistribution = [
  { range: '0-20', label: 'Frio', count: 4200, color: '#3B82F6' },
  { range: '21-40', label: 'Morno', count: 6800, color: '#F59E0B' },
  { range: '41-60', label: 'Quente', count: 7200, color: '#F26B2A' },
  { range: '61-80', label: 'Muito Quente', count: 4100, color: '#EF4444' },
  { range: '81-100', label: 'On Fire', count: 2200, color: '#10B981' },
]

const pixelCode = `<!-- Worder Tracking Pixel -->
<script>
  (function(w,o,r,d,e,r2){
    w['WorderObject']=e;w[e]=w[e]||function(){
    (w[e].q=w[e].q||[]).push(arguments)};
    w[e].l=1*new Date();r2=o.createElement(r);
    var s=o.getElementsByTagName(r)[0];
    r2.async=1;r2.src=d;
    s.parentNode.insertBefore(r2,s);
  })(window,document,'script',
  'https://cdn.worder.com.br/pixel.js','wdr');
  wdr('init', 'WDR-XXXX-XXXX');
  wdr('track', 'PageView');
</script>`

export default function DataPage() {
  const [copied, setCopied] = useState(false)
  const [trackingEnabled, setTrackingEnabled] = useState({
    pageViews: true,
    productViews: true,
    addToCart: true,
    checkout: true,
    purchase: true,
    search: true,
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(pixelCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center">
          <Database size={22} className="text-white" weight="fill" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Worder Data</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Customer Data Platform — Rastreamento, scoring e perfis unificados</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cdpKpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-zinc-500" />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              <span className="text-xs text-emerald-400">{kpi.change}</span>
            </motion.div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tracking Pixel */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Code size={16} className="text-[#F26B2A]" />
            Pixel de Rastreamento
          </h3>
          <div className="relative">
            <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 overflow-x-auto">
              {pixelCode}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700 transition-colors"
            >
              {copied ? (
                <CheckCircle size={14} className="text-emerald-400" />
              ) : (
                <Copy size={14} className="text-zinc-400" />
              )}
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-xs text-emerald-400">Pixel instalado e ativo — recebendo dados</span>
          </div>
        </div>

        {/* Event Tracking Config */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Crosshair size={16} className="text-[#F26B2A]" />
            Eventos Rastreados
          </h3>
          <div className="space-y-3">
            {trackingEvents.map((ev) => (
              <div key={ev.event} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <span className="text-sm text-white">{ev.label}</span>
                  <span className="text-xs text-zinc-500 ml-2 font-mono">{ev.event}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{ev.count.toLocaleString('pt-BR')}/dia</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Events Trend */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Eventos Rastreados — Últimos 14 dias</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={eventTrend}>
            <defs>
              <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F26B2A" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F26B2A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
              formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']}
            />
            <Area type="monotone" dataKey="events" stroke="#F26B2A" fill="url(#gradEvents)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Scoring Rules */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Star size={16} className="text-[#F26B2A]" />
            Regras de Scoring
          </h3>
          <div className="space-y-2">
            {scoringRules.map((rule) => {
              const Icon = rule.icon
              return (
                <div key={rule.action} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-zinc-500" />
                    <span className="text-sm text-white">{rule.action}</span>
                  </div>
                  <span className={`text-sm font-medium ${rule.points > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {rule.points > 0 ? '+' : ''}{rule.points} pts
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scoring Distribution */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Lightning size={16} className="text-[#F26B2A]" />
            Distribuição de Scores
          </h3>
          <div className="space-y-3">
            {scoringDistribution.map((seg) => {
              const total = scoringDistribution.reduce((a, b) => a + b.count, 0)
              const pct = ((seg.count / total) * 100).toFixed(1)
              return (
                <div key={seg.range}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
                      <span className="text-sm text-white">{seg.label}</span>
                      <span className="text-xs text-zinc-500">({seg.range})</span>
                    </div>
                    <span className="text-xs text-zinc-400">{seg.count.toLocaleString('pt-BR')} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.3, duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
