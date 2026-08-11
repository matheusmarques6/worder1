'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Check, Loader2, Save } from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Card } from '@/components/agents/ui/primitives'
import {
  DISCOVERY_OBJECTIVES, agentToHub, biasFromObjective, hubToAgentPatch,
  type HubState,
} from '@/lib/ai/agent-hub'
import RadialView from './RadialView'
import ClassicView from './ClassicView'

/**
 * A aba Agente do IA Hub (10.1 + 10.2).
 *
 * 10.1 — um agente por loja: a lista morreu; o que se edita é O canônico.
 * Org com N ativos cai na tela única de escolha (os demais arquivam,
 * restauráveis escolhendo de novo). 10.2 — radial no desktop, clássica no
 * mobile, MESMO estado; o breakpoint decide, sem toggle (§4.4-2).
 *
 * Salvar: PATCH do agente (name/persona/settings/presentation_mode/
 * client_adaptation/model) e, se o viés da missão descoberta mudou, versão
 * nova da missão whatsapp.received + ativação (append-only, como manda a lei
 * das missões).
 */

interface AgentSummary {
  id: string
  name: string | null
  model: string | null
  is_active: boolean
  created_at: string
}

interface Mission {
  id: string
  event_type: string
  status: string
  objective: string
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isDesktop
}

export default function AgentTab({ organizationId }: { organizationId: string }) {
  const isDesktop = useIsDesktop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [canonical, setCanonical] = useState<any | null>(null)
  const [needsChoice, setNeedsChoice] = useState(false)
  const [discoveryMission, setDiscoveryMission] = useState<Mission | null>(null)
  const [hub, setHub] = useState<HubState | null>(null)
  const [savedHub, setSavedHub] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [canonicalRes, missionsRes] = await Promise.all([
        fetch('/api/ai/agents/canonical'),
        fetch('/api/ai/missions'),
      ])
      if (!canonicalRes.ok) {
        const d = await canonicalRes.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao carregar o agente')
      }
      const canonicalData = await canonicalRes.json()
      const missionsData = missionsRes.ok ? await missionsRes.json() : { missions: [] }

      const discovery: Mission | null =
        (missionsData.missions ?? []).find(
          (m: Mission) => m.event_type === 'whatsapp.received' && m.status === 'active'
        ) ?? null

      setAgents(canonicalData.agents ?? [])
      setCanonical(canonicalData.canonical)
      setNeedsChoice(Boolean(canonicalData.needsChoice))
      setDiscoveryMission(discovery)

      if (canonicalData.canonical) {
        const next = agentToHub(canonicalData.canonical)
        next.discovery.bias = biasFromObjective(discovery?.objective)
        setHub(next)
        setSavedHub(JSON.stringify(next))
      } else {
        setHub(null)
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar o agente')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(
    () => hub !== null && JSON.stringify(hub) !== savedHub,
    [hub, savedHub]
  )

  const choose = async (agentId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/agents/canonical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao definir o agente canônico')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!hub || !canonical) return
    setSaving(true)
    setError(null)
    try {
      const patch = hubToAgentPatch(canonical, hub)
      const res = await fetch(`/api/ai/agents/${canonical.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao salvar o agente')
      }

      const previousBias = biasFromObjective(discoveryMission?.objective)
      if (hub.discovery.bias && hub.discovery.bias !== previousBias) {
        // A lei das missões: versão nova (draft) + ativação explícita.
        const createRes = await fetch('/api/ai/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'whatsapp.received',
            objective: DISCOVERY_OBJECTIVES[hub.discovery.bias],
            parent_version_id: discoveryMission?.id ?? null,
            change_summary: `Viés da missão descoberta: ${hub.discovery.bias} (via radial)`,
          }),
        })
        if (createRes.ok) {
          const created = await createRes.json()
          const newId = created.mission?.id ?? created.id
          if (newId) {
            await fetch(`/api/ai/missions/${newId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'active' }),
            })
          }
        }
      }

      await load()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.01em' }}>Agente</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Um agente por loja · radial no desktop, clássica no mobile
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {error && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</span>}
          {savedFlash && (
            <span style={{ fontSize: 12.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={14} />Salvo
            </span>
          )}
          {canonical && (
            <button type="button" className="btn btn-primary btn-sm" onClick={save}
              disabled={!dirty || saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: 'var(--text-3)' }}>
            <Loader2 size={16} className="animate-spin" />Carregando…
          </div>
        ) : needsChoice ? (
          <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', width: '100%' }}>
            <Card style={{ padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                Escolha o agente canônico da loja
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
                Um agente por loja: o escolhido responde; os demais ficam arquivados
                (somente leitura — restauráveis escolhendo de novo aqui).
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {agents.map((a) => (
                  <div key={a.id} className="act-row">
                    <Bot size={17} style={{ color: 'var(--text-3)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="act-t">{a.name || 'Sem nome'}</div>
                      <div className="act-d">{a.model || 'modelo padrão'}{a.is_active ? ' · ativo' : ' · arquivado'}</div>
                    </div>
                    <button type="button" className="btn btn-soft btn-sm" disabled={saving}
                      onClick={() => choose(a.id)}>
                      Tornar canônico
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : !canonical || !hub ? (
          <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', width: '100%' }}>
            <Card style={{ padding: 24, textAlign: 'center' }}>
              <Bot size={28} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 15, fontWeight: 800 }}>Nenhum agente ainda</div>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 0 14px' }}>
                Crie o agente da loja no assistente e volte aqui para configurá-lo na órbita.
              </p>
              <a className="btn btn-primary btn-sm" href="/whatsapp/ai-agents">Criar agente</a>
            </Card>
          </div>
        ) : isDesktop ? (
          <RadialView hub={hub} onChange={setHub} organizationId={organizationId} agentId={canonical.id} />
        ) : (
          <ClassicView hub={hub} onChange={setHub} organizationId={organizationId} agentId={canonical.id} />
        )}
      </div>
    </AgentsTheme>
  )
}
