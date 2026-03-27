'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserCircle,
  MessageSquare,
  Clock,
  Globe,
  Plus,
  Trash2,
  GripVertical,
  Info,
  Sparkles,
  Volume2,
  AlignLeft,
  ChevronDown,
} from 'lucide-react'
import { AIAgent, AgentPersona } from '@/lib/ai/types'

interface PersonaTabProps {
  agent: AIAgent
  onUpdate: (updates: Partial<AIAgent>) => void
}

const toneOptions = [
  { value: 'casual', label: 'Casual', description: 'Descontraído e informal', emoji: '😊' },
  { value: 'friendly', label: 'Amigável', description: 'Cordial e acolhedor', emoji: '🤝' },
  { value: 'professional', label: 'Profissional', description: 'Formal e objetivo', emoji: '👔' },
] as const

const responseLengthOptions = [
  { value: 'short', label: 'Curtas', description: '100-200 caracteres', icon: '📝' },
  { value: 'medium', label: 'Médias', description: '150-250 caracteres', icon: '📄' },
  { value: 'long', label: 'Longas', description: '200-300 caracteres', icon: '📜' },
] as const

const languageOptions = [
  { value: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'auto', label: 'Automático', flag: '🌐' },
] as const

export default function PersonaTab({ agent, onUpdate }: PersonaTabProps) {
  const [newGuideline, setNewGuideline] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('role')

  const persona = agent.persona || {
    role_description: '',
    tone: 'friendly',
    response_length: 'medium',
    language: 'pt-BR',
    reply_delay: 3,
    guidelines: [],
  }

  const updatePersona = (updates: Partial<AgentPersona>) => {
    onUpdate({
      persona: { ...persona, ...updates },
    })
  }

  const addGuideline = () => {
    if (!newGuideline.trim()) return
    if (persona.guidelines.length >= 50) return
    
    updatePersona({
      guidelines: [...persona.guidelines, newGuideline.trim()],
    })
    setNewGuideline('')
  }

  const removeGuideline = (index: number) => {
    updatePersona({
      guidelines: persona.guidelines.filter((_, i) => i !== index),
    })
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <UserCircle className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Persona</h3>
          <p className="text-sm text-gray-500">Configure a personalidade e comportamento do agente</p>
        </div>
      </div>

      {/* Role Description */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('role')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-left">
              <span className="text-white font-medium">Função e Personalidade</span>
              <p className="text-xs text-gray-400">Descreva quem é o agente e como ele deve se comportar</p>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${expandedSection === 'role' ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {expandedSection === 'role' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-gray-200"
            >
              <div className="p-4">
                <textarea
                  value={persona.role_description}
                  onChange={(e) => updatePersona({ role_description: e.target.value.slice(0, 1500) })}
                  placeholder="Você é um assistente de suporte ao cliente. Sua função é responder perguntas dos usuários de forma clara, profissional e com base em informações precisas..."
                  className="w-full h-40 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder:text-gray-400 resize-none focus:outline-none focus:border-purple-500/50"
                />
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-gray-400">
                    Descreva o papel, personalidade e estilo de comunicação do agente
                  </p>
                  <span className={`text-xs ${persona.role_description.length > 1400 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {persona.role_description.length}/1500
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tone, Length, Language */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tone */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Volume2 className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-900">Tom de Voz</span>
          </div>
          <div className="space-y-2">
            {toneOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  persona.tone === option.value
                    ? 'bg-purple-500/20 border border-purple-500/30'
                    : 'bg-gray-50 border border-transparent hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="tone"
                  value={option.value}
                  checked={persona.tone === option.value}
                  onChange={() => updatePersona({ tone: option.value })}
                  className="sr-only"
                />
                <span className="text-lg">{option.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm text-white">{option.label}</p>
                  <p className="text-xs text-gray-400">{option.description}</p>
                </div>
                {persona.tone === option.value && (
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Response Length */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlignLeft className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-gray-900">Tamanho das Respostas</span>
          </div>
          <div className="space-y-2">
            {responseLengthOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  persona.response_length === option.value
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : 'bg-gray-50 border border-transparent hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="response_length"
                  value={option.value}
                  checked={persona.response_length === option.value}
                  onChange={() => updatePersona({ response_length: option.value })}
                  className="sr-only"
                />
                <span className="text-lg">{option.icon}</span>
                <div className="flex-1">
                  <p className="text-sm text-white">{option.label}</p>
                  <p className="text-xs text-gray-400">{option.description}</p>
                </div>
                {persona.response_length === option.value && (
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-gray-900">Idioma</span>
          </div>
          <div className="space-y-2">
            {languageOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  persona.language === option.value
                    ? 'bg-green-500/20 border border-green-500/30'
                    : 'bg-gray-50 border border-transparent hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="language"
                  value={option.value}
                  checked={persona.language === option.value}
                  onChange={() => updatePersona({ language: option.value })}
                  className="sr-only"
                />
                <span className="text-lg">{option.flag}</span>
                <span className="text-sm text-white flex-1">{option.label}</span>
                {persona.language === option.value && (
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Reply Delay */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-gray-900">Pausa Antes de Responder</span>
        </div>
        
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="60"
            value={persona.reply_delay}
            onChange={(e) => updatePersona({ reply_delay: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg min-w-[100px]">
            <input
              type="number"
              min="1"
              max="86400"
              value={persona.reply_delay}
              onChange={(e) => updatePersona({ reply_delay: Math.min(86400, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="w-16 bg-transparent text-white text-center focus:outline-none"
            />
            <span className="text-gray-500 text-sm">seg</span>
          </div>
        </div>
        
        <div className="flex items-start gap-2 mt-3 p-3 bg-gray-50 rounded-lg">
          <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Às vezes os clientes enviam várias mensagens seguidas. O agente aguardará este tempo antes de responder,
            permitindo considerar todo o contexto. O timer reinicia a cada nova mensagem.
          </p>
        </div>
      </div>

      {/* Guidelines */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection('guidelines')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-left">
              <span className="text-white font-medium">Diretrizes</span>
              <p className="text-xs text-gray-400">Regras que o agente SEMPRE seguirá</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
              {persona.guidelines.length}/50
            </span>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${expandedSection === 'guidelines' ? 'rotate-180' : ''}`} />
          </div>
        </button>

        <AnimatePresence>
          {expandedSection === 'guidelines' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-gray-200"
            >
              <div className="p-4 space-y-3">
                {/* Existing Guidelines */}
                {persona.guidelines.length > 0 ? (
                  <div className="space-y-2">
                    {persona.guidelines.map((guideline, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg group"
                      >
                        <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5 cursor-grab" />
                        <span className="text-yellow-400 text-sm">✓</span>
                        <p className="flex-1 text-sm text-gray-600">{guideline}</p>
                        <button
                          onClick={() => removeGuideline(index)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Nenhuma diretriz adicionada. Adicione regras que o agente deve sempre seguir.
                  </p>
                )}

                {/* Add New Guideline */}
                {persona.guidelines.length < 50 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGuideline}
                      onChange={(e) => setNewGuideline(e.target.value.slice(0, 300))}
                      onKeyDown={(e) => e.key === 'Enter' && addGuideline()}
                      placeholder="Digite uma nova diretriz..."
                      className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:border-yellow-500/50"
                    />
                    <button
                      onClick={addGuideline}
                      disabled={!newGuideline.trim()}
                      className="px-4 py-2.5 bg-yellow-500/20 text-yellow-400 rounded-xl hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Máximo de 50 diretrizes, 300 caracteres cada. Pressione Enter para adicionar.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Tips */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          Dicas para uma boa persona
        </h4>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>• Seja específico sobre o papel e contexto do agente</li>
          <li>• Defina limites claros (o que o agente deve e não deve fazer)</li>
          <li>• Use diretrizes para regras inquebráveis</li>
          <li>• Ajuste o tom de voz de acordo com seu público</li>
        </ul>
      </div>
    </div>
  )
}
