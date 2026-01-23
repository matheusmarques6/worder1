'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Zap,
  Loader2,
  AlertCircle,
  Link2,
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

// Icon map for campaign types
const iconMap: Record<string, any> = {
  Search,
  ShoppingBag,
  Monitor,
  Youtube,
  Zap,
  MoreHorizontal,
}

interface KPIData {
  cost: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  conversions: number
  conversionRate: number
  cpa: number
  conversionValue: number
  roas: number
}

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  budget: string
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
  conversions: number
  roas: string
  qualityScore: number | null
}

interface CampaignType {
  type: string
  icon: string
  color: string
  spend: string
  percent: string
  conversions: number
  roas: string
}

export default function GoogleAdsPage() {
  const [dateRange, setDateRange] = useState('7d')
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'keywords' | 'products' | 'terms'>('campaigns')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasData, setHasData] = useState(false)
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>([])
  const [keywords, setKeywords] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [searchTerms, setSearchTerms] = useState<any[]>([])

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const res = await fetch(`/api/analytics/google-ads?dateRange=${dateRange}`)
      const data = await res.json()

      if (data.error) {
        console.error('Error:', data.error)
        return
      }

      setHasData(data.hasData)
      setKpis(data.kpis)
      setCampaigns(data.campaigns || [])
      setCampaignTypes(data.campaignTypes || [])
      setKeywords(data.keywords || [])
      setProducts(data.products || [])
      setSearchTerms(data.searchTerms || [])

    } catch (error) {
      console.error('Error fetching Google Ads data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  const getQualityScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-400 bg-gray-500/20'
    if (score >= 8) return 'text-green-400 bg-green-500/20'
    if (score >= 5) return 'text-yellow-400 bg-yellow-500/20'
    return 'text-red-400 bg-red-500/20'
  }

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toString()
  }

  // KPI cards configuration
  const kpiCards = kpis ? [
    { title: 'Custo Total', value: formatCurrency(kpis.cost), icon: DollarSign, color: 'from-blue-500 to-blue-600' },
    { title: 'Impressões', value: formatNumber(kpis.impressions), icon: Eye, color: 'from-green-500 to-emerald-500' },
    { title: 'Cliques', value: formatNumber(kpis.clicks), icon: MousePointer, color: 'from-yellow-500 to-orange-500' },
    { title: 'CTR', value: `${kpis.ctr.toFixed(2)}%`, icon: Target, color: 'from-cyan-500 to-blue-500' },
    { title: 'CPC Médio', value: formatCurrency(kpis.cpc), icon: DollarSign, color: 'from-emerald-500 to-green-600' },
    { title: 'Conversões', value: Math.round(kpis.conversions).toString(), icon: Target, color: 'from-purple-500 to-violet-500' },
    { title: 'Taxa Conv.', value: `${kpis.conversionRate.toFixed(2)}%`, icon: Percent, color: 'from-pink-500 to-rose-500' },
    { title: 'CPA', value: formatCurrency(kpis.cpa), icon: DollarSign, color: 'from-orange-500 to-amber-500' },
    { title: 'Valor Conv.', value: formatCurrency(kpis.conversionValue), icon: DollarSign, color: 'from-green-500 to-emerald-600' },
    { title: 'ROAS', value: `${kpis.roas.toFixed(2)}x`, icon: TrendingUp, color: 'from-primary-500 to-accent-500' },
  ] : []

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-dark-400">Carregando dados do Google Ads...</p>
        </div>
      </div>
    )
  }

  // No data state
  if (!hasData) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-white/10">
            <GoogleIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Google Ads</h1>
            <p className="text-dark-400 mt-1">Search, Shopping, Display e YouTube</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-6">
              <GoogleIcon />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Conecte sua conta Google Ads</h2>
            <p className="text-dark-400 mb-6">
              Para visualizar métricas e gerenciar suas campanhas, conecte sua conta do Google Ads.
            </p>
            <a
              href="/settings/integrations"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl text-white font-medium transition-all"
            >
              <Link2 className="w-4 h-4" />
              Conectar Google Ads
            </a>
          </div>
        </div>
      </div>
    )
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
            {[
              { label: 'Hoje', value: 'today' },
              { label: 'Ontem', value: 'yesterday' },
              { label: '7 Dias', value: '7d' },
              { label: '30 Dias', value: '30d' },
              { label: '90 Dias', value: '90d' },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setDateRange(range.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  dateRange === range.value
                    ? 'bg-blue-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {range.label}
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

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-xl text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {kpiCards.map((kpi, index) => (
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
            </motion.div>
          ))}
        </div>
      )}

      {/* Campaign Types Distribution */}
      {campaignTypes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {campaignTypes.map((type) => {
            const Icon = iconMap[type.icon] || MoreHorizontal
            return (
              <motion.div
                key={type.type}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-5 hover:border-dark-600/50 transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-3 rounded-xl ${type.color}/20`}>
                    <Icon className={`w-5 h-5 ${type.color.replace('bg-', 'text-')}`} />
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
                    animate={{ width: `${parseFloat(type.percent)}%` }}
                    className={`h-full ${type.color} rounded-full`}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

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
              {campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                  <p className="text-dark-400">Nenhuma campanha encontrada para o período selecionado.</p>
                </div>
              ) : (
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
                            campaign.type === 'SEARCH' ? 'bg-blue-500/20 text-blue-400' :
                            campaign.type === 'SHOPPING' ? 'bg-green-500/20 text-green-400' :
                            campaign.type === 'DISPLAY' ? 'bg-purple-500/20 text-purple-400' :
                            campaign.type === 'VIDEO' ? 'bg-red-500/20 text-red-400' :
                            'bg-orange-500/20 text-orange-400'
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
                          {campaign.qualityScore !== null && (
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${getQualityScoreColor(campaign.qualityScore)}`}>
                              {campaign.qualityScore}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedTab === 'keywords' && (
            <div className="overflow-x-auto">
              {keywords.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                  <p className="text-dark-400">Nenhuma keyword encontrada.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                      <th className="pb-4 font-medium">Keyword</th>
                      <th className="pb-4 font-medium">Match Type</th>
                      <th className="pb-4 font-medium text-center">QS</th>
                      <th className="pb-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((kw) => (
                      <tr key={kw.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                        <td className="py-4"><p className="font-medium text-white">{kw.keyword_text}</p></td>
                        <td className="py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            kw.match_type === 'EXACT' ? 'bg-blue-500/20 text-blue-400' :
                            kw.match_type === 'PHRASE' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>{kw.match_type}</span>
                        </td>
                        <td className="py-4 text-center">
                          {kw.quality_score !== null && (
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${getQualityScoreColor(kw.quality_score)}`}>
                              {kw.quality_score}
                            </span>
                          )}
                        </td>
                        <td className="py-4">{getStatusBadge(kw.status === 'ENABLED' ? 'active' : 'paused')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedTab === 'products' && (
            <div className="overflow-x-auto">
              {products.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                  <p className="text-dark-400">Nenhum produto do Shopping encontrado.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                      <th className="pb-4 font-medium">Produto</th>
                      <th className="pb-4 font-medium">Categoria</th>
                      <th className="pb-4 font-medium text-right">Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                        <td className="py-4"><p className="font-medium text-white">{product.title}</p></td>
                        <td className="py-4 text-dark-300">{product.category || '-'}</td>
                        <td className="py-4 text-right text-dark-300">
                          {product.price ? formatCurrency(product.price) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedTab === 'terms' && (
            <div className="overflow-x-auto">
              {searchTerms.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                  <p className="text-dark-400">Nenhum termo de pesquisa encontrado.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                      <th className="pb-4 font-medium">Termo de Pesquisa</th>
                      <th className="pb-4 font-medium text-right">Cliques</th>
                      <th className="pb-4 font-medium text-right">Conversões</th>
                      <th className="pb-4 font-medium text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchTerms.map((term) => (
                      <tr key={term.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                        <td className="py-4"><p className="font-medium text-white">{term.search_term}</p></td>
                        <td className="py-4 text-right text-dark-300">{term.clicks}</td>
                        <td className="py-4 text-right text-dark-300">{term.conversions}</td>
                        <td className="py-4 text-right text-dark-300">{formatCurrency(term.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
