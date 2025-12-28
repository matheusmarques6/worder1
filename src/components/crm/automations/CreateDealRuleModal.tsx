'use client'

// =============================================
// Create Deal Rule Modal
// src/components/crm/automations/CreateDealRuleModal.tsx
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ShoppingCart,
  MessageCircle,
  Flame,
  CheckCircle,
  Loader2,
  ChevronDown,
  ShoppingBag,
  Link,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// =============================================
// TYPES
// =============================================

interface AutomationRule {
  id: string
  name: string
  source_type: string
  trigger_event: string
  action_type: string
  filters: Record<string, any>
  pipeline_id: string
  pipeline?: { id: string; name: string; color: string }
  initial_stage_id: string | null
  initial_stage?: { id: string; name: string; color: string }
  is_enabled: boolean
}

interface Integration {
  id: string
  type: string
  name: string
  isConnected: boolean
  events: Array<{
    id: string
    label: string
    description: string
    category: string
  }>
}

interface Pipeline {
  id: string
  name: string
  color: string
  stages: Array<{ id: string; name: string; color: string; position: number }>
}

interface CreateDealRuleModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  rule?: AutomationRule | null
  selectedSource?: string | null
  integrations: Integration[]
  pipelines: Pipeline[]
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

// Eventos disponíveis por fonte
const SOURCE_EVENTS: Record<string, Array<{ id: string; label: string; description: string }>> = {
  shopify: [
    { id: 'order_created', label: 'Pedido Criado', description: 'Quando um novo pedido é feito' },
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado' },
    { id: 'checkout_abandoned', label: 'Carrinho Abandonado', description: 'Checkout iniciado mas não finalizado' },
    { id: 'customer_created', label: 'Novo Cliente', description: 'Quando cliente se cadastra' },
  ],
  whatsapp: [
    { id: 'conversation_started', label: 'Nova Conversa', description: 'Primeira mensagem do cliente' },
    { id: 'message_received', label: 'Mensagem Recebida', description: 'Qualquer mensagem recebida' },
  ],
  hotmart: [
    { id: 'purchase_approved', label: 'Compra Aprovada', description: 'Quando compra é aprovada' },
    { id: 'purchase_canceled', label: 'Compra Cancelada', description: 'Quando compra é cancelada' },
    { id: 'subscription_active', label: 'Assinatura Ativa', description: 'Nova assinatura ativada' },
  ],
  woocommerce: [
    { id: 'order_created', label: 'Pedido Criado', description: 'Quando um novo pedido é feito' },
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado' },
    { id: 'order_completed', label: 'Pedido Concluído', description: 'Pedido finalizado' },
  ],
  webhook: [
    { id: 'webhook_received', label: 'Webhook Recebido', description: 'Evento customizado via webhook' },
  ],
}

// =============================================
// MAIN COMPONENT
// =============================================

