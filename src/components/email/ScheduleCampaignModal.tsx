'use client'

// =============================================
// WORDER: Schedule Campaign modal
// /components/email/ScheduleCampaignModal.tsx
//
// Modal elegante pra agendar envio de campanha.
// =============================================

import { useEffect, useState } from 'react'
import { X, Calendar, Clock, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScheduleCampaignModalProps {
  campaignId: string
  currentScheduledAt?: string | null
  onClose: () => void
  onScheduled: () => void
}

export default function ScheduleCampaignModal({
  campaignId,
  currentScheduledAt,
  onClose,
  onScheduled,
}: ScheduleCampaignModalProps) {
  // Default: amanhã às 10:00
  const defaultDate = (() => {
    if (currentScheduledAt) return new Date(currentScheduledAt)
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return d
  })()

  const [date, setDate] = useState(defaultDate.toISOString().slice(0, 10))
  const [time, setTime] = useState(defaultDate.toTimeString().slice(0, 5))
  // Três modos de "quando sai", mutuamente exclusivos — os dois
  // últimos disputam a mesma decisão, então marcar um desmarca o outro
  // (é o que o backend também impõe, para o envio nunca ficar ambíguo).
  //   fixed     — todo mundo no mesmo instante
  //   recipient — o horário escolhido vale no fuso de CADA contato
  //   smart     — cada contato na hora em que costuma abrir
  const [sendMode, setSendMode] = useState<'fixed' | 'recipient' | 'smart'>('fixed')
  const smartSendTime = sendMode === 'smart'
  const [saving, setSaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quanto da base tem fuso conhecido. Sem esse número o lojista
  // escolhe "no fuso de cada contato" achando que vale para todos,
  // quando na prática a maioria pode cair no fuso da loja.
  const [coverage, setCoverage] = useState<{ coverage: number; withTimezone: number; total: number } | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/contacts/timezone-coverage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d && typeof d.coverage === 'number') setCoverage(d) })
      .catch(() => { /* informativo: a tela funciona sem isso */ })
    return () => { vivo = false }
  }, [])

  const scheduledDate = new Date(`${date}T${time}:00`)
  const isValid = !isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now() - 60_000

  const handleSchedule = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/email/campaigns/${campaignId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: scheduledDate.toISOString(),
          send_time_optimization: smartSendTime,
          timezone_mode: sendMode === 'recipient' ? 'recipient' : 'fixed',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erro ao agendar')
        return
      }
      onScheduled()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Erro ao agendar')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancelar o agendamento desta campanha?')) return
    setCanceling(true)
    try {
      const res = await fetch(`/api/email/campaigns/${campaignId}/schedule`, { method: 'DELETE' })
      if (res.ok) {
        onScheduled()
        onClose()
      }
    } finally {
      setCanceling(false)
    }
  }

  // Preset shortcuts
  const presets = [
    { label: 'Em 1 hora', getDate: () => { const d = new Date(); d.setHours(d.getHours() + 1); return d } },
    { label: 'Amanhã 9h', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
    { label: 'Amanhã 10h', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d } },
    { label: 'Próxima terça 10h', getDate: () => { const d = new Date(); const daysUntil = (9 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + daysUntil); d.setHours(10, 0, 0, 0); return d } },
  ]

  const applyPreset = (getDate: () => Date) => {
    const d = getDate()
    setDate(d.toISOString().slice(0, 10))
    setTime(d.toTimeString().slice(0, 5))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {currentScheduledAt ? 'Reagendar envio' : 'Agendar envio'}
              </h3>
              <p className="text-xs text-gray-500">Sua campanha será enviada automaticamente.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Presets */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Atalhos</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.getDate)}
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-lg transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Data</label>
              <div className="relative mt-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hora</label>
              <div className="relative mt-1">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Como o horário escolhido é interpretado. Os três modos
              decidem a mesma coisa, então são excludentes. */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Como enviar
            </label>
            {([
              {
                id: 'fixed' as const,
                titulo: 'No horário marcado',
                desc: 'Todo mundo recebe no mesmo instante, no seu horário.',
                selo: null,
              },
              {
                id: 'recipient' as const,
                titulo: 'No fuso de cada contato',
                desc: `Cada pessoa recebe às ${time} do relógio DELA. Quem está mais a leste recebe antes; a campanha acompanha o dia pelo mundo.`,
                selo: 'Fuso',
              },
              {
                id: 'smart' as const,
                titulo: 'Send-Time Optimization',
                desc: 'Cada contato recebe na hora em que ele costuma abrir e-mail, aprendida do histórico de aberturas.',
                selo: 'Smart',
              },
            ]).map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  'flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-colors',
                  sendMode === opt.id
                    ? 'border-orange-500 bg-orange-50/50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <input
                  type="radio"
                  name="send-mode"
                  checked={sendMode === opt.id}
                  onChange={() => setSendMode(opt.id)}
                  className="mt-0.5 w-4 h-4 accent-orange-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {opt.titulo}
                    {opt.selo && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 rounded">
                        {opt.selo}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{opt.desc}</p>
                </div>
              </label>
            ))}
            {sendMode === 'recipient' && (
              <div className="text-xs text-gray-500 leading-snug px-1 space-y-1">
                <p>
                  Contatos sem fuso conhecido recebem no fuso da loja. O fuso é
                  aprendido quando a pessoa navega na loja, ou deduzido do país
                  do endereço.
                </p>
                {coverage && (
                  <p className={cn('font-medium', coverage.coverage < 30 ? 'text-amber-700' : 'text-gray-600')}>
                    {coverage.withTimezone.toLocaleString('pt-BR')} de{' '}
                    {coverage.total.toLocaleString('pt-BR')} contatos ({coverage.coverage}%) têm
                    fuso conhecido hoje
                    {coverage.coverage < 30 && ' — o resto vai pelo fuso da loja'}.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Será enviada em</p>
            <p className="text-gray-900 font-medium">
              {scheduledDate.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              {sendMode === 'smart'
                ? `~${scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (horário otimizado por contato)`
                : sendMode === 'recipient'
                  ? `às ${scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} no fuso de cada contato`
                  : `às ${scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>

          {!isValid && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Escolha uma data e hora no futuro.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {currentScheduledAt ? (
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {canceling ? 'Cancelando...' : 'Cancelar agendamento'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
            >
              Voltar
            </button>
            <button
              onClick={handleSchedule}
              disabled={saving || !isValid}
              className={cn(
                'px-4 py-2 text-sm font-semibold rounded-lg inline-flex items-center gap-2',
                isValid && !saving
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {currentScheduledAt ? 'Reagendar' : 'Agendar envio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
