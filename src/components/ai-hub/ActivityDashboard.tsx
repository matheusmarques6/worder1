'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Loader2 } from 'lucide-react'
import { Card } from '@/components/agents/ui/primitives'

/**
 * Atividade (plano IA M5 passo 29): o painel de negócio dos agentes, sobre
 * os desfechos por conversa (passos 27–28). Controles de período, agente,
 * comparação e CSV; dez KPIs; gráfico empilhado por agente; tabela por
 * agente; funil; motivos de transferência; assuntos; conhecimento mais
 * usado; incentivos; qualidade; mapa de calor; registro de atividade
 * abrindo a conversa no Inbox.
 */

const PERIODS = [{ v: 1, t: 'Hoje' }, { v: 7, t: '7 dias' }, { v: 30, t: '30 dias' }, { v: 90, t: '90 dias' }]
const METRICS = [
  { v: 'conversations', t: 'Conversas' }, { v: 'revenue', t: 'Receita' }, { v: 'orders', t: 'Pedidos' },
  { v: 'transfers', t: 'Transferências' }, { v: 'cost_usd', t: 'Custo' },
]
const COLORS = ['#F97316', '#3B6EF6', '#0E9384', '#7C5CFC', '#E0930B', '#E5484D', '#64748B']
const EVENT_LABEL: Record<string, string> = {
  sale: 'Venda', solved: 'Resolvida', handoff: 'Transferida', incentive: 'Incentivo', blocked: 'Bloqueada', gap: 'Lacuna',
}
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number) => `${Math.round(v * 100)}%`
const usd = (v: number) => `US$ ${v.toFixed(2)}`
const secs = (ms: number | null) => (ms === null ? '—' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)} min`)

export default function ActivityDashboard() {
  const [period, setPeriod] = useState(7)
  const [agent, setAgent] = useState('')
  const [compare, setCompare] = useState(true)
  const [metric, setMetric] = useState('conversations')
  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [eventKind, setEventKind] = useState('')
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ period: String(period), metric, compare: compare ? '1' : '0' })
      if (agent) qs.set('agent', agent)
      const res = await fetch(`/api/ai/activity/summary?${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar a atividade')
      setData(body)
      setError(null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [period, agent, compare, metric])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '40' })
    if (eventKind) qs.set('kind', eventKind)
    if (agent) qs.set('agent', agent)
    fetch(`/api/ai/activity/events?${qs}`).then((r) => (r.ok ? r.json() : { events: [] })).then((d) => setEvents(d.events ?? [])).catch(() => {})
  }, [eventKind, agent])

  useEffect(() => {
    fetch('/api/ai/alerts?status=open').then((r) => (r.ok ? r.json() : { alerts: [] })).then((d) => setAlerts(d.alerts ?? [])).catch(() => {})
  }, [])

  const agentName = useMemo(() => {
    const m = new Map<string, string>((data?.agents ?? []).map((a: any) => [a.id, a.name || 'Agente']))
    m.set('sem-agente', 'Sem agente')
    return (id: string | null) => m.get(id ?? 'sem-agente') ?? 'Agente'
  }, [data])

  const chartAgents: string[] = useMemo(() => {
    const ids = new Set<string>()
    for (const p of data?.series?.points ?? []) for (const id of Object.keys(p.byAgent)) ids.add(id)
    return [...ids]
  }, [data])

  const chartData = (data?.series?.points ?? []).map((p: any) => ({
    bucket: data.period.hourly ? `${p.bucket}h` : p.bucket.slice(5).split('-').reverse().join('/'),
    ...Object.fromEntries(chartAgents.map((id) => [agentName(id), p.byAgent[id] ?? 0])),
  }))

  const k = data?.kpis
  const p = data?.previous

  return (
    <div style={{ padding: 22, maxWidth: 1240, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Atividade</div>
        {alerts.length > 0 && (
          <span className="chip chip-red" title={alerts.map((a) => a.title).join('\n')}><AlertTriangle size={12} /> {alerts.length} alerta(s) aberto(s)</span>
        )}
        <div style={{ flex: 1 }} />
        <div className="seg-ctl">
          {PERIODS.map((o) => <button key={o.v} type="button" className={period === o.v ? 'on' : ''} onClick={() => setPeriod(o.v)}>{o.t}</button>)}
        </div>
        <select className="field" style={{ height: 32, width: 170, fontSize: 12.5 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">Todos os agentes</option>
          {(data?.agents ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name || 'Agente'}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />Comparar
        </label>
        <a className="btn btn-soft btn-sm" href={`/api/ai/activity/export.csv?period=${period}${agent ? `&agent=${agent}` : ''}`}><Download size={14} />CSV</a>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      {loading && !data ? <Loader2 size={18} className="animate-spin" /> : k && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            <Kpi label="Conversas" value={String(k.conversations)} now={k.conversations} prev={p?.conversations} />
            <Kpi label="Resolvidas sem humano" value={String(k.resolved_without_human)} now={k.resolved_without_human} prev={p?.resolved_without_human} />
            <Kpi label="Transferências" value={`${k.transfers} · ${pct(k.transfer_rate)}`} now={k.transfers} prev={p?.transfers} invert />
            <Kpi label="Pedidos" value={String(k.orders)} now={k.orders} prev={p?.orders} />
            <Kpi label="Receita atribuída" value={brl(k.revenue)} now={k.revenue} prev={p?.revenue} />
            <Kpi label="Conversão" value={pct(k.conversion)} now={k.conversion} prev={p?.conversion} />
            <Kpi label="Ticket médio" value={brl(k.avg_ticket)} now={k.avg_ticket} prev={p?.avg_ticket} />
            <Kpi label="1ª resposta (mediana)" value={secs(k.first_response_ms)} now={k.first_response_ms ?? 0} prev={p?.first_response_ms ?? undefined} invert />
            <Kpi label="Satisfação" value="—" hint="Sem avaliações coletadas ainda" />
            <Kpi label="Custo" value={`${usd(k.cost_usd)} · ${usd(k.cost_per_conversation)}/conv.`} now={k.cost_usd} prev={p?.cost_usd} invert />
          </div>

          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{data.period.hourly ? 'Por hora' : 'Por dia'}, por agente</div>
              <div style={{ flex: 1 }} />
              <select className="field" style={{ height: 30, width: 160, fontSize: 12 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRICS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
              </select>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={metric === 'revenue' || metric === 'cost_usd'} />
                  <Tooltip />
                  <Legend />
                  {chartAgents.map((id, i) => <Bar key={id} dataKey={agentName(id)} stackId="a" fill={COLORS[i % COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card style={{ padding: 16, overflowX: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>Por agente</div>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                {['Agente', 'Conversas', 'Sem humano', 'Transferidas', 'Pedidos', 'Receita', 'Incentivos (usados/oferecidos)', 'Custo', 'Retorno'].map((h) => <th key={h} style={{ padding: '6px 8px' }}>{h}</th>)}
              </tr></thead>
              <tbody>{data.by_agent.map((r: any) => (
                <tr key={r.agent_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{agentName(r.agent_id)}</td>
                  <td style={{ padding: '6px 8px' }}>{r.conversations}</td>
                  <td style={{ padding: '6px 8px' }}>{r.resolved_without_human}</td>
                  <td style={{ padding: '6px 8px' }}>{r.transfers} ({pct(r.transfer_rate)})</td>
                  <td style={{ padding: '6px 8px' }}>{r.orders}</td>
                  <td style={{ padding: '6px 8px' }}>{brl(r.revenue)}</td>
                  <td style={{ padding: '6px 8px' }}>{r.incentives_used}/{r.incentives_offered}</td>
                  <td style={{ padding: '6px 8px' }}>{usd(r.cost_usd)}</td>
                  <td style={{ padding: '6px 8px' }}>{r.roi === null ? '—' : `${r.roi}×`}</td>
                </tr>
              ))}</tbody>
            </table>
            {data.by_agent.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma conversa de agente no período.</p>}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <Panel title="Funil">
              {data.funnel.map((f: any) => (
                <BarRow key={f.step} label={f.step} value={f.value} max={data.funnel[0].value || 1} />
              ))}
            </Panel>
            <Panel title="Motivos de transferência">
              {data.handoff_reasons.length === 0 ? <Muted>Nenhuma transferência.</Muted>
                : data.handoff_reasons.map((r: any) => <BarRow key={r.key} label={r.key} value={r.count} max={data.handoff_reasons[0].count} />)}
            </Panel>
            <Panel title="Assuntos">
              {data.topics.length === 0 ? <Muted>Assuntos aparecem quando as conversas fecham.</Muted>
                : data.topics.map((t: any) => <BarRow key={t.topic} label={`${t.topic} · ${pct(t.resolved_rate)} resolvidas`} value={t.count} max={data.topics[0].count} />)}
            </Panel>
            <Panel title="Conhecimento mais usado">
              {data.knowledge.top.length === 0 ? <Muted>Nenhuma consulta no período.</Muted>
                : data.knowledge.top.map((s: any) => <BarRow key={s.source_id} label={s.name} value={s.count} max={data.knowledge.top[0].count} />)}
              <Link href="/ai/conhecimento" style={{ fontSize: 12, color: 'var(--brand)' }}>{data.knowledge.open_gaps} lacuna(s) aberta(s)</Link>
            </Panel>
            <Panel title="Incentivos">
              <Stat label="Oferecidos" value={data.incentives.offered} />
              <Stat label="Usados" value={`${data.incentives.used} (${pct(data.incentives.rate)})`} />
              <Stat label="Desconto concedido" value={brl(data.incentives.discount_total)} />
            </Panel>
            <Panel title="Qualidade e segurança">
              <Stat label="Mensagens enviadas" value={data.quality.messages} />
              <Stat label="Bloqueadas pela revisão" value={`${data.quality.blocked} em ${data.quality.conversations_with_block} conversa(s)`} />
              <Stat label="Conversas com lacuna" value={data.quality.gaps} />
            </Panel>
          </div>

          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>Mapa de calor (início das conversas)</div>
            <Heatmap grid={data.heatmap} />
          </Card>
        </>
      )}

      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>Registro de atividade</div>
          <div style={{ flex: 1 }} />
          <select className="field" style={{ height: 30, width: 150, fontSize: 12 }} value={eventKind} onChange={(e) => setEventKind(e.target.value)}>
            <option value="">Tudo</option>
            {Object.entries(EVENT_LABEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        {events.length === 0 ? <Muted>Nada registrado ainda.</Muted> : (
          <div style={{ display: 'grid', gap: 2 }}>
            {events.map((e) => (
              <Link key={e.id} href={e.contact_id ? `/whatsapp/inbox?contact=${e.contact_id}` : '/whatsapp/inbox'}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px', borderTop: '1px solid var(--border)', fontSize: 12.5, textDecoration: 'none', color: 'var(--text)' }}>
                <span className="chip chip-outline" style={{ minWidth: 86, justifyContent: 'center' }}>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span style={{ flex: 1 }}>{e.text}{e.amount ? ` · ${brl(Number(e.amount))}` : ''}</span>
                <span style={{ color: 'var(--text-3)' }}>{agentName(e.agent_id)}</span>
                <span style={{ color: 'var(--text-3)', width: 120, textAlign: 'right' }}>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Kpi({ label, value, now, prev, invert, hint }: { label: string; value: string; now?: number; prev?: number; invert?: boolean; hint?: string }) {
  let delta: number | null = null
  if (typeof now === 'number' && typeof prev === 'number') delta = prev === 0 ? (now === 0 ? 0 : null) : (now - prev) / prev
  const good = delta !== null && (invert ? delta < 0 : delta > 0)
  return (
    <div className="card" style={{ padding: 12 }} title={hint}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {delta !== null && delta !== 0 && (
        <div style={{ fontSize: 11.5, color: good ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 2 }}>
          {delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(Math.round(delta * 100))}% vs anterior
        </div>
      )}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card style={{ padding: 14, display: 'grid', gap: 6, alignContent: 'start' }}><div style={{ fontWeight: 800, fontSize: 13.5 }}>{title}</div>{children}</Card>
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{value}</b></div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round((value / Math.max(max, 1)) * 100)}%`, height: '100%', background: 'var(--brand, #F97316)' }} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--text-3)' }}>{label}</span><b>{value}</b></div>
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{children}</p>
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat())
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, minmax(14px, 1fr))', gap: 2, fontSize: 10, minWidth: 420 }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ textAlign: 'center', color: 'var(--text-3)' }}>{h % 3 === 0 ? h : ''}</span>)}
        {grid.map((row, d) => (
          <div key={d} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--text-3)' }}>{WEEKDAYS[d]}</span>
            {row.map((v, h) => (
              <span key={h} title={`${WEEKDAYS[d]} ${h}h: ${v}`} style={{ height: 14, borderRadius: 3, background: v ? `rgba(249,115,22,${0.15 + 0.85 * (v / max)})` : 'var(--border)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
