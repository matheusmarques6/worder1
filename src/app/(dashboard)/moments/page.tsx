'use client'

// Momentos comerciais (doc §1.5/§4.2 aba própria): campanha sazonal como
// ESTADO — muda uma vez, num lugar só. "Ativo" nunca é gravado: o chip de
// estado desta lista usa o MESMO predicado do runtime (approved + janela por
// relógio + não morto). O kill switch é definitivo e vence a janela.

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock,
  Plus,
  Loader2,
  ShieldAlert,
  Skull,
  CheckCircle2,
  Pencil,
  Eye,
  MessageSquare,
} from 'lucide-react'
import {
  computedState,
  type CommercialMoment,
  type ComputedState,
} from '@/lib/ai/moments'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'

const STATE_STYLES: Record<ComputedState, string> = {
  vigente: 'bg-emerald-100 text-emerald-700',
  agendado: 'bg-sky-100 text-sky-700',
  encerrado: 'bg-gray-100 text-gray-500',
  morto: 'bg-red-100 text-red-600',
  rascunho: 'bg-amber-100 text-amber-700',
}

const OFFER_KINDS = [
  { value: 'none', label: 'Sem oferta' },
  { value: 'percent', label: 'Desconto %' },
  { value: 'fixed', label: 'Desconto R$' },
  { value: 'free_shipping', label: 'Frete grátis' },
] as const

