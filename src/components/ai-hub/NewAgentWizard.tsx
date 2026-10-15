'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Copy, FilePlus2, Loader2, Sparkles } from 'lucide-react'
import { Card } from '@/components/agents/ui/primitives'
import { AGENT_TEMPLATES, type AgentTemplate } from '@/lib/ai/agent-templates'

/**
 * "Novo agente" em dois passos (plano IA, M2 passo 16): origem (modelo,
 * cópia de outro agente, do zero) com o painel "o que vem pronto"; depois
 * nome e função. Cria via POST /api/ai/agents (passo 15) e abre o editor.
 */

type Origin = { kind: 'template'; template: AgentTemplate } | { kind: 'copy'; agentId: string; name: string } | { kind: 'blank' }

interface ExistingAgent { id: string; name: string | null; role: string | null }

export default function NewAgentWizard({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [existing, setExisting] = useState<ExistingAgent[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setExisting(d.agents ?? []))
      .catch(() => {})
  }, [organizationId])

  const pick = (next: Origin) => {
    setOrigin(next)
    if (next.kind === 'template') { setName((n) => n || next.template.name); setRole((r) => r || next.template.role) }
    if (next.kind === 'copy') { setName((n) => n || `${next.name} (cópia)`) }
  }

  const create = async () => {
    if (!origin) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name: name.trim(), role: role.trim() || undefined }
      if (origin.kind === 'template') body.template_id = origin.template.id
      if (origin.kind === 'copy') body.copy_from = origin.agentId
      const res = await fetch('/api/ai/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Não foi possível criar o agente')
      router.push(`/ai/construtor/${data.agent.id}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const includes: string[] =
    origin?.kind === 'template' ? origin.template.includes
    : origin?.kind === 'copy' ? ['Persona, adaptação e limites copiados', 'Ferramentas e handoff copiados', 'Sem entradas: ligue um número depois']
    : origin?.kind === 'blank' ? ['Só transfer_to_human ligada', 'Sem missões: semeie no editor', 'Nasce como rascunho']
    : []

  return (
    <div style={{ padding: 22, maxWidth: 980, width: '100%', margin: '0 auto' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => (step === 2 ? setStep(1) : router.push('/ai/agentes'))}>
        <ArrowLeft size={14} />{step === 2 ? 'Origem' : 'Agentes'}
      </button>
      <div style={{ fontSize: 18, fontWeight: 800, margin: '10px 0 2px' }}>Novo agente</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 18 }}>
        {step === 1 ? 'Passo 1 de 2 · de onde ele parte' : 'Passo 2 de 2 · nome e função'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 18 }}>
        <div>
          {step === 1 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {AGENT_TEMPLATES.map((t) => (
                <OriginCard key={t.id} on={origin?.kind === 'template' && origin.template.id === t.id}
                  icon={<Sparkles size={16} />} title={t.name} sub={`${t.role} — ${t.summary}`}
                  onClick={() => pick({ kind: 'template', template: t })} />
              ))}
              {existing.map((a) => (
                <OriginCard key={a.id} on={origin?.kind === 'copy' && origin.agentId === a.id}
                  icon={<Copy size={16} />} title={`Copiar "${a.name || 'Sem nome'}"`} sub={a.role || 'agente existente'}
                  onClick={() => pick({ kind: 'copy', agentId: a.id, name: a.name || 'Agente' })} />
              ))}
              <OriginCard on={origin?.kind === 'blank'} icon={<FilePlus2 size={16} />}
                title="Do zero" sub="Só o essencial; você configura cada área na órbita"
                onClick={() => pick({ kind: 'blank' })} />
            </div>
          ) : (
            <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 7 }}>Nome</label>
                <input className="field" value={name} placeholder="ex.: Duda" autoFocus onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 7 }}>Função</label>
                <input className="field" value={role} placeholder="ex.: Vendas no WhatsApp" onChange={(e) => setRole(e.target.value)} />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                  Aparece na lista e nas transferências entre agentes.
                </div>
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
            </Card>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <div style={{ flex: 1 }} />
            {step === 1 ? (
              <button type="button" className="btn btn-primary" disabled={!origin} onClick={() => setStep(2)}>
                Continuar<ArrowRight size={15} />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={saving || !name.trim()} onClick={() => void create()}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Criar agente
              </button>
            )}
          </div>
        </div>

        <Card style={{ padding: 16, alignSelf: 'start' }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 10 }}>
            O que vem pronto
          </div>
          {includes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Escolha uma origem para ver.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {includes.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
                  <Check size={14} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />{item}
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>
            Todo agente nasce como rascunho. Ativar exige chave do provedor, uma missão e um caminho para humano.
          </div>
        </Card>
      </div>
    </div>
  )
}

function OriginCard({ on, icon, title, sub, onClick }: { on: boolean; icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className={`act-row${on ? ' on' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <span style={{ color: on ? 'var(--brand)' : 'var(--text-3)' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="act-t">{title}</div>
        <div className="act-d">{sub}</div>
      </div>
      {on && <Check size={16} style={{ color: 'var(--green)' }} />}
    </button>
  )
}
