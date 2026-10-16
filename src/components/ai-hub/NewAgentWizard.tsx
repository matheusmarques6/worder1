'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AGENT_AREAS, AGENT_TEMPLATES, suggestSources, templateAreas, templateMissionLabels, templateToolLabels,
} from '@/lib/ai/agent-templates'
import { Av, Icon } from './proto/ui'

/**
 * "Novo agente" do protótipo (CreateAgent): 1 Por onde começar (modelo,
 * cópia de um agente da loja ou do zero) · 2 Nome e conhecimento. Cria o
 * rascunho via POST /api/ai/agents e abre o Construtor dele.
 */

type Src = { t: 'model'; id: string } | { t: 'copy'; id: string } | { t: 'zero' }

interface ExistingAgent { id: string; name: string | null; role: string | null; status: string; missions_count?: number }
interface Source { id: string; name: string; kind: string; readers: string[] }

const KIND_LABEL: Record<string, string> = {
  catalog: 'Catálogo', document: 'Documento', faq: 'Perguntas e respostas',
  site_page: 'Página da loja', url: 'Página da loja', note: 'Texto',
}

export default function NewAgentWizard({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [src, setSrc] = useState<Src>({ t: 'model', id: 'pos-compra' })
  const [step, setStep] = useState(0)
  const [agents, setAgents] = useState<ExistingAgent[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [name, setName] = useState('Nina')
  const [role, setRole] = useState('Pós-compra')
  const [kb, setKb] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgents((d.agents ?? []).filter((a: ExistingAgent) => a.status !== 'archived')))
      .catch(() => {})
    fetch('/api/ai/knowledge')
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then((d) => setSources((d.folders ?? []).flatMap((f: { notes: Source[] }) => f.notes)))
      .catch(() => {})
  }, [organizationId])

  const m = src.t === 'model' ? AGENT_TEMPLATES.find((x) => x.id === src.id) ?? null : null
  const copyA = src.t === 'copy' ? agents.find((a) => a.id === src.id) ?? null : null
  const mAreas = useMemo(() => (m ? templateAreas(m) : []), [m])

  // Ao trocar de origem: função e fontes sugeridas (o nome fica o que está).
  useEffect(() => {
    if (m) {
      setRole(m.role)
      setKb(new Set(suggestSources(m, sources)))
    } else if (copyA) {
      setRole(copyA.role || '')
      setKb(new Set(sources.filter((s) => s.readers.includes(copyA.id)).map((s) => s.id)))
    } else {
      setKb(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src.t, (src as { id?: string }).id, sources])

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'Agente'
  const sourcesOf = (id: string) => sources.filter((s) => s.readers.includes(id)).length
  const filled = m ? mAreas.length : copyA ? 8 : 1
  const display = name.trim() || 'o agente'

  const create = async () => {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name: name.trim(), role: role.trim() || undefined, source_ids: [...kb] }
      if (m) body.template_id = m.id
      if (copyA) body.copy_from = copyA.id
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

  return (
    <div className="pin narrow">
      <div className="ph"><div>
        <h1 className="h1">Novo agente</h1>
        <p className="lead">Comece por um modelo pronto ou copie um agente que já funciona. Tudo continua editável no editor.</p>
      </div></div>

      <div className="cr-steps">
        {['Por onde começar', 'Nome e conhecimento'].map((s, i) => (
          <button key={s} type="button" className={'cr-st' + (i === step ? ' on' : '') + (i < step ? ' done' : '')} onClick={() => i < step && setStep(i)}>
            <span>{i < step ? <Icon n="check" s={12} sw={2.4} /> : i + 1}</span>{s}
          </button>
        ))}
      </div>

      <div className="cr">
        <div className="cr-l">
          {step === 0 ? (
            <div className="rise" key="s0">
              <div className="lbl" style={{ marginBottom: 10 }}>Modelos</div>
              <div className="cr-models">
                {AGENT_TEMPLATES.map((x) => {
                  const on = src.t === 'model' && src.id === x.id
                  return (
                    <button key={x.id} type="button" className={'cr-m' + (on ? ' on' : '')} onClick={() => setSrc({ t: 'model', id: x.id })} aria-pressed={on}>
                      <span className="cr-mi"><Icon n={x.icon} s={18} /></span>
                      <b>{x.title}</b><p>{x.summary}</p>
                      <span className="cr-mf">{templateAreas(x).length} de 9 áreas prontas</span>
                    </button>
                  )
                })}
              </div>
              {agents.length > 0 && <>
                <div className="lbl" style={{ margin: '26px 0 10px' }}>Copiar um agente da loja</div>
                <div className="cr-copy">
                  {agents.map((a) => {
                    const n = a.missions_count ?? 0
                    return (
                      <button key={a.id} type="button" className={'cr-c' + (src.t === 'copy' && src.id === a.id ? ' on' : '')} onClick={() => setSrc({ t: 'copy', id: a.id })}>
                        <Av name={a.name} />
                        <div><b>{a.name || 'Sem nome'}</b><span>{a.role || 'Agente'} · {sourcesOf(a.id)} fontes · {n} {n === 1 ? 'missão' : 'missões'}</span></div>
                        <span className="cr-radio" />
                      </button>
                    )
                  })}
                </div>
              </>}
              <button type="button" className="cr-zero" onClick={() => setSrc({ t: 'zero' })} aria-pressed={src.t === 'zero'}>
                <span className={'cr-radio' + (src.t === 'zero' ? ' on' : '')} />Começar do zero, com todas as áreas vazias
              </button>
            </div>
          ) : (
            <div className="rise card cr-form" key="s1">
              <div className="cr-row">
                <div>
                  <label className="flbl" htmlFor="nm">Nome</label>
                  <input id="nm" className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <div className="help">É assim que {display} se apresenta. Se perguntarem, sempre confirma que é uma IA.</div>
                </div>
                <div>
                  <label className="flbl" htmlFor="rl">Função</label>
                  <input id="rl" className="field" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <div className="flbl">Conhecimento que {display} pode consultar</div>
                <div className="help" style={{ marginTop: 0, marginBottom: 10 }}>
                  {sources.length === 0
                    ? 'A loja ainda não tem fontes. Você cria no Conhecimento depois, e liga no Construtor.'
                    : `Fontes do catálogo da loja. Marcamos as que ${copyA ? `${copyA.name || 'o agente'} usa` : 'combinam com o modelo'}.`}
                </div>
                <div className="cr-kb">
                  {sources.map((s) => {
                    const on = kb.has(s.id)
                    const readers = s.readers.map(agentName)
                    return (
                      <label key={s.id} className={'cr-k' + (on ? ' on' : '')}>
                        <input type="checkbox" checked={on} onChange={() => setKb((k) => { const n = new Set(k); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} />
                        <div><b>{s.name}</b><span>{KIND_LABEL[s.kind] ?? s.kind} · {readers.length ? `usada por ${readers.join(', ')}` : 'nenhum agente usa ainda'}</span></div>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="note" style={{ marginTop: 20 }}>
                <Icon n="alert" s={16} />
                <span>{name.trim() || 'O agente'} nasce como <b style={{ color: 'var(--ink)' }}>rascunho</b>. Nada é enviado a clientes até você passar pelo checklist de ativação.</span>
              </div>
              {error && <div className="note" role="alert" style={{ marginTop: 10, color: 'var(--er)', background: 'var(--er-bg)' }}><Icon n="alert" s={16} /><span>{error}</span></div>}
            </div>
          )}
        </div>

        <aside className="cr-r card">
          <div className="lbl">O que vem pronto</div>
          <div className="cr-prev-h">{src.t === 'zero' ? 'Agente em branco' : m ? m.title : `Cópia de ${copyA?.name || 'agente'}`}</div>
          <div className="cr-bar"><i style={{ width: `${(filled / 9) * 100}%` }} /></div>
          <div className="cr-cnt">{filled} de 9 áreas preenchidas</div>
          <ul className="cr-areas">
            {AGENT_AREAS.map((a) => {
              const on = src.t === 'zero' ? a.id === 'engine' : m ? mAreas.includes(a.id) || a.id === 'engine' : a.id !== 'missions'
              return (
                <li key={a.id} className={on ? 'on' : ''}>
                  <span>{on ? <Icon n="check" s={12} sw={2.4} /> : null}</span>{a.label}
                  {a.id === 'engine' && on && <em>chave da conta</em>}
                  {a.id === 'knowledge' && !on && <em>no próximo passo</em>}
                  {copyA && a.id === 'missions' && <em>missões não são copiadas</em>}
                </li>
              )
            })}
          </ul>
          {m && (
            <div className="cr-det">
              <div><span>Missões prontas</span>{templateMissionLabels(m).map((x) => <em key={x} className="chip sm">{x}</em>)}</div>
              {templateToolLabels(m).length > 0 && <div><span>Ferramentas</span><p>{templateToolLabels(m).join(', ')}</p></div>}
              {m.rules.length > 0 && <div><span>Regras que nunca quebra</span><p>{m.rules.join('. ')}.</p></div>}
            </div>
          )}
          {copyA && (
            <div className="cr-det">
              <p style={{ margin: 0 }}>Copia voz, adaptação, ferramentas, limites, transferência e revisão de {copyA.name || 'o agente'}. Missões ficam de fora porque cada situação tem um só agente responsável.</p>
            </div>
          )}
          <div className="cr-foot">
            {step === 0
              ? <button type="button" className="btn pri" style={{ width: '100%' }} onClick={() => setStep(1)}>Continuar<Icon n="arrowR" s={16} /></button>
              : <>
                <button type="button" className="btn" onClick={() => setStep(0)}>Voltar</button>
                <button type="button" className="btn pri" style={{ flex: 1 }} disabled={!name.trim() || saving} onClick={() => void create()}>
                  {saving ? 'Criando…' : 'Criar e abrir editor'}
                </button>
              </>}
          </div>
        </aside>
      </div>
    </div>
  )
}
