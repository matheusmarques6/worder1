'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  Plus,
  Search,
  Edit2,
  Trash2,
  Send,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  X,
  Filter,
  RefreshCw,
  Eye,
  Smile,
  Meh,
  Frown,
  Calendar,
  Mail,
  Phone,
  MessageCircle,
  Zap,
} from 'lucide-react'
import { useNPS, NPSSurvey, NPSResponse, CreateSurveyParams } from '@/hooks/useNPS'

// =============================================
// Types
// =============================================

interface NPSSurveysProps {
  organizationId: string
  storeId?: string | null
}

// =============================================
// Helper Functions
// =============================================

const getNPSColor = (score: number | string): string => {
  const numScore = typeof score === 'string' ? parseFloat(score) : score
  if (isNaN(numScore)) return 'text-slate-400'
  if (numScore >= 50) return 'text-emerald-400'
  if (numScore >= 0) return 'text-yellow-400'
  return 'text-red-400'
}

const getNPSLabel = (score: number | string): string => {
  const numScore = typeof score === 'string' ? parseFloat(score) : score
  if (isNaN(numScore)) return 'N/A'
  if (numScore >= 50) return 'Excelente'
  if (numScore >= 0) return 'Bom'
  return 'Precisa Melhorar'
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'promoter':
      return <Smile className="w-4 h-4 text-emerald-400" />
    case 'passive':
      return <Meh className="w-4 h-4 text-yellow-400" />
    case 'detractor':
      return <Frown className="w-4 h-4 text-red-400" />
    default:
      return null
  }
}

const getCategoryLabel = (category: string): string => {
  switch (category) {
    case 'promoter':
      return 'Promotor'
    case 'passive':
      return 'Neutro'
    case 'detractor':
      return 'Detrator'
    default:
      return category
  }
}

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'whatsapp':
      return <MessageCircle className="w-4 h-4" />
    case 'email':
      return <Mail className="w-4 h-4" />
    case 'sms':
      return <Phone className="w-4 h-4" />
    case 'in_app':
      return <Zap className="w-4 h-4" />
    default:
      return <MessageSquare className="w-4 h-4" />
  }
}

