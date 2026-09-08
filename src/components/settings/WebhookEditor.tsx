'use client'

// Formulário de webhook no design das Configurações (novo e editar).
// Mesmo contrato do WebhookForm antigo: /api/webhooks-admin/subscriptions (+ consentimento LGPD 412).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Row, Modal, CopyBtn, Badge } from './ui'
import { I } from './icons'
import { api, ApiError } from './format'
import { useApi } from './hooks'

export interface WebhookSub { id: string; store_id: string; name: string; url: string; events: string[]; status: 'active' | 'paused' | 'disabled'; description?: string | null }

export const WEBHOOK_EVENT_GROUPS: Array<{ label: string; events: Array<[string, string]> }> = [
  { label: 'Pedidos', events: [['order.created', 'Pedido criado'], ['order.paid', 'Pedido pago'], ['order.fulfilled', 'Pedido enviado'], ['order.cancelled', 'Pedido cancelado']] },
  { label: 'Checkout e pagamento', events: [['checkout.abandoned', 'Checkout abandonado'], ['payment.pix.abandoned', 'Pix não pago'], ['payment.boleto.abandoned', 'Boleto não pago']] },
  { label: 'Cliente e comportamento', events: [['customer.created', 'Cliente criado'], ['browse.abandoned', 'Navegação abandonada']] },
  { label: 'Logística', events: [['shipment.tracking_created', 'Rastreio criado']] },
]

export default function WebhookEditor({ initial }: { initial?: WebhookSub }) {
  const router = useRouter()
  const isEdit = !!initial
  const stores = useApi<{ stores: Array<{ id: string; shop_domain: string; shop_name: string | null }> }>('/api/webhooks-admin/stores')
  const [name, setName] = useState(initial?.name ?? '')
  const [storeId, setStoreId] = useState(initial?.store_id ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [events, setEvents] = useState<string[]>(initial?.events ?? [])
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<WebhookSub['status']>(initial?.status ?? 'active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)

  const list = stores.data?.stores || []
  if (!storeId && list.length === 1 && !isEdit) setStoreId(list[0].id)
  const urlOk = /^https:\/\//.test(url) || url.startsWith('http://localhost')
  const ok = name.trim().length >= 2 && !!storeId && urlOk && events.length > 0
  const toggle = (e: string) => setEvents((o) => (o.includes(e) ? o.filter((x) => x !== e) : [...o, e]))
  const toggleGroup = (evs: string[]) => setEvents((o) => (evs.every((e) => o.includes(e)) ? o.filter((e) => !evs.includes(e)) : Array.from(new Set([...o, ...evs]))))

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const body = { store_id: storeId, name: name.trim(), url: url.trim(), events, description: description.trim() || null, ...(isEdit ? { status } : {}) }
      const r = isEdit
        ? await api(`/api/webhooks-admin/subscriptions/${initial!.id}`, { method: 'PATCH', json: body })
        : await api<{ secret?: string }>('/api/webhooks-admin/subscriptions', { method: 'POST', json: body })
      if (!isEdit && (r as any)?.secret) setSecret((r as any).secret)
      else router.push('/settings/webhooks')
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 412) { setConsent(true); return }
      setError(e.message)
    } finally { setBusy(false) }
  }
  const acceptConsent = async () => { setConsent(false); await api('/api/webhooks-admin/consent', { method: 'POST' }); submit() }

  return (
    <>
      <Card title="Endpoint" desc="Para onde os eventos são enviados via POST com JSON.">
        <Row label="Nome" htmlFor="wh-name"><input id="wh-name" className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="ERP · produção" autoFocus /></Row>
        <Row label="Loja" help="Os eventos desta loja alimentam o webhook." htmlFor="wh-store">
          <select id="wh-store" className="in" value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={isEdit}>
            <option value="">Selecione…</option>
            {list.map((s) => <option key={s.id} value={s.id}>{s.shop_name || s.shop_domain}</option>)}
          </select>
        </Row>
        <Row label="URL" help="Precisa ser https://." htmlFor="wh-url"><input id="wh-url" className={'in mono' + (url && !urlOk ? ' err' : '')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://erp.suamarca.com.br/hooks/worder" inputMode="url" /></Row>
        <Row label="Descrição (opcional)" htmlFor="wh-desc"><input id="wh-desc" className="in" value={description} onChange={(e) => setDescription(e.target.value)} /></Row>
        {isEdit && <Row label="Status" htmlFor="wh-status"><select id="wh-status" className="in" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value as any)}><option value="active">Ativo</option><option value="paused">Pausado</option><option value="disabled">Desativado</option></select></Row>}
      </Card>
      <Card title="Eventos" desc="Escolha o que este endpoint recebe.">
        {WEBHOOK_EVENT_GROUPS.map((g) => {
          const keys = g.events.map(([k]) => k)
          const all = keys.every((k) => events.includes(k))
          return (
            <Row key={g.label} label={<label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={all} onChange={() => toggleGroup(keys)} aria-label={`Todos de ${g.label}`} />{g.label}</label>}>
              <div className="pillrow" style={{ gap: 8 }}>
                {g.events.map(([k, l]) => (
                  <label key={k} className="pill2" style={{ cursor: 'pointer', height: 30, gap: 6, background: events.includes(k) ? 'var(--acc-bg)' : undefined, color: events.includes(k) ? 'var(--acc-fg)' : undefined }}>
                    <input type="checkbox" checked={events.includes(k)} onChange={() => toggle(k)} style={{ margin: 0 }} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{k}</span><span className="muted">{l}</span>
                  </label>
                ))}
              </div>
            </Row>
          )
        })}
        <div className="sc-f" style={{ margin: '0 -24px -18px', marginTop: 8 }}>
          <span className={'hint' + (error ? ' err' : '')}>{error || (events.length ? `${events.length} evento${events.length === 1 ? '' : 's'} selecionado${events.length === 1 ? '' : 's'}` : 'Selecione ao menos um evento')}</span>
          <button type="button" className="btn" onClick={() => router.push('/settings/webhooks')}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}{isEdit ? 'Salvar' : 'Criar endpoint'}</button>
        </div>
      </Card>

      {consent && (
        <Modal title="Consentimento LGPD" desc="Webhooks enviam dados pessoais dos seus clientes (nome, e-mail, telefone, endereço) para o sistema de destino. Você confirma que esse destino tem base legal e proteção adequada para tratá-los." onClose={() => setConsent(false)}
          footer={<><button type="button" className="btn" onClick={() => setConsent(false)}>Cancelar</button><button type="button" className="btn btn-primary" onClick={acceptConsent}>Aceito e continuar</button></>}>
          <div className="tip"><I n="shield" s={16} /><div>Registramos este aceite na auditoria da organização, com data e usuário.</div></div>
        </Modal>
      )}
      {secret && (
        <Modal title="Webhook criado" desc="Copie o segredo agora — ele não será mostrado de novo. Use para validar o header X-Worder-Signature." onClose={() => router.push('/settings/webhooks')}
          footer={<button type="button" className="btn btn-primary" onClick={() => router.push('/settings/webhooks')}>Concluir</button>}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="in mono" readOnly value={secret} onFocus={(e) => e.currentTarget.select()} /><CopyBtn text={secret} /></div>
          <div style={{ marginTop: 10 }}><Badge k="ok">Ativo</Badge></div>
        </Modal>
      )}
    </>
  )
}
