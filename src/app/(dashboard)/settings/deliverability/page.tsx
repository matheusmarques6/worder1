'use client'

// Configurações → Entregabilidade (desenho PEntreg): saúde 30 dias, checklist
// de autenticação e higiene da lista. Mantém a ferramenta de verificar um
// domínio qualquer (DNS ao vivo) do fluxo anterior.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'
import { Card, Row, SaveBar, Title, LoadingCard, Meter, Chk, Tog, useForm, Badge } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, nf } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'

interface Resp {
  metrics: { sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number; unsubscribed: number; bounce_rate: number; complaint_rate: number; unsubscribe_rate: number; open_rate: number; click_rate: number }
  sender: { email: string | null; domain: string; is_shared: boolean; verified: boolean; spf: boolean; dkim: boolean }
  tracking_domain: string | null
  hygiene: { suppress_inactive_days: number | null; validate_on_entry: boolean }
}
interface DomainCheck { domain: string; score: number; band: string; checks: Record<'spf' | 'dkim' | 'dmarc' | 'mx', { ok: boolean; state: string; value?: string; message: string; recommendation?: string }> }

const pctBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: v < 1 ? 2 : 1, maximumFractionDigits: 2 }) + '%'

export default function DeliverabilitySettingsPage() {
  const { currentStore, _hasHydrated } = useStoreStore() as any
  const storeId: string | null = currentStore?.id || null
  const { data, loading, error, reload } = useApi<Resp>(_hasHydrated ? `/api/settings/deliverability${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}` : null, [storeId])
  const dc = useApi<DomainCheck>(data?.sender?.domain ? `/api/deliverability/domain-check?domain=${encodeURIComponent(data.sender.domain)}` : null, [data?.sender?.domain])

  if (!_hasHydrated || (loading && !data)) return <><Title h="Entregabilidade" p="Saúde do envio nos últimos 30 dias e o que fazer para melhorar." /><LoadingCard rows={2} /><LoadingCard rows={4} /></>
  if (error || !data) return <><Title h="Entregabilidade" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  const m = data.metrics
  const bar = (v: number, goal: number) => ({ pct: Math.min(100, Math.round((v / (goal * 2.5)) * 100)), tone: v <= goal ? 'good' as const : 'over' as const })
  const b1 = bar(m.bounce_rate, 2), b2 = bar(m.complaint_rate, 0.1), b3 = bar(m.unsubscribe_rate, 0.5)
  const dmarcOk = !!dc.data?.checks?.dmarc?.ok
  const dmarcState = dc.data?.checks?.dmarc?.state
  const items: Array<{ t: string; h: string; ok: boolean; warn?: boolean; action?: React.ReactNode }> = [
    { t: 'SPF configurado', h: data.sender.spf ? data.sender.domain : `${data.sender.domain} — registro não verificado`, ok: data.sender.spf, action: !data.sender.spf ? <Link href="/settings/email" className="btn btn-sm">Resolver</Link> : undefined },
    { t: 'DKIM assinando', h: data.sender.dkim ? data.sender.domain : `${data.sender.domain} — registro não verificado`, ok: data.sender.dkim, action: !data.sender.dkim ? <Link href="/settings/email" className="btn btn-sm">Resolver</Link> : undefined },
    { t: 'DMARC publicado', h: dc.loading ? `${data.sender.domain} — consultando DNS…` : dmarcOk ? `${data.sender.domain} — ${dc.data?.checks.dmarc.value || 'p=none'}` : `${data.sender.domain} — sem registro _dmarc`, ok: dmarcOk, warn: dmarcState === 'warn', action: !dmarcOk && !dc.loading ? <Link href="/settings/email" className="btn btn-sm">Resolver</Link> : undefined },
    { t: 'Link de descadastro em um clique', h: 'List-Unsubscribe ativo em todos os envios', ok: true },
    { t: 'Domínio dos links personalizado', h: data.tracking_domain ? `Usando ${data.tracking_domain}` : `Usando ${data.sender.is_shared ? data.sender.domain : 'o domínio do Worder'}; recomendamos o seu`, ok: !!data.tracking_domain, action: !data.tracking_domain ? <Link href="/settings/email" className="btn btn-sm">Resolver</Link> : undefined },
  ]

  return (
    <>
      <Title h="Entregabilidade" p="Saúde do envio nos últimos 30 dias e o que fazer para melhorar." right={<Link href="/analytics/deliverability" className="lnk">Relatório completo<I n="chevR" s={15} /></Link>} />
      <Card flush>
        <div className="use">
          <Meter label="Taxa de rejeição" right="meta < 2%" value={pctBR(m.bounce_rate)} pct={b1.pct} tone={b1.tone} />
          <Meter label="Marcações de spam" right="meta < 0,1%" value={pctBR(m.complaint_rate)} pct={b2.pct} tone={b2.tone} />
          <Meter label="Descadastros" right="meta < 0,5%" value={pctBR(m.unsubscribe_rate)} pct={b3.pct} tone={b3.tone} />
        </div>
        <div className="sc-f"><span className="hint">{m.sent ? `${nf(m.sent)} e-mails enviados · ${nf(m.opened)} abertos · ${nf(m.clicked)} clicados nos últimos 30 dias.` : 'Nenhum e-mail enviado nos últimos 30 dias — as taxas aparecem depois do primeiro envio.'}</span></div>
      </Card>

      <Card title="Checklist de autenticação" desc="Itens que provedores como Gmail e Yahoo exigem desde 2024.">
        {items.map((it) => <Chk key={it.t} ok={it.ok} warn={it.warn} title={it.t} help={it.h} action={it.action} />)}
      </Card>

      <HygieneCard hygiene={data.hygiene} onSaved={() => reload(true)} />

      <DomainCheckCard initial={data.sender.domain} />
    </>
  )
}

