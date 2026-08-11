'use client'

// Config do nó "Toque de IA (Missão)" — doc §4.2 (Fluxos·nó): que missão ·
// o que muda neste toque · o que autorizo (≤ teto da missão) · canal.
//
// O dropdown lê o CATÁLOGO (mission_ref da família — nunca o texto do toque);
// família sem missão ativa aparece desabilitada com o aviso. O teto de
// concessão é da missão: o nó pede ATÉ ele, e quem capa é o offer engine.

import { useEffect, useState } from 'react'
import { Loader2, Target, ShieldAlert } from 'lucide-react'
import { FAMILY_LABELS, type Mission } from '@/lib/ai/missions'

interface Props {
  config: Record<string, any>
  onUpdate: (key: string, value: any) => void
}

export default function AiMissionActionConfig({ config, onUpdate }: Props) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [families, setFamilies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/ai/missions')
        const body = await res.json()
        if (!cancelled && res.ok) {
          setMissions(body.missions ?? [])
          setFamilies(body.families ?? [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
  }

  const activeByFamily = new Map(
    missions.filter(m => m.status === 'active').map(m => [m.event_type, m])
  )
  const allFamilies = Array.from(new Set([...families, ...missions.map(m => m.event_type)]))
  const selected = config.eventFamily ? activeByFamily.get(config.eventFamily) : undefined
  const ceiling = selected?.concession

  const concession = config.concession ?? null

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
            return (
              <option key={family} value={family}>
                {(FAMILY_LABELS[family] ?? family) + (active ? '' : ' — sem missão ativa')}
              </option>
            )
          })}
        </select>
        {config.eventFamily && !selected && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-600">
            <ShieldAlert className="mt-0.5 w-3.5 h-3.5 shrink-0" />
            Esta família não tem missão ativa: o toque NÃO sai (o nó cai no
            caminho de erro e a org recebe alerta). Ative uma versão em IA → Missões.
          </p>
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
