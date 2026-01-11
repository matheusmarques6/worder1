'use client'

// =============================================
// Sync Config Tab
// /src/components/integrations/shopify/tabs/SyncConfigTab.tsx
//
// Configuração de sincronização automática:
// - Novos clientes
// - Novos pedidos
// - Carrinho abandonado
// =============================================

import { useState, useEffect } from 'react'
import {
  Users,
  ShoppingCart,
  ShoppingBag,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  X,
  Tag,
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

interface SyncConfig {
  sync_new_customers: boolean
  customer_contact_type: 'lead' | 'customer' | 'auto'
  customer_pipeline_id: string | null
  customer_stage_id: string | null
  customer_auto_tags: string[]
  create_deal_for_customer: boolean
  customer_deal_title_template: string
  
  sync_new_orders: boolean
  order_pipeline_id: string | null
  order_stage_id: string | null
  order_auto_tags: string[]
  order_deal_title_template: string
  
  sync_abandoned_checkouts: boolean
  abandoned_pipeline_id: string | null
  abandoned_stage_id: string | null
  abandoned_delay_minutes: number
  abandoned_auto_tags: string[]
  
  update_existing_contacts: boolean
  prevent_duplicate_deals: boolean
  duplicate_check_hours: number
}

interface SyncConfigTabProps {
  store: { id: string }
  organizationId: string
  pipelines: Pipeline[]
  loadingPipelines: boolean
  onSave?: () => void
}

// =============================================
// COMPONENT
// =============================================

export function SyncConfigTab({
  store,
  organizationId,
  pipelines,
  loadingPipelines,
  onSave,
}: SyncConfigTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  
  const [config, setConfig] = useState<SyncConfig>({
    sync_new_customers: true,
    customer_contact_type: 'auto',
    customer_pipeline_id: null,
    customer_stage_id: null,
    customer_auto_tags: ['shopify'],
    create_deal_for_customer: false,
    customer_deal_title_template: 'Novo Lead: {{customer_name}}',
    
    sync_new_orders: true,
    order_pipeline_id: null,
    order_stage_id: null,
    order_auto_tags: ['shopify', 'pedido'],
    order_deal_title_template: 'Pedido #{{order_number}} - {{customer_name}}',
    
    sync_abandoned_checkouts: false,
    abandoned_pipeline_id: null,
    abandoned_stage_id: null,
    abandoned_delay_minutes: 60,
    abandoned_auto_tags: ['shopify', 'carrinho-abandonado'],
    
    update_existing_contacts: true,
    prevent_duplicate_deals: true,
    duplicate_check_hours: 24,
  })
  
  const [newCustomerTag, setNewCustomerTag] = useState('')
  const [newOrderTag, setNewOrderTag] = useState('')

  // =============================================
  // Load config on mount
  // =============================================
  
  useEffect(() => {
    loadConfig()
  }, [store.id])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shopify/sync-config?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.config) {
          setConfig(data.config)
        }
      }
    } catch (err) {
      console.error('Error loading config:', err)
    } finally {
      setLoading(false)
    }
  }

  // =============================================
  // Save config
  // =============================================
  
  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    
    try {
      const res = await fetch('/api/shopify/sync-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          organizationId,
          syncNewCustomers: config.sync_new_customers,
          customerContactType: config.customer_contact_type,
          customerPipelineId: config.customer_pipeline_id,
          customerStageId: config.customer_stage_id,
          customerAutoTags: config.customer_auto_tags,
          createDealForCustomer: config.create_deal_for_customer,
          customerDealTitleTemplate: config.customer_deal_title_template,
          syncNewOrders: config.sync_new_orders,
          orderPipelineId: config.order_pipeline_id,
          orderStageId: config.order_stage_id,
          orderAutoTags: config.order_auto_tags,
          orderDealTitleTemplate: config.order_deal_title_template,
          syncAbandonedCheckouts: config.sync_abandoned_checkouts,
          abandonedPipelineId: config.abandoned_pipeline_id,
          abandonedStageId: config.abandoned_stage_id,
          abandonedDelayMinutes: config.abandoned_delay_minutes,
          abandonedAutoTags: config.abandoned_auto_tags,
          updateExistingContacts: config.update_existing_contacts,
          preventDuplicateDeals: config.prevent_duplicate_deals,
          duplicateCheckHours: config.duplicate_check_hours,
        }),
      })
      
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        onSave?.()
      } else {
        const data = await res.json()
        setError(data.error || 'Erro ao salvar')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // =============================================
  // Helpers
  // =============================================
  
  const getStagesForPipeline = (pipelineId: string | null) => {
    if (!pipelineId) return []
    const pipeline = pipelines.find(p => p.id === pipelineId)
    return pipeline?.stages.sort((a, b) => a.position - b.position) || []
  }
  
  const addTag = (type: 'customer' | 'order', tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    
    if (type === 'customer') {
      if (!config.customer_auto_tags.includes(trimmed)) {
        setConfig(prev => ({
          ...prev,
          customer_auto_tags: [...prev.customer_auto_tags, trimmed],
        }))
      }
      setNewCustomerTag('')
    } else {
      if (!config.order_auto_tags.includes(trimmed)) {
        setConfig(prev => ({
          ...prev,
          order_auto_tags: [...prev.order_auto_tags, trimmed],
        }))
      }
      setNewOrderTag('')
    }
  }
  
  const removeTag = (type: 'customer' | 'order', tag: string) => {
    if (type === 'customer') {
      setConfig(prev => ({
        ...prev,
        customer_auto_tags: prev.customer_auto_tags.filter(t => t !== tag),
      }))
    } else {
      setConfig(prev => ({
        ...prev,
        order_auto_tags: prev.order_auto_tags.filter(t => t !== tag),
      }))
    }
  }

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

  return (
    <div className="space-y-6">
      {/* ========================================
          Customer Sync Section
      ======================================== */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Novos Clientes</h3>
              <p className="text-xs text-dark-400">
                Criar contato quando cliente se cadastrar na Shopify
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.sync_new_customers}
              onChange={(e) => setConfig(prev => ({ ...prev, sync_new_customers: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-dark-600 rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        {config.sync_new_customers && (
          <div className="space-y-4 pt-4 border-t border-dark-700">
            {/* Contact Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Tipo do Contato
                </label>
                <select
                  value={config.customer_contact_type}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    customer_contact_type: e.target.value as any 
                  }))}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                >
                  <option value="lead">Lead</option>
                  <option value="customer">Customer</option>
                  <option value="auto">Automático (baseado em pedidos)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Criar Deal para Cliente?
                </label>
                <select
                  value={config.create_deal_for_customer ? 'yes' : 'no'}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    create_deal_for_customer: e.target.value === 'yes' 
                  }))}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                >
                  <option value="no">Não criar deal</option>
                  <option value="yes">Sim, criar deal</option>
                </select>
              </div>
            </div>

            {/* Pipeline Selection (only if creating deal) */}
            {config.create_deal_for_customer && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Pipeline
                  </label>
                  <select
                    value={config.customer_pipeline_id || ''}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      customer_pipeline_id: e.target.value || null,
                      customer_stage_id: null,
                    }))}
                    className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                  >
                    <option value="">Selecione...</option>
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Estágio Inicial
                  </label>
                  <select
                    value={config.customer_stage_id || ''}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      customer_stage_id: e.target.value || null 
                    }))}
                    disabled={!config.customer_pipeline_id}
                    className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50 transition-colors"
                  >
                    <option value="">Selecione...</option>
                    {getStagesForPipeline(config.customer_pipeline_id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Tags Automáticas
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {config.customer_auto_tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag('customer', tag)}
                      className="p-0.5 hover:bg-blue-500/30 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCustomerTag}
                  onChange={(e) => setNewCustomerTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('customer', newCustomerTag)}
                  placeholder="Nova tag..."
                  className="flex-1 px-4 py-2 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={() => addTag('customer', newCustomerTag)}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================
          Order Sync Section
      ======================================== */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Novos Pedidos</h3>
              <p className="text-xs text-dark-400">
                Criar deal quando um pedido for criado
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.sync_new_orders}
              onChange={(e) => setConfig(prev => ({ ...prev, sync_new_orders: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-dark-600 rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        {config.sync_new_orders && (
          <div className="space-y-4 pt-4 border-t border-dark-700">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Pipeline de Vendas
                </label>
                <select
                  value={config.order_pipeline_id || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    order_pipeline_id: e.target.value || null,
                    order_stage_id: null,
                  }))}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                >
                  <option value="">Selecione...</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Estágio Inicial
                </label>
                <select
                  value={config.order_stage_id || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    order_stage_id: e.target.value || null 
                  }))}
                  disabled={!config.order_pipeline_id}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50 transition-colors"
                >
                  <option value="">Selecione...</option>
                  {getStagesForPipeline(config.order_pipeline_id).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Tags Automáticas
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {config.order_auto_tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag('order', tag)}
                      className="p-0.5 hover:bg-green-500/30 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOrderTag}
                  onChange={(e) => setNewOrderTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('order', newOrderTag)}
                  placeholder="Nova tag..."
                  className="flex-1 px-4 py-2 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={() => addTag('order', newOrderTag)}
                  className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================
          Abandoned Checkout Section
      ======================================== */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Carrinho Abandonado</h3>
              <p className="text-xs text-dark-400">
                Criar deal quando checkout for abandonado
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.sync_abandoned_checkouts}
              onChange={(e) => setConfig(prev => ({ ...prev, sync_abandoned_checkouts: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-dark-600 rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        {config.sync_abandoned_checkouts && (
          <div className="space-y-4 pt-4 border-t border-dark-700">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Pipeline
                </label>
                <select
                  value={config.abandoned_pipeline_id || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    abandoned_pipeline_id: e.target.value || null,
                    abandoned_stage_id: null,
                  }))}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                >
                  <option value="">Selecione...</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Estágio
                </label>
                <select
                  value={config.abandoned_stage_id || ''}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    abandoned_stage_id: e.target.value || null 
                  }))}
                  disabled={!config.abandoned_pipeline_id}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50 transition-colors"
                >
                  <option value="">Selecione...</option>
                  {getStagesForPipeline(config.abandoned_pipeline_id).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Delay (minutos)
                </label>
                <input
                  type="number"
                  value={config.abandoned_delay_minutes}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    abandoned_delay_minutes: parseInt(e.target.value) || 60 
                  }))}
                  min={15}
                  max={1440}
                  className="w-full px-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-white text-sm focus:outline-none focus:border-primary-500 transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================
          Save Button
      ======================================== */}
      <div className="flex items-center justify-between pt-4 border-t border-dark-700">
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" />
            Salvo com sucesso!
          </div>
        )}
        
        {!error && !saved && <div />}
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Salvar Configurações
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default SyncConfigTab
