'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Phone,
  GitBranch,
  Clock,
  Cog,
  ChevronDown,
  Info,
  CheckCircle,
  Circle,
  Loader2,
} from 'lucide-react'
import { AIAgent, AgentSettings } from '@/lib/ai/types'

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
  }, [organizationId])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch WhatsApp numbers
      const numbersRes = await fetch(`/api/whatsapp/numbers?organization_id=${organizationId}`)
      if (numbersRes.ok) {
        const data = await numbersRes.json()
        setWhatsappNumbers(data.numbers || [])
      }

      // Fetch pipelines
      const pipelinesRes = await fetch(`/api/deals?organization_id=${organizationId}&type=pipelines`)
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <Settings className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Configurações</h3>
          <p className="text-sm text-dark-400">Defina onde e quando o agente deve atuar</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Channels Section */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection('channels')}
              className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-green-400" />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium">Canais de Atendimento</span>
                  <p className="text-xs text-dark-500">Números de WhatsApp onde o agente atuará</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-dark-700 text-dark-300">
                  {settings.channels.all_channels 
                    ? 'Todos' 
                    : `${settings.channels.channel_ids?.length || 0} selecionados`}
                </span>
                <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${expandedSection === 'channels' ? 'rotate-180' : ''}`} />
              </div>
            </button>

            <AnimatePresence>
              {expandedSection === 'channels' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-dark-700/50"
                >
                  <div className="p-4 space-y-3">
                    {/* All channels toggle */}
                    <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer">
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
                          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                        />
                        <span className="text-sm text-white">Todos os canais</span>
                      </div>
                      <span className="text-xs text-dark-500">O agente responderá em todos os números conectados</span>
                    </label>

                    {/* Individual channels */}
                    {!settings.channels.all_channels && (
                      <div className="space-y-2">
                        {whatsappNumbers.length === 0 ? (
                          <p className="text-sm text-dark-500 text-center py-4">
                            Nenhum número WhatsApp conectado
                          </p>
                        ) : (
                          whatsappNumbers.map((number) => {
                            const isSelected = settings.channels.channel_ids?.includes(number.id)
                            return (
                              <label
                                key={number.id}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-green-500/10 border border-green-500/30'
                                    : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleChannel(number.id)}
                                  className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                                />
                                <div className="flex-1">
                                  <p className="text-sm text-white">
                                    {number.display_name || number.phone_number}
                                  </p>
                                  <p className="text-xs text-dark-500">{number.phone_number}</p>
                                </div>
                                <div className={`w-2 h-2 rounded-full ${
                                  number.is_connected ? 'bg-green-400' : 'bg-red-400'
                                }`} />
                              </label>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pipeline Stages Section */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection('pipelines')}
              className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium">Etapas do Pipeline</span>
                  <p className="text-xs text-dark-500">Em quais etapas o agente deve atuar</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-dark-700 text-dark-300">
                  {settings.pipelines.all_pipelines 
                    ? 'Todas' 
                    : `${settings.pipelines.stage_ids?.length || 0} etapas`}
                </span>
                <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${expandedSection === 'pipelines' ? 'rotate-180' : ''}`} />
              </div>
            </button>

            <AnimatePresence>
              {expandedSection === 'pipelines' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-dark-700/50"
                >
                  <div className="p-4 space-y-3">
                    {/* All pipelines toggle */}
                    <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer">
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
                          className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-blue-500"
                        />
                        <span className="text-sm text-white">Todas as etapas</span>
                      </div>
                      <span className="text-xs text-dark-500">O agente responderá em qualquer etapa</span>
                    </label>

                    {/* Individual stages */}
                    {!settings.pipelines.all_pipelines && (
                      <div className="space-y-4">
                        {pipelines.length === 0 ? (
                          <p className="text-sm text-dark-500 text-center py-4">
                            Nenhum pipeline criado
                          </p>
                        ) : (
                          pipelines.map((pipeline) => (
                            <div key={pipeline.id} className="space-y-2">
                              <p className="text-sm font-medium text-white">{pipeline.name}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {pipeline.stages?.map((stage) => {
                                  const isSelected = settings.pipelines.stage_ids?.includes(stage.id)
                                  return (
                                    <label
                                      key={stage.id}
                                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                        isSelected
                                          ? 'bg-blue-500/10 border border-blue-500/30'
                                          : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleStage(stage.id)}
                                        className="w-3.5 h-3.5 rounded bg-dark-700 border-dark-600 text-blue-500"
                                      />
                                      <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: stage.color || '#6b7280' }}
                                      />
                                      <span className="text-xs text-dark-300 truncate">{stage.name}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-2 p-3 bg-dark-900/50 rounded-lg">
                      <Info className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-dark-400">
                        O agente só responderá quando a conversa estiver em uma das etapas selecionadas.
                        Se a conversa mudar de etapa, o agente continuará ativo até ser transferido ou desativado.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Schedule Section */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection('schedule')}
              className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium">Horário de Funcionamento</span>
                  <p className="text-xs text-dark-500">Quando o agente deve estar ativo</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-dark-700 text-dark-300">
                  {settings.schedule.always_active 
                    ? '24/7' 
                    : `${settings.schedule.hours?.start} - ${settings.schedule.hours?.end}`}
                </span>
                <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${expandedSection === 'schedule' ? 'rotate-180' : ''}`} />
              </div>
            </button>

            <AnimatePresence>
              {expandedSection === 'schedule' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-dark-700/50"
                >
                  <div className="p-4 space-y-4">
                    {/* Always active */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg cursor-pointer">
                        <input
                          type="radio"
                          name="schedule_type"
                          checked={settings.schedule.always_active}
                          onChange={() => updateSettings({
                            schedule: { ...settings.schedule, always_active: true }
                          })}
                          className="w-4 h-4 bg-dark-700 border-dark-600 text-purple-500"
                        />
                        <div>
                          <span className="text-sm text-white">Sempre ativo</span>
                          <p className="text-xs text-dark-500">O agente responde 24 horas por dia, 7 dias por semana</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg cursor-pointer">
                        <input
                          type="radio"
                          name="schedule_type"
                          checked={!settings.schedule.always_active}
                          onChange={() => updateSettings({
                            schedule: { ...settings.schedule, always_active: false }
                          })}
                          className="w-4 h-4 bg-dark-700 border-dark-600 text-purple-500"
                        />
                        <div>
                          <span className="text-sm text-white">Horário personalizado</span>
                          <p className="text-xs text-dark-500">Defina dias e horários específicos</p>
                        </div>
                      </label>
                    </div>

                    {/* Custom schedule */}
                    {!settings.schedule.always_active && (
                      <div className="space-y-4 pt-2">
                        {/* Days */}
                        <div>
                          <p className="text-sm font-medium text-white mb-2">Dias da semana</p>
                          <div className="flex gap-2">
                            {weekDays.map((day) => {
                              const isSelected = settings.schedule.days?.includes(day.id)
                              return (
                                <button
                                  key={day.id}
                                  onClick={() => toggleDay(day.id)}
                                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-purple-500 text-white'
                                      : 'bg-dark-900/50 text-dark-400 hover:bg-dark-700'
                                  }`}
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
                            <label className="block text-sm font-medium text-dark-300 mb-2">Início</label>
                            <input
                              type="time"
                              value={settings.schedule.hours?.start || '08:00'}
                              onChange={(e) => updateSettings({
                                schedule: { 
                                  ...settings.schedule, 
                                  hours: { ...settings.schedule.hours, start: e.target.value } 
                                }
                              })}
                              className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Fim</label>
                            <input
                              type="time"
                              value={settings.schedule.hours?.end || '18:00'}
                              onChange={(e) => updateSettings({
                                schedule: { 
                                  ...settings.schedule, 
                                  hours: { ...settings.schedule.hours, end: e.target.value } 
                                }
                              })}
                              className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Behavior Section */}
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection('behavior')}
              className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <Cog className="w-4 h-4 text-orange-400" />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium">Comportamento</span>
                  <p className="text-xs text-dark-500">Como o agente deve se comportar</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${expandedSection === 'behavior' ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {expandedSection === 'behavior' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-dark-700/50"
                >
                  <div className="p-4 space-y-4">
                    {/* Activate On */}
                    <div>
                      <p className="text-sm font-medium text-white mb-2">Quando ativar</p>
                      <div className="space-y-2">
                        {activateOnOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                              settings.behavior.activate_on === option.value
                                ? 'bg-orange-500/10 border border-orange-500/30'
                                : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                            }`}
                          >
                            <input
                              type="radio"
                              name="activate_on"
                              value={option.value}
                              checked={settings.behavior.activate_on === option.value}
                              onChange={() => updateSettings({
                                behavior: { ...settings.behavior, activate_on: option.value }
                              })}
                              className="w-4 h-4 bg-dark-700 border-dark-600 text-orange-500"
                            />
                            <div>
                              <span className="text-sm text-white">{option.label}</span>
                              <p className="text-xs text-dark-500">{option.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Stop on Human Reply */}
                    <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer">
                      <div>
                        <span className="text-sm text-white">Parar quando humano responder</span>
                        <p className="text-xs text-dark-500">O agente para de responder quando um humano assume a conversa</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.behavior.stop_on_human_reply}
                        onChange={(e) => updateSettings({
                          behavior: { ...settings.behavior, stop_on_human_reply: e.target.checked }
                        })}
                        className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-orange-500"
                      />
                    </label>

                    {/* Cooldown */}
                    <div className="p-3 bg-dark-900/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white">Cooldown após transferência</span>
                        <span className="text-sm text-orange-400">
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
                        className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <p className="text-xs text-dark-500 mt-2">
                        Tempo que o agente aguarda antes de voltar a responder após uma transferência
                      </p>
                    </div>

                    {/* Max Messages */}
                    <div className="p-3 bg-dark-900/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-white">Limite de mensagens por conversa</span>
                        <span className="text-sm text-orange-400">
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
                        className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <p className="text-xs text-dark-500 mt-2">
                        Após este número de mensagens, o agente para de responder automaticamente (0 = ilimitado)
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
