'use client'

// Configurações → Regras de envio (desenho PRegras): horário de silêncio,
// limite de frequência e fluxos simultâneos. Salva em /api/settings/organization.

import { useEffect } from 'react'
import { Card, Row, SaveBar, Title, LoadingCard, Tog, useForm } from '@/components/settings/ui'
import { api } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'

interface Org {
  quiet_hours_enabled: boolean | null; quiet_hours_start: number | null; quiet_hours_end: number | null; quiet_hours_timezone: string | null
  max_sends_per_contact_per_day: number | null; max_email_per_contact_per_day: number | null; max_sms_per_contact_per_day: number | null; max_whatsapp_per_contact_per_day: number | null
  skip_contacts_in_active_flows: boolean | null
  settings: { sending?: { quiet_hours_channels?: 'all' | 'sms_whatsapp'; campaign_priority?: boolean } } | null
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const TZS: Array<[string, string]> = [['America/Sao_Paulo', 'São Paulo'], ['America/Manaus', 'Manaus'], ['America/Fortaleza', 'Fortaleza'], ['America/Cuiaba', 'Cuiabá'], ['America/Rio_Branco', 'Rio Branco'], ['America/Buenos_Aires', 'Buenos Aires'], ['America/Bogota', 'Bogotá'], ['America/Mexico_City', 'Cidade do México'], ['America/New_York', 'Nova York'], ['Europe/Lisbon', 'Lisboa']]

export default function SendingRulesSettingsPage() {
  const { data, loading, error, reload } = useApi<{ organization: Org | null }>('/api/settings/organization')
  return (
    <>
      <Title h="Regras de envio" p="Proteções globais aplicadas a todas as automações e campanhas." />
      {loading && !data ? <><LoadingCard rows={2} /><LoadingCard rows={3} /><LoadingCard rows={1} /></> : error || !data?.organization ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <>
          <QuietCard org={data.organization} onSaved={() => reload(true)} />
          <FrequencyCard org={data.organization} onSaved={() => reload(true)} />
          <FlowsCard org={data.organization} onSaved={() => reload(true)} />
        </>
      )}
    </>
  )
}

