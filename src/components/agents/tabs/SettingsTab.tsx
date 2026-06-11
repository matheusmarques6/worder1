'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  Phone,
  GitBranch,
  Clock,
  Cog,
  Info,
  Loader2,
} from 'lucide-react'
import { AIAgent, AgentSettings } from '@/lib/ai/types'
import { AccordionItem } from '../ui/primitives'
import { authedFetch } from '@/lib/api/authed-fetch'
import { useStoreStore } from '@/stores'

interface SettingsTabProps {
  agent: AIAgent
  organizationId: string
  onUpdate: (updates: Partial<AIAgent>) => void
}

interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  is_connected: boolean
}

interface Pipeline {
  id: string
  name: string
  stages: PipelineStage[]
}

interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
}

const weekDays = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
]

const activateOnOptions = [
  { value: 'new_message', label: 'Nova mensagem', description: 'Ativa quando recebe qualquer mensagem' },
  { value: 'pipeline_stage', label: 'Etapa do pipeline', description: 'Ativa quando lead entra em etapa específica' },
  { value: 'manual', label: 'Manual', description: 'Ativa apenas quando atribuído manualmente' },
] as const

export default function SettingsTab({ agent, organizationId, onUpdate }: SettingsTabProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('channels')
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  // ✅ FIX: a API /api/whatsapp/numbers exige store_id (multi-loja); sem ele
  // retornava 400 e a lista de canais ficava sempre vazia.
  const { currentStore } = useStoreStore()
  const storeId = currentStore?.id || null

  const settings = agent.settings || {
    channels: { all_channels: true, channel_ids: [] },
    pipelines: { all_pipelines: true, pipeline_ids: [], stage_ids: [] },
    schedule: { 
      always_active: true, 
      timezone: 'America/Sao_Paulo', 
      hours: { start: '08:00', end: '18:00' }, 
      days: ['mon', 'tue', 'wed', 'thu', 'fri'] 
    },
    behavior: { 
      activate_on: 'new_message', 
      stop_on_human_reply: true, 
      cooldown_after_transfer: 300, 
      max_messages_per_conversation: 0 
    },
  }

  // Fetch data
  useEffect(() => {
    fetchData()
  }, [organizationId, storeId])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch WhatsApp numbers — store_id é obrigatório na API
      if (storeId) {
        const numbersRes = await authedFetch(`/api/whatsapp/numbers?store_id=${storeId}`)
        if (numbersRes.ok) {
          const data = await numbersRes.json()
          setWhatsappNumbers(data.numbers || [])
        } else {
          console.error('[SettingsTab] /api/whatsapp/numbers failed:', numbersRes.status)
        }
      } else {
        setWhatsappNumbers([])
      }

      // Fetch pipelines
      const pipelinesRes = await authedFetch(`/api/deals?organization_id=${organizationId}&type=pipelines`)
      if (pipelinesRes.ok) {
        const data = await pipelinesRes.json()
        setPipelines(data.pipelines || [])
      }
    } catch (err) {
      console.error('Error fetching settings data:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = (updates: Partial<AgentSettings>) => {
    onUpdate({
      settings: { ...settings, ...updates },
    })
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const toggleChannel = (channelId: string) => {
    const currentIds = settings.channels.channel_ids || []
    const newIds = currentIds.includes(channelId)
      ? currentIds.filter(id => id !== channelId)
      : [...currentIds, channelId]
    
    updateSettings({
      channels: { 
        ...settings.channels, 
        all_channels: false, 
        channel_ids: newIds 
      },
    })
  }

  const toggleStage = (stageId: string) => {
    const currentIds = settings.pipelines.stage_ids || []
    const newIds = currentIds.includes(stageId)
      ? currentIds.filter(id => id !== stageId)
      : [...currentIds, stageId]
    
    updateSettings({
      pipelines: { 
        ...settings.pipelines, 
        all_pipelines: false, 
        stage_ids: newIds 
      },
    })
  }

  const toggleDay = (dayId: string) => {
    const currentDays = settings.schedule.days || []
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter(d => d !== dayId)
      : [...currentDays, dayId]
    
    updateSettings({
      schedule: { ...settings.schedule, days: newDays },
    })
  }

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Settings />
        </div>
        <div>
          <h3 className="sec-t">Configurações</h3>
          <p className="sec-s">Defina onde e quando o agente deve atuar</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand)' }} />
        </div>
      ) : (
        <>
          {/* Channels Section */}
          <AccordionItem
            open={expandedSection === 'channels'}
            onToggle={() => toggleSection('channels')}
            title={
              <div className="flex items-center gap-3 flex-1">
                <div className="act-ico" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>
                  <Phone className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span style={{ color: 'var(--text)' }}>Canais de Atendimento</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Números de WhatsApp onde o agente atuará</p>
                </div>
                <span className="chip">
                  {settings.channels.all_channels
                    ? 'Todos'
                    : `${settings.channels.channel_ids?.length || 0} selecionados`}
                </span>
              </div>
            }
          >
            <div className="space-y-3">
              {/* All channels toggle */}
              <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.channels.all_channels}
                    onChange={(e) => updateSettings({
                      channels: {
                        all_channels: e.target.checked,
                        channel_ids: e.target.checked ? [] : settings.channels.channel_ids
                      }
                    })}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>Todos os canais</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>O agente responderá em todos os números conectados</span>
              </label>

              {/* Individual channels */}
              {!settings.channels.all_channels && (
                <div className="space-y-2">
                  {whatsappNumbers.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                      Nenhum número WhatsApp conectado
                    </p>
                  ) : (
                    whatsappNumbers.map((number) => {
                      const isSelected = settings.channels.channel_ids?.includes(number.id)
                      return (
                        <label
                          key={number.id}
                          className={`selcard ${isSelected ? 'on' : ''} flex items-center gap-3`}
                          style={{ padding: 12 }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleChannel(number.id)}
                          />
                          <div className="flex-1">
                            <p className="text-sm" style={{ color: 'var(--text)' }}>
                              {number.display_name || number.phone_number}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{number.phone_number}</p>
                          </div>
                          <div className="w-2 h-2 rounded-full" style={{ background: number.is_connected ? 'var(--green)' : 'var(--red)' }} />
                        </label>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </AccordionItem>

          {/* Pipeline Stages Section */}
          <AccordionItem
            open={expandedSection === 'pipelines'}
            onToggle={() => toggleSection('pipelines')}
            title={
              <div className="flex items-center gap-3 flex-1">
                <div className="act-ico" style={{ background: 'var(--blue-tint)', color: 'var(--blue)' }}>
                  <GitBranch className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span style={{ color: 'var(--text)' }}>Etapas do Pipeline</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Em quais etapas o agente deve atuar</p>
                </div>
                <span className="chip">
                  {settings.pipelines.all_pipelines
                    ? 'Todas'
                    : `${settings.pipelines.stage_ids?.length || 0} etapas`}
                </span>
              </div>
            }
          >
            <div className="space-y-3">
              {/* All pipelines toggle */}
              <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)' }}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.pipelines.all_pipelines}
                    onChange={(e) => updateSettings({
                      pipelines: {
                        all_pipelines: e.target.checked,
                        pipeline_ids: [],
                        stage_ids: e.target.checked ? [] : settings.pipelines.stage_ids
                      }
                    })}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>Todas as etapas</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>O agente responderá em qualquer etapa</span>
              </label>

              {/* Individual stages */}
              {!settings.pipelines.all_pipelines && (
                <div className="space-y-4">
                  {pipelines.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                      Nenhum pipeline criado
                    </p>
                  ) : (
                    pipelines.map((pipeline) => (
                      <div key={pipeline.id} className="space-y-2">
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{pipeline.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {pipeline.stages?.map((stage) => {
                            const isSelected = settings.pipelines.stage_ids?.includes(stage.id)
                            return (
                              <label
                                key={stage.id}
                                className={`selcard ${isSelected ? 'on' : ''} flex items-center gap-2`}
                                style={{ padding: 10 }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleStage(stage.id)}
                                />
                                <div
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: stage.color || '#6b7280' }}
                                />
                                <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{stage.name}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="callout">
                <Info className="w-4 h-4 flex-shrink-0" />
                <p>
                  O agente só responderá quando a conversa estiver em uma das etapas selecionadas.
                  Se a conversa mudar de etapa, o agente continuará ativo até ser transferido ou desativado.
                </p>
              </div>
            </div>
          </AccordionItem>

          {/* Schedule Section */}
          <AccordionItem
            open={expandedSection === 'schedule'}
            onToggle={() => toggleSection('schedule')}
            title={
              <div className="flex items-center gap-3 flex-1">
                <div className="act-ico" style={{ background: 'var(--purple-tint)', color: 'var(--purple)' }}>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span style={{ color: 'var(--text)' }}>Horário de Funcionamento</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Quando o agente deve estar ativo</p>
                </div>
                <span className="chip">
                  {settings.schedule.always_active
                    ? '24/7'
                    : `${settings.schedule.hours?.start} - ${settings.schedule.hours?.end}`}
                </span>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Always active */}
              <div className="space-y-2">
                <label className="selcard flex items-center gap-3" style={{ padding: 12 }}>
                  <input
                    type="radio"
                    name="schedule_type"
                    checked={settings.schedule.always_active}
                    onChange={() => updateSettings({
                      schedule: { ...settings.schedule, always_active: true }
                    })}
                  />
                  <div>
                    <span className="text-sm" style={{ color: 'var(--text)' }}>Sempre ativo</span>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>O agente responde 24 horas por dia, 7 dias por semana</p>
                  </div>
                </label>

                <label className="selcard flex items-center gap-3" style={{ padding: 12 }}>
                  <input
                    type="radio"
                    name="schedule_type"
                    checked={!settings.schedule.always_active}
                    onChange={() => updateSettings({
                      schedule: { ...settings.schedule, always_active: false }
                    })}
                  />
                  <div>
                    <span className="text-sm" style={{ color: 'var(--text)' }}>Horário personalizado</span>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Defina dias e horários específicos</p>
                  </div>
                </label>
              </div>

              {/* Custom schedule */}
              {!settings.schedule.always_active && (
                <div className="space-y-4 pt-2">
                  {/* Days */}
                  <div>
                    <p className="label">Dias da semana</p>
                    <div className="day-pick">
                      {weekDays.map((day) => {
                        const isSelected = settings.schedule.days?.includes(day.id)
                        return (
                          <button
                            key={day.id}
                            onClick={() => toggleDay(day.id)}
                            className={`day ${isSelected ? 'on' : ''}`}
                          >
                            {day.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Hours */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Início</label>
                      <input
                        type="time"
                        value={settings.schedule.hours?.start || '08:00'}
                        onChange={(e) => updateSettings({
                          schedule: {
                            ...settings.schedule,
                            hours: { ...settings.schedule.hours, start: e.target.value }
                          }
                        })}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label">Fim</label>
                      <input
                        type="time"
                        value={settings.schedule.hours?.end || '18:00'}
                        onChange={(e) => updateSettings({
                          schedule: {
                            ...settings.schedule,
                            hours: { ...settings.schedule.hours, end: e.target.value }
                          }
                        })}
                        className="field"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* Behavior Section */}
          <AccordionItem
            open={expandedSection === 'behavior'}
            onToggle={() => toggleSection('behavior')}
            title={
              <div className="flex items-center gap-3">
                <div className="act-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                  <Cog className="w-4 h-4" />
                </div>
                <div>
                  <span style={{ color: 'var(--text)' }}>Comportamento</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Como o agente deve se comportar</p>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Activate On */}
              <div>
                <p className="label">Quando ativar</p>
                <div className="space-y-2">
                  {activateOnOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`selcard ${settings.behavior.activate_on === option.value ? 'on' : ''} flex items-center gap-3`}
                      style={{ padding: 12 }}
                    >
                      <input
                        type="radio"
                        name="activate_on"
                        value={option.value}
                        checked={settings.behavior.activate_on === option.value}
                        onChange={() => updateSettings({
                          behavior: { ...settings.behavior, activate_on: option.value }
                        })}
                      />
                      <div>
                        <span className="text-sm" style={{ color: 'var(--text)' }}>{option.label}</span>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{option.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stop on Human Reply */}
              <div className="rule-card flex items-center justify-between">
                <div>
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Parar quando humano responder</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>O agente para de responder quando um humano assume a conversa</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.behavior.stop_on_human_reply}
                  onClick={() => updateSettings({
                    behavior: { ...settings.behavior, stop_on_human_reply: !settings.behavior.stop_on_human_reply }
                  })}
                  className={`tog ${settings.behavior.stop_on_human_reply ? 'on' : ''}`}
                />
              </div>

              {/* Cooldown */}
              <div className="rule-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Cooldown após transferência</span>
                  <span className="text-sm" style={{ color: 'var(--brand-ink)' }}>
                    {Math.floor(settings.behavior.cooldown_after_transfer / 60)} min
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1800"
                  step="60"
                  value={settings.behavior.cooldown_after_transfer}
                  onChange={(e) => updateSettings({
                    behavior: { ...settings.behavior, cooldown_after_transfer: parseInt(e.target.value) }
                  })}
                  className="range"
                />
                <p className="hint">
                  Tempo que o agente aguarda antes de voltar a responder após uma transferência
                </p>
              </div>

              {/* Max Messages */}
              <div className="rule-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Limite de mensagens por conversa</span>
                  <span className="text-sm" style={{ color: 'var(--brand-ink)' }}>
                    {settings.behavior.max_messages_per_conversation === 0
                      ? 'Ilimitado'
                      : settings.behavior.max_messages_per_conversation}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={settings.behavior.max_messages_per_conversation}
                  onChange={(e) => updateSettings({
                    behavior: { ...settings.behavior, max_messages_per_conversation: parseInt(e.target.value) }
                  })}
                  className="range"
                />
                <p className="hint">
                  Após este número de mensagens, o agente para de responder automaticamente (0 = ilimitado)
                </p>
              </div>
            </div>
          </AccordionItem>
        </>
      )}
    </div>
  )
}
