'use client'

// Configurações → Privacidade e LGPD (desenho PLgpd): consentimento, retenção,
// pedidos de titulares e registro de consentimentos.

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { Card, Row, SaveBar, Title, LoadingCard, Tog, Badge, Modal, Field, RadioCard, useForm } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, fmtDate } from '@/components/settings/format'
import { useApi, useSave, useAction } from '@/components/settings/hooks'

interface Req { id: string; requester_email: string; request_type: string; status: string; created_at: string; verified_at: string | null; processed_at: string | null }
interface Consent { id: string; consent_type: string; granted: boolean; source: string | null; granted_at: string | null; revoked_at: string | null }
interface Resp { consent: { double_opt_in: boolean; dpo_email: string }; retention: { contacts_months: number | null; events_months: number | null }; requests: Req[]; consents: Consent[]; consents_total: number }

const TYPE: Record<string, string> = { export: 'Exportação', portability: 'Portabilidade', delete: 'Exclusão', rectification: 'Correção', object: 'Oposição', restrict: 'Restrição' }
const CONSENT: Record<string, string> = { marketing: 'E-mail marketing', tracking: 'Rastreamento', analytics: 'Análises', cookies: 'Cookies', profiling: 'Personalização', data_sharing: 'Compartilhamento', sms: 'SMS', whatsapp: 'WhatsApp' }
const deadline = (r: Req) => { const d = new Date(r.created_at); d.setDate(d.getDate() + 15); return d }

function reqBadge(r: Req) {
  if (r.status === 'completed') return <Badge k="ok">Concluído</Badge>
  if (r.status === 'rejected') return <Badge k="off">Rejeitado</Badge>
  if (!r.verified_at) return <Badge k="off">Aguardando confirmação</Badge>
  return <Badge k="warn">Em andamento</Badge>
}

export default function LgpdSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/privacy')
  const [newReq, setNewReq] = useState(false)
  const [tab, setTab] = useState<'requests' | 'consents'>('requests')
  const toast = useToast()
  const { busy, run } = useAction()
  const process = (r: Req) => run(`p-${r.id}`, async () => { await api(`/api/lgpd/data-requests/${r.id}/process`, { method: 'POST' }); await reload(true) }, { success: 'Pedido processado' })

  if (loading && !data) return <><Title h="Privacidade e LGPD" p="Consentimento, retenção e pedidos de titulares." /><LoadingCard rows={3} /><LoadingCard rows={2} /></>
  if (error || !data) return <><Title h="Privacidade e LGPD" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  return (
    <>
      <Title h="Privacidade e LGPD" p="Consentimento, retenção e pedidos de titulares." />
      <ConsentCard c={data.consent} onSaved={() => reload(true)} />
      <RetentionCard r={data.retention} onSaved={() => reload(true)} />
      <Card title="Pedidos de titulares" desc="Exportação ou exclusão de dados solicitadas por clientes. Prazo legal: 15 dias." right={<div style={{ display: 'flex', gap: 8 }}><div className="seg"><button type="button" className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Pedidos</button><button type="button" className={tab === 'consents' ? 'on' : ''} onClick={() => setTab('consents')}>Consentimentos</button></div><button type="button" className="btn btn-sm" onClick={() => setNewReq(true)}><I n="plus" s={14} />Novo pedido</button></div>} flush>
        {tab === 'requests' ? (
          data.requests.length === 0 ? <div className="empty2"><b>Nenhum pedido</b>Pedidos feitos pelos clientes (ou registrados aqui) aparecem nesta lista.</div> : (
            <div className="tw"><table className="stbl">
              <thead><tr><th>Contato</th><th>Tipo</th><th>Status</th><th className="r">Prazo</th><th></th></tr></thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td className="fx"><span className="nm">{r.requester_email}</span><span className="mt">Solicitado em {fmtDate(r.created_at)}</span></td>
                    <td>{TYPE[r.request_type] || r.request_type}</td>
                    <td>{reqBadge(r)}</td>
                    <td className="r" style={{ color: r.status === 'completed' || r.status === 'rejected' ? 'var(--text-3)' : deadline(r).getTime() < Date.now() ? 'var(--neg)' : undefined }}>{r.status === 'completed' || r.status === 'rejected' ? '—' : fmtDate(deadline(r))}</td>
                    <td className="r"><div className="acts">{r.verified_at && r.status !== 'completed' && r.status !== 'rejected' && <button type="button" className="btn btn-sm" disabled={busy === `p-${r.id}`} onClick={() => process(r)}>{busy === `p-${r.id}` && <I n="refresh" s={13} className="spin" />}Processar</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )
        ) : (
          data.consents.length === 0 ? <div className="empty2"><b>Nenhum consentimento registrado</b>Cada aceite em formulários e checkout fica guardado aqui com origem e data.</div> : (
            <>
              <div className="tw"><table className="stbl">
                <thead><tr><th>Tipo</th><th>Situação</th><th className="hm">Origem</th><th className="r">Data</th></tr></thead>
                <tbody>
                  {data.consents.map((c) => (
                    <tr key={c.id}><td>{CONSENT[c.consent_type] || c.consent_type}</td><td>{c.revoked_at ? <Badge k="off">Revogado</Badge> : c.granted ? <Badge k="ok">Concedido</Badge> : <Badge k="err">Negado</Badge>}</td><td className="hm" style={{ color: 'var(--text-3)' }}>{c.source || '—'}</td><td className="r" style={{ color: 'var(--text-3)' }}>{fmtDate(c.revoked_at || c.granted_at, true)}</td></tr>
                  ))}
                </tbody>
              </table></div>
              <div className="sc-f"><span className="hint">Mostrando os {data.consents.length} mais recentes de {data.consents_total.toLocaleString('pt-BR')}.</span></div>
            </>
          )
        )}
      </Card>
      {newReq && <NewRequestModal onClose={() => setNewReq(false)} onDone={(email) => { setNewReq(false); toast.success('Pedido registrado', `${email} recebeu um e-mail para confirmar.`); reload(true) }} />}
    </>
  )
}

