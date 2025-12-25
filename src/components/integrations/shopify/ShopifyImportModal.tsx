'use client'

// =============================================
// Componente: Shopify Import Modal
// src/components/integrations/shopify/ShopifyImportModal.tsx
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Download,
  Users,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
  RefreshCw,
  ExternalLink,
  Tag,
  Check,
} from 'lucide-react'

// =============================================
// Types
// =============================================

interface Pipeline {
  id: string
  name: string
  stages: { id: string; name: string; color: string; sort_order: number }[]
}

interface ImportStats {
  total: number
  totalInShopify?: number
  created: number
  updated: number
  skipped: number
  errors: number
  dealsCreated: number
}

type ImportStatus = 'idle' | 'loading' | 'importing' | 'completed' | 'error'

interface ShopifyImportModalProps {
  storeId: string
  storeName: string
  organizationId: string
  onClose: () => void
  onSuccess: () => void
}

// =============================================
// Component
// =============================================

export default function ShopifyImportModal({
  storeId,
  storeName,
  organizationId,
  onClose,
  onSuccess,
}: ShopifyImportModalProps) {
  // States
  const [status, setStatus] = useState<ImportStatus>('loading')
  const [customerCount, setCustomerCount] = useState<number>(0)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState<number>(0)
  
  // Tags do Shopify
  const [availableTags, setAvailableTags] = useState<{ tag: string; count: number }[]>([])
  const [selectedShopifyTags, setSelectedShopifyTags] = useState<string[]>([])
  const [loadingTags, setLoadingTags] = useState(false)

  // Form states
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [contactType, setContactType] = useState<'lead' | 'customer' | 'auto'>('auto')
  const [createDeals, setCreateDeals] = useState<boolean>(false)

  // =============================================
  // Load initial data
  // =============================================
  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setStatus('loading')
    try {
      // Fetch customer count (sem tags inicialmente, mais rápido)
      const countRes = await fetch(`/api/shopify/import-customers?storeId=${storeId}`)
      
      // Verificar se a resposta é JSON válido
      const contentType = countRes.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await countRes.text()
        throw new Error(`Resposta inválida do servidor: ${text.substring(0, 100)}`)
      }
      
      const countData = await countRes.json()
      
      if (countData.success) {
        setCustomerCount(countData.count)
      } else {
        throw new Error(countData.error || 'Erro ao buscar clientes')
      }

      // Fetch pipelines
      const pipelinesRes = await fetch(`/api/deals?type=pipelines&organizationId=${organizationId}`)
      if (pipelinesRes.ok) {
        const pipelinesData = await pipelinesRes.json()
        setPipelines(pipelinesData.pipelines || [])
      }

      setStatus('idle')
      
      // Buscar tags em background (não bloqueia a UI)
      loadAvailableTags()
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message || 'Erro ao carregar dados')
      setStatus('error')
    }
  }

  const loadAvailableTags = async () => {
    setLoadingTags(true)
    try {
      const res = await fetch(`/api/shopify/import-customers?storeId=${storeId}&includeTags=true`)
      
      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Invalid response for tags')
        return
      }
      
      const data = await res.json()
      if (data.success && data.availableTags) {
        setAvailableTags(data.availableTags)
      }
    } catch (err) {
      console.error('Error loading tags:', err)
    } finally {
      setLoadingTags(false)
    }
  }

  const toggleShopifyTag = (tag: string) => {
    setSelectedShopifyTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const selectAllTags = () => {
    setSelectedShopifyTags(availableTags.map(t => t.tag))
  }

  const clearAllTags = () => {
    setSelectedShopifyTags([])
  }

  // Calcular total estimado baseado nas tags selecionadas
  // Nota: É uma estimativa porque clientes podem ter múltiplas tags
  const estimatedCount = selectedShopifyTags.length === 0 
    ? customerCount 
    : availableTags
        .filter(t => selectedShopifyTags.includes(t.tag))
        .reduce((sum, t) => sum + t.count, 0)

  // Obter contagem de uma tag específica
  const getTagCount = (tag: string): number => {
    return availableTags.find(t => t.tag === tag)?.count || 0
  }

  // =============================================
  // Handle Import
  // =============================================
  const handleStartImport = async () => {
    setStatus('importing')
    setProgress(0)
    setError('')

    // Simulate progress (since API doesn't stream)
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + Math.random() * 10
      })
    }, 1000)

    try {
      const response = await fetch('/api/shopify/import-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          pipelineId: selectedPipeline || null,
          stageId: selectedStage || null,
          contactType,
          createDeals: createDeals && !!selectedPipeline && !!selectedStage,
          filterByTags: selectedShopifyTags, // Tags do Shopify para filtrar
        }),
      })

      clearInterval(progressInterval)
      setProgress(100)

      // Verificar se a resposta é JSON válido
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response:', text)
        throw new Error('O servidor retornou uma resposta inválida. Tente novamente.')
      }

      const data = await response.json()

      if (data.success) {
        setStats(data.stats)
        setDuration(data.duration)
        setStatus('completed')
      } else {
        throw new Error(data.error || 'Erro na importação')
      }
    } catch (err: any) {
      clearInterval(progressInterval)
      console.error('Import error:', err)
      setError(err.message || 'Erro durante importação')
      setStatus('error')
    }
  }

  // =============================================
  // Get selected pipeline data
  // =============================================
  const selectedPipelineData = pipelines.find(p => p.id === selectedPipeline)

  // =============================================
  // Format duration
  // =============================================
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seg`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins} min ${secs} seg`
  }

  // =============================================
  // Render
  // =============================================
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Download className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {status === 'completed' ? 'Importação Concluída!' : 'Importar Clientes do Shopify'}
                </h2>
                <p className="text-sm text-dark-400">{storeName}</p>
              </div>
            </div>
            {status !== 'importing' && (
              <button
                onClick={onClose}
                className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Loading State */}
            {status === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                <p className="text-dark-400">Carregando dados...</p>
              </motion.div>
            )}

            {/* Idle State - Configuration Form */}
            {status === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {/* Customer Count */}
                <div className="flex items-center justify-center p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl">
                  <Users className="w-6 h-6 text-blue-400 mr-3" />
                  <div className="text-center">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-white">
                        {selectedShopifyTags.length > 0 ? (
                          <>
                            ~{estimatedCount.toLocaleString('pt-BR')}
                            <span className="text-sm font-normal text-dark-400 ml-1">
                              de {customerCount.toLocaleString('pt-BR')}
                            </span>
                          </>
                        ) : (
                          customerCount.toLocaleString('pt-BR')
                        )}
                      </span>
                      <span className="text-dark-400">clientes</span>
                    </div>
                    {selectedShopifyTags.length > 0 && (
                      <p className="text-xs text-amber-400 mt-1">
                        ≈ estimativa (clientes podem ter múltiplas tags)
                      </p>
                    )}
                  </div>
                </div>

                {/* Filtrar por Tags do Shopify */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-dark-300">
                      <Tag className="w-4 h-4" />
                      Filtrar por tags do Shopify (opcional)
                    </label>
                    {loadingTags && (
                      <Loader2 className="w-4 h-4 text-dark-400 animate-spin" />
                    )}
                  </div>
                  
                  {availableTags.length > 0 ? (
                    <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-dark-400">
                          {selectedShopifyTags.length === 0 
                            ? 'Nenhum filtro (importar todos)' 
                            : `${selectedShopifyTags.length} tag(s) selecionada(s)`}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={selectAllTags}
                            className="text-xs text-primary-400 hover:text-primary-300"
                          >
                            Selecionar todas
                          </button>
                          <span className="text-dark-600">|</span>
                          <button
                            onClick={clearAllTags}
                            className="text-xs text-dark-400 hover:text-dark-300"
                          >
                            Limpar
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                        {availableTags.map(({ tag, count }) => (
                          <button
                            key={tag}
                            onClick={() => toggleShopifyTag(tag)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm transition-all ${
                              selectedShopifyTags.includes(tag)
                                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                                : 'bg-dark-700 text-dark-300 border border-dark-600 hover:border-dark-500'
                            }`}
                          >
                            {selectedShopifyTags.includes(tag) && (
                              <Check className="w-3 h-3" />
                            )}
                            <span>{tag}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              selectedShopifyTags.includes(tag)
                                ? 'bg-primary-500/30 text-primary-300'
                                : 'bg-dark-600 text-dark-400'
                            }`}>
                              {count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : !loadingTags ? (
                    <div className="p-3 bg-dark-800/50 border border-dark-700 rounded-xl text-center">
                      <p className="text-sm text-dark-400">
                        Nenhuma tag encontrada nos clientes do Shopify
                      </p>
                    </div>
                  ) : null}
                  
                  {selectedShopifyTags.length > 0 && (
                    <p className="text-xs text-amber-400 mt-2">
                      ⚠️ Apenas clientes com estas tags serão importados
                    </p>
                  )}
                </div>

                {/* Pipeline Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Pipeline (opcional)
                    </label>
                    <select
                      value={selectedPipeline}
                      onChange={(e) => {
                        setSelectedPipeline(e.target.value)
                        setSelectedStage('')
                      }}
                      className="w-full px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
                    >
                      <option value="">Nenhum</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Estágio inicial
                    </label>
                    <select
                      value={selectedStage}
                      onChange={(e) => setSelectedStage(e.target.value)}
                      disabled={!selectedPipeline}
                      className="w-full px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 disabled:opacity-50"
                    >
                      <option value="">Selecione</option>
                      {selectedPipelineData?.stages
                        ?.sort((a, b) => a.sort_order - b.sort_order)
                        .map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Contact Type */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Tipo de contato
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'lead', label: 'Lead', desc: 'Todos são leads' },
                      { value: 'customer', label: 'Cliente', desc: 'Todos são clientes' },
                      { value: 'auto', label: 'Automático', desc: 'Baseado em compras' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setContactType(option.value as any)}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${
                          contactType === option.value
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700 hover:border-dark-600'
                        }`}
                      >
                        <span className={`block text-sm font-medium ${
                          contactType === option.value ? 'text-primary-400' : 'text-white'
                        }`}>
                          {option.label}
                        </span>
                        <span className="block text-[10px] text-dark-400 mt-0.5">
                          {option.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Create Deals Checkbox */}
                {selectedPipeline && selectedStage && (
                  <label className="flex items-start gap-3 p-3 bg-dark-800/50 rounded-xl cursor-pointer hover:bg-dark-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={createDeals}
                      onChange={(e) => setCreateDeals(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                    />
                    <div>
                      <span className="block text-white font-medium">Criar deal para cada cliente</span>
                      <span className="block text-xs text-dark-400">
                        Um deal será criado no pipeline e estágio selecionados
                      </span>
                    </div>
                  </label>
                )}

                {/* Info */}
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-300">
                    Clientes sem email ou telefone serão ignorados. Contatos existentes serão atualizados.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Importing State */}
            {status === 'importing' && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 py-4"
              >
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-1">Importando clientes...</h3>
                  <p className="text-sm text-dark-400">Isso pode levar alguns minutos</p>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-400">Processando...</span>
                    <span className="text-white font-medium">{Math.round(progress)}%</span>
                  </div>
                </div>

                <p className="text-center text-xs text-dark-500">
                  Não feche esta janela durante a importação
                </p>
              </motion.div>
            )}

            {/* Completed State */}
            {status === 'completed' && stats && (
              <motion.div
                key="completed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Success Icon */}
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {stats.total.toLocaleString('pt-BR')} clientes processados
                  </h3>
                  <p className="text-sm text-dark-400">
                    em {formatDuration(duration)}
                    {stats.totalInShopify && stats.totalInShopify !== stats.total && (
                      <span className="ml-1">
                        (filtrado de {stats.totalInShopify.toLocaleString('pt-BR')} total)
                      </span>
                    )}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-emerald-400">{stats.created}</p>
                    <p className="text-xs text-dark-400">Criados</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-blue-400">{stats.updated}</p>
                    <p className="text-xs text-dark-400">Atualizados</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-amber-400">{stats.skipped}</p>
                    <p className="text-xs text-dark-400">Pulados</p>
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                    <p className="text-2xl font-bold text-red-400">{stats.errors}</p>
                    <p className="text-xs text-dark-400">Erros</p>
                  </div>
                </div>

                {/* Deals Created */}
                {stats.dealsCreated > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <Package className="w-5 h-5 text-purple-400" />
                    <span className="text-sm text-purple-300">
                      {stats.dealsCreated} deals criados no pipeline
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Erro na importação</h3>
                <p className="text-sm text-red-400 mb-4">{error}</p>
                <button
                  onClick={loadInitialData}
                  className="flex items-center gap-2 mx-auto px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 flex items-center justify-end gap-3">
          {status === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartImport}
                disabled={customerCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Iniciar Importação
              </button>
            </>
          )}

          {status === 'completed' && (
            <>
              <button
                onClick={() => {
                  onSuccess()
                  onClose()
                }}
                className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
              >
                Fechar
              </button>
              <a
                href="/crm"
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors"
              >
                Ver no CRM
                <ArrowRight className="w-4 h-4" />
              </a>
            </>
          )}

          {status === 'error' && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
            >
              Fechar
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