const getTriggerLabel = (trigger: string): string => {
  switch (trigger) {
    case 'manual':
      return 'Manual'
    case 'after_purchase':
      return 'Apos Compra'
    case 'after_close':
      return 'Apos Fechamento'
    case 'scheduled':
      return 'Agendado'
    default:
      return trigger
  }
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// =============================================
// Main Component
// =============================================

export function NPSSurveys({ organizationId, storeId }: NPSSurveysProps) {
  const {
    surveys,
    selectedSurvey,
    responses,
    isLoading,
    error,
    loadSurveys,
    loadSurvey,
    createSurvey,
    updateSurvey,
    deleteSurvey,
    sendSurvey,
  } = useNPS({ organizationId, storeId })

  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResponsesModal, setShowResponsesModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [editingSurvey, setEditingSurvey] = useState<NPSSurvey | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter surveys
  const filteredSurveys = useMemo(() => {
    return surveys.filter(survey => {
      const matchesSearch = survey.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        survey.question.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesActive = filterActive === 'all' ||
        (filterActive === 'active' && survey.is_active) ||
        (filterActive === 'inactive' && !survey.is_active)

      return matchesSearch && matchesActive
    })
  }, [surveys, searchQuery, filterActive])

  // Calculate overall stats
  const overallStats = useMemo(() => {
    const activeSurveys = surveys.filter(s => s.is_active).length
    const totalResponses = surveys.reduce((sum, s) => sum + s.total_responses, 0)
    const totalSent = surveys.reduce((sum, s) => sum + s.total_sent, 0)

    const totalPromoters = surveys.reduce((sum, s) => sum + s.promoters_count, 0)
    const totalPassives = surveys.reduce((sum, s) => sum + s.passives_count, 0)
    const totalDetractors = surveys.reduce((sum, s) => sum + s.detractors_count, 0)

    const avgNPS = totalResponses > 0
      ? Math.round(((totalPromoters - totalDetractors) / totalResponses) * 100)
      : 0

    const avgResponseRate = totalSent > 0
      ? Math.round((totalResponses / totalSent) * 100)
      : 0

    return {
      activeSurveys,
      totalResponses,
      avgNPS,
      avgResponseRate,
      totalPromoters,
      totalPassives,
      totalDetractors,
    }
  }, [surveys])

  // Handle view responses
  const handleViewResponses = async (survey: NPSSurvey) => {
    await loadSurvey(survey.id)
    setShowResponsesModal(true)
  }

  // Handle edit
  const handleEdit = (survey: NPSSurvey) => {
    setEditingSurvey(survey)
    setShowEditModal(true)
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await deleteSurvey(id)
      setDeletingId(null)
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  // Handle toggle active
  const handleToggleActive = async (survey: NPSSurvey) => {
    await updateSurvey(survey.id, { is_active: !survey.is_active })
  }

  // Handle send
  const handleSend = (survey: NPSSurvey) => {
    setEditingSurvey(survey)
    setShowSendModal(true)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Pesquisas Ativas</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.activeSurveys}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total Respostas</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.totalResponses}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              overallStats.avgNPS >= 50 ? 'bg-emerald-500/20' :
              overallStats.avgNPS >= 0 ? 'bg-yellow-500/20' : 'bg-red-500/20'
            }`}>
              {overallStats.avgNPS >= 50 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : overallStats.avgNPS >= 0 ? (
                <Minus className="w-5 h-5 text-yellow-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-slate-400">NPS Medio</p>
              <p className={`text-2xl font-bold ${getNPSColor(overallStats.avgNPS)}`}>
                {overallStats.avgNPS}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Taxa de Resposta</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.avgResponseRate}%</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Category Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
      >
        <h3 className="text-sm font-medium text-slate-400 mb-4">Distribuicao de Respostas</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 rounded-full overflow-hidden bg-slate-700 flex">
              {overallStats.totalResponses > 0 && (
                <>
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${(overallStats.totalPromoters / overallStats.totalResponses) * 100}%` }}
                  />
                  <div
                    className="h-full bg-yellow-500 transition-all"
                    style={{ width: `${(overallStats.totalPassives / overallStats.totalResponses) * 100}%` }}
                  />
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${(overallStats.totalDetractors / overallStats.totalResponses) * 100}%` }}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-400">Promotores</span>
              <span className="font-medium text-gray-900">{overallStats.totalPromoters}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-slate-400">Neutros</span>
              <span className="font-medium text-gray-900">{overallStats.totalPassives}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-400">Detratores</span>
              <span className="font-medium text-gray-900">{overallStats.totalDetractors}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar pesquisas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterActive(filter)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filterActive === filter
                    ? 'bg-violet-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter === 'all' ? 'Todas' : filter === 'active' ? 'Ativas' : 'Inativas'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadSurveys()}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Pesquisa
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Surveys List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredSurveys.map((survey, index) => (
            <motion.div
              key={survey.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* NPS Score */}
                <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center ${
                  typeof survey.nps_score === 'number' || !isNaN(parseFloat(String(survey.nps_score)))
                    ? parseFloat(String(survey.nps_score)) >= 50
                      ? 'bg-emerald-500/20'
                      : parseFloat(String(survey.nps_score)) >= 0
                        ? 'bg-yellow-500/20'
                        : 'bg-red-500/20'
                    : 'bg-slate-700/50'
                }`}>
                  <span className={`text-2xl font-bold ${getNPSColor(survey.nps_score)}`}>
                    {typeof survey.nps_score === 'number'
                      ? survey.nps_score
                      : isNaN(parseFloat(String(survey.nps_score)))
                        ? '--'
                        : parseFloat(String(survey.nps_score)).toFixed(0)}
                  </span>
                  <span className="text-xs text-slate-400">NPS</span>
                </div>

                {/* Survey Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-medium text-gray-900 truncate">{survey.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      survey.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-600/50 text-slate-400'
                    }`}>
                      {survey.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 line-clamp-1 mb-3">
                    {survey.question}
                  </p>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      {getChannelIcon(survey.channel)}
                      <span className="capitalize">{survey.channel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span>{getTriggerLabel(survey.trigger_type)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Send className="w-4 h-4" />
                      <span>{survey.total_sent} enviadas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <MessageSquare className="w-4 h-4" />
                      <span>{survey.total_responses} respostas</span>
                    </div>
                  </div>
                </div>

                {/* Response Rate */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm text-slate-400 mb-1">Taxa de Resposta</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {typeof survey.response_rate === 'number'
                      ? `${survey.response_rate}%`
                      : isNaN(parseFloat(String(survey.response_rate)))
                        ? '0%'
                        : `${parseFloat(String(survey.response_rate)).toFixed(1)}%`}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleViewResponses(survey)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Ver Respostas"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSend(survey)}
                    className="p-2 text-slate-400 hover:text-violet-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Enviar Pesquisa"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(survey)}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(survey)}
                    className={`p-2 hover:bg-slate-700 rounded-lg transition-colors ${
                      survey.is_active ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                    title={survey.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {survey.is_active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(survey.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      deletingId === survey.id
                        ? 'bg-red-500 text-white'
                        : 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                    }`}
                    title={deletingId === survey.id ? 'Clique novamente para confirmar' : 'Excluir'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {filteredSurveys.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || filterActive !== 'all'
                ? 'Nenhuma pesquisa encontrada'
                : 'Nenhuma pesquisa criada'}
            </h3>
            <p className="text-slate-400 mb-4">
              {searchQuery || filterActive !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Crie sua primeira pesquisa NPS para medir a satisfacao dos clientes'}
            </p>
            {!searchQuery && filterActive === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar Pesquisa
              </button>
            )}
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading && surveys.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
            <p className="text-slate-400">Carregando pesquisas...</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <SurveyModal
        isOpen={showCreateModal || showEditModal}
        onClose={() => {
          setShowCreateModal(false)
          setShowEditModal(false)
          setEditingSurvey(null)
        }}
        survey={editingSurvey}
        onSave={async (params) => {
          if (editingSurvey) {
            const success = await updateSurvey(editingSurvey.id, params)
            if (success) {
              setShowEditModal(false)
              setEditingSurvey(null)
            }
          } else {
            const result = await createSurvey(params as CreateSurveyParams)
            if (result) {
              setShowCreateModal(false)
            }
          }
        }}
      />

      {/* Responses Modal */}
      <ResponsesModal
        isOpen={showResponsesModal}
        onClose={() => setShowResponsesModal(false)}
        survey={selectedSurvey}
        responses={responses}
      />

      {/* Send Modal */}
      <SendSurveyModal
        isOpen={showSendModal}
        onClose={() => {
          setShowSendModal(false)
          setEditingSurvey(null)
        }}
        survey={editingSurvey}
        onSend={async (contactIds) => {
          if (editingSurvey) {
            const success = await sendSurvey(editingSurvey.id, contactIds)
            if (success) {
              setShowSendModal(false)
              setEditingSurvey(null)
            }
          }
        }}
      />
    </div>
  )
}

