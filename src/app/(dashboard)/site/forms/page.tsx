'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Plus,
  MagnifyingGlass,
  FunnelSimple,
  Eye,
  PencilSimple,
  Trash,
  Copy,
  DotsThree,
  ChartLineUp,
  CheckCircle,
  XCircle,
  Clock,
  TrendUp,
  TrendDown,
  CursorClick,
  UserPlus,
  CurrencyDollar,
  FileText,
  Lightning,
  ArrowSquareOut,
  Desktop,
  DeviceMobile,
  X,
  PaintBrush,
  Target,
  Timer,
  EnvelopeSimple,
  WhatsappLogo,
  Gift,
  ShoppingCart,
  Megaphone,
  Star,
  ArrowRight,
  CaretDown,
  Palette,
  Layout,
  TextT,
  Image as ImageIcon,
  ChatCircle,
  Cookie,
  WarningCircle,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────

type FormType = 'popup' | 'flyout' | 'embedded' | 'fullpage' | 'banner'
type FormStatus = 'live' | 'draft' | 'paused'

interface FormItem {
  id: string
  name: string
  type: FormType
  status: FormStatus
  list: string
  views: number
  submissions: number
  submitRate: number
  revenue: number
  performance: 'excellent' | 'good' | 'fair' | 'poor'
  device: 'all' | 'mobile' | 'desktop'
  createdAt: string
  lastEdited: string
}

interface FormTemplate {
  id: string
  name: string
  type: FormType
  category: string
  icon: React.ComponentType<any>
  preview: string
  popular?: boolean
}

// ── Config ──────────────────────────────────────────────

const formTypeConfig: Record<FormType, { label: string; icon: React.ComponentType<any>; color: string }> = {
  popup: { label: 'Pop-up', icon: Layout, color: 'text-[#F26B2A]' },
  flyout: { label: 'Flyout', icon: ChatCircle, color: 'text-blue-400' },
  embedded: { label: 'Inline', icon: FileText, color: 'text-emerald-400' },
  fullpage: { label: 'Full Page', icon: Desktop, color: 'text-purple-400' },
  banner: { label: 'Banner', icon: Megaphone, color: 'text-yellow-400' },
}

const statusConfig: Record<FormStatus, { label: string; color: string; dotColor: string }> = {
  live: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', dotColor: 'bg-emerald-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-gray-500', dotColor: 'bg-zinc-400' },
  paused: { label: 'Pausado', color: 'bg-yellow-500/10 text-yellow-400', dotColor: 'bg-yellow-400' },
}

const performanceConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  excellent: { label: 'Excelente', color: 'text-emerald-400', icon: TrendUp },
  good: { label: 'Bom', color: 'text-blue-400', icon: TrendUp },
  fair: { label: 'Regular', color: 'text-yellow-400', icon: TrendDown },
  poor: { label: 'Baixo', color: 'text-red-400', icon: TrendDown },
}

// ── Mock Data ──────────────────────────────────────────────

const kpis = [
  { title: 'Formulários Ativos', value: '6', icon: FileText, color: '#F26B2A' },
  { title: 'Visualizações (30d)', value: '18.4K', change: '+12%', icon: Eye, color: '#3B82F6' },
  { title: 'Inscrições (30d)', value: '1.842', change: '+22%', icon: UserPlus, color: '#22C55E' },
  { title: 'Taxa de Conversão', value: '10.0%', change: '+1.8%', icon: CursorClick, color: '#A855F7' },
]

