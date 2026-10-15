'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { brl } from '@/lib/ai/brl'
import { Icon } from './proto/ui'
import AChart, { type ASeries } from './activity/AChart'
import {
  AGENT_COLORS, EVENT_KIND, ago, anf, apc, bucketLabel, criterionLabel, delta, handoffReasons, secs, weekRows,
} from './activity/activity-view'

/**
 * Atividade, porte do protótipo (ActivityPage), sobre os desfechos por
 * conversa: período, agentes em chips, comparação, dez indicadores com
 * variação, gráfico de área com a métrica em abas, tabela por agente,
 * funil, motivos de transferência, assuntos, conhecimento, incentivos,
 * qualidade com infrações por critério, mapa de horários, motor e custo,
 * registro de atividade e os alertas abertos (passo 30).
 */

type MetKey = 'conv' | 'rev' | 'res' | 'tr' | 'ord' | 'cost' | 'frt'
const MET: Record<MetKey, { label: string; api: string; sum: boolean }> = {
  conv: { label: 'Conversas', api: 'conversations', sum: true },
  rev: { label: 'Receita atribuída', api: 'revenue', sum: true },
  res: { label: 'Resolvidas sem humano', api: 'resolved', sum: false },
  tr: { label: 'Transferências', api: 'transfers', sum: true },
  ord: { label: 'Pedidos', api: 'orders', sum: true },
  cost: { label: 'Custo', api: 'cost_usd', sum: true },
  frt: { label: 'Tempo de 1ª resposta', api: 'first_response', sum: false },
}
const FUNNEL_LABEL: Record<string, string> = {
  Iniciadas: 'Conversas iniciadas', Responderam: 'IA respondeu', 'Receberam incentivo': 'Receberam incentivo', 'Pedido pago': 'Pedido pago',
}

function Delta({ d }: { d: ReturnType<typeof delta> }) {
  return d ? <span className={`ac-dl ${d.tone}`}>{d.text}</span> : null
}

