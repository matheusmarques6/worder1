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
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Play,
  Pause,
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  Clock,
  Percent,
  Video,
} from 'lucide-react'

// TikTok Icon
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
)

// KPI Data
const kpiData = [
  { title: 'Gasto Total', value: 'R$ 8.450', change: '+12.3%', trend: 'up', icon: DollarSign, color: 'from-pink-500 to-rose-500' },
  { title: 'Impressões', value: '1.2M', change: '+25.8%', trend: 'up', icon: Eye, color: 'from-cyan-500 to-blue-500' },
  { title: 'Alcance', value: '456.7K', change: '+18.4%', trend: 'up', icon: Users, color: 'from-purple-500 to-violet-500' },
  { title: 'Cliques', value: '12.345', change: '+15.2%', trend: 'up', icon: MousePointer, color: 'from-green-500 to-emerald-500' },
  { title: 'CTR', value: '1.03%', change: '+0.12%', trend: 'up', icon: Target, color: 'from-yellow-500 to-orange-500' },
  { title: 'CPC', value: 'R$ 0.68', change: '-8.2%', trend: 'up', icon: DollarSign, color: 'from-emerald-500 to-green-600' },
  { title: 'CPM', value: 'R$ 7.04', change: '-5.1%', trend: 'up', icon: DollarSign, color: 'from-blue-500 to-cyan-500' },
  { title: 'Video Views', value: '892K', change: '+32.1%', trend: 'up', icon: Video, color: 'from-rose-500 to-pink-600' },
  { title: 'Avg Watch Time', value: '8.2s', change: '+1.4s', trend: 'up', icon: Clock, color: 'from-orange-500 to-amber-500' },
  { title: 'Conversões', value: '234', change: '+28.5%', trend: 'up', icon: Target, color: 'from-violet-500 to-purple-600' },
  { title: 'CVR', value: '1.90%', change: '+0.25%', trend: 'up', icon: Percent, color: 'from-indigo-500 to-blue-600' },
  { title: 'ROAS', value: '3.2x', change: '+0.5x', trend: 'up', icon: TrendingUp, color: 'from-primary-500 to-accent-500' },
]

// Engagement metrics
const engagementData = [
  { metric: 'Likes', value: '45.6K', change: '+28%', icon: Heart, color: 'from-red-500 to-rose-500' },
  { metric: 'Comentários', value: '3.2K', change: '+15%', icon: MessageCircle, color: 'from-blue-500 to-cyan-500' },
  { metric: 'Compartilhamentos', value: '1.8K', change: '+42%', icon: Share2, color: 'from-green-500 to-emerald-500' },
  { metric: 'Visitas ao Perfil', value: '8.9K', change: '+35%', icon: Users, color: 'from-purple-500 to-violet-500' },
  { metric: 'Novos Seguidores', value: '456', change: '+22%', icon: UserPlus, color: 'from-pink-500 to-rose-500' },
]

// Video funnel data
const videoFunnel = [
  { stage: 'Impressões', value: 1200000, percent: 100 },
  { stage: '2s Views', value: 892000, percent: 74.3 },
  { stage: '6s Views', value: 534000, percent: 44.5 },
  { stage: '25% Watched', value: 356000, percent: 29.7 },
  { stage: '50% Watched', value: 178000, percent: 14.8 },
  { stage: '75% Watched', value: 89000, percent: 7.4 },
  { stage: '100% Watched', value: 45000, percent: 3.8 },
]

// Campaigns
const campaigns = [
  { id: 1, name: 'Black Friday - In-Feed', status: 'active', objective: 'Conversões', budget: 'R$ 300/dia', spend: 'R$ 3.450', impressions: '456K', clicks: '5.6K', ctr: '1.23%', videoViews: '342K', avgWatch: '9.2s', conversions: 98, roas: '3.8x' },
  { id: 2, name: 'Product Launch - TopView', status: 'active', objective: 'Awareness', budget: 'R$ 500/dia', spend: 'R$ 2.890', impressions: '389K', clicks: '3.2K', ctr: '0.82%', videoViews: '298K', avgWatch: '7.8s', conversions: 56, roas: '2.9x' },
  { id: 3, name: 'Remarketing - Spark Ads', status: 'active', objective: 'Conversões', budget: 'R$ 150/dia', spend: 'R$ 1.340', impressions: '178K', clicks: '2.1K', ctr: '1.18%', videoViews: '134K', avgWatch: '8.5s', conversions: 67, roas: '4.5x' },
  { id: 4, name: 'Brand Challenge', status: 'paused', objective: 'Engajamento', budget: 'R$ 200/dia', spend: 'R$ 770', impressions: '177K', clicks: '1.4K', ctr: '0.79%', videoViews: '118K', avgWatch: '6.2s', conversions: 13, roas: '1.8x' },
]

