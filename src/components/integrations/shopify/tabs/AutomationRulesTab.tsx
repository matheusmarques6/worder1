'use client'

// =============================================
// Automation Rules Tab
// /src/components/integrations/shopify/tabs/AutomationRulesTab.tsx
//
// Regras de transição automática de deals
// baseadas em eventos Shopify
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  ArrowRight,
  ShoppingCart,
  CreditCard,
  Package,
  XCircle,
  User,
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
    sort_order: number
  }[]
}

interface TransitionRule {
  id: string
  rule_name: string
  description?: string
  is_active: boolean
  trigger_event: string
  from_pipeline_id?: string
  from_stage_id?: string
  to_pipeline_id?: string
  to_stage_id?: string
  min_order_value?: number
  mark_as_won: boolean
  mark_as_lost: boolean
  add_tags: string[]
  from_pipeline?: { id: string; name: string }
  from_stage?: { id: string; name: string; color: string }
  to_pipeline?: { id: string; name: string }
  to_stage?: { id: string; name: string; color: string }
}

interface AutomationRulesTabProps {
  store: { id: string }
  organizationId: string
  pipelines: Pipeline[]
  loadingPipelines: boolean
}

// Event icons and labels
const EVENT_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  'customers/create': { icon: <User className="w-4 h-4" />, label: 'Cliente Criado', color: 'blue' },
  'orders/create': { icon: <ShoppingCart className="w-4 h-4" />, label: 'Pedido Criado', color: 'purple' },
  'orders/paid': { icon: <CreditCard className="w-4 h-4" />, label: 'Pedido Pago', color: 'green' },
  'orders/fulfilled': { icon: <Package className="w-4 h-4" />, label: 'Pedido Enviado', color: 'blue' },
  'orders/cancelled': { icon: <XCircle className="w-4 h-4" />, label: 'Pedido Cancelado', color: 'red' },
}

// =============================================
// COMPONENT
// =============================================

