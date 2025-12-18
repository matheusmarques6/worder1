'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign,
  Eye,
  MousePointer,
  Target,
  TrendingUp,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Play,
  Pause,
  Search,
  ShoppingBag,
  Monitor,
  Youtube,
  Star,
  BarChart3,
  Percent,
} from 'lucide-react'

// Google Icon
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

// KPI Data
const kpiData = [
  { title: 'Custo Total', value: 'R$ 18.670', change: '+5.2%', trend: 'up', icon: DollarSign, color: 'from-blue-500 to-blue-600' },
  { title: 'Impressões', value: '892.5K', change: '+18.3%', trend: 'up', icon: Eye, color: 'from-green-500 to-emerald-500' },
  { title: 'Cliques', value: '15.234', change: '+12.1%', trend: 'up', icon: MousePointer, color: 'from-yellow-500 to-orange-500' },
  { title: 'CTR', value: '1.71%', change: '+0.08%', trend: 'up', icon: Target, color: 'from-cyan-500 to-blue-500' },
  { title: 'CPC Médio', value: 'R$ 1.23', change: '-6.8%', trend: 'up', icon: DollarSign, color: 'from-emerald-500 to-green-600' },
  { title: 'Conversões', value: '678', change: '+24.5%', trend: 'up', icon: Target, color: 'from-purple-500 to-violet-500' },
  { title: 'Taxa Conv.', value: '4.45%', change: '+0.32%', trend: 'up', icon: Percent, color: 'from-pink-500 to-rose-500' },
  { title: 'CPA', value: 'R$ 27.54', change: '-15.2%', trend: 'up', icon: DollarSign, color: 'from-orange-500 to-amber-500' },
  { title: 'Valor Conv.', value: 'R$ 89.450', change: '+32.1%', trend: 'up', icon: DollarSign, color: 'from-green-500 to-emerald-600' },
  { title: 'ROAS', value: '4.79x', change: '+0.8x', trend: 'up', icon: TrendingUp, color: 'from-primary-500 to-accent-500' },
  { title: 'Quality Score', value: '7.2', change: '+0.4', trend: 'up', icon: Star, color: 'from-yellow-500 to-amber-500' },
  { title: 'Imp. Share', value: '68.5%', change: '+5.2%', trend: 'up', icon: BarChart3, color: 'from-indigo-500 to-purple-500' },
]

// Campaign types
const campaignTypes = [
  { type: 'Search', icon: Search, spend: 'R$ 8.450', percent: 45.3, conversions: 345, roas: '5.2x', color: 'bg-blue-500' },
  { type: 'Shopping', icon: ShoppingBag, spend: 'R$ 6.780', percent: 36.3, conversions: 234, roas: '4.8x', color: 'bg-green-500' },
  { type: 'Display', icon: Monitor, spend: 'R$ 2.340', percent: 12.5, conversions: 67, roas: '2.1x', color: 'bg-purple-500' },
  { type: 'YouTube', icon: Youtube, spend: 'R$ 1.100', percent: 5.9, conversions: 32, roas: '3.2x', color: 'bg-red-500' },
]

// Campaigns
const campaigns = [
  { id: 1, name: 'Brand - Exact Match', type: 'Search', status: 'active', budget: 'R$ 200/dia', spend: 'R$ 1.890', impressions: '45K', clicks: '2.8K', ctr: '6.22%', cpc: 'R$ 0.68', conversions: 189, roas: '8.5x', qualityScore: 9 },
  { id: 2, name: 'Non-Brand - Categories', type: 'Search', status: 'active', budget: 'R$ 400/dia', spend: 'R$ 4.560', impressions: '234K', clicks: '3.4K', ctr: '1.45%', cpc: 'R$ 1.34', conversions: 112, roas: '4.2x', qualityScore: 7 },
  { id: 3, name: 'Shopping - Best Sellers', type: 'Shopping', status: 'active', budget: 'R$ 300/dia', spend: 'R$ 3.890', impressions: '189K', clicks: '4.2K', ctr: '2.22%', cpc: 'R$ 0.93', conversions: 156, roas: '5.4x', qualityScore: 8 },
  { id: 4, name: 'Shopping - New Products', type: 'Shopping', status: 'active', budget: 'R$ 150/dia', spend: 'R$ 1.890', impressions: '78K', clicks: '1.8K', ctr: '2.31%', cpc: 'R$ 1.05', conversions: 67, roas: '4.1x', qualityScore: 7 },
  { id: 5, name: 'Display - Remarketing', type: 'Display', status: 'active', budget: 'R$ 100/dia', spend: 'R$ 1.340', impressions: '456K', clicks: '890', ctr: '0.20%', cpc: 'R$ 1.51', conversions: 45, roas: '3.8x', qualityScore: 6 },
  { id: 6, name: 'YouTube - Product Demo', type: 'YouTube', status: 'paused', budget: 'R$ 80/dia', spend: 'R$ 670', impressions: '89K', clicks: '234', ctr: '0.26%', cpc: 'R$ 2.86', conversions: 12, roas: '2.1x', qualityScore: 5 },
]

