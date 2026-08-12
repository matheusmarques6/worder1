'use client'

// Missões por evento (core/agentes-por-evento.md §4.2, aba "Missões").
//
// O catálogo da org, uma família por bloco: cada família tem NO MÁXIMO uma
// versão ativa (índice one-active no banco); editar é sempre sobre rascunho;
// ativar arquiva a ativa anterior na mesma transação (RPC). O limite de
// concessão vive AQUI, dentro da missão — o nó do fluxo pede até este teto.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Target,
  Plus,
  Loader2,
  CheckCircle2,
  Archive,
  Pencil,
  ShieldAlert,
  BadgePercent,
} from 'lucide-react'
import {
  EVENT_FAMILIES,
  FAMILY_LABELS,
  type Mission,
} from '@/lib/ai/missions'

const CONCESSION_KINDS = [
  { value: 'none', label: 'Sem concessão' },
  { value: 'percent', label: 'Desconto %' },
  { value: 'fixed', label: 'Desconto R$' },
  { value: 'free_shipping', label: 'Frete grátis' },
] as const

const TOPIC_POLICIES = [
  { value: 'cede', label: 'Cede (segue o cliente)' },
  { value: 'insiste', label: 'Insiste (volta ao objetivo)' },
  { value: 'transfere', label: 'Transfere (chama humano)' },
] as const

const STATUS_STYLES: Record<Mission['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  archived: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<Mission['status'], string> = {
  active: 'Ativa',
  draft: 'Rascunho',
  archived: 'Arquivada',
}

interface DraftForm {
  event_type: string
  objective: string
  situation: string
  success_criteria: string
  failure_criteria: string
  tone_delta: string
  max_turns: number
  topic_change_policy: Mission['topic_change_policy']
  promote_moment: boolean
  concession_kind: Mission['concession']['kind']
  concession_max_value: string
  concession_validity_hours: string
  concession_max_uses: string
  forbidden: string
  enabled_tools: string
  parent_version_id: string | null
  editing_id: string | null
}

const EMPTY_FORM: DraftForm = {
  event_type: EVENT_FAMILIES[0],
  objective: '',
  situation: '',
  success_criteria: '',
  failure_criteria: '',
  tone_delta: '',
  max_turns: 3,
  topic_change_policy: 'cede',
  promote_moment: false,
  concession_kind: 'none',
  concession_max_value: '',
  concession_validity_hours: '48',
  concession_max_uses: '1',
  forbidden: '',
  enabled_tools: '',
  parent_version_id: null,
  editing_id: null,
}

function formFrom(mission: Mission, asNewVersion: boolean): DraftForm {
  return {
    event_type: mission.event_type,
    objective: mission.objective,
    situation: mission.situation ?? '',
    success_criteria: mission.success_criteria ?? '',
    failure_criteria: mission.failure_criteria ?? '',
    tone_delta: mission.tone_delta ?? '',
    max_turns: mission.max_turns,
    topic_change_policy: mission.topic_change_policy,
    promote_moment: mission.promote_moment,
    concession_kind: mission.concession?.kind ?? 'none',
    concession_max_value: mission.concession?.max_value != null ? String(mission.concession.max_value) : '',
    concession_validity_hours: String(mission.concession?.validity_hours ?? 48),
    concession_max_uses: String(mission.concession?.max_uses ?? 1),
    forbidden: (mission.forbidden ?? []).join('\n'),
    enabled_tools: (mission.enabled_tools ?? []).join(', '),
    parent_version_id: asNewVersion ? mission.id : null,
    editing_id: asNewVersion ? null : mission.id,
  }
}

