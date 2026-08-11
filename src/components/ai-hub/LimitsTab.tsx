'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Power, Save, Shield } from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Card } from '@/components/agents/ui/primitives'
import { agentToHub, hubToAgentPatch, type HubState } from '@/lib/ai/agent-hub'
import { FAMILY_LABELS, describeConcession, type Mission } from '@/lib/ai/missions'
import AreaFields from './AreaFields'

/**
 * A sub-aba Limites (10.3) — a que faltava do doc-fonte.
 *
 * Edita os MESMOS campos da área Limites da órbita (um dado, N portas:
 * settings.safety.blocked_topics + persona.guidelines do agente canônico),
 * mostra o consolidado de concessão POR MISSÃO em leitura ("edite dentro de
 * cada missão" — a regra da fronteira: dinheiro mora nas missões) e carrega
 * o interruptor de desligar o agente inteiro (is_active).
 */

export default function LimitsTab({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<any | null>(null)
  const [hub, setHub] = useState<HubState | null>(null)
  const [savedHub, setSavedHub] = useState('')
  const [missions, setMissions] = useState<Mission[]>([])
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
      const canonicalData = canonicalRes.ok ? await canonicalRes.json() : null
      const missionsData = missionsRes.ok ? await missionsRes.json() : { missions: [] }
      setCanonical(canonicalData?.canonical ?? null)
      setMissions(
        ((missionsData.missions ?? []) as Mission[]).filter((m) => m.status === 'active')
      )
      if (canonicalData?.canonical) {
        const next = agentToHub(canonicalData.canonical)
        setHub(next)
        setSavedHub(JSON.stringify(next))
      } else {
        setHub(null)
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(
    () => hub !== null && JSON.stringify(hub) !== savedHub,
    [hub, savedHub]
  )

  const save = async () => {
    if (!hub || !canonical) return
    setSaving(true)
    setError(null)
    try {
      const patch = hubToAgentPatch(canonical, hub)
      const res = await fetch(`/api/ai/agents/${canonical.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: patch.persona, settings: patch.settings }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao salvar')
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

  const toggleAgent = async () => {
    if (!canonical) return
    const next = !canonical.is_active
    const warning = next
      ? null
      : 'Desligar o agente inteiro? Nenhuma missão responde até religar.'
    if (warning && !window.confirm(warning)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/ai/agents/${canonical.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao alternar o agente')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="page">
        <div className="page-inner">
          <div className="ph">
            <div className="ph-ico" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>
              <Shield />
            </div>
            <div style={{ flex: 1 }}>
              <h1>Limites</h1>
              <p>O que o agente nunca faz — vale para todas as missões, sempre.</p>
            </div>
            {error && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</span>}
            {savedFlash && (
              <span style={{ fontSize: 12.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Check size={14} />Salvo
              </span>
            )}
            {hub && (
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
              </button>
            )}
          </div>

          {loading ? (
            <Card style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
              <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} />
            </Card>
          ) : !hub || !canonical ? (
            <Card style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Sem agente canônico — defina um na aba Agente para editar os limites.
              </p>
            </Card>
          ) : (
            <>
              <Card style={{ padding: 18, marginBottom: 14 }}>
                <AreaFields area="limits" hub={hub} onChange={setHub}
                  organizationId={organizationId} agentId={canonical.id} />
              </Card>

              <Card style={{ padding: 18, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 11 }}>
                  Consolidado de concessão{' '}
                  <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>
                    (somente leitura — edite dentro de cada missão)
                  </span>
                </div>
                {missions.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhuma missão ativa ainda.</p>
                ) : (
                  <div>
                    {missions.map((m) => (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                        borderBottom: '1px solid var(--border)', fontSize: 13,
                      }}>
                        <span style={{ fontWeight: 600, flex: '0 0 260px' }}>
                          {FAMILY_LABELS[m.event_type] ?? m.event_type}
                        </span>
                        <span style={{ color: 'var(--text-2)', flex: 1 }}>
                          {describeConcession(m.concession)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Power size={17} style={{ color: canonical.is_active ? 'var(--green)' : 'var(--red)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {canonical.is_active ? 'Agente ligado' : 'Agente desligado'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                      Desligado, nenhuma missão responde — toque pedido vira alerta, nada sai.
                    </div>
                  </div>
                  <button type="button" className={`tog${canonical.is_active ? ' on' : ''}`}
                    onClick={toggleAgent} />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </AgentsTheme>
  )
}
