'use client'

// Painéis da esquerda do Construtor: Palette2, Inspector2 e Diagnostics do
// protótipo, ligados aos dados reais. Controles sem suporte no runtime
// ficam de fora em vez de fingir que funcionam.

import React, { useState } from 'react'
import Link from 'next/link'
import { brl } from '@/lib/ai/brl'
import {
  ADAPT_OPTIONS, MODELS, PRESENTATIONS, VOICES, layout2,
  type BuilderModel, type LNode, type PaletteItem,
} from '@/lib/ai/builder-model'
import type { Diagnostic } from '@/lib/ai/block-metrics'
import { Icon, KV, Pill, Sec, SwW, Tile, type Tone } from '../proto/ui'
import type { AgentHead } from './Canvas'

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

export function Palette({ groups, agents, agentId, setAgent, setDrag, onAdd }: {
  groups: Array<{ g: string; items: PaletteItem[] }>
  agents: Array<{ id: string; name: string | null; role: string | null }>
  agentId: string
  setAgent: (id: string) => void
  setDrag: (it: PaletteItem | null) => void
  onAdd: (it: PaletteItem) => void
}) {
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  return (
    <aside className="w-left">
      <div className="w-lh">
        <div className="w-cap">Agente</div>
        <label className="w-agsel">
          <Tile ic="sparkle" tone="teal" s={30} />
          <select value={agentId} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name || 'Sem nome'} · {a.role || 'Sem função'}</option>)}
          </select>
          <Icon n="chevD" s={15} c="#6B7280" />
        </label>
      </div>
      <div className="w-ls"><label className="w-search"><Icon n="search" s={15} /><input placeholder="Buscar blocos..." value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <div className="w-lb2">
        <div className="w-sect">Blocos</div>
        {groups.map((g) => {
          const items = g.items.filter((i) => (i.t + i.s).toLowerCase().includes(q.toLowerCase()))
          if (!items.length) return null
          const c = closed[g.g] && !q
          return (
            <div key={g.g} className="w-grp">
              <button type="button" className="w-gh" onClick={() => setClosed((o) => ({ ...o, [g.g]: !o[g.g] }))} aria-expanded={!c}>
                {g.g}<Icon n="chevD" s={15} style={{ transform: c ? 'rotate(-90deg)' : 'rotate(180deg)', transition: 'transform .2s' }} />
              </button>
              {!c && items.map((it) => {
                const off = Boolean(it.used || it.soon)
                const body = <><Tile ic={it.ic} tone={it.tone} s={36} /><div><b>{it.t}</b><span>{it.used ? 'Já está no agente' : it.s}</span></div></>
                if (it.soon && it.href) return <Link key={it.id} href={it.href} className="w-pi used" style={{ textDecoration: 'none' }}>{body}</Link>
                return (
                  <div key={it.id} className={'w-pi' + (off ? ' used' : '')} draggable={!off}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; setDrag(it) }}
                    onDragEnd={() => setDrag(null)}
                    onClick={() => { if (!off) onAdd(it) }} role="button" tabIndex={off ? -1 : 0}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !off) onAdd(it) }} aria-disabled={off}>
                    {body}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function Chips({ items, onChange, ph }: { items: string[]; onChange: (l: string[]) => void; ph: string }) {
  const [v, setV] = useState('')
  return (
    <div className="w-chips">
      {items.map((x, i) => <span key={i}>{x}<button type="button" aria-label="Remover" onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon n="x" s={11} /></button></span>)}
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onChange([...items, v.trim()]); setV('') } }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={ph} />
      </form>
    </div>
  )
}

export interface InspectorActions {
  setVoice: (label: string) => void
  setPres: (label: string) => void
  setModel: (slug: string) => void
  setCapBrl: (value: number | null) => void
  setAdapt: (label: string, on: boolean) => void
  setTopics: (l: string[]) => void
  setRules: (l: string[]) => void
  setReview: (l: string[]) => void
  setPhrases: (l: string[]) => void
  setMessage: (s: string) => void
  setDest: (d: string) => void
  setDelivery: (p: Partial<{ debounce: number; split: boolean; typing: boolean }>) => void
  editMissions: () => void
}

export function Inspector({ id, f, agent, modelSlug, handoffMessage, keyMask, monthLabel, agents, rejected, actions, onClose, onRemove, onCopy }: {
  id: string
  f: BuilderModel
  agent: AgentHead
  modelSlug: string
  handoffMessage: string
  keyMask: string | null
  monthLabel: string
  agents: Array<{ id: string; name: string | null; role: string | null }>
  rejected: Array<{ at: string; text: string }>
  actions: InspectorActions
  onClose: () => void
  onRemove: (id: string) => void
  onCopy: (id: string) => void
}) {
  const n: LNode | undefined = layout2(f).N.find((x) => x.id === id)
  if (!n) return null
  const d = n.d || {}
  const meta: Record<string, [string, Tone, string]> = {
    entry: [d.ic, d.tone, d.t], kb: ['bookOpen', 'purple', d.t], tool: ['wand', 'sky', d.t], agent: ['sparkle', 'teal', agent.name],
    adapt: ['sliders', 'violet', 'Adaptação ao cliente'], limits: ['shield', 'red', 'Limites'], review: ['star', 'blue', 'Revisão antes de enviar'],
    split: ['users2', 'amber', 'Precisa de uma pessoa?'], transfer: ['users', 'violet', 'Transferência'], send: ['send2', 'green', 'Enviar resposta'],
  }
  const [ic, tone, title] = meta[n.type]
  const fx = f.fixed
  const stats: Array<[string, string]> | null = ({
    entry: d.m, kb: d.m ? [[d.m[0][0], 'usos em 7 dias']] : null, tool: d.m,
    agent: agent.draft ? [['0', 'conversas 7d'], ['R$ 0', 'receita atribuída'], ['Rascunho', 'situação']] : [[fx.agent[0][0], 'conversas 7d'], [fx.agent[1][0], 'receita atribuída'], [fx.agent[2][0], 'por conversa']],
    adapt: fx.adapt, limits: [[fx.limits[0][0], 'bloqueios 7d']], review: [[fx.review[0][0], 'aprovadas'], [fx.review[1][0], 'reprovadas 7d']],
    split: [[fx.split[0][0], 'transferidas 7d']], transfer: fx.transfer, send: [[fx.send[0][0], 'respostas 7d'], [fx.send[1][0], 'resolvidas sem pessoa']],
  } as Record<string, Array<[string, string]> | null>)[n.type]

  let body: React.ReactNode = null
  if (n.type === 'entry') {
    body = (
      <>
        <Sec t="Configuração" act={d.kind === 'whatsapp_account' ? <button type="button" className="w-btn sm" onClick={actions.editMissions}>Editar</button> : null}>
          <KV k="Canal">{d.t}</KV><KV k="Quando responde">{d.when}</KV><KV k="Missão">{d.mis}</KV>
          {d.incentive && <KV k="Incentivo">{d.incentive}</KV>}
        </Sec>
        {d.kind === 'whatsapp_account'
          ? <div className="w-info"><Icon n="clock" s={14} />Fora da janela de 24h, {agent.name} só responde com template aprovado pela Meta.</div>
          : <div className="w-info"><Icon n="zap" s={14} />Objetivo e autorização deste toque são editados no nó de IA do fluxo. <Link href="/automations">Abrir fluxo</Link></div>}
      </>
    )
  }
  if (n.type === 'kb') {
    body = (
      <>
        <Sec t="Fonte" act={<Link className="w-btn sm" href={`/ai/conhecimento?note=${d.sourceId}`}>Abrir</Link>}>
          <KV k="Tipo">{d.s}</KV>
          <KV k="Situação">{d.st === 'error' ? <span className="w-pill off"><i></i>Erro</span> : <Pill k={d.st === 'ok' ? 'live' : d.st} />}</KV>
          <KV k="Outros agentes">{d.others}</KV>
        </Sec>
        <Sec t="Prévia do conteúdo"><div className="w-prev">{d.prev || 'Conteúdo em processamento.'}</div></Sec>
        <div className="w-info"><Icon n="faqHelp" s={14} />Editar esta fonte muda a resposta de todos os agentes que a usam.</div>
      </>
    )
  }
  if (n.type === 'tool') {
    body = d.lock ? (
      <>
        <Sec t="Trava dupla"><KV k="Quem libera">Só um toque de fluxo com autorização</KV><KV k="Teto">Definido no toque</KV><KV k="Por contato">1 incentivo ativo</KV></Sec>
        <div className="w-info amber"><Icon n="lock" s={14} />Pedido fora da autorização é recusado pela ferramenta, mesmo que o texto do agente aceite.</div>
      </>
    ) : <Sec t="Configuração"><KV k="Integração">{d.s}</KV></Sec>
  }
  if (n.type === 'agent') {
    const capPct = f.agent.cap && f.agent.used != null ? Math.min(1, f.agent.used / f.agent.cap) : 0
    const models = MODELS.some(([s]) => s === modelSlug) ? MODELS : [...MODELS, [modelSlug, f.agent.model] as [string, string]]
    body = (
      <>
        <Sec t="Identidade">
          <div className="w-seg">{VOICES.map(([, x]) => <button type="button" key={x} className={f.agent.voice === x ? 'on' : ''} onClick={() => actions.setVoice(x)}>{x}</button>)}</div>
          <KV k="Apresentação">
            <select className="w-select" value={f.agent.pres} onChange={(e) => actions.setPres(e.target.value)}>
              {PRESENTATIONS.map(([, l]) => <option key={l}>{l}</option>)}
            </select>
          </KV>
          <div className="w-help">Se perguntarem, {agent.name} sempre confirma que é uma IA.</div>
        </Sec>
        <Sec t="Motor e custo">
          <KV k="Modelo">
            <select className="w-select" value={modelSlug} onChange={(e) => actions.setModel(e.target.value)}>
              {models.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </KV>
          <KV k="Chave"><span className="mono">{keyMask ?? 'não conectada'}</span></KV>
          <KV k="Limite do mês">
            <CapField cap={f.agent.cap} onChange={actions.setCapBrl} />
          </KV>
          <div className="w-bar lg"><i style={{ width: capPct * 100 + '%' }}></i></div>
          <div className="w-help">{f.agent.used == null ? 'Sem gasto registrado' : `${brl(f.agent.used)} usados em ${monthLabel}`}. Ao atingir o limite, {agent.name} pausa e avisa a equipe.</div>
        </Sec>
      </>
    )
  }
  if (n.type === 'adapt') {
    body = <Sec t="Ajustes">{ADAPT_OPTIONS.map(([x]) => <KV key={x} k={x}><SwW on={f.adapt.includes(x)} set={(v) => actions.setAdapt(x, v)} label={x} /></KV>)}</Sec>
  }
  if (n.type === 'limits') {
    body = (
      <>
        <Sec t="Assuntos que não aborda"><Chips items={f.limits.filter((l) => l[0] === 'topic').map((l) => l[1])} ph="Adicionar assunto" onChange={actions.setTopics} /></Sec>
        <Sec t="Regras que nunca quebra"><Chips items={f.limits.filter((l) => l[0] === 'rule').map((l) => l[1])} ph="Adicionar regra" onChange={actions.setRules} /></Sec>
        <div className="w-info"><Icon n="shield" s={14} />Restrição soma: nenhum fluxo consegue liberar o que está aqui.</div>
      </>
    )
  }
  if (n.type === 'review') {
    body = (
      <>
        <Sec t="Revisão">
          <KV k="Revisar antes de enviar"><SwW on dis set={() => {}} label="Revisão" /></KV>
          <div className="w-help">Sempre ligada. Reprovada 3 vezes, a resposta não sai e vira alerta para a equipe.</div>
        </Sec>
        <Sec t="Critérios da loja"><Chips items={f.review} ph="Adicionar critério" onChange={actions.setReview} /></Sec>
        <Sec t="Reprovadas recentes">
          {rejected.length === 0 ? <div className="w-help">Nenhuma nos últimos dias.</div>
            : rejected.slice(0, 3).map((r, i) => <div key={i} className="w-log"><b>{r.at}</b><p>{r.text}</p></div>)}
        </Sec>
      </>
    )
  }
  if (n.type === 'split') {
    body = <Sec t="Frases que transferem"><Chips items={f.handoff.phrases} ph="Adicionar frase" onChange={actions.setPhrases} /></Sec>
  }
  if (n.type === 'transfer') {
    body = (
      <>
        <Sec t="Destino">
          <KV k="Para">
            <select className="w-select" value={f.handoff.dest} onChange={(e) => actions.setDest(e.target.value)}>
              <option value="team">Equipe · Inbox</option>
              {agents.filter((a) => a.id !== agent.id).map((a) => <option key={a.id} value={a.id}>{a.name || 'Agente'} · {(a.role || 'agente').toLowerCase()}</option>)}
            </select>
          </KV>
        </Sec>
        <Sec t="Mensagem ao transferir">
          <textarea className="w-ta" rows={3} defaultValue={handoffMessage} placeholder={`Vou te passar para ${f.handoff.dest === 'team' ? 'alguém da equipe' : f.handoff.destName ?? 'outro agente'}. Já conto o que conversamos.`}
            onBlur={(e) => actions.setMessage(e.target.value)} />
        </Sec>
      </>
    )
  }
  if (n.type === 'send') {
    body = (
      <Sec t="Entrega">
        <KV k="Agrupar mensagens"><span className="w-rng"><input type="range" min="3" max="60" value={f.send.debounce} onChange={(e) => actions.setDelivery({ debounce: Number(e.target.value) })} /><b className="mono">{f.send.debounce}s</b></span></KV>
        <KV k="Dividir em balões"><SwW on={f.send.split} set={(v) => actions.setDelivery({ split: v })} label="Dividir" /></KV>
        <KV k="Ritmo de digitação"><SwW on={f.send.typing} set={(v) => actions.setDelivery({ typing: v })} label="Ritmo" /></KV>
      </Sec>
    )
  }
  const removable = n.type === 'entry' ? d.kind === 'whatsapp_account' : n.type === 'kb' || n.type === 'tool'
  return (
    <aside className="w-left insp" key={id}>
      <div className="w-ih"><Tile ic={ic} tone={tone} s={32} /><b>{title}</b><button type="button" className="w-ib" onClick={onClose} aria-label="Fechar"><Icon n="x" s={16} /></button></div>
      <div className="w-ib2">
        {stats && <div className="w-stats">{stats.map(([v, l]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>}
        {body}
      </div>
      <div className="w-if">
        <button type="button" className="w-btn ghost" onClick={() => onCopy(id)}><Icon n="copy" s={14} />Copiar ID</button>
        {removable ? <button type="button" className="w-btn danger" onClick={() => onRemove(id)}><Icon n="trash" s={14} />Remover</button>
          : <span className="w-if-n">{n.type === 'entry' ? 'Vem do fluxo' : 'Bloco fixo do agente'}</span>}
      </div>
    </aside>
  )
}

/** "Limite do mês R$ 400,00": texto como no protótipo; clique para editar. */
function CapField({ cap, onChange }: { cap: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return <button type="button" onClick={() => setEditing(true)} title="Editar limite" style={{ fontWeight: 600 }}>{cap == null ? 'Sem limite' : brl(cap)}</button>
  }
  return (
    <input autoFocus className="w-select" style={{ width: 120, textAlign: 'right', backgroundImage: 'none', paddingRight: 10 }} inputMode="decimal" aria-label="Limite do mês em reais"
      defaultValue={cap == null ? '' : String(cap).replace('.', ',')} placeholder="sem limite"
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={(e) => { const raw = e.target.value.trim().replace(/\./g, '').replace(',', '.'); onChange(raw === '' ? null : Number(raw)); setEditing(false) }} />
  )
}

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

export function Diagnostics({ issues, onClose, onPick }: { issues: Diagnostic[]; onClose: () => void; onPick: (node: string) => void }) {
  const order = { error: 0, warn: 1, ok: 2 } as const
  const sorted = [...issues].sort((a, b) => order[a.lv] - order[b.lv])
  return (
    <aside className="w-left insp">
      <div className="w-ih"><Tile ic="alert" tone="amber" s={32} /><b>Diagnóstico</b><button type="button" className="w-ib" onClick={onClose} aria-label="Fechar"><Icon n="x" s={16} /></button></div>
      <div className="w-ib2">
        <div className="w-stats">
          <div><span>atenção</span><b>{issues.filter((i) => i.lv !== 'ok').length}</b></div>
          <div><span>tudo certo</span><b>{issues.filter((i) => i.lv === 'ok').length}</b></div>
        </div>
        {sorted.map((i) => (
          <button type="button" key={i.id} className={'w-iss ' + (i.lv === 'ok' ? 'ok' : 'warn')} onClick={() => onPick(i.node)}
            style={i.lv === 'error' ? { background: 'var(--er-bg)' } : undefined}>
            <span className="w-iss-i" style={i.lv === 'error' ? { color: 'var(--er)' } : undefined}><Icon n={i.lv === 'ok' ? 'check' : 'alert'} s={13} sw={2.2} /></span>
            <div><b>{i.t}</b><p>{i.d}</p></div>
            <Icon n="chevR" s={15} c="#9CA3AF" />
          </button>
        ))}
      </div>
    </aside>
  )
}
