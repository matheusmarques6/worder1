'use client'

// O editor COMPLETO da missão, dentro do fluxo (corte 13/08: a aba IA →
// Missões morreu; missão vive no nó). Herda o formulário da extinta
// MissionsTab — mesmos campos, mesmas rotas: toda versão nasce rascunho
// (POST) ou edita rascunho em cima (PATCH); ativar continua ato explícito
// de quem chama. A família vem TRAVADA do nó — aqui não se troca de evento.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { FAMILY_LABELS, type Mission } from '@/lib/ai/missions'

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

interface DraftForm {
  display_name: string
  objective: string
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
}

const EMPTY_FORM: DraftForm = {
  display_name: '',
  objective: '',
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
}

function formFrom(mission: Mission): DraftForm {
  return {
    display_name: mission.display_name ?? '',
    objective: mission.objective,
    success_criteria: mission.success_criteria ?? '',
    failure_criteria: mission.failure_criteria ?? '',
    tone_delta: mission.tone_delta ?? '',
    max_turns: mission.max_turns,
    topic_change_policy: mission.topic_change_policy,
    promote_moment: mission.promote_moment,
    concession_kind: mission.concession?.kind ?? 'none',
    concession_max_value:
      mission.concession?.max_value != null ? String(mission.concession.max_value) : '',
    concession_validity_hours: String(mission.concession?.validity_hours ?? 48),
    concession_max_uses: String(mission.concession?.max_uses ?? 1),
    forbidden: (mission.forbidden ?? []).join('\n'),
    enabled_tools: (mission.enabled_tools ?? []).join(', '),
  }
}

function payloadFrom(form: DraftForm, family: string, parentVersionId: string | null) {
  const concession: Mission['concession'] = { kind: form.concession_kind }
  if (form.concession_kind !== 'none') {
    if (form.concession_kind !== 'free_shipping' && form.concession_max_value) {
      concession.max_value = Number(form.concession_max_value)
    }
    concession.validity_hours = Number(form.concession_validity_hours || 48)
    concession.max_uses = Number(form.concession_max_uses || 1)
  }
  return {
    event_type: family,
    display_name: form.display_name.trim() || null,
    objective: form.objective.trim(),
    success_criteria: form.success_criteria.trim() || null,
    failure_criteria: form.failure_criteria.trim() || null,
    tone_delta: form.tone_delta.trim() || null,
    max_turns: form.max_turns,
    topic_change_policy: form.topic_change_policy,
    promote_moment: form.promote_moment,
    concession,
    forbidden: form.forbidden.split('\n').map(s => s.trim()).filter(Boolean),
    enabled_tools: form.enabled_tools.split(',').map(s => s.trim()).filter(Boolean),
    parent_version_id: parentVersionId,
  }
}

export interface MissionEditorModalProps {
  family: string
  /** null = missão nova. Rascunho = edita em cima. Ativa = vira NOVA VERSÃO. */
  mission: Mission | null
  onClose: () => void
  /** Recebe o rascunho salvo — quem chama recarrega e decide ativar. */
  onSaved: (draft: Mission) => void
}

export default function MissionEditorModal({ family, mission, onClose, onSaved }: MissionEditorModalProps) {
  const asNewVersion = mission?.status === 'active'
  const [form, setForm] = useState<DraftForm>(mission ? formFrom(mission) : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!form.objective.trim()) {
      setError('O objetivo é obrigatório')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = payloadFrom(form, family, asNewVersion ? mission!.id : null)
      const editingDraft = mission && mission.status === 'draft'
      const res = editingDraft
        ? await fetch(`/api/ai/missions/${mission.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ai/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao salvar a missão')
      onSaved(body.mission)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">
          {mission == null
            ? 'Nova missão'
            : asNewVersion
              ? 'Editar missão (nova versão)'
              : 'Editar rascunho'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Família: <span className="font-mono">{FAMILY_LABELS[family] ?? family}</span>.
          Toda versão nasce rascunho; ativar arquiva a ativa anterior da família.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Nome da missão (livre — como aparece nas listas)</span>
            <input
              value={form.display_name}
              onChange={e => setForm({ ...form, display_name: e.target.value })}
              placeholder="ex.: Recuperação VIP"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
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
            <span className="mb-1 block text-gray-600">Tom deste evento (delta, opcional)</span>
            <input
              value={form.tone_delta}
              onChange={e => setForm({ ...form, tone_delta: e.target.value })}
              placeholder="ex.: mais urgente que o normal, sem parecer cobrança"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
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

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar rascunho
          </button>
        </div>
      </div>
    </div>
  )
}
