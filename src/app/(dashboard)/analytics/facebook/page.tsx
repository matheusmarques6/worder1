'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign,
  Eye,
  MousePointer,
  Users,
  Target,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Play,
  Pause,
  BarChart3,
  PieChart,
  Smartphone,
  Monitor,
  Tablet,
} from 'lucide-react'

// Facebook Icon
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

// KPI Data
const kpiData = [
  { title: 'Gasto Total', value: 'R$ 12.450', change: '+8.2%', trend: 'up', icon: DollarSign, color: 'from-blue-500 to-blue-600' },
  { title: 'Impressões', value: '458.2K', change: '+15.3%', trend: 'up', icon: Eye, color: 'from-cyan-500 to-blue-500' },
  { title: 'Alcance', value: '234.5K', change: '+12.1%', trend: 'up', icon: Users, color: 'from-purple-500 to-violet-500' },
  { title: 'Cliques', value: '8.945', change: '+5.8%', trend: 'up', icon: MousePointer, color: 'from-green-500 to-emerald-500' },
  { title: 'CTR', value: '1.95%', change: '-0.12%', trend: 'down', icon: Target, color: 'from-yellow-500 to-orange-500' },
  { title: 'CPC', value: 'R$ 1.39', change: '-8.5%', trend: 'up', icon: DollarSign, color: 'from-emerald-500 to-green-600' },
  { title: 'CPM', value: 'R$ 27.18', change: '-5.2%', trend: 'up', icon: BarChart3, color: 'from-pink-500 to-rose-500' },
  { title: 'Conversões', value: '456', change: '+22.4%', trend: 'up', icon: Target, color: 'from-violet-500 to-purple-600' },
  { title: 'CPA', value: 'R$ 27.30', change: '-12.3%', trend: 'up', icon: DollarSign, color: 'from-orange-500 to-amber-500' },
  { title: 'ROAS', value: '3.8x', change: '+0.6x', trend: 'up', icon: TrendingUp, color: 'from-primary-500 to-accent-500' },
  { title: 'Valor Conversão', value: 'R$ 47.310', change: '+18.5%', trend: 'up', icon: DollarSign, color: 'from-green-500 to-emerald-600' },
  { title: 'Frequência', value: '1.95', change: '+0.15', trend: 'down', icon: RefreshCw, color: 'from-slate-500 to-gray-600' },
]

// Funnel data
const funnelData = [
  { stage: 'Impressões', value: 458200, percent: 100 },
  { stage: 'Cliques', value: 8945, percent: 1.95 },
  { stage: 'Add to Cart', value: 1234, percent: 0.27 },
  { stage: 'Initiate Checkout', value: 678, percent: 0.15 },
  { stage: 'Purchase', value: 456, percent: 0.1 },
]

// Campaigns data
const campaigns = [
  { id: 1, name: 'Black Friday - Conversões', status: 'active', objective: 'Conversões', budget: 'R$ 500/dia', spend: 'R$ 3.450', impressions: '125K', clicks: '2.8K', ctr: '2.24%', cpc: 'R$ 1.23', conversions: 156, roas: '4.2x', revenue: 'R$ 14.490' },
  { id: 2, name: 'Remarketing - Carrinho', status: 'active', objective: 'Conversões', budget: 'R$ 200/dia', spend: 'R$ 1.890', impressions: '45K', clicks: '890', ctr: '1.98%', cpc: 'R$ 2.12', conversions: 89, roas: '5.8x', revenue: 'R$ 10.962' },
  { id: 3, name: 'Prospecção - Lookalike', status: 'active', objective: 'Conversões', budget: 'R$ 300/dia', spend: 'R$ 2.340', impressions: '98K', clicks: '1.5K', ctr: '1.53%', cpc: 'R$ 1.56', conversions: 78, roas: '3.2x', revenue: 'R$ 7.488' },
  { id: 4, name: 'Awareness - Vídeo', status: 'paused', objective: 'Alcance', budget: 'R$ 150/dia', spend: 'R$ 890', impressions: '89K', clicks: '456', ctr: '0.51%', cpc: 'R$ 1.95', conversions: 12, roas: '1.5x', revenue: 'R$ 1.335' },
  { id: 5, name: 'Tráfego - Blog', status: 'active', objective: 'Tráfego', budget: 'R$ 100/dia', spend: 'R$ 780', impressions: '56K', clicks: '1.2K', ctr: '2.14%', cpc: 'R$ 0.65', conversions: 34, roas: '2.8x', revenue: 'R$ 2.184' },
]

