'use client'

import { useState, useEffect } from 'react'
import { Clock, Loader2, Check } from 'lucide-react'

const DAYS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']

interface DayConfig {
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  timezone: string
  out_of_hours_message: string
  enable_auto_reply: boolean
  enable_bot_outside_hours: boolean
  out_of_hours_bot_id?: string
}

export function BusinessHoursTab({ organizationId, storeId }: { organizationId: string; storeId?: string }) {
  const [hours, setHours] = useState<DayConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [organizationId, storeId])

  async function load() {
    setLoading(true)
    try {
      const url = `/api/whatsapp/business-hours?organizationId=${organizationId}${storeId ? `&storeId=${storeId}` : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const { data } = await res.json()
        const map = new Map((data || []).map((h: DayConfig) => [h.day_of_week, h]))
        const full = Array.from({ length: 7 }, (_, i) => (map.get(i) as DayConfig) || {
          day_of_week: i, start_time: '09:00', end_time: '18:00',
          is_active: i > 0 && i < 6, timezone: 'America/Sao_Paulo',
          out_of_hours_message: 'Estamos fora do horario de atendimento. Retornaremos no horario comercial.',
          enable_auto_reply: true, enable_bot_outside_hours: false,
        })
        setHours(full)
      }
    } catch { /* */ }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/whatsapp/business-hours?organizationId=${organizationId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, storeId }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    } catch { /* */ }
    setSaving(false)
  }

  function updateDay(day: number, updates: Partial<DayConfig>) {
    setHours(hours.map(h => h.day_of_week === day ? { ...h, ...updates } : h))
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  const globalConfig = hours[0] || {}

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Horario de atendimento</h3>

      <div className="bg-white border rounded-xl p-4 space-y-2">
        {hours.map(h => (
          <div key={h.day_of_week} className="flex items-center gap-3 py-2">
            <div className="w-24 text-sm font-medium">{DAYS[h.day_of_week]}</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={h.is_active} onChange={e => updateDay(h.day_of_week, { is_active: e.target.checked })} />
              Ativo
            </label>
            {h.is_active && (
              <>
                <input type="time" value={h.start_time} onChange={e => updateDay(h.day_of_week, { start_time: e.target.value })} className="px-2 py-1 border rounded text-sm" />
                <span className="text-gray-400">ate</span>
                <input type="time" value={h.end_time} onChange={e => updateDay(h.day_of_week, { end_time: e.target.value })} className="px-2 py-1 border rounded text-sm" />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={globalConfig.enable_auto_reply} onChange={e => setHours(hours.map(h => ({ ...h, enable_auto_reply: e.target.checked })))} />
          <span className="text-sm">Ativar resposta automatica fora do expediente</span>
        </label>
        <textarea value={globalConfig.out_of_hours_message || ''} onChange={e => setHours(hours.map(h => ({ ...h, out_of_hours_message: e.target.value })))} placeholder="Mensagem fora do expediente..." className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-20" />

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={globalConfig.enable_bot_outside_hours} onChange={e => setHours(hours.map(h => ({ ...h, enable_bot_outside_hours: e.target.checked })))} />
          <span className="text-sm">Ativar bot fora do expediente</span>
        </label>
      </div>

      <button onClick={save} disabled={saving} className="px-6 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saved && <Check className="w-4 h-4" />}
        {saved ? 'Salvo!' : 'Salvar'}
      </button>
    </div>
  )
}
