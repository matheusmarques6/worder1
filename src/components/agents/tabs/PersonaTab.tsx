'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
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
} from 'lucide-react'
import { AIAgent, AgentPersona } from '@/lib/ai/types'
import { AccordionItem } from '../ui/primitives'

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
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <UserCircle />
        </div>
        <div>
          <h3 className="sec-t">Persona</h3>
          <p className="sec-s">Configure a personalidade e comportamento do agente</p>
        </div>
      </div>

      {/* Role Description */}
      <AccordionItem
        open={expandedSection === 'role'}
        onToggle={() => toggleSection('role')}
        title={
          <div className="flex items-center gap-3">
            <div className="act-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span style={{ color: 'var(--text)' }}>Função e Personalidade</span>
              <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Descreva quem é o agente e como ele deve se comportar</p>
            </div>
          </div>
        }
      >
        <textarea
          value={persona.role_description}
          onChange={(e) => updatePersona({ role_description: e.target.value.slice(0, 1500) })}
          placeholder="Você é um assistente de suporte ao cliente. Sua função é responder perguntas dos usuários de forma clara, profissional e com base em informações precisas..."
          className="field"
          style={{ minHeight: 160 }}
        />
        <div className="flex justify-between mt-2">
          <p className="hint" style={{ marginTop: 0 }}>
            Descreva o papel, personalidade e estilo de comunicação do agente
          </p>
          <span className="text-xs" style={{ color: persona.role_description.length > 1400 ? 'var(--amber)' : 'var(--text-3)' }}>
            {persona.role_description.length}/1500
          </span>
        </div>
      </AccordionItem>

      {/* Tone, Length, Language */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tone */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <Volume2 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <span className="label" style={{ marginBottom: 0 }}>Tom de Voz</span>
          </div>
          <div className="space-y-2">
            {toneOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updatePersona({ tone: option.value })}
                className={`selcard ${persona.tone === option.value ? 'on' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, width: '100%' }}
              >
                <span className="text-lg">{option.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{option.label}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Response Length */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <AlignLeft className="w-4 h-4" style={{ color: 'var(--blue)' }} />
            <span className="label" style={{ marginBottom: 0 }}>Tamanho das Respostas</span>
          </div>
          <div className="space-y-2">
            {responseLengthOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updatePersona({ response_length: option.value })}
                className={`selcard ${persona.response_length === option.value ? 'on' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, width: '100%' }}
              >
                <span className="text-lg">{option.icon}</span>
                <div className="flex-1">
                  <p className="text-sm" style={{ color: 'var(--text)', fontWeight: 600 }}>{option.label}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4" style={{ color: 'var(--green)' }} />
            <span className="label" style={{ marginBottom: 0 }}>Idioma</span>
          </div>
          <div className="space-y-2">
            {languageOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updatePersona({ language: option.value })}
                className={`selcard ${persona.language === option.value ? 'on' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, width: '100%' }}
              >
                <span className="text-lg">{option.flag}</span>
                <span className="text-sm flex-1" style={{ color: 'var(--text)', fontWeight: 600 }}>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reply Delay */}
      <div className="card" style={{ padding: 16 }}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" style={{ color: 'var(--brand)' }} />
          <span className="label" style={{ marginBottom: 0 }}>Pausa Antes de Responder</span>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="60"
            value={persona.reply_delay}
            onChange={(e) => updatePersona({ reply_delay: parseInt(e.target.value) })}
            className="range flex-1"
          />
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg min-w-[100px]" style={{ background: 'var(--surface-3)' }}>
            <input
              type="number"
              min="1"
              max="86400"
              value={persona.reply_delay}
              onChange={(e) => updatePersona({ reply_delay: Math.min(86400, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="w-16 text-center focus:outline-none"
              style={{ background: 'transparent', color: 'var(--text)', border: 'none' }}
            />
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>seg</span>
          </div>
        </div>

        <div className="callout mt-3">
          <Info className="w-4 h-4 flex-shrink-0" />
          <p>
            Às vezes os clientes enviam várias mensagens seguidas. O agente aguardará este tempo antes de responder,
            permitindo considerar todo o contexto. O timer reinicia a cada nova mensagem.
          </p>
        </div>
      </div>

      {/* Guidelines */}
      <AccordionItem
        open={expandedSection === 'guidelines'}
        onToggle={() => toggleSection('guidelines')}
        title={
          <div className="flex items-center gap-3 flex-1">
            <div className="act-ico" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span style={{ color: 'var(--text)' }}>Diretrizes</span>
              <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>Regras que o agente SEMPRE seguirá</p>
            </div>
            <span className="chip">{persona.guidelines.length}/50</span>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Existing Guidelines */}
          {persona.guidelines.length > 0 ? (
            <div className="space-y-2">
              {persona.guidelines.map((guideline, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-start gap-2 p-3 rounded-lg group"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <GripVertical className="w-4 h-4 flex-shrink-0 mt-0.5 cursor-grab" style={{ color: 'var(--text-4)' }} />
                  <span className="text-sm" style={{ color: 'var(--green)' }}>✓</span>
                  <p className="flex-1 text-sm" style={{ color: 'var(--text-2)' }}>{guideline}</p>
                  <button
                    onClick={() => removeGuideline(index)}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
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
                className="field flex-1"
              />
              <button
                onClick={addGuideline}
                disabled={!newGuideline.trim()}
                className="btn btn-primary btn-icon"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          <p className="hint">
            Máximo de 50 diretrizes, 300 caracteres cada. Pressione Enter para adicionar.
          </p>
        </div>
      </AccordionItem>

      {/* Quick Tips */}
      <div className="callout brand" style={{ flexDirection: 'column', gap: 6 }}>
        <h4 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--brand-ink)' }}>
          <Sparkles className="w-4 h-4" />
          Dicas para uma boa persona
        </h4>
        <ul className="text-sm space-y-1" style={{ color: 'var(--brand-ink)' }}>
          <li>• Seja específico sobre o papel e contexto do agente</li>
          <li>• Defina limites claros (o que o agente deve e não deve fazer)</li>
          <li>• Use diretrizes para regras inquebráveis</li>
          <li>• Ajuste o tom de voz de acordo com seu público</li>
        </ul>
      </div>
    </div>
  )
}
