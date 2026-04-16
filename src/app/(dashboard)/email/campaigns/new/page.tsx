'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Users,
  FileText,
  Send,
  Loader2,
  Clock,
  AlertCircle,
  Zap,
  CheckCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'
import ABTestPanel, { type ABTestConfig } from '@/components/email/ABTestPanel'

interface Template {
  id: string
  name: string
  category: string
}

interface Segment {
  id: string
  name: string
  count: number
}

const steps = [
  { id: 1, label: 'Detalhes', icon: Mail },
  { id: 2, label: 'Destinatários', icon: Users },
  { id: 3, label: 'Conteúdo', icon: FileText },
  { id: 4, label: 'Revisar', icon: Send },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const { currentStore } = useStoreStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [error, setError] = useState('')

  // Step 1 - Details
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [previewText, setPreviewText] = useState('')

  // Step 2 - Recipients
  const [recipientType, setRecipientType] = useState<'all' | 'segment'>('all')
  const [selectedSegment, setSelectedSegment] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])

  // Step 3 - Content
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')

  // Step 3.5 - A/B Test
  const [abConfig, setAbConfig] = useState<ABTestConfig>({
    enabled: false,
    percent: 50,
    variantB: null,
    winner_metric: 'open_rate',
    duration_hours: 4,
  })

  // Step 4 - Schedule
  const [sendType, setSendType] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')

  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (currentStore) params.set('store_id', currentStore?.id || '')
      const res = await fetch(`/api/email/templates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
  }, [currentStore])

  const fetchSegments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (currentStore) params.set('store_id', currentStore?.id || '')
      const res = await fetch(`/api/segments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSegments(data.segments || [])
      }
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    }
  }, [currentStore])

  useEffect(() => {
    fetchTemplates()
    fetchSegments()
    // Autocompletar remetente da org
    fetch('/api/settings/organization')
      .then(r => r.json())
      .then(d => {
        const s = d?.organization?.email_settings || {}
        if (!senderName && s.default_sender_name) setSenderName(s.default_sender_name)
        if (!senderEmail && s.default_sender_email) setSenderEmail(s.default_sender_email)
      })
      .catch(() => {})
  }, [fetchTemplates, fetchSegments])

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return name.trim() && subject.trim()
      case 2:
        return recipientType === 'all' || selectedSegment
      case 3:
        return selectedTemplate && senderName.trim() && senderEmail.trim()
      case 4:
        return sendType === 'now' || scheduledAt
      default:
        return false
    }
  }

  const handleSendTest = async () => {
    setSendingTest(true)
    try {
      await fetch('/api/email/campaigns/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          subject,
          sender_name: senderName,
          sender_email: senderEmail,
        }),
      })
    } catch (err) {
      console.error('Test send failed:', err)
    } finally {
      setSendingTest(false)
    }
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')

    try {
      // Create campaign
      const createRes = await fetch('/api/email/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          preview_text: previewText,
          template_id: selectedTemplate,
          recipient_type: recipientType,
          segment_id: recipientType === 'segment' ? selectedSegment : null,
          sender_name: senderName,
          sender_email: senderEmail,
          store_id: currentStore,
          scheduled_at: sendType === 'schedule' ? scheduledAt : null,
          // A/B test
          ab_test_enabled: abConfig.enabled,
          ab_test_percent: abConfig.percent,
          ab_variant_b: abConfig.enabled ? abConfig.variantB : null,
          ab_winner_metric: abConfig.winner_metric,
          ab_duration_hours: abConfig.duration_hours,
        }),
      })

      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Erro ao criar campanha')
      }

      const campaignData = await createRes.json()
      const campaignId = campaignData.campaign?.id || campaignData.id

      // Send or schedule
      if (sendType === 'now') {
        const sendRes = await fetch('/api/email/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaignId }),
        })
        if (!sendRes.ok) {
          throw new Error('Erro ao enviar campanha')
        }
      }

      router.push('/email/campaigns')
    } catch (err: any) {
      setError(err.message || 'Erro ao criar campanha')
    } finally {
      setSaving(false)
    }
  }

  const selectedTemplateName = templates.find((t) => t.id === selectedTemplate)?.name
  const selectedSegmentName = segments.find((s) => s.id === selectedSegment)?.name

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/email/campaigns"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Nova Campanha</h1>
          <p className="text-sm text-gray-500 mt-1">Configure e envie sua campanha de email</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id
            return (
              <div key={step.id} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isCompleted
                        ? 'bg-brand-500 text-white'
                        : isActive
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:inline ${
                      isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      isCompleted ? 'bg-brand-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="bg-white border border-gray-200 rounded-lg shadow-sm p-6"
        >
          {/* Step 1: Details */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Detalhes da Campanha</h2>
                <p className="text-sm text-gray-500">Defina o nome e assunto do email</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nome da Campanha
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Black Friday 2026"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Assunto do Email
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Ofertas imperdíveis de Black Friday!"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Texto de Pré-visualização
                  <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Texto que aparece após o assunto na caixa de entrada"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Recipients */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Destinatários</h2>
                <p className="text-sm text-gray-500">Escolha quem vai receber esta campanha</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setRecipientType('all')
                    setSelectedSegment('')
                  }}
                  className={`p-4 border rounded-lg text-left transition-all ${
                    recipientType === 'all'
                      ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Users className="w-6 h-6 text-brand-500 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Todos os Contatos</p>
                  <p className="text-xs text-gray-500 mt-1">Enviar para toda a base</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('segment')}
                  className={`p-4 border rounded-lg text-left transition-all ${
                    recipientType === 'segment'
                      ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Zap className="w-6 h-6 text-brand-500 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Segmento</p>
                  <p className="text-xs text-gray-500 mt-1">Enviar para um grupo específico</p>
                </button>
              </div>
              {recipientType === 'segment' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Selecionar Segmento
                  </label>
                  <select
                    value={selectedSegment}
                    onChange={(e) => setSelectedSegment(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="">Escolha um segmento...</option>
                    {segments.map((seg) => (
                      <option key={seg.id} value={seg.id}>
                        {seg.name} ({seg.count.toLocaleString('pt-BR')} contatos)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Content */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Conteúdo & Remetente</h2>
                <p className="text-sm text-gray-500">Escolha o template e configure o remetente</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">Selecione um template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nome do Remetente
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ex: Minha Loja"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email do Remetente
                  </label>
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="Ex: contato@minhaloja.com"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              {/* A/B Testing */}
              <ABTestPanel
                variantA={{ subject, preheader: previewText }}
                config={abConfig}
                onChange={setAbConfig}
              />

              <div>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendingTest || !selectedTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar Email de Teste
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Revisar e Enviar</h2>
                <p className="text-sm text-gray-500">Confira os detalhes antes de enviar</p>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Campanha</span>
                  <span className="font-medium text-gray-900">{name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Assunto</span>
                  <span className="font-medium text-gray-900">{subject}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Destinatários</span>
                  <span className="font-medium text-gray-900">
                    {recipientType === 'all' ? 'Todos os contatos' : selectedSegmentName || '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Template</span>
                  <span className="font-medium text-gray-900">{selectedTemplateName || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remetente</span>
                  <span className="font-medium text-gray-900">
                    {senderName} &lt;{senderEmail}&gt;
                  </span>
                </div>
              </div>

              {/* Send type */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSendType('now')}
                  className={`p-4 border rounded-lg text-left transition-all ${
                    sendType === 'now'
                      ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Send className="w-5 h-5 text-brand-500 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Enviar Agora</p>
                  <p className="text-xs text-gray-500 mt-1">Disparar imediatamente</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSendType('schedule')}
                  className={`p-4 border rounded-lg text-left transition-all ${
                    sendType === 'schedule'
                      ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Clock className="w-5 h-5 text-brand-500 mb-2" />
                  <p className="text-sm font-medium text-gray-900">Agendar</p>
                  <p className="text-xs text-gray-500 mt-1">Definir data e horário</p>
                </button>
              </div>

              {sendType === 'schedule' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Data e Horário
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        {currentStep < 4 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
            disabled={!canProceed()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Próximo
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !canProceed()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {sendType === 'now' ? 'Enviando...' : 'Agendando...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {sendType === 'now' ? 'Enviar Campanha' : 'Agendar Campanha'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
