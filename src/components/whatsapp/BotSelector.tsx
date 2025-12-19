'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, ChevronDown, Power, Loader2 } from 'lucide-react'

interface AIAgent {
  id: string
  name: string
  description?: string
}

interface BotSelectorProps {
  conversationId: string
  organizationId: string
  currentAgentId?: string | null
  isBotActive: boolean
  onBotChange: (isActive: boolean, agent: AIAgent | null) => void
}

export default function BotSelector({
  conversationId,
  organizationId,
  currentAgentId,
  isBotActive,
  onBotChange,
}: BotSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [changing, setChanging] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Carregar agentes
  useEffect(() => {
    const fetchAgents = async () => {
      if (!organizationId) return
      setLoading(true)
      try {
        const res = await fetch(`/api/ai-agents?organizationId=${organizationId}`)
        const data = await res.json()
        setAgents(data.agents || [])
      } catch (error) {
        console.error('Error fetching agents:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAgents()
  }, [organizationId])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectAgent = async (agent: AIAgent | null) => {
    setChanging(true)
    try {
      const res = await fetch(`/api/whatsapp/inbox/conversations/${conversationId}/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent?.id || null,
          isActive: !!agent,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onBotChange(!!agent, agent)
      }
    } catch (error) {
      console.error('Error changing bot:', error)
    } finally {
      setChanging(false)
      setIsOpen(false)
    }
  }

  const currentAgent = agents.find(a => a.id === currentAgentId)
  const displayText = isBotActive && currentAgent ? currentAgent.name : 'Bot Off'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={changing}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          isBotActive
            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white'
        }`}
      >
        {changing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
        <span className="max-w-[100px] truncate">{displayText}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Opção de desativar */}
          <button
            onClick={() => handleSelectAgent(null)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700 transition-colors ${
              !isBotActive ? 'bg-dark-700/50' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <Power className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Desativar Bot</p>
              <p className="text-xs text-dark-400">Responder manualmente</p>
            </div>
          </button>

          <div className="border-t border-dark-700" />

          {/* Lista de agentes */}
          {loading ? (
            <div className="px-4 py-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-dark-400 mx-auto" />
              <p className="text-xs text-dark-500 mt-2">Carregando agentes...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bot className="w-8 h-8 text-dark-500 mx-auto mb-2" />
              <p className="text-sm text-dark-400">Nenhum agente criado</p>
              <p className="text-xs text-dark-500 mt-1">Crie um agente em Configurações</p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-700 transition-colors ${
                    currentAgentId === agent.id ? 'bg-primary-500/10' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentAgentId === agent.id 
                      ? 'bg-primary-500/20' 
                      : 'bg-dark-600'
                  }`}>
                    <Bot className={`w-4 h-4 ${
                      currentAgentId === agent.id 
                        ? 'text-primary-400' 
                        : 'text-dark-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      currentAgentId === agent.id 
                        ? 'text-primary-400' 
                        : 'text-white'
                    }`}>
                      {agent.name}
                    </p>
                    {agent.description && (
                      <p className="text-xs text-dark-400 truncate">{agent.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
