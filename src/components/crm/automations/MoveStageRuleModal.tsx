'use client'

// =============================================
// Move Stage Rule Modal
// src/components/crm/automations/MoveStageRuleModal.tsx
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
  ArrowRight,
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
  from_stage_id?: string | null
  target_stage_id?: string | null
  target_stage?: { id: string; name: string; color: string }
  mark_as_won?: boolean
  mark_as_lost?: boolean
  is_enabled: boolean
}

interface Integration {
  id: string
  type: string
  name: string
  isConnected: boolean
}

interface Pipeline {
  id: string
  name: string
  color: string
  stages: Array<{ id: string; name: string; color: string; position: number }>
}

interface MoveStageRuleModalProps {
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

// Eventos para mover estágios
const MOVE_EVENTS: Record<string, Array<{ id: string; label: string; description: string }>> = {
  shopify: [
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado' },
    { id: 'order_fulfilled', label: 'Pedido Enviado', description: 'Quando pedido sai para entrega' },
    { id: 'order_delivered', label: 'Pedido Entregue', description: 'Quando pedido é entregue' },
    { id: 'order_cancelled', label: 'Pedido Cancelado', description: 'Quando pedido é cancelado' },
    { id: 'order_refunded', label: 'Pedido Reembolsado', description: 'Quando há reembolso' },
  ],
  whatsapp: [
    { id: 'conversation_resolved', label: 'Conversa Resolvida', description: 'Quando conversa é marcada como resolvida' },
    { id: 'agent_assigned', label: 'Agente Atribuído', description: 'Quando agente é atribuído' },
  ],
  hotmart: [
    { id: 'purchase_approved', label: 'Compra Aprovada', description: 'Quando compra é aprovada' },
    { id: 'purchase_canceled', label: 'Compra Cancelada', description: 'Quando compra é cancelada' },
    { id: 'purchase_refunded', label: 'Compra Reembolsada', description: 'Quando há reembolso' },
    { id: 'subscription_canceled', label: 'Assinatura Cancelada', description: 'Quando assinatura é cancelada' },
  ],
  woocommerce: [
    { id: 'order_paid', label: 'Pedido Pago', description: 'Quando pagamento é confirmado' },
    { id: 'order_completed', label: 'Pedido Concluído', description: 'Pedido finalizado' },
    { id: 'order_cancelled', label: 'Pedido Cancelado', description: 'Quando pedido é cancelado' },
    { id: 'order_refunded', label: 'Pedido Reembolsado', description: 'Quando há reembolso' },
  ],
  webhook: [
    { id: 'webhook_received', label: 'Webhook Recebido', description: 'Evento customizado' },
  ],
}

// =============================================
// MAIN COMPONENT
// =============================================

export function MoveStageRuleModal({
  isOpen,
  onClose,
  onSave,
  rule,
  selectedSource,
  integrations,
  pipelines,
}: MoveStageRuleModalProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // Form state
  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [triggerEvent, setTriggerEvent] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [fromStageId, setFromStageId] = useState('')
  const [targetStageId, setTargetStageId] = useState('')
  const [dealStatus, setDealStatus] = useState<'keep' | 'won' | 'lost'>('keep')
  const [isEnabled, setIsEnabled] = useState(true)

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
        setFromStageId(rule.from_stage_id || '')
        setTargetStageId(rule.target_stage_id || '')
        setDealStatus(rule.mark_as_won ? 'won' : rule.mark_as_lost ? 'lost' : 'keep')
        setIsEnabled(rule.is_enabled)
      } else {
        // Create mode
        setName('')
        setSourceType(selectedSource || '')
        setTriggerEvent('')
        setPipelineId(pipelines[0]?.id || '')
        setFromStageId('')
        setTargetStageId('')
        setDealStatus('keep')
        setIsEnabled(true)
      }
      setError('')
    }
  }, [isOpen, rule, selectedSource, pipelines])

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
    if (!targetStageId) {
      setError('Selecione o estágio de destino')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        organizationId,
        name: name.trim(),
        source_type: sourceType,
        trigger_event: triggerEvent,
        action_type: 'move_stage',
        pipeline_id: pipelineId,
        from_stage_id: fromStageId || null,
        target_stage_id: targetStageId,
        mark_as_won: dealStatus === 'won',
        mark_as_lost: dealStatus === 'lost',
        is_enabled: isEnabled,
        filters: {},
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
  const availableEvents = sourceType ? MOVE_EVENTS[sourceType] || [] : []
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
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <ArrowRight className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {rule ? 'Editar Regra' : 'Nova Regra'} - Mover Estágio
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
                placeholder="Ex: Pedido pago → Ganho"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-blue-500 transition-colors"
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
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                          }
                        `}
                      >
                        <IntIcon className={`w-6 h-6 ${isSelected ? 'text-blue-400' : 'text-dark-400'}`} />
                        <span className={`text-sm ${isSelected ? 'text-blue-400' : 'text-dark-300'}`}>
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
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-medium ${triggerEvent === event.id ? 'text-blue-400' : 'text-white'}`}>
                            {event.label}
                          </p>
                          <p className="text-sm text-dark-400">{event.description}</p>
                        </div>
                        {triggerEvent === event.id && (
                          <CheckCircle className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline & Stages */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Ação <span className="text-red-400">*</span>
              </label>
              
              <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl space-y-4">
                {/* Pipeline */}
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Pipeline</label>
                  <div className="relative">
                    <select
                      value={pipelineId}
                      onChange={e => {
                        setPipelineId(e.target.value)
                        setFromStageId('')
                        setTargetStageId('')
                      }}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white appearance-none focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">Selecionar...</option>
                      {pipelines.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
                  </div>
                </div>

                {/* From Stage */}
                <div>
                  <label className="block text-xs text-dark-500 mb-1">De Estágio (opcional)</label>
                  <div className="relative">
                    <select
                      value={fromStageId}
                      onChange={e => setFromStageId(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white appearance-none focus:outline-none focus:border-blue-500 transition-colors"
                      disabled={!pipelineId}
                    >
                      <option value="">Qualquer estágio</option>
                      {selectedPipeline?.stages?.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-dark-500 mt-1">Deixe vazio para mover de qualquer estágio</p>
                </div>

                {/* To Stage */}
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Para Estágio <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <select
                      value={targetStageId}
                      onChange={e => setTargetStageId(e.target.value)}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white appearance-none focus:outline-none focus:border-blue-500 transition-colors"
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
            </div>

            {/* Deal Status */}
            <div>
              <label className="block text-sm text-dark-400 mb-2">
                Status do Deal
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setDealStatus('keep')}
                  className={`
                    w-full p-3 rounded-xl border-2 transition-all text-left
                    ${dealStatus === 'keep'
                      ? 'border-dark-500 bg-dark-700/50'
                      : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                    }
                  `}
                >
                  <p className={`font-medium ${dealStatus === 'keep' ? 'text-white' : 'text-dark-300'}`}>
                    Manter status atual
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDealStatus('won')}
                  className={`
                    w-full p-3 rounded-xl border-2 transition-all text-left
                    ${dealStatus === 'won'
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                    }
                  `}
                >
                  <p className={`font-medium ${dealStatus === 'won' ? 'text-green-400' : 'text-dark-300'}`}>
                    Marcar como Ganho (Won)
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDealStatus('lost')}
                  className={`
                    w-full p-3 rounded-xl border-2 transition-all text-left
                    ${dealStatus === 'lost'
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-dark-700 hover:border-dark-600 bg-dark-900'
                    }
                  `}
                >
                  <p className={`font-medium ${dealStatus === 'lost' ? 'text-red-400' : 'text-dark-300'}`}>
                    Marcar como Perdido (Lost)
                  </p>
                </button>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-dark-900 border border-dark-700 rounded-xl">
              <div>
                <p className="text-sm text-white">Regra Ativa</p>
                <p className="text-xs text-dark-500">Regras inativas não movem deals</p>
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
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
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