// Creatives performance
const creatives = [
  { id: 1, name: 'UGC Style - Review', thumbnail: '🎬', duration: '15s', views: '234K', completion: '42%', likes: '12.3K', shares: '890', conversions: 45, cpa: 'R$ 28.50' },
  { id: 2, name: 'Product Demo - Features', thumbnail: '📱', duration: '30s', views: '189K', completion: '28%', likes: '8.9K', shares: '567', conversions: 34, cpa: 'R$ 32.00' },
  { id: 3, name: 'Before/After', thumbnail: '✨', duration: '10s', views: '156K', completion: '58%', likes: '15.6K', shares: '1.2K', conversions: 56, cpa: 'R$ 24.00' },
  { id: 4, name: 'Trending Sound', thumbnail: '🎵', duration: '12s', views: '312K', completion: '52%', likes: '18.9K', shares: '2.1K', conversions: 89, cpa: 'R$ 21.50' },
]

// Age breakdown
const ageBreakdown = [
  { age: '13-17', spend: 'R$ 340', impressions: '89K', engagement: '4.2%', conversions: 8 },
  { age: '18-24', spend: 'R$ 3.450', impressions: '567K', engagement: '5.8%', conversions: 112 },
  { age: '25-34', spend: 'R$ 2.890', impressions: '345K', engagement: '4.5%', conversions: 78 },
  { age: '35-44', spend: 'R$ 1.230', impressions: '134K', engagement: '3.2%', conversions: 28 },
  { age: '45-54', spend: 'R$ 420', impressions: '52K', engagement: '2.1%', conversions: 6 },
  { age: '55+', spend: 'R$ 120', impressions: '13K', engagement: '1.5%', conversions: 2 },
]

// Interest targeting
const interests = [
  { interest: 'Fashion & Style', impressions: '345K', ctr: '1.45%', conversions: 89, cpa: 'R$ 24.50' },
  { interest: 'Beauty & Personal Care', impressions: '234K', ctr: '1.32%', conversions: 67, cpa: 'R$ 26.00' },
  { interest: 'Shopping & Retail', impressions: '189K', ctr: '1.58%', conversions: 56, cpa: 'R$ 22.80' },
  { interest: 'Entertainment', impressions: '156K', ctr: '0.89%', conversions: 12, cpa: 'R$ 45.00' },
  { interest: 'Food & Beverage', impressions: '89K', ctr: '1.12%', conversions: 10, cpa: 'R$ 38.50' },
]

