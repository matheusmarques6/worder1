'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/stores'
import {
  Plus, Search, RefreshCw, MoreVertical, Play, Pause, Copy, Trash2,
  Calendar, Users, Send, CheckCircle, Eye, MessageSquare, Clock,
  XCircle, Loader2, BarChart3,
} from 'lucide-react'
import { useWhatsAppConnection } from '@/hooks/useWhatsAppConnection'
import { WhatsAppConnectionRequired, WhatsAppConnectionLoading, WhatsAppConnectionBanner } from '@/components/whatsapp/WhatsAppConnectionRequired'

interface Campaign {
  id: string
  name: string
  status: string
  template_name?: string
  audience_count: number
  total_sent: number
  total_delivered: number
  total_read: number
  total_failed: number
  created_at: string
}

interface Metrics {
  totalCampaigns: number
  totalSent: number
  totalDelivered: number
  totalRead: number
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-dark-600 text-dark-300', icon: Clock },
  scheduled: { label: 'Agendada', color: 'bg-blue-500/10 text-blue-400', icon: Calendar },
  running: { label: 'Enviando', color: 'bg-primary-500/10 text-primary-400', icon: Play },
  paused: { label: 'Pausada', color: 'bg-yellow-500/10 text-yellow-400', icon: Pause },
  completed: { label: 'Concluída', color: 'bg-green-500/10 text-green-400', icon: CheckCircle },
  failed: { label: 'Falhou', color: 'bg-red-500/10 text-red-400', icon: XCircle },
  cancelled: { label: 'Cancelada', color: 'bg-dark-600 text-dark-400', icon: XCircle },
}

