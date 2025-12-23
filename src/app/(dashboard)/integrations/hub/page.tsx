'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  ShoppingCart,
  MessageSquare,
  ExternalLink,
  Settings,
  ChevronRight,
  Zap,
  TrendingUp,
  AlertCircle,
  Wifi,
  WifiOff,
  History,
  Play,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// Types
interface IntegrationHealth {
  integration_type: string
  integration_id: string
  organization_id: string
  name: string | null
  identifier: string
  is_active: boolean
  connection_status: string
  status_message: string | null
  health_checked_at: string | null
  consecutive_failures: number
  last_sync_at: string | null
  health_status: string
}

interface HealthLog {
  id: string
  integration_type: string
  integration_name: string
  status: 'success' | 'warning' | 'error'
  status_code: string | null
  message: string | null
  response_time_ms: number | null
  checked_at: string
}

interface CheckResult {
  success: boolean
  status: string
  statusCode: string
  message: string
  responseTimeMs: number
}

// Status configurations
const statusConfig = {
  healthy: {
    color: 'emerald',
    bgClass: 'bg-emerald-500/10 border-emerald-500/30',
    textClass: 'text-emerald-400',
    icon: CheckCircle2,
    label: 'Saudável',
  },
  degraded: {
    color: 'amber',
    bgClass: 'bg-amber-500/10 border-amber-500/30',
    textClass: 'text-amber-400',
    icon: AlertTriangle,
    label: 'Atenção',
  },
  unhealthy: {
    color: 'red',
    bgClass: 'bg-red-500/10 border-red-500/30',
    textClass: 'text-red-400',
    icon: XCircle,
    label: 'Problema',
  },
  disconnected: {
    color: 'gray',
    bgClass: 'bg-gray-500/10 border-gray-500/30',
    textClass: 'text-gray-400',
    icon: WifiOff,
    label: 'Desconectado',
  },
  unknown: {
    color: 'gray',
    bgClass: 'bg-gray-500/10 border-gray-500/30',
    textClass: 'text-gray-400',
    icon: AlertCircle,
    label: 'Desconhecido',
  },
}

const integrationIcons: Record<string, any> = {
  shopify: ShoppingCart,
  whatsapp: MessageSquare,
}

const integrationLabels: Record<string, string> = {
  shopify: 'Shopify',
  whatsapp: 'WhatsApp Business',
}

// Helper functions
function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca'
  
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return 'Agora'
  if (diffMins < 60) return `${diffMins}min atrás`
  
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h atrás`
  
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d atrás`
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Components
function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown
  const Icon = config.icon
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.bgClass}`}>
      <Icon className={`w-3.5 h-3.5 ${config.textClass}`} />
      <span className={`text-xs font-medium ${config.textClass}`}>{config.label}</span>
    </div>
  )
}

function IntegrationCard({
  integration,
  onCheck,
  isChecking,
}: {
  integration: IntegrationHealth
  onCheck: () => void | Promise<void>
  isChecking: boolean
}) {
  const Icon = integrationIcons[integration.integration_type] || Zap
  const config = statusConfig[integration.health_status as keyof typeof statusConfig] || statusConfig.unknown
  const label = integrationLabels[integration.integration_type] || integration.integration_type
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border ${config.bgClass} bg-[#1a1a2e]/50 backdrop-blur-sm`}
    >
      {/* Glow effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-${config.color}-500/10 blur-3xl rounded-full`} />
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg bg-${config.color}-500/20`}>
              <Icon className={`w-5 h-5 ${config.textClass}`} />
            </div>
            <div>
              <h3 className="font-semibold text-white">{label}</h3>
              <p className="text-sm text-gray-400">{integration.name || integration.identifier}</p>
            </div>
          </div>
          <StatusBadge status={integration.health_status} />
        </div>
        
        {/* Details */}
        <div className="space-y-2 mb-4">
          {integration.identifier && (
            <div className="flex items-center gap-2 text-sm">
              <Wifi className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">{integration.identifier}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">
              Verificado: {formatTimeAgo(integration.health_checked_at)}
            </span>
          </div>
          
          {integration.status_message && integration.health_status !== 'healthy' && (
            <div className={`mt-2 p-2 rounded-lg bg-${config.color}-500/10 border border-${config.color}-500/20`}>
              <p className={`text-xs ${config.textClass}`}>{integration.status_message}</p>
            </div>
          )}
          
          {integration.consecutive_failures > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-amber-400">
                {integration.consecutive_failures} falha{integration.consecutive_failures > 1 ? 's' : ''} consecutiva{integration.consecutive_failures > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onCheck}
            disabled={isChecking}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg 
              bg-${config.color}-500/20 hover:bg-${config.color}-500/30 
              border border-${config.color}-500/30 
              text-${config.color}-400 text-sm font-medium
              transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Verificar Agora
              </>
            )}
          </button>
          
          <a
            href={`/settings/integrations/${integration.integration_type}`}
            className="p-2 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/20 text-gray-400 transition-all"
          >
            <Settings className="w-4 h-4" />
          </a>
        </div>
      </div>
    </motion.div>
  )
}

