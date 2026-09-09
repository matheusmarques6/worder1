'use client'

// =============================================
// Popups e formulários de captura — a lista
//
// Tudo que aparece aqui vem do banco: a lista de /api/forms e os números
// de /api/forms/stats (últimos N dias, agregados por popup). A versão
// anterior desta tela exibia oito popups e R$ 12.800 de receita
// inventados como "exemplo" — para um cliente, era mentira.
// =============================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, MagnifyingGlass, Eye, PencilSimple, Trash, Copy, ChartLineUp,
  FileText, Layout, ChatCircle, Desktop, Megaphone, Power, X, WarningCircle,
  Gift, ShoppingCart, WhatsappLogo, EnvelopeSimple, Lightning, UserPlus,
  Confetti, Ticket, Question,
} from '@phosphor-icons/react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useStoreStore } from '@/stores'
import { formatCurrency } from '@/lib/utils/formatters'
import { POPUP_TEMPLATES, TEMPLATE_CATEGORIES, type PopupTemplate, type PopupFormType } from '@/lib/popups/templates'

// ── Tipos ────────────────────────────────────────────────

type FormStatus = 'draft' | 'published' | 'paused' | 'archived'

// Rótulo e cor de cada status — a mesma tabela que o analytics usa.
const FORM_STATUS_META: Record<FormStatus, { label: string; cls: string; dot: string }> = {
  published: { label: 'Ativo', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  paused: { label: 'Pausado', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  archived: { label: 'Arquivado', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' },
}

interface FormRow {
  id: string
  name: string
  form_type: PopupFormType | string
  status: FormStatus
  store_id: string | null
  has_design: boolean
  created_at: string
  updated_at: string
}

interface FormStats {
  form_id: string
  impressions: number
  unique_visitors: number
  submissions: number
  dismissals: number
  holdouts: number
  submit_rate: number
  dismiss_rate: number
  attributed_revenue: number
  attributed_orders: number
  driven_revenue: number
  driven_orders: number
}

const EMPTY_STATS: Omit<FormStats, 'form_id'> = {
  impressions: 0, unique_visitors: 0, submissions: 0, dismissals: 0, holdouts: 0,
  submit_rate: 0, dismiss_rate: 0, attributed_revenue: 0, attributed_orders: 0, driven_revenue: 0, driven_orders: 0,
}

// ── Apresentação ──────────────────────────────────────────

const typeMeta: Record<string, { label: string; icon: React.ComponentType<any> }> = {
  popup: { label: 'Pop-up', icon: Layout },
  flyout: { label: 'Flyout', icon: ChatCircle },
  embed: { label: 'Inline', icon: FileText },
  fullpage: { label: 'Tela cheia', icon: Desktop },
  banner: { label: 'Faixa', icon: Megaphone },
}

const statusMeta = FORM_STATUS_META

// "Últimos 30 dias" com as datas de verdade, para ninguém adivinhar a janela.
function periodCaption(days: number): string {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  const f = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${f(start)} – ${f(end)}`
}

const templateIcon: Record<string, React.ComponentType<any>> = {
  'welcome-coupon': Gift,
  'exit-intent': ShoppingCart,
  'whatsapp-optin': WhatsappLogo,
  'newsletter-embed': EnvelopeSimple,
  'promo-banner': Lightning,
  'launch-fullpage': UserPlus,
  'quiz-reward': Question,
  'spin-to-win': Confetti,
  'scratch-card': Ticket,
  blank: FileText,
}

interface HealthIssue {
  level: 'error' | 'warn'
  kind: string
  form_id: string | null
  form_name: string | null
  title: string
  detail: string
  action: string
}
interface HealthPayload {
  counts: { error: number; warn: number }
  issues: HealthIssue[]
}

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
const int = (v: number) => v.toLocaleString('pt-BR')

// ── Página ────────────────────────────────────────────────

export default function SiteFormsPage() {
  const router = useRouter()
  const toast = useToast()
  const { confirm } = useConfirm()
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)

  const [forms, setForms] = useState<FormRow[]>([])
  const [stats, setStats] = useState<Record<string, FormStats>>({})
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [missingMigration, setMissingMigration] = useState<string | null>(null)
  // Saúde: o que está prestes a falhar em silêncio (estoque de cupom,
  // popup sem loja, teste passado do prazo). Falha aqui não atrapalha
  // a lista — o painel simplesmente não aparece.
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [healthOpen, setHealthOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | FormStatus>('all')
  const [sortBy, setSortBy] = useState<'submit_rate' | 'impressions' | 'submissions' | 'attributed_revenue' | 'updated'>('updated')

  const [showCreate, setShowCreate] = useState(false)
  const [templateCategory, setTemplateCategory] = useState<string>('all')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    // A loja atual vem do localStorage (zustand). Antes de hidratar, um
    // fetch sem storeId traria só os popups globais e a lista piscaria.
    if (!hasHydrated) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('storeId', currentStore.id)
      const statsParams = new URLSearchParams(params)
      statsParams.set('days', String(days))
      try { statsParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo') } catch { statsParams.set('tz', 'America/Sao_Paulo') }
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/forms?${params}`, { cache: 'no-store' }),
        fetch(`/api/forms/stats?${statsParams}`, { cache: 'no-store' }),
      ])
      if (listRes.ok) {
        const d = await listRes.json()
        setForms(d.forms || [])
      } else {
        setForms([])
        toast.error('Não foi possível carregar os formulários', await listRes.text().catch(() => ''))
      }
      if (statsRes.ok) {
        const d = await statsRes.json()
        const map: Record<string, FormStats> = {}
        for (const s of d.stats || []) map[s.form_id] = s
        setStats(map)
        setMissingMigration(d.missing_migration || null)
      } else {
        // Zeros mudos pareceriam números reais.
        setStats({})
        setMissingMigration(null)
        toast.error('Não foi possível carregar as métricas', await statsRes.text().catch(() => ''))
      }
    } catch (e: any) {
      toast.error('Não foi possível carregar os formulários', e?.message)
    } finally {
      setLoading(false)
    }
    // O provedor de toast recria as funções a cada aviso; colocá-lo nas
    // dependências fazia a lista recarregar a cada toast (e em loop num erro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id, hasHydrated, days])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancelled = false
    fetch('/api/forms/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setHealth(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const statOf = (id: string): FormStats => stats[id] || { form_id: id, ...EMPTY_STATS }

  // ── KPIs do período ──
  const kpis = useMemo(() => {
    const rows = forms.map((f) => statOf(f.id))
    const impressions = rows.reduce((s, r) => s + r.impressions, 0)
    const submissions = rows.reduce((s, r) => s + r.submissions, 0)
    const revenue = rows.reduce((s, r) => s + r.attributed_revenue, 0)
    return {
      active: forms.filter((f) => f.status === 'published').length,
      impressions,
      submissions,
      submitRate: impressions > 0 ? submissions / impressions : 0,
      revenue,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, stats])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return forms
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .filter((f) => typeFilter === 'all' || f.form_type === typeFilter)
      .filter((f) => statusFilter === 'all' || f.status === statusFilter)
      .sort((a, b) => {
        if (sortBy === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        return statOf(b.id)[sortBy] - statOf(a.id)[sortBy]
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, stats, search, typeFilter, statusFilter, sortBy])

  // ── Ações ──
  const editorPath = (f: FormRow) => (f.has_design ? `/popup-editor/${f.id}` : `/forms/${f.id}`)

  const createFromTemplate = async (t: PopupTemplate) => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: t.name,
          form_type: t.formType,
          design_json: t.design,
          behavior: t.design?.behavior || {},
          ...(currentStore?.id ? { store_id: currentStore.id } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error('Não foi possível criar o popup', data.error || 'Tente novamente.')
        return
      }
      setShowCreate(false)
      router.push(`/popup-editor/${data.form.id}`)
    } catch (e: any) {
      toast.error('Não foi possível criar o popup', e?.message || 'Falha de rede. Tente novamente.')
    } finally {
      setCreating(false)
    }
  }

  const toggleStatus = async (f: FormRow) => {
    const next: FormStatus = f.status === 'published' ? 'paused' : 'published'
    setBusyId(f.id)
    try {
      const res = await fetch(`/api/forms/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // A loja só vai junto ao publicar um popup que ainda não tem loja
        // (o cupom único precisa dela). Pausar não pode rebindar um popup
        // global para a loja de onde o lojista clicou.
        body: JSON.stringify({ status: next, ...(next === 'published' && !f.store_id && currentStore?.id ? { store_id: currentStore.id } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(next === 'published' ? 'Não foi possível ativar' : 'Não foi possível pausar', data.error || '')
        return
      }
      setForms((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: next } : x)))
      toast.success(next === 'published' ? 'Popup ativado' : 'Popup pausado', next === 'published' ? undefined : 'Ele some da loja em até um minuto e volta quando você ativar.')
    } finally {
      setBusyId(null)
    }
  }

  const duplicate = async (f: FormRow) => {
    setBusyId(f.id)
    try {
      const full = await fetch(`/api/forms/${f.id}`).then((r) => r.json())
      const src = full.form
      if (!src) throw new Error('Formulário não encontrado')
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${src.name} (cópia)`,
          form_type: src.form_type,
          design_json: src.design_json || {},
          behavior: src.behavior || {},
          audience: src.audience || {},
          tags: src.tags || [],
          list_id: src.list_id || null,
          theme: src.theme || undefined,
          store_id: src.store_id || currentStore?.id || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erro ao duplicar')
      toast.success('Cópia criada', 'Abrindo o editor.')
      router.push(`/popup-editor/${data.form.id}`)
    } catch (e: any) {
      toast.error('Não foi possível duplicar', e?.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (f: FormRow) => {
    const ok = await confirm({
      title: 'Excluir este popup?',
      description: `"${f.name}" e o histórico de inscrições dele serão removidos. Isso não tem volta.`,
      destructive: true,
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    setBusyId(f.id)
    try {
      const res = await fetch(`/api/forms/${f.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error('Não foi possível excluir', d.error || '')
        return
      }
      setForms((prev) => prev.filter((x) => x.id !== f.id))
      toast.success('Popup excluído')
    } catch (e: any) {
      toast.error('Não foi possível excluir', e?.message || 'Falha de rede. Tente novamente.')
    } finally {
      setBusyId(null)
    }
  }

  const templates = POPUP_TEMPLATES.filter((t) => templateCategory === 'all' || t.category === templateCategory)

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/site')} className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" aria-label="Voltar">
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Popups e formulários</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {currentStore?.name || currentStore?.domain ? `Loja ${currentStore.name || currentStore.domain}` : 'Captura de contatos no site'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 tabular-nums hidden sm:inline">{periodCaption(days)}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none" aria-label="Período">
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
            <Plus size={16} weight="bold" />
            Novo popup
          </button>
        </div>
      </div>

      {missingMigration && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <WarningCircle size={16} className="text-amber-600 flex-shrink-0" weight="fill" />
          <span className="text-xs text-amber-700">
            As métricas de popup ainda não estão disponíveis neste ambiente (migration <code className="font-mono">{missingMigration}</code> pendente).
          </span>
        </div>
      )}

      {/* Saúde: só aparece quando há o que resolver */}
      {health && health.issues.length > 0 && (
        <div className={`rounded-xl border ${health.counts.error > 0 ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
          <button onClick={() => setHealthOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left"
            aria-expanded={healthOpen}>
            <WarningCircle size={16} weight="fill" className={health.counts.error > 0 ? 'text-red-600 flex-shrink-0' : 'text-amber-600 flex-shrink-0'} />
            <span className={`text-xs font-medium ${health.counts.error > 0 ? 'text-red-800' : 'text-amber-800'}`}>
              {health.counts.error > 0
                ? `${health.counts.error} ${health.counts.error === 1 ? 'problema afetando inscritos agora' : 'problemas afetando inscritos agora'}`
                : `${health.counts.warn} ${health.counts.warn === 1 ? 'ponto de atenção' : 'pontos de atenção'}`}
              {health.counts.error > 0 && health.counts.warn > 0 && ` · ${health.counts.warn} ${health.counts.warn === 1 ? 'ponto de atenção' : 'pontos de atenção'}`}
            </span>
            <span className={`ml-auto text-[11px] ${health.counts.error > 0 ? 'text-red-600' : 'text-amber-600'}`}>{healthOpen ? 'ocultar' : 'ver detalhes'}</span>
          </button>
          {healthOpen && (
            <ul className="px-4 pb-3 space-y-2">
              {health.issues.map((it, i) => (
                <li key={i} className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.level === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-gray-900">
                        {it.title}
                        {it.form_name && <span className="font-normal text-gray-500"> · {it.form_name}</span>}
                      </p>
                      <p className="text-[12px] text-gray-600 mt-0.5 leading-snug">{it.detail}</p>
                      <p className="text-[12px] text-gray-500 mt-1 leading-snug">{it.action}</p>
                    </div>
                    {it.form_id && (
                      <button onClick={() => router.push(`/popup-editor/${it.form_id}`)}
                        className="flex-shrink-0 text-[12px] font-semibold text-zinc-900 underline underline-offset-2">
                        Abrir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Ativos', value: int(kpis.active), hint: `${forms.length} no total` },
          { label: `Visualizações · ${days}d`, value: int(kpis.impressions), hint: 'impressões de popup' },
          { label: `Inscrições · ${days}d`, value: int(kpis.submissions), hint: 'envios de formulário' },
          { label: 'Taxa de envio', value: pct(kpis.submitRate), hint: 'inscrições ÷ visualizações' },
          { label: 'Receita atribuída · total', value: formatCurrency(kpis.revenue, currentStore?.currency), hint: 'desde a criação, pedidos após inscrição' },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-500 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{loading ? '—' : k.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por nome" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500" />
        </div>
        <div className="flex gap-1">
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Todos</FilterChip>
          {Object.entries(typeMeta).map(([t, m]) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{m.label}</FilterChip>
          ))}
        </div>
        <div className="flex gap-1">
          {([['all', 'Qualquer status'], ['published', 'Ativos'], ['paused', 'Pausados'], ['draft', 'Rascunhos']] as const).map(([s, l]) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} muted>{l}</FilterChip>
          ))}
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none" aria-label="Ordenar">
          <option value="updated">Editados recentemente</option>
          <option value="submit_rate">Maior taxa de envio</option>
          <option value="submissions">Mais inscrições</option>
          <option value="impressions">Mais visualizações</option>
          <option value="attributed_revenue">Maior receita</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                <th className="p-4 pb-3">Popup</th>
                <th className="p-4 pb-3">Tipo</th>
                <th className="p-4 pb-3">Status</th>
                <th className="p-4 pb-3 text-right">Visualizações</th>
                <th className="p-4 pb-3 text-right">Inscrições</th>
                <th className="p-4 pb-3 text-right">Taxa</th>
                <th className="p-4 pb-3 text-right">Receita atribuída <span className="font-normal text-gray-400">· total</span></th>
                <th className="p-4 pb-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const s = statOf(f.id)
                const tm = typeMeta[f.form_type] || typeMeta.popup
                const sm = statusMeta[f.status] || statusMeta.draft
                const TypeIcon = tm.icon
                const busy = busyId === f.id
                return (
                  <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors group">
                    <td className="p-4">
                      <button onClick={() => router.push(editorPath(f))} className="text-left">
                        <p className="text-sm text-gray-800 font-medium">{f.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Editado {new Date(f.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          {s.holdouts > 0 && ` · ${int(s.holdouts)} no grupo de controle`}
                        </p>
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <TypeIcon size={14} className="text-[#F26B2A]" weight="fill" />
                        {tm.label}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${sm.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                        {sm.label}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm text-gray-700 tabular-nums">{int(s.impressions)}</td>
                    <td className="p-4 text-right text-sm text-gray-800 font-medium tabular-nums">{int(s.submissions)}</td>
                    <td className="p-4 text-right tabular-nums">
                      <span className={`text-sm font-semibold ${s.impressions === 0 ? 'text-gray-400' : s.submit_rate >= 0.05 ? 'text-emerald-600' : s.submit_rate >= 0.02 ? 'text-gray-800' : 'text-amber-600'}`}>
                        {s.impressions === 0 ? '—' : pct(s.submit_rate)}
                      </span>
                    </td>
                    <td className="p-4 text-right tabular-nums">
                      {s.attributed_revenue > 0 ? (
                        <div>
                          <p className="text-sm text-gray-800 font-medium">{formatCurrency(s.attributed_revenue, currentStore?.currency)}</p>
                          <p className="text-[11px] text-gray-400">{int(s.attributed_orders)} pedido{s.attributed_orders === 1 ? '' : 's'}{s.driven_orders > 0 ? ` · ${int(s.driven_orders)} com cupom` : ''}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 justify-end md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <IconBtn title="Editar" onClick={() => router.push(editorPath(f))}><PencilSimple size={14} /></IconBtn>
                        <IconBtn title="Analytics" onClick={() => router.push(`/forms/${f.id}/analytics`)}><ChartLineUp size={14} /></IconBtn>
                        <IconBtn title={f.status === 'published' ? 'Pausar' : 'Ativar'} onClick={() => toggleStatus(f)} disabled={busy}><Power size={14} /></IconBtn>
                        <IconBtn title="Duplicar" onClick={() => duplicate(f)} disabled={busy}><Copy size={14} /></IconBtn>
                        <IconBtn title="Excluir" onClick={() => remove(f)} disabled={busy} danger><Trash size={14} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && forms.length === 0 && (
          <div className="py-16 text-center">
            <Eye size={32} className="text-gray-300 mx-auto mb-3" weight="duotone" />
            <p className="text-sm text-gray-700 font-medium">Nenhum popup ainda</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Crie o primeiro a partir de um modelo. Ele fica em rascunho até você ativar.</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
              <Plus size={14} weight="bold" /> Criar popup
            </button>
          </div>
        )}
        {!loading && forms.length > 0 && filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">Nada com esses filtros</p>
          </div>
        )}
        {loading && (
          <div className="py-12 text-center text-sm text-gray-400">Carregando…</div>
        )}
      </div>

      {/* Criar */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[6vh] overflow-y-auto" onClick={() => setShowCreate(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-popup-title" onClick={(e) => e.stopPropagation()}
            ref={(el) => { if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('button[data-first]')?.focus() }}
            className="bg-white border border-gray-200 rounded-2xl w-full max-w-4xl mx-4 mb-8 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 id="new-popup-title" className="text-lg font-bold text-gray-900">Novo popup</h2>
                <p className="text-xs text-gray-500 mt-0.5">Cada modelo abre pronto no editor — texto, campos, consentimento e cupom já no lugar.</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="px-6 pt-4 pb-2 border-b border-gray-100 flex gap-1 overflow-x-auto">
              {TEMPLATE_CATEGORIES.map((c, i) => (
                <FilterChip key={c.id} active={templateCategory === c.id} onClick={() => setTemplateCategory(c.id)} first={i === 0}>{c.label}</FilterChip>
              ))}
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {templates.map((t) => {
                  const Icon = templateIcon[t.id] || FileText
                  const tm = typeMeta[t.formType]
                  return (
                    <button key={t.id} onClick={() => createFromTemplate(t)} disabled={creating}
                      className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-[#F26B2A]/50 transition-colors group disabled:opacity-60">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-3 group-hover:bg-orange-50 transition-colors">
                        <Icon size={20} className="text-gray-500 group-hover:text-[#F26B2A]" weight="duotone" />
                      </div>
                      <p className="text-sm text-gray-800 font-medium">{t.name}</p>
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{t.description}</p>
                      <p className="text-[10px] text-gray-400 mt-2.5 uppercase tracking-wide">{tm.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children, muted, first }: { active: boolean; onClick: () => void; children: React.ReactNode; muted?: boolean; first?: boolean }) {
  const on = muted ? 'bg-gray-200 text-gray-900' : 'bg-brand-500 text-white'
  return (
    <button onClick={onClick} {...(first ? { 'data-first': '' } : {})} className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${active ? on : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}>
      {children}
    </button>
  )
}

function IconBtn({ title, onClick, children, disabled, danger }: { title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
      className={`p-1.5 rounded transition-colors text-gray-500 disabled:opacity-40 ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-800'}`}>
      {children}
    </button>
  )
}