interface MomentForm {
  editing_id: string | null
  name: string
  starts_at: string
  ends_at: string
  public_claim: string
  offer_kind: CommercialMoment['offer']['kind']
  offer_value: string
  temp_facts: string
  forbidden: string
  priority: number
  template_name: string
  template_language: string
  template_approved: boolean
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const EMPTY_FORM: MomentForm = {
  editing_id: null,
  name: '',
  starts_at: '',
  ends_at: '',
  public_claim: '',
  offer_kind: 'none',
  offer_value: '',
  temp_facts: '',
  forbidden: '',
  priority: 0,
  template_name: '',
  template_language: 'pt_BR',
  template_approved: false,
}

function formFrom(moment: CommercialMoment): MomentForm {
  const whatsapp = moment.template_readiness?.whatsapp ?? {}
  return {
    editing_id: moment.id,
    name: moment.name,
    starts_at: toLocalInput(moment.starts_at),
    ends_at: toLocalInput(moment.ends_at),
    public_claim: moment.public_claim ?? '',
    offer_kind: moment.offer?.kind ?? 'none',
    offer_value: moment.offer?.value != null ? String(moment.offer.value) : '',
    temp_facts: (moment.temp_facts ?? []).join('\n'),
    forbidden: (moment.forbidden ?? []).join('\n'),
    priority: moment.priority ?? 0,
    template_name: whatsapp.template_name ?? '',
    template_language: whatsapp.language ?? 'pt_BR',
    template_approved: whatsapp.status === 'approved',
  }
}

function payloadFrom(form: MomentForm) {
  const offer: CommercialMoment['offer'] = { kind: form.offer_kind }
  if (form.offer_kind !== 'none' && form.offer_kind !== 'free_shipping' && form.offer_value) {
    offer.value = Number(form.offer_value)
  }
  const template_readiness: CommercialMoment['template_readiness'] = {}
  if (form.template_name.trim()) {
    template_readiness.whatsapp = {
      template_name: form.template_name.trim(),
      language: form.template_language || 'pt_BR',
      status: form.template_approved ? 'approved' : 'pending',
    }
  }
  return {
    name: form.name.trim(),
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    public_claim: form.public_claim.trim() || null,
    offer,
    temp_facts: form.temp_facts.split('\n').map(s => s.trim()).filter(Boolean),
    forbidden: form.forbidden.split('\n').map(s => s.trim()).filter(Boolean),
    priority: form.priority,
    template_readiness,
  }
}

function offerSummary(offer: CommercialMoment['offer']): string {
  if (!offer || offer.kind === 'none') return 'sem oferta'
  if (offer.kind === 'free_shipping') return 'frete grátis'
  return offer.kind === 'percent' ? `${offer.value ?? '?'}% off` : `R$ ${offer.value ?? '?'} off`
}

export default function MomentsPage() {
  const [moments, setMoments] = useState<CommercialMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<MomentForm | null>(null)
  const [preview, setPreview] = useState<{ loading: boolean; text?: string; error?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/moments')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar momentos')
      setMoments(body.moments)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const payload = payloadFrom(form)
      if (!payload.name) throw new Error('O nome é obrigatório')
      if (!payload.starts_at || !payload.ends_at) throw new Error('A janela (início e fim) é obrigatória')
      const res = form.editing_id
        ? await fetch(`/api/ai/moments/${form.editing_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/ai/moments', {
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

  async function transition(moment: CommercialMoment, status: 'approved' | 'killed') {
    if (status === 'killed' && !window.confirm(
      `Matar "${moment.name}" AGORA? O kill switch é definitivo: vence a janela e nenhum toque deste momento sai mais.`
    )) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/moments/${moment.id}`, {
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

  async function runPreview() {
    setPreview({ loading: true })
    try {
      const res = await fetch('/api/ai/preview-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'whatsapp.received' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Preview indisponível')
      setPreview({ loading: false, text: body.text })
    } catch (e: any) {
      setPreview({ loading: false, error: e.message })
    }
  }

  return (
    <AgentsTheme className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-brand-600" /> Momentos comerciais
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              O que é verdade na loja AGORA, com validade. Muda uma vez, num lugar só —
              a IA passa a saber em todos os turnos enquanto a janela durar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              title="O que a IA responderia hoje (mesma compile do runtime, modo preview)"
            >
              <Eye className="w-4 h-4" /> O que a IA sabe hoje
            </button>
            <button
              onClick={() => setForm({ ...EMPTY_FORM })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus className="w-4 h-4" /> Novo momento
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {preview && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-800">
              <MessageSquare className="w-4 h-4" /> Preview do prompt (modo preview do runtime)
            </div>
            {preview.loading ? (
              <Loader2 className="mt-3 w-5 h-5 animate-spin text-violet-500" />
            ) : preview.error ? (
              <p className="mt-2 text-sm text-violet-700">{preview.error}</p>
            ) : (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-gray-700">
                {preview.text}
              </pre>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : moments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
            Nenhum momento ainda. Um 8/8, uma semana do cliente, uma liquidação —
            crie aqui e a IA inteira fica sabendo, pelo tempo certo.
          </div>
        ) : (
          <ul className="space-y-3">
            {moments.map(moment => {
              const state = computedState(moment)
              const whatsappReady = moment.template_readiness?.whatsapp?.status === 'approved'
              return (
                <li key={moment.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[state]}`}>
                          {state}
                        </span>
                        <h3 className="truncate text-sm font-semibold text-gray-900">{moment.name}</h3>
                        {moment.priority > 0 && (
                          <span className="text-[11px] text-gray-400">prioridade {moment.priority}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(moment.starts_at).toLocaleString('pt-BR')} →{' '}
                        {new Date(moment.ends_at).toLocaleString('pt-BR')} · {offerSummary(moment.offer)}
                        {!whatsappReady && moment.offer?.kind !== 'none' && (
                          <span className="ml-2 text-amber-600">
                            sem template aprovado — toque fora da janela de 24h será suprimido
                          </span>
                        )}
                      </p>
                      {moment.public_claim && (
                        <p className="mt-1 truncate text-sm text-gray-700">“{moment.public_claim}”</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {state === 'rascunho' && (
                        <>
                          <button
                            title="Editar"
                            onClick={() => setForm(formFrom(moment))}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            disabled={saving}
                            onClick={() => transition(moment, 'approved')}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                          </button>
                        </>
                      )}
                      {(state === 'vigente' || state === 'agendado') && (
                        <>
                          <button
                            title="Editar"
                            onClick={() => setForm(formFrom(moment))}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            disabled={saving}
                            onClick={() => transition(moment, 'killed')}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            title="Kill switch: definitivo, vence a janela"
                          >
                            <Skull className="w-3.5 h-3.5" /> Matar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {form && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-semibold text-gray-900">
                {form.editing_id ? 'Editar momento' : 'Novo momento'}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Nasce rascunho; aprovado só vale DENTRO da janela — no dia seguinte
                a IA volta ao normal sozinha, sem limpeza.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Nome</span>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="ex.: Semana do Cliente 8/8"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600">Começa</span>
                    <input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={e => setForm({ ...form, starts_at: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600">Termina</span>
                    <input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={e => setForm({ ...form, ends_at: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">
                    Frase pública (a única promessa que a IA pode afirmar)
                  </span>
                  <input
                    value={form.public_claim}
                    onChange={e => setForm({ ...form, public_claim: e.target.value })}
                    placeholder="ex.: Semana do cliente: 10% em tudo com o cupom DEZ"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid grid-cols-3 gap-4">
                  <label className="text-sm col-span-2">
                    <span className="mb-1 block text-gray-600">Oferta</span>
                    <select
                      value={form.offer_kind}
                      onChange={e => setForm({ ...form, offer_kind: e.target.value as any })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      {OFFER_KINDS.map(k => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                  </label>
                  {form.offer_kind !== 'none' && form.offer_kind !== 'free_shipping' && (
                    <label className="text-sm">
                      <span className="mb-1 block text-gray-600">Valor</span>
                      <input
                        type="number" min={0}
                        value={form.offer_value}
                        onChange={e => setForm({ ...form, offer_value: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                </div>

                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Fatos temporários (um por linha — só valem na janela)</span>
                  <textarea
                    rows={2}
                    value={form.temp_facts}
                    onChange={e => setForm({ ...form, temp_facts: e.target.value })}
                    placeholder={'frete grátis acima de R$99 até domingo\ntroca estendida até janeiro'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">O que não fazer (um por linha)</span>
                  <textarea
                    rows={2}
                    value={form.forbidden}
                    onChange={e => setForm({ ...form, forbidden: e.target.value })}
                    placeholder="prometer extensão da promo"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>

                <div className="grid grid-cols-4 gap-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-600">Prioridade</span>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={e => setForm({ ...form, priority: Number(e.target.value) })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm col-span-2">
                    <span className="mb-1 block text-gray-600">Template WhatsApp (toques fora da janela 24h)</span>
                    <input
                      value={form.template_name}
                      onChange={e => setForm({ ...form, template_name: e.target.value })}
                      placeholder="nome_do_template_aprovado"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.template_approved}
                      onChange={e => setForm({ ...form, template_approved: e.target.checked })}
                    />
                    aprovado na Meta
                  </label>
                </div>
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
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentsTheme>
  )
}
