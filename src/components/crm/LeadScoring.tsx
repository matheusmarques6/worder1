'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame,
  Thermometer,
  Snowflake,
  TrendingUp,
  Target,
  Zap,
  Users,
  Search,
  RefreshCw,
  ChevronRight,
  X,
  Activity,
  MessageSquare,
  Mail,
  MousePointer,
  Calendar,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Eye,
  BarChart3,
  Lightbulb,
  FileText,
  Play,
} from 'lucide-react'
import { useLeadScoring, LeadScore, IntentSignal, ScoringStats } from '@/hooks/useLeadScoring'

// =============================================
// Types
// =============================================

interface LeadScoringProps {
  organizationId: string
}

// =============================================
// Helper Functions
// =============================================

const getScoreIcon = (label: 'hot' | 'warm' | 'cold') => {
  switch (label) {
    case 'hot':
      return <Flame className="w-5 h-5 text-red-400" />
    case 'warm':
      return <Thermometer className="w-5 h-5 text-orange-400" />
    case 'cold':
      return <Snowflake className="w-5 h-5 text-blue-400" />
  }
}

const getScoreGradient = (label: 'hot' | 'warm' | 'cold'): string => {
  switch (label) {
    case 'hot':
      return 'from-red-500/20 to-orange-500/20'
    case 'warm':
      return 'from-orange-500/20 to-yellow-500/20'
    case 'cold':
      return 'from-blue-500/20 to-cyan-500/20'
  }
}

const getScoreBorder = (label: 'hot' | 'warm' | 'cold'): string => {
  switch (label) {
    case 'hot':
      return 'border-red-500/30'
    case 'warm':
      return 'border-orange-500/30'
    case 'cold':
      return 'border-blue-500/30'
  }
}

const getIntentSignalIcon = (type: string) => {
  switch (type) {
    case 'proposal_requested':
      return <FileText className="w-4 h-4" />
    case 'pricing_viewed':
      return <DollarSign className="w-4 h-4" />
    case 'demo_requested':
    case 'demo_interest':
      return <Play className="w-4 h-4" />
    case 'meeting_scheduled':
      return <Calendar className="w-4 h-4" />
    case 'high_engagement':
      return <Activity className="w-4 h-4" />
    case 'email_engagement':
      return <Mail className="w-4 h-4" />
    case 'budget_inquiry':
      return <DollarSign className="w-4 h-4" />
    case 'urgency':
      return <AlertCircle className="w-4 h-4" />
    case 'closing_intent':
      return <CheckCircle className="w-4 h-4" />
    case 'comparison':
      return <BarChart3 className="w-4 h-4" />
    case 'pain_point':
      return <Lightbulb className="w-4 h-4" />
    case 'timeline':
      return <Clock className="w-4 h-4" />
    default:
      return <Zap className="w-4 h-4" />
  }
}

