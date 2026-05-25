'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  ChartLineUp,
  EnvelopeSimple,
  Warning,
  ArrowClockwise,
  Globe,
  Lightning,
  CaretRight,
  CheckCircle,
  XCircle,
  MinusCircle,
  Fire,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'

// ── Types ──

interface KpiData {
  deliveryRate: string
  bounceRate: string
  complaintRate: string
  openRate: string
  clickRate: string
  reputationScore: number
  totalSent: number
  totalDelivered: number
  totalBounced: number
  totalComplaints: number
}

interface IspEntry {
  name: string
  total: number
  deliveredCount: number
  openedCount: number
  bouncedCount: number
  complainedCount: number
  delivered: number
  opens: number
  inbox: number
  spam: number
}

interface DomainHealthEntry {
  domain: string
  status: string
  spf: boolean
  dkim: boolean
  dmarc: boolean
  reputation: number
  warmup: { day: number; dailyLimit: number } | null
}

interface DomainCheckResult {
  domain: string
  checkedAt: string
  score: number
  band: string
  checks: {
    spf: CheckResult
    dkim: CheckResult
    dmarc: CheckResult
    mx: CheckResult
  }
}

interface CheckResult {
  ok: boolean
  state: 'pass' | 'warn' | 'fail' | 'missing'
  value?: string
  message: string
  recommendation?: string
}

interface DeliverabilityData {
  kpis: KpiData
  deliveryChart: Array<{ date: string; delivered: number; bounced: number; complaints: number }>
  ispBreakdown: IspEntry[]
  domainHealth: DomainHealthEntry[]
}

interface BounceData {
  contacts: Array<{
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    status: string
    updated_at: string
    bounce_info: { bounce_type: string; bounced_at: string; campaign_id: string | null } | null
  }>
  total: number
}

// ── Helpers ──

function fmtNumber(v: number): string {
  return v.toLocaleString('pt-BR')
}

function fmtPercent(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return `${n.toFixed(1)}%`
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-50 border-emerald-200'
  if (score >= 60) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

function scoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-emerald-500'
  if (score >= 60) return 'stroke-amber-500'
  return 'stroke-red-500'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excelente'
  if (score >= 60) return 'Atenção'
  return 'Crítico'
}

function dnsIcon(ok: boolean) {
  if (ok) return <CheckCircle size={16} weight="fill" className="text-emerald-500" />
  return <XCircle size={16} weight="fill" className="text-red-400" />
}

function checkStateIcon(state: string) {
  if (state === 'pass') return <CheckCircle size={16} weight="fill" className="text-emerald-500" />
  if (state === 'warn') return <MinusCircle size={16} weight="fill" className="text-amber-500" />
  return <XCircle size={16} weight="fill" className="text-red-400" />
}

