'use client'

// =============================================
// WORDER: Deliverability dashboard
// /settings/deliverability/page.tsx
//
// SPF / DKIM / DMARC / MX checker + inbox preview launcher.
// Klaviyo/Omnisend-style "why am I going to spam?" page.
// =============================================

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Globe,
} from 'lucide-react'

interface CheckResult {
  ok: boolean
  state: 'pass' | 'warn' | 'fail' | 'missing'
  value?: string
  message: string
  recommendation?: string
}

interface CheckResponse {
  domain: string
  checkedAt: string
  score: number
  band: 'excellent' | 'good' | 'fair' | 'poor'
  checks: {
    spf: CheckResult
    dkim: CheckResult
    dmarc: CheckResult
    mx: CheckResult
  }
}

export default function DeliverabilityPage() {
  const [domain, setDomain] = useState('')
  const [result, setResult] = useState<CheckResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist the last-checked domain so a refresh doesn't lose context.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wd:deliverability:domain')
      if (saved) setDomain(saved)
    } catch {}
  }, [])

  const runCheck = useCallback(async (d: string) => {
    if (!d) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/deliverability/domain-check?domain=${encodeURIComponent(d)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Falha ao verificar domínio')
        return
      }
      setResult(json)
      try {
        localStorage.setItem('wd:deliverability:domain', d)
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setDomain(cleaned)
    runCheck(cleaned)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-orange-600" />
          </div>
          <h1 className="text-[24px] font-bold text-gray-900">Deliverability</h1>
        </div>
        <p className="text-[14px] text-gray-500 leading-relaxed max-w-2xl">
          Verifique se o seu domínio está configurado corretamente pra que seus emails caiam na
          caixa de entrada, não no spam. SPF, DKIM e DMARC são lidos diretamente do DNS público.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <label className="block text-[12px] font-semibold text-gray-700 mb-2 uppercase tracking-wider">
          Domínio do remetente
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="ex: sualoja.com"
              className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !domain}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Verificar
          </button>
        </div>
        {error && (
          <p className="mt-3 text-[12px] text-red-600 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
      </form>

      {result && <ResultPanel result={result} onRefresh={() => runCheck(result.domain)} />}
    </div>
  )
}

function ResultPanel({ result, onRefresh }: { result: CheckResponse; onRefresh: () => void }) {
  const bandColor =
    result.band === 'excellent'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : result.band === 'good'
      ? 'text-blue-600 bg-blue-50 border-blue-200'
      : result.band === 'fair'
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-red-600 bg-red-50 border-red-200'

  const bandLabel = {
    excellent: 'Excelente',
    good: 'Bom',
    fair: 'Médio',
    poor: 'Crítico',
  }[result.band]

  return (
    <>
      <div className={`rounded-xl border p-5 mb-5 ${bandColor}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider opacity-80">Score de Deliverability</p>
            <p className="text-[42px] font-bold leading-none mt-1">{result.score}<span className="text-[20px] opacity-60">/100</span></p>
            <p className="text-[14px] font-medium mt-1">{bandLabel} · {result.domain}</p>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-white/50 hover:bg-white transition-colors"
            title="Reverificar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="w-full h-2 rounded-full bg-white/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-current opacity-90 transition-all"
            style={{ width: `${result.score}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CheckCard name="SPF" desc="Servidores autorizados a enviar como você" result={result.checks.spf} />
        <CheckCard name="DKIM" desc="Assinatura criptográfica das mensagens" result={result.checks.dkim} />
        <CheckCard name="DMARC" desc="Política contra spoof do seu domínio" result={result.checks.dmarc} />
        <CheckCard name="MX" desc="Recebimento de replies / bounces" result={result.checks.mx} />
      </div>

      <p className="text-[11px] text-gray-400 mt-5">
        Última verificação: {new Date(result.checkedAt).toLocaleString('pt-BR')}
      </p>
    </>
  )
}

function CheckCard({ name, desc, result }: { name: string; desc: string; result: CheckResult }) {
  const Icon = result.state === 'pass' ? CheckCircle2 : result.state === 'warn' ? AlertTriangle : XCircle
  const iconColor =
    result.state === 'pass' ? 'text-emerald-500' : result.state === 'warn' ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 ${iconColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900">{name}</p>
          <p className="text-[11px] text-gray-500 mb-2">{desc}</p>
          <p className="text-[13px] text-gray-800">{result.message}</p>
          {result.value && (
            <code className="block mt-2 text-[11px] font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 break-all">
              {result.value}
            </code>
          )}
          {result.recommendation && (
            <div className="mt-2 text-[12px] text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-700">Recomendação:</span> {result.recommendation}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
