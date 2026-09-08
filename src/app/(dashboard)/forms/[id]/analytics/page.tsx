'use client'

// =============================================
// Analytics de um popup
//
// Lê /api/forms/:id/analytics: a série diária vem de form_events (cada
// impressão, envio e fechamento é uma linha), o opt-in vem da prova de
// consentimento, a receita vem do motor de atribuição. Nada é derivado
// de contador dividido por dias.
// =============================================

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '@/lib/utils/formatters'

interface SeriesPoint { date: string; impressions: number; submissions: number; dismissals: number; holdouts: number }
interface Analytics {
  days: number
  form: { id: string; name: string; form_type: string; status: string; created_at: string }
  missing_migration: string | null
  series: SeriesPoint[]
  totals: {
    impressions: number; submissions: number; dismissals: number; holdouts: number
    submit_rate: number; dismiss_rate: number; opt_in_rate: number
    opt_ins: { email: number; whatsapp: number; sms: number; denied: number }
    coupons_issued: number
    attributed_revenue: number; attributed_orders: number; driven_revenue: number; driven_orders: number
    influenced_revenue: number; influenced_orders: number
    period_conversions: number; period_conversion_value: number
    median_time_to_purchase_hours: number | null
  }
  devices: { mobile: number; desktop: number; tablet: number; unknown: number }
  holdout: {
    configured: boolean
    rows: Array<{ bucket: string; visitors: number; buyers: number; revenue: number }>
    incremental: null | {
      exposed: { visitors: number; buyers: number; revenue: number; conversion: number; revenue_per_visitor: number }
      control: { visitors: number; buyers: number; revenue: number; conversion: number; revenue_per_visitor: number }
      lift_conversion: number | null
      incremental_revenue: number
      reliable: boolean
    }
  }
  recent_submissions: Array<{ id: string; created_at: string; answers: Record<string, unknown>; device: string | null; country: string | null; coupon_code: string | null; converted_at: string | null; conversion_value: number | null }>
}

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
const int = (v: number) => v.toLocaleString('pt-BR')

function hoursLabel(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${h.toFixed(1).replace('.', ',')} h`
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`
}

