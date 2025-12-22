'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Grid3X3,
  List,
  Filter,
  Check,
  X,
  ExternalLink,
  Settings,
  Trash2,
  Play,
  Pause,
  AlertCircle,
  Zap,
  ShoppingCart,
  MessageSquare,
  FileText,
  Table,
  Mail,
  CreditCard,
  Calendar,
  Puzzle,
  ChevronRight,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import WhatsAppIntegrationCard from '@/components/whatsapp/WhatsAppIntegrationCard'

// Types
interface IntegrationCategory {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  sort_order: number
}

interface Integration {
  id: string
  slug: string
  name: string
  short_description: string
  description: string
  category_id: string
  icon_url: string
  color: string
  auth_type: 'oauth2' | 'api_key' | 'webhook' | 'none'
  is_featured: boolean
  is_premium: boolean
  is_builtin: boolean
  is_active: boolean
  supported_webhooks: string[]
  category?: IntegrationCategory
}

interface InstalledIntegration {
  id: string
  integration_id: string
  status: 'pending' | 'configuring' | 'active' | 'paused' | 'error' | 'disconnected'
  configuration: any
  default_pipeline_id: string | null
  auto_tags: string[]
  last_sync_at: string | null
  error_count: number
  last_error_message: string | null
}

// Icon mapping
const categoryIcons: Record<string, any> = {
  ecommerce: ShoppingCart,
  communication: MessageSquare,
  forms: FileText,
  spreadsheets: Table,
  marketing: Mail,
  payments: CreditCard,
  productivity: Calendar,
  others: Puzzle,
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Ativo' },
    paused: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Pausado' },
    error: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Erro' },
    configuring: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Configurando' },
    pending: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'Pendente' },
    disconnected: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'Desconectado' },
  }

  const config = statusConfig[status] || statusConfig.pending

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${config.color}`}>
      {config.label}
    </span>
  )
}

// Integration Card Component
function IntegrationCard({
  integration,
  installed,
  onInstall,
  onConfigure,
  onUninstall,
  onToggle,
}: {
  integration: Integration
  installed?: InstalledIntegration
  onInstall: () => void
  onConfigure: () => void
  onUninstall: () => void
  onToggle: () => void
}) {
  const isInstalled = !!installed

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative bg-dark-800/50 border rounded-2xl p-5 transition-all duration-200 group
        ${isInstalled 
          ? 'border-primary-500/30 hover:border-primary-500/50' 
          : 'border-dark-700/50 hover:border-dark-600'
        }
      `}
    >
      {/* Featured badge */}
      {integration.is_featured && !isInstalled && (
        <div className="absolute -top-2 -right-2">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-[10px] font-bold text-white shadow-lg">
            <Sparkles className="w-3 h-3" />
            Popular
          </span>
        </div>
      )}

      {/* Builtin badge */}
      {integration.is_builtin && (
        <div className="absolute -top-2 -left-2">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-[10px] font-bold text-white shadow-lg">
            <Zap className="w-3 h-3" />
            Nativo
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${integration.color}20` }}
        >
          {integration.icon_url ? (
            <img
              src={integration.icon_url}
              alt={integration.name}
              className="w-8 h-8 object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.parentElement!.innerHTML = `<span style="color: ${integration.color}" class="text-2xl font-bold">${integration.name[0]}</span>`
              }}
            />
          ) : (
            <span style={{ color: integration.color }} className="text-2xl font-bold">
              {integration.name[0]}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">{integration.name}</h3>
            {isInstalled && <StatusBadge status={installed.status} />}
          </div>
          <p className="text-sm text-dark-400 line-clamp-2">
            {integration.short_description}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {isInstalled ? (
          <>
            <button
              onClick={onConfigure}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-dark-700/50 hover:bg-dark-700 rounded-xl text-sm text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              Configurar
            </button>
            <button
              onClick={onToggle}
              className={`p-2 rounded-xl transition-colors ${
                installed.status === 'active'
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              }`}
              title={installed.status === 'active' ? 'Pausar' : 'Ativar'}
            >
              {installed.status === 'active' ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onUninstall}
              className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Desinstalar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={onInstall}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-sm font-medium text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Instalar
          </button>
        )}
      </div>

      {/* Error indicator */}
      {installed?.status === 'error' && installed.last_error_message && (
        <div className="mt-3 flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 line-clamp-2">{installed.last_error_message}</p>
        </div>
      )}
    </motion.div>
  )
}

// Main Page Component
export default function IntegrationsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [categories, setCategories] = useState<IntegrationCategory[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [installedMap, setInstalledMap] = useState<Record<string, InstalledIntegration>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showInstalled, setShowInstalled] = useState(false)

  // Modal states
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)

  // Fetch data
  useEffect(() => {
    fetchData()
  }, [user?.organization_id])

  const fetchData = async () => {
    if (!user?.organization_id) return

    setLoading(true)
    try {
      const [categoriesRes, integrationsRes, installedRes] = await Promise.all([
        fetch('/api/integrations/categories'),
        fetch('/api/integrations'),
        fetch(`/api/integrations/installed?organizationId=${user.organization_id}`),
      ])

      const categoriesData = await categoriesRes.json()
      const integrationsData = await integrationsRes.json()
      const installedData = await installedRes.json()

      setCategories(categoriesData.categories || [])
      setIntegrations(integrationsData.integrations || [])

      // Create installed map
      const map: Record<string, InstalledIntegration> = {}
      ;(installedData.installed || []).forEach((inst: InstalledIntegration) => {
        map[inst.integration_id] = inst
      })
      setInstalledMap(map)
    } catch (error) {
      console.error('Error fetching integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter integrations
  const filteredIntegrations = integrations.filter((int) => {
    // Excluir WhatsApp da lista (já tem card nativo na seção Mensagens da página /integrations)
    // Ao clicar em qualquer WhatsApp, redireciona para /integrations/whatsapp
    const slug = int.slug?.toLowerCase() || '';
    const name = int.name?.toLowerCase() || '';
    if (slug.includes('whatsapp') || name.includes('whatsapp')) {
      return false
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      if (
        !int.name.toLowerCase().includes(searchLower) &&
        !int.short_description.toLowerCase().includes(searchLower)
      ) {
        return false
      }
    }

    // Category filter
    if (selectedCategory && int.category_id !== selectedCategory) {
      return false
    }

    // Installed filter
    if (showInstalled && !installedMap[int.id]) {
      return false
    }

    return true
  })

  // Sort: featured and builtin first, then installed, then alphabetical
  const sortedIntegrations = [...filteredIntegrations].sort((a, b) => {
    // Builtin first
    if (a.is_builtin && !b.is_builtin) return -1
    if (!a.is_builtin && b.is_builtin) return 1

    // Featured second
    if (a.is_featured && !b.is_featured) return -1
    if (!a.is_featured && b.is_featured) return 1

    // Installed third
    const aInstalled = !!installedMap[a.id]
    const bInstalled = !!installedMap[b.id]
    if (aInstalled && !bInstalled) return -1
    if (!aInstalled && bInstalled) return 1

    // Alphabetical
    return a.name.localeCompare(b.name)
  })

  // Handlers
  const handleInstall = async (integration: Integration) => {
    // Redirecionar para página de configuração específica
    router.push(`/integrations/${integration.slug}`)
  }

  const handleConfigure = (integration: Integration) => {
    // Redirecionar para página de configuração específica
    router.push(`/integrations/${integration.slug}`)
  }

  const handleUninstall = async (integration: Integration) => {
    if (!confirm(`Tem certeza que deseja desinstalar ${integration.name}?`)) return

    try {
      await fetch(`/api/integrations/installed/${installedMap[integration.id].id}`, {
        method: 'DELETE',
      })
      await fetchData()
    } catch (error) {
      console.error('Error uninstalling:', error)
    }
  }

  const handleToggle = async (integration: Integration) => {
    const installed = installedMap[integration.id]
    if (!installed) return

    const newStatus = installed.status === 'active' ? 'paused' : 'active'

    try {
      await fetch(`/api/integrations/installed/${installed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      await fetchData()
    } catch (error) {
      console.error('Error toggling:', error)
    }
  }

  // Stats
  const installedCount = Object.keys(installedMap).length
  const activeCount = Object.values(installedMap).filter((i) => i.status === 'active').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Integrações</h1>
          <p className="text-dark-400 mt-1">
            Conecte suas ferramentas favoritas para capturar leads automaticamente
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-dark-300">
              <span className="font-semibold text-white">{activeCount}</span> ativas
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 rounded-xl">
            <Puzzle className="w-4 h-4 text-dark-400" />
            <span className="text-sm text-dark-300">
              <span className="font-semibold text-white">{installedCount}</span> instaladas
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar integrações..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              !selectedCategory
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800/50 text-dark-300 hover:text-white'
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => {
            const Icon = categoryIcons[cat.slug] || Puzzle
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-800/50 text-dark-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cat.name}
              </button>
            )
          })}
        </div>

        {/* View Toggle & Installed Filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInstalled(!showInstalled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              showInstalled
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-dark-800/50 text-dark-300 hover:text-white'
            }`}
          >
            <Check className="w-4 h-4" />
            Instaladas
          </button>

          <div className="flex items-center bg-dark-800/50 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Native Integrations - WhatsApp */}
      {!search && !selectedCategory && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Mensagens</h2>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
              Nativo
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user?.organization_id ? (
              <WhatsAppIntegrationCard organizationId={user.organization_id} />
            ) : (
              <div className="p-6 bg-dark-800 border border-dark-700 rounded-xl animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-dark-700 rounded-xl"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-dark-700 rounded w-32 mb-2"></div>
                    <div className="h-4 bg-dark-700 rounded w-48"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other Integrations Header */}
      {!search && !selectedCategory && sortedIntegrations.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Puzzle className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Outras Integrações</h2>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Grid */}
          {sortedIntegrations.length > 0 ? (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'space-y-3'
              }
            >
              {sortedIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  installed={installedMap[integration.id]}
                  onInstall={() => handleInstall(integration)}
                  onConfigure={() => handleConfigure(integration)}
                  onUninstall={() => handleUninstall(integration)}
                  onToggle={() => handleToggle(integration)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Puzzle className="w-12 h-12 mx-auto mb-4 text-dark-600" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Nenhuma integração encontrada
              </h3>
              <p className="text-dark-400">
                Tente ajustar os filtros ou busque por outro termo
              </p>
            </div>
          )}
        </>
      )}

      {/* Install Modal */}
      <AnimatePresence>
        {showInstallModal && selectedIntegration && (
          <IntegrationInstallModal
            integration={selectedIntegration}
            onClose={() => {
              setShowInstallModal(false)
              setSelectedIntegration(null)
            }}
            onSuccess={() => {
              setShowInstallModal(false)
              setSelectedIntegration(null)
              fetchData()
            }}
          />
        )}
      </AnimatePresence>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfigModal && selectedIntegration && installedMap[selectedIntegration.id] && (
          <IntegrationConfigModal
            integration={selectedIntegration}
            installed={installedMap[selectedIntegration.id]}
            onClose={() => {
              setShowConfigModal(false)
              setSelectedIntegration(null)
            }}
            onSuccess={() => {
              setShowConfigModal(false)
              setSelectedIntegration(null)
              fetchData()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Install Modal Component
function IntegrationInstallModal({
  integration,
  onClose,
  onSuccess,
}: {
  integration: Integration
  onClose: () => void
  onSuccess: () => void
}) {
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [pipelines, setPipelines] = useState<any[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [autoTags, setAutoTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    fetchPipelines()
  }, [])

  const fetchPipelines = async () => {
    if (!user?.organization_id) return
    try {
      const res = await fetch(`/api/deals?type=pipelines&organizationId=${user.organization_id}`)
      const data = await res.json()
      setPipelines(data.pipelines || [])
      if (data.pipelines?.length > 0) {
        setSelectedPipeline(data.pipelines[0].id)
        if (data.pipelines[0].stages?.length > 0) {
          setSelectedStage(data.pipelines[0].stages[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching pipelines:', error)
    }
  }

  const handleInstall = async () => {
    if (!user?.organization_id) return

    setLoading(true)
    try {
      const response = await fetch('/api/integrations/installed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
          integrationId: integration.id,
          defaultPipelineId: selectedPipeline || null,
          defaultStageId: selectedStage || null,
          autoTags,
        }),
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        alert(`Erro ao instalar: ${error.error}`)
      }
    } catch (error) {
      console.error('Error installing:', error)
      alert('Erro ao instalar integração')
    } finally {
      setLoading(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !autoTags.includes(newTag.trim())) {
      setAutoTags([...autoTags, newTag.trim()])
      setNewTag('')
    }
  }

  const selectedPipelineData = pipelines.find((p) => p.id === selectedPipeline)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-dark-700">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${integration.color}20` }}
            >
              {integration.icon_url ? (
                <img src={integration.icon_url} alt="" className="w-8 h-8" />
              ) : (
                <span style={{ color: integration.color }} className="text-2xl font-bold">
                  {integration.name[0]}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Instalar {integration.name}</h2>
              <p className="text-dark-400 text-sm">{integration.short_description}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Pipeline Selection */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Pipeline padrão para novos leads
            </label>
            <select
              value={selectedPipeline}
              onChange={(e) => {
                setSelectedPipeline(e.target.value)
                const pipeline = pipelines.find((p) => p.id === e.target.value)
                if (pipeline?.stages?.length > 0) {
                  setSelectedStage(pipeline.stages[0].id)
                }
              }}
              className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stage Selection */}
          {selectedPipelineData?.stages?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Estágio inicial
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedPipelineData.stages.map((stage: any) => (
                  <button
                    key={stage.id}
                    onClick={() => setSelectedStage(stage.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedStage === stage.id
                        ? 'text-white'
                        : 'bg-dark-800 text-dark-400 hover:text-white'
                    }`}
                    style={
                      selectedStage === stage.id
                        ? { backgroundColor: stage.color || '#6366f1' }
                        : {}
                    }
                  >
                    {stage.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Auto Tags */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Tags automáticas (opcional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                placeholder="Digite uma tag..."
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={addTag}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {autoTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {autoTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-primary-500/20 text-primary-400 rounded-lg text-sm"
                  >
                    {tag}
                    <button onClick={() => setAutoTags(autoTags.filter((t) => t !== tag))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-dark-500 mt-2">
              Estas tags serão adicionadas automaticamente a todos os leads capturados por esta integração
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleInstall}
            disabled={loading || !selectedPipeline}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Instalando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Instalar
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Config Modal Component (simplified)
function IntegrationConfigModal({
  integration,
  installed,
  onClose,
  onSuccess,
}: {
  integration: Integration
  installed: InstalledIntegration
  onClose: () => void
  onSuccess: () => void
}) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [pipelines, setPipelines] = useState<any[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState(installed.default_pipeline_id || '')
  const [autoTags, setAutoTags] = useState<string[]>(installed.auto_tags || [])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    fetchPipelines()
  }, [])

  const fetchPipelines = async () => {
    if (!user?.organization_id) return
    try {
      const res = await fetch(`/api/deals?type=pipelines&organizationId=${user.organization_id}`)
      const data = await res.json()
      setPipelines(data.pipelines || [])
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/integrations/installed/${installed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultPipelineId: selectedPipeline || null,
          autoTags,
        }),
      })

      if (response.ok) {
        onSuccess()
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-dark-700">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${integration.color}20` }}
            >
              {integration.icon_url ? (
                <img src={integration.icon_url} alt="" className="w-7 h-7" />
              ) : (
                <span style={{ color: integration.color }} className="text-xl font-bold">
                  {integration.name[0]}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Configurar {integration.name}</h2>
              <StatusBadge status={installed.status} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              URL do Webhook
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/api/webhooks/${installed.id}`}
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-dark-400 text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/${installed.id}`)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-dark-500 mt-2">
              Configure esta URL nas configurações de webhook do {integration.name}
            </p>
          </div>

          {/* Pipeline */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Pipeline padrão
            </label>
            <select
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Tags automáticas
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    setAutoTags([...autoTags, newTag.trim()])
                    setNewTag('')
                  }
                }}
                placeholder="Nova tag..."
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
            {autoTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {autoTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-primary-500/20 text-primary-400 rounded-lg text-sm"
                  >
                    {tag}
                    <button onClick={() => setAutoTags(autoTags.filter((t) => t !== tag))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          {installed.last_sync_at && (
            <div className="p-4 bg-dark-800/50 rounded-xl">
              <p className="text-sm text-dark-400">
                Última sincronização:{' '}
                <span className="text-white">
                  {new Date(installed.last_sync_at).toLocaleString('pt-BR')}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Salvar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