export function AutomationRulesTab({
  store,
  organizationId,
  pipelines,
  loadingPipelines,
}: AutomationRulesTabProps) {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<TransitionRule[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<TransitionRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // =============================================
  // Load rules
  // =============================================
  
  useEffect(() => {
    loadRules()
  }, [store.id])

  const loadRules = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shopify/transition-rules?storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || [])
      }
    } catch (err) {
      console.error('Error loading rules:', err)
    } finally {
      setLoading(false)
    }
  }

  // =============================================
  // Handlers
  // =============================================
  
  const handleCreateRule = () => {
    setEditingRule(null)
    setShowModal(true)
  }

  const handleEditRule = (rule: TransitionRule) => {
    setEditingRule(rule)
    setShowModal(true)
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta regra?')) return
    
    try {
      const res = await fetch(`/api/shopify/transition-rules?ruleId=${ruleId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== ruleId))
      }
    } catch (err) {
      console.error('Error deleting rule:', err)
    }
  }

  const handleToggleRule = async (rule: TransitionRule) => {
    try {
      const res = await fetch('/api/shopify/transition-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: rule.id,
          isActive: !rule.is_active,
        }),
      })
      if (res.ok) {
        setRules(prev => prev.map(r => 
          r.id === rule.id ? { ...r, is_active: !r.is_active } : r
        ))
      }
    } catch (err) {
      console.error('Error toggling rule:', err)
    }
  }

  const handleSaveRule = async (ruleData: Partial<TransitionRule>) => {
    setSaving(true)
    setError('')
    
    try {
      const method = editingRule ? 'PUT' : 'POST'
      const body = editingRule
        ? { ruleId: editingRule.id, ...ruleData }
        : { storeId: store.id, organizationId, ...ruleData }
      
      const res = await fetch('/api/shopify/transition-rules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      
      if (res.ok) {
        const data = await res.json()
        if (editingRule) {
          setRules(prev => prev.map(r => r.id === editingRule.id ? data.rule : r))
        } else {
          setRules(prev => [...prev, data.rule])
        }
        setShowModal(false)
        setEditingRule(null)
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
  // Render
  // =============================================
  
  if (loading || loadingPipelines) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-400" />
            Regras de Automação
          </h3>
          <p className="text-sm text-dark-400 mt-1">
            Mova deals automaticamente quando eventos acontecem na Shopify
          </p>
        </div>
        <button
          onClick={handleCreateRule}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-xl text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </button>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="p-8 bg-dark-800/50 border border-dark-700 rounded-2xl text-center">
          <Zap className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-white mb-2">
            Nenhuma regra configurada
          </h4>
          <p className="text-sm text-dark-400 mb-4">
            Crie regras para mover deals automaticamente quando pedidos forem pagos, enviados, etc.
          </p>
          <button
            onClick={handleCreateRule}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-xl text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Primeira Regra
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const eventConfig = EVENT_CONFIG[rule.trigger_event] || {
              icon: <Zap className="w-4 h-4" />,
              label: rule.trigger_event,
              color: 'gray',
            }
            
            return (
              <div
                key={rule.id}
                className={`p-4 bg-dark-800/50 border rounded-2xl transition-colors ${
                  rule.is_active ? 'border-dark-700' : 'border-dark-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Event Badge */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 bg-${eventConfig.color}-500/20 text-${eventConfig.color}-400 rounded-full text-xs font-medium`}>
                        {eventConfig.icon}
                        {eventConfig.label}
                      </span>
                      <span className="text-lg font-medium text-white">
                        {rule.rule_name}
                      </span>
                    </div>
                    
                    {/* Rule Logic */}
                    <div className="flex items-center gap-2 text-sm">
                      {rule.from_pipeline && (
                        <>
                          <span className="text-dark-400">SE deal em</span>
                          <span className="px-2 py-0.5 bg-dark-700 rounded text-white">
                            {rule.from_pipeline.name}
                          </span>
                          {rule.from_stage && (
                            <>
                              <span className="text-dark-400">→</span>
                              <span 
                                className="px-2 py-0.5 rounded text-white"
                                style={{ backgroundColor: rule.from_stage.color + '40' }}
                              >
                                {rule.from_stage.name}
                              </span>
                            </>
                          )}
                        </>
                      )}
                      
                      {!rule.from_pipeline && (
                        <span className="text-dark-400">Qualquer deal</span>
                      )}
                      
                      <ArrowRight className="w-4 h-4 text-primary-400 mx-2" />
                      
                      {rule.to_pipeline && (
                        <>
                          <span className="text-dark-400">mover para</span>
                          <span className="px-2 py-0.5 bg-dark-700 rounded text-white">
                            {rule.to_pipeline.name}
                          </span>
                          {rule.to_stage && (
                            <>
                              <span className="text-dark-400">→</span>
                              <span 
                                className="px-2 py-0.5 rounded text-white"
                                style={{ backgroundColor: rule.to_stage.color + '40' }}
                              >
                                {rule.to_stage.name}
                              </span>
                            </>
                          )}
                        </>
                      )}
                      
                      {rule.mark_as_won && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                          Marcar como Ganho
                        </span>
                      )}
                      
                      {rule.mark_as_lost && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                          Marcar como Perdido
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.is_active}
                        onChange={() => handleToggleRule(rule)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-dark-600 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-dark-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rule Modal */}
      <AnimatePresence>
        {showModal && (
          <RuleModal
            rule={editingRule}
            pipelines={pipelines}
            onClose={() => {
              setShowModal(false)
              setEditingRule(null)
              setError('')
            }}
            onSave={handleSaveRule}
            saving={saving}
            error={error}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// =============================================
// Rule Modal Component
// =============================================

function RuleModal({
  rule,
  pipelines,
  onClose,
  onSave,
  saving,
  error,
}: {
  rule: TransitionRule | null
  pipelines: Pipeline[]
  onClose: () => void
  onSave: (data: any) => void
  saving: boolean
  error: string
}) {
  const [formData, setFormData] = useState({
    ruleName: rule?.rule_name || '',
    triggerEvent: rule?.trigger_event || 'orders/paid',
    fromPipelineId: rule?.from_pipeline_id || '',
    fromStageId: rule?.from_stage_id || '',
    toPipelineId: rule?.to_pipeline_id || '',
    toStageId: rule?.to_stage_id || '',
    minOrderValue: rule?.min_order_value || '',
    markAsWon: rule?.mark_as_won || false,
    markAsLost: rule?.mark_as_lost || false,
  })

  const getStages = (pipelineId: string) => {
    if (!pipelineId) return []
    return pipelines.find(p => p.id === pipelineId)?.stages
      .sort((a, b) => a.sort_order - b.sort_order) || []
  }

  const handleSubmit = () => {
    if (!formData.ruleName.trim()) return
    if (!formData.triggerEvent) return
    if (!formData.toPipelineId || !formData.toStageId) return
    
    onSave({
      ruleName: formData.ruleName,
      triggerEvent: formData.triggerEvent,
      fromPipelineId: formData.fromPipelineId || null,
      fromStageId: formData.fromStageId || null,
      toPipelineId: formData.toPipelineId,
      toStageId: formData.toStageId,
      minOrderValue: formData.minOrderValue ? parseFloat(formData.minOrderValue as string) : null,
      markAsWon: formData.markAsWon,
      markAsLost: formData.markAsLost,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">
            {rule ? 'Editar Regra' : 'Nova Regra de Automação'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Rule Name */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Nome da Regra *
            </label>
            <input
              type="text"
              value={formData.ruleName}
              onChange={(e) => setFormData(prev => ({ ...prev, ruleName: e.target.value }))}
              placeholder="Ex: Mover para Enviado quando pago"
              className="w-full px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          {/* Trigger Event */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Quando acontecer *
            </label>
            <select
              value={formData.triggerEvent}
              onChange={(e) => setFormData(prev => ({ ...prev, triggerEvent: e.target.value }))}
              className="w-full px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
            >
              <option value="customers/create">👤 Cliente Criado</option>
              <option value="orders/create">🛒 Pedido Criado</option>
              <option value="orders/paid">💳 Pedido Pago</option>
              <option value="orders/fulfilled">📦 Pedido Enviado</option>
              <option value="orders/cancelled">❌ Pedido Cancelado</option>
            </select>
          </div>

          {/* From Condition */}
          <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
            <label className="block text-sm font-medium text-white mb-3">
              SE o deal estiver em (opcional)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <select
                  value={formData.fromPipelineId}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    fromPipelineId: e.target.value,
                    fromStageId: '',
                  }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                >
                  <option value="">Qualquer pipeline</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={formData.fromStageId}
                  onChange={(e) => setFormData(prev => ({ ...prev, fromStageId: e.target.value }))}
                  disabled={!formData.fromPipelineId}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50"
                >
                  <option value="">Qualquer estágio</option>
                  {getStages(formData.fromPipelineId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* To Action */}
          <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl">
            <label className="block text-sm font-medium text-white mb-3">
              ENTÃO mover para *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <select
                  value={formData.toPipelineId}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    toPipelineId: e.target.value,
                    toStageId: '',
                  }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                >
                  <option value="">Selecione pipeline</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={formData.toStageId}
                  onChange={(e) => setFormData(prev => ({ ...prev, toStageId: e.target.value }))}
                  disabled={!formData.toPipelineId}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500 disabled:opacity-50"
                >
                  <option value="">Selecione estágio</option>
                  {getStages(formData.toPipelineId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Additional Actions */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dark-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.markAsWon}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    markAsWon: e.target.checked,
                    markAsLost: e.target.checked ? false : prev.markAsLost,
                  }))}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-green-500 focus:ring-green-500"
                />
                <span className="text-sm text-white">Marcar como Ganho</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.markAsLost}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    markAsLost: e.target.checked,
                    markAsWon: e.target.checked ? false : prev.markAsWon,
                  }))}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-white">Marcar como Perdido</span>
              </label>
            </div>
          </div>

          {/* Min Value Filter */}
          <div>
            <label className="block text-sm text-dark-400 mb-2">
              Valor mínimo do pedido (opcional)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-dark-400">R$</span>
              <input
                type="number"
                value={formData.minOrderValue}
                onChange={(e) => setFormData(prev => ({ ...prev, minOrderValue: e.target.value }))}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="flex-1 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
          <button
            onClick={onClose}
            className="px-5 py-2 text-dark-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.ruleName || !formData.toPipelineId || !formData.toStageId}
            className="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Salvar Regra
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default AutomationRulesTab