// Age breakdown
const ageBreakdown = [
  { age: '18-24', spend: 'R$ 1.890', impressions: '78K', clicks: '1.2K', conversions: 45, cpa: 'R$ 42.00' },
  { age: '25-34', spend: 'R$ 4.560', impressions: '156K', clicks: '3.4K', conversions: 189, cpa: 'R$ 24.13' },
  { age: '35-44', spend: 'R$ 3.210', impressions: '98K', clicks: '2.1K', conversions: 134, cpa: 'R$ 23.96' },
  { age: '45-54', spend: 'R$ 1.890', impressions: '67K', clicks: '1.3K', conversions: 56, cpa: 'R$ 33.75' },
  { age: '55-64', spend: 'R$ 670', impressions: '34K', clicks: '560', conversions: 23, cpa: 'R$ 29.13' },
  { age: '65+', spend: 'R$ 230', impressions: '25K', clicks: '345', conversions: 9, cpa: 'R$ 25.56' },
]

// Device breakdown
const deviceBreakdown = [
  { device: 'Mobile', icon: Smartphone, spend: 'R$ 9.340', percent: 75, impressions: '356K', conversions: 345, cpa: 'R$ 27.07' },
  { device: 'Desktop', icon: Monitor, spend: 'R$ 2.450', percent: 20, impressions: '89K', conversions: 98, cpa: 'R$ 25.00' },
  { device: 'Tablet', icon: Tablet, spend: 'R$ 660', percent: 5, impressions: '13K', conversions: 13, cpa: 'R$ 50.77' },
]

// Placement breakdown
const placementBreakdown = [
  { placement: 'Feed', spend: 'R$ 6.780', percent: 54.5, conversions: 267, roas: '4.1x' },
  { placement: 'Stories', spend: 'R$ 2.890', percent: 23.2, conversions: 98, roas: '3.5x' },
  { placement: 'Reels', spend: 'R$ 1.560', percent: 12.5, conversions: 56, roas: '3.8x' },
  { placement: 'Audience Network', spend: 'R$ 890', percent: 7.2, conversions: 23, roas: '2.1x' },
  { placement: 'Messenger', spend: 'R$ 330', percent: 2.6, conversions: 12, roas: '2.8x' },
]

// Ad sets
const adSets = [
  { id: 1, name: 'Lookalike 1% - Compradores', campaign: 'Prospecção - Lookalike', targeting: 'LAL 1% Purchase', spend: 'R$ 1.230', impressions: '52K', ctr: '1.67%', conversions: 45, cpa: 'R$ 27.33' },
  { id: 2, name: 'Interest - Fashion', campaign: 'Black Friday - Conversões', targeting: 'Fashion & Style', spend: 'R$ 890', impressions: '34K', ctr: '2.12%', conversions: 34, cpa: 'R$ 26.18' },
  { id: 3, name: 'Retargeting - 7 dias', campaign: 'Remarketing - Carrinho', targeting: 'Cart 7d', spend: 'R$ 1.120', impressions: '28K', ctr: '2.89%', conversions: 67, cpa: 'R$ 16.72' },
  { id: 4, name: 'Retargeting - 30 dias', campaign: 'Remarketing - Carrinho', targeting: 'Viewers 30d', spend: 'R$ 770', impressions: '17K', ctr: '1.45%', conversions: 22, cpa: 'R$ 35.00' },
]

