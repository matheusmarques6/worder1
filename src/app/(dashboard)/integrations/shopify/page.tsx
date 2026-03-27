'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ShoppingBag,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
  Package,
  UsersThree,
  ShoppingCart,
  CurrencyDollar,
  TrendUp,
  Clock,
  Lightning,
  Warning,
  Plugs,
  Globe,
  ChartLineUp,
  CaretRight,
  GearSix,
  Export,
  Eye,
  Tag,
  ArrowSquareOut,
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
import Link from 'next/link'

const connectionStatus = {
  connected: true,
  store: 'minhaloja.myshopify.com',
  plan: 'Shopify Plus',
  connectedAt: '2025-06-15T10:00:00Z',
  lastSync: '2026-03-12T08:30:00Z',
  syncInterval: '6 horas',
  apiVersion: '2024-10',
}

const syncKpis = [
  { title: 'Produtos Sincronizados', value: '156', icon: Package, color: '#F26B2A', status: 'ok' },
  { title: 'Clientes Importados', value: '12.450', icon: UsersThree, color: '#3B82F6', status: 'ok' },
  { title: 'Pedidos Rastreados', value: '8.920', icon: ShoppingCart, color: '#22C55E', status: 'ok' },
  { title: 'Receita Rastreada (30d)', value: 'R$ 284K', icon: CurrencyDollar, color: '#F5A623', change: '+18%' },
]

const syncHistory = [
  { date: '12/03/2026 08:30', type: 'Automática', items: 'Pedidos, Clientes', status: 'success', duration: '12s', records: 45 },
  { date: '12/03/2026 02:30', type: 'Automática', items: 'Produtos, Pedidos, Clientes', status: 'success', duration: '28s', records: 128 },
  { date: '11/03/2026 20:30', type: 'Automática', items: 'Pedidos, Clientes', status: 'success', duration: '9s', records: 32 },
  { date: '11/03/2026 14:30', type: 'Automática', items: 'Pedidos', status: 'success', duration: '5s', records: 18 },
  { date: '11/03/2026 08:30', type: 'Automática', items: 'Produtos, Pedidos, Clientes', status: 'success', duration: '31s', records: 142 },
  { date: '10/03/2026 20:30', type: 'Manual', items: 'Todos', status: 'warning', duration: '45s', records: 210 },
  { date: '10/03/2026 14:30', type: 'Automática', items: 'Pedidos', status: 'success', duration: '6s', records: 22 },
]

const revenueData = [
  { date: '01 Mar', revenue: 18400, orders: 62 },
  { date: '03 Mar', revenue: 22100, orders: 74 },
  { date: '05 Mar', revenue: 16800, orders: 56 },
  { date: '07 Mar', revenue: 28400, orders: 95 },
  { date: '09 Mar', revenue: 21200, orders: 71 },
  { date: '11 Mar', revenue: 25600, orders: 86 },
  { date: '13 Mar', revenue: 29800, orders: 100 },
]

const automations = [
  { name: 'Carrinho Abandonado', status: 'active', recoveries: 342, revenue: 48200 },
  { name: 'Pós-Compra - Obrigado', status: 'active', sent: 1840, openRate: 68 },
  { name: 'PIX Pendente', status: 'active', recoveries: 128, revenue: 22400 },
  { name: 'Boleto não pago', status: 'active', recoveries: 86, revenue: 14800 },
  { name: 'Review de Produto', status: 'paused', sent: 0, openRate: 0 },
]

const webhookEvents = [
  { event: 'orders/create', status: 'active', lastReceived: '12 min atrás' },
  { event: 'orders/updated', status: 'active', lastReceived: '28 min atrás' },
  { event: 'orders/cancelled', status: 'active', lastReceived: '2 dias atrás' },
  { event: 'checkouts/create', status: 'active', lastReceived: '5 min atrás' },
  { event: 'customers/create', status: 'active', lastReceived: '1h atrás' },
  { event: 'customers/update', status: 'active', lastReceived: '45 min atrás' },
  { event: 'products/update', status: 'active', lastReceived: '6h atrás' },
  { event: 'refunds/create', status: 'active', lastReceived: '3 dias atrás' },
]

const statusSyncConfig: Record<string, { label: string; color: string }> = {
  success: { label: 'Sucesso', color: 'text-emerald-400' },
  warning: { label: 'Parcial', color: 'text-yellow-400' },
  error: { label: 'Erro', color: 'text-red-400' },
}