function payloadFrom(form: DraftForm) {
  const concession: Mission['concession'] = { kind: form.concession_kind }
  if (form.concession_kind !== 'none') {
    if (form.concession_kind !== 'free_shipping' && form.concession_max_value) {
      concession.max_value = Number(form.concession_max_value)
    }
    concession.validity_hours = Number(form.concession_validity_hours || 48)
    concession.max_uses = Number(form.concession_max_uses || 1)
  }
  return {
    event_type: form.event_type,
    objective: form.objective.trim(),
    situation: form.situation.trim() || null,
    success_criteria: form.success_criteria.trim() || null,
    failure_criteria: form.failure_criteria.trim() || null,
    tone_delta: form.tone_delta.trim() || null,
    max_turns: form.max_turns,
    topic_change_policy: form.topic_change_policy,
    promote_moment: form.promote_moment,
    concession,
    forbidden: form.forbidden.split('\n').map(s => s.trim()).filter(Boolean),
    enabled_tools: form.enabled_tools.split(',').map(s => s.trim()).filter(Boolean),
    parent_version_id: form.parent_version_id,
  }
}

function concessionSummary(concession: Mission['concession']): string {
  if (!concession || concession.kind === 'none') return 'sem concessão'
  const value =
    concession.kind === 'percent' ? `${concession.max_value ?? '?'}%`
    : concession.kind === 'fixed' ? `R$ ${concession.max_value ?? '?'}`
    : 'frete grátis'
  return `até ${value} · ${concession.validity_hours ?? 48}h · ${concession.max_uses ?? 1} uso(s)`
}

