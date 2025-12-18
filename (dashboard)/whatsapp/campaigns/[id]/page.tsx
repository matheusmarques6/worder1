'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Send, CheckCircle, Eye, MessageSquare, MousePointer, XCircle,
  Calendar, Clock, Users, Play, Pause, Copy, Trash2, Edit, Loader2,
  TrendingUp, DollarSign, AlertCircle, RefreshCw,
} from 'lucide-react'

interface Campaign {
  id: string
  name: string
  description?: string
  type: string
  status: string
  template_name?: string
  template?: any
  audience_type: string
  audience_tags?: string[]
  audience_count: number
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_read: number
  total_clicked: number
  total_replied: number
  total_failed: number
  total_opted_out: number
  attributed_revenue: number
  attributed_orders: number
  total_cost: number
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  created_at: string
}

interface Metrics {
  deliveryRate: string
  readRate: string
  clickRate: string
  replyRate: string
  failureRate: string
}

interface Log {
  id: string
  log_type: string
  message: string
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Rascunho', color: 'text-dark-300', bgColor: 'bg-dark-600' },
  scheduled: { label: 'Agendada', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  running: { label: 'Enviando', color: 'text-primary-400', bgColor: 'bg-primary-500/10' },
  paused: { label: 'Pausada', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  completed: { label: 'Concluída', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  failed: { label: 'Falhou', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  cancelled: { label: 'Cancelada', color: 'text-dark-400', bgColor: 'bg-dark-600' },
}

export default function CampaignDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchCampaign = async () => {
    try {
      const res = await fetch(`/api/whatsapp/campaigns/${campaignId}`)
      const data = await res.json()
      setCampaign(data.campaign)
      setMetrics(data.metrics)
      setLogs(data.logs || [])
    } catch (error) {
      console.error('Error fetching campaign:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (campaignId) fetchCampaign()
  }, [campaignId])

  const handleAction = async (action: string) => {
    setActionLoading(action)
    try {
      if (action === 'delete') {
        if (!confirm('Tem certeza que deseja excluir esta campanha?')) return
        await fetch(`/api/whatsapp/campaigns/${campaignId}`, { method: 'DELETE' })
        router.push('/whatsapp/campaigns')
        return
      }
      if (action === 'duplicate') {
        const res = await fetch(`/api/whatsapp/campaigns/${campaignId}/duplicate`, { method: 'POST' })
        const data = await res.json()
        if (data.campaign) router.push(`/whatsapp/campaigns/${data.campaign.id}`)
        return
      }
      await fetch(`/api/whatsapp/campaigns/${campaignId}/${action}`, { method: 'POST' })
      fetchCampaign()
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatCurrency = (num: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-dark-400">
        <AlertCircle className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg">Campanha não encontrada</p>
        <button onClick={() => router.push('/whatsapp/campaigns')} className="mt-4 text-primary-400 hover:underline">
          Voltar para campanhas
        </button>
      </div>
    )
  }

  const status = statusConfig[campaign.status] || statusConfig.draft

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button onClick={() => router.push('/whatsapp/campaigns')} className="p-2 hover:bg-dark-800 rounded-lg mt-1">
            <ArrowLeft className="w-5 h-5 text-dark-400" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-lg ${status.bgColor} ${status.color}`}>
                {status.label}
              </span>
            </div>
            {campaign.description && <p className="text-dark-400">{campaign.description}</p>}
            <div className="flex items-center gap-4 mt-2 text-sm text-dark-500">
              <span>Template: {campaign.template_name || 'N/A'}</span>
              <span>•</span>
              <span>Criada em {formatDate(campaign.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <button onClick={() => handleAction('send')} disabled={actionLoading === 'send'}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50">
              {actionLoading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Enviar
            </button>
          )}
          {campaign.status === 'running' && (
            <button onClick={() => handleAction('pause')} disabled={actionLoading === 'pause'}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 disabled:opacity-50">
              {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />} Pausar
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={() => handleAction('resume')} disabled={actionLoading === 'resume'}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50">
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Retomar
            </button>
          )}
          <button onClick={() => handleAction('duplicate')} className="p-2 bg-dark-700 text-dark-300 rounded-xl hover:bg-dark-600 hover:text-white">
            <Copy className="w-5 h-5" />
          </button>
          {['draft', 'cancelled', 'completed', 'failed'].includes(campaign.status) && (
            <button onClick={() => handleAction('delete')} className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button onClick={fetchCampaign} className="p-2 bg-dark-700 text-dark-400 rounded-xl hover:text-white">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-dark-400" />
            <span className="text-xs text-dark-400">Audiência</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(campaign.total_recipients)}</p>
        </div>
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Send className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-dark-400">Enviadas</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(campaign.total_sent)}</p>
        </div>
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs text-dark-400">Entregues</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{metrics?.deliveryRate || 0}%</p>
          <p className="text-xs text-dark-500">{formatNumber(campaign.total_delivered)}</p>
        </div>
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-dark-400">Lidas</span>
          </div>
          <p className="text-2xl font-bold text-cyan-400">{metrics?.readRate || 0}%</p>
          <p className="text-xs text-dark-500">{formatNumber(campaign.total_read)}</p>
        </div>
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-primary-400" />
            <span className="text-xs text-dark-400">Respostas</span>
          </div>
          <p className="text-2xl font-bold text-primary-400">{metrics?.replyRate || 0}%</p>
          <p className="text-xs text-dark-500">{formatNumber(campaign.total_replied)}</p>
        </div>
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-dark-400">Falhas</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{metrics?.failureRate || 0}%</p>
          <p className="text-xs text-dark-500">{formatNumber(campaign.total_failed)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Template Preview */}
          {campaign.template && (
            <div className="p-6 bg-dark-800/50 border border-dark-700/50 rounded-2xl">
              <h3 className="font-semibold text-white mb-4">Preview da Mensagem</h3>
              <div className="bg-dark-900 border border-dark-700/50 rounded-xl p-4 max-w-sm">
                <p className="text-sm text-dark-100 whitespace-pre-wrap">{campaign.template.body_text}</p>
                {campaign.template.buttons?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {campaign.template.buttons.map((btn: any, i: number) => (
                      <button key={i} className="w-full py-2 bg-dark-700 text-primary-400 text-sm rounded-lg">
                        {btn.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="p-6 bg-dark-800/50 border border-dark-700/50 rounded-2xl">
            <h3 className="font-semibold text-white mb-4">Histórico</h3>
            <div className="space-y-4">
              {logs.length > 0 ? logs.slice(0, 10).map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className={`w-2 h-2 mt-2 rounded-full ${
                    log.log_type === 'success' ? 'bg-green-500' :
                    log.log_type === 'error' ? 'bg-red-500' :
                    log.log_type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm text-white">{log.message}</p>
                    <p className="text-xs text-dark-500">{formatDate(log.created_at)}</p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-dark-400">Nenhum log registrado</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Info */}
        <div className="space-y-6">
          {/* Campaign Info */}
          <div className="p-6 bg-dark-800/50 border border-dark-700/50 rounded-2xl">
            <h3 className="font-semibold text-white mb-4">Informações</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-dark-500 mb-1">Tipo</p>
                <p className="text-sm text-white capitalize">{campaign.type}</p>
              </div>
              <div>
                <p className="text-xs text-dark-500 mb-1">Audiência</p>
                <p className="text-sm text-white capitalize">{campaign.audience_type === 'all' ? 'Todos os contatos' : campaign.audience_type}</p>
                {campaign.audience_tags && campaign.audience_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {campaign.audience_tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-dark-700 text-dark-300 text-xs rounded">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              {campaign.scheduled_at && (
                <div>
                  <p className="text-xs text-dark-500 mb-1">Agendada para</p>
                  <p className="text-sm text-white">{formatDate(campaign.scheduled_at)}</p>
                </div>
              )}
              {campaign.started_at && (
                <div>
                  <p className="text-xs text-dark-500 mb-1">Iniciada em</p>
                  <p className="text-sm text-white">{formatDate(campaign.started_at)}</p>
                </div>
              )}
              {campaign.completed_at && (
                <div>
                  <p className="text-xs text-dark-500 mb-1">Concluída em</p>
                  <p className="text-sm text-white">{formatDate(campaign.completed_at)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Revenue Attribution */}
          {(campaign.attributed_revenue > 0 || campaign.attributed_orders > 0) && (
            <div className="p-6 bg-gradient-to-br from-green-500/10 to-primary-500/10 border border-green-500/20 rounded-2xl">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Receita Atribuída
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-3xl font-bold text-green-400">{formatCurrency(campaign.attributed_revenue)}</p>
                  <p className="text-xs text-dark-400">{campaign.attributed_orders} pedidos</p>
                </div>
                <div>
                  <p className="text-xs text-dark-500 mb-1">ROI</p>
                  <p className="text-lg font-semibold text-white">
                    {campaign.total_cost > 0 ? ((campaign.attributed_revenue / campaign.total_cost - 1) * 100).toFixed(0) : 0}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cost */}
          <div className="p-6 bg-dark-800/50 border border-dark-700/50 rounded-2xl">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-dark-400" />
              Custo
            </h3>
            <p className="text-2xl font-bold text-white">{formatCurrency(campaign.total_cost)}</p>
            <p className="text-xs text-dark-500 mt-1">R$ 0,05 por mensagem</p>
          </div>
        </div>
      </div>
    </div>
  )
}
