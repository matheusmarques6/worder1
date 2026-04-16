'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard,
  Zap,
  Loader2,
  CheckCircle,
  ArrowUpRight,
  Download,
  Mail,
  Users,
  MessageCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BillingData {
  plan: string
  status: string
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  limits: { emailsMonth: number; contacts: number; whatsappMonth: number }
  usage: { emailsMonth: number; contacts: number }
  invoices: Array<{
    stripe_invoice_id: string
    amount_cents: number
    currency: string
    status: string
    hosted_invoice_url: string | null
    pdf_url: string | null
    created_at: string
  }>
  hasStripeCustomer: boolean
}

const PLAN_META: Record<string, { label: string; description: string; badge: string; price: string; highlight: boolean }> = {
  free: {
    label: 'Free',
    description: 'Para começar. 1.000 emails e 2k contatos.',
    badge: 'bg-gray-100 text-gray-700',
    price: 'R$ 0',
    highlight: false,
  },
  starter: {
    label: 'Starter',
    description: '10k emails, 10k contatos, 1k WhatsApp.',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    price: 'R$ 99',
    highlight: false,
  },
  pro: {
    label: 'Pro',
    description: '50k emails, 50k contatos, 5k WhatsApp. Ideal pra escalar.',
    badge: 'bg-orange-100 text-orange-700 border border-orange-200',
    price: 'R$ 299',
    highlight: true,
  },
  business: {
    label: 'Business',
    description: '200k emails, 200k contatos, 20k WhatsApp. Suporte prioritário.',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    price: 'R$ 799',
    highlight: false,
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Volumes ilimitados. SLA + CSM dedicado.',
    badge: 'bg-zinc-900 text-white',
    price: 'Customizado',
    highlight: false,
  },
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: ['1.000 emails/mês', '2.000 contatos', '200 WhatsApp/mês', 'Flow builder básico', 'Suporte em horário comercial'],
  starter: ['10.000 emails/mês', '10.000 contatos', '1.000 WhatsApp/mês', 'A/B testing', 'Segmentação avançada', 'Agendamento'],
  pro: ['50.000 emails/mês', '50.000 contatos', '5.000 WhatsApp/mês', 'Tudo do Starter', 'Domínios ilimitados', 'Atribuição multicanal', 'Suporte prioritário'],
  business: ['200.000 emails/mês', '200.000 contatos', '20.000 WhatsApp/mês', 'Tudo do Pro', 'API access completo', 'Gerente de conta dedicado'],
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: (currency || 'brl').toUpperCase(),
  }).format(cents / 100)
}

function fmtNum(n: number) {
  if (n === -1) return '∞'
  return n.toLocaleString('pt-BR')
}

