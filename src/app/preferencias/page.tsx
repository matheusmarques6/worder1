'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

interface PreferencesData {
  contact: {
    email: string
    first_name: string | null
    last_name: string | null
    email_subscribed: boolean
    sms_subscribed: boolean
    whatsapp_subscribed: boolean
    topics: string[]
  }
  organization: {
    name: string
    from_email: string | null
  }
}

function PreferencesContent() {
  const params = useSearchParams()
  const token = params.get('token')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PreferencesData | null>(null)
  const [emailSub, setEmailSub] = useState(true)
  const [smsSub, setSmsSub] = useState(false)
  const [waSub, setWaSub] = useState(false)
  const [topics, setTopics] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [unsubAll, setUnsubAll] = useState(false)

  const availableTopics = [
    { id: 'promotions', label: 'Promoções e ofertas' },
    { id: 'new_products', label: 'Novos produtos e lançamentos' },
    { id: 'newsletter', label: 'Newsletter e conteúdo' },
    { id: 'order_updates', label: 'Atualizações sobre meus pedidos' },
    { id: 'recommendations', label: 'Recomendações personalizadas' },
  ]

  useEffect(() => {
    if (!token) {
      setError('Link inválido. O token está ausente.')
      setLoading(false)
      return
    }
    fetch(`/api/public/preferences?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) {
          setError(j.error || 'Erro ao carregar preferências')
          return
        }
        setData(j)
        setEmailSub(j.contact.email_subscribed)
        setSmsSub(j.contact.sms_subscribed)
        setWaSub(j.contact.whatsapp_subscribed)
        setTopics(j.contact.topics || [])
      })
      .catch(() => setError('Erro de conexão. Tente novamente.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    if (!token) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/public/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email_subscribed: emailSub,
          sms_subscribed: smsSub,
          whatsapp_subscribed: waSub,
          topics,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Erro ao salvar')
        return
      }
      setSaved(true)
      if (data) {
        setData({ ...data, contact: { ...data.contact, email_subscribed: emailSub, sms_subscribed: smsSub, whatsapp_subscribed: waSub, topics } })
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleUnsubAll = async () => {
    if (!token) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/public/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email_subscribed: false,
          sms_subscribed: false,
          whatsapp_subscribed: false,
          topics: [],
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error || 'Erro')
        return
      }
      setUnsubAll(true)
      setEmailSub(false)
      setSmsSub(false)
      setWaSub(false)
      setTopics([])
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const toggleTopic = (id: string) => {
    setTopics((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Carregando…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Link inválido</h1>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <p className="text-xs text-gray-400 mt-4">Por favor, use o link mais recente em um dos nossos e-mails.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
            <h1 className="text-xl font-semibold text-gray-900">Centro de preferências</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data?.contact.first_name ? `Olá, ${data.contact.first_name}. ` : ''}
              Gerencie como você quer receber comunicações de <strong>{data?.organization.name}</strong>.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              E-mail: <span className="font-mono">{data?.contact.email}</span>
            </p>
          </div>

          {/* Channel subscriptions */}
          <div className="px-6 py-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Canais</h2>

            <Toggle
              checked={emailSub}
              onChange={setEmailSub}
              label="E-mails"
              description="Receber e-mails de marketing, promoções e novidades"
            />
            <Toggle
              checked={smsSub}
              onChange={setSmsSub}
              label="SMS"
              description="Receber mensagens SMS"
            />
            <Toggle
              checked={waSub}
              onChange={setWaSub}
              label="WhatsApp"
              description="Receber mensagens via WhatsApp"
            />
          </div>

          {/* Topics */}
          {emailSub && (
            <div className="px-6 py-5 border-t border-gray-100 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Tipos de conteúdo</h2>
              <p className="text-xs text-gray-500 -mt-1">Selecione os assuntos que você quer receber. Se nenhum for selecionado, você recebe todos.</p>
              <div className="space-y-2">
                {availableTopics.map((t) => (
                  <label key={t.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={topics.includes(t.id)}
                      onChange={() => toggleTopic(t.id)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                    <span className="text-sm text-gray-800">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/30 flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Salvando…' : 'Salvar preferências'}
            </button>
            <button
              onClick={handleUnsubAll}
              disabled={saving}
              className="w-full py-2.5 text-xs text-gray-500 hover:text-red-600 underline transition-colors"
            >
              Cancelar inscrição em todos os canais
            </button>
          </div>

          {/* Feedback */}
          {saved && !unsubAll && (
            <div className="px-6 py-3 bg-emerald-50 border-t border-emerald-200 text-sm text-emerald-700 text-center">
              ✓ Preferências salvas com sucesso
            </div>
          )}
          {unsubAll && (
            <div className="px-6 py-4 bg-amber-50 border-t border-amber-200 text-sm text-amber-800 text-center">
              <p className="font-medium">Você foi descadastrado de todos os canais.</p>
              <p className="text-xs mt-1 text-amber-700">Sentimos sua falta. Você pode voltar a se inscrever quando quiser usando os toggles acima.</p>
            </div>
          )}
          {error && data && (
            <div className="px-6 py-3 bg-red-50 border-t border-red-200 text-sm text-red-700 text-center">
              {error}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Suas preferências serão atualizadas imediatamente. Pode levar alguns minutos para refletir em campanhas já agendadas.
        </p>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 mt-0.5 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${checked ? 'bg-gray-900' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
    </label>
  )
}

export default function PreferencesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">Carregando…</div></div>}>
      <PreferencesContent />
    </Suspense>
  )
}