// =============================================
// Survey Modal Component
// =============================================

interface SurveyModalProps {
  isOpen: boolean
  onClose: () => void
  survey: NPSSurvey | null
  onSave: (params: Partial<NPSSurvey> | CreateSurveyParams) => Promise<void>
}

function SurveyModal({ isOpen, onClose, survey, onSave }: SurveyModalProps) {
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [triggerType, setTriggerType] = useState<'manual' | 'after_purchase' | 'after_close' | 'scheduled'>('manual')
  const [triggerDelayHours, setTriggerDelayHours] = useState(0)
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'sms' | 'in_app'>('whatsapp')
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when survey changes
  useState(() => {
    if (survey) {
      setName(survey.name)
      setQuestion(survey.question)
      setFollowUpQuestion(survey.follow_up_question || '')
      setTriggerType(survey.trigger_type)
      setTriggerDelayHours(survey.trigger_delay_hours)
      setChannel(survey.channel)
    } else {
      setName('')
      setQuestion('Em uma escala de 0 a 10, qual a probabilidade de voce recomendar nossa empresa para um amigo ou colega?')
      setFollowUpQuestion('')
      setTriggerType('manual')
      setTriggerDelayHours(0)
      setChannel('whatsapp')
    }
  })

  const handleSave = async () => {
    if (!name.trim() || !question.trim()) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        question: question.trim(),
        follow_up_question: followUpQuestion.trim() || undefined,
        trigger_type: triggerType,
        trigger_delay_hours: triggerDelayHours,
        channel,
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900">
            {survey ? 'Editar Pesquisa' : 'Nova Pesquisa NPS'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Nome da Pesquisa *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pesquisa de Satisfacao Q1"
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Pergunta Principal *
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Em uma escala de 0 a 10..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Pergunta de Acompanhamento (opcional)
            </label>
            <textarea
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              placeholder="O que podemos fazer para melhorar?"
              rows={2}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Canal de Envio
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="in_app">In-App</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Gatilho
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="manual">Manual</option>
                <option value="after_purchase">Apos Compra</option>
                <option value="after_close">Apos Fechamento</option>
                <option value="scheduled">Agendado</option>
              </select>
            </div>
          </div>

          {triggerType !== 'manual' && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Atraso do Gatilho (horas)
              </label>
              <input
                type="number"
                value={triggerDelayHours}
                onChange={(e) => setTriggerDelayHours(parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !question.trim() || isSaving}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {survey ? 'Salvar' : 'Criar Pesquisa'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Responses Modal Component
// =============================================

interface ResponsesModalProps {
  isOpen: boolean
  onClose: () => void
  survey: NPSSurvey | null
  responses: NPSResponse[]
}

function ResponsesModal({ isOpen, onClose, survey, responses }: ResponsesModalProps) {
  const [filterCategory, setFilterCategory] = useState<'all' | 'promoter' | 'passive' | 'detractor'>('all')

  const filteredResponses = useMemo(() => {
    if (filterCategory === 'all') return responses
    return responses.filter(r => r.category === filterCategory)
  }, [responses, filterCategory])

  const categoryStats = useMemo(() => {
    const promoters = responses.filter(r => r.category === 'promoter').length
    const passives = responses.filter(r => r.category === 'passive').length
    const detractors = responses.filter(r => r.category === 'detractor').length
    return { promoters, passives, detractors }
  }, [responses])

  if (!isOpen || !survey) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{survey.name}</h2>
            <p className="text-sm text-slate-400">{responses.length} respostas</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div className="flex-1 flex items-center gap-6">
              <button
                onClick={() => setFilterCategory('all')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  filterCategory === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Todas</span>
                <span className="px-2 py-0.5 bg-slate-600 rounded-full text-xs">{responses.length}</span>
              </button>
              <button
                onClick={() => setFilterCategory('promoter')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  filterCategory === 'promoter' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <Smile className="w-4 h-4" />
                <span>Promotores</span>
                <span className="px-2 py-0.5 bg-emerald-500/20 rounded-full text-xs">{categoryStats.promoters}</span>
              </button>
              <button
                onClick={() => setFilterCategory('passive')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  filterCategory === 'passive' ? 'bg-yellow-500/20 text-yellow-400' : 'text-slate-400 hover:text-yellow-400'
                }`}
              >
                <Meh className="w-4 h-4" />
                <span>Neutros</span>
                <span className="px-2 py-0.5 bg-yellow-500/20 rounded-full text-xs">{categoryStats.passives}</span>
              </button>
              <button
                onClick={() => setFilterCategory('detractor')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  filterCategory === 'detractor' ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-red-400'
                }`}
              >
                <Frown className="w-4 h-4" />
                <span>Detratores</span>
                <span className="px-2 py-0.5 bg-red-500/20 rounded-full text-xs">{categoryStats.detractors}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Responses List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredResponses.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                {responses.length === 0
                  ? 'Nenhuma resposta recebida ainda'
                  : 'Nenhuma resposta nesta categoria'}
              </p>
            </div>
          ) : (
            filteredResponses.map((response) => (
              <div
                key={response.id}
                className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4"
              >
                <div className="flex items-start gap-4">
                  {/* Score Badge */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold ${
                    response.category === 'promoter' ? 'bg-emerald-500/20 text-emerald-400' :
                    response.category === 'passive' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {response.score}
                  </div>

                  {/* Response Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getCategoryIcon(response.category)}
                      <span className={`text-sm font-medium ${
                        response.category === 'promoter' ? 'text-emerald-400' :
                        response.category === 'passive' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {getCategoryLabel(response.category)}
                      </span>
                      {response.contacts && (
                        <span className="text-sm text-slate-400">
                          - {response.contacts.first_name} {response.contacts.last_name}
                        </span>
                      )}
                    </div>

                    {response.feedback && (
                      <p className="text-white text-sm mt-2 whitespace-pre-wrap">
                        "{response.feedback}"
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateTime(response.responded_at)}
                      </span>
                      {response.channel && (
                        <span className="flex items-center gap-1">
                          {getChannelIcon(response.channel)}
                          {response.channel}
                        </span>
                      )}
                      {response.sentiment && (
                        <span className="px-2 py-0.5 bg-slate-600/50 rounded text-slate-300">
                          {response.sentiment}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Send Survey Modal Component
// =============================================

interface SendSurveyModalProps {
  isOpen: boolean
  onClose: () => void
  survey: NPSSurvey | null
  onSend: (contactIds: string[]) => Promise<void>
}

function SendSurveyModal({ isOpen, onClose, survey, onSend }: SendSurveyModalProps) {
  const [contactIds, setContactIds] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSend = async () => {
    const ids = contactIds.split('\n').map(id => id.trim()).filter(id => id.length > 0)
    if (ids.length === 0) return

    setIsSending(true)
    try {
      await onSend(ids)
      setContactIds('')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen || !survey) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-xl shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Enviar Pesquisa</h2>
            <p className="text-sm text-slate-400">{survey.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              IDs dos Contatos (um por linha)
            </label>
            <textarea
              value={contactIds}
              onChange={(e) => setContactIds(e.target.value)}
              placeholder="Cole aqui os IDs dos contatos..."
              rows={6}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              {contactIds.split('\n').filter(id => id.trim().length > 0).length} contatos selecionados
            </p>
          </div>

          <div className="bg-slate-700/30 rounded-lg p-3">
            <p className="text-sm text-slate-400">
              <strong className="text-white">Canal:</strong> {survey.channel}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              <strong className="text-white">Pergunta:</strong> {survey.question}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={contactIds.split('\n').filter(id => id.trim().length > 0).length === 0 || isSending}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isSending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar Pesquisa
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default NPSSurveys