const formatDate = (dateStr: string): string => {
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

export function LeadScoring({ organizationId }: LeadScoringProps) {
  const {
    scores,
    stats,
    config,
    isLoading,
    error,
    loadScores,
    calculateScore,
    bulkCalculate,
    getScoreLabel,
    getScoreColor,
  } = useLeadScoring({ organizationId })

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<'all' | 'hot' | 'warm' | 'cold'>('all')
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedScore, setSelectedScore] = useState<LeadScore | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  // Filter scores
  const filteredScores = useMemo(() => {
    return scores.filter(score => {
      const matchesSearch =
        score.deals?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        score.deals?.contacts?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        score.deals?.contacts?.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        score.deals?.contacts?.email?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory = filterCategory === 'all' || getScoreLabel(score.total_score) === filterCategory

      return matchesSearch && matchesCategory
    })
  }, [scores, searchQuery, filterCategory, getScoreLabel])

  // Handle bulk calculate
  const handleBulkCalculate = async () => {
    setIsCalculating(true)
    try {
      await bulkCalculate()
    } finally {
      setIsCalculating(false)
    }
  }

  // Handle view details
  const handleViewDetails = (score: LeadScore) => {
    setSelectedScore(score)
    setShowDetailsModal(true)
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/30 flex items-center justify-center">
              <Flame className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Leads Quentes</p>
              <p className="text-2xl font-bold text-red-400">{stats.hot}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/30 flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Leads Mornos</p>
              <p className="text-2xl font-bold text-orange-400">{stats.warm}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/30 flex items-center justify-center">
              <Snowflake className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Leads Frios</p>
              <p className="text-2xl font-bold text-blue-400">{stats.cold}</p>
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
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Score Medio</p>
              <p className="text-2xl font-bold text-gray-900">{stats.average}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
            {(['all', 'hot', 'warm', 'cold'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
                  filterCategory === cat
                    ? cat === 'hot' ? 'bg-red-500/30 text-red-300' :
                      cat === 'warm' ? 'bg-orange-500/30 text-orange-300' :
                      cat === 'cold' ? 'bg-blue-500/30 text-blue-300' :
                      'bg-violet-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat !== 'all' && getScoreIcon(cat)}
                {cat === 'all' ? 'Todos' : cat === 'hot' ? 'Quentes' : cat === 'warm' ? 'Mornos' : 'Frios'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadScores()}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleBulkCalculate}
            disabled={isCalculating}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {isCalculating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Recalcular Todos
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Scores List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredScores.map((score, index) => {
            const label = getScoreLabel(score.total_score)
            return (
              <motion.div
                key={score.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.03 }}
                className={`bg-gradient-to-r ${getScoreGradient(label)} border ${getScoreBorder(label)} rounded-xl p-4 hover:bg-opacity-50 transition-colors cursor-pointer`}
                onClick={() => handleViewDetails(score)}
              >
                <div className="flex items-center gap-4">
                  {/* Score Badge */}
                  <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center ${
                    label === 'hot' ? 'bg-red-500/30' :
                    label === 'warm' ? 'bg-orange-500/30' :
                    'bg-blue-500/30'
                  }`}>
                    <span className={`text-2xl font-bold ${getScoreColor(score.total_score)}`}>
                      {score.total_score}
                    </span>
                    {getScoreIcon(label)}
                  </div>

                  {/* Lead Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {score.deals?.title || 'Lead sem titulo'}
                      </h3>
                    </div>

                    {score.deals?.contacts && (
                      <p className="text-sm text-slate-400 mb-2">
                        {score.deals.contacts.first_name} {score.deals.contacts.last_name}
                        {score.deals.contacts.email && ` - ${score.deals.contacts.email}`}
                      </p>
                    )}

                    {/* Score Breakdown */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-400">Engajamento:</span>
                        <span className="text-gray-900 font-medium">{score.engagement_score}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-violet-400" />
                        <span className="text-slate-400">Fit:</span>
                        <span className="text-gray-900 font-medium">{score.fit_score}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="text-slate-400">Intencao:</span>
                        <span className="text-gray-900 font-medium">{score.intent_score}</span>
                      </div>
                    </div>
                  </div>

                  {/* Intent Signals Preview */}
                  {score.intent_signals && score.intent_signals.length > 0 && (
                    <div className="flex-shrink-0">
                      <div className="flex items-center gap-1">
                        {score.intent_signals.slice(0, 3).map((signal, i) => (
                          <div
                            key={i}
                            className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center text-violet-400"
                            title={signal.description}
                          >
                            {getIntentSignalIcon(signal.type)}
                          </div>
                        ))}
                        {score.intent_signals.length > 3 && (
                          <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 text-xs">
                            +{score.intent_signals.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Deal Value */}
                  {score.deals?.value && score.deals.value > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm text-slate-400">Valor</p>
                      <p className="text-lg font-semibold text-emerald-400">
                        R$ {score.deals.value.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  )}

                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Empty State */}
        {filteredScores.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || filterCategory !== 'all'
                ? 'Nenhum lead encontrado'
                : 'Nenhum score calculado'}
            </h3>
            <p className="text-slate-400 mb-4">
              {searchQuery || filterCategory !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Clique em "Recalcular Todos" para gerar os scores dos leads'}
            </p>
            {!searchQuery && filterCategory === 'all' && (
              <button
                onClick={handleBulkCalculate}
                disabled={isCalculating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
              >
                <Zap className="w-4 h-4" />
                Calcular Scores
              </button>
            )}
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading && scores.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
            <p className="text-slate-400">Carregando scores...</p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <ScoreDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false)
          setSelectedScore(null)
        }}
        score={selectedScore}
        getScoreLabel={getScoreLabel}
        getScoreColor={getScoreColor}
      />
    </div>
  )
}

// =============================================
// Score Details Modal
// =============================================

interface ScoreDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  score: LeadScore | null
  getScoreLabel: (score: number) => 'hot' | 'warm' | 'cold'
  getScoreColor: (score: number) => string
}

function ScoreDetailsModal({
  isOpen,
  onClose,
  score,
  getScoreLabel,
  getScoreColor,
}: ScoreDetailsModalProps) {
  if (!isOpen || !score) return null

  const label = getScoreLabel(score.total_score)
  const factors = score.scoring_factors

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-[85vh] flex flex-col"
      >
        <div className={`flex items-center justify-between p-4 border-b border-slate-700 bg-gradient-to-r ${getScoreGradient(label)}`}>
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${
              label === 'hot' ? 'bg-red-500/30' :
              label === 'warm' ? 'bg-orange-500/30' :
              'bg-blue-500/30'
            }`}>
              <span className={`text-xl font-bold ${getScoreColor(score.total_score)}`}>
                {score.total_score}
              </span>
              {getScoreIcon(label)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {score.deals?.title || 'Lead Score'}
              </h2>
              <p className="text-sm text-slate-400">
                Atualizado em {formatDate(score.score_updated_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Score Breakdown */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Composicao do Score</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                <Activity className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{score.engagement_score}</p>
                <p className="text-sm text-slate-400">Engajamento</p>
                <div className="w-full h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${score.engagement_score}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                <Target className="w-6 h-6 text-violet-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{score.fit_score}</p>
                <p className="text-sm text-slate-400">Fit</p>
                <div className="w-full h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${score.fit_score}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                <Zap className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{score.intent_score}</p>
                <p className="text-sm text-slate-400">Intencao</p>
                <div className="w-full h-2 bg-slate-700 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 transition-all"
                    style={{ width: `${score.intent_score}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Intent Signals */}
          {score.intent_signals && score.intent_signals.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3">Sinais de Intencao</h3>
              <div className="space-y-2">
                {score.intent_signals.map((signal, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg"
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">
                      {getIntentSignalIcon(signal.type)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{signal.description}</p>
                      <p className="text-xs text-slate-400">{formatDate(signal.detected_at)}</p>
                    </div>
                    <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded text-xs font-medium">
                      +{signal.weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scoring Factors */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-3">Fatores de Scoring</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-slate-300">Emails Abertos</span>
                </div>
                <span className="font-medium text-gray-900">{factors.email_opens}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <MousePointer className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm text-slate-300">Cliques</span>
                </div>
                <span className="font-medium text-gray-900">{factors.email_clicks}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Mensagens Recebidas</span>
                </div>
                <span className="font-medium text-gray-900">{factors.messages_received}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-violet-400" />
                  <span className="text-sm text-slate-300">Visitas ao Site</span>
                </div>
                <span className="font-medium text-gray-900">{factors.website_visits}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-slate-300">Reuniao Agendada</span>
                </div>
                <span className={`font-medium ${factors.meeting_scheduled ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {factors.meeting_scheduled ? 'Sim' : 'Nao'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-slate-300">Proposta Solicitada</span>
                </div>
                <span className={`font-medium ${factors.proposal_requested ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {factors.proposal_requested ? 'Sim' : 'Nao'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-slate-300">Dias sem Contato</span>
                </div>
                <span className={`font-medium ${
                  factors.days_since_last_contact > 7 ? 'text-red-400' :
                  factors.days_since_last_contact > 3 ? 'text-yellow-400' : 'text-emerald-400'
                }`}>
                  {factors.days_since_last_contact}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Valor do Deal</span>
                </div>
                <span className="font-medium text-emerald-400">
                  R$ {factors.deal_value.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default LeadScoring
