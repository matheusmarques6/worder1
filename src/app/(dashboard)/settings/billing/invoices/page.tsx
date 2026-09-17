'use client'

// Configurações → Faturas e pagamento (desenho PFaturas).

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { Card, Row, Title, LoadingCard, Badge, SaveBar, Kv, useForm } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, fmtDate, money } from '@/components/settings/format'
import { useApi, useSave } from '@/components/settings/hooks'

interface Inv { stripe_invoice_id: string; invoice_number: string | null; amount_cents: number; currency: string; status: string; hosted_invoice_url: string | null; pdf_url: string | null; created_at: string; paid_at: string | null; due_at: string | null }
interface Resp {
  plan: string; planLabel: string; stripeConfigured: boolean; hasStripeCustomer: boolean
  paymentMethod: { brand: string; last4: string; exp_month: number; exp_year: number } | null
  upcoming: { amount_cents: number; currency: string; date: string } | null
  currentPeriodEnd: string
  billing: { company_name: string; cnpj: string; billing_email: string }
  invoices: Inv[]
}

const BRAND: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', elo: 'Elo', hipercard: 'Hipercard', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' }
const maskCnpj = (v: string) => v.replace(/\D/g, '').slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')

function invBadge(s: string) {
  if (s === 'paid') return <Badge k="ok">Paga</Badge>
  if (s === 'open') return <Badge k="warn">Em aberto</Badge>
  if (s === 'uncollectible' || s === 'payment_failed') return <Badge k="err">Falhou</Badge>
  if (s === 'void') return <Badge k="off">Cancelada</Badge>
  return <Badge k="off">{s}</Badge>
}

export default function InvoicesSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/billing')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const openPortal = async () => {
    setBusy(true)
    try {
      if (!data?.hasStripeCustomer) {
        // Sem cliente ainda: o checkout do plano cria o cartão.
        toast.info('Escolha um plano', 'O cartão é cadastrado ao assinar um plano pago.')
        window.location.href = '/settings/billing#planos'
        return
      }
      const r = await api<{ url: string }>('/api/billing/portal', { method: 'POST' })
      window.location.href = r.url
    } catch (e: any) { toast.error('Não foi possível abrir o portal de pagamento', e.message); setBusy(false) }
  }

  if (loading && !data) return <><Title h="Faturas e pagamento" p="Método de cobrança, dados fiscais e histórico." /><LoadingCard rows={2} /><LoadingCard rows={3} /></>
  if (error || !data) return <><Title h="Faturas e pagamento" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  const pm = data.paymentMethod
  const next = data.upcoming ? `${money(data.upcoming.amount_cents / 100, data.upcoming.currency.toUpperCase())} em ${fmtDate(data.upcoming.date)}` : data.plan === 'free' ? '—  (plano Free)' : fmtDate(data.currentPeriodEnd)

  return (
    <>
      <Title h="Faturas e pagamento" p="Método de cobrança, dados fiscais e histórico." />
      <Card title="Método de pagamento" right={<button type="button" className="btn btn-sm" onClick={openPortal} disabled={busy || !data.stripeConfigured}>{busy && <I n="refresh" s={14} className="spin" />}{pm ? 'Alterar' : 'Adicionar cartão'}</button>}>
        <Row label="Cartão">
          <Kv items={[
            ['Cartão', pm ? `${BRAND[pm.brand] || pm.brand} •••• ${pm.last4}` : 'Nenhum cartão cadastrado'],
            ['Validade', pm ? `${String(pm.exp_month).padStart(2, '0')}/${pm.exp_year}` : '—'],
            ['Próxima cobrança', next],
          ]} />
        </Row>
      </Card>
      <BillingDataCard billing={data.billing} onSaved={() => reload(true)} />
      <Card title="Histórico" flush>
        {data.invoices.length === 0 ? (
          <div className="empty2"><b>Nenhuma fatura ainda</b>Faturas aparecem aqui quando você assinar um plano pago.</div>
        ) : (
          <div className="tw"><table className="stbl">
            <thead><tr><th>Fatura</th><th>Status</th><th className="r">Valor</th><th></th></tr></thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.stripe_invoice_id}>
                  <td className="fx"><span className="nm">{inv.invoice_number || inv.stripe_invoice_id}</span><span className="mt">{fmtDate(inv.created_at)}{inv.paid_at ? ` · paga em ${fmtDate(inv.paid_at)}` : inv.due_at ? ` · vence em ${fmtDate(inv.due_at)}` : ''}</span></td>
                  <td>{invBadge(inv.status)}</td>
                  <td className="r">{money(inv.amount_cents / 100, (inv.currency || 'brl').toUpperCase())}</td>
                  <td className="r"><div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {inv.hosted_invoice_url && <a className="ib" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" title="Abrir fatura"><I n="ext" s={15} /></a>}
                    {inv.pdf_url && <a className="ib" href={inv.pdf_url} target="_blank" rel="noreferrer" title="Baixar PDF"><I n="download" s={15} /></a>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  )
}

function BillingDataCard({ billing, onSaved }: { billing: Resp['billing']; onSaved: () => void }) {
  const f = useForm({ ...billing })
  useEffect(() => { f.reset({ ...billing }) }, [JSON.stringify(billing)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { saving, error, save } = useSave()
  const onSave = () => save(async () => { await api('/api/settings/billing', { method: 'PATCH', json: { billing: f.val } }); onSaved() }, 'Dados da fatura salvos')
  return (
    <Card title="Dados da fatura" foot={<SaveBar dirty={f.dirty} saving={saving} error={error} onSave={onSave} onCancel={f.cancel} />}>
      <Row label="Razão social" htmlFor="bl-name"><input id="bl-name" className="in" value={f.val?.company_name || ''} onChange={(e) => f.set('company_name', e.target.value)} /></Row>
      <Row label="CNPJ" htmlFor="bl-cnpj"><input id="bl-cnpj" className="in" placeholder="00.000.000/0001-00" value={f.val?.cnpj || ''} onChange={(e) => f.set('cnpj', maskCnpj(e.target.value))} inputMode="numeric" /></Row>
      <Row label="E-mail de cobrança" help="Faturas e recibos são enviados para este endereço." htmlFor="bl-email"><input id="bl-email" className="in" type="email" value={f.val?.billing_email || ''} onChange={(e) => f.set('billing_email', e.target.value)} /></Row>
    </Card>
  )
}