export default function MissionsTab() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DraftForm | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/missions')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar missões')
      setMissions(body.missions)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const seedDefaults = useCallback(async () => {
    setSeeding(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/missions/seed', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao criar as missões padrão')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSeeding(false)
    }
  }, [load])

  const families = useMemo(() => {
    const known = new Set<string>(EVENT_FAMILIES)
    missions.forEach(m => known.add(m.event_type))
    return Array.from(known)
  }, [missions])

  async function save() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const payload = payloadFrom(form)
      if (!payload.objective) throw new Error('O objetivo é obrigatório')
      const res = form.editing_id
        ? await fetch(`/api/ai/missions/${form.editing_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ai/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar')
      setForm(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function transition(mission: Mission, status: 'active' | 'archived') {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/missions/${mission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao mudar status')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-600" /> Missões por evento
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Uma missão ativa por família de evento. O nó de fluxo pede o toque;
            o limite de concessão mora aqui, dentro da missão.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            arquivadas
          </label>
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" /> Nova missão
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && missions.length === 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-900">
              Esta loja ainda não tem nenhuma missão.
            </p>
            <p className="text-xs text-orange-800 mt-1">
              Crie as 6 missões padrão como rascunho — nada é ativado sozinho: você
              revisa o texto de cada uma e ativa quando quiser. É o mesmo dado que a
              área &quot;Missão descoberta&quot; da radial edita.
            </p>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={seedDefaults}
            className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {seeding ? 'Criando…' : 'Criar missões padrão'}
          </button>
        </div>
      )}

      {families.map(family => {
        const rows = missions
          .filter(m => m.event_type === family)
          .filter(m => showArchived || m.status !== 'archived')
        return (
          <section key={family} className="rounded-xl border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {FAMILY_LABELS[family] ?? family}
                </h3>
                <p className="text-xs text-gray-400 font-mono">{family}</p>
              </div>
              {rows.every(m => m.status !== 'active') && (
                <span className="text-xs text-amber-600">
                  {family === 'whatsapp.received'
                    ? 'sem missão ativa — o agente NÃO responde mensagens recebidas'
                    : 'sem missão ativa — toques desta família não saem'}
                </span>
              )}
            </header>
            {rows.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-400">Nenhuma versão ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {rows.map(mission => (
                  <li key={mission.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[mission.status]}`}>
                          {STATUS_LABELS[mission.status]}
                        </span>
                        {mission.origin === 'worder_default' && (
                          <span className="text-[11px] text-gray-400">padrão Worder</span>
                        )}
                        {mission.promote_moment && (
                          <span className="text-[11px] text-violet-600">promove momento</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-800 truncate">{mission.objective}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                        <BadgePercent className="w-3.5 h-3.5" />
                        {concessionSummary(mission.concession)} · até {mission.max_turns} turnos ·{' '}
                        {mission.topic_change_policy}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {mission.status === 'draft' && (
                        <>
                          <button
                            title="Editar rascunho"
                            onClick={() => setForm(formFrom(mission, false))}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            disabled={saving}
                            onClick={() => transition(mission, 'active')}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ativar
                          </button>
                        </>
                      )}
                      {mission.status === 'active' && (
                        <>
                          <button
                            title="Criar nova versão a partir desta"
                            onClick={() => setForm(formFrom(mission, true))}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            disabled={saving}
                            title="Arquivar (a família fica sem missão ativa)"
                            onClick={() => transition(mission, 'archived')}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Archive className="w-3.5 h-3.5" /> Arquivar
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              {form.editing_id ? 'Editar rascunho' : form.parent_version_id ? 'Nova versão' : 'Nova missão'}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Toda versão nasce rascunho; ativar arquiva a ativa anterior da família.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Família do evento</span>
                <select
                  value={form.event_type}
                  disabled={!!form.editing_id || !!form.parent_version_id}
                  onChange={e => setForm({ ...form, event_type: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                >
                  {families.map(f => (
                    <option key={f} value={f}>{FAMILY_LABELS[f] ?? f}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Objetivo (um só)</span>
                <input
                  value={form.objective}
                  onChange={e => setForm({ ...form, objective: e.target.value })}
                  placeholder="ex.: recuperar a compra sem parecer cobrança"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Sucesso observável</span>
                  <input
                    value={form.success_criteria}
                    onChange={e => setForm({ ...form, success_criteria: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Falha observável</span>
                  <input
                    value={form.failure_criteria}
                    onChange={e => setForm({ ...form, failure_criteria: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Insistência (turnos)</span>
                  <input
                    type="number" min={1} max={10}
                    value={form.max_turns}
                    onChange={e => setForm({ ...form, max_turns: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm col-span-2">
                  <span className="mb-1 block text-gray-600">Mudança de assunto</span>
                  <select
                    value={form.topic_change_policy}
                    onChange={e => setForm({ ...form, topic_change_policy: e.target.value as any })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    {TOPIC_POLICIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-xs font-medium text-gray-500">
                  Concessão (teto da emissão — o nó pede até aqui)
                </legend>
                <div className="grid grid-cols-4 gap-3">
                  <label className="text-sm col-span-2">
                    <span className="mb-1 block text-gray-600">Tipo</span>
                    <select
                      value={form.concession_kind}
                      onChange={e => setForm({ ...form, concession_kind: e.target.value as any })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      {CONCESSION_KINDS.map(k => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                  </label>
                  {form.concession_kind !== 'none' && form.concession_kind !== 'free_shipping' && (
                    <label className="text-sm">
                      <span className="mb-1 block text-gray-600">Teto</span>
                      <input
                        type="number" min={0}
                        value={form.concession_max_value}
                        onChange={e => setForm({ ...form, concession_max_value: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                  {form.concession_kind !== 'none' && (
                    <label className="text-sm">
                      <span className="mb-1 block text-gray-600">Validade (h)</span>
                      <input
                        type="number" min={1}
                        value={form.concession_validity_hours}
                        onChange={e => setForm({ ...form, concession_validity_hours: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                </div>
              </fieldset>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.promote_moment}
                  onChange={e => setForm({ ...form, promote_moment: e.target.checked })}
                />
                Pode promover o momento comercial ativo
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">O que não fazer (um por linha)</span>
                <textarea
                  rows={2}
                  value={form.forbidden}
                  onChange={e => setForm({ ...form, forbidden: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Tools da situação (separadas por vírgula)</span>
                <input
                  value={form.enabled_tools}
                  onChange={e => setForm({ ...form, enabled_tools: e.target.value })}
                  placeholder="search_knowledge, get_customer_context, create_coupon"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setForm(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar rascunho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