// Top Keywords
const topKeywords = [
  { keyword: 'comprar [produto] online', matchType: 'Exact', impressions: '12.5K', clicks: '890', ctr: '7.12%', cpc: 'R$ 0.89', conversions: 67, qualityScore: 9, position: 1.2 },
  { keyword: '[marca] oficial', matchType: 'Exact', impressions: '8.9K', clicks: '1.2K', ctr: '13.48%', cpc: 'R$ 0.45', conversions: 89, qualityScore: 10, position: 1.0 },
  { keyword: '[categoria] melhor preço', matchType: 'Phrase', impressions: '34.5K', clicks: '567', ctr: '1.64%', cpc: 'R$ 1.34', conversions: 34, qualityScore: 7, position: 2.1 },
  { keyword: '[produto] promoção', matchType: 'Broad', impressions: '56.7K', clicks: '678', ctr: '1.20%', cpc: 'R$ 1.56', conversions: 28, qualityScore: 6, position: 2.8 },
  { keyword: 'onde comprar [produto]', matchType: 'Phrase', impressions: '23.4K', clicks: '345', ctr: '1.47%', cpc: 'R$ 1.23', conversions: 23, qualityScore: 7, position: 2.3 },
]

// Shopping Products
const topProducts = [
  { name: 'Produto A - Tamanho M', category: 'Camisetas', clicks: '1.2K', impressions: '45K', ctr: '2.67%', conversions: 89, revenue: 'R$ 8.900', roas: '6.2x' },
  { name: 'Produto B - Azul', category: 'Calças', clicks: '890', impressions: '34K', ctr: '2.62%', conversions: 67, revenue: 'R$ 6.700', roas: '5.8x' },
  { name: 'Produto C - Edição Limitada', category: 'Acessórios', clicks: '567', impressions: '23K', ctr: '2.47%', conversions: 45, revenue: 'R$ 4.500', roas: '5.2x' },
  { name: 'Produto D - Kit', category: 'Kits', clicks: '456', impressions: '18K', ctr: '2.53%', conversions: 34, revenue: 'R$ 3.400', roas: '4.8x' },
]

// Search Terms
const searchTerms = [
  { term: 'comprar camiseta preta', campaign: 'Non-Brand - Categories', clicks: 234, conversions: 18, cost: 'R$ 312.00' },
  { term: 'loja oficial [marca]', campaign: 'Brand - Exact Match', clicks: 189, conversions: 23, cost: 'R$ 85.05' },
  { term: 'melhor calça jeans masculina', campaign: 'Non-Brand - Categories', clicks: 156, conversions: 8, cost: 'R$ 234.00' },
  { term: '[produto] tamanho g', campaign: 'Shopping - Best Sellers', clicks: 145, conversions: 12, cost: 'R$ 130.50' },
]

