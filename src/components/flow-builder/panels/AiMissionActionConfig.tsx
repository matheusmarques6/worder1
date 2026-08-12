'use client'

// Config do nó "Toque de IA (Missão)" — doc §4.2 (Fluxos·nó): que missão ·
// o que muda neste toque · variáveis deste ponto do fluxo · o que autorizo
// (≤ teto da missão) · canal.
//
// O dropdown lê o CATÁLOGO (mission_ref da família — nunca o texto do toque);
// o teto de concessão é da missão: o nó pede ATÉ ele, e quem capa é o offer
// engine. Família sem missão ativa não é beco: dá para ativar o rascunho ou
// criar uma missão nova AQUI (decisão do usuário 12/08 — "criar sem sair").

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Plus, ShieldAlert, Target, Trash2 } from 'lucide-react'
import { FAMILY_LABELS, type Mission } from '@/lib/ai/missions'

interface Props {
  config: Record<string, any>
  onUpdate: (key: string, value: any) => void
}

interface ContextVar {
  key: string
  value: string
}

export default function AiMissionActionConfig({ config, onUpdate }: Props) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [families, setFamilies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Criar/ativar missão sem sair do fluxo.
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newObjective, setNewObjective] = useState('')
  const [saving, setSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/ai/missions')
    const body = await res.json()
    if (res.ok) {
      setMissions(body.missions ?? [])
      setFamilies(body.families ?? [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
  }

  const activeByFamily = new Map(
    missions.filter(m => m.status === 'active').map(m => [m.event_type, m])
  )
  const allFamilies = Array.from(new Set([...families, ...missions.map(m => m.event_type)]))
  const selected = config.eventFamily ? activeByFamily.get(config.eventFamily) : undefined
  const ceiling = selected?.concession
  // Rascunho mais novo da família (a lista vem created_at desc): é o que o
  // botão "Ativar" liga — depois do seed, TODA família tem um esperando.
  const latestDraft = config.eventFamily
    ? missions.find(m => m.event_type === config.eventFamily && m.status === 'draft')
    : undefined

  const concession = config.concession ?? null
  const contextVars: ContextVar[] = Array.isArray(config.contextVars) ? config.contextVars : []

  const activateMission = async (missionId: string) => {
    setSaving(true)
    setInlineError(null)
    try {
      const res = await fetch(`/api/ai/missions/${missionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Falha ao ativar a missão')
      }
      await load()
      setShowCreate(false)
    } catch (err: any) {
      setInlineError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const createAndActivate = async () => {
    if (!newObjective.trim()) {
      setInlineError('Escreva o objetivo da missão (uma frase basta).')
      return
    }
    setSaving(true)
    setInlineError(null)
    try {
      const res = await fetch('/api/ai/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: config.eventFamily,
          display_name: newName.trim() || null,
          objective: newObjective.trim(),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.mission?.id) {
        throw new Error(body?.error ?? 'Falha ao criar a missão')
      }
      const activate = await fetch(`/api/ai/missions/${body.mission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!activate.ok) {
        const abody = await activate.json().catch(() => null)
        throw new Error(abody?.error ?? 'Missão criada como rascunho, mas a ativação falhou')
      }
      await load()
      setShowCreate(false)
      setNewName('')
      setNewObjective('')
    } catch (err: any) {
      setInlineError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const updateVar = (index: number, patch: Partial<ContextVar>) => {
    const next = contextVars.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onUpdate('contextVars', next)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs text-gray-500 flex items-center gap-1">
          <Target className="w-3.5 h-3.5" /> Missão (família do evento)
        </label>
        <select
          value={config.eventFamily || ''}
          onChange={e => onUpdate('eventFamily', e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">Selecione...</option>
          {allFamilies.map(family => {
            const active = activeByFamily.get(family)
            const label = FAMILY_LABELS[family] ?? family
            return (
              <option key={family} value={family}>
                {active
                  ? active.display_name
                    ? `${active.display_name} (${label})`
                    : label
                  : `${label} — sem missão ativa`}
              </option>
            )
          })}
        </select>

        {selected && (
          <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
            <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span>
              Este nó usa{' '}
              <span className="font-medium text-gray-600">
                {selected.display_name || FAMILY_LABELS[selected.event_type] || selected.event_type}
              </span>
              : “{selected.objective}”
            </span>
          </p>
        )}

        {config.eventFamily && !selected && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <ShieldAlert className="mt-0.5 w-3.5 h-3.5 shrink-0" />
              Esta família ainda não tem missão ativa — sem ela, o toque NÃO sai
              (o nó cai no caminho de erro e você recebe alerta). Resolva aqui mesmo:
            </p>

            {latestDraft && !showCreate && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-600">
                  Rascunho pronto:{' '}
                  <span className="font-medium">
                    {latestDraft.display_name || FAMILY_LABELS[latestDraft.event_type] || latestDraft.event_type}
                  </span>{' '}
                  — “{latestDraft.objective}”
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => activateMission(latestDraft.id)}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {saving ? 'Ativando…' : 'Ativar esta missão'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setShowCreate(true)}
                    className="text-[11px] text-amber-700 underline underline-offset-2"
                  >
                    ou criar uma nova
                  </button>
                </div>
              </div>
            )}

            {(!latestDraft || showCreate) && (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Nome da missão (livre — ex.: Recuperação VIP)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={newObjective}
                  onChange={e => setNewObjective(e.target.value)}
                  placeholder="Objetivo (ex.: trazer o cliente de volta ao carrinho)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={createAndActivate}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {saving ? 'Criando…' : 'Criar e ativar'}
                  </button>
                  {latestDraft && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setShowCreate(false)}
                      className="text-[11px] text-gray-500 underline underline-offset-2"
                    >
                      voltar
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-700/80">
                  Detalhes finos (critérios, limites de desconto) você ajusta depois em IA → Missões.
                </p>
              </div>
            )}

            {inlineError && <p className="text-[11px] text-red-600">{inlineError}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">O que muda NESTE toque (delta, opcional)</label>
        <input
          type="text"
          value={config.objective || ''}
          onChange={e => onUpdate('objective', e.target.value)}
          placeholder="ex.: lembrar do frete grátis de hoje"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={config.tone || ''}
          onChange={e => onUpdate('tone', e.target.value)}
          placeholder="tom deste toque (opcional)"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <label className="text-xs font-medium text-gray-500">
          Variáveis deste ponto do fluxo (opcional)
        </label>
        <p className="text-[11px] text-gray-400">
          Cada linha vira um fato que o agente vê neste toque. No valor você pode
          usar {'{{variáveis}}'} do fluxo — ex.: {'{{contact.firstName}}'} — que
          são preenchidas na hora do envio. Dados do cliente já entram sempre,
          sem precisar listar aqui.
        </p>
        {contextVars.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={row.key ?? ''}
              onChange={e => updateVar(index, { key: e.target.value })}
              placeholder="nome (ex.: cupom_do_dia)"
              className="w-2/5 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={row.value ?? ''}
              onChange={e => updateVar(index, { value: e.target.value })}
              placeholder="valor (aceita {{variáveis}})"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() =>
                onUpdate('contextVars', contextVars.filter((_, i) => i !== index))
              }
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-red-500"
              aria-label="Remover variável"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate('contextVars', [...contextVars, { key: '', value: '' }])}
          className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar variável
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        <label className="text-xs font-medium text-gray-500">
          O que autorizo neste toque (≤ teto da missão)
        </label>
        {ceiling && ceiling.kind !== 'none' ? (
          <p className="text-[11px] text-gray-400">
            Teto da missão: {ceiling.kind === 'free_shipping' ? 'frete grátis' : `${ceiling.kind} até ${ceiling.max_value}`} ·{' '}
            {ceiling.validity_hours ?? 48}h
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">
            A missão selecionada não autoriza concessão — pedidos daqui serão negados pelo engine (e registrados no ledger).
          </p>
        )}
        <div className="flex items-center gap-2">
          <select
            value={concession?.kind || ''}
            onChange={e => {
              const kind = e.target.value
              onUpdate('concession', kind ? { ...(concession ?? {}), kind } : null)
            }}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Sem benefício neste toque</option>
            <option value="percent">Desconto %</option>
            <option value="fixed">Desconto R$</option>
            <option value="free_shipping">Frete grátis</option>
          </select>
          {concession?.kind && concession.kind !== 'free_shipping' && (
            <input
              type="number"
              min={0}
              value={concession?.value ?? ''}
              onChange={e =>
                onUpdate('concession', { ...concession, value: Number(e.target.value) })
              }
              placeholder="valor"
              className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          O objeto (carrinho/checkout/pedido) vem do gatilho do fluxo em tempo de
          execução; o cupom só é emitido com um objeto para amarrar.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">Canal preferido</label>
        <select
          value={config.preferredChannel || 'whatsapp'}
          onChange={e => onUpdate('preferredChannel', e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email" disabled>E-mail (em breve)</option>
          <option value="instagram" disabled>Instagram (em breve)</option>
        </select>
      </div>
    </div>
  )
}