const forms: FormItem[] = [
  {
    id: '1',
    name: 'Pop-up Black Friday - 20% OFF',
    type: 'popup',
    status: 'live',
    list: 'Leads Black Friday',
    views: 8420,
    submissions: 1260,
    submitRate: 14.96,
    revenue: 12800,
    performance: 'excellent',
    device: 'all',
    createdAt: '2025-10-15',
    lastEdited: '2026-03-01',
  },
  {
    id: '2',
    name: 'Flyout Saída - Cupom 10%',
    type: 'flyout',
    status: 'live',
    list: 'Recuperação de Abandono',
    views: 4200,
    submissions: 336,
    submitRate: 8.0,
    revenue: 4500,
    performance: 'good',
    device: 'all',
    createdAt: '2025-11-20',
    lastEdited: '2026-02-28',
  },
  {
    id: '3',
    name: 'Newsletter Footer',
    type: 'embedded',
    status: 'live',
    list: 'Newsletter Geral',
    views: 12800,
    submissions: 640,
    submitRate: 5.0,
    revenue: 2100,
    performance: 'fair',
    device: 'all',
    createdAt: '2025-06-10',
    lastEdited: '2026-01-15',
  },
  {
    id: '4',
    name: 'Spin the Wheel - Gamificação',
    type: 'popup',
    status: 'live',
    list: 'Leads Gamificação',
    views: 6100,
    submissions: 1098,
    submitRate: 18.0,
    revenue: 8900,
    performance: 'excellent',
    device: 'mobile',
    createdAt: '2026-01-05',
    lastEdited: '2026-03-08',
  },
  {
    id: '5',
    name: 'Banner LGPD - Cookies',
    type: 'banner',
    status: 'live',
    list: 'Consentimento LGPD',
    views: 24500,
    submissions: 22050,
    submitRate: 90.0,
    revenue: 0,
    performance: 'excellent',
    device: 'all',
    createdAt: '2025-09-01',
    lastEdited: '2025-12-10',
  },
  {
    id: '6',
    name: 'WhatsApp Opt-in',
    type: 'flyout',
    status: 'live',
    list: 'WhatsApp Marketing',
    views: 3200,
    submissions: 480,
    submitRate: 15.0,
    revenue: 3200,
    performance: 'good',
    device: 'mobile',
    createdAt: '2026-02-01',
    lastEdited: '2026-03-05',
  },
  {
    id: '7',
    name: 'Landing Page Lançamento',
    type: 'fullpage',
    status: 'draft',
    list: 'Pré-Lançamento',
    views: 0,
    submissions: 0,
    submitRate: 0,
    revenue: 0,
    performance: 'fair',
    device: 'all',
    createdAt: '2026-03-10',
    lastEdited: '2026-03-10',
  },
  {
    id: '8',
    name: 'Pop-up Primeira Compra',
    type: 'popup',
    status: 'paused',
    list: 'Novos Visitantes',
    views: 5600,
    submissions: 392,
    submitRate: 7.0,
    revenue: 2800,
    performance: 'fair',
    device: 'desktop',
    createdAt: '2025-08-20',
    lastEdited: '2026-02-01',
  },
]

const templates: FormTemplate[] = [
  { id: 't1', name: 'Captura com Cupom', type: 'popup', category: 'lead', icon: Gift, preview: 'Ofereça desconto em troca do e-mail', popular: true },
  { id: 't2', name: 'Spin the Wheel', type: 'popup', category: 'gamification', icon: Star, preview: 'Gamificação com roleta de prêmios', popular: true },
  { id: 't3', name: 'Exit Intent', type: 'flyout', category: 'recovery', icon: ShoppingCart, preview: 'Capture visitantes que estão saindo' },
  { id: 't4', name: 'Newsletter Simples', type: 'embedded', category: 'lead', icon: EnvelopeSimple, preview: 'Formulário clean para footer' },
  { id: 't5', name: 'WhatsApp Opt-in', type: 'flyout', category: 'whatsapp', icon: WhatsappLogo, preview: 'Colete opt-in para WhatsApp' },
  { id: 't6', name: 'Pré-Lançamento', type: 'fullpage', category: 'launch', icon: Megaphone, preview: 'Página de captura para lançamentos' },
  { id: 't7', name: 'Promoção Relâmpago', type: 'banner', category: 'promo', icon: Lightning, preview: 'Banner de oferta por tempo limitado', popular: true },
  { id: 't8', name: 'Pesquisa NPS', type: 'popup', category: 'survey', icon: ChartLineUp, preview: 'Colete feedback dos clientes' },
  { id: 't9', name: 'SMS Opt-in', type: 'popup', category: 'sms', icon: DeviceMobile, preview: 'Capture número para SMS marketing' },
  { id: 't10', name: 'Boas-vindas', type: 'popup', category: 'lead', icon: UserPlus, preview: 'Pop-up de boas-vindas para novos visitantes' },
  { id: 't11', name: 'Banner de Cookies', type: 'banner', category: 'lgpd', icon: Cookie, preview: 'Consentimento LGPD/cookies' },
  { id: 't12', name: 'Página em branco', type: 'popup', category: 'blank', icon: FileText, preview: 'Comece do zero com total liberdade' },
]

