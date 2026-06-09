'use client'

import { useEffect, useRef, useState } from 'react'
import {
  X,
  Send,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  Zap,
  Database,
  Cpu,
  ArrowRightLeft,
  MessageCircle,
  Activity,
} from 'lucide-react'
import { AIAgent } from '@/lib/ai/types'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { SegmentedControl } from '@/components/agents/ui/primitives'

export interface PlaygroundMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    sources_used?: string[]
    actions_triggered?: string[]
    response_time_ms?: number
    tokens_used?: number
    was_transferred?: boolean
    transfer_to?: string
  }
}

interface AgentPlaygroundViewProps {
  agent: AIAgent
  messages: PlaygroundMessage[]
  input: string
  loading: boolean
  error: string
  onInputChange: (value: string) => void
  onSend: () => void
  onClear: () => void
  onDismissError: () => void
  onClose: () => void
}

const SUGGESTIONS = ['Olá, tudo bem?', 'Qual o preço?', 'Quero falar com um humano', 'Preciso de ajuda']

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function AgentPlaygroundView({
  agent,
  messages,
  input,
  loading,
  error,
  onInputChange,
  onSend,
  onClear,
  onDismissError,
  onClose,
}: AgentPlaygroundViewProps) {
  const [view, setView] = useState<'chat' | 'trace'>('chat')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const pick = (text: string) => {
    onInputChange(text)
    inputRef.current?.focus()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <AgentsTheme className="pg">
      {/* top bar: chat / trace toggle + actions */}
      <div className="pg-bar">
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: 'chat', label: 'Chat', icon: <MessageCircle /> },
            { value: 'trace', label: 'Trace', icon: <Activity /> },
          ]}
        />
        <div style={{ flex: 1 }} />
        <button className="btn btn-icon btn-soft" title="Limpar conversa" onClick={onClear}>
          <RefreshCw />
        </button>
        <button className="btn btn-icon btn-soft" title="Fechar" onClick={onClose}>
          <X />
        </button>
      </div>

      {view === 'trace' ? (
        <TracePanel message={lastAssistant} />
      ) : (
        <div className="pg-phone">
          <div className="pg-wa-bg" />
          {/* WhatsApp header */}
          <div className="pg-head">
            <span className="pa">🤖</span>
            <div>
              <div className="pn">{agent.name}</div>
              <div className="ps">{loading ? 'digitando…' : 'online'}</div>
            </div>
          </div>

          {/* messages */}
          <div className="pg-msgs scroll-y">
            {messages.length === 0 && (
              <div className="bub them">
                Envie uma mensagem para ver como <b>{agent.name}</b> responde com as configurações atuais.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`bub ${m.role === 'user' ? 'me' : 'them'}`}>
                {m.content}
                <span className="bt">{formatTime(m.timestamp)}</span>
              </div>
            ))}
            {loading && (
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* suggestions */}
          {messages.length === 0 && (
            <div className="pg-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="sug" onClick={() => pick(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* error */}
          {error && (
            <div className="callout" style={{ background: 'var(--red-tint)', color: 'var(--red)', margin: '0 12px 8px', zIndex: 2 }}>
              <AlertCircle style={{ width: 16, height: 16, flex: '0 0 auto' }} />
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={onDismissError} style={{ color: 'inherit' }}>
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>
          )}

          {/* input */}
          <div className="pg-input">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite uma mensagem…"
              disabled={loading}
            />
            <button className="pg-send" onClick={onSend} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} /> : <Send style={{ width: 18, height: 18 }} />}
            </button>
          </div>
        </div>
      )}
    </AgentsTheme>
  )
}

/* ---------------- TracePanel ---------------- */
function TracePanel({ message }: { message?: PlaygroundMessage }) {
  if (!message || !message.metadata) {
    return (
      <div className="trace scroll-y" style={{ flex: 1 }}>
        <div className="trace-empty">
          Envie uma mensagem no Chat para inspecionar o trace (fontes, ações, tokens e latência) da
          última resposta.
        </div>
      </div>
    )
  }

  const m = message.metadata
  const items: { icon: React.ReactNode; bg: string; fg: string; title: string; detail: string }[] = []

  if (typeof m.response_time_ms === 'number') {
    items.push({
      icon: <Clock />,
      bg: 'var(--brand-tint)',
      fg: 'var(--brand)',
      title: 'Latência',
      detail: `${m.response_time_ms} ms`,
    })
  }
  if (typeof m.tokens_used === 'number') {
    items.push({
      icon: <Cpu />,
      bg: 'var(--purple-tint)',
      fg: 'var(--purple)',
      title: 'Tokens',
      detail: `${m.tokens_used.toLocaleString('pt-BR')} tokens`,
    })
  }
  items.push({
    icon: <Database />,
    bg: 'var(--blue-tint)',
    fg: 'var(--blue)',
    title: 'Fontes (RAG)',
    detail: m.sources_used && m.sources_used.length > 0 ? m.sources_used.join(', ') : 'Nenhuma fonte consultada',
  })
  items.push({
    icon: <Zap />,
    bg: 'var(--amber-tint)',
    fg: 'var(--amber)',
    title: 'Ações disparadas',
    detail: m.actions_triggered && m.actions_triggered.length > 0 ? m.actions_triggered.join(', ') : 'Nenhuma ação',
  })
  if (m.was_transferred) {
    items.push({
      icon: <ArrowRightLeft />,
      bg: 'var(--red-tint)',
      fg: 'var(--red)',
      title: 'Transferido para humano',
      detail: m.transfer_to ? `→ ${m.transfer_to}` : 'Handoff acionado',
    })
  }

  return (
    <div className="trace scroll-y" style={{ flex: 1 }}>
      {items.map((it, i) => (
        <div key={i} className="trace-item">
          <span className="trace-ico" style={{ background: it.bg, color: it.fg }}>
            {it.icon}
          </span>
          <div>
            <div className="trace-t">{it.title}</div>
            <div className="trace-d">{it.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
