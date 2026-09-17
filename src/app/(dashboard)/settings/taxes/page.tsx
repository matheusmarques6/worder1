'use client'

// Configurações → Custos e taxas: custo dos produtos, taxas de pagamento,
// impostos e taxas personalizadas usadas no cálculo de lucro dos relatórios.

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, SaveBar, Title, LoadingCard, Modal, Field, IconBtn, Badge, Tog, useForm } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, nf } from '@/components/settings/format'
import { useApi, useSave, useAction } from '@/components/settings/hooks'

interface Tax { default_cost_percentage: number; default_cost_currency: string; payment_gateway_fee: number; payment_fixed_fee: number; sales_tax_percentage: number; marketplace_fee: number; default_shipping_cost: number; monthly_fixed_costs: number }
interface Fee { id?: string; name: string; description: string; fee_type: 'percentage' | 'fixed'; fee_value: number; applies_to: string; per_order: boolean; is_active: boolean }
interface Resp { settings: Tax | null; customFees: Fee[]; currencies?: string[] }

const DEF: Tax = { default_cost_percentage: 40, default_cost_currency: 'BRL', payment_gateway_fee: 3.99, payment_fixed_fee: 0.39, sales_tax_percentage: 0, marketplace_fee: 0, default_shipping_cost: 0, monthly_fixed_costs: 0 }
const CUR = ['BRL', 'USD', 'EUR', 'GBP', 'CNY']

export default function TaxesSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/taxes')
  return (
    <>
      <Title h="Custos e taxas" p="Usados para calcular lucro e margem nos relatórios. Nada aqui altera preços na loja." />
      {loading && !data ? <><LoadingCard rows={4} /><LoadingCard rows={2} /></> : error || !data ? (
        <Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : (
        <>
          <CostsCard s={{ ...DEF, ...(data.settings || {}) }} onSaved={() => reload(true)} />
          <FeesCard fees={data.customFees || []} onChanged={() => reload(true)} />
        </>
      )}
    </>
  )
}

function Num({ id, value, onChange, suffix, step = '0.01' }: { id: string; value: number; onChange: (n: number) => void; suffix?: string; step?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input id={id} className="in" type="number" step={step} min={0} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} style={{ maxWidth: 200 }} />
      {suffix && <span className="muted" style={{ fontSize: 13 }}>{suffix}</span>}
    </div>
  )
}

