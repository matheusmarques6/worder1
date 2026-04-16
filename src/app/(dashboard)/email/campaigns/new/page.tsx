'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  X,
  Check,
  Mail,
  Users,
  FileText,
  Send,
  Loader2,
  Clock,
  AlertCircle,
  Sparkles,
  Eye,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore, useAuthStore } from '@/stores'
import ABTestPanel, { type ABTestConfig } from '@/components/email/ABTestPanel'
import SmartSendingPanel, { type SmartSendingConfig } from '@/components/email/SmartSendingPanel'
import SegmentSelector, { type SegmentOption } from '@/components/email/SegmentSelector'
import InboxPreview from '@/components/email/InboxPreview'

interface Template {
  id: string
  name: string
  category?: string
  thumbnail_url?: string
  updated_at?: string
}

type StepId = 'settings' | 'template' | 'audience' | 'review'

const steps: { id: StepId; label: string; icon: any }[] = [
  { id: 'settings', label: 'Configurações de email', icon: Mail },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'audience', label: 'Destinatários', icon: Users },
  { id: 'review', label: 'Revisar', icon: Send },
]

const formatNumber = (n: number) =>
  !n || isNaN(n) ? '0' : new Intl.NumberFormat('pt-BR').format(n)

export default function NewCampaignPage() {
  const router = useRouter()
  const { currentStore } = useStoreStore()
  const { user } = useAuthStore()
  const [currentStep, setCurrentStep] = useState<StepId>('settings')
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState('')

  // Settings
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])

  // Audience
  const [recipientType, setRecipientType] = useState<'all' | 'segment'>('all')
  const [selectedSegments, setSelectedSegments] = useState<string[]>([])
  const [segments, setSegments] = useState<SegmentOption[]>([])
  const [segmentsLoading, setSegmentsLoading] = useState(true)
  const [totalSubscribers, setTotalSubscribers] = useState<number | null>(null)

  // A/B
  const [abConfig, setAbConfig] = useState<ABTestConfig>({
    enabled: false,
    percent: 50,
    variantB: null,
    winner_metric: 'open_rate',
    duration_hours: 4,
  })

  // Smart Sending
  const [smartConfig, setSmartConfig] = useState<SmartSendingConfig>({
    smartSendingEnabled: true,
    smartSendingHours: 16,
    skipUnengaged: false,
    skipUnengagedDays: 120,
    sendTimeOptimization: false,
  })

  // Review
  const [sendType, setSendType] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/email/templates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch {}
  }, [currentStore?.id])

  const fetchSegments = useCallback(async () => {
    if (!user?.organization_id) return
    setSegmentsLoading(true)
    try {
      const params = new URLSearchParams({
        organization_id: user.organization_id,
        include_count: 'true',
        active_only: 'true',
      })
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/segments?${params}`)
      if (res.ok) {
        const data = await res.json()
        const mapped: SegmentOption[] = (data.segments || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          count: s.contact_count || 0,
          description: s.description || undefined,
        }))
        setSegments(mapped)
      }
    } catch {} finally {
      setSegmentsLoading(false)
    }
  }, [currentStore?.id, user?.organization_id])

  const fetchSubscriberCount = useCallback(async () => {
    if (!user?.organization_id) return
    try {
      const params = new URLSearchParams({
        organization_id: user.organization_id,
        subscribed_only: 'true',
      })
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/contacts/count?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTotalSubscribers(data.count ?? 0)
      }
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
  }, [fetchTemplates, fetchSegments, fetchSubscriberCount])

  // Refetch segments on every audience step visit (catches new/edited segments)
  useEffect(() => {
    if (currentStep === 'audience') fetchSegments()
  }, [currentStep, fetchSegments])

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate)
  const selectedSegmentObjs = segments.filter((s) => selectedSegments.includes(s.id))
  const estimatedRecipients =
    recipientType === 'all'
      ? totalSubscribers ?? 0
      : selectedSegmentObjs.reduce((sum, s) => sum + (s.count || 0), 0)

  const canProceed = () => {
    switch (currentStep) {
      case 'settings':
        return (
          name.trim() &&
          subject.trim() &&
          senderName.trim() &&
          senderEmail.trim()
        )
      case 'template':
        return Boolean(selectedTemplate)
      case 'audience':
        return recipientType === 'all' || selectedSegments.length > 0
      case 'review':
        return sendType === 'now' || Boolean(scheduledAt)
      default:
        return false
    }
  }

  const goNext = () => {
    const idx = steps.findIndex((s) => s.id === currentStep)
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1].id)
  }
  const goBack = () => {
    const idx = steps.findIndex((s) => s.id === currentStep)
    if (idx > 0) setCurrentStep(steps[idx - 1].id)
  }

  const handleSendTest = async () => {
    if (!selectedTemplate) return
    setSendingTest(true)
    try {
      await fetch('/api/email/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          subject,
          sender_name: senderName,
          from_email: senderEmail,
        }),
      })
    } catch {} finally {
      setSendingTest(false)
    }
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const createRes = await fetch('/api/email/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          preview_text: previewText,
          template_id: selectedTemplate,
          recipient_type: recipientType,
          segment_id:
            recipientType === 'segment' && selectedSegments.length > 0
              ? selectedSegments[0]
              : null,
          sender_name: senderName,
          from_email: senderEmail,
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
        }),
      })
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao criar campanha')
      }
      const data = await createRes.json()
      const campaignId = data.campaign?.id || data.id
      if (sendType === 'now') {
        const sendRes = await fetch('/api/email/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaignId }),
        })
        if (!sendRes.ok) {
          const d = await sendRes.json().catch(() => ({}))
          throw new Error(d.error || 'Erro ao enviar campanha')
        }
      }
      router.push('/email/campaigns')
    } catch (err: any) {
      setError(err.message || 'Erro ao criar campanha')
    } finally {
      setSaving(false)
    }
  }

  const currentIdx = steps.findIndex((s) => s.id === currentStep)

  return (
    <div className="fixed inset-0 bg-white z-40 flex flex-col">
      {/* Top bar: breadcrumb + close */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <nav className="flex items-center gap-1.5 text-sm">
            {steps.map((step, i) => {
              const isActive = step.id === currentStep
              const isCompleted = i < currentIdx
              return (
                <div key={step.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      // Allow jumping to previous or same step, not future ones
                      if (i <= currentIdx) setCurrentStep(step.id)
                    }}
                    disabled={i > currentIdx}
                    className={`px-2 py-1 rounded transition-colors ${
                      isActive
                        ? 'font-semibold text-gray-900'
                        : isCompleted
                        ? 'text-gray-600 hover:text-gray-900'
                        : 'text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {step.label}
                  </button>
                  {i < steps.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => router.push('/email/campaigns')}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="max-w-6xl mx-auto px-6 py-8"
          >
            {currentStep === 'settings' && (
              <SettingsStep
                name={name}
                setName={setName}
                subject={subject}
                setSubject={setSubject}
                previewText={previewText}
                setPreviewText={setPreviewText}
                senderName={senderName}
                setSenderName={setSenderName}
                senderEmail={senderEmail}
                setSenderEmail={setSenderEmail}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
              />
            )}

            {currentStep === 'template' && (
              <TemplateStep
                templates={templates}
                selected={selectedTemplate}
                onSelect={setSelectedTemplate}
              />
            )}

            {currentStep === 'audience' && (
              <AudienceStep
                recipientType={recipientType}
                setRecipientType={setRecipientType}
                segments={segments}
                segmentsLoading={segmentsLoading}
                selectedSegments={selectedSegments}
                setSelectedSegments={setSelectedSegments}
                totalSubscribers={totalSubscribers ?? 0}
                estimatedRecipients={estimatedRecipients}
              />
            )}

            {currentStep === 'review' && (
              <ReviewStep
                name={name}
                subject={subject}
                previewText={previewText}
                senderName={senderName}
                senderEmail={senderEmail}
                selectedTemplateName={selectedTemplateObj?.name}
                recipientType={recipientType}
                selectedSegmentObjs={selectedSegmentObjs}
                estimatedRecipients={estimatedRecipients}
                sendType={sendType}
                setSendType={setSendType}
                scheduledAt={scheduledAt}
                setScheduledAt={setScheduledAt}
                abConfig={abConfig}
                setAbConfig={setAbConfig}
                smartConfig={smartConfig}
                setSmartConfig={setSmartConfig}
                onEditStep={setCurrentStep}
                subject1={subject}
                preheader1={previewText}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {currentStep !== 'settings' && (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600 mr-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </span>
          )}
          {currentStep === 'template' && selectedTemplate && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sendingTest}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar teste
            </button>
          )}
          {currentStep !== 'review' ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {currentStep === 'settings'
                ? 'Escolher template'
                : currentStep === 'template'
                ? 'Escolher destinatários'
                : 'Revisar campanha'}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canProceed()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {sendType === 'now' ? 'Enviando…' : 'Agendando…'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {sendType === 'now' ? 'Enviar agora' : 'Agendar campanha'}
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

// ─────────── SETTINGS STEP ───────────

function SettingsStep({
  name, setName, subject, setSubject, previewText, setPreviewText,
  senderName, setSenderName, senderEmail, setSenderEmail, replyTo, setReplyTo,
}: any) {
  const [showReplyTo, setShowReplyTo] = useState(Boolean(replyTo))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,440px] gap-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Configurações de email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Defina o assunto, remetente e preheader da sua campanha.
          </p>
        </div>

        <Field label="Linha de assunto" required>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: Ofertas imperdíveis de Black Friday"
            className="input"
            maxLength={200}
          />
          <HelpLine muted>
            {subject.length}/100 caracteres — ideal manter abaixo de 60 para mobile
          </HelpLine>
        </Field>

        <Field label="Nome do remetente" required>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Ex: Minha Loja"
            className="input"
          />
        </Field>

        <Field label="Email do remetente" required>
          <input
            type="email"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="contato@minhaloja.com"
            className="input"
          />
          <HelpLine muted>
            Use um domínio verificado em{' '}
            <Link href="/settings/email" className="text-brand-600 hover:underline">
              Configurações de Email
            </Link>
            .
          </HelpLine>
        </Field>

        {!showReplyTo ? (
          <button
            type="button"
            onClick={() => setShowReplyTo(true)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            + Receber respostas em outro endereço
          </button>
        ) : (
          <Field label="Responder para">
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="respostas@minhaloja.com"
              className="input"
            />
          </Field>
        )}

        <Field label="Preheader" hint="(opcional)">
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Texto curto que aparece após o assunto na caixa de entrada"
            className="input"
            maxLength={150}
          />
          <HelpLine muted>
            {previewText.length}/150 caracteres
          </HelpLine>
        </Field>

        <Field label="Nome da campanha" required hint="(uso interno)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Black Friday 2026"
            className="input"
          />
          <HelpLine muted>
            Usado apenas para identificar a campanha no painel.
          </HelpLine>
        </Field>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <InboxPreview
          senderName={senderName}
          subject={subject}
          preheader={previewText}
        />
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: #111827;
          background-color: #fff;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input::placeholder { color: #9ca3af; }
        .input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
        }
      `}</style>
    </div>
  )
}

function Field({
  label, required, hint, children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-gray-400 font-normal ml-1.5">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function HelpLine({ muted, children }: { muted?: boolean; children: React.ReactNode }) {
  return (
    <p className={`text-xs mt-1.5 ${muted ? 'text-gray-500' : 'text-gray-700'}`}>
      {children}
    </p>
  )
}

// ─────────── TEMPLATE STEP ───────────

function TemplateStep({
  templates, selected, onSelect,
}: {
  templates: Template[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Escolha um template</h1>
        <p className="text-sm text-gray-500 mt-1">
          Comece com um modelo pronto ou selecione um template que você já criou.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-1">Nenhum template disponível</p>
          <p className="text-sm text-gray-500 mb-4">
            Crie seu primeiro template de email para usar nesta campanha.
          </p>
          <Link
            href="/email/templates/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
          >
            <Sparkles className="w-4 h-4" />
            Criar template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const isSelected = selected === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`group relative bg-white rounded-xl border-2 overflow-hidden text-left transition-all ${
                  isSelected
                    ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="aspect-[4/5] bg-gray-100 overflow-hidden">
                  {t.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.thumbnail_url}
                      alt={t.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                    {t.category && (
                      <p className="text-xs text-gray-500 truncate">{t.category}</p>
                    )}
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-brand-500 text-white'
                        : 'border border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────── AUDIENCE STEP ───────────

function AudienceStep({
  recipientType, setRecipientType, segments, segmentsLoading,
  selectedSegments, setSelectedSegments, totalSubscribers, estimatedRecipients,
}: any) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Escolha os destinatários</h1>
        <p className="text-sm text-gray-500 mt-1">
          Envie para toda a base inscrita ou selecione um segmento específico.
        </p>
      </div>

      <div className="space-y-3">
        <AudienceOption
          active={recipientType === 'all'}
          onClick={() => {
            setRecipientType('all')
            setSelectedSegments([])
          }}
          label="Todos os inscritos"
          description={
            totalSubscribers
              ? `Enviar para ${formatNumber(totalSubscribers)} contatos inscritos`
              : 'Enviar para toda a base inscrita'
          }
        />
        <AudienceOption
          active={recipientType === 'segment'}
          onClick={() => setRecipientType('segment')}
          label="Selecionar segmentos"
          description="Envie apenas para contatos que atendem às condições de um segmento"
        />
      </div>

      {recipientType === 'segment' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Enviar para
            </label>
            <SegmentSelector
              segments={segments}
              value={selectedSegments}
              onChange={setSelectedSegments}
              mode="single"
              loading={segmentsLoading}
              placeholder="Escolha um segmento…"
            />
          </div>
          {selectedSegments.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Link
                href={`/segments/${selectedSegments[0]}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
              >
                <Eye className="w-3.5 h-3.5" />
                Ver segmento
              </Link>
              <span>·</span>
              <Link
                href="/segments/new"
                target="_blank"
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                Criar novo
              </Link>
            </div>
          )}
        </div>
      )}

      {(recipientType === 'all' ? totalSubscribers : estimatedRecipients) > 0 && (
        <div className="flex items-center gap-3 p-4 bg-brand-50/50 border border-brand-200 rounded-lg">
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">
              {formatNumber(
                recipientType === 'all' ? totalSubscribers : estimatedRecipients
              )}
            </p>
            <p className="text-xs text-gray-600">contatos estimados receberão esta campanha</p>
          </div>
        </div>
      )}
    </div>
  )
}

function AudienceOption({ active, onClick, label, description }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-4 border rounded-xl text-left transition-all ${
        active
          ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/10'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
          active ? 'border-brand-500' : 'border-gray-300'
        }`}
      >
        {active && <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ─────────── REVIEW STEP ───────────

function ReviewStep({
  name, subject, previewText, senderName, senderEmail, selectedTemplateName,
  recipientType, selectedSegmentObjs, estimatedRecipients,
  sendType, setSendType, scheduledAt, setScheduledAt,
  abConfig, setAbConfig, smartConfig, setSmartConfig,
  onEditStep, subject1, preheader1,
}: any) {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Revisar e confirmar</h1>
        <p className="text-sm text-gray-500 mt-1">
          Confira todos os detalhes antes de enviar sua campanha.
        </p>
      </div>

      {/* Settings card */}
      <ReviewCard
        title="Configurações"
        onEdit={() => onEditStep('settings')}
      >
        <ReviewRow label="Campanha" value={name} />
        <ReviewRow label="Assunto" value={subject} />
        {previewText && <ReviewRow label="Preheader" value={previewText} />}
        <ReviewRow label="Remetente" value={`${senderName} <${senderEmail}>`} />
      </ReviewCard>

      {/* Template card */}
      <ReviewCard
        title="Template"
        onEdit={() => onEditStep('template')}
      >
        <ReviewRow label="Modelo" value={selectedTemplateName || '—'} />
      </ReviewCard>

      {/* Audience card */}
      <ReviewCard
        title="Destinatários"
        onEdit={() => onEditStep('audience')}
      >
        {recipientType === 'all' ? (
          <p className="text-sm font-semibold text-gray-900">
            Todos os inscritos
          </p>
        ) : (
          <div className="space-y-1">
            {selectedSegmentObjs.map((s: any) => (
              <p key={s.id} className="text-sm font-semibold text-gray-900">
                {s.name}
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          ~{formatNumber(estimatedRecipients)} contatos receberão esta campanha
        </p>
      </ReviewCard>

      {/* Advanced options */}
      <ABTestPanel
        variantA={{ subject: subject1, preheader: preheader1 }}
        config={abConfig}
        onChange={setAbConfig}
      />
      <SmartSendingPanel config={smartConfig} onChange={setSmartConfig} />

      {/* Send options */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Enviar</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSendType('now')}
            className={`p-4 border rounded-lg text-left transition-all ${
              sendType === 'now'
                ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/10'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Send className="w-5 h-5 text-brand-500 mb-2" />
            <p className="text-sm font-semibold text-gray-900">Enviar agora</p>
            <p className="text-xs text-gray-500 mt-0.5">Disparar imediatamente</p>
          </button>
          <button
            type="button"
            onClick={() => setSendType('schedule')}
            className={`p-4 border rounded-lg text-left transition-all ${
              sendType === 'schedule'
                ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/10'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Clock className="w-5 h-5 text-brand-500 mb-2" />
            <p className="text-sm font-semibold text-gray-900">Agendar</p>
            <p className="text-xs text-gray-500 mt-0.5">Definir data e horário</p>
          </button>
        </div>
        {sendType === 'schedule' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Data e horário
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewCard({
  title, onEdit, children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Editar
        </button>
      </div>
      {children}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right break-words">{value}</span>
    </div>
  )
}
