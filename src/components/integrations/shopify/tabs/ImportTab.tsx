'use client'

// =============================================
// Import Tab - V2 com Sistema de Jobs
// /src/components/integrations/shopify/tabs/ImportTab.tsx
//
// Importação em background para grandes volumes
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Tag,
  Check,
  Filter,
  X,
  Pause,
  Play,
  Clock,
} from 'lucide-react'

// =============================================
// TYPES
// =============================================

interface Pipeline {
  id: string
  name: string
  stages: {
    id: string
    name: string
    color: string
    position: number
  }[]
}

interface ImportJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  total_customers: number
  processed_count: number
  created_count: number
  updated_count: number
  skipped_count: number
  error_count: number
  deals_created_count: number
  current_page: number
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  progress?: number
  estimatedTimeRemaining?: string
}

interface ImportTabProps {
  store: { id: string; shop_name: string | null; shop_domain: string }
  organizationId: string
  pipelines: Pipeline[]
  onSuccess?: () => void
}

// =============================================
// COMPONENT
// =============================================

export function ImportTab({
  store,
  organizationId,
  pipelines,
  onSuccess,
}: ImportTabProps) {
  // Estado inicial
  const [loading, setLoading] = useState(true)
  const [customerCount, setCustomerCount] = useState(0)
  const [existingCount, setExistingCount] = useState(0)
  const [error, setError] = useState('')
  
  // Job ativo
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  
  // Filtros
  const [availableTags, setAvailableTags] = useState<{ tag: string; count: number }[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [loadingTags, setLoadingTags] = useState(false)
  
  // Configuração de importação
  const [contactType, setContactType] = useState<'lead' | 'customer' | 'auto'>('auto')
  const [createDeals, setCreateDeals] = useState(false)
  const [selectedPipeline, setSelectedPipeline] = useState('')
  const [selectedStage, setSelectedStage] = useState('')
  const [importTags, setImportTags] = useState<string[]>(['shopify', 'importado'])

  // =============================================
  // Load data
  // =============================================
  
  useEffect(() => {
    loadInitialData()
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [store.id])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      // Carregar contagem de clientes
      const res = await fetch(`/api/shopify/import-customers?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        setCustomerCount(data.count || 0)
        setExistingCount(data.existingInCRM || 0)
      }

      // Verificar se existe job em andamento
      const jobsRes = await fetch(`/api/shopify/import-jobs?storeId=${store.id}`)
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json()
        const runningJob = jobsData.jobs?.find((j: ImportJob) => 
          ['pending', 'running', 'paused'].includes(j.status)
        )
        if (runningJob) {
          setActiveJob(runningJob)
          startPolling(runningJob.id)
        }
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
    
    loadTags()
  }

  const loadTags = async () => {
    setLoadingTags(true)
    try {
      const res = await fetch(`/api/shopify/import-customers?storeId=${store.id}&includeTags=true`)
      if (res.ok) {
        const data = await res.json()
        if (data.availableTags) {
          setAvailableTags(data.availableTags)
        }
      }
    } catch (err) {
      console.error('Error loading tags:', err)
    } finally {
      setLoadingTags(false)
    }
  }

  // =============================================
  // Polling para atualizar status do job
  // =============================================

  const startPolling = useCallback((jobId: string) => {
    if (pollingInterval) clearInterval(pollingInterval)
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/shopify/import-jobs?jobId=${jobId}`)
        if (res.ok) {
          const data = await res.json()
          setActiveJob(data.job)
          
          // Se job completou ou falhou, parar polling
          if (['completed', 'failed', 'cancelled'].includes(data.job.status)) {
            clearInterval(interval)
            setPollingInterval(null)
            if (data.job.status === 'completed') {
              onSuccess?.()
            }
          }
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 2000) // Poll a cada 2 segundos
    
    setPollingInterval(interval)
  }, [pollingInterval, onSuccess])

  // =============================================
  // Iniciar importação
  // =============================================
  
  const handleStartImport = async () => {
    setError('')
    
    try {
      const res = await fetch('/api/shopify/import-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          contactType,
          createDeals,
          pipelineId: createDeals ? selectedPipeline : null,
          stageId: createDeals ? selectedStage : null,
          tags: importTags,
          filterTags: selectedTags.length > 0 ? selectedTags : null,
        }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.job) {
        setActiveJob({
          ...data.job,
          processed_count: 0,
          created_count: 0,
          updated_count: 0,
          skipped_count: 0,
          error_count: 0,
          deals_created_count: 0,
          current_page: 0,
          last_error: null,
          started_at: null,
          completed_at: null,
          progress: 0,
        })
        startPolling(data.job.id)
      } else {
        setError(data.error || 'Erro ao iniciar importação')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar importação')
    }
  }

  // =============================================
  // Cancelar importação
  // =============================================

  const handleCancelImport = async () => {
    if (!activeJob) return
    
    try {
      await fetch(`/api/shopify/import-jobs?jobId=${activeJob.id}`, {
        method: 'DELETE',
      })
      
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
      }
      
      setActiveJob(null)
    } catch (err) {
      console.error('Error cancelling job:', err)
    }
  }

  // =============================================
  // Helpers
  // =============================================
  
  const getStages = () => {
    if (!selectedPipeline) return []
    return pipelines.find(p => p.id === selectedPipeline)?.stages
      .sort((a, b) => a.position - b.position) || []
  }
  
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }
  
  const removeImportTag = (tag: string) => {
    setImportTags(prev => prev.filter(t => t !== tag))
  }

  const newCount = customerCount - existingCount
  const isJobActive = activeJob && ['pending', 'running', 'paused'].includes(activeJob.status)

  // =============================================
  // Render - Loading
  // =============================================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    )
  }

  // =============================================
  // Render - Job Completed
  // =============================================

  if (activeJob?.status === 'completed') {
    return (
      <div className="space-y-6">
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-2xl text-center">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Importação Concluída!
          </h3>
          <p className="text-gray-500 mb-6">
            {activeJob.processed_count.toLocaleString('pt-BR')} clientes processados
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-md mx-auto">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-lg font-bold text-green-400">{activeJob.created_count}</p>
              <p className="text-xs text-gray-500">Criados</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-lg font-bold text-blue-400">{activeJob.updated_count}</p>
              <p className="text-xs text-gray-500">Atualizados</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-lg font-bold text-amber-400">{activeJob.skipped_count}</p>
              <p className="text-xs text-gray-500">Pulados</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-lg font-bold text-purple-400">{activeJob.deals_created_count}</p>
              <p className="text-xs text-gray-500">Deals</p>
            </div>
          </div>
          
          <button
            onClick={() => setActiveJob(null)}
            className="mt-6 px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-white transition-colors"
          >
            Nova Importação
          </button>
        </div>
      </div>
    )
  }

  // =============================================
  // Render - Job Active (Processing)
  // =============================================

  if (isJobActive) {
    const progress = activeJob.total_customers > 0
      ? Math.round((activeJob.processed_count / activeJob.total_customers) * 100)
      : 0

    return (
      <div className="space-y-6">
        {/* Header com status */}
        <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {activeJob.status === 'running' ? (
                <Loader2 className="w-5 h-5 text-brand-600 animate-spin" />
              ) : (
                <Clock className="w-5 h-5 text-amber-400" />
              )}
              <div>
                <h3 className="text-white font-medium">
                  {activeJob.status === 'pending' && 'Aguardando início...'}
                  {activeJob.status === 'running' && 'Importando...'}
                  {activeJob.status === 'paused' && 'Pausado'}
                </h3>
                <p className="text-sm text-gray-500">
                  {activeJob.processed_count.toLocaleString('pt-BR')} de {activeJob.total_customers.toLocaleString('pt-BR')} clientes
                </p>
              </div>
            </div>
            
            <button
              onClick={handleCancelImport}
              className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
              title="Cancelar importação"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barra de progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Progresso</span>
              <span className="text-brand-600 font-medium">{progress}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            {activeJob.estimatedTimeRemaining && (
              <p className="text-xs text-gray-400 text-center">
                Tempo estimado: {activeJob.estimatedTimeRemaining}
              </p>
            )}
          </div>
        </div>

        {/* Stats em tempo real */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-lg font-bold text-green-400">{activeJob.created_count}</p>
            <p className="text-xs text-gray-500">Criados</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-lg font-bold text-blue-400">{activeJob.updated_count}</p>
            <p className="text-xs text-gray-500">Atualizados</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-lg font-bold text-amber-400">{activeJob.skipped_count}</p>
            <p className="text-xs text-gray-500">Pulados</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-lg font-bold text-red-400">{activeJob.error_count}</p>
            <p className="text-xs text-gray-500">Erros</p>
          </div>
        </div>

        {/* Aviso */}
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div className="text-sm text-blue-300">
            <p>A importação continua em background mesmo se você fechar esta janela.</p>
            <p className="text-blue-400/70 mt-1">Página: {activeJob.current_page}</p>
          </div>
        </div>
      </div>
    )
  }

  // =============================================
  // Render - Formulário de Importação
  // =============================================
  
  return (
    <div className="space-y-5">
      {/* Customer Count */}
      <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-500/15 rounded-xl">
              <Users className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {customerCount.toLocaleString('pt-BR')} clientes
              </h3>
              <p className="text-sm text-gray-500">
                encontrados na Shopify
              </p>
            </div>
          </div>
          <button
            onClick={loadInitialData}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-white transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="p-3 bg-gray-50 rounded-xl text-center">
            <p className="text-xl font-bold text-blue-400">{existingCount.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-gray-500">Já no CRM</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl text-center">
            <p className="text-xl font-bold text-green-400">{newCount.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-gray-500">Novos</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {availableTags.length > 0 && (
        <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-brand-600" />
            <h4 className="text-sm font-medium text-gray-900">Filtrar por Tags da Shopify</h4>
            {loadingTags && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.slice(0, 20).map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-brand-100 text-brand-600 border border-brand-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:border-gray-300'
                }`}
              >
                {selectedTags.includes(tag) && <Check className="w-3 h-3" />}
                {tag}
                <span className="text-xs opacity-60">({count})</span>
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="mt-2 text-xs text-gray-500 hover:text-white"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Import Config */}
      <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl">
        <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Download className="w-4 h-4 text-brand-600" />
          Configuração da Importação
        </h4>
        
        <div className="space-y-4">
          {/* Contact Type */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              Tipo do Contato
            </label>
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="auto">Automático (baseado em pedidos)</option>
              <option value="lead">Todos como Lead</option>
              <option value="customer">Todos como Customer</option>
            </select>
          </div>

          {/* Create Deals Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm text-white">Criar Deals</p>
              <p className="text-xs text-gray-500">Criar um deal para cada contato importado</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={createDeals}
                onChange={(e) => setCreateDeals(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>

          {/* Pipeline Selection */}
          {createDeals && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Pipeline</label>
                <select
                  value={selectedPipeline}
                  onChange={(e) => {
                    setSelectedPipeline(e.target.value)
                    setSelectedStage('')
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500"
                >
                  <option value="">Selecione...</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-2">Estágio</label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  disabled={!selectedPipeline}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50"
                >
                  <option value="">Selecione...</option>
                  {getStages().map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              Tags no CRM
            </label>
            <div className="flex flex-wrap gap-2">
              {importTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-brand-100 text-brand-600 rounded-full text-sm"
                >
                  {tag}
                  <button
                    onClick={() => removeImportTag(tag)}
                    className="p-0.5 hover:bg-primary-500/30 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-300">
          <p>Clientes sem email ou telefone serão ignorados.</p>
          <p>Contatos existentes serão atualizados com novos dados.</p>
          <p className="mt-1 text-amber-400/70">
            ⚡ A importação será processada em background - você pode fechar esta janela.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleStartImport}
        disabled={customerCount === 0 || (createDeals && (!selectedPipeline || !selectedStage))}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#96bf48] hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
      >
        <Download className="w-5 h-5" />
        Iniciar Importação em Background
        {selectedTags.length > 0 && (
          <span className="text-sm opacity-80">
            (filtrado)
          </span>
        )}
      </button>
    </div>
  )
}

export default ImportTab