function HygieneCard({ hygiene, onSaved }: { hygiene: Resp['hygiene']; onSaved: () => void }) {
  const f = useForm({ suppress: !!hygiene.suppress_inactive_days, days: hygiene.suppress_inactive_days || 180, validate: hygiene.validate_on_entry })
  useEffect(() => { f.reset({ suppress: !!hygiene.suppress_inactive_days, days: hygiene.suppress_inactive_days || 180, validate: hygiene.validate_on_entry }) }, [JSON.stringify(hygiene)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  const onSave = () => save(async () => { await api('/api/settings/deliverability', { method: 'PATCH', json: { hygiene: { suppress_inactive_days: v.suppress ? v.days : null, validate_on_entry: v.validate } } }); onSaved() }, 'Higiene da lista salva')
  return (
    <Card title="Higiene da lista" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row tg label="Suprimir inativos automaticamente" help={`Contatos sem abertura ou clique há ${v.days} dias saem dos envios de campanha (continuam em automações transacionais).`}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {v.suppress && <select className="in" style={{ width: 130, height: 34 }} value={v.days} onChange={(e) => f.set('days', Number(e.target.value))} aria-label="Dias sem interação">{[90, 120, 180, 270, 365].map((d) => <option key={d} value={d}>{d} dias</option>)}</select>}
          <Tog on={v.suppress} set={(x) => f.set('suppress', x)} label="Suprimir inativos automaticamente" />
        </div>
      </Row>
      <Row tg label="Validar e-mails na entrada" help="Rejeita endereços inválidos ou descartáveis em formulários e importações."><Tog on={v.validate} set={(x) => f.set('validate', x)} label="Validar e-mails na entrada" /></Row>
    </Card>
  )
}

function DomainCheckCard({ initial }: { initial: string }) {
  const [domain, setDomain] = useState(() => { try { return localStorage.getItem('wd:deliverability:domain') || initial } catch { return initial } })
  const [q, setQ] = useState<string | null>(null)
  const { data, loading, error } = useApi<DomainCheck>(q ? `/api/deliverability/domain-check?domain=${encodeURIComponent(q)}` : null, [q])
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const run = () => { if (!clean) return; try { localStorage.setItem('wd:deliverability:domain', clean) } catch { /* ignore */ } setQ(clean) }
  const band = data ? (data.band === 'excellent' ? 'ok' : data.band === 'good' ? 'ok' : data.band === 'fair' ? 'warn' : 'err') : 'off'
  return (
    <Card title="Verificar um domínio" desc="Consulta SPF, DKIM, DMARC e MX ao vivo em qualquer domínio — útil antes de adicionar ou para conferir o site principal.">
      <Row label="Domínio">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="in mono" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="sualoja.com.br" onKeyDown={(e) => { if (e.key === 'Enter') run() }} aria-label="Domínio para verificar" />
          <button type="button" className="btn" onClick={run} disabled={!clean || loading}>{loading ? <I n="refresh" s={14} className="spin" /> : <I n="search" s={14} />}Verificar</button>
        </div>
        {error && <div className="field-err">{error}</div>}
      </Row>
      {data && (
        <Row label="Resultado" help={<>Pontuação <b>{data.score}</b>/100 — {data.band === 'excellent' ? 'excelente' : data.band === 'good' ? 'boa' : data.band === 'fair' ? 'razoável' : 'fraca'}.</>}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}><Badge k={band as any}>{data.domain}</Badge></div>
          {(['spf', 'dkim', 'dmarc', 'mx'] as const).map((k) => {
            const c = data.checks[k]
            return <Chk key={k} ok={c.ok} warn={c.state === 'warn'} title={<>{k.toUpperCase()} — {c.message}</>} help={c.recommendation || c.value} />
          })}
        </Row>
      )}
    </Card>
  )
}