const templateCategories = [
  { id: 'all', label: 'Todos' },
  { id: 'lead', label: 'Captura de Leads' },
  { id: 'recovery', label: 'Recuperação' },
  { id: 'gamification', label: 'Gamificação' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'promo', label: 'Promoções' },
  { id: 'survey', label: 'Pesquisas' },
  { id: 'lgpd', label: 'LGPD' },
]

// ── Component ──────────────────────────────────────────────

export default function FormsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | FormType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | FormStatus>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [templateCategory, setTemplateCategory] = useState('all')
  const [sortBy, setSortBy] = useState<'submitRate' | 'views' | 'submissions' | 'revenue'>('submitRate')

  const filtered = forms
    .filter((f) => {
      const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.list.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || f.type === typeFilter
      const matchStatus = statusFilter === 'all' || f.status === statusFilter
      return matchSearch && matchType && matchStatus
    })
    .sort((a, b) => b[sortBy] - a[sortBy])

  const filteredTemplates = templates.filter(
    (t) => templateCategory === 'all' || t.category === templateCategory
  )

  const liveCount = forms.filter((f) => f.status === 'live').length
  const totalSubmissions = forms.reduce((acc, f) => acc + f.submissions, 0)
  const totalRevenue = forms.reduce((acc, f) => acc + f.revenue, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/site')}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Formulários de Captura</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pop-ups, flyouts, banners e formulários inline para captura de leads
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus size={16} weight="bold" />
          Novo Formulário
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                  {kpi.change && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendUp size={12} className="text-emerald-400" weight="bold" />
                      <span className="text-xs text-emerald-400">{kpi.change}</span>
                    </div>
                  )}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon size={20} style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar formulários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Type Filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              typeFilter === 'all' ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-500 hover:text-white'
            }`}
          >
            Todos
          </button>
          {(Object.entries(formTypeConfig) as [FormType, typeof formTypeConfig[FormType]][]).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                typeFilter === type ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-500 hover:text-white'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: 'Todos' },
            { id: 'live' as const, label: `Ativos (${liveCount})` },
            { id: 'draft' as const, label: 'Rascunhos' },
            { id: 'paused' as const, label: 'Pausados' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                statusFilter === s.id ? 'bg-gray-100 text-white' : 'bg-gray-50/50 text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none"
        >
          <option value="submitRate">Maior conversão</option>
          <option value="submissions">Mais inscrições</option>
          <option value="views">Mais visualizações</option>
          <option value="revenue">Maior receita</option>
        </select>
      </div>

      {/* Forms Table */}
      <div className="bg-white/50 border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Formulário</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Tipo</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Status</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Visualizações</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Inscrições</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Taxa</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Receita</th>
              <th className="text-center text-xs text-gray-500 font-medium p-4 pb-3">Performance</th>
              <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((form) => {
              const typeC = formTypeConfig[form.type]
              const statusC = statusConfig[form.status]
              const perfC = performanceConfig[form.performance]
              const TypeIcon = typeC.icon
              const PerfIcon = perfC.icon
              return (
                <tr key={form.id} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors group">
                  <td className="p-4">
                    <div>
                      <p className="text-sm text-gray-700 font-medium">{form.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Lista: {form.list}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <TypeIcon size={14} className={typeC.color} weight="fill" />
                      <span className="text-xs text-gray-500">{typeC.label}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusC.dotColor} ${form.status === 'live' ? 'animate-pulse' : ''}`} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusC.color}`}>
                        {statusC.label}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-sm text-gray-700">{form.views.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-sm text-gray-700 font-medium">{form.submissions.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="p-4 text-right">
                    <span className={`text-sm font-semibold ${
                      form.submitRate >= 15 ? 'text-emerald-400' :
                      form.submitRate >= 8 ? 'text-blue-400' :
                      form.submitRate >= 4 ? 'text-yellow-400' :
                      'text-gray-500'
                    }`}>
                      {form.submitRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {form.revenue > 0 ? (
                      <span className="text-sm text-gray-700 font-medium">
                        R$ {form.revenue.toLocaleString('pt-BR')}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <PerfIcon size={12} className={perfC.color} weight="bold" />
                      <span className={`text-xs font-medium ${perfC.color}`}>{perfC.label}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-gray-50 transition-colors" title="Editar">
                        <PencilSimple size={14} className="text-gray-500 hover:text-white" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-gray-50 transition-colors" title="Duplicar">
                        <Copy size={14} className="text-gray-500 hover:text-white" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-gray-50 transition-colors" title="Analytics">
                        <ChartLineUp size={14} className="text-gray-500 hover:text-white" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-red-500/10 transition-colors" title="Excluir">
                        <Trash size={14} className="text-gray-500 hover:text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <FileText size={32} className="text-zinc-700 mx-auto mb-3" weight="duotone" />
            <p className="text-sm text-gray-500">Nenhum formulário encontrado</p>
            <p className="text-xs text-gray-400 mt-1">Ajuste os filtros ou crie um novo formulário</p>
          </div>
        )}
      </div>

      {/* Tips Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
            <Target size={20} className="text-emerald-400" weight="duotone" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Segmentação Inteligente</h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            Exiba formulários diferentes para visitantes novos vs. recorrentes. Taxa de conversão aumenta em até 40%.
          </p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
            <Timer size={20} className="text-[#F26B2A]" weight="duotone" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Exit Intent</h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            Capture visitantes que estão prestes a sair com pop-ups de exit intent. Recupere até 15% de abandono.
          </p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
            <Star size={20} className="text-purple-400" weight="duotone" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">Gamificação</h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            Formulários com Spin the Wheel têm taxa de conversão 3x maior que pop-ups tradicionais.
          </p>
        </div>
      </div>

      {/* Create Form Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[5vh] overflow-y-auto"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-50 border border-gray-200 rounded-2xl w-full max-w-4xl mx-4 mb-8 overflow-hidden shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Criar Novo Formulário</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Escolha um template para começar ou comece do zero</p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Template Categories */}
              <div className="px-6 pt-4 pb-2 border-b border-gray-200/50">
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {templateCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setTemplateCategory(cat.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                        templateCategory === cat.id
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-50 text-gray-500 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Grid */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredTemplates.map((template) => {
                    const typeC = formTypeConfig[template.type]
                    const Icon = template.icon
                    return (
                      <button
                        key={template.id}
                        className="relative bg-white/50 border border-gray-200 rounded-xl p-4 text-left hover:border-[#F26B2A]/40 hover:bg-brand-500/[0.02] transition-all group"
                      >
                        {template.popular && (
                          <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 bg-brand-500 text-white text-[9px] font-bold rounded-full">
                            Popular
                          </span>
                        )}
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-3 group-hover:bg-brand-500/10 transition-colors">
                          <Icon size={20} className="text-gray-500 group-hover:text-[#F26B2A] transition-colors" weight="duotone" />
                        </div>
                        <p className="text-sm text-gray-700 font-medium">{template.name}</p>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{template.preview}</p>
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <span className={`text-[10px] ${typeC.color}`}>{typeC.label}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white/30">
                <p className="text-xs text-gray-400">
                  {filteredTemplates.length} templates disponíveis
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-sm">
                    <FileText size={14} />
                    Começar em Branco
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