export function CreateDealRuleModal({
  isOpen,
  onClose,
  onSave,
  rule,
  selectedSource,
  integrations,
  pipelines,
}: CreateDealRuleModalProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // Form state
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [triggerEvent, setTriggerEvent] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [isEnabled, setIsEnabled] = useState(true)
  
  // Filters
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [includeTags, setIncludeTags] = useState('')
  const [excludeTags, setExcludeTags] = useState('')
  const [avoidDuplicates, setAvoidDuplicates] = useState(true)
  
  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // =============================================
  // EFFECTS
  // =============================================

  useEffect(() => {
    if (isOpen) {
      if (rule) {
        // Edit mode
        setName(rule.name)
        setSourceType(rule.source_type)
        setTriggerEvent(rule.trigger_event)
        setPipelineId(rule.pipeline_id)
        setStageId(rule.initial_stage_id || '')
        setIsEnabled(rule.is_enabled)
        setMinValue(rule.filters?.min_value?.toString() || '')
        setMaxValue(rule.filters?.max_value?.toString() || '')
        setIncludeTags(rule.filters?.include_tags?.join(', ') || '')
        setExcludeTags(rule.filters?.exclude_tags?.join(', ') || '')
        setAvoidDuplicates(rule.filters?.avoid_duplicates !== false)
      } else {
        // Create mode
        setName('')
        setSourceType(selectedSource || '')
        setTriggerEvent('')
        setPipelineId(pipelines[0]?.id || '')
        setStageId('')
        setIsEnabled(true)
        setMinValue('')
        setMaxValue('')
        setIncludeTags('')
        setExcludeTags('')
        setAvoidDuplicates(true)
      }
      setError('')
    }
  }, [isOpen, rule, selectedSource, pipelines])

  // Auto-select first stage when pipeline changes
  useEffect(() => {
    if (pipelineId && !stageId) {
      const pipeline = pipelines.find(p => p.id === pipelineId)
      if (pipeline?.stages?.[0]) {
        setStageId(pipeline.stages[0].id)
      }
    }
  }, [pipelineId, stageId, pipelines])

  // =============================================
  // HANDLERS
  // =============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Nome da regra é obrigatório')
      return
    }
    if (!sourceType) {
      setError('Selecione uma fonte')
      return
    }
    if (!triggerEvent) {
      setError('Selecione um evento')
      return
    }
    if (!pipelineId) {
      setError('Selecione uma pipeline')
      return
    }
    if (!stageId) {
      setError('Selecione um estágio')
      return
    }

    setSaving(true)
    setError('')

    try {
      const filters: Record<string, any> = {
        avoid_duplicates: avoidDuplicates,
      }
      
      if (minValue) filters.min_value = parseFloat(minValue)
      if (maxValue) filters.max_value = parseFloat(maxValue)
      if (includeTags) filters.include_tags = includeTags.split(',').map(t => t.trim()).filter(Boolean)
      if (excludeTags) filters.exclude_tags = excludeTags.split(',').map(t => t.trim()).filter(Boolean)

      const payload = {
        organizationId,
        name: name.trim(),
        source_type: sourceType,
        trigger_event: triggerEvent,
        action_type: 'create_deal',
        pipeline_id: pipelineId,
        initial_stage_id: stageId,
        filters,
        is_enabled: isEnabled,
      }

      const url = rule
        ? `/api/automations/rules/${rule.id}`
        : '/api/automations/rules'

      const res = await fetch(url, {
        method: rule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar regra')
      }

      onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  const connectedSources = integrations.filter(i => i.isConnected)
  const selectedPipeline = pipelines.find(p => p.id === pipelineId)
  const availableEvents = sourceType ? SOURCE_EVENTS[sourceType] || [] : []
  const Icon = sourceType ? SOURCE_ICONS[sourceType] : null

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
          className="w-full max-w-xl bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-dark-700">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="p-2 bg-primary-500/20 rounded-lg">
                  <Icon className="w-5 h-5 text-primary-400" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {rule ? 'Editar Regra' : 'Nova Regra'} - Criar Deal
                </h2>
                {sourceType && (
                  <p className="text-sm text-dark-400">{SOURCE_NAMES[sourceType]}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Nome da Regra <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Pedido pago > R$500"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>

            {/* Source Selection */}
            {!selectedSource && (
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Fonte <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {connectedSources.map(integration => {
                    const IntIcon = SOURCE_ICONS[integration.type]
                    const isSelected = sourceType === integration.type
                    return (
                      <button
                        key={integration.type}
                        type="button"
                        onClick={() => {
                          setSourceType(integration.type)
                          setTriggerEvent('')
                        }}
                        className={`
                          p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2
                          ${isSelected
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                          }
                        `}
                      >
                        <IntIcon className={`w-6 h-6 ${isSelected ? 'text-primary-400' : 'text-dark-400'}`} />
                        <span className={`text-sm ${isSelected ? 'text-primary-400' : 'text-dark-300'}`}>
                          {SOURCE_NAMES[integration.type]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Event Selection */}
            {sourceType && (
              <div>
                <label className="block text-sm text-dark-400 mb-2">
                  Evento que Dispara <span className="text-red-400">*</span>
                </label>
                <div className="space-y-2">
                  {availableEvents.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setTriggerEvent(event.id)}
                      className={`
                        w-full p-4 rounded-xl border-2 transition-all text-left
                        ${triggerEvent === event.id
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-medium ${triggerEvent === event.id ? 'text-primary-400' : 'text-white'}`}>
                            {event.label}
                          </p>
                          <p className="text-sm text-dark-400">{event.description}</p>
                        </div>
                        {triggerEvent === event.id && (
                          <CheckCircle className="w-5 h-5 text-primary-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Filtros (opcional)
              </label>
              <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-dark-500 mb-1">Valor Mínimo (R$)</label>
                    <input
                      type="number"
                      value={minValue}
                      onChange={e => setMinValue(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-500 mb-1">Valor Máximo (R$)</label>
                    <input
                      type="number"
                      value={maxValue}
                      onChange={e => setMaxValue(e.target.value)}
                      placeholder="Sem limite"
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-dark-500 mb-1">Tags do Cliente (incluir)</label>
                  <input
                    type="text"
                    value={includeTags}
                    onChange={e => setIncludeTags(e.target.value)}
                    placeholder="vip, premium (separados por vírgula)"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                  <p className="text-xs text-dark-500 mt-1">Apenas clientes com estas tags</p>
                </div>

                <div>
                  <label className="block text-xs text-dark-500 mb-1">Tags do Cliente (excluir)</label>
                  <input
                    type="text"
                    value={excludeTags}
                    onChange={e => setExcludeTags(e.target.value)}
                    placeholder="teste, spam (separados por vírgula)"
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                  <p className="text-xs text-dark-500 mt-1">Ignorar clientes com estas tags</p>
                </div>
              </div>
            </div>

            {/* Pipeline & Stage */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Destino do Deal <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Pipeline</label>
                  <div className="relative">
                    <select
                      value={pipelineId}
                      onChange={e => {
                        setPipelineId(e.target.value)
                        setStageId('')
                      }}
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white appearance-none focus:outline-none focus:border-primary-500 transition-colors"
                    >
                      <option value="">Selecionar...</option>
                      {pipelines.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-dark-500 mb-1">Estágio Inicial</label>
                  <div className="relative">
                    <select
                      value={stageId}
                      onChange={e => setStageId(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white appearance-none focus:outline-none focus:border-primary-500 transition-colors"
                      disabled={!pipelineId}
                    >
                      <option value="">Selecionar...</option>
                      {selectedPipeline?.stages?.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-dark-500 mt-2">Deals criados entrarão neste estágio</p>
            </div>

            {/* Options */}
            <div className="flex items-center justify-between p-4 bg-dark-900 border border-dark-700 rounded-xl">
              <div>
                <p className="text-sm text-white">Evitar duplicados</p>
                <p className="text-xs text-dark-500">Não criar deal se já existir um aberto para o contato</p>
              </div>
              <button
                type="button"
                onClick={() => setAvoidDuplicates(!avoidDuplicates)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  avoidDuplicates ? 'bg-primary-500' : 'bg-dark-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  avoidDuplicates ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-dark-900 border border-dark-700 rounded-xl">
              <div>
                <p className="text-sm text-white">Regra Ativa</p>
                <p className="text-xs text-dark-500">Regras inativas não criam deals</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEnabled(!isEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isEnabled ? 'bg-green-500' : 'bg-dark-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  isEnabled ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-dark-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