export default function CampaignsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || ''
  
  // Verificar conexão do WhatsApp
  const { connected, loading: connectionLoading } = useWhatsAppConnection(organizationId)
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const fetchCampaigns = async () => {
    if (!organizationId) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ organizationId })
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (search) params.append('search', search)
      const res = await fetch(`/api/whatsapp/campaigns?${params}`)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
      setMetrics(data.metrics || null)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { if (organizationId) fetchCampaigns() }, [statusFilter, organizationId])

  const handleAction = async (action: string, campaignId: string) => {
    setOpenDropdown(null)
    try {
      if (action === 'delete') {
        if (!confirm('Tem certeza que deseja excluir esta campanha?')) return
        await fetch(`/api/whatsapp/campaigns/${campaignId}`, { method: 'DELETE' })
      } else if (action === 'duplicate') {
        await fetch(`/api/whatsapp/campaigns/${campaignId}/duplicate`, { method: 'POST' })
      } else if (['send', 'pause', 'resume', 'cancel'].includes(action)) {
        await fetch(`/api/whatsapp/campaigns/${campaignId}/${action}`, { method: 'POST' })
      }
      fetchCampaigns()
    } catch (error) {
      console.error('Error performing action:', error)
    }
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  // Verificar se está carregando a conexão
  if (connectionLoading) {
    return (
      <div className="space-y-6">
        <WhatsAppConnectionLoading />
      </div>
    )
  }

  // Se não estiver conectado, mostrar tela de conexão
  if (!connected) {
    return (
      <div className="space-y-6">
        <WhatsAppConnectionRequired 
          title="Conecte o WhatsApp para ver campanhas"
          description="Para criar e gerenciar campanhas de WhatsApp Marketing, você precisa conectar sua conta do WhatsApp Business API."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Action Button */}
      <div className="flex justify-end">
        <button onClick={() => router.push('/whatsapp/campaigns/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium">
          <Plus className="w-5 h-5" /> Nova Campanha
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/10 rounded-lg"><BarChart3 className="w-5 h-5 text-primary-400" /></div>
              <div><p className="text-2xl font-bold text-white">{metrics.totalCampaigns}</p><p className="text-xs text-dark-400">Campanhas</p></div>
            </div>
          </div>
          <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Send className="w-5 h-5 text-blue-400" /></div>
              <div><p className="text-2xl font-bold text-white">{formatNumber(metrics.totalSent)}</p><p className="text-xs text-dark-400">Enviadas</p></div>
            </div>
          </div>
          <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg"><CheckCircle className="w-5 h-5 text-green-400" /></div>
              <div><p className="text-2xl font-bold text-white">{metrics.totalSent > 0 ? ((metrics.totalDelivered / metrics.totalSent) * 100).toFixed(0) : 0}%</p><p className="text-xs text-dark-400">Entregues</p></div>
            </div>
          </div>
          <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg"><Eye className="w-5 h-5 text-cyan-400" /></div>
              <div><p className="text-2xl font-bold text-white">{metrics.totalDelivered > 0 ? ((metrics.totalRead / metrics.totalDelivered) * 100).toFixed(0) : 0}%</p><p className="text-xs text-dark-400">Lidas</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input type="text" placeholder="Buscar campanhas..." value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchCampaigns()}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50" />
        </div>
        <div className="flex gap-2">
          {['all', 'draft', 'scheduled', 'running', 'completed'].map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${statusFilter === status ? 'bg-primary-500 text-white' : 'bg-dark-800/50 text-dark-400 hover:text-white'}`}>
              {status === 'all' ? 'Todas' : statusConfig[status]?.label || status}
            </button>
          ))}
        </div>
        <button onClick={fetchCampaigns} disabled={isLoading} className="p-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-400 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
        {isLoading && campaigns.length === 0 ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-400 animate-spin" /></div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-dark-400">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhuma campanha encontrada</p>
            <p className="text-sm text-dark-500 mt-1">Crie sua primeira campanha para começar</p>
            <button onClick={() => router.push('/whatsapp/campaigns/new')} className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
              Criar Campanha
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="text-left py-4 px-6 text-xs font-medium text-dark-400 uppercase">Campanha</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-dark-400 uppercase">Status</th>
                <th className="text-center py-4 px-4 text-xs font-medium text-dark-400 uppercase">Audiência</th>
                <th className="text-center py-4 px-4 text-xs font-medium text-dark-400 uppercase">Enviadas</th>
                <th className="text-center py-4 px-4 text-xs font-medium text-dark-400 uppercase">Entrega</th>
                <th className="text-center py-4 px-4 text-xs font-medium text-dark-400 uppercase">Lidas</th>
                <th className="text-right py-4 px-6 text-xs font-medium text-dark-400 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const status = statusConfig[campaign.status] || statusConfig.draft
                const StatusIcon = status.icon
                const deliveryRate = campaign.total_sent > 0 ? ((campaign.total_delivered / campaign.total_sent) * 100).toFixed(0) : '0'
                const readRate = campaign.total_delivered > 0 ? ((campaign.total_read / campaign.total_delivered) * 100).toFixed(0) : '0'
                return (
                  <motion.tr key={campaign.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="border-b border-dark-700/30 hover:bg-dark-700/20 cursor-pointer transition-colors"
                    onClick={() => router.push(`/whatsapp/campaigns/${campaign.id}`)}>
                    <td className="py-4 px-6">
                      <div><p className="font-medium text-white">{campaign.name}</p>
                        <p className="text-xs text-dark-400 mt-0.5">{campaign.template_name || 'Sem template'} • {formatDate(campaign.created_at)}</p></div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${status.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />{status.label}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1"><Users className="w-4 h-4 text-dark-400" /><span className="text-white">{formatNumber(campaign.audience_count)}</span></div>
                    </td>
                    <td className="py-4 px-4 text-center"><span className="text-white">{formatNumber(campaign.total_sent)}</span></td>
                    <td className="py-4 px-4 text-center"><span className={campaign.total_sent > 0 ? 'text-green-400' : 'text-dark-500'}>{deliveryRate}%</span></td>
                    <td className="py-4 px-4 text-center"><span className={campaign.total_delivered > 0 ? 'text-cyan-400' : 'text-dark-500'}>{readRate}%</span></td>
                    <td className="py-4 px-6 text-right">
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === campaign.id ? null : campaign.id) }} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4 text-dark-400" />
                        </button>
                        {openDropdown === campaign.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 py-1">
                            {campaign.status === 'draft' && <button onClick={(e) => { e.stopPropagation(); handleAction('send', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-dark-700"><Play className="w-4 h-4" /> Enviar Agora</button>}
                            {campaign.status === 'running' && <button onClick={(e) => { e.stopPropagation(); handleAction('pause', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-dark-700"><Pause className="w-4 h-4" /> Pausar</button>}
                            {campaign.status === 'paused' && <button onClick={(e) => { e.stopPropagation(); handleAction('resume', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-dark-700"><Play className="w-4 h-4" /> Retomar</button>}
                            <button onClick={(e) => { e.stopPropagation(); handleAction('duplicate', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-dark-700"><Copy className="w-4 h-4" /> Duplicar</button>
                            {['scheduled', 'running', 'paused'].includes(campaign.status) && <button onClick={(e) => { e.stopPropagation(); handleAction('cancel', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-400 hover:bg-dark-700"><XCircle className="w-4 h-4" /> Cancelar</button>}
                            <button onClick={(e) => { e.stopPropagation(); handleAction('delete', campaign.id) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-dark-700"><Trash2 className="w-4 h-4" /> Excluir</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