export default function ActivityDashboard() {
  const [per, setPer] = useState(7)
  const [ag, setAg] = useState('all')
  const [met, setMet] = useState<MetKey>('conv')
  const [cmp, setCmp] = useState(true)
  const [evf, setEvf] = useState('all')
  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ period: String(per), metric: MET[met].api, compare: cmp ? '1' : '0' })
      if (ag !== 'all') qs.set('agent', ag)
      const res = await fetch(`/api/ai/activity/summary?${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar a atividade')
      setData(body)
      setError(null)
    } catch (e: any) { setError(e.message) }
  }, [per, ag, met, cmp])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '40' })
    if (evf !== 'all') qs.set('kind', evf)
    if (ag !== 'all') qs.set('agent', ag)
    fetch(`/api/ai/activity/events?${qs}`).then((r) => (r.ok ? r.json() : { events: [] })).then((d) => setEvents(d.events ?? [])).catch(() => {})
  }, [evf, ag])

  const loadAlerts = useCallback(() => {
    fetch('/api/ai/alerts?status=open').then((r) => (r.ok ? r.json() : { alerts: [] })).then((d) => setAlerts(d.alerts ?? [])).catch(() => {})
  }, [])
  // Alerta crítico aparece em até 1 minuto (aceite do passo 30).
  useEffect(() => {
    loadAlerts()
    const timer = setInterval(loadAlerts, 60_000)
    return () => clearInterval(timer)
  }, [loadAlerts])
  const settleAlert = async (id: string, status: 'acknowledged' | 'resolved') => {
    await fetch(`/api/ai/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    loadAlerts()
  }

  const rate: number = data?.usd_brl ?? 5
  const agents: any[] = useMemo(() => (data?.agents ?? []).filter((a: any) => a.status !== 'archived'), [data])
  const color = useCallback((id: string) => AGENT_COLORS[Math.max(0, agents.findIndex((a) => a.id === id)) % AGENT_COLORS.length], [agents])
  const nameOf = useCallback((id: string | null) => agents.find((a) => a.id === id)?.name || 'Agente', [agents])
  const ids: string[] = ag === 'all' ? agents.map((a) => a.id) : [ag]
  const n = per

  const fmt = (v: number) => met === 'rev' ? brl(v, 0) : met === 'cost' ? brl(v) : met === 'res' ? apc(v) : met === 'frt' ? secs(v) : anf(v)
  const series: ASeries[] = useMemo(() => {
    const points: any[] = data?.series?.points ?? []
    const k = met === 'cost' ? rate : 1
    return ids.map((id) => ({ k: id, l: nameOf(id), c: color(id), v: points.map((p) => (p.byAgent?.[id] ?? 0) * k) }))
      .filter((s) => s.v.some((x) => x > 0) || ids.length === 1)
  }, [data, ids.join(','), met, rate, nameOf, color]) // eslint-disable-line react-hooks/exhaustive-deps
  const labels: string[] = (data?.series?.points ?? []).map((p: any) => bucketLabel(p.bucket, data.period.hourly))

  const k = data?.kpis
  const p = cmp ? data?.previous : null
  const resP = (x: any) => (x?.conversations ? (x.resolved_without_human / x.conversations) * 100 : 0)
  const trP = (x: any) => (x ? x.transfer_rate * 100 : 0)
  const convP = (x: any) => (x ? x.conversion * 100 : 0)
  const frtS = (x: any) => (x?.first_response_ms != null ? x.first_response_ms / 1000 : null)
  const costB = (x: any) => (x ? x.cost_usd * rate : 0)

  const K: Array<[string, string, ReturnType<typeof delta>, string?]> = k ? [
    ['Conversas', anf(k.conversations), delta(k.conversations, p?.conversations)],
    ['Resolvidas sem humano', apc(resP(k)), delta(resP(k), p ? resP(p) : null, { pp: true })],
    ['Transferências', anf(k.transfers), delta(trP(k), p ? trP(p) : null, { pp: true, inv: true }), `${apc(trP(k))} das conversas`],
    ['Pedidos', anf(k.orders), delta(k.orders, p?.orders)],
    ['Receita atribuída', brl(k.revenue, 0), delta(k.revenue, p?.revenue)],
    ['Conversão', apc(convP(k)), delta(convP(k), p ? convP(p) : null, { pp: true }), 'conversa → pedido'],
    ['Ticket médio', k.orders ? brl(k.avg_ticket, 0) : '—', k.orders ? delta(k.avg_ticket, p?.orders ? p.avg_ticket : null) : null],
    ['1ª resposta', frtS(k) != null ? secs(frtS(k)!) : '—', delta(frtS(k), p ? frtS(p) : null, { inv: true }), 'mediana'],
    ['Satisfação', '—', null, 'sem avaliações ainda'],
    ['Custo', brl(costB(k)), delta(costB(k), p ? costB(p) : null, { inv: true }), `${brl(k.conversations ? costB(k) / k.conversations : 0, 3)} por conversa`],
  ] : []

  const perAgent = agents.map((a) => {
    const s = (data?.by_agent ?? []).find((x: any) => x.agent_id === a.id)
    const pv = (data?.by_agent_previous ?? []).find((x: any) => x.agent_id === a.id)
    return { a, s, pv }
  })
  const selected = ag !== 'all' ? agents.find((a) => a.id === ag) : null
  const reasons = handoffReasons(data?.handoff_reasons ?? [])
  const maxReason = Math.max(1, ...reasons.map((r) => r.count))
  const infractions: any[] = data?.quality?.infractions ?? []
  const maxInf = Math.max(1, ...infractions.map((r) => r.count))
  const heat = weekRows(data?.heatmap ?? [])
  const hmax = Math.max(1, ...heat.flatMap((r) => r.values))
  const engine = ids.map((id) => ({ a: agents.find((x) => x.id === id), e: (data?.engine ?? []).find((x: any) => x.agent_id === id), s: (data?.by_agent ?? []).find((x: any) => x.agent_id === id) })).filter((x) => x.a)
  const totIncU = (data?.by_agent ?? []).reduce((t: number, x: any) => t + (x.incentives_used ?? 0), 0)
  const csv = `/api/ai/activity/export.csv?period=${per}${ag !== 'all' ? `&agent=${ag}` : ''}`

  return (
    <div className="pin ac">
      <div className="ph ac-ph">
        <div>
          <h1 className="h1">Atividade dos agentes</h1>
          <p className="lead">Tudo o que os agentes fizeram no período: conversas, vendas, transferências, qualidade e custo.</p>
        </div>
        <div className="ac-ctl">
          <div className="ac-seg" role="tablist" aria-label="Período">
            {([[1, 'Hoje'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']] as const).map(([v, l]) => (
              <button key={v} type="button" className={per === v ? 'on' : ''} onClick={() => setPer(v)}>{l}</button>
            ))}
          </div>
          <a className="btn sm" href={csv}><Icon n="upload" s={14} style={{ transform: 'rotate(180deg)' }} />Exportar CSV</a>
        </div>
      </div>

      <div className="ac-bar">
        <div className="ac-agents">
          <button type="button" className={ag === 'all' ? 'on' : ''} onClick={() => setAg('all')}>Todos os agentes</button>
          {agents.map((a) => (
            <button key={a.id} type="button" className={ag === a.id ? 'on' : ''} onClick={() => setAg(a.id)}>
              <i style={{ background: color(a.id) }} />{a.name || 'Agente'}{a.status !== 'active' && <em>{a.status === 'draft' ? 'rascunho' : 'pausado'}</em>}
            </button>
          ))}
        </div>
        <label className="ac-cmp">
          <button type="button" className={'sw' + (cmp ? ' on' : '')} role="switch" aria-checked={cmp} onClick={() => setCmp((c) => !c)} />
          <span>Comparar com {n === 1 ? 'ontem' : `os ${n} dias anteriores`}</span>
        </label>
      </div>

      {alerts.map((a) => (
        <div key={a.id} className="ac-warn">
          <Icon n="alert" s={15} />
          <div style={{ flex: 1 }}><b>{a.title}</b>{a.severity === 'critical' ? 'Alerta crítico' : 'Alerta'} · {new Date(a.created_at).toLocaleString('pt-BR')}</div>
          <button type="button" className="btn sm" onClick={() => void settleAlert(a.id, 'acknowledged')}>Reconhecer</button>
          <button type="button" className="btn sm" onClick={() => void settleAlert(a.id, 'resolved')}>Resolver</button>
        </div>
      ))}
      {selected && selected.status !== 'active' && (
        <div className="ac-warn"><Icon n="pause" s={15} /><div><b>{selected.name} está {selected.status === 'draft' ? 'em rascunho' : 'pausado'}</b>Sem conversas novas enquanto não for ativado. Veja 30 ou 90 dias para o histórico.</div></div>
      )}
      {error && <div className="ac-warn"><Icon n="alert" s={15} /><div><b>Não foi possível carregar</b>{error}</div></div>}

      {k && <>
        <div className="card ac-kpis">
          {K.map(([l, v, d, sub]) => <div key={l} className="ac-k"><span>{l}</span><b>{v}</b><div>{cmp && <Delta d={d} />}{sub && <em>{sub}</em>}</div></div>)}
        </div>

        <div className="card">
          <div className="ac-ch">
            <h3 className="ct">{MET[met].label} {n === 1 ? 'por hora' : 'por dia'}</h3>
            <div className="ac-mets">{(Object.keys(MET) as MetKey[]).map((m) => <button key={m} type="button" className={met === m ? 'on' : ''} onClick={() => setMet(m)}>{MET[m].label}</button>)}</div>
          </div>
          <div className="ac-chb">
            {series.length > 1 && <div className="ac-leg">{series.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.l}</span>)}{MET[met].sum ? <em>empilhado</em> : null}</div>}
            <AChart series={series} labels={labels} fmt={fmt} stack={MET[met].sum} />
          </div>
        </div>

        <div className="card">
          <div className="ac-ch"><h3 className="ct">Por agente</h3><span className="ac-hint">Clique para filtrar</span></div>
          <div className="ac-ts">
            <table className="ac-tbl">
              <thead><tr><th>Agente</th><th className="r">Conversas</th><th className="r">Resolução</th><th className="r">Transf.</th><th className="r">Pedidos</th><th className="r">Receita</th><th className="r">Conversão</th><th className="r">Ticket</th><th className="r">1ª resp.</th><th className="r">Satisfação</th><th className="r">Incentivos</th><th className="r">Custo</th><th className="r">Retorno</th></tr></thead>
              <tbody>
                {perAgent.map(({ a, s, pv }) => {
                  const c = s ? costB(s) : 0
                  return (
                    <tr key={a.id} className={ag === a.id ? 'on' : ''} onClick={() => setAg(ag === a.id ? 'all' : a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAg(a.id)}>
                      <td><div className="ac-an"><span style={{ background: color(a.id) }}>{(a.name || 'A')[0]}</span><div><b>{a.name || 'Agente'}</b><em>{a.role || 'Agente'}{a.status !== 'active' ? ` · ${a.status === 'draft' ? 'rascunho' : 'pausado'}` : ''}</em></div></div></td>
                      <td className="r">{anf(s?.conversations ?? 0)}{cmp && <Delta d={delta(s?.conversations ?? 0, pv ? pv.conversations : (data?.by_agent_previous ? 0 : null))} />}</td>
                      <td className="r">{s?.conversations ? apc(resP(s)) : '—'}</td>
                      <td className="r">{anf(s?.transfers ?? 0)}</td>
                      <td className="r">{anf(s?.orders ?? 0)}</td>
                      <td className="r b">{brl(s?.revenue ?? 0, 0)}{cmp && <Delta d={delta(s?.revenue ?? 0, pv ? pv.revenue : (data?.by_agent_previous ? 0 : null))} />}</td>
                      <td className="r">{s?.conversations ? apc(convP(s)) : '—'}</td>
                      <td className="r">{s?.orders ? brl(s.avg_ticket, 0) : '—'}</td>
                      <td className="r">{s && frtS(s) != null ? secs(frtS(s)!) : '—'}</td>
                      <td className="r">—</td>
                      <td className="r">{anf(s?.incentives_used ?? 0)}<em className="ac-sub">de {anf(s?.incentives_offered ?? 0)}</em></td>
                      <td className="r">{brl(c)}</td>
                      <td className="r b">{c > 0 ? `${Math.round((s?.revenue ?? 0) / c).toLocaleString('pt-BR')}×` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td><td className="r">{anf(k.conversations)}</td><td className="r">{apc(resP(k))}</td><td className="r">{anf(k.transfers)}</td>
                  <td className="r">{anf(k.orders)}</td><td className="r b">{brl(k.revenue, 0)}</td><td className="r">{apc(convP(k))}</td>
                  <td className="r">{k.orders ? brl(k.avg_ticket, 0) : '—'}</td><td className="r">{frtS(k) != null ? secs(frtS(k)!) : '—'}</td><td className="r">—</td>
                  <td className="r">{anf(totIncU)}</td><td className="r">{brl(costB(k))}</td>
                  <td className="r b">{costB(k) > 0 ? `${Math.round(k.revenue / costB(k)).toLocaleString('pt-BR')}×` : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="ac-grid">
          <div className="card ac-c">
            <h3 className="ct">Funil de conversão</h3>
            <div className="ac-fun">
              {(data.funnel ?? []).map((f: any, i: number) => (
                <div key={f.step} className="ac-fr">
                  <div className="ac-fl"><span>{FUNNEL_LABEL[f.step] ?? f.step}</span><b>{anf(f.value)}</b><em>{k.conversations ? apc((f.value / k.conversations) * 100, 0) : '—'}</em></div>
                  <div className="ac-fb"><i style={{ width: `${k.conversations ? (f.value / k.conversations) * 100 : 0}%`, opacity: 1 - i * 0.14 }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Por que transferiram</h3>
            <p className="ac-cs">{anf(k.transfers)} {k.transfers === 1 ? 'conversa passou' : 'conversas passaram'} para a equipe</p>
            <div className="ac-bars">
              {reasons.map((r) => <div key={r.label} className="ac-br"><span>{r.label}</span><div><i style={{ width: `${(r.count / maxReason) * 100}%` }} /></div><b>{anf(r.count)}</b></div>)}
              {!reasons.length && <p className="ac-cs">Nenhuma transferência no período.</p>}
            </div>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Assuntos mais frequentes</h3>
            <div className="ac-list">
              {(data.topics ?? []).slice(0, 7).map((t: any) => (
                <div key={t.topic} className="ac-li"><i style={{ background: ids.length === 1 ? color(ids[0]) : '#9CA3AF' }} /><span>{t.topic}</span><b>{anf(t.count)}</b><em className={t.resolved_rate < 0.7 ? 'lo' : ''}>{apc(t.resolved_rate * 100, 0)} resolvidas</em></div>
              ))}
              {!(data.topics ?? []).length && <p className="ac-cs">Sem conversas classificadas no período.</p>}
            </div>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Conhecimento mais usado</h3>
            <div className="ac-list">
              {(data.knowledge?.top ?? []).map((s: any) => (
                <div key={s.source_id} className="ac-li"><Icon n="bookOpen" s={14} c="var(--tx3)" /><span>{s.name}</span><b>{anf(s.count)}<small> usos</small></b></div>
              ))}
              {!(data.knowledge?.top ?? []).length && <p className="ac-cs">Nenhuma busca no conhecimento no período.</p>}
            </div>
            <div className="ac-foot"><span><b>{anf(data.quality?.gaps ?? 0)}</b> perguntas sem resposta</span><Link href="/ai/conhecimento" className="btn sm">Ver lacunas</Link></div>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Incentivos</h3>
            <div className="ac-mini">
              {([['Oferecidos', anf(data.incentives?.offered ?? 0)], ['Usados', anf(data.incentives?.used ?? 0)], ['Taxa de uso', data.incentives?.offered ? apc(data.incentives.rate * 100, 0) : '—'], ['Desconto concedido', brl(data.incentives?.discount_total ?? 0, 0)]] as const).map(([l, v]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
            </div>
            <p className="ac-cs">Só com a autorização da missão de cada agente. A IA não cria desconto por conta própria.</p>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Qualidade e segurança</h3>
            <div className="ac-mini">
              {([['Mensagens enviadas', anf(data.quality?.messages ?? 0)], ['Bloqueadas pela revisão', anf(data.quality?.blocked ?? 0)], ['Conversas com bloqueio', anf(data.quality?.conversations_with_block ?? 0)], ['Perguntas sem resposta', anf(data.quality?.gaps ?? 0)]] as const).map(([l, v]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
            </div>
            <div className="ac-bars sm">
              {infractions.slice(0, 6).map((r) => <div key={r.criterion} className="ac-br"><span>{criterionLabel(r.criterion, r.name)}</span><div><i className="er" style={{ width: `${(r.count / maxInf) * 100}%` }} /></div><b>{anf(r.count)}</b></div>)}
            </div>
          </div>
        </div>

        <div className="ac-grid2">
          <div className="card ac-c">
            <div className="ac-ch0"><h3 className="ct">Quando os clientes chamam</h3><span className="ac-hint">conversas por dia da semana e hora</span></div>
            <div className="ac-hm-w">
              <div className="ac-hm">
                <span />
                {Array.from({ length: 24 }, (_, h) => <span key={h} className="ac-hh">{h % 3 === 0 ? `${h}h` : ''}</span>)}
                {heat.map((row) => (
                  <React.Fragment key={row.day}>
                    <span className="ac-hd">{row.day}</span>
                    {row.values.map((v, h) => <i key={h} title={`${row.day} ${h}h: ${anf(v)} conversas`} style={{ background: `color-mix(in oklab, var(--pri) ${Math.round((v / hmax) * 100)}%, var(--sf3))` }} />)}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="card ac-c">
            <h3 className="ct">Motor e custo</h3>
            <div className="ac-eng">
              {engine.map(({ a, e, s }) => (
                <div key={a.id} className="ac-er">
                  <div className="ac-an sm"><span style={{ background: color(a.id) }}>{(a.name || 'A')[0]}</span><div><b>{a.name || 'Agente'}</b><em>{e?.model || a.model || '—'}</em></div></div>
                  <div><b>{((e?.tokens ?? 0) / 1e6).toFixed(2).replace('.', ',')}M</b><em>tokens</em></div>
                  <div><b>{e?.avg_latency_ms != null ? secs(e.avg_latency_ms / 1000) : '—'}</b><em>latência média</em></div>
                  <div><b>{brl(s ? costB(s) : 0)}</b><em>custo</em></div>
                </div>
              ))}
            </div>
            <div className="ac-share">{engine.filter((x) => x.s && x.s.cost_usd > 0).map(({ a, s }) => <i key={a.id} style={{ flex: s.cost_usd, background: color(a.id) }} title={brl(costB(s))} />)}</div>
            {data.budget?.limit_usd ? (
              <p className="ac-cs">Orçamento mensal: {brl(data.budget.limit_usd * rate)} · usado {apc(Math.min(100, (data.budget.spent_month_usd / data.budget.limit_usd) * 100), 0)} neste mês.</p>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="ac-ch">
            <h3 className="ct">Registro de atividade</h3>
            <div className="ac-mets">
              {[['all', 'Tudo'] as [string, string], ...Object.entries(EVENT_KIND).map(([kk, v]) => [kk, v[0]] as [string, string])].map(([kk, l]) => (
                <button key={kk} type="button" className={evf === kk ? 'on' : ''} onClick={() => setEvf(kk)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="ac-feed">
            {events.map((e) => {
              const t = EVENT_KIND[e.kind] ?? ['Evento', 'sparkle', 'ne']
              return (
                <Link key={e.id} className="ac-ev" style={{ color: 'inherit' }} title={t[0]} href={e.contact_id ? `/whatsapp/inbox?contact=${e.contact_id}` : '/whatsapp/inbox'}>
                  <span className={`ac-evi chip ${t[2]}`}><Icon n={t[1]} s={13} /></span>
                  <div className="ac-evb"><b>{nameOf(e.agent_id)} <span>· {e.contact_name || t[0]}</span></b><em>{e.text}</em></div>
                  {e.amount ? <strong>{brl(Number(e.amount))}</strong> : null}
                  <span className="ac-evt">{ago(e.created_at)}</span>
                  <Icon n="chevR" s={15} c="var(--tx3)" />
                </Link>
              )
            })}
            {!events.length && <div className="ac-empty">Nada deste tipo no período.</div>}
          </div>
        </div>
      </>}
    </div>
  )
}
