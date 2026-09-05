'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Check, Mail, Users, FileText, Send, Loader2, Clock,
  AlertCircle, Sparkles, Eye, ChevronRight, Plus,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore, useAuthStore } from '@/stores'
import ABTestPanel, { type ABTestConfig } from '@/components/email/ABTestPanel'
import SmartSendingPanel, { type SmartSendingConfig } from '@/components/email/SmartSendingPanel'
import UtmPanel from '@/components/email/UtmPanel'
import InboxPreview from '@/components/email/InboxPreview'
import { normalizeMessageUtmConfig, type MessageUtmConfig } from '@/lib/tracking/link-params'

interface Template {
  id: string
  name: string
  category?: string
  thumbnail_url?: string
  updated_at?: string
}

interface SegmentOption {
  id: string
  name: string
  count: number
  description?: string
}

type StepId = 'settings' | 'template' | 'audience' | 'review'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'settings', label: 'Configurações' },
  { id: 'template', label: 'Template' },
  { id: 'audience', label: 'Destinatários' },
  { id: 'review', label: 'Revisar' },
]

const fmt = (n: number) =>
  !n || isNaN(n) ? '0' : new Intl.NumberFormat('pt-BR').format(n)

export default function NewCampaignPage() {
  const router = useRouter()
  const { currentStore } = useStoreStore()
  const { user } = useAuthStore()
  const [step, setStep] = useState<StepId>('settings')
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState('')

  // Settings
  const [subject, setSubject] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [showReplyTo, setShowReplyTo] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [name, setName] = useState('')

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateTab, setTemplateTab] = useState<'all' | 'saved'>('all')

  // Audience
  const [recipientType, setRecipientType] = useState<'all' | 'segment'>('all')
  const [selectedSegments, setSelectedSegments] = useState<string[]>([])
  const [segments, setSegments] = useState<SegmentOption[]>([])
  const [segmentsLoading, setSegmentsLoading] = useState(true)
  const [totalSubscribers, setTotalSubscribers] = useState<number | null>(null)
  const [segmentSearch, setSegmentSearch] = useState('')

  // A/B + Smart
  const [abConfig, setAbConfig] = useState<ABTestConfig>({
    enabled: false, percent: 50, variantB: null,
    winner_metric: 'open_rate', duration_hours: 4,
  })
  const [smartConfig, setSmartConfig] = useState<SmartSendingConfig>({
    smartSendingEnabled: true, smartSendingHours: 16,
    skipUnengaged: false, skipUnengagedDays: 120,
    sendTimeOptimization: false,
  })
  // UTM desta campanha (sobrescreve o padrão da loja só aqui).
  const [utmConfig, setUtmConfig] = useState<MessageUtmConfig>({})

  // Send
  const [sendType, setSendType] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')

  // ─── Data fetching ───
  const fetchTemplates = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (currentStore?.id) p.set('store_id', currentStore.id)
      const r = await fetch(`/api/email/templates?${p}`)
      if (r.ok) { const d = await r.json(); setTemplates(d.templates || []) }
    } catch {}
  }, [currentStore?.id])

  const fetchSegments = useCallback(async () => {
    if (!user?.organization_id) return
    setSegmentsLoading(true)
    try {
      const p = new URLSearchParams({
        organization_id: user.organization_id,
        include_count: 'true',
        active_only: 'true',
      })
      if (currentStore?.id) p.set('store_id', currentStore.id)
      const r = await fetch(`/api/segments?${p}`)
      if (r.ok) {
        const d = await r.json()
        setSegments(
          (d.segments || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            count: s.contact_count || 0,
            description: s.description || undefined,
          })),
        )
      }
    } catch {} finally { setSegmentsLoading(false) }
  }, [currentStore?.id, user?.organization_id])

  const fetchSubscriberCount = useCallback(async () => {
    if (!user?.organization_id) return
    try {
      const p = new URLSearchParams({
        organization_id: user.organization_id,
        subscribed_only: 'true',
      })
      if (currentStore?.id) p.set('store_id', currentStore.id)
      const r = await fetch(`/api/contacts/count?${p}`)
      if (r.ok) { const d = await r.json(); setTotalSubscribers(d.count ?? 0) }
    } catch {}
  }, [currentStore?.id, user?.organization_id])

  useEffect(() => {
    fetchTemplates()
    fetchSegments()
    fetchSubscriberCount()
    fetch('/api/settings/organization')
      .then((r) => r.json())
      .then((d) => {
        const s = d?.organization?.email_settings || {}
        if (!senderName && s.default_sender_name) setSenderName(s.default_sender_name)
        if (!senderEmail && s.default_sender_email) setSenderEmail(s.default_sender_email)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTemplates, fetchSegments, fetchSubscriberCount])

  useEffect(() => {
    if (step === 'audience') fetchSegments()
  }, [step, fetchSegments])

  // ─── Derived ───
  const tplObj = templates.find((t) => t.id === selectedTemplate)
  const selSegObjs = segments.filter((s) => selectedSegments.includes(s.id))
  const estimated =
    recipientType === 'all'
      ? totalSubscribers ?? 0
      : selSegObjs.reduce((a, s) => a + (s.count || 0), 0)
  const stepIdx = STEPS.findIndex((s) => s.id === step)

  const canProceed = () => {
    switch (step) {
      case 'settings': return !!(subject.trim() && senderName.trim() && senderEmail.trim())
      case 'template': return !!selectedTemplate
      case 'audience': return recipientType === 'all' || selectedSegments.length > 0
      case 'review': return sendType === 'now' || !!scheduledAt
      default: return false
    }
  }

  const goNext = () => { if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1].id) }
  const goBack = () => { if (stepIdx > 0) setStep(STEPS[stepIdx - 1].id) }

  const handleSendTest = async () => {
    if (!selectedTemplate) return
    setSendingTest(true)
    try {
      await fetch('/api/email/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate, subject,
          sender_name: senderName, from_email: senderEmail,
        }),
      })
    } catch {} finally { setSendingTest(false) }
  }

  const handleSubmit = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/email/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || subject,
          subject, preview_text: previewText,
          template_id: selectedTemplate,
          recipient_type: recipientType,
          segment_id: recipientType === 'segment' && selectedSegments.length > 0
            ? selectedSegments[0] : null,
          sender_name: senderName, from_email: senderEmail,
          reply_to: replyTo || null,
          store_id: currentStore?.id || null,
          scheduled_at: sendType === 'schedule' ? scheduledAt : null,
          ab_test_enabled: abConfig.enabled,
          ab_test_percent: abConfig.percent,
          ab_variant_b: abConfig.enabled ? abConfig.variantB : null,
          ab_winner_metric: abConfig.winner_metric,
          ab_duration_hours: abConfig.duration_hours,
          smart_sending_enabled: smartConfig.smartSendingEnabled,
          smart_sending_hours: smartConfig.smartSendingHours,
          skip_unengaged: smartConfig.skipUnengaged,
          skip_unengaged_days: smartConfig.skipUnengagedDays,
          send_time_optimization: smartConfig.sendTimeOptimization,
          utm: normalizeMessageUtmConfig(utmConfig),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erro ao criar campanha')
      }
      const data = await res.json()
      const cid = data.campaign?.id || data.id
      if (sendType === 'now') {
        const sr = await fetch('/api/email/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: cid }),
        })
        if (!sr.ok) {
          const d = await sr.json().catch(() => ({}))
          throw new Error(d.error || 'Erro ao enviar')
        }
      }
      router.push('/email/campaigns')
    } catch (err: any) {
      setError(err.message || 'Erro ao criar campanha')
    } finally { setSaving(false) }
  }

  // ─── Primary CTA label per step ───
  const primaryLabel = () => {
    if (step === 'review') {
      if (saving) return sendType === 'now' ? 'Enviando…' : 'Agendando…'
      return sendType === 'now' ? 'Enviar agora' : 'Agendar campanha'
    }
    if (step === 'settings') return 'Escolher template'
    if (step === 'template') return 'Escolher destinatários'
    return 'Revisar campanha'
  }

  // ─── Filtered segments for audience step ───
  const filteredSegments = segmentSearch.trim()
    ? segments.filter((s) => s.name.toLowerCase().includes(segmentSearch.toLowerCase()))
    : segments

  return (
    <div className="fixed inset-0 bg-white z-40 flex flex-col">
      {/* ═══ TOP BAR ═══ */}
      <header className="h-14 border-b border-gray-200 bg-white flex items-center px-5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-white" />
        </div>
        {name && (
          <span className="ml-3 text-sm font-medium text-gray-900 truncate max-w-[140px]">
            {name}
          </span>
        )}
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => i <= stepIdx && setStep(s.id)}
                disabled={i > stepIdx}
                className={`px-1.5 py-1 rounded transition-colors whitespace-nowrap ${
                  s.id === step
                    ? 'font-semibold text-gray-900'
                    : i < stepIdx
                    ? 'text-gray-600 hover:text-gray-900 cursor-pointer'
                    : 'text-gray-400 cursor-default'
                }`}
              >
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              )}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => router.push('/email/campaigns')}
          className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {step === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-8">Configurações de email</h1>
                <div className="space-y-5">
                  <FormField label="Linha de assunto">
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Ex.: Ofertas imperdíveis de Black Friday"
                      maxLength={200}
                      className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                    />
                    <p className={`text-xs mt-1 ${subject.length > 60 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {subject.length}/60 caracteres — ideal manter abaixo de 60 para mobile
                    </p>
                  </FormField>

                  <FormField label="Nome do remetente">
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Sua Loja"
                      className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                    />
                  </FormField>

                  <FormField label="Email do remetente">
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="contato@minhaloja.com"
                      className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                    />
                  </FormField>

                  {!showReplyTo ? (
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setShowReplyTo(true)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        Receber respostas em outro endereço
                      </span>
                    </label>
                  ) : (
                    <FormField label="Responder para">
                      <input
                        type="email"
                        value={replyTo}
                        onChange={(e) => setReplyTo(e.target.value)}
                        placeholder="respostas@minhaloja.com"
                        className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                      />
                    </FormField>
                  )}

                  <FormField label="Preheader" hint="Texto curto que aparece após o assunto na caixa de entrada">
                    <input
                      type="text"
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder="Confira as novidades…"
                      maxLength={150}
                      className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                    />
                    <p className="text-xs text-gray-400 mt-1">{previewText.length}/150 caracteres</p>
                  </FormField>

                  <FormField label="Nome da campanha" hint="Nome interno, opcional">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Black Friday 2026"
                      className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
                    />
                  </FormField>
                </div>
              </div>

              <div className="hidden lg:block sticky top-6 self-start">
                <InboxPreview senderName={senderName} subject={subject} preheader={previewText} />
              </div>
            </div>
          )}

          {step === 'template' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Escolha um template</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Selecione um modelo profissional ou use um template que você já criou.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 border-b border-gray-200 mb-6">
                <button
                  type="button"
                  onClick={() => setTemplateTab('all')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    templateTab === 'all'
                      ? 'border-brand-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateTab('saved')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    templateTab === 'saved'
                      ? 'border-brand-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Meus templates
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">Nenhum template disponível</p>
                  <p className="text-sm text-gray-500 mb-5">
                    Crie seu primeiro template de email para usar nesta campanha.
                  </p>
                  <Link
                    href="/email/templates/new"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Criar template
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {templates
                    .filter((t) => templateTab === 'all' || t.category === 'saved' || t.updated_at)
                    .map((t) => {
                      const sel = selectedTemplate === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTemplate(t.id)}
                          className={`group relative bg-white rounded-xl border-2 overflow-hidden text-left transition-all ${
                            sel
                              ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="aspect-[4/5] bg-gray-100 overflow-hidden relative">
                            {t.thumbnail_url ? (
                              <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText className="w-10 h-10 text-gray-300" />
                              </div>
                            )}
                            {sel && (
                              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shadow-sm">
                                <Check className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="p-3.5">
                            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                            {t.category && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">{t.category}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {step === 'audience' && (
            <div className="max-w-2xl mx-auto">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Escolha os destinatários</h1>
              <p className="text-sm text-gray-500 mb-6">
                Envie para toda a base inscrita ou selecione um segmento específico.
              </p>

              <div className="space-y-3 mb-6">
                <RadioCard
                  active={recipientType === 'all'}
                  onClick={() => { setRecipientType('all'); setSelectedSegments([]) }}
                  title="Todos os inscritos"
                  desc={totalSubscribers
                    ? `Enviar para ${fmt(totalSubscribers)} contatos inscritos`
                    : 'Enviar para toda a base inscrita'}
                />
                <RadioCard
                  active={recipientType === 'segment'}
                  onClick={() => setRecipientType('segment')}
                  title="Selecionar segmento"
                  desc="Envie apenas para contatos de um segmento específico"
                />
              </div>

              {recipientType === 'segment' && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enviar para
                  </label>

                  <div className="relative mb-3">
                    <input
                      type="text"
                      value={segmentSearch}
                      onChange={(e) => setSegmentSearch(e.target.value)}
                      placeholder="Buscar segmentos…"
                      className="w-full border border-gray-300 rounded-lg pl-3.5 pr-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                  </div>

                  {segmentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : filteredSegments.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 mb-3">
                        {segmentSearch ? 'Nenhum segmento encontrado' : 'Nenhum segmento criado'}
                      </p>
                      <Link
                        href="/segments/new"
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        <Plus className="w-4 h-4" />
                        Criar segmento
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {filteredSegments.map((seg) => {
                        const sel = selectedSegments.includes(seg.id)
                        return (
                          <button
                            key={seg.id}
                            type="button"
                            onClick={() => setSelectedSegments(sel ? [] : [seg.id])}
                            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-left transition-colors ${
                              sel
                                ? 'bg-brand-50 border border-brand-200'
                                : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              sel ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                            }`}>
                              {sel && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{seg.name}</p>
                              {seg.description && (
                                <p className="text-xs text-gray-500 truncate">{seg.description}</p>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
                              {fmt(seg.count)} contatos
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs">
                    <Link
                      href="/segments/new"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Criar novo segmento
                    </Link>
                    {selectedSegments.length > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <Link
                          href={`/segments/${selectedSegments[0]}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver segmento
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              )}

              {estimated > 0 && (
                <div className="mt-6 flex items-center gap-3 p-4 bg-brand-50/60 border border-brand-200 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{fmt(estimated)}</p>
                    <p className="text-xs text-gray-600">contatos receberão esta campanha</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="max-w-3xl mx-auto">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Revisar e confirmar</h1>

              {/* Settings */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Configurações</p>
                  <button
                    type="button"
                    onClick={() => setStep('settings')}
                    className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                  >
                    Editar configurações
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-900">{name || subject}</p>
                <p className="text-sm text-gray-600 mt-0.5">{senderName} &lt;{senderEmail}&gt;</p>
              </div>

              {/* Recipients */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Destinatários</p>
                  <button
                    type="button"
                    onClick={() => setStep('audience')}
                    className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                  >
                    Editar destinatários
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {recipientType === 'all'
                    ? 'Todos os inscritos'
                    : selSegObjs.map((s) => s.name).join(', ') || '—'}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Campanha será enviada para {fmt(estimated)} contatos
                </p>
              </div>

              {/* A/B + Smart Sending */}
              <ABTestPanel
                variantA={{ subject, preheader: previewText }}
                config={abConfig}
                onChange={setAbConfig}
              />
              <div className="mt-4">
                <SmartSendingPanel config={smartConfig} onChange={setSmartConfig} />
              </div>
              <div className="mt-4">
                <UtmPanel
                  storeId={currentStore?.id || null}
                  campaignName={name || subject}
                  subject={subject}
                  value={utmConfig}
                  onChange={setUtmConfig}
                />
              </div>

              {/* Send */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Enviar</p>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sendType === 'now' ? 'border-brand-500 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="sendType"
                      checked={sendType === 'now'}
                      onChange={() => setSendType('now')}
                      className="w-4 h-4 text-brand-500 focus:ring-brand-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-900">Enviar agora</span>
                  </label>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sendType === 'schedule' ? 'border-brand-500 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="sendType"
                      checked={sendType === 'schedule'}
                      onChange={() => setSendType('schedule')}
                      className="w-4 h-4 text-brand-500 focus:ring-brand-500 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-900">Agendar para depois</span>
                  </label>
                </div>
                {sendType === 'schedule' && (
                  <div className="mt-3 ml-7">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="h-14 border-t border-gray-200 bg-white px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {step !== 'settings' && (
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (subject.trim() || name.trim()) {
                try {
                  await fetch('/api/email/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: name || subject || 'Rascunho',
                      subject, preview_text: previewText,
                      template_id: selectedTemplate || null,
                      recipient_type: recipientType,
                      segment_id: recipientType === 'segment' && selectedSegments.length > 0
                        ? selectedSegments[0] : null,
                      sender_name: senderName, from_email: senderEmail,
                      reply_to: replyTo || null,
                      store_id: currentStore?.id || null,
                      status: 'draft',
                      utm: normalizeMessageUtmConfig(utmConfig),
                    }),
                  })
                } catch {}
              }
              router.push('/email/campaigns')
            }}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Salvar e fechar
          </button>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600 mr-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </span>
          )}
          {step === 'review' && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sendingTest || !selectedTemplate}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {sendingTest ? 'Enviando…' : 'Enviar teste'}
            </button>
          )}
          {step !== 'review' ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {primaryLabel()}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canProceed()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {primaryLabel()}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

// ─── Shared components ───

function FormField({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
    </div>
  )
}

function RadioCard({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 border rounded-xl text-left transition-all ${
        active
          ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/20'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
        active ? 'border-brand-500' : 'border-gray-300'
      }`}>
        {active && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </button>
  )
}
