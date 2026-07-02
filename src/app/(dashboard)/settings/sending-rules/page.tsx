'use client'

// =============================================
// Sending Rules — org-level Quiet Hours, Frequency Cap,
// Skip Contacts overlap. Klaviyo + Omnisend parity.
// =============================================

import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle, Moon, Hash, Layers } from 'lucide-react'

interface OrgRules {
  quiet_hours_enabled: boolean
  quiet_hours_start: number
  quiet_hours_end: number
  quiet_hours_timezone: string
  max_sends_per_contact_per_day: number
  max_email_per_contact_per_day: number | null
  max_sms_per_contact_per_day: number | null
  max_whatsapp_per_contact_per_day: number | null
  skip_contacts_in_active_flows: boolean
}

const DEFAULTS: OrgRules = {
  quiet_hours_enabled: false,
  quiet_hours_start: 20,
  quiet_hours_end: 8,
  quiet_hours_timezone: 'America/Sao_Paulo',
  max_sends_per_contact_per_day: 0,
  max_email_per_contact_per_day: null,
  max_sms_per_contact_per_day: 3,
  max_whatsapp_per_contact_per_day: null,
  skip_contacts_in_active_flows: false,
}

const TZ_OPTIONS = [
  'America/Sao_Paulo',
  'America/Recife',
  'America/Manaus',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Lisbon',
  'UTC',
]

export default function SendingRulesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [rules, setRules] = useState<OrgRules>(DEFAULTS)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/organization')
        const j = await res.json()
        const o = j.organization || {}
        setRules({
          quiet_hours_enabled: !!o.quiet_hours_enabled,
          quiet_hours_start: o.quiet_hours_start ?? 20,
          quiet_hours_end: o.quiet_hours_end ?? 8,
          quiet_hours_timezone: o.quiet_hours_timezone || 'America/Sao_Paulo',
          max_sends_per_contact_per_day: o.max_sends_per_contact_per_day ?? 0,
          max_email_per_contact_per_day: o.max_email_per_contact_per_day ?? null,
          max_sms_per_contact_per_day: o.max_sms_per_contact_per_day ?? 3,
          max_whatsapp_per_contact_per_day: o.max_whatsapp_per_contact_per_day ?? null,
          skip_contacts_in_active_flows: !!o.skip_contacts_in_active_flows,
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      if (res.ok) setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }

  const update = <K extends keyof OrgRules>(k: K, v: OrgRules[K]) =>
    setRules(r => ({ ...r, [k]: v }))

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Regras de envio</h1>
        <p className="text-sm text-gray-600 mt-1">
          Configurações globais que protegem a entregabilidade — Horário de silêncio, Limite de
          frequência e Pular contatos em fluxos ativos. Aplicam-se a todos os emails enviados por automações.
        </p>
      </header>

      {/* Quiet Hours */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Moon className="w-5 h-5 text-indigo-500 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-medium text-gray-900">Horário de silêncio</h2>
            <p className="text-sm text-gray-500">
              Não envia emails dentro da janela definida. As mensagens ficam em espera e retomam
              automaticamente quando a janela fecha.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={rules.quiet_hours_enabled}
              onChange={(e) => update('quiet_hours_enabled', e.target.checked)}
            />
            <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
        </div>
        {rules.quiet_hours_enabled && (
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Início (hora)</span>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                value={rules.quiet_hours_start}
                onChange={(e) => update('quiet_hours_start', parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Fim (hora)</span>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                value={rules.quiet_hours_end}
                onChange={(e) => update('quiet_hours_end', parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Timezone</span>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                value={rules.quiet_hours_timezone}
                onChange={(e) => update('quiet_hours_timezone', e.target.value)}
              >
                {TZ_OPTIONS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      {/* Frequency Cap */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Hash className="w-5 h-5 text-emerald-500 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-medium text-gray-900">Limite de frequência</h2>
            <p className="text-sm text-gray-500">
              Máximo de mensagens por contato em 24h. Por canal — 0 ou vazio significa sem limite específico do canal.
              Sugestão: 3 SMS/dia.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Total (todos canais)</span>
            <input
              type="number"
              min={0}
              max={50}
              value={rules.max_sends_per_contact_per_day}
              onChange={(e) => update('max_sends_per_contact_per_day', parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              placeholder="0"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">Email/dia</span>
            <input
              type="number"
              min={0}
              max={50}
              value={rules.max_email_per_contact_per_day ?? ''}
              onChange={(e) => update('max_email_per_contact_per_day', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              placeholder="—"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">SMS/dia</span>
            <input
              type="number"
              min={0}
              max={50}
              value={rules.max_sms_per_contact_per_day ?? ''}
              onChange={(e) => update('max_sms_per_contact_per_day', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              placeholder="3"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">WhatsApp/dia</span>
            <input
              type="number"
              min={0}
              max={50}
              value={rules.max_whatsapp_per_contact_per_day ?? ''}
              onChange={(e) => update('max_whatsapp_per_contact_per_day', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
              placeholder="—"
            />
          </label>
        </div>
      </section>

      {/* Skip Contacts */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-purple-500 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-medium text-gray-900">Pular contatos em fluxos ativos</h2>
            <p className="text-sm text-gray-500">
              Quando um contato já está em espera, pendente ou em andamento em outra automação,
              novos disparos para ele são descartados.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={rules.skip_contacts_in_active_flows}
              onChange={(e) => update('skip_contacts_in_active_flows', e.target.checked)}
            />
            <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-sm">
            <CheckCircle className="w-4 h-4" /> Salvo
          </span>
        )}
      </div>
    </div>
  )
}
