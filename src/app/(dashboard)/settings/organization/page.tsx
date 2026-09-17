'use client'

// Configurações → Organização (desenho POrg): empresa, lojas conectadas e zona de risco.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { useStoreStore } from '@/stores'
import { Card, Row, SaveBar, Title, LoadingCard, Badge, Avatar, Modal, useForm, Field, IconBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, timeAgo } from '@/components/settings/format'
import { useApi, useSave, useAction } from '@/components/settings/hooks'

interface Org { id: string; name: string; company_name: string; cnpj: string; address: string; city: string; state: string; zip: string; website: string; default_currency: string; delete_requested_at: string | null }
interface Store { id: string; name: string; domain: string; platform: string; status: string; last_sync_at: string | null; currency: string | null }

const CURRENCIES: Array<[string, string]> = [['BRL', 'BRL — Real'], ['USD', 'USD — Dólar americano'], ['EUR', 'EUR — Euro'], ['GBP', 'GBP — Libra'], ['ARS', 'ARS — Peso argentino'], ['MXN', 'MXN — Peso mexicano'], ['CLP', 'CLP — Peso chileno'], ['COP', 'COP — Peso colombiano']]

const maskCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
const maskCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')

export default function OrganizationSettingsPage() {
  const { data, loading, error, reload } = useApi<{ organization: Org | null; stores: Store[] }>('/api/settings/account')
  return (
    <>
      <Title h="Organização" p="Dados da empresa usados em faturas, rodapé de e-mails e conformidade." />
      {loading && !data ? <><LoadingCard rows={5} /><LoadingCard rows={2} /></> : error ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : data?.organization ? (
        <>
          <CompanyCard org={data.organization} onChanged={() => reload(true)} />
          <StoresCard stores={data.stores || []} onChanged={() => reload(true)} />
          <DangerCard org={data.organization} onChanged={() => reload(true)} />
        </>
      ) : null}
    </>
  )
}

