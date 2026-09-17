'use client'

// Configurações → Plano e uso (desenho PPlano).

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { Card, Title, LoadingCard, Badge, Meter } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, nf, brl } from '@/components/settings/format'
import { useApi } from '@/components/settings/hooks'
import { PLAN_ORDER } from '@/lib/billing/plans'

interface Plan { key: string; label: string; price: number; features: string[]; popular?: boolean; available: boolean }
interface Resp {
  plan: string; planLabel: string; status: string; cancelAtPeriodEnd: boolean
  currentPeriodStart: string; currentPeriodEnd: string
  limits: { emailsMonth: number; contacts: number; whatsappMonth: number }
  usage: { emailsMonth: number; contacts: number; whatsappMonth: number; smsMonth: number }
  usagePricing: Array<{ key: string; label: string; help?: string; price: number; units: number; estimate: number }>
  plans: Plan[]; stripeConfigured: boolean; hasStripeCustomer: boolean
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function cycle(a: string, b: string) {
  const s = new Date(a), e = new Date(b)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ''
  return s.getMonth() === e.getMonth() ? `${s.getDate()} – ${e.getDate()} ${MESES[e.getMonth()]}` : `${s.getDate()} ${MESES[s.getMonth()]} – ${e.getDate()} ${MESES[e.getMonth()]}`
}

export default function BillingSettingsPage() {
  const { data, loading, error, reload } = useApi<Resp>('/api/settings/billing')
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const choose = async (plan: string) => {
    setBusy(plan)
    try {
      if (data?.hasStripeCustomer && PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(data.plan)) {
        // Downgrade: pelo portal, onde o Stripe mostra o rateio.
        const r = await api<{ url: string }>('/api/billing/portal', { method: 'POST' })
        window.location.href = r.url
        return
      }
      const r = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', json: { plan } })
      window.location.href = r.url
    } catch (e: any) {
      toast.error('Não foi possível abrir o checkout', e.message)
      setBusy(null)
    }
  }
  const upgrade = () => {
    const el = document.getElementById('planos')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading && !data) return <><Title h="Plano e uso" p="Consumo do ciclo atual e limites do plano." /><LoadingCard rows={3} /><LoadingCard rows={4} /></>
  if (error || !data) return <><Title h="Plano e uso" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  const pct = (u: number, l: number) => (l <= 0 ? 0 : Math.round((u / l) * 100))
  const lim = (l: number) => (l < 0 ? '∞' : nf(l))
  const meter = (label: string, used: number, limit: number) => {
    const p = pct(used, limit)
    const over = limit > 0 && used > limit
    return <Meter label={label} right={`${nf(used)} / ${lim(limit)}`} value={limit < 0 ? nf(used) : `${nf(p)}%`} suffix={limit < 0 ? 'sem limite' : over ? 'acima do limite' : 'do limite'} pct={limit < 0 ? 0 : p} tone={over ? 'over' : undefined} valueStyle={over ? { color: 'var(--neg)' } : undefined} />
  }
  const overContacts = data.limits.contacts > 0 && data.usage.contacts > data.limits.contacts
  const overEmails = data.limits.emailsMonth > 0 && data.usage.emailsMonth > data.limits.emailsMonth
  const nearEmails = !overEmails && data.limits.emailsMonth > 0 && data.usage.emailsMonth / data.limits.emailsMonth >= 0.8
  const hint = overContacts ? 'Você ultrapassou o limite de contatos. Campanhas continuam, mas novos contatos não serão importados.'
    : overEmails ? 'Você ultrapassou o limite de e-mails do ciclo. Envios extras são cobrados por bloco de 1.000.'
    : nearEmails ? 'Você já usou mais de 80% dos e-mails do ciclo.'
    : data.cancelAtPeriodEnd ? 'Assinatura será cancelada no fim do ciclo.' : ''
  const price = data.plans.find((p) => p.key === data.plan)?.price
  const idx = PLAN_ORDER.indexOf(data.plan)

  return (
    <>
      <Title h="Plano e uso" p={`Consumo do ciclo atual (${cycle(data.currentPeriodStart, data.currentPeriodEnd)}) e limites do plano.`} right={data.plan !== 'business' && data.plan !== 'enterprise' ? <button type="button" className="btn btn-primary" onClick={upgrade}>Fazer upgrade</button> : undefined} />
      <Card flush>
        <div className="sc-h"><div className="plan-h"><span className="nm">{data.planLabel}</span><Badge k={data.status === 'past_due' ? 'err' : data.status === 'trialing' ? 'warn' : 'off'}>{data.status === 'past_due' ? 'Pagamento pendente' : data.status === 'trialing' ? 'Período de teste' : 'Plano atual'}</Badge><span className="pr"><b>{price === undefined ? 'Sob consulta' : brl(price, 0)}</b>{price !== undefined && '/mês'}</span></div></div>
        <div className="use">
          {meter('E-mails enviados', data.usage.emailsMonth, data.limits.emailsMonth)}
          {meter('Contatos', data.usage.contacts, data.limits.contacts)}
          {meter('WhatsApp', data.usage.whatsappMonth, data.limits.whatsappMonth)}
        </div>
        <div className="sc-f"><span className={'hint' + (overContacts || overEmails ? ' err' : '')}>{hint}</span><button type="button" className="btn btn-sm" onClick={upgrade}>Ver planos</button></div>
      </Card>

      <Card title="Comparar planos" desc="Cobrança mensal. Cancele quando quiser." id="planos">
        <div className="plans" style={{ padding: '14px 0 18px' }}>
          {data.plans.map((p) => {
            const isCur = p.key === data.plan
            const lower = PLAN_ORDER.indexOf(p.key) < idx
            return (
              <div key={p.key} className={'plan' + (p.popular ? ' pop' : '')}>
                {p.popular && <span className="tag">Mais popular</span>}
                <h4>{p.label}</h4>
                <div className="pv">{brl(p.price, 0)}<small>/mês</small></div>
                <ul>{p.features.map((x) => <li key={x}><I n="check" s={14} />{x}</li>)}</ul>
                <button type="button" className={'btn' + (p.popular && !isCur ? ' btn-primary' : '')} disabled={isCur || busy !== null || (!p.available && p.key !== 'free')} onClick={() => choose(p.key)} title={!p.available && !isCur ? 'Plano indisponível no momento' : undefined}>
                  {busy === p.key ? <I n="refresh" s={14} className="spin" /> : null}
                  {isCur ? 'Plano atual' : p.key === 'free' ? 'Voltar para Free' : `${lower ? 'Mudar para' : 'Escolher'} ${p.label}`}
                </button>
              </div>
            )
          })}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-3)' }}>Precisa de mais? <Link href="/help" style={{ color: 'var(--acc-ink)', fontWeight: 500 }}>Fale com vendas</Link> para um plano Enterprise.</p>
        {!data.stripeConfigured && <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--warn-fg)' }}>Pagamentos ainda não estão habilitados neste ambiente. <Link href="/settings/billing/invoices" style={{ fontWeight: 500 }}>Faturas e pagamento</Link>.</p>}
      </Card>

      <Card title="Preços por uso" desc="Cobrados além do plano, no fechamento do ciclo." flush>
        <div className="tw"><table className="stbl">
          <thead><tr><th>Item</th><th className="r">Preço</th><th className="r">Uso no ciclo</th><th className="r">Estimativa</th></tr></thead>
          <tbody>
            {data.usagePricing.map((u) => (
              <tr key={u.key}><td><span className="nm">{u.label}</span>{u.help && <span className="mt">{u.help}</span>}</td><td className="r">{brl(u.price)}</td><td className="r">{nf(u.units)}</td><td className="r">{brl(u.estimate)}</td></tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </>
  )
}