function QuietCard({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const init = () => ({ on: !!org.quiet_hours_enabled, start: org.quiet_hours_start ?? 22, end: org.quiet_hours_end ?? 8, tz: org.quiet_hours_timezone || 'America/Sao_Paulo', channels: org.settings?.sending?.quiet_hours_channels === 'all' ? 'all' : 'sms_whatsapp' })
  const f = useForm(init())
  useEffect(() => { f.reset(init()) }, [JSON.stringify(org)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  const onSave = () => save(async () => {
    await api('/api/settings/organization', { method: 'PATCH', json: { quiet_hours_enabled: v.on, quiet_hours_start: v.start, quiet_hours_end: v.end, quiet_hours_timezone: v.tz, settings: { ...(org.settings || {}), sending: { ...(org.settings?.sending || {}), quiet_hours_channels: v.channels } } } })
    onSaved()
  }, 'Horário de silêncio salvo')
  return (
    <Card title="Horário de silêncio" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row tg label="Não enviar em determinado horário" help="Mensagens ficam em espera e saem quando a janela abre."><Tog on={v.on} set={(x) => f.set('on', x)} label="Não enviar em determinado horário" /></Row>
      {v.on && (
        <>
          <Row label="Janela" help={`No fuso horário de cada contato quando disponível; senão, ${TZS.find(([k]) => k === v.tz)?.[1] || v.tz}.`}>
            <div className="in3">
              <div><span className="inl">De</span><select className="in" value={v.start} onChange={(e) => f.set('start', Number(e.target.value))} aria-label="Início">{HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select></div>
              <div><span className="inl">Até</span><select className="in" value={v.end} onChange={(e) => f.set('end', Number(e.target.value))} aria-label="Fim">{HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</select></div>
              <div><span className="inl">Canais</span><select className="in" value={v.channels} onChange={(e) => f.set('channels', e.target.value as any)} aria-label="Canais"><option value="sms_whatsapp">WhatsApp e SMS</option><option value="all">Todos</option></select></div>
            </div>
          </Row>
          <Row label="Fuso padrão" help="Usado quando não sabemos o fuso do contato." htmlFor="qh-tz">
            <select id="qh-tz" className="in" value={v.tz} onChange={(e) => f.set('tz', e.target.value)} style={{ maxWidth: 280 }}>
              {!TZS.some(([k]) => k === v.tz) && <option value={v.tz}>{v.tz}</option>}
              {TZS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Row>
        </>
      )}
    </Card>
  )
}

function FrequencyCard({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const num = (n: number | null | undefined) => (n && n > 0 ? String(n) : '')
  const init = () => ({ email: num(org.max_email_per_contact_per_day), wa: num(org.max_whatsapp_per_contact_per_day), sms: num(org.max_sms_per_contact_per_day), total: num(org.max_sends_per_contact_per_day), priority: org.settings?.sending?.campaign_priority !== false })
  const f = useForm(init())
  useEffect(() => { f.reset(init()) }, [JSON.stringify(org)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  const parse = (s: string) => { const n = Number(s); return s === '' ? null : Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n) : NaN }
  const onSave = () => save(async () => {
    const vals = { email: parse(v.email), wa: parse(v.wa), sms: parse(v.sms), total: parse(v.total) }
    if (Object.values(vals).some((n) => Number.isNaN(n))) throw new Error('Use números de 0 a 50 (ou deixe vazio para sem limite).')
    await api('/api/settings/organization', { method: 'PATCH', json: { max_email_per_contact_per_day: vals.email, max_whatsapp_per_contact_per_day: vals.wa, max_sms_per_contact_per_day: vals.sms, max_sends_per_contact_per_day: vals.total ?? 0, settings: { ...(org.settings || {}), sending: { ...(org.settings?.sending || {}), campaign_priority: v.priority } } } })
    onSaved()
  }, 'Limite de frequência salvo')
  const numInput = (k: 'email' | 'wa' | 'sms' | 'total', label: string, ph = 'Sem limite') => <input className="in" inputMode="numeric" placeholder={ph} value={v[k]} onChange={(e) => f.set(k, e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label={label} />
  return (
    <Card title="Limite de frequência" desc="Máximo de mensagens por contato em 24 h. Deixe vazio para sem limite." foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row label="Por canal">
        <div className="in3">
          <div><span className="inl">E-mail</span>{numInput('email', 'E-mail')}</div>
          <div><span className="inl">WhatsApp</span>{numInput('wa', 'WhatsApp')}</div>
          <div><span className="inl">SMS</span>{numInput('sms', 'SMS')}</div>
        </div>
      </Row>
      <Row label="Total (todos os canais)"><div style={{ maxWidth: 200 }}>{numInput('total', 'Total')}</div></Row>
      <Row tg label="Campanhas têm prioridade sobre automações" help="Quando o limite é atingido, a automação espera o próximo dia."><Tog on={v.priority} set={(x) => f.set('priority', x)} label="Campanhas têm prioridade sobre automações" /></Row>
    </Card>
  )
}

function FlowsCard({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const f = useForm({ skip: !!org.skip_contacts_in_active_flows })
  useEffect(() => { f.reset({ skip: !!org.skip_contacts_in_active_flows }) }, [org.skip_contacts_in_active_flows]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const onSave = () => save(async () => { await api('/api/settings/organization', { method: 'PATCH', json: { skip_contacts_in_active_flows: f.val!.skip } }); onSaved() }, 'Regra de fluxos salva')
  return (
    <Card title="Fluxos simultâneos" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row tg label="Pular contatos em fluxo ativo" help="Se o contato já está em uma automação, novos gatilhos são descartados."><Tog on={f.val!.skip} set={(x) => f.set('skip', x)} label="Pular contatos em fluxo ativo" /></Row>
    </Card>
  )
}
