'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  RefreshCw,
  MoreHorizontal,
  Play,
  Pause,
  Calendar,
  Users,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Copy,
  Trash2,
  BarChart3,
  Loader2,
  Filter,
  ArrowUpDown,
  FileText,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface Campaign {
  id: string
  name: string
  description?: string
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  template_name?: string
  audience_type: string
  audience_count: number
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_read: number
  total_failed: number
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'text-dark-400', bg: 'bg-dark-700', icon: FileText },
  scheduled: { label: 'Agendada', color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Calendar },
  running: { label: 'Enviando', color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: Play },
  paused: { label: 'Pausada', color: 'text-orange-400', bg: 'bg-orange-500/20', icon: Pause },
  completed: { label: 'Concluída', color: 'text-green-400', bg: 'bg-green-500/20', icon: CheckCircle },
  failed: { label: 'Falhou', color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle },
  cancelled: { label: 'Cancelada', color: 'text-dark-400', bg: 'bg-dark-700', icon: XCircle },
}

export default function CampaignsTab() {
  const router = useRouter()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchCampaigns = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ organization_id: organizationId })
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (search) params.append('search', search)
      
      const res = await fetch(`/api/whatsapp/campaigns?${params}`)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (error) {
      console.error('Error fetching campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [organizationId, statusFilter])

  const handleAction = async (campaignId: string, action: string) => {
    try {
      await fetch(`/api/whatsapp/campaigns/${campaignId}/${action}`, { method: 'POST' })
      fetchCampaigns()
    } catch (error) {
      console.error(`Error ${action} campaign:`, error)
    }
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getDeliveryRate = (campaign: Campaign) => {
    if (!campaign.total_sent) return 0
    return Math.round((campaign.total_delivered / campaign.total_sent) * 100)
  }

  const getReadRate = (campaign: Campaign) => {
    if (!campaign.total_delivered) return 0
    return Math.round((campaign.total_read / campaign.total_delivered) * 100)
  }

  return (
    <div className="p-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchCampaigns()}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {['all', 'draft', 'running', 'scheduled', 'completed'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                statusFilter === status
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-700/50'
              }`}
            >
              {status === 'all' ? 'Todas' : statusConfig[status]?.label || status}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="p-2.5 rounded-xl bg-dark-800/50 border border-dark-700/50 text-dark-400 hover:text-white hover:bg-dark-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => router.push('/whatsapp/campaigns/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Nova Campanha</span>
          </button>
        </div>
      </div>

      {/* Campaigns List */}
      {loading && campaigns.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-dark-400">
          <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4">
            <Send className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-lg font-medium text-white mb-1">Nenhuma campanha</p>
          <p className="text-sm text-dark-500 mb-4">Crie sua primeira campanha de WhatsApp</p>
          <button
            onClick={() => router.push('/whatsapp/campaigns/new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const status = statusConfig[campaign.status] || statusConfig.draft
            const StatusIcon = status.icon

            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4 hover:border-dark-600 transition-all cursor-pointer group"
                onClick={() => router.push(`/whatsapp/campaigns/${campaign.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left side */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-medium truncate group-hover:text-primary-300 transition-colors">
                        {campaign.name}
                      </h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    
                    {campaign.description && (
                      <p className="text-sm text-dark-400 mb-2 line-clamp-1">{campaign.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-dark-500">
                      {campaign.template_name && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {campaign.template_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {campaign.audience_count} contatos
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(campaign.scheduled_at || campaign.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  {(campaign.status === 'completed' || campaign.status === 'running') && (
                    <div className="hidden md:flex items-center gap-6 text-center">
                      <div>
                        <p className="text-lg font-semibold text-white">{campaign.total_sent}</p>
                        <p className="text-xs text-dark-500">Enviados</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-green-400">{getDeliveryRate(campaign)}%</p>
                        <p className="text-xs text-dark-500">Entregues</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-blue-400">{getReadRate(campaign)}%</p>
                        <p className="text-xs text-dark-500">Lidos</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {campaign.status === 'draft' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(campaign.id, 'send') }}
                        className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
                        title="Enviar"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {campaign.status === 'running' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(campaign.id, 'pause') }}
                        className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                        title="Pausar"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(campaign.id, 'resume') }}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                        title="Retomar"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/whatsapp/campaigns/${campaign.id}`) }}
                      className="p-2 rounded-lg bg-dark-700/50 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                      title="Ver detalhes"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
