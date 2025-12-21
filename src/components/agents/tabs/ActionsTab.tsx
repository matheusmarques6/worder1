'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Power,
  PowerOff,
  ShoppingCart,
  HelpCircle,
  RotateCcw,
  User,
  DollarSign,
  Truck,
  Package,
  AlertTriangle,
  Smile,
  Frown,
  Meh,
  Heart,
  MessageSquare,
  ArrowRight,
  Send,
  BookOpen,
  Ban,
  Sparkles,
  X,
  Info,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { AgentAction, ActionCondition, ActionDo } from '../AIAgentEditor'

interface ActionsTabProps {
  agentId: string
  organizationId: string
  actions: AgentAction[]
  onActionsChange: (actions: AgentAction[]) => void
  onRefresh: () => void
}

// Preset conditions
const intentPresets = [
  { id: 'buy', label: 'Cliente quer comprar', icon: ShoppingCart },
  { id: 'support', label: 'Cliente precisa de suporte', icon: HelpCircle },
  { id: 'refund', label: 'Cliente quer reembolso', icon: RotateCcw },
  { id: 'human', label: 'Cliente quer falar com humano', icon: User },
  { id: 'price', label: 'Cliente pergunta sobre preço', icon: DollarSign },
  { id: 'delivery', label: 'Cliente pergunta sobre entrega', icon: Truck },
  { id: 'availability', label: 'Cliente pergunta disponibilidade', icon: Package },
  { id: 'complaint', label: 'Cliente faz reclamação', icon: AlertTriangle },
]

const sentimentPresets = [
  { id: 'frustrated', label: 'Frustrado', icon: Frown, color: 'text-red-400' },
  { id: 'confused', label: 'Confuso', icon: HelpCircle, color: 'text-yellow-400' },
  { id: 'happy', label: 'Satisfeito', icon: Smile, color: 'text-green-400' },
  { id: 'neutral', label: 'Neutro', icon: Meh, color: 'text-dark-400' },
  { id: 'sad', label: 'Triste', icon: Frown, color: 'text-blue-400' },
]

const actionTypePresets = [
  { id: 'transfer', label: 'Transferir para', icon: ArrowRight, color: 'bg-blue-500/20 text-blue-400' },
  { id: 'exact_message', label: 'Enviar mensagem exata', icon: Send, color: 'bg-green-500/20 text-green-400' },
  { id: 'use_source', label: 'Usar fonte específica', icon: BookOpen, color: 'bg-purple-500/20 text-purple-400' },
  { id: 'ask_for', label: 'Pedir dados do cliente', icon: MessageSquare, color: 'bg-orange-500/20 text-orange-400' },
  { id: 'dont_mention', label: 'Nunca mencionar', icon: Ban, color: 'bg-red-500/20 text-red-400' },
  { id: 'bring_up', label: 'Tentar abordar tópico', icon: Sparkles, color: 'bg-yellow-500/20 text-yellow-400' },
]

