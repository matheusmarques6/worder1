'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  ChatCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  UsersThree,
  FunnelSimple,
  MagnifyingGlass,
  Eye,
  PaperPlaneTilt,
  CalendarBlank,
  Clock,
  TextAa,
  Image,
  CursorClick,
  Sparkle,
  Lightning,
  PencilSimple,
  Rocket,
} from '@phosphor-icons/react'

// ============================================
// Types
// ============================================

interface StepProps {
  onNext: () => void
  onBack: () => void
}

const steps = [
  { id: 1, label: 'Canal', description: 'Escolha o canal' },
  { id: 2, label: 'Público', description: 'Defina o público' },
  { id: 3, label: 'Conteúdo', description: 'Monte o conteúdo' },
  { id: 4, label: 'Revisar', description: 'Revisar e enviar' },
]

// ============================================
// Step 1: Choose Channel
// ============================================

const channels = [
  {
    id: 'email',
    name: 'E-mail',
    description: 'Envie campanhas com editor drag-and-drop, personalização dinâmica e A/B testing',
    icon: EnvelopeSimple,
    color: '#3B82F6',
    stats: '32.4% abertura média',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Templates aprovados pela Meta com botões interativos e personalização',
    icon: WhatsappLogo,
    color: '#25D366',
    stats: '89.2% abertura média',
  },
  {
    id: 'sms',
    name: 'SMS',
    description: 'Mensagens curtas com links trackáveis e variáveis dinâmicas',
    icon: DeviceMobileSpeaker,
    color: '#8B5CF6',
    stats: '95% entrega',
  },
]