export default function FacebookAdsPage() {
  const [dateRange, setDateRange] = useState('7d')
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'adsets' | 'breakdown'>('campaigns')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400"><Play className="w-3 h-3" />Ativa</span>
      case 'paused':
        return <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400"><Pause className="w-3 h-3" />Pausada</span>
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <FacebookIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Facebook Ads</h1>
            <p className="text-dark-400 mt-1">Performance de campanhas Meta</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-dark-800/50 rounded-xl p-1">
            {['Hoje', 'Ontem', '7 Dias', '30 Dias', 'Este Mês'].map((range, idx) => (
              <button
                key={range}
                onClick={() => setDateRange(['today', 'yesterday', '7d', '30d', 'month'][idx])}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  dateRange === ['today', 'yesterday', '7d', '30d', 'month'][idx]
                    ? 'bg-blue-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 hover:bg-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all">
            <Filter className="w-4 h-4" />
            Filtrar
          </button>

          <button className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 hover:bg-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all">
            <Download className="w-4 h-4" />
            Exportar
          </button>

          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-xl text-white transition-all">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {kpiData.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-4 hover:border-dark-600/50 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-dark-400">{kpi.title}</p>
              <div className={`p-1.5 rounded-lg bg-gradient-to-br ${kpi.color} opacity-80`}>
                <kpi.icon className="w-3 h-3 text-white" />
              </div>
            </div>
            <p className="text-xl font-bold text-white">{kpi.value}</p>
            <div className="flex items-center gap-1 mt-1">
              {kpi.trend === 'up' ? (
                <ArrowUpRight className="w-3 h-3 text-green-400" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-red-400" />
              )}
              <span className={`text-xs font-medium ${kpi.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                {kpi.change}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversion Funnel */}
        <div className="lg:col-span-2 bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Funil de Conversão</h3>
              <p className="text-sm text-dark-400">Da impressão até a compra</p>
            </div>
          </div>

          <div className="space-y-4">
            {funnelData.map((item, index) => (
              <div key={item.stage}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{item.stage}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-dark-400">{item.value.toLocaleString()}</span>
                    <span className="text-sm font-medium text-blue-400">{item.percent}%</span>
                  </div>
                </div>
                <div className="h-8 bg-dark-700/50 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(item.percent * 10, 100)}%` }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Por Dispositivo</h3>
              <p className="text-sm text-dark-400">Distribuição de gastos</p>
            </div>
          </div>

          <div className="space-y-4">
            {deviceBreakdown.map((device) => (
              <div key={device.device} className="p-3 bg-dark-700/30 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <device.icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{device.device}</p>
                    <p className="text-xs text-dark-400">{device.percent}% do gasto</p>
                  </div>
                  <p className="text-sm font-semibold text-white">{device.spend}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-dark-500">Impressões</p>
                    <p className="text-white font-medium">{device.impressions}</p>
                  </div>
                  <div>
                    <p className="text-dark-500">CPA</p>
                    <p className="text-white font-medium">{device.cpa}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Placement & Age Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Placement */}
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Por Posicionamento</h3>
              <p className="text-sm text-dark-400">Onde seus anúncios aparecem</p>
            </div>
          </div>

          <div className="space-y-3">
            {placementBreakdown.map((placement) => (
              <div key={placement.placement} className="flex items-center gap-4">
                <div className="w-24 text-sm text-white">{placement.placement}</div>
                <div className="flex-1">
                  <div className="h-6 bg-dark-700/50 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${placement.percent}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-end pr-2"
                    >
                      <span className="text-xs font-medium text-white">{placement.percent}%</span>
                    </motion.div>
                  </div>
                </div>
                <div className="w-20 text-right">
                  <p className="text-sm font-medium text-white">{placement.spend}</p>
                  <p className="text-xs text-green-400">{placement.roas} ROAS</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Age Breakdown */}
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Por Idade</h3>
              <p className="text-sm text-dark-400">Performance por faixa etária</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-400 border-b border-dark-700/50">
                  <th className="pb-3 text-left font-medium">Idade</th>
                  <th className="pb-3 text-right font-medium">Gasto</th>
                  <th className="pb-3 text-right font-medium">Conv.</th>
                  <th className="pb-3 text-right font-medium">CPA</th>
                </tr>
              </thead>
              <tbody>
                {ageBreakdown.map((row) => (
                  <tr key={row.age} className="border-b border-dark-700/30">
                    <td className="py-3 text-white font-medium">{row.age}</td>
                    <td className="py-3 text-right text-dark-300">{row.spend}</td>
                    <td className="py-3 text-right text-dark-300">{row.conversions}</td>
                    <td className="py-3 text-right">
                      <span className={`font-medium ${parseFloat(row.cpa.replace('R$ ', '')) < 28 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {row.cpa}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl">
        <div className="flex border-b border-dark-700/50">
          {[
            { id: 'campaigns', label: 'Campanhas', count: campaigns.length },
            { id: 'adsets', label: 'Conjuntos', count: adSets.length },
            { id: 'breakdown', label: 'Detalhamento' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all border-b-2 ${
                selectedTab === tab.id ? 'text-white border-blue-500' : 'text-dark-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count && <span className="px-2 py-0.5 text-xs rounded-full bg-dark-700">{tab.count}</span>}
            </button>
          ))}
        </div>

        <div className="p-6">
          {selectedTab === 'campaigns' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">Campanha</th>
                    <th className="pb-4 font-medium">Status</th>
                    <th className="pb-4 font-medium">Objetivo</th>
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Impressões</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium text-right">CPC</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                    <th className="pb-4 font-medium text-right">Receita</th>
                    <th className="pb-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{campaign.name}</p></td>
                      <td className="py-4">{getStatusBadge(campaign.status)}</td>
                      <td className="py-4"><span className="text-dark-300 text-sm">{campaign.objective}</span></td>
                      <td className="py-4 text-right text-dark-300">{campaign.spend}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.impressions}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.ctr}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.cpc}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.conversions}</td>
                      <td className="py-4 text-right"><span className="text-green-400 font-medium">{campaign.roas}</span></td>
                      <td className="py-4 text-right"><span className="text-white font-semibold">{campaign.revenue}</span></td>
                      <td className="py-4 text-right">
                        <button className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-dark-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTab === 'adsets' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">Conjunto de Anúncios</th>
                    <th className="pb-4 font-medium">Campanha</th>
                    <th className="pb-4 font-medium">Segmentação</th>
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Impressões</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-right">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {adSets.map((adset) => (
                    <tr key={adset.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{adset.name}</p></td>
                      <td className="py-4 text-dark-300 text-sm">{adset.campaign}</td>
                      <td className="py-4"><span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">{adset.targeting}</span></td>
                      <td className="py-4 text-right text-dark-300">{adset.spend}</td>
                      <td className="py-4 text-right text-dark-300">{adset.impressions}</td>
                      <td className="py-4 text-right text-dark-300">{adset.ctr}</td>
                      <td className="py-4 text-right text-dark-300">{adset.conversions}</td>
                      <td className="py-4 text-right"><span className="text-green-400 font-medium">{adset.cpa}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTab === 'breakdown' && (
            <div className="text-center py-12">
              <PieChart className="w-12 h-12 text-dark-500 mx-auto mb-4" />
              <p className="text-dark-400">Selecione uma dimensão para ver o detalhamento</p>
              <div className="flex justify-center gap-2 mt-4">
                {['Idade', 'Gênero', 'Dispositivo', 'Posicionamento', 'Região'].map((dim) => (
                  <button key={dim} className="px-4 py-2 bg-dark-700/50 hover:bg-dark-700 rounded-lg text-sm text-dark-300 hover:text-white transition-all">
                    {dim}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
