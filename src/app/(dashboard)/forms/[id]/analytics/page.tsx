'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Eye, Users, TrendingUp, Monitor, Smartphone, BarChart3 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface DailyStats { date: string; impressions: number; submissions: number }
interface Submission { id: string; answers: Record<string, any>; created_at: string; ip_address?: string; user_agent?: string }

export default function FormAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [chartData, setChartData] = useState<DailyStats[]>([])
  const [days, setDays] = useState(30)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [formRes, subsRes] = await Promise.all([
          fetch(`/api/forms/${formId}`),
          fetch(`/api/forms/${formId}/submissions?limit=50`),
        ])
        if (formRes.ok) {
          const d = await formRes.json()
          setForm(d.form || d)
        }
        if (subsRes.ok) {
          const d = await subsRes.json()
          setSubmissions(d.submissions || d || [])
        }
      } catch {}

      // Build chart data from submissions
      const daily: Record<string, { impressions: number; submissions: number }> = {}
      const now = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        daily[key] = { impressions: 0, submissions: 0 }
      }
      submissions.forEach(s => {
        const key = new Date(s.created_at).toISOString().slice(0, 10)
        if (daily[key]) daily[key].submissions++
      })
      const avgImpressions = (form?.impressions_count || 0) > 0 ? Math.round(form.impressions_count / days) : 0
      setChartData(Object.entries(daily).map(([date, v]) => ({
        date: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        impressions: avgImpressions || v.impressions,
        submissions: v.submissions,
      })))
      setLoading(false)
    }
    load()
  }, [formId, days])

  const totalImpressions = form?.impressions_count || form?.views_count || 0
  const totalSubmissions = form?.submissions_count || submissions.length || 0
  const conversionRate = totalImpressions > 0 ? ((totalSubmissions / totalImpressions) * 100).toFixed(1) : '0'
  const mobileCount = submissions.filter(s => /mobile|android|iphone|ipad/i.test(s.user_agent || '')).length
  const desktopCount = submissions.length - mobileCount
  const desktopPct = submissions.length > 0 ? Math.round((desktopCount / submissions.length) * 100) : 0
  const mobilePct = submissions.length > 0 ? 100 - desktopPct : 0

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/forms')} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{form?.name || 'Formulário'}</h1>
          <p className="text-sm text-gray-500">Analytics</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Impressões', value: totalImpressions.toLocaleString('pt-BR'), icon: Eye, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Submissões', value: totalSubmissions.toLocaleString('pt-BR'), icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Taxa Conversão', value: `${conversionRate}%`, icon: TrendingUp, color: 'text-zinc-700', bg: 'bg-zinc-50' },
          { label: 'Dispositivos', value: submissions.length > 0 ? `${desktopPct}% / ${mobilePct}%` : '—', icon: Monitor, color: 'text-gray-500', bg: 'bg-gray-50' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${kpi.bg} rounded-lg flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase">{kpi.label}</p>
                <p className="text-xl font-semibold text-gray-900">{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Impressões vs Submissões</h2>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="impressions" name="Impressões" stroke="#94A3B8" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="submissions" name="Submissões" stroke="#18181B" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Device breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Por Dispositivo</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Desktop</span><span>{desktopPct}%</span></div>
              <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-blue-500 rounded-full" style={{ width: `${desktopPct}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Mobile</span><span>{mobilePct}%</span></div>
              <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${mobilePct}%` }} /></div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Por Step</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Step 1</span><span>100%</span></div>
              <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-zinc-500 rounded-full" style={{ width: '100%' }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Submetido</span><span>{conversionRate}%</span></div>
              <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-zinc-500 rounded-full" style={{ width: `${conversionRate}%` }} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent submissions */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Últimas Submissões</h3>
        </div>
        {submissions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Nenhuma submissão ainda</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {submissions.slice(0, 20).map(sub => (
              <div key={sub.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">{sub.answers?.email || sub.answers?.name || sub.answers?.phone || 'Anônimo'}</p>
                  <p className="text-xs text-gray-400">
                    {Object.entries(sub.answers || {}).filter(([k]) => k !== 'email' && k !== 'name').map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(sub.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
