'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { HUB_AREAS, hubAreaDone, type HubState } from '@/lib/ai/agent-hub'
import AreaFields from './AreaFields'

/**
 * A clássica (10.2) — as mesmas 9 áreas em etapas verticais, sobre o MESMO
 * HubState da radial. Quem decide qual renderiza é o breakpoint no AgentTab
 * (§4.4-2: sem toggle "comparar").
 */

export interface ClassicViewProps {
  hub: HubState
  onChange: (next: HubState) => void
  organizationId: string
  agentId: string | null
}

export default function ClassicView({ hub, onChange, organizationId, agentId }: ClassicViewProps) {
  const [step, setStep] = useState(HUB_AREAS[0].id)
  const idx = HUB_AREAS.findIndex((a) => a.id === step)
  const area = HUB_AREAS[idx]

  return (
    <div className="hub-classic">
      <div className="hub-cl-steps">
        {HUB_AREAS.map((a, i) => (
          <button key={a.id} type="button"
            className={`vstep${step === a.id ? ' on' : ''}${hubAreaDone(hub, a.id) ? ' done' : ''}`}
            onClick={() => setStep(a.id)}>
            <div className="vnum">{hubAreaDone(hub, a.id) && step !== a.id ? <Check /> : i + 1}</div>
            <div>
              <div className="vt">{a.label}</div>
              <div className="vs">{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="hub-cl-form">
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{area.label}</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{area.sub}</p>
        </div>
        <div className="card" style={{ padding: 18, maxWidth: 560 }}>
          <AreaFields area={area.id} hub={hub} onChange={onChange}
            organizationId={organizationId} agentId={agentId} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, maxWidth: 560 }}>
          <button type="button" className="btn btn-ghost" disabled={idx === 0}
            onClick={() => setStep(HUB_AREAS[idx - 1].id)}>
            <ArrowLeft size={15} />Anterior
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={idx === HUB_AREAS.length - 1}
            onClick={() => setStep(HUB_AREAS[idx + 1].id)}>
            Próxima<ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