function StepChannel({ onNext, selectedChannel, setSelectedChannel }: { onNext: () => void; selectedChannel: string; setSelectedChannel: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Escolha o Canal</h2>
        <p className="text-sm text-gray-500 mt-1">Selecione por qual canal deseja enviar a campanha</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {channels.map((channel) => {
          const Icon = channel.icon
          const isSelected = selectedChannel === channel.id
          return (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`relative text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
              }`}
            >
              {isSelected && (
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" weight="bold" />
                </div>
              )}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${channel.color}15` }}>
                <Icon className="w-6 h-6" style={{ color: channel.color }} weight="fill" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 font-display">{channel.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{channel.description}</p>
              <p className="text-xs font-medium mt-3" style={{ color: channel.color }}>{channel.stats}</p>
            </button>
          )
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!selectedChannel}
          className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          Próximo
          <ArrowRight className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// Step 2: Choose Audience
// ============================================

const segments = [
  { id: 'all', name: 'Todos os Contatos', count: 12450, type: 'Lista' },
  { id: 'active', name: 'Compraram nos últimos 30d', count: 3200, type: 'Segmento' },
  { id: 'vip', name: 'Clientes VIP (LTV > R$500)', count: 890, type: 'Segmento' },
  { id: 'at-risk', name: 'Em Risco de Churn', count: 1540, type: 'Segmento' },
  { id: 'new', name: 'Novos Leads (7d)', count: 420, type: 'Segmento' },
  { id: 'cart', name: 'Abandonaram Carrinho', count: 680, type: 'Segmento' },
]

function StepAudience({ onNext, onBack, selectedAudience, setSelectedAudience }: { onNext: () => void; onBack: () => void; selectedAudience: string; setSelectedAudience: (v: string) => void }) {
  const [search, setSearch] = useState('')

  const filtered = segments.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Defina o Público</h2>
        <p className="text-sm text-gray-500 mt-1">Selecione uma lista ou segmento para receber a campanha</p>
      </div>

      <div className="relative max-w-sm">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar segmentos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((segment) => {
          const isSelected = selectedAudience === segment.id
          return (
            <button
              key={segment.id}
              onClick={() => setSelectedAudience(segment.id)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isSelected ? 'bg-brand-50' : 'bg-gray-100'
                }`}>
                  {segment.type === 'Lista'
                    ? <UsersThree className={`w-5 h-5 ${isSelected ? 'text-brand-500' : 'text-gray-500'}`} weight="duotone" />
                    : <FunnelSimple className={`w-5 h-5 ${isSelected ? 'text-brand-500' : 'text-gray-500'}`} weight="duotone" />
                  }
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{segment.name}</p>
                  <p className="text-xs text-gray-500">{segment.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{segment.count.toLocaleString()}</span>
                <span className="text-xs text-gray-500">contatos</span>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" weight="bold" />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4" weight="bold" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!selectedAudience}
          className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          Próximo
          <ArrowRight className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// Step 3: Content
// ============================================

function StepContent({ onNext, onBack, channel, campaignName, setCampaignName, subject, setSubject }: {
  onNext: () => void; onBack: () => void; channel: string;
  campaignName: string; setCampaignName: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
}) {
  const [savedTemplates, setSavedTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  useEffect(() => {
    fetch('/api/email/templates')
      .then(r => r.json())
      .then(data => setSavedTemplates(data.templates || data || []))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Monte o Conteúdo</h2>
        <p className="text-sm text-gray-500 mt-1">Configure o conteúdo da campanha</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Nome da Campanha</label>
            <input
              type="text"
              placeholder="Ex: Promoção de Março"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {channel === 'email' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Assunto do E-mail</label>
                <input
                  type="text"
                  placeholder="Ex: 🔥 Promoção exclusiva para você!"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium">Preview Text</label>
                <input
                  type="text"
                  placeholder="Texto que aparece ao lado do assunto na caixa de entrada"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {channel === 'whatsapp' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Template Aprovado</label>
              <select className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none">
                <option value="">Selecionar template...</option>
                <option value="promo">promocao_mensal</option>
                <option value="recover">recuperacao_carrinho</option>
                <option value="news">novidades_loja</option>
              </select>
            </div>
          )}

          {channel === 'sms' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Mensagem SMS</label>
              <textarea
                placeholder="Até 160 caracteres..."
                maxLength={160}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none"
              />
            </div>
          )}

          {/* Template Selector for Email */}
          {channel === 'email' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Template</label>
              <div className="grid grid-cols-2 gap-3">
                {['Começar do Zero', 'Promoção', 'Boas-vindas', 'Win-back'].map((tpl) => (
                  <button
                    key={tpl}
                    className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-brand-500 hover:shadow-md transition-all text-center"
                  >
                    <div className="h-16 bg-gray-50 rounded-lg mb-2 flex items-center justify-center">
                      {tpl === 'Começar do Zero'
                        ? <PencilSimple className="w-5 h-5 text-gray-400" weight="duotone" />
                        : <EnvelopeSimple className="w-5 h-5 text-gray-400" weight="duotone" />
                      }
                    </div>
                    <p className="text-xs font-medium text-gray-900">{tpl}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Saved Templates */}
          {channel === 'email' && savedTemplates.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium">Seus Templates Salvos</label>
              <div className="grid grid-cols-2 gap-3">
                {savedTemplates.map((t: any) => (
                  <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                    className={`bg-white border rounded-lg p-4 text-left transition-all hover:shadow-md ${
                      selectedTemplateId === t.id ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200'
                    }`}>
                    <div className="h-16 bg-gray-50 rounded mb-2 flex items-center justify-center">
                      <span className="text-xl">✉️</span>
                    </div>
                    <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {t.updated_at ? new Date(t.updated_at).toLocaleDateString('pt-BR') : ''}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Merge Tags */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">Variáveis Disponíveis</label>
            <div className="flex flex-wrap gap-2">
              {['{{ first_name }}', '{{ product.name }}', '{{ coupon.code }}', '{{ order.total }}'].map((tag) => (
                <button
                  key={tag}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs hover:text-brand-500 hover:border-brand-500 font-mono transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500">Preview</span>
              <div className="flex items-center gap-2">
                <button className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-medium text-gray-900">Desktop</button>
                <button className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-gray-500 hover:text-gray-700 transition-colors">Mobile</button>
              </div>
            </div>
            <div className="p-6 min-h-[400px] bg-white flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-gray-400" weight="duotone" />
                </div>
                <p className="text-gray-700 font-medium">Preview do conteúdo</p>
                <p className="text-gray-500 text-sm mt-1">Edite o conteúdo à esquerda para ver o preview aqui</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4" weight="bold" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!campaignName}
          className="flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          Próximo
          <ArrowRight className="w-4 h-4" weight="bold" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// Step 4: Review & Send
// ============================================

function StepReview({ onBack, channel, audience, campaignName, subject }: {
  onBack: () => void; channel: string; audience: string; campaignName: string; subject: string;
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')

  const channelLabel = channels.find(c => c.id === channel)?.name || channel
  const audienceData = segments.find(s => s.id === audience)

  const handleSend = async () => {
    setSending(true)
    setError('')

    try {
      // 1. Create the campaign via API
      const createRes = await fetch('/api/email/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName || 'Campanha sem nome',
          subject: subject || campaignName || 'Sem assunto',
          from_email: 'noreply@resend.dev',
          sender_name: 'Worder',
          segment_id: audience || null,
          template_id: null,
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Erro ao criar campanha')
      }

      const { campaign } = await createRes.json()

      if (scheduleMode === 'now') {
        // 2. Send immediately
        const sendRes = await fetch('/api/email/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: campaign.id }),
        })

        if (!sendRes.ok) {
          const err = await sendRes.json()
          throw new Error(err.error || 'Erro ao enviar campanha')
        }

        const result = await sendRes.json()
        alert(`Campanha enviada! ${result.sent || 0} emails enviados.`)
      } else {
        // Schedule for later
        alert('Campanha criada como rascunho. Agendamento será implementado em breve.')
      }

      router.push('/campaigns')
    } catch (err: any) {
      setError(err.message || 'Erro ao criar/enviar campanha')
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Revisar e Enviar</h2>
        <p className="text-sm text-gray-500 mt-1">Confirme os detalhes da campanha antes de enviar</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Detalhes</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Nome</span>
              <span className="text-sm font-medium text-gray-900">{campaignName || 'Sem nome'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Canal</span>
              <span className="text-sm font-medium text-gray-900">{channelLabel}</span>
            </div>
            {subject && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Assunto</span>
                <span className="text-sm font-medium text-gray-900 truncate ml-4">{subject}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Público</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Segmento</span>
              <span className="text-sm font-medium text-gray-900">{audienceData?.name || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Destinatários</span>
              <span className="text-sm font-medium text-gray-900">{audienceData?.count.toLocaleString() || '0'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Agendamento</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setScheduleMode('now')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
              scheduleMode === 'now' ? 'border-brand-500 bg-brand-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Rocket className="w-4 h-4" weight={scheduleMode === 'now' ? 'fill' : 'regular'} />
            Enviar Agora
          </button>
          <button
            onClick={() => setScheduleMode('scheduled')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
              scheduleMode === 'scheduled' ? 'border-brand-500 bg-brand-50 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <CalendarBlank className="w-4 h-4" weight={scheduleMode === 'scheduled' ? 'fill' : 'regular'} />
            Agendar
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-500 hover:border-gray-300 transition-all"
          >
            <Sparkle className="w-4 h-4" weight="duotone" />
            Smart Send
          </button>
        </div>

        {scheduleMode === 'scheduled' && (
          <div className="flex items-center gap-4 mt-4">
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4" weight="bold" />
          Voltar
        </button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-8 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm"
        >
          {sending ? (
            <>
              <Lightning className="w-4 h-4 animate-pulse" weight="fill" />
              Enviando...
            </>
          ) : (
            <>
              <PaperPlaneTilt className="w-4 h-4" weight="fill" />
              {scheduleMode === 'now' ? 'Enviar Campanha' : 'Agendar Campanha'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================
// Main Wizard Page
// ============================================

export default function CreateCampaignPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedChannel, setSelectedChannel] = useState('')
  const [selectedAudience, setSelectedAudience] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [subject, setSubject] = useState('')

  const goNext = () => setCurrentStep(s => Math.min(4, s + 1))
  const goBack = () => setCurrentStep(s => Math.max(1, s - 1))

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/campaigns')}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" weight="bold" />
        </button>
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Criar Campanha</h1>
          <p className="text-sm text-gray-500 mt-0.5">Passo {currentStep} de 4</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isCompleted ? 'bg-brand-500 text-white' :
                  isActive ? 'bg-brand-500 text-white ring-2 ring-brand-500/30' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {isCompleted ? <Check className="w-4 h-4" weight="bold" /> : step.id}
                </div>
                <div className="hidden sm:block">
                  <p className={`text-xs font-medium ${isActive || isCompleted ? 'text-gray-900' : 'text-gray-500'}`}>{step.label}</p>
                  <p className="text-[10px] text-gray-500">{step.description}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-4 transition-colors ${isCompleted ? 'bg-brand-500' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {currentStep === 1 && (
            <StepChannel onNext={goNext} selectedChannel={selectedChannel} setSelectedChannel={setSelectedChannel} />
          )}
          {currentStep === 2 && (
            <StepAudience onNext={goNext} onBack={goBack} selectedAudience={selectedAudience} setSelectedAudience={setSelectedAudience} />
          )}
          {currentStep === 3 && (
            <StepContent onNext={goNext} onBack={goBack} channel={selectedChannel} campaignName={campaignName} setCampaignName={setCampaignName} subject={subject} setSubject={setSubject} />
          )}
          {currentStep === 4 && (
            <StepReview onBack={goBack} channel={selectedChannel} audience={selectedAudience} campaignName={campaignName} subject={subject} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