function CompanyCard({ org, onChanged }: { org: Org; onChanged: () => void }) {
  const pick = (o: Org) => ({ company_name: o.company_name, cnpj: o.cnpj, address: o.address, city: o.city, state: o.state, zip: o.zip, website: o.website, default_currency: o.default_currency })
  const f = useForm(pick(org))
  useEffect(() => { f.reset(pick(org)) }, [JSON.stringify(pick(org))]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const onSave = () => save(async () => { await api('/api/settings/account', { method: 'PATCH', json: { type: 'organization', ...f.val } }); onChanged() })
  const v = f.val!
  return (
    <Card title="Empresa" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row label="Nome da empresa" htmlFor="org-name"><input id="org-name" className="in" value={v.company_name} onChange={(e) => f.set('company_name', e.target.value)} /></Row>
      <Row label="CNPJ" htmlFor="org-cnpj"><input id="org-cnpj" className="in" placeholder="00.000.000/0001-00" value={v.cnpj} onChange={(e) => f.set('cnpj', maskCnpj(e.target.value))} inputMode="numeric" /></Row>
      <Row label="Endereço" help="Obrigatório no rodapé dos e-mails (CAN-SPAM / LGPD).">
        <input className="in" placeholder="Rua, número, complemento" value={v.address} onChange={(e) => f.set('address', e.target.value)} autoComplete="street-address" />
        <div className="in3">
          <input className="in" placeholder="Cidade" value={v.city} onChange={(e) => f.set('city', e.target.value)} />
          <input className="in" placeholder="Estado" value={v.state} onChange={(e) => f.set('state', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
          <input className="in" placeholder="CEP" value={v.zip} onChange={(e) => f.set('zip', maskCep(e.target.value))} inputMode="numeric" />
        </div>
      </Row>
      <Row label="Site" htmlFor="org-site"><input id="org-site" className="in" placeholder="https://sualoja.com.br" value={v.website} onChange={(e) => f.set('website', e.target.value)} inputMode="url" /></Row>
      <Row label="Moeda padrão" help="Relatórios e metas são exibidos nesta moeda." htmlFor="org-cur">
        <select id="org-cur" className="in" value={v.default_currency} onChange={(e) => f.set('default_currency', e.target.value)}>
          {!CURRENCIES.some(([c]) => c === v.default_currency) && <option value={v.default_currency}>{v.default_currency}</option>}
          {CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>
      </Row>
    </Card>
  )
}

function StoresCard({ stores, onChanged }: { stores: Store[]; onChanged: () => void }) {
  const confirm = useConfirm()
  const { busy, run } = useAction()
  const { fetchStores } = useStoreStore() as any
  const addStore = () => window.dispatchEvent(new Event('openAddStoreModal'))
  const disconnect = async (s: Store) => {
    const ok = await confirm.confirm({ title: `Desconectar ${s.name}?`, description: 'A loja para de sincronizar pedidos e clientes. Os dados já importados continuam no Worder e a integração pode ser reativada depois.', confirmLabel: 'Desconectar', destructive: true })
    if (!ok) return
    await run(`dc-${s.id}`, async () => {
      await api('/api/integrations/shopify/disconnect', { method: 'POST', json: { storeId: s.id } })
      onChanged()
      try { await fetchStores?.() } catch { /* store list refresh best-effort */ }
    }, { success: `${s.name} desconectada` })
  }
  const badge = (s: Store) => {
    const st = (s.status || '').toLowerCase()
    if (st === 'active' || st === 'connected') return <Badge k="ok">{s.last_sync_at ? `Sincronizada ${timeAgo(s.last_sync_at).toLowerCase()}` : 'Conectada'}</Badge>
    if (st === 'error' || st === 'failed') return <Badge k="err">Erro de conexão</Badge>
    if (st === 'disconnected') return <Badge k="off">Desconectada</Badge>
    return <Badge k="warn">{s.status || 'Pendente'}</Badge>
  }
  return (
    <Card title="Lojas conectadas" desc="Cada loja tem catálogo, contatos e remetente próprios." right={<button type="button" className="btn btn-sm" onClick={addStore}><I n="plus" s={14} />Conectar loja</button>} flush>
      {stores.length === 0 ? (
        <div className="empty2"><b>Nenhuma loja conectada</b>Conecte sua loja Shopify para importar pedidos, clientes e catálogo.<div><button type="button" className="btn btn-primary" onClick={addStore}><I n="plus" s={15} />Conectar loja</button></div></div>
      ) : (
        <div className="tw"><table className="stbl"><tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <td className="fx"><div className="person"><Avatar name={s.name} sm square /><div><span className="nm">{s.name}</span><span className="mt">{s.platform} · {s.domain}</span></div></div></td>
              <td>{badge(s)}</td>
              <td className="r"><div className="acts">
                <Link href={`/integrations/shopify?store=${s.id}`} className="ib" title="Configurar"><I n="gear" s={16} /></Link>
                <IconBtn n="x" title="Desconectar" danger onClick={() => disconnect(s)} disabled={busy === `dc-${s.id}`} />
              </div></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </Card>
  )
}

function DangerCard({ org, onChanged }: { org: Org; onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { busy, run } = useAction()
  const cancel = () => run('cancel', async () => { await api('/api/settings/account', { method: 'PATCH', json: { type: 'cancel-delete-organization' } }); onChanged() }, { success: 'Pedido de exclusão cancelado' })
  return (
    <>
      <Card title="Zona de risco" flush>
        <div className="row" style={{ padding: '18px 24px' }}>
          <div className="lb" style={{ paddingTop: 0 }}>Excluir organização<div className="hp">Remove lojas, contatos, campanhas e histórico. Irreversível.</div>
            {org.delete_requested_at && <div style={{ marginTop: 8 }}><Badge k="warn">Exclusão solicitada em {new Date(org.delete_requested_at).toLocaleDateString('pt-BR')}</Badge></div>}
          </div>
          <div className="ct" style={{ alignItems: 'flex-end' }}>
            {org.delete_requested_at
              ? <button type="button" className="btn" onClick={cancel} disabled={busy === 'cancel'}>Cancelar pedido de exclusão</button>
              : <button type="button" className="btn btn-danger" style={{ borderColor: 'var(--line-2)' }} onClick={() => setOpen(true)}>Excluir organização</button>}
          </div>
        </div>
      </Card>
      {open && <DeleteModal name={org.company_name || org.name} onClose={() => setOpen(false)} onDone={() => { setOpen(false); toast.warning('Exclusão solicitada', 'Nossa equipe confirma com você por e-mail antes de apagar os dados.'); onChanged() }} />}
    </>
  )
}

function DeleteModal({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ok = confirmText.trim() === name.trim()
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/settings/account', { method: 'PATCH', json: { type: 'delete-organization', confirm: confirmText, reason } }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Excluir organização" desc="Isso apaga lojas, contatos, campanhas, automações e todo o histórico. Depois da confirmação por e-mail, não há como recuperar." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" style={{ background: 'var(--neg)' }} disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}Solicitar exclusão</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label={<>Digite <b>{name}</b> para confirmar</>} error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
        <Field label="Por que está saindo? (opcional)"><textarea className="in" style={{ height: 80, padding: 10, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ajuda a melhorar o Worder." /></Field>
      </div>
    </Modal>
  )
}