function checkStateBadge(state: string) {
  if (state === 'pass') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (state === 'warn') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function checkStateLabel(state: string) {
  if (state === 'pass') return 'OK'
  if (state === 'warn') return 'Atenção'
  if (state === 'missing') return 'Ausente'
  return 'Falha'
}

// ── Skeletons ──

function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse ${className}`}>
      <div className="w-32 h-5 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        <div className="w-full h-4 bg-gray-100 rounded" />
        <div className="w-3/4 h-4 bg-gray-100 rounded" />
        <div className="w-1/2 h-4 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

function ScoreSkeleton() {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-28 h-28 bg-gray-100 rounded-full" />
        <div className="space-y-3 flex-1">
          <div className="w-32 h-5 bg-gray-200 rounded" />
          <div className="w-20 h-8 bg-gray-200 rounded" />
          <div className="w-48 h-3 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="w-48 h-5 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="w-20 h-4 bg-gray-200 rounded" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="w-20 h-4 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Score Ring SVG ──

function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={scoreRingColor(score)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className="text-[10px] text-gray-400 font-medium">/ 100</span>
      </div>
    </div>
  )
}

// ── Main Page ──

export default function DeliverabilityPage() {
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const storeId = currentStore?.id

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DeliverabilityData | null>(null)
  const [bounceData, setBounceData] = useState<BounceData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // DNS check state
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null)
  const [domainChecks, setDomainChecks] = useState<Record<string, DomainCheckResult>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [delivRes, bounceRes] = await Promise.all([
        fetch(`/api/analytics/deliverability?days=30`).then((r) =>
          r.ok ? r.json() : null
        ).catch(() => null),
        fetch(`/api/email/bounces?limit=5${storeId ? `&storeId=${storeId}` : ''}`).then((r) =>
          r.ok ? r.json() : null
        ).catch(() => null),
      ])

      if (delivRes) setData(delivRes)
      else setError('Erro ao carregar dados de entregabilidade.')

      if (bounceRes) setBounceData(bounceRes)
    } catch {
      setError('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!hasHydrated) return
    fetchData()
  }, [fetchData, hasHydrated])

  const handleDomainCheck = async (domain: string) => {
    setCheckingDomain(domain)
    try {
      const res = await fetch(`/api/deliverability/domain-check?domain=${encodeURIComponent(domain)}`)
      if (res.ok) {
        const result = await res.json()
        setDomainChecks((prev) => ({ ...prev, [domain]: result }))
      }
    } catch { /* silent */ }
    setCheckingDomain(null)
  }

  // Derive metrics
  const kpis = data?.kpis
  const ispBreakdown = data?.ispBreakdown || []
  const domainHealth = data?.domainHealth || []

  // Count hard vs soft bounces from bounce data contacts
  const hardBounces = bounceData?.contacts?.filter(
    (c) => c.bounce_info?.bounce_type === 'bounced' || c.status === 'bounced'
  ).length || 0
  const softBounces = bounceData?.contacts?.filter(
    (c) => c.bounce_info?.bounce_type === 'complained' || c.status === 'complained'
  ).length || 0
  const totalBounceCount = bounceData?.total || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Entregabilidade</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitore a reputação do seu domínio e a saúde dos seus envios
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm"
        >
          <ArrowClockwise size={16} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Section 1: Reputation Score + Sub-metrics */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ScoreSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Score card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-white/50 border rounded-xl p-6 ${scoreBgColor(kpis.reputationScore)}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={18} className={scoreColor(kpis.reputationScore)} weight="fill" />
              <span className="text-sm font-semibold text-gray-900">Reputação</span>
            </div>
            <div className="flex items-center gap-4">
              <ScoreRing score={kpis.reputationScore} />
              <div>
                <p className={`text-sm font-bold ${scoreColor(kpis.reputationScore)}`}>
                  {scoreLabel(kpis.reputationScore)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Baseado em bounces, reclamações e engajamento dos últimos 30 dias
                </p>
              </div>
            </div>
          </motion.div>

          {/* Delivery Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white/50 border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <EnvelopeSimple size={16} className="text-gray-500" />
              <span className="text-xs text-gray-500">Taxa de Entrega</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{fmtPercent(kpis.deliveryRate)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {fmtNumber(kpis.totalDelivered)} de {fmtNumber(kpis.totalSent)} enviados
            </p>
          </motion.div>

          {/* Bounce Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/50 border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <Warning size={16} className="text-gray-500" />
              <span className="text-xs text-gray-500">Taxa de Bounce</span>
            </div>
            <p className={`text-2xl font-bold ${parseFloat(kpis.bounceRate) > 2 ? 'text-red-500' : parseFloat(kpis.bounceRate) > 1 ? 'text-amber-500' : 'text-gray-900'}`}>
              {fmtPercent(kpis.bounceRate)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {fmtNumber(kpis.totalBounced)} bounces
            </p>
            {parseFloat(kpis.bounceRate) > 2 && (
              <p className="text-xs text-red-500 mt-1 font-medium">Acima do limite seguro (2%)</p>
            )}
          </motion.div>

          {/* Complaint Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white/50 border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <Warning size={16} className="text-gray-500" />
              <span className="text-xs text-gray-500">Taxa de Reclamação</span>
            </div>
            <p className={`text-2xl font-bold ${parseFloat(kpis.complaintRate) > 0.1 ? 'text-red-500' : 'text-gray-900'}`}>
              {fmtPercent(kpis.complaintRate)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {fmtNumber(kpis.totalComplaints)} reclamações
            </p>
            {parseFloat(kpis.complaintRate) > 0.1 && (
              <p className="text-xs text-red-500 mt-1 font-medium">Acima de 0.1% — risco de bloqueio</p>
            )}
          </motion.div>
        </div>
      ) : null}

      {/* Section 2: DNS Health Check */}
      {loading ? (
        <CardSkeleton className="col-span-full" />
      ) : domainHealth.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-900">Saúde DNS dos Domínios</h3>
            </div>
            <Link
              href="/settings/email"
              className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
            >
              Gerenciar domínios <CaretRight size={12} />
            </Link>
          </div>

          <div className="space-y-4">
            {domainHealth.map((dh) => {
              const check = domainChecks[dh.domain]
              return (
                <div key={dh.domain} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                        <Globe size={16} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 font-mono">{dh.domain}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {dnsIcon(dh.spf)} SPF
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {dnsIcon(dh.dkim)} DKIM
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {dnsIcon(dh.dmarc)} DMARC
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDomainCheck(dh.domain)}
                      disabled={checkingDomain === dh.domain}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <ArrowClockwise
                        size={14}
                        className={checkingDomain === dh.domain ? 'animate-spin' : ''}
                      />
                      Verificar agora
                    </button>
                  </div>

                  {/* Expanded DNS check results */}
                  {check && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 pt-4 border-t border-gray-100"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${checkStateBadge(check.band === 'excellent' || check.band === 'good' ? 'pass' : check.band === 'fair' ? 'warn' : 'fail')}`}>
                          Score DNS: {check.score}/100
                        </span>
                        <span className="text-xs text-gray-400">
                          Verificado {new Date(check.checkedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(['spf', 'dkim', 'dmarc', 'mx'] as const).map((key) => {
                          const c = check.checks[key]
                          return (
                            <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50/50">
                              {checkStateIcon(c.state)}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-700 uppercase">{key}</span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${checkStateBadge(c.state)}`}>
                                    {checkStateLabel(c.state)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-0.5">{c.message}</p>
                                {c.value && (
                                  <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate" title={c.value}>
                                    {c.value}
                                  </p>
                                )}
                                {c.recommendation && (
                                  <p className="text-[11px] text-amber-600 mt-0.5">{c.recommendation}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      ) : !loading && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={18} className="text-gray-700" />
            <h3 className="text-sm font-semibold text-gray-900">Saúde DNS dos Domínios</h3>
          </div>
          <div className="text-center py-8">
            <Globe size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhum domínio configurado.</p>
            <Link
              href="/settings/email"
              className="text-sm text-brand-500 hover:text-brand-600 font-medium mt-1 inline-block"
            >
              Adicionar domínio
            </Link>
          </div>
        </div>
      )}

      {/* Section 3: ISP Performance Breakdown */}
      {loading ? (
        <TableSkeleton />
      ) : ispBreakdown.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white/50 border border-gray-200 rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <ChartLineUp size={18} className="text-gray-700" />
            <h3 className="text-sm font-semibold text-gray-900">Performance por ISP</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">ISP</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Enviados</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Entregues</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Abertos</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Bounced</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Taxa Entrega</th>
                </tr>
              </thead>
              <tbody>
                {ispBreakdown.map((isp) => (
                  <tr
                    key={isp.name}
                    className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors"
                  >
                    <td className="py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-gray-500">
                            {isp.name.charAt(0)}
                          </span>
                        </div>
                        {isp.name}
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtNumber(isp.total)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtNumber(isp.deliveredCount)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtNumber(isp.openedCount)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">
                      <span className={isp.bouncedCount > 0 ? 'text-red-500' : ''}>
                        {fmtNumber(isp.bouncedCount)}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          isp.delivered >= 95
                            ? 'text-emerald-600'
                            : isp.delivered >= 90
                            ? 'text-amber-500'
                            : 'text-red-500'
                        }`}
                      >
                        {fmtPercent(isp.delivered)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : !loading && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ChartLineUp size={18} className="text-gray-700" />
            <h3 className="text-sm font-semibold text-gray-900">Performance por ISP</h3>
          </div>
          <div className="text-center py-8 text-gray-400">
            <EnvelopeSimple size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum dado de ISP disponível. Envie emails para ver a performance por provedor.</p>
          </div>
        </div>
      )}

      {/* Bottom Row: Bounce Summary + Warmup Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 4: Bounce Summary */}
        {loading ? (
          <CardSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/50 border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Warning size={18} className="text-gray-700" />
                <h3 className="text-sm font-semibold text-gray-900">Resumo de Bounces</h3>
              </div>
              <Link
                href="/contacts?filter=bounced"
                className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
              >
                Gerenciar bounces <CaretRight size={12} />
              </Link>
            </div>

            {/* Hard vs Soft */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-lg bg-red-50/50 border border-red-100">
                <p className="text-xs text-red-600 font-medium">Hard Bounce</p>
                <p className="text-xl font-bold text-red-700 mt-1">{fmtNumber(kpis?.totalBounced || hardBounces)}</p>
                <p className="text-[11px] text-red-500 mt-0.5">Endereços inválidos</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100">
                <p className="text-xs text-amber-600 font-medium">Reclamações (Spam)</p>
                <p className="text-xl font-bold text-amber-700 mt-1">{fmtNumber(kpis?.totalComplaints || softBounces)}</p>
                <p className="text-[11px] text-amber-500 mt-0.5">Marcados como spam</p>
              </div>
            </div>

            {/* Recent bounces mini-list */}
            {bounceData && bounceData.contacts.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Últimos bounces</p>
                <div className="space-y-2">
                  {bounceData.contacts.slice(0, 5).map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-700 font-mono truncate">{contact.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            contact.status === 'bounced'
                              ? 'bg-red-50 text-red-600'
                              : contact.status === 'complained'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {contact.status === 'bounced' ? 'Bounce' : contact.status === 'complained' ? 'Spam' : contact.status}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(contact.updated_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {totalBounceCount > 5 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    + {fmtNumber(totalBounceCount - 5)} outros contatos
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle size={24} className="text-emerald-400 mx-auto mb-1" />
                <p className="text-xs text-gray-500">Nenhum bounce recente</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Section 5: Warmup Status */}
        {loading ? (
          <CardSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white/50 border border-gray-200 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fire size={18} className="text-amber-500" weight="fill" />
                <h3 className="text-sm font-semibold text-gray-900">Warm-up de Domínio</h3>
              </div>
              <Link
                href="/settings/email"
                className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
              >
                Configurar <CaretRight size={12} />
              </Link>
            </div>

            {domainHealth.filter((d) => d.warmup).length > 0 ? (
              <div className="space-y-4">
                {domainHealth
                  .filter((d) => d.warmup)
                  .map((d) => {
                    const warmup = d.warmup!
                    const maxDays = 30
                    const progress = Math.min((warmup.day / maxDays) * 100, 100)
                    // Estimated max volume at full warmup
                    const fullVolumeLimit = 50000

                    return (
                      <div key={d.domain} className="p-4 rounded-lg border border-amber-100 bg-amber-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-900 font-mono">{d.domain}</p>
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                            Dia {warmup.day}/{maxDays}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                            <span>Progresso do warm-up</span>
                            <span>{progress.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-2 rounded bg-white/80">
                            <p className="text-[11px] text-gray-500">Limite diário</p>
                            <p className="text-sm font-bold text-gray-900">
                              {fmtNumber(warmup.dailyLimit)} emails
                            </p>
                          </div>
                          <div className="p-2 rounded bg-white/80">
                            <p className="text-[11px] text-gray-500">Meta final</p>
                            <p className="text-sm font-bold text-gray-900">
                              {fmtNumber(fullVolumeLimit)} emails/dia
                            </p>
                          </div>
                        </div>

                        {progress < 100 && (
                          <p className="text-[11px] text-amber-600 mt-2">
                            Continue enviando gradualmente. O volume aumentará automaticamente a cada dia.
                          </p>
                        )}
                        {progress >= 100 && (
                          <p className="text-[11px] text-emerald-600 mt-2 font-medium">
                            Warm-up completo! Seu domínio está com reputação estabelecida.
                          </p>
                        )}
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Lightning size={20} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 font-medium">Nenhum warm-up ativo</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                  Ative o warm-up nos seus domínios verificados para construir reputação gradualmente
                  e melhorar a entregabilidade.
                </p>
                <Link
                  href="/settings/email"
                  className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium mt-3"
                >
                  Ir para configurações <CaretRight size={12} />
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