export default function ShopifyIntegrationPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'webhooks' | 'settings'>('overview')

  const tabs = [
    { id: 'overview' as const, label: 'Visão Geral' },
    { id: 'sync' as const, label: 'Sincronização' },
    { id: 'webhooks' as const, label: 'Webhooks' },
    { id: 'settings' as const, label: 'Configurações' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/integrations')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="w-12 h-12 rounded-xl bg-[#95BF47]/10 flex items-center justify-center">
            <ShoppingBag size={24} className="text-[#95BF47]" weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-display text-white">Shopify</h1>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Conectado</span>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5">{connectionStatus.store}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <ArrowsClockwise size={14} />
            Sincronizar Agora
          </button>
          <a
            href={`https://${connectionStatus.store}/admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs"
          >
            <ArrowSquareOut size={14} />
            Abrir Shopify
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-zinc-900/50 border border-zinc-800 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {syncKpis.map((kpi, i) => {
              const Icon = kpi.icon
              return (
                <motion.div
                  key={kpi.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-zinc-500 font-medium">{kpi.title}</p>
                      <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                      {kpi.change && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <TrendUp size={12} className="text-emerald-400" weight="bold" />
                          <span className="text-xs text-emerald-400">{kpi.change}</span>
                        </div>
                      )}
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                      <Icon size={20} style={{ color: kpi.color }} weight="duotone" />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Revenue Chart */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-1">Receita Shopify (últimos 14 dias)</h3>
            <p className="text-xs text-zinc-500 mb-4">Receita e pedidos rastreados via integração</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#95BF47" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#95BF47" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? `R$ ${value.toLocaleString('pt-BR')}` : value,
                    name === 'revenue' ? 'Receita' : 'Pedidos',
                  ]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#95BF47" fill="url(#gradRevenue)" strokeWidth={2} name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Automations using Shopify */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Automações Conectadas</h3>
              <Link href="/automations" className="text-xs text-[#F26B2A] hover:text-[#F5A623]">Ver todas</Link>
            </div>
            <div className="space-y-3">
              {automations.map((auto) => (
                <div key={auto.name} className="flex items-center justify-between py-3 border-b border-zinc-800/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <Lightning size={16} className={auto.status === 'active' ? 'text-[#F26B2A]' : 'text-zinc-600'} weight="fill" />
                    <div>
                      <p className="text-sm text-white font-medium">{auto.name}</p>
                      <p className="text-xs text-zinc-500">
                        {auto.status === 'active' ? 'Ativo' : 'Pausado'}
                        {auto.recoveries !== undefined && ` · ${auto.recoveries} recuperações`}
                        {auto.sent !== undefined && auto.sent > 0 && ` · ${auto.sent} enviados`}
                      </p>
                    </div>
                  </div>
                  {auto.revenue !== undefined && auto.revenue > 0 && (
                    <span className="text-sm text-emerald-400 font-medium">R$ {(auto.revenue / 1000).toFixed(1)}K</span>
                  )}
                  {auto.openRate !== undefined && auto.openRate > 0 && (
                    <span className="text-sm text-blue-400 font-medium">{auto.openRate}% abertura</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Sync Tab */}
      {activeTab === 'sync' && (
        <>
          {/* Sync Status */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Status da Sincronização</h3>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-[#95BF47]/10 text-[#95BF47] rounded-lg hover:bg-[#95BF47]/20 text-xs font-medium">
                <ArrowsClockwise size={14} />
                Sincronizar Tudo
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {['Produtos', 'Clientes', 'Pedidos'].map((item) => (
                <div key={item} className="bg-zinc-800/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white font-medium">{item}</span>
                    <CheckCircle size={16} className="text-emerald-400" weight="fill" />
                  </div>
                  <p className="text-xs text-zinc-500">Última sync: {new Date(connectionStatus.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Intervalo: {connectionStatus.syncInterval}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sync History */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Histórico de Sincronização</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Data/Hora</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Tipo</th>
                  <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Itens</th>
                  <th className="text-right text-xs text-zinc-500 font-medium px-6 py-3">Registros</th>
                  <th className="text-right text-xs text-zinc-500 font-medium px-6 py-3">Duração</th>
                  <th className="text-right text-xs text-zinc-500 font-medium px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map((sync, i) => {
                  const st = statusSyncConfig[sync.status]
                  return (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                      <td className="px-6 py-3 text-sm text-zinc-300">{sync.date}</td>
                      <td className="px-6 py-3 text-xs text-zinc-400">{sync.type}</td>
                      <td className="px-6 py-3 text-xs text-zinc-400">{sync.items}</td>
                      <td className="px-6 py-3 text-sm text-white text-right">{sync.records}</td>
                      <td className="px-6 py-3 text-xs text-zinc-500 text-right">{sync.duration}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Webhooks Ativos</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Eventos do Shopify recebidos em tempo real</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Evento</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-6 py-3">Status</th>
                <th className="text-right text-xs text-zinc-500 font-medium px-6 py-3">Último Recebido</th>
              </tr>
            </thead>
            <tbody>
              {webhookEvents.map((wh) => (
                <tr key={wh.event} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="px-6 py-3">
                    <code className="text-sm text-zinc-300 font-mono">{wh.event}</code>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-emerald-400">Ativo</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-zinc-500 text-right">{wh.lastReceived}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white">Detalhes da Conexão</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500">Loja</p>
                <p className="text-sm text-white mt-0.5 font-mono">{connectionStatus.store}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Plano</p>
                <p className="text-sm text-white mt-0.5">{connectionStatus.plan}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Conectado desde</p>
                <p className="text-sm text-white mt-0.5">{new Date(connectionStatus.connectedAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">API Version</p>
                <p className="text-sm text-white mt-0.5 font-mono">{connectionStatus.apiVersion}</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white">Sincronização</h3>
            {[
              { label: 'Sincronizar Produtos', desc: 'Importar catálogo automaticamente', enabled: true },
              { label: 'Sincronizar Clientes', desc: 'Manter contatos atualizados', enabled: true },
              { label: 'Sincronizar Pedidos', desc: 'Rastrear pedidos e receita', enabled: true },
              { label: 'Sincronizar Carrinhos', desc: 'Detectar carrinhos abandonados', enabled: true },
              { label: 'Sincronizar Estoque', desc: 'Alertas de estoque baixo', enabled: false },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-white font-medium">{item.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                </div>
                <button className={`w-11 h-6 rounded-full transition-colors ${item.enabled ? 'bg-[#95BF47]' : 'bg-zinc-700'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${item.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Danger Zone */}
          <div className="bg-zinc-900/50 border border-red-500/20 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-red-400 mb-2">Zona de Perigo</h3>
            <p className="text-xs text-zinc-500 mb-4">Desconectar a integração irá parar todas as sincronizações e automações que dependem do Shopify.</p>
            <button className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 text-xs font-medium border border-red-500/20">
              Desconectar Shopify
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
