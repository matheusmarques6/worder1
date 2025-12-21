'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Clock,
  Zap,
  Database,
} from 'lucide-react'
import { AIAgent } from '@/lib/ai/types'

interface AgentPreviewProps {
  agent: AIAgent
  onClose: () => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    sources_used?: string[]
    actions_triggered?: string[]
    response_time_ms?: number
    tokens_used?: number
  }
}

export default function AgentPreview({ agent, onClose }: AgentPreviewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Send message
  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const startTime = Date.now()

      const res = await fetch(`/api/ai/agents/${agent.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: agent.organization_id,
          message: userMessage.content,
          conversation_history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar mensagem')
      }

      const responseTime = Date.now() - startTime

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'Sem resposta',
        timestamp: new Date(),
        metadata: {
          sources_used: data.sources_used,
          actions_triggered: data.actions_triggered,
          response_time_ms: responseTime,
          tokens_used: data.tokens_used,
        },
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Clear conversation
  const handleClear = () => {
    setMessages([])
    setError('')
    inputRef.current?.focus()
  }

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-full flex flex-col bg-dark-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">Preview</h4>
            <p className="text-xs text-dark-500">Teste o agente em tempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="p-2 rounded-lg bg-dark-800 text-dark-400 hover:text-white transition-colors"
            title="Limpar conversa"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-dark-800 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary-400" />
            </div>
            <h4 className="text-white font-medium mb-1">Teste seu agente</h4>
            <p className="text-sm text-dark-500 max-w-xs">
              Envie uma mensagem para ver como o agente responde com as configurações atuais.
            </p>

            {/* Quick prompts */}
            <div className="mt-6 space-y-2">
              <p className="text-xs text-dark-600">Sugestões:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'Olá, tudo bem?',
                  'Qual o preço?',
                  'Quero falar com um humano',
                  'Preciso de ajuda',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt)
                      inputRef.current?.focus()
                    }}
                    className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white rounded-full text-xs transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user'
                      ? 'bg-blue-500/20'
                      : 'bg-purple-500/20'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Bot className="w-4 h-4 text-purple-400" />
                  )}
                </div>

                {/* Message */}
                <div
                  className={`flex-1 max-w-[85%] ${
                    message.role === 'user' ? 'text-right' : ''
                  }`}
                >
                  <div
                    className={`inline-block px-4 py-2.5 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-dark-800 text-dark-200 rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Metadata */}
                  {message.role === 'assistant' && message.metadata && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-dark-600">
                      {message.metadata.response_time_ms && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {message.metadata.response_time_ms}ms
                        </span>
                      )}
                      {message.metadata.sources_used && message.metadata.sources_used.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {message.metadata.sources_used.length} fontes
                        </span>
                      )}
                      {message.metadata.actions_triggered && message.metadata.actions_triggered.length > 0 && (
                        <span className="flex items-center gap-1 text-yellow-500">
                          <Zap className="w-3 h-3" />
                          {message.metadata.actions_triggered.length} ações
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Loading */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
                <div className="bg-dark-800 px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="text-sm text-dark-400">Digitando...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mx-4 mb-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-4 border-t border-dark-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite uma mensagem..."
            disabled={loading}
            className="flex-1 px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-700 disabled:to-dark-700 text-white rounded-xl transition-all"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Agent info */}
        <div className="flex items-center justify-between mt-3 text-xs text-dark-600">
          <span>
            {agent.provider} • {agent.model}
          </span>
          <span>
            Temp: {agent.temperature} • Max: {agent.max_tokens} tokens
          </span>
        </div>
      </div>
    </div>
  )
}