function ConsentCard({ c, onSaved }: { c: Resp['consent']; onSaved: () => void }) {
  const f = useForm({ ...c })
  useEffect(() => { f.reset({ ...c }) }, [JSON.stringify(c)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  return (
    <Card title="Consentimento" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={() => save(async () => { await api('/api/settings/privacy', { method: 'PATCH', json: { consent: v } }); onSaved() }, 'Consentimento salvo')} onCancel={f.cancel} />}>
      <Row tg label="Confirmação dupla (double opt-in)" help="Novos inscritos confirmam por e-mail antes de entrar na lista. Formulários com configuração própria mantêm a deles."><Tog on={v.double_opt_in} set={(x) => f.set('double_opt_in', x)} label="Confirmação dupla" /></Row>
      <Row tg label="Registrar origem e data do consentimento" help="Guardado em cada contato para auditoria."><Tog on disabled label="Registrar origem e data do consentimento" /></Row>
      <Row label="Encarregado de dados (DPO)" help="Aparece na política de privacidade e responde pedidos." htmlFor="dpo"><input id="dpo" className="in" type="email" placeholder="privacidade@suamarca.com.br" value={v.dpo_email} onChange={(e) => f.set('dpo_email', e.target.value)} /></Row>
    </Card>
  )
}

function RetentionCard({ r, onSaved }: { r: Resp['retention']; onSaved: () => void }) {
  const f = useForm<{ contacts: number | null; events: number | null }>({ contacts: r.contacts_months, events: r.events_months ?? 24 })
  useEffect(() => { f.reset({ contacts: r.contacts_months, events: r.events_months ?? 24 }) }, [JSON.stringify(r)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  return (
    <Card title="Retenção" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={() => save(async () => { await api('/api/settings/privacy', { method: 'PATCH', json: { retention: { contacts_months: v.contacts, events_months: v.events } } }); onSaved() }, 'Retenção salva')} onCancel={f.cancel} />}>
      <Row label="Contatos inativos" help="Excluir automaticamente contatos sem interação após:">
        <select className="in" style={{ maxWidth: 240 }} value={v.contacts ?? 'never'} onChange={(e) => f.set('contacts', e.target.value === 'never' ? null : Number(e.target.value))} aria-label="Contatos inativos">
          <option value="never">Nunca excluir</option><option value={12}>12 meses</option><option value={24}>24 meses</option><option value={36}>36 meses</option>
        </select>
      </Row>
      <Row label="Eventos e logs" help="Eventos de comportamento e registros de envio mais antigos são apagados todo dia às 3h.">
        <select className="in" style={{ maxWidth: 240 }} value={v.events ?? 'never'} onChange={(e) => f.set('events', e.target.value === 'never' ? null : Number(e.target.value))} aria-label="Eventos e logs">
          <option value={12}>12 meses</option><option value={24}>24 meses</option><option value={36}>36 meses</option><option value="never">Manter para sempre</option>
        </select>
      </Row>
    </Card>
  )
}

function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [type, setType] = useState('export')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: org } = useApi<{ organization: { id: string } | null }>('/api/settings/organization')
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !!org?.organization?.id
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/lgpd/data-requests', { method: 'POST', json: { organization_id: org!.organization!.id, requester_email: email.trim().toLowerCase(), request_type: type } }); onDone(email.trim().toLowerCase()) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Novo pedido de titular" desc="Registre um pedido recebido por outro canal. O titular recebe um e-mail para confirmar antes do processamento." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Registrar pedido</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="E-mail do titular" error={err}><input className={'in' + (err ? ' err' : '')} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com" /></Field>
        <div style={{ display: 'grid', gap: 8 }} role="radiogroup">
          {[['export', 'Exportação', 'Cópia de todos os dados do titular.'], ['delete', 'Exclusão', 'Anonimiza o contato e o histórico.'], ['rectification', 'Correção', 'Corrigir dados incorretos.'], ['restrict', 'Restrição', 'Pausar o tratamento sem excluir.']].map(([k, t, d]) => <RadioCard key={k} on={type === k} onClick={() => setType(k)} title={t} desc={d} />)}
        </div>
      </div>
    </Modal>
  )
}