function CostsCard({ s, onSaved }: { s: Tax; onSaved: () => void }) {
  const f = useForm<Tax>({ ...s })
  useEffect(() => { f.reset({ ...s }) }, [JSON.stringify(s)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const v = f.val!
  const cur = v.default_cost_currency || 'BRL'
  return (
    <Card title="Custos padrão" desc="Aplicados quando o produto não tem custo cadastrado." foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={() => save(async () => { await api('/api/settings/taxes', { method: 'POST', json: v }); onSaved() }, 'Custos salvos')} onCancel={f.cancel} />}>
      <Row label="Custo do produto" help="Porcentagem do preço de venda considerada como custo (CMV)." htmlFor="tx-cost"><Num id="tx-cost" value={v.default_cost_percentage} onChange={(n) => f.set('default_cost_percentage', n)} suffix="% do preço" /></Row>
      <Row label="Moeda dos custos" htmlFor="tx-cur"><select id="tx-cur" className="in" style={{ maxWidth: 200 }} value={cur} onChange={(e) => f.set('default_cost_currency', e.target.value)}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></Row>
      <Row label="Taxa do gateway" help="Cobrada pelo meio de pagamento em cada venda.">
        <div className="in2">
          <div><span className="inl">Percentual</span><Num id="tx-gw" value={v.payment_gateway_fee} onChange={(n) => f.set('payment_gateway_fee', n)} suffix="%" /></div>
          <div><span className="inl">Fixa por transação</span><Num id="tx-fix" value={v.payment_fixed_fee} onChange={(n) => f.set('payment_fixed_fee', n)} suffix={cur} /></div>
        </div>
      </Row>
      <Row label="Impostos sobre vendas" htmlFor="tx-tax"><Num id="tx-tax" value={v.sales_tax_percentage} onChange={(n) => f.set('sales_tax_percentage', n)} suffix="%" /></Row>
      <Row label="Taxa de marketplace" help="Se vende também em marketplaces." htmlFor="tx-mk"><Num id="tx-mk" value={v.marketplace_fee} onChange={(n) => f.set('marketplace_fee', n)} suffix="%" /></Row>
      <Row label="Frete padrão por pedido" htmlFor="tx-ship"><Num id="tx-ship" value={v.default_shipping_cost} onChange={(n) => f.set('default_shipping_cost', n)} suffix={cur} /></Row>
      <Row label="Custos fixos mensais" help="Aluguel, equipe, ferramentas — distribuídos nos relatórios de lucro." htmlFor="tx-fixed"><Num id="tx-fixed" value={v.monthly_fixed_costs} onChange={(n) => f.set('monthly_fixed_costs', n)} suffix={`${cur}/mês`} step="1" /></Row>
    </Card>
  )
}

function FeesCard({ fees, onChanged }: { fees: Fee[]; onChanged: () => void }) {
  const confirm = useConfirm()
  const toast = useToast()
  const { busy, run } = useAction()
  const [modal, setModal] = useState<{ fee?: Fee } | null>(null)
  const remove = async (fee: Fee) => {
    if (!(await confirm.confirm({ title: `Excluir “${fee.name}”?`, confirmLabel: 'Excluir', destructive: true }))) return
    await run(`d-${fee.id}`, async () => { await api('/api/settings/taxes', { method: 'PUT', json: { action: 'delete', fee } }); onChanged() }, { success: 'Taxa excluída' })
  }
  const toggle = (fee: Fee) => run(`t-${fee.id}`, async () => { await api('/api/settings/taxes', { method: 'PUT', json: { action: 'update', fee: { ...fee, is_active: !fee.is_active } } }); onChanged() })
  return (
    <>
      <Card title="Taxas personalizadas" desc="Outras deduções por pedido ou sobre a receita (embalagem, comissão, antifraude…)." right={<button type="button" className="btn btn-sm" onClick={() => setModal({})}><I n="plus" s={14} />Nova taxa</button>} flush>
        {fees.length === 0 ? <div className="empty2"><b>Nenhuma taxa personalizada</b>Adicione custos específicos do seu negócio para o lucro ficar mais preciso.</div> : (
          <div className="tw"><table className="stbl">
            <thead><tr><th>Taxa</th><th>Valor</th><th>Aplicação</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.id}>
                  <td className="fx"><span className="nm">{fee.name}</span>{fee.description && <span className="mt">{fee.description}</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fee.fee_type === 'percentage' ? `${nf(fee.fee_value, 2)}%` : nf(fee.fee_value, 2)}</td>
                  <td style={{ color: 'var(--text-2)' }}>{fee.fee_type === 'percentage' ? (fee.applies_to === 'profit' ? 'sobre o lucro' : 'sobre a receita') : fee.per_order ? 'por pedido' : 'por mês'}</td>
                  <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{fee.is_active ? <Badge k="ok">Ativa</Badge> : <Badge k="off">Inativa</Badge>}<Tog on={fee.is_active} disabled={busy === `t-${fee.id}`} set={() => toggle(fee)} label={`Ativar ${fee.name}`} /></div></td>
                  <td className="r"><div className="acts"><IconBtn n="edit" s={15} title="Editar" onClick={() => setModal({ fee })} /><IconBtn n="x" title="Excluir" danger onClick={() => remove(fee)} disabled={busy === `d-${fee.id}`} /></div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {modal && <FeeModal fee={modal.fee} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success(modal.fee ? 'Taxa atualizada' : 'Taxa criada'); onChanged() }} />}
    </>
  )
}

function FeeModal({ fee, onClose, onDone }: { fee?: Fee; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Fee>(fee ? { ...fee } : { name: '', description: '', fee_type: 'percentage', fee_value: 0, applies_to: 'revenue', per_order: true, is_active: true })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Fee>(k: K, v: Fee[K]) => setF((o) => ({ ...o, [k]: v }))
  const ok = f.name.trim().length >= 2 && Number.isFinite(f.fee_value) && f.fee_value >= 0
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api('/api/settings/taxes', { method: 'PUT', json: { action: fee ? 'update' : 'create', fee: { ...f, name: f.name.trim() } } }); onDone() }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={fee ? 'Editar taxa' : 'Nova taxa personalizada'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy && <I n="refresh" s={14} className="spin" />}{fee ? 'Salvar' : 'Criar'}</button></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Nome" error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Embalagem" /></Field>
        <Field label="Descrição (opcional)"><input className="in" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="in2">
          <Field label="Tipo"><select className="in" value={f.fee_type} onChange={(e) => set('fee_type', e.target.value as Fee['fee_type'])}><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></select></Field>
          <Field label={f.fee_type === 'percentage' ? 'Percentual (%)' : 'Valor'}><input className="in" type="number" step="0.01" min={0} value={f.fee_value} onChange={(e) => set('fee_value', Number(e.target.value))} /></Field>
        </div>
        {f.fee_type === 'percentage' ? (
          <Field label="Aplicar sobre"><select className="in" value={f.applies_to} onChange={(e) => set('applies_to', e.target.value)}><option value="revenue">Receita</option><option value="profit">Lucro</option></select></Field>
        ) : (
          <Field label="Cobrança"><select className="in" value={f.per_order ? 'order' : 'month'} onChange={(e) => set('per_order', e.target.value === 'order')}><option value="order">Por pedido</option><option value="month">Por mês</option></select></Field>
        )}
        <Row tg label="Ativa"><Tog on={f.is_active} set={(v) => set('is_active', v)} label="Ativa" /></Row>
      </div>
    </Modal>
  )
}