export default function TikTokAdsPage() {
  const [dateRange, setDateRange] = useState('7d')
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'creatives' | 'audience'>('campaigns')

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
          <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-cyan-500/20">
            <TikTokIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">TikTok Ads</h1>
            <p className="text-dark-400 mt-1">Performance e métricas de engajamento</p>
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
                    ? 'bg-gradient-to-r from-pink-500 to-cyan-500 text-white'
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

          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-600 hover:to-cyan-600 rounded-xl text-white transition-all">
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

      {/* Engagement & Video Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engagement Metrics */}
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Engajamento</h3>
              <p className="text-sm text-dark-400">Métricas exclusivas TikTok</p>
            </div>
          </div>

          <div className="space-y-4">
            {engagementData.map((item) => (
              <div key={item.metric} className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${item.color}`}>
                  <item.icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-dark-400">{item.metric}</p>
                  <p className="text-lg font-bold text-white">{item.value}</p>
                </div>
                <span className="text-sm font-medium text-green-400">{item.change}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-dark-700/30 rounded-xl">
            <p className="text-sm text-dark-400 mb-2">Taxa de Engajamento</p>
            <p className="text-3xl font-bold text-white">4.8%</p>
            <p className="text-xs text-green-400 mt-1">+0.6% vs. período anterior</p>
          </div>
        </div>

        {/* Video Funnel */}
        <div className="lg:col-span-2 bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Funil de Vídeo</h3>
              <p className="text-sm text-dark-400">Retenção por etapa de visualização</p>
            </div>
          </div>

          <div className="space-y-3">
            {videoFunnel.map((item, index) => (
              <div key={item.stage}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{item.stage}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-dark-400">{(item.value / 1000).toFixed(0)}K</span>
                    <span className="text-sm font-medium text-cyan-400">{item.percent}%</span>
                  </div>
                </div>
                <div className="h-6 bg-dark-700/50 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percent}%` }}
                    transition={{ delay: index * 0.08, duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-pink-500 to-cyan-500 rounded-lg"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="p-3 bg-dark-700/30 rounded-xl text-center">
              <p className="text-xs text-dark-400">Video Completion Rate</p>
              <p className="text-xl font-bold text-white mt-1">3.8%</p>
            </div>
            <div className="p-3 bg-dark-700/30 rounded-xl text-center">
              <p className="text-xs text-dark-400">Avg. Watch Time</p>
              <p className="text-xl font-bold text-white mt-1">8.2s</p>
            </div>
            <div className="p-3 bg-dark-700/30 rounded-xl text-center">
              <p className="text-xs text-dark-400">6s View Rate</p>
              <p className="text-xl font-bold text-white mt-1">44.5%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl">
        <div className="flex border-b border-dark-700/50">
          {[
            { id: 'campaigns', label: 'Campanhas', count: campaigns.length },
            { id: 'creatives', label: 'Criativos', count: creatives.length },
            { id: 'audience', label: 'Audiência' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all border-b-2 ${
                selectedTab === tab.id ? 'text-white border-pink-500' : 'text-dark-400 border-transparent hover:text-white'
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
                    <th className="pb-4 font-medium text-right">Impr.</th>
                    <th className="pb-4 font-medium text-right">Video Views</th>
                    <th className="pb-4 font-medium text-right">Avg Watch</th>
                    <th className="pb-4 font-medium text-right">Conv.</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
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
                      <td className="py-4 text-right text-dark-300">{campaign.videoViews}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.avgWatch}</td>
                      <td className="py-4 text-right text-dark-300">{campaign.conversions}</td>
                      <td className="py-4 text-right"><span className="text-green-400 font-medium">{campaign.roas}</span></td>
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

          {selectedTab === 'creatives' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {creatives.map((creative) => (
                <div key={creative.id} className="p-4 bg-dark-700/30 rounded-xl hover:bg-dark-700/50 transition-all">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl bg-dark-600 flex items-center justify-center text-3xl">
                      {creative.thumbnail}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{creative.name}</p>
                      <p className="text-xs text-dark-400 mt-1">Duração: {creative.duration}</p>
                      
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        <div>
                          <p className="text-xs text-dark-500">Views</p>
                          <p className="text-sm font-medium text-white">{creative.views}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-500">Completion</p>
                          <p className="text-sm font-medium text-cyan-400">{creative.completion}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-500">Likes</p>
                          <p className="text-sm font-medium text-white">{creative.likes}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-500">Shares</p>
                          <p className="text-sm font-medium text-white">{creative.shares}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-600">
                        <div>
                          <p className="text-xs text-dark-500">Conversões</p>
                          <p className="text-sm font-semibold text-white">{creative.conversions}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-dark-500">CPA</p>
                          <p className="text-sm font-semibold text-green-400">{creative.cpa}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedTab === 'audience' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Age Breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-4">Por Idade</h4>
                <div className="space-y-3">
                  {ageBreakdown.map((row) => (
                    <div key={row.age} className="flex items-center gap-4">
                      <div className="w-16 text-sm text-dark-300">{row.age}</div>
                      <div className="flex-1">
                        <div className="h-6 bg-dark-700/50 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(row.conversions / 112) * 100}%` }}
                            className="h-full bg-gradient-to-r from-pink-500 to-cyan-500 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="w-20 text-right">
                        <p className="text-sm font-medium text-white">{row.conversions} conv.</p>
                        <p className="text-xs text-dark-400">{row.engagement} eng.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-4">Por Interesse</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-dark-400 border-b border-dark-700/50">
                        <th className="pb-3 text-left font-medium">Interesse</th>
                        <th className="pb-3 text-right font-medium">Impr.</th>
                        <th className="pb-3 text-right font-medium">CTR</th>
                        <th className="pb-3 text-right font-medium">CPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interests.map((row) => (
                        <tr key={row.interest} className="border-b border-dark-700/30">
                          <td className="py-3 text-white">{row.interest}</td>
                          <td className="py-3 text-right text-dark-300">{row.impressions}</td>
                          <td className="py-3 text-right text-dark-300">{row.ctr}</td>
                          <td className="py-3 text-right">
                            <span className={`font-medium ${parseFloat(row.cpa.replace('R$ ', '')) < 30 ? 'text-green-400' : 'text-yellow-400'}`}>
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
          )}
        </div>
      </div>
    </div>
  )
}