export default function ActionsTab({
  agentId,
  organizationId,
  actions,
  onActionsChange,
  onRefresh,
}: ActionsTabProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Create new action
  const handleCreateAction = async (action: Partial<AgentAction>) => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...action,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar ação')
      }

      setShowCreateModal(false)
      onRefresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Update action
  const handleUpdateAction = async (actionId: string, updates: Partial<AgentAction>) => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions/${actionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...updates,
        }),
      })

      if (res.ok) {
        onRefresh()
      }
    } catch (err) {
      console.error('Error updating action:', err)
    }
  }

  // Delete action
  const handleDeleteAction = async (actionId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta ação?')) return

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions/${actionId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        onActionsChange(actions.filter(a => a.id !== actionId))
      }
    } catch (err) {
      console.error('Error deleting action:', err)
    }
  }

  // Toggle action active
  const handleToggleActive = (action: AgentAction) => {
    handleUpdateAction(action.id, { is_active: !action.is_active })
    onActionsChange(actions.map(a => 
      a.id === action.id ? { ...a, is_active: !a.is_active } : a
    ))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Ações</h3>
            <p className="text-sm text-dark-400">Configure regras "Quando... Fazer..."</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-500">{actions.length}/20 ações</span>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={actions.length >= 20}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-dark-600 text-white disabled:text-dark-400 rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Ação
          </button>
        </div>
      </div>

      {/* Actions List */}
      {actions.length === 0 ? (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-dark-500" />
          </div>
          <h4 className="text-lg font-medium text-white mb-2">Nenhuma ação configurada</h4>
          <p className="text-sm text-dark-400 mb-4 max-w-md mx-auto">
            Crie regras para definir como o agente deve responder em situações específicas,
            como transferir para um humano quando o cliente está frustrado.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Primeira Ação
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <ActionCard
              key={action.id}
              action={action}
              index={index}
              expanded={expandedAction === action.id}
              onToggleExpand={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
              onToggleActive={() => handleToggleActive(action)}
              onEdit={() => setEditingAction(action)}
              onDelete={() => handleDeleteAction(action.id)}
            />
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-4">
        <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          Como as ações funcionam?
        </h4>
        <p className="text-sm text-dark-400">
          Ações são executadas na ordem de prioridade. Quando uma mensagem chega, o sistema verifica
          cada ação e executa a primeira que corresponder às condições. Use análise de intenção
          e sentimento para criar experiências personalizadas.
        </p>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {(showCreateModal || editingAction) && (
          <ActionBuilderModal
            action={editingAction}
            onClose={() => { setShowCreateModal(false); setEditingAction(null); setError(''); }}
            onSave={editingAction 
              ? (a) => handleUpdateAction(editingAction.id, a) 
              : handleCreateAction
            }
            loading={loading}
            error={error}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Action Card Component
function ActionCard({
  action,
  index,
  expanded,
  onToggleExpand,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  action: AgentAction
  index: number
  expanded: boolean
  onToggleExpand: () => void
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const conditionsCount = action.conditions?.items?.length || 0
  const actionsCount = action.actions?.length || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-dark-800/50 border rounded-xl overflow-hidden transition-colors ${
        action.is_active ? 'border-dark-700/50' : 'border-dark-800 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button className="cursor-grab text-dark-600 hover:text-dark-400">
          <GripVertical className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            action.is_active ? 'bg-yellow-500/20' : 'bg-dark-700'
          }`}>
            <Zap className={`w-4 h-4 ${action.is_active ? 'text-yellow-400' : 'text-dark-500'}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-medium truncate">{action.name}</h4>
            <p className="text-xs text-dark-500">
              {conditionsCount} {conditionsCount === 1 ? 'condição' : 'condições'} → {actionsCount} {actionsCount === 1 ? 'ação' : 'ações'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {action.times_triggered > 0 && (
            <span className="text-xs px-2 py-1 rounded-full bg-dark-700 text-dark-400">
              {action.times_triggered}x
            </span>
          )}
          
          <button
            onClick={onToggleActive}
            className={`p-2 rounded-lg transition-colors ${
              action.is_active
                ? 'bg-green-500/20 text-green-400'
                : 'bg-dark-700 text-dark-500'
            }`}
          >
            {action.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>

          <button
            onClick={onToggleExpand}
            className="p-2 rounded-lg bg-dark-700/50 text-dark-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-700/50"
          >
            <div className="p-4 space-y-4">
              {/* Conditions */}
              <div>
                <p className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <span className="text-yellow-400">QUANDO</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-400">
                    {action.conditions?.match_type === 'all' ? 'TODAS' : 'QUALQUER'}
                  </span>
                </p>
                <div className="space-y-2">
                  {action.conditions?.items?.map((condition, i) => (
                    <ConditionBadge key={i} condition={condition} />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <p className="text-sm font-medium text-dark-300 mb-2">
                  <span className="text-green-400">FAZER</span>
                </p>
                <div className="space-y-2">
                  {action.actions?.map((actionDo, i) => (
                    <ActionBadge key={i} action={actionDo} />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-dark-700/50">
                <button
                  onClick={onEdit}
                  className="flex-1 py-2 bg-dark-700/50 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={onDelete}
                  className="py-2 px-4 bg-dark-700/50 hover:bg-red-500/10 text-dark-400 hover:text-red-400 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Condition Badge
function ConditionBadge({ condition }: { condition: ActionCondition }) {
  let label = ''
  let Icon = HelpCircle
  let color = 'text-dark-400'

  if (condition.type === 'intent') {
    const preset = intentPresets.find(p => p.id === condition.intent)
    label = preset?.label || condition.custom_intent || 'Intenção'
    Icon = preset?.icon || MessageSquare
    color = 'text-blue-400'
  } else if (condition.type === 'sentiment') {
    const preset = sentimentPresets.find(p => p.id === condition.sentiment)
    label = `Sentimento: ${preset?.label || condition.sentiment}`
    Icon = preset?.icon || Meh
    color = preset?.color || 'text-dark-400'
  } else if (condition.type === 'contains') {
    label = `Contém: ${condition.keywords?.join(', ')}`
    Icon = MessageSquare
    color = 'text-purple-400'
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-900/50 rounded-lg">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-dark-300">{label}</span>
    </div>
  )
}

// Action Badge
function ActionBadge({ action }: { action: ActionDo }) {
  const preset = actionTypePresets.find(p => p.id === action.type)
  const Icon = preset?.icon || Zap

  let description = preset?.label || action.type
  if (action.type === 'exact_message' && action.message) {
    description = `Enviar: "${action.message.slice(0, 50)}${action.message.length > 50 ? '...' : ''}"`
  } else if (action.type === 'ask_for') {
    description = `Pedir: ${action.ask_field || action.custom_field}`
  } else if (action.type === 'dont_mention' && action.topic) {
    description = `Não mencionar: ${action.topic}`
  } else if (action.type === 'bring_up' && action.topic) {
    description = `Abordar: ${action.topic}`
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${preset?.color || 'bg-dark-700 text-dark-400'}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm">{description}</span>
    </div>
  )
}

// Action Builder Modal
function ActionBuilderModal({
  action,
  onClose,
  onSave,
  loading,
  error,
}: {
  action: AgentAction | null
  onClose: () => void
  onSave: (action: Partial<AgentAction>) => void
  loading: boolean
  error: string
}) {
  const [name, setName] = useState(action?.name || '')
  const [matchType, setMatchType] = useState<'all' | 'any'>(action?.conditions?.match_type || 'all')
  const [conditions, setConditions] = useState<ActionCondition[]>(action?.conditions?.items || [])
  const [actionsDo, setActionsDo] = useState<ActionDo[]>(action?.actions || [])
  const [step, setStep] = useState(1)

  const addCondition = (type: string, value: any) => {
    const newCondition: ActionCondition = {
      id: Date.now().toString(),
      type: type as any,
      ...value,
    }
    setConditions([...conditions, newCondition])
  }

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id))
  }

  const addAction = (type: string, value: any) => {
    const newAction: ActionDo = {
      id: Date.now().toString(),
      type: type as any,
      ...value,
    }
    setActionsDo([...actionsDo, newAction])
  }

  const removeAction = (id: string) => {
    setActionsDo(actionsDo.filter(a => a.id !== id))
  }

  const handleSave = () => {
    if (!name.trim() || conditions.length === 0 || actionsDo.length === 0) return

    onSave({
      name,
      conditions: { match_type: matchType, items: conditions },
      actions: actionsDo,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-dark-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-dark-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold text-white">
            {action ? 'Editar Ação' : 'Nova Ação'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 p-4 border-b border-dark-700">
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === s
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : step > s
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-dark-700/50 text-dark-400'
              }`}
            >
              {s}. {s === 1 ? 'Nome' : s === 2 ? 'Quando' : 'Fazer'}
              {step > s && <CheckCircle className="w-3.5 h-3.5 inline ml-1" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome da ação</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Transferir cliente frustrado"
                  className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-yellow-500/50"
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-dark-900/50 rounded-lg">
                <Info className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-dark-400">
                  Dê um nome descritivo para identificar facilmente o que esta ação faz.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Match Type */}
              <div className="flex items-center gap-2 p-3 bg-dark-900/50 rounded-lg">
                <span className="text-sm text-dark-300">Executar quando</span>
                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as 'all' | 'any')}
                  className="px-3 py-1 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm"
                >
                  <option value="all">TODAS as condições</option>
                  <option value="any">QUALQUER condição</option>
                </select>
                <span className="text-sm text-dark-300">forem verdadeiras</span>
              </div>

              {/* Existing Conditions */}
              {conditions.length > 0 && (
                <div className="space-y-2">
                  {conditions.map((condition) => (
                    <div key={condition.id} className="flex items-center gap-2">
                      <ConditionBadge condition={condition} />
                      <button
                        onClick={() => removeCondition(condition.id)}
                        className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Condition */}
              <div>
                <p className="text-sm font-medium text-dark-300 mb-2">Adicionar condição</p>
                <div className="grid grid-cols-2 gap-2">
                  {intentPresets.slice(0, 4).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => addCondition('intent', { intent: preset.id })}
                      className="flex items-center gap-2 p-3 bg-dark-900/50 rounded-lg hover:bg-dark-900 text-left transition-colors"
                    >
                      <preset.icon className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-dark-300">{preset.label}</span>
                    </button>
                  ))}
                </div>

                <p className="text-xs text-dark-500 mt-3 mb-2">Sentimento do cliente</p>
                <div className="flex gap-2">
                  {sentimentPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => addCondition('sentiment', { sentiment: preset.id })}
                      className="flex items-center gap-2 px-3 py-2 bg-dark-900/50 rounded-lg hover:bg-dark-900 transition-colors"
                    >
                      <preset.icon className={`w-4 h-4 ${preset.color}`} />
                      <span className="text-xs text-dark-300">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Existing Actions */}
              {actionsDo.length > 0 && (
                <div className="space-y-2">
                  {actionsDo.map((actionDo) => (
                    <div key={actionDo.id} className="flex items-center gap-2">
                      <ActionBadge action={actionDo} />
                      <button
                        onClick={() => removeAction(actionDo.id)}
                        className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Action */}
              <div>
                <p className="text-sm font-medium text-dark-300 mb-2">Adicionar ação</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => addAction('transfer', { transfer_to: 'queue' })}
                    className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 text-left transition-colors"
                  >
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-blue-400">Transferir para fila</span>
                  </button>

                  <button
                    onClick={() => {
                      const message = prompt('Digite a mensagem exata:')
                      if (message) addAction('exact_message', { message })
                    }}
                    className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg hover:bg-green-500/20 text-left transition-colors"
                  >
                    <Send className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Enviar mensagem</span>
                  </button>

                  <button
                    onClick={() => {
                      const field = prompt('Qual dado pedir? (email, telefone, nome)')
                      if (field) addAction('ask_for', { ask_field: field })
                    }}
                    className="flex items-center gap-2 p-3 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 text-left transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 text-orange-400" />
                    <span className="text-sm text-orange-400">Pedir dados</span>
                  </button>

                  <button
                    onClick={() => {
                      const topic = prompt('Qual tópico não mencionar?')
                      if (topic) addAction('dont_mention', { topic })
                    }}
                    className="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg hover:bg-red-500/20 text-left transition-colors"
                  >
                    <Ban className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400">Não mencionar</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-dark-700">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              Voltar
            </button>
          )}
          
          <div className="flex-1" />

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !name.trim()}
              className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              Próximo
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={loading || conditions.length === 0 || actionsDo.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {action ? 'Salvar' : 'Criar Ação'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
