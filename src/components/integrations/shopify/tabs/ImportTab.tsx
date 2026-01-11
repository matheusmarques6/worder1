'use client'

// =============================================
// Import Tab
// /src/components/integrations/shopify/tabs/ImportTab.tsx
//
// Importação em massa de clientes da Shopify
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  ArrowRight,
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

interface ImportStats {
  total: number
  created: number
  updated: number
  skipped: number
  errors: number
  dealsCreated: number
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
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [customerCount, setCustomerCount] = useState(0)
  const [existingCount, setExistingCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [error, setError] = useState('')
  
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
  }, [store.id])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shopify/import-customers?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        setCustomerCount(data.count || 0)
        setExistingCount(data.existingInCRM || 0)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
    
    // Load tags in background
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
  // Import
  // =============================================
  
  const handleImport = async () => {
    setImporting(true)
    setProgress(0)
    setStats(null)
    setError('')
    
    try {
      const res = await fetch('/api/shopify/import-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          organizationId,
          contactType,
          createDeals,
          pipelineId: createDeals ? selectedPipeline : null,
          stageId: createDeals ? selectedStage : null,
          tags: importTags,
          filterTags: selectedTags.length > 0 ? selectedTags : null,
        }),
      })
      
      // Simular progresso (a API real deveria usar streaming)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 500)
      
      if (res.ok) {
        const data = await res.json()
        clearInterval(progressInterval)
        setProgress(100)
        setStats(data.stats)
        onSuccess?.()
      } else {
        clearInterval(progressInterval)
        const data = await res.json()
        setError(data.error || 'Erro na importação')
      }
    } catch (err: any) {
      setError(err.message || 'Erro na importação')
    } finally {
      setImporting(false)
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
  
  const addImportTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (trimmed && !importTags.includes(trimmed)) {
      setImportTags(prev => [...prev, trimmed])
    }
  }
  
  const removeImportTag = (tag: string) => {
    setImportTags(prev => prev.filter(t => t !== tag))
  }

  const newCount = customerCount - existingCount

  // =============================================
  // Render
  // =============================================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  // Show results if import completed
  if (stats) {
    return (
      <div className="space-y-6">
        <div className="p-8 bg-dark-800/50 border border-dark-700 rounded-2xl text-center">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Importação Concluída!
          </h3>
          <p className="text-dark-400 mb-6">
            {stats.total} clientes processados
          </p>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-2xl font-bold text-green-400">{stats.created}</p>
              <p className="text-xs text-dark-400">Criados</p>
            </div>
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <p className="text-2xl font-bold text-blue-400">{stats.updated}</p>
              <p className="text-xs text-dark-400">Atualizados</p>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-2xl font-bold text-amber-400">{stats.skipped}</p>
              <p className="text-xs text-dark-400">Pulados</p>
            </div>
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <p className="text-2xl font-bold text-purple-400">{stats.dealsCreated}</p>
              <p className="text-xs text-dark-400">Deals</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setStats(null)}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
            >
              Importar Novamente
            </button>
            <a
              href="/crm/contacts"
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-xl text-white transition-colors"
            >
              Ver Contatos
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Customer Count Card */}
      <div className="p-6 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#96bf48]/20 rounded-xl">
              <Users className="w-6 h-6 text-[#96bf48]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {customerCount.toLocaleString('pt-BR')} clientes
              </h3>
              <p className="text-sm text-dark-400">
                encontrados na Shopify
              </p>
            </div>
          </div>
          <button
            onClick={loadInitialData}
            className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-dark-900/50 rounded-xl text-center">
            <p className="text-xl font-bold text-blue-400">{existingCount}</p>
            <p className="text-xs text-dark-400">Já no CRM</p>
          </div>
          <div className="p-3 bg-dark-900/50 rounded-xl text-center">
            <p className="text-xl font-bold text-green-400">{newCount}</p>
            <p className="text-xs text-dark-400">Novos</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {availableTags.length > 0 && (
        <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary-400" />
            <h4 className="text-sm font-medium text-white">Filtrar por Tags da Shopify</h4>
            {loadingTags && <Loader2 className="w-4 h-4 animate-spin text-dark-400" />}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-dark-700 text-dark-300 border border-dark-600 hover:border-dark-500'
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
              className="mt-2 text-xs text-dark-400 hover:text-white"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Import Config */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <h4 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <Download className="w-4 h-4 text-primary-400" />
          Configuração da Importação
        </h4>
        
        <div className="space-y-4">
          {/* Contact Type */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Tipo do Contato
            </label>
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="auto">Automático (baseado em pedidos)</option>
              <option value="lead">Todos como Lead</option>
              <option value="customer">Todos como Customer</option>
            </select>
          </div>

          {/* Create Deals Toggle */}
          <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl">
            <div>
              <p className="text-sm text-white">Criar Deals</p>
              <p className="text-xs text-dark-400">Criar um deal para cada contato importado</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={createDeals}
                onChange={(e) => setCreateDeals(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-dark-600 rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>

          {/* Pipeline Selection */}
          {createDeals && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">Pipeline</label>
                <select
                  value={selectedPipeline}
                  onChange={(e) => {
                    setSelectedPipeline(e.target.value)
                    setSelectedStage('')
                  }}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500"
                >
                  <option value="">Selecione...</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-dark-400 mb-2">Estágio</label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  disabled={!selectedPipeline}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50"
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
            <label className="block text-sm text-dark-400 mb-2">
              Tags no CRM
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {importTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm"
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
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Progress */}
      {importing && (
        <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white">Importando...</span>
            <span className="text-sm text-primary-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-dark-400 mt-2 text-center">
            Não feche esta janela durante a importação
          </p>
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={importing || customerCount === 0 || (createDeals && (!selectedPipeline || !selectedStage))}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#96bf48] hover:bg-[#7da03a] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
      >
        {importing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            Iniciar Importação
            {selectedTags.length > 0 && (
              <span className="text-sm opacity-80">
                (filtrado)
              </span>
            )}
          </>
        )}
      </button>
    </div>
  )
}

export default ImportTab
