'use client'

// =============================================
// Automation Logs Modal
// src/components/crm/automations/AutomationLogsModal.tsx
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ShoppingCart,
  MessageCircle,
  Flame,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  Search,
  ShoppingBag,
  Link,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// =============================================
// TYPES
// =============================================

interface AutomationLog {
  id: string
  status: 'success' | 'error' | 'skipped'
  source_type: string
  event_type: string
  rule_name?: string
  message: string
  error_message?: string
  created_at: string
  deal_id?: string
  contact_id?: string
  metadata?: Record<string, any>
}

interface AutomationLogsModalProps {
  isOpen: boolean
  onClose: () => void
}

// =============================================
// CONSTANTS
// =============================================

const SOURCE_ICONS: Record<string, any> = {
  shopify: ShoppingCart,
  whatsapp: MessageCircle,
  hotmart: Flame,
  woocommerce: ShoppingBag,
  webhook: Link,
}

const SOURCE_NAMES: Record<string, string> = {
  shopify: 'Shopify',
  whatsapp: 'WhatsApp',
  hotmart: 'Hotmart',
  woocommerce: 'WooCommerce',
  webhook: 'Webhook',
}

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    label: 'Sucesso',
  },
  error: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Erro',
  },
  skipped: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    label: 'Ignorado',
  },
}

// =============================================
// MAIN COMPONENT
// =============================================

export function AutomationLogsModal({ isOpen, onClose }: AutomationLogsModalProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // State
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState<string>('7')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Expanded log
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchLogs = useCallback(async (reset = false) => {
    if (!organizationId) return

    const currentPage = reset ? 1 : page
    if (reset) {
      setPage(1)
      setLogs([])
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        organizationId,
        page: currentPage.toString(),
        limit: '50',
      })

      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (sourceFilter !== 'all') params.append('source', sourceFilter)
      if (periodFilter !== 'all') params.append('days', periodFilter)
      if (searchQuery) params.append('search', searchQuery)

      const res = await fetch(`/api/automations/logs?${params}`)
      const data = await res.json()

      if (data.logs) {
        if (reset) {
          setLogs(data.logs)
        } else {
          setLogs(prev => [...prev, ...data.logs])
        }
        setHasMore(data.logs.length === 50)
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId, page, statusFilter, sourceFilter, periodFilter, searchQuery])

  useEffect(() => {
    if (isOpen) {
      fetchLogs(true)
    }
  }, [isOpen, statusFilter, sourceFilter, periodFilter])

  const handleSearch = () => {
    fetchLogs(true)
  }

  const loadMore = () => {
    setPage(prev => prev + 1)
    fetchLogs()
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-4xl h-[80vh] bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-dark-700">
            <h2 className="text-lg font-semibold text-white">
              Logs de Automação
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-dark-700 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Buscar..."
                className="w-full pl-10 pr-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2 pr-10 bg-dark-900 border border-dark-700 rounded-lg text-white appearance-none focus:outline-none focus:border-primary-500 transition-colors"
              >
                <option value="all">Todos status</option>
                <option value="success">✓ Sucesso</option>
                <option value="error">✗ Erro</option>
                <option value="skipped">⚠ Ignorado</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
            </div>

            {/* Source Filter */}
            <div className="relative">
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="px-4 py-2 pr-10 bg-dark-900 border border-dark-700 rounded-lg text-white appearance-none focus:outline-none focus:border-primary-500 transition-colors"
              >
                <option value="all">Todas fontes</option>
                <option value="shopify">🛒 Shopify</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="hotmart">🔥 Hotmart</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
            </div>

            {/* Period Filter */}
            <div className="relative">
              <select
                value={periodFilter}
                onChange={e => setPeriodFilter(e.target.value)}
                className="px-4 py-2 pr-10 bg-dark-900 border border-dark-700 rounded-lg text-white appearance-none focus:outline-none focus:border-primary-500 transition-colors"
              >
                <option value="1">Último dia</option>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="all">Todo período</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchLogs(true)}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Logs List */}
          <div className="flex-1 overflow-y-auto">
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Zap className="w-16 h-16 text-dark-600 mb-4" />
                <p className="text-dark-400">Nenhum log encontrado</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-700/50">
                {logs.map(log => {
                  const Icon = SOURCE_ICONS[log.source_type] || Zap
                  const statusConfig = STATUS_CONFIG[log.status]
                  const StatusIcon = statusConfig.icon
                  const time = new Date(log.created_at)
                  const timeStr = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  const dateStr = time.toLocaleDateString('pt-BR')
                  const isExpanded = expandedLog === log.id

                  return (
                    <div
                      key={log.id}
                      className="hover:bg-dark-800/50 transition-colors"
                    >
                      <button
                        onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                        className="w-full flex items-start gap-4 p-4 text-left"
                      >
                        {/* Status Icon */}
                        <div className={`p-1.5 rounded-lg ${statusConfig.bg} flex-shrink-0`}>
                          <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-dark-500">{dateStr} {timeStr}</span>
                            <Icon className="w-3.5 h-3.5 text-dark-400" />
                            <span className="text-xs text-dark-400">{SOURCE_NAMES[log.source_type] || log.source_type}</span>
                            {log.rule_name && (
                              <>
                                <span className="text-dark-600">•</span>
                                <span className="text-xs text-dark-400">{log.rule_name}</span>
                              </>
                            )}
                          </div>
                          <p className={`text-sm ${log.status === 'error' ? 'text-red-400' : 'text-dark-300'}`}>
                            {log.message}
                          </p>
                          {log.error_message && (
                            <p className="text-xs text-red-400/80 mt-1">{log.error_message}</p>
                          )}
                        </div>

                        {/* Expand Icon */}
                        <ChevronDown className={`w-5 h-5 text-dark-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 ml-12">
                              <div className="p-4 bg-dark-900 rounded-lg space-y-3">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-dark-500 text-xs mb-1">Evento</p>
                                    <p className="text-white">{log.event_type}</p>
                                  </div>
                                  <div>
                                    <p className="text-dark-500 text-xs mb-1">Status</p>
                                    <p className={statusConfig.color}>{statusConfig.label}</p>
                                  </div>
                                  {log.deal_id && (
                                    <div>
                                      <p className="text-dark-500 text-xs mb-1">Deal ID</p>
                                      <a
                                        href={`/crm?deal=${log.deal_id}`}
                                        className="text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                      >
                                        {log.deal_id.slice(0, 8)}...
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  )}
                                  {log.contact_id && (
                                    <div>
                                      <p className="text-dark-500 text-xs mb-1">Contato ID</p>
                                      <a
                                        href={`/crm/contacts?id=${log.contact_id}`}
                                        className="text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                      >
                                        {log.contact_id.slice(0, 8)}...
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  )}
                                </div>

                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <p className="text-dark-500 text-xs mb-2">Dados</p>
                                    <pre className="text-xs text-dark-300 bg-dark-800 p-3 rounded overflow-x-auto">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Load More */}
            {hasMore && logs.length > 0 && (
              <div className="p-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Carregando...' : 'Carregar mais'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