export default function GoogleAdsPage() {
  const [dateRange, setDateRange] = useState('7d')
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'keywords' | 'products' | 'terms'>('campaigns')

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

  const getQualityScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-400 bg-green-500/20'
    if (score >= 5) return 'text-yellow-400 bg-yellow-500/20'
    return 'text-red-400 bg-red-500/20'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-white/10">
            <GoogleIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Google Ads</h1>
            <p className="text-dark-400 mt-1">Search, Shopping, Display e YouTube</p>
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

      {/* Campaign Types Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {campaignTypes.map((type) => (
          <motion.div
            key={type.type}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-5 hover:border-dark-600/50 transition-all"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-xl ${type.color}/20`}>
                <type.icon className={`w-5 h-5 ${type.color.replace('bg-', 'text-')}`} />
              </div>
              <div>
                <p className="font-semibold text-white">{type.type}</p>
                <p className="text-xs text-dark-400">{type.percent}% do gasto</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Gasto</span>
                <span className="text-white font-medium">{type.spend}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Conversões</span>
                <span className="text-white font-medium">{type.conversions}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">ROAS</span>
                <span className="text-green-400 font-medium">{type.roas}</span>
              </div>
            </div>
            <div className="mt-4 h-2 bg-dark-700/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${type.percent}%` }}
                className={`h-full ${type.color} rounded-full`}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs Section */}
      <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl">
        <div className="flex border-b border-dark-700/50 overflow-x-auto">
          {[
            { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
            { id: 'keywords', label: 'Keywords', icon: Search },
            { id: 'products', label: 'Produtos', icon: ShoppingBag },
            { id: 'terms', label: 'Termos de Pesquisa', icon: Search },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                selectedTab === tab.id ? 'text-white border-blue-500' : 'text-dark-400 border-transparent hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
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
                    <th className="pb-4 font-medium">Tipo</th>
                    <th className="pb-4 font-medium">Status</th>
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Impr.</th>
                    <th className="pb-4 font-medium text-right">Cliques</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium text-right">CPC</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                    <th className="pb-4 font-medium text-center">QS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{campaign.name}</p></td>
                      <td className="py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          campaign.type === 'Search' ? 'bg-blue-500/20 text-blue-400' :
                          campaign.type === 'Shopping' ? 'bg-green-500/20 text-green-400' :
                          campaign.type === 'Display' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{campaign.type}</span>
                      </td>
                      <td className="py-4">{getStatusBadge(campaign.status)}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.spend}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.impressions}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.clicks}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.ctr}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.cpc}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.conversions}</td>
                      <td className="py-4 text-right"><span className="text-green-400 font-medium">{campaign.roas}</span></td>
                      <td className="py-4 text-center">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${getQualityScoreColor(campaign.qualityScore)}`}>
                          {campaign.qualityScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTab === 'keywords' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">Keyword</th>
                    <th className="pb-4 font-medium">Match Type</th>
                    <th className="pb-4 font-medium text-right">Impr.</th>
                    <th className="pb-4 font-medium text-right">Cliques</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium text-right">CPC</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-center">QS</th>
                    <th className="pb-4 font-medium text-right">Posição</th>
                  </tr>
                </thead>
                <tbody>
                  {topKeywords.map((kw, idx) => (
                    <tr key={idx} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{kw.keyword}</p></td>
                      <td className="py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          kw.matchType === 'Exact' ? 'bg-blue-500/20 text-blue-400' :
                          kw.matchType === 'Phrase' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{kw.matchType}</span>
                      </td>
                      <td className="py-4 text-right text-dark-300">{kw.impressions}</td>
                      <td className="py-4 text-right text-dark-300">{kw.clicks}</td>
                      <td className="py-4 text-right text-dark-300">{kw.ctr}</td>
                      <td className="py-4 text-right text-dark-300">{kw.cpc}</td>
                      <td className="py-4 text-right text-dark-300">{kw.conversions}</td>
                      <td className="py-4 text-center">
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${getQualityScoreColor(kw.qualityScore)}`}>
                          {kw.qualityScore}
                        </span>
                      </td>
                      <td className="py-4 text-right"><span className="text-white font-medium">{kw.position}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTab === 'products' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">Produto</th>
                    <th className="pb-4 font-medium">Categoria</th>
                    <th className="pb-4 font-medium text-right">Impr.</th>
                    <th className="pb-4 font-medium text-right">Cliques</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-right">Receita</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, idx) => (
                    <tr key={idx} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{product.name}</p></td>
                      <td className="py-4"><span className="px-2 py-1 text-xs rounded-full bg-dark-700 text-dark-300">{product.category}</span></td>
                      <td className="py-4 text-right text-dark-300">{product.impressions}</td>
                      <td className="py-4 text-right text-dark-300">{product.clicks}</td>
                      <td className="py-4 text-right text-dark-300">{product.ctr}</td>
                      <td className="py-4 text-right text-dark-300">{product.conversions}</td>
                      <td className="py-4 text-right"><span className="text-white font-semibold">{product.revenue}</span></td>
                      <td className="py-4 text-right"><span className="text-green-400 font-medium">{product.roas}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTab === 'terms' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">Termo de Pesquisa</th>
                    <th className="pb-4 font-medium">Campanha</th>
                    <th className="pb-4 font-medium text-right">Cliques</th>
                    <th className="pb-4 font-medium text-right">Conversões</th>
                    <th className="pb-4 font-medium text-right">Custo</th>
                    <th className="pb-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {searchTerms.map((term, idx) => (
                    <tr key={idx} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="py-4"><p className="font-medium text-white">{term.term}</p></td>
                      <td className="py-4 text-dark-300 text-sm">{term.campaign}</td>
                      <td className="py-4 text-right text-dark-300">{term.clicks}</td>
                      <td className="py-4 text-right text-dark-300">{term.conversions}</td>
                      <td className="py-4 text-right text-dark-300">{term.cost}</td>
                      <td className="py-4 text-right">
                        <button className="px-3 py-1 text-xs bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors">
                          + Adicionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