function HealthLogItem({ log }: { log: HealthLog }) {
  const statusIcons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
  }
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
  }
  
  const Icon = statusIcons[log.status] || AlertCircle
  const colorClass = statusColors[log.status] || 'text-gray-400'
  const IntIcon = integrationIcons[log.integration_type] || Zap
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
      <div className={`p-1.5 rounded-lg bg-gray-700/50`}>
        <IntIcon className="w-4 h-4 text-gray-400" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">
            {integrationLabels[log.integration_type] || log.integration_type}
          </span>
          {log.integration_name && (
            <span className="text-xs text-gray-500">({log.integration_name})</span>
          )}
        </div>
        {log.message && (
          <p className="text-xs text-gray-400 truncate">{log.message}</p>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {log.response_time_ms && (
          <span className="text-xs text-gray-500">{log.response_time_ms}ms</span>
        )}
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {formatDateTime(log.checked_at)}
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 rounded-full bg-gray-800/50 mb-4">
        <Zap className="w-8 h-8 text-gray-500" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">Nenhuma integração conectada</h3>
      <p className="text-gray-400 mb-4 max-w-md">
        Conecte integrações como Shopify ou WhatsApp para monitorar a saúde das conexões.
      </p>
      <a
        href="/integrations"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
      >
        Ver Integrações
        <ChevronRight className="w-4 h-4" />
      </a>
    </div>
  )
}

// Main Component
export default function IntegrationHubPage() {
  const { user } = useAuthStore()
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingAll, setIsCheckingAll] = useState(false)
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  
  const organizationId = user?.organization_id
  
  // Fetch integrations status
  const fetchIntegrations = useCallback(async () => {
    if (!organizationId) return
    
    try {
      const res = await fetch(`/api/integrations/health?organizationId=${organizationId}`)
      const data = await res.json()
      
      if (data.integrations) {
        setIntegrations(data.integrations)
      }
    } catch (error) {
      console.error('Error fetching integrations:', error)
    }
  }, [organizationId])
  
  // Fetch health logs
  const fetchLogs = useCallback(async () => {
    if (!organizationId) return
    
    try {
      const res = await fetch(`/api/integrations/health/logs?organizationId=${organizationId}&limit=10`)
      const data = await res.json()
      
      if (data.logs) {
        setHealthLogs(data.logs)
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
    }
  }, [organizationId])
  
  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchIntegrations(), fetchLogs()])
      setIsLoading(false)
      setLastRefresh(new Date())
    }
    
    if (organizationId) {
      loadData()
    }
  }, [organizationId, fetchIntegrations, fetchLogs])
  
  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIntegrations()
      fetchLogs()
      setLastRefresh(new Date())
    }, 60000)
    
    return () => clearInterval(interval)
  }, [fetchIntegrations, fetchLogs])
  
  // Check single integration
  const handleCheckIntegration = async (type: string, id: string) => {
    setCheckingIds((prev: Set<string>) => new Set(prev).add(id))
    
    try {
      const res = await fetch('/api/integrations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, integrationId: id }),
      })
      
      const result: CheckResult = await res.json()
      
      // Refresh data
      await Promise.all([fetchIntegrations(), fetchLogs()])
      setLastRefresh(new Date())
      
    } catch (error) {
      console.error('Error checking integration:', error)
    } finally {
      setCheckingIds((prev: Set<string>) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }
  
  // Check all integrations
  const handleCheckAll = async () => {
    if (!organizationId) return
    
    setIsCheckingAll(true)
    
    try {
      await fetch('/api/integrations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkAll: true, organizationId }),
      })
      
      // Refresh data
      await Promise.all([fetchIntegrations(), fetchLogs()])
      setLastRefresh(new Date())
      
    } catch (error) {
      console.error('Error checking all:', error)
    } finally {
      setIsCheckingAll(false)
    }
  }
  
  // Stats
  const healthyCount = integrations.filter((i: IntegrationHealth) => i.health_status === 'healthy').length
  const warningCount = integrations.filter((i: IntegrationHealth) => i.health_status === 'degraded').length
  const errorCount = integrations.filter((i: IntegrationHealth) => i.health_status === 'unhealthy').length
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <span className="text-gray-400">Carregando...</span>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-[#0f0f1a] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Hub de Integrações</h1>
            <p className="text-gray-400">
              Monitore a saúde das suas conexões em tempo real
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Atualizado: {formatTimeAgo(lastRefresh.toISOString())}
            </span>
            <button
              onClick={handleCheckAll}
              disabled={isCheckingAll || integrations.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingAll ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Verificar Todas
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Stats Overview */}
        {integrations.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{healthyCount}</p>
                  <p className="text-sm text-emerald-400/70">Saudáveis</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-400">{warningCount}</p>
                  <p className="text-sm text-amber-400/70">Com Atenção</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <XCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{errorCount}</p>
                  <p className="text-sm text-red-400/70">Com Problemas</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Integrations Grid */}
        {integrations.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              <AnimatePresence mode="popLayout">
                {integrations.map((integration: IntegrationHealth) => (
                  <IntegrationCard
                    key={integration.integration_id}
                    integration={integration}
                    onCheck={() => handleCheckIntegration(
                      integration.integration_type,
                      integration.integration_id
                    )}
                    isChecking={checkingIds.has(integration.integration_id)}
                  />
                ))}
              </AnimatePresence>
            </div>
            
            {/* Health Logs */}
            <div className="rounded-xl border border-gray-800 bg-[#1a1a2e]/50 backdrop-blur-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-gray-400" />
                  <h2 className="font-semibold text-white">Histórico de Verificações</h2>
                </div>
                <span className="text-xs text-gray-500">Últimas 10 verificações</span>
              </div>
              
              <div className="p-2 space-y-1 max-h-96 overflow-y-auto">
                {healthLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-gray-500">
                    <p>Nenhuma verificação registrada ainda</p>
                  </div>
                ) : (
                  healthLogs.map((log: HealthLog) => (
                    <HealthLogItem key={log.id} log={log} />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