export default function FormAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/forms/${formId}/analytics?days=${days}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
        return d as Analytics
      })
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [formId, days])

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }
  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-gray-700">{error || 'Sem dados'}</p>
        <button onClick={() => router.push('/site/forms')} className="mt-4 text-sm text-brand-600 underline">Voltar para a lista</button>
      </div>
    )
  }

  const t = data.totals
  const chart = data.series.map((p) => ({
    ...p,
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  }))
  const deviceTotal = data.devices.mobile + data.devices.desktop + data.devices.tablet + data.devices.unknown
  const devicePct = (n: number) => (deviceTotal > 0 ? Math.round((n / deviceTotal) * 100) : 0)

  const funnel = [
    { label: 'Visualizações', value: t.impressions },
    { label: 'Inscrições', value: t.submissions },
    { label: 'Opt-in confirmado', value: t.opt_ins.email + t.opt_ins.whatsapp + t.opt_ins.sms },
    { label: 'Pedidos no período', value: t.period_conversions },
  ]
  const funnelMax = Math.max(1, funnel[0].value)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/site/forms')} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{data.form.name}</h1>
            <p className="text-sm text-gray-500">
              {data.form.status === 'published' ? 'Ativo' : 'Rascunho'} · últimos {data.days} dias
            </p>
          </div>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white" aria-label="Período">
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
        </select>
      </div>

      {data.missing_migration && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
          A série diária depende da migration <code className="font-mono">{data.missing_migration}</code>, ainda não aplicada neste ambiente.
        </div>
      )}

      {/* KPIs do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Visualizações" value={int(t.impressions)} hint={t.holdouts > 0 ? `+${int(t.holdouts)} no grupo de controle` : 'impressões do popup'} />
        <Kpi label="Inscrições" value={int(t.submissions)} hint={`taxa de envio ${pct(t.submit_rate)}`} />
        <Kpi label="Opt-in confirmado" value={int(t.opt_ins.email + t.opt_ins.whatsapp + t.opt_ins.sms)} hint={`e-mail ${int(t.opt_ins.email)} · WhatsApp ${int(t.opt_ins.whatsapp)}${t.opt_ins.denied ? ` · ${int(t.opt_ins.denied)} recusaram` : ''}`} />
        <Kpi label="Fechamentos" value={int(t.dismissals)} hint={`taxa de fechamento ${pct(t.dismiss_rate)}`} />
      </div>

      {/* Receita — três leituras, três perguntas diferentes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Receita atribuída" value={formatCurrency(t.attributed_revenue)} hint={`${int(t.attributed_orders)} pedido${t.attributed_orders === 1 ? '' : 's'} · crédito único ao popup`} />
        <Kpi label="Receita influenciada" value={formatCurrency(t.influenced_revenue)} hint={`${int(t.influenced_orders)} pedido${t.influenced_orders === 1 ? '' : 's'} após a inscrição, creditados a qualquer canal`} />
        <Kpi label="Receita com o cupom" value={formatCurrency(t.driven_revenue)} hint={`${int(t.driven_orders)} pedido${t.driven_orders === 1 ? '' : 's'} usaram o código`} />
        <Kpi label="Tempo até a compra" value={hoursLabel(t.median_time_to_purchase_hours)} hint="mediana, da inscrição ao pedido" />
      </div>

      {/* Incremental: a única que responde "quanto o popup gerou de verdade" */}
      {data.holdout.configured && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Receita incremental</h3>
              <p className="text-xs text-gray-500 mt-0.5">Quem viu o popup contra quem foi sorteado para não ver, com compras na janela após o sorteio.</p>
            </div>
            {data.holdout.incremental && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${data.holdout.incremental.reliable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {data.holdout.incremental.reliable ? 'amostra suficiente' : 'amostra pequena'}
              </span>
            )}
          </div>
          {!data.holdout.incremental ? (
            <p className="text-xs text-gray-400">Ainda faltam visitantes nos dois grupos (mínimo 30 em cada) para comparar.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([['exposed', 'Viram o popup'], ['control', 'Grupo de controle']] as const).map(([k, label]) => {
                const g = data.holdout.incremental![k]
                return (
                  <div key={k} className="rounded-lg border border-gray-100 p-4">
                    <p className="text-xs font-medium text-gray-500">{label}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1 tabular-nums">{pct(g.conversion)} <span className="text-xs font-normal text-gray-400">compraram</span></p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{int(g.visitors)} visitantes · {int(g.buyers)} compradores · {formatCurrency(g.revenue_per_visitor)} por visitante</p>
                  </div>
                )
              })}
              <div className="rounded-lg border border-gray-900 bg-gray-900 text-white p-4">
                <p className="text-xs font-medium text-gray-300">Incremental estimada</p>
                <p className="text-lg font-semibold mt-1 tabular-nums">{formatCurrency(Math.max(0, data.holdout.incremental.incremental_revenue))}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {data.holdout.incremental.lift_conversion == null ? 'sem base de comparação' : `conversão ${data.holdout.incremental.lift_conversion >= 0 ? '+' : ''}${(data.holdout.incremental.lift_conversion * 100).toFixed(0)}% sobre o controle`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Série diária */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Por dia</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="impressions" name="Visualizações" stroke="#94A3B8" fill="#E2E8F0" strokeWidth={1.5} />
              <Line type="monotone" dataKey="submissions" name="Inscrições" stroke="#18181B" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="dismissals" name="Fechamentos" stroke="#F26B2A" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Funil do período</h3>
          <div className="space-y-3">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{f.label}</span>
                  <span className="tabular-nums">{int(f.value)}{i > 0 && funnel[0].value > 0 && <span className="text-gray-400"> · {pct(f.value / funnel[0].value)}</span>}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-gray-900 rounded-full" style={{ width: `${Math.max(1, Math.round((f.value / funnelMax) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dispositivos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Inscrições por dispositivo</h3>
          {deviceTotal === 0 ? (
            <p className="text-xs text-gray-400">Sem inscrições no período.</p>
          ) : (
            <div className="space-y-3">
              {([['mobile', 'Celular'], ['desktop', 'Computador'], ['tablet', 'Tablet']] as const).map(([k, label]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1"><span>{label}</span><span className="tabular-nums">{devicePct(data.devices[k])}%</span></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-2 bg-gray-700 rounded-full" style={{ width: `${devicePct(data.devices[k])}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Últimas inscrições */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Últimas inscrições</h3>
          <span className="text-xs text-gray-400">{int(data.recent_submissions.length)} mais recentes</span>
        </div>
        {data.recent_submissions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Nenhuma inscrição no período</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.recent_submissions.map((s) => {
              const a = s.answers || {}
              const who = String(a.email || a.whatsapp || a.phone || a.first_name || 'Anônimo')
              const rest = Object.entries(a).filter(([k]) => !['email', 'whatsapp', 'phone', 'first_name', 'last_name'].includes(k))
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{who}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[s.device, s.country, s.coupon_code ? `cupom ${s.coupon_code}` : null, ...rest.map(([k, v]) => `${k}: ${String(v)}`)].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500 tabular-nums">
                      {new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {s.converted_at && (
                      <p className="text-[11px] text-emerald-600 font-medium tabular-nums">comprou · {formatCurrency(Number(s.conversion_value) || 0)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}
