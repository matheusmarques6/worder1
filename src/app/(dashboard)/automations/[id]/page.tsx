'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Lightning,
  Play,
  Pause,
  PencilSimple,
  Copy,
  Trash,
  Export,
  CheckCircle,
  XCircle,
  Clock,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  ShoppingCartSimple,
  UsersThree,
  CurrencyDollar,
  TrendUp,
  Eye,
  CursorClick,
  Timer,
  ArrowsSplit,
  FunnelSimple,
  ChatCircle,
  Warning,
  ChartLineUp,
  CalendarBlank,
  SpinnerGap,
} from '@phosphor-icons/react'
import { createBrowserClient } from '@/lib/supabase'

interface AutomationData {
  id: string
  name: string
  description: string | null
  status: string
  trigger: Record<string, any>
  nodes: Record<string, any>[]
  edges: Record<string, any>[]
  created_at: string
  updated_at: string
}

const statusConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', dotColor: 'bg-emerald-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-gray-500', dotColor: 'bg-zinc-400' },
  paused: { label: 'Pausado', color: 'bg-yellow-500/10 text-yellow-400', dotColor: 'bg-yellow-400' },
}

export default function AutomationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [automation, setAutomation] = useState<AutomationData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAutomation = useCallback(async () => {
    if (!params.id) return
    try {
      setLoading(true)
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) {
        console.error('Error fetching automation:', error.message)
        setAutomation(null)
        return
      }
      setAutomation(data)
    } catch (err) {
      console.error('Failed to fetch automation:', err)
      setAutomation(null)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchAutomation()
  }, [fetchAutomation])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <SpinnerGap className="w-8 h-8 text-[#F26B2A] animate-spin" />
      </div>
    )
  }

  if (!automation) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <Lightning className="w-16 h-16 text-gray-600 mb-4" weight="duotone" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Automação não encontrada</h3>
        <p className="text-sm text-gray-500 mb-4">A automação solicitada não existe ou foi removida.</p>
        <button
          onClick={() => router.push('/automations')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-sm"
        >
          <ArrowLeft size={16} />
          Voltar para Automações
        </button>
      </div>
    )
  }

  const status = statusConfig[automation.status] || statusConfig.draft
  const triggerLabel = automation.trigger?.type || automation.trigger?.name || 'Trigger'
  const nodes = automation.nodes || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/automations')}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <Lightning size={20} className="text-[#F26B2A]" weight="fill" />
              <h1 className="text-2xl font-bold font-display text-gray-900">{automation.name}</h1>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${status.dotColor} animate-pulse`} />
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
              </div>
            </div>
            {automation.description && (
              <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">{automation.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs">
            <PencilSimple size={14} />
            Editar Fluxo
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs">
            <Copy size={14} />
            Duplicar
          </button>
          {automation.status === 'active' ? (
            <button className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 text-xs font-medium">
              <Pause size={14} weight="fill" />
              Pausar
            </button>
          ) : (
            <button className="flex items-center gap-2 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg hover:opacity-90 text-xs font-medium">
              <Play size={14} weight="fill" />
              Ativar
            </button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Status</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{status.label}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-500/10">
              <Lightning size={20} className="text-[#F26B2A]" weight="duotone" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Trigger</p>
              <p className="text-lg font-bold text-gray-900 mt-1 truncate">{triggerLabel}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-yellow-500/10">
              <ShoppingCartSimple size={20} className="text-yellow-400" weight="duotone" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Etapas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{nodes.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10">
              <ArrowsSplit size={20} className="text-blue-400" weight="duotone" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">Última edição</p>
              <p className="text-lg font-bold text-gray-900 mt-1">{new Date(automation.updated_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10">
              <CalendarBlank size={20} className="text-emerald-400" weight="duotone" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Flow Steps */}
      {nodes.length > 0 && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Etapas do Fluxo</h3>
              <p className="text-xs text-gray-500 mt-0.5">Nós configurados nesta automação</p>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg hover:text-white text-xs">
              <PencilSimple size={12} />
              Editar Fluxo
            </button>
          </div>
          <div className="space-y-1">
            {nodes.map((node: any, i: number) => {
              const nodeType = node.type || node.data?.type || 'step'
              const nodeName = node.data?.label || node.data?.name || node.label || node.name || `Etapa ${i + 1}`
              const nodeDesc = node.data?.description || node.data?.desc || ''

              return (
                <div key={node.id || i}>
                  <div className="flex items-center gap-4 p-4 bg-gray-50/30 rounded-xl hover:bg-gray-50/50 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-zinc-500/10 flex items-center justify-center flex-shrink-0">
                      <Lightning size={20} className="text-gray-500" weight="fill" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono">#{i + 1}</span>
                        <p className="text-sm text-gray-700 font-medium">{nodeName}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 font-medium">
                          {nodeType}
                        </span>
                      </div>
                      {nodeDesc && <p className="text-xs text-gray-500 mt-0.5">{nodeDesc}</p>}
                    </div>
                  </div>
                  {i < nodes.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className="w-px h-4 bg-gray-100" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Automation Info */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Informações</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Trigger</p>
              <p className="text-sm text-gray-700 mt-0.5">{triggerLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Etapas</p>
              <p className="text-sm text-gray-700 mt-0.5">{nodes.length} etapas</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Criada em</p>
              <p className="text-sm text-gray-700 mt-0.5">{new Date(automation.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Última edição</p>
              <p className="text-sm text-gray-700 mt-0.5">{new Date(automation.updated_at).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div className="w-full h-px bg-gray-50" />
          <div>
            <p className="text-xs text-gray-500">ID da Automação</p>
            <p className="text-sm text-gray-500 font-mono mt-0.5">{params.id}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
