'use client'

import { useState } from 'react'
import {
  Smile, Target, SlidersHorizontal, BookOpen, Wand2, Shield, Users, Star, Cpu,
  Check, Eye, X,
} from 'lucide-react'
import {
  HUB_AREAS, ORBIT_POS, hubAreaDone, hubDoneCount,
  type HubAreaId, type HubState,
} from '@/lib/ai/agent-hub'
import AreaFields from './AreaFields'

/**
 * A radial oficial (10.2) — o agente no centro, as 9 áreas em órbita, o
 * drawer editando a área clicada. Fiel ao protótipo ia/radial.jsx; os dados
 * são os reais (HubState ↔ ai_agents + missão descoberta).
 */

const AREA_ICONS: Record<HubAreaId, typeof Smile> = {
  identity: Smile,
  discovery: Target,
  adapt: SlidersHorizontal,
  knowledge: BookOpen,
  tools: Wand2,
  limits: Shield,
  handoff: Users,
  judges: Star,
  budget: Cpu,
}

export interface RadialViewProps {
  hub: HubState
  onChange: (next: HubState) => void
  organizationId: string
  agentId: string | null
}

export default function RadialView({ hub, onChange, organizationId, agentId }: RadialViewProps) {
  const [selected, setSelected] = useState<HubAreaId | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const done = hubDoneCount(hub)
  const pct = Math.round((done / HUB_AREAS.length) * 100)
  const R = 82
  const CIRC = 2 * Math.PI * R
  const area = selected ? HUB_AREAS.find((a) => a.id === selected)! : null

  return (
    <div className="orbit-scroll">
      <div className="orbit-stage">
        <div className="orbit-dots" />
        <svg className="orbit-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {HUB_AREAS.map((a, i) => {
            const p = ORBIT_POS[i]
            const on = hubAreaDone(hub, a.id)
            return (
              <line key={a.id} x1="50" y1="47" x2={p.x} y2={p.y}
                stroke={on ? '#F97316' : '#D5D9DF'} strokeOpacity={on ? 0.45 : 0.7}
                strokeWidth={on ? 0.4 : 0.3} strokeDasharray={on ? 'none' : '1.2 1.2'}
                vectorEffect="non-scaling-stroke" style={{ transition: 'all .3s' }} />
            )
          })}
        </svg>
        {HUB_AREAS.map((a, i) => {
          const p = ORBIT_POS[i]
          const on = hubAreaDone(hub, a.id)
          const Ico = AREA_ICONS[a.id]
          return (
            <button key={a.id} type="button"
              className={`onode${on ? ' done' : ''}${selected === a.id ? ' sel' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, ['--nc' as any]: a.color, ['--nt' as any]: a.tint }}
              onClick={() => { setSelected(a.id); setShowPrompt(false) }}>
              <div className="disc">
                <Ico />
                {on && <span className="nbadge"><Check /></span>}
              </div>
              <div className="nlabel">{a.label}</div>
              <div className="nsub">{on ? 'configurado' : 'a preencher'}</div>
            </button>
          )
        })}
        <div className="ocore" style={{ left: '50%', top: '47%' }}
          onClick={() => { setShowPrompt((v) => !v); setSelected(null) }}>
          <div className="ring-wrap">
            <svg className="ring" width="172" height="172">
              <circle cx="86" cy="86" r={R} fill="none" stroke="var(--border-2)" strokeWidth="5" />
              <circle cx="86" cy="86" r={R} fill="none" stroke="url(#hubGradRing)" strokeWidth="5"
                strokeLinecap="round" strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - done / HUB_AREAS.length)}
                style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1)' }} />
              <defs>
                <linearGradient id="hubGradRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FF9D4D" /><stop offset="100%" stopColor="#F76B1C" />
                </linearGradient>
              </defs>
            </svg>
            <div className="nucleus">
              <span className="nemo">🧡</span>
              <span className="nname">{hub.identity.name || 'Seu agente'}</span>
              <span className="npct">{pct}% configurado</span>
            </div>
          </div>
          <div className="ctag"><Eye size={13} />{showPrompt ? 'Ocultar resumo' : 'Ver resumo'}</div>
        </div>
        <div className="orbit-legend">
          <span><span className="sw" />&nbsp; área configurada</span>
          <span><span className="sw dash" />&nbsp; a preencher</span>
          <span style={{ marginLeft: 6 }}>{done}/{HUB_AREAS.length} áreas · clique em um nó para editar</span>
        </div>
        {showPrompt && (
          <div className="prompt-sheet">
            <div className="psheet-head">
              <Wand2 size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Resumo de {hub.identity.name || '—'}</span>
              <span className="chip" style={{ marginLeft: 4 }}>{pct}%</span>
              <button type="button" className="close-x" onClick={() => setShowPrompt(false)}><X size={16} /></button>
            </div>
            <div className="prompt-box" style={{ borderRadius: 0, maxHeight: 260 }}>
              {HUB_AREAS.map((a) =>
                hubAreaDone(hub, a.id)
                  ? <div key={a.id}><span className="h"># {a.label.toUpperCase()}</span>{'\n'}configurada — os blocos reais aparecem no preview do prompt{'\n\n'}</div>
                  : <div key={a.id}><span className="ghost">· {a.label} — a preencher</span>{'\n\n'}</div>
              )}
            </div>
          </div>
        )}
        {area && (
          <div className="hub-drawer">
            <div className="hub-drawer-head">
              <div className="dr-ico" style={{ background: area.tint, color: area.color }}>
                {(() => { const Ico = AREA_ICONS[area.id]; return <Ico /> })()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{area.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{area.sub}</div>
              </div>
              <button type="button" className="close-x" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>
            <div className="hub-drawer-body">
              <AreaFields area={area.id} hub={hub} onChange={onChange}
                organizationId={organizationId} agentId={agentId} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