function UsageBar({ used, total, label, icon: Icon }: { used: number; total: number; label: string; icon: any }) {
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const isWarn = percent >= 80
  const isDanger = percent >= 95
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          {label}
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {fmtNum(used)} <span className="text-gray-400">/ {fmtNum(total)}</span>
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isDanger ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-orange-500'
          )}
          style={{ width: `${total === -1 ? 0 : percent}%` }}
        />
      </div>
    </div>
  )
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/settings/billing')
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleCheckout = async (plan: string) => {
    setCheckoutLoading(plan)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error || 'Erro ao iniciar checkout', 'error')
        return
      }
      if (json.url) window.location.href = json.url
    } catch (e: any) {
      showToast(e?.message || 'Erro ao iniciar checkout', 'error')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error || 'Erro ao abrir portal', 'error')
        return
      }
      if (json.url) window.location.href = json.url
    } catch (e: any) {
      showToast(e?.message || 'Erro ao abrir portal', 'error')
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!data) return null

  const currentPlan = data.plan || 'free'
  const currentMeta = PLAN_META[currentPlan] || PLAN_META.free
  const isTrialing = data.status === 'trialing'
  const isPastDue = data.status === 'past_due'

  const ALL_PLANS = ['free', 'starter', 'pro', 'business']

  return (
    <div className="p-8 max-w-5xl">
      {toast && (
        <div
          className={cn(
            'fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium',
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Faturamento</h1>
        <p className="text-gray-500 mt-1 text-sm">Gerencie seu plano, uso e faturas.</p>
      </div>

      <div className="space-y-6">
        {/* ====== Status Banners ====== */}
        {isTrialing && data.trialEndsAt && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Você está em período de teste</p>
              <p className="text-blue-700 text-xs mt-0.5">
                Trial termina em {new Date(data.trialEndsAt).toLocaleDateString('pt-BR')}.
              </p>
            </div>
          </div>
        )}
        {isPastDue && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-medium text-red-900">Pagamento pendente</p>
              <p className="text-red-700 text-xs mt-0.5">
                Não conseguimos processar seu último pagamento. Atualize seu cartão no portal.
              </p>
            </div>
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="text-sm font-medium text-red-700 hover:text-red-800"
            >
              Resolver
            </button>
          </div>
        )}
        {data.cancelAtPeriodEnd && data.currentPeriodEnd && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="text-sm flex-1">
              <p className="font-medium text-amber-900">Assinatura será cancelada</p>
              <p className="text-amber-700 text-xs mt-0.5">
                Seu plano será cancelado em {new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR')}.
              </p>
            </div>
          </div>
        )}

        {/* ====== Current Plan + Usage ====== */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">Plano atual</h2>
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', currentMeta.badge)}>
                    {currentMeta.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{currentMeta.description}</p>
              </div>
              {data.currentPeriodEnd && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Próxima cobrança</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 space-y-5">
            <UsageBar
              used={data.usage.emailsMonth}
              total={data.limits.emailsMonth}
              label="Emails enviados este mês"
              icon={Mail}
            />
            <UsageBar
              used={data.usage.contacts}
              total={data.limits.contacts}
              label="Contatos cadastrados"
              icon={Users}
            />
            {data.limits.whatsappMonth > 0 && (
              <UsageBar
                used={0}
                total={data.limits.whatsappMonth}
                label="Mensagens WhatsApp este mês"
                icon={MessageCircle}
              />
            )}
          </div>

          {data.hasStripeCustomer && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Gerenciar assinatura e método de pagamento
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ====== Plans grid ====== */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Comparar planos</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {ALL_PLANS.map((planKey) => {
              const meta = PLAN_META[planKey]
              const features = PLAN_FEATURES[planKey] || []
              const isCurrent = planKey === currentPlan
              const isUpgrade = ALL_PLANS.indexOf(planKey) > ALL_PLANS.indexOf(currentPlan)
              return (
                <div
                  key={planKey}
                  className={cn(
                    'bg-white border rounded-xl p-5 flex flex-col',
                    meta.highlight ? 'border-orange-300 shadow-sm ring-1 ring-orange-100' : 'border-gray-200'
                  )}
                >
                  {meta.highlight && (
                    <span className="self-start px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white mb-2">
                      MAIS POPULAR
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-gray-900">{meta.label}</h3>
                  <p className="text-xs text-gray-500 mt-1 min-h-[32px]">{meta.description}</p>
                  <div className="mt-3 mb-4">
                    <span className="text-2xl font-bold text-gray-900 tabular-nums">{meta.price}</span>
                    {planKey !== 'free' && <span className="text-xs text-gray-400 ml-1">/mês</span>}
                  </div>
                  <ul className="space-y-2 mb-5 flex-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-lg cursor-default"
                    >
                      Plano atual
                    </button>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleCheckout(planKey)}
                      disabled={checkoutLoading === planKey}
                      className={cn(
                        'w-full py-2 text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5',
                        meta.highlight
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'bg-gray-900 hover:bg-gray-800 text-white'
                      )}
                    >
                      {checkoutLoading === planKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          Fazer upgrade <ArrowUpRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handlePortal}
                      disabled={portalLoading}
                      className="w-full py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-lg"
                    >
                      Fazer downgrade
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Precisa de mais? <a href="mailto:sales@worder.app" className="text-orange-500 hover:underline">Fale com vendas</a> para o plano Enterprise.
          </p>
        </div>

        {/* ====== Invoices ====== */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Faturas</h2>
          </div>
          {data.invoices.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              Nenhuma fatura ainda.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.invoices.map((inv) => (
                <div key={inv.stripe_invoice_id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(inv.amount_cents || 0, inv.currency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(inv.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      inv.status === 'paid' && 'bg-emerald-50 text-emerald-700',
                      inv.status === 'open' && 'bg-amber-50 text-amber-700',
                      (inv.status === 'void' || inv.status === 'uncollectible') && 'bg-gray-50 text-gray-600'
                    )}
                  >
                    {inv.status === 'paid' ? 'Paga' : inv.status}
                  </span>
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-400 hover:text-gray-700"
                      title="Ver fatura"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {inv.pdf_url && (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-400 hover:text-gray-700"
                      title="Baixar PDF"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
