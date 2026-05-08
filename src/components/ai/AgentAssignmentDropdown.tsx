'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Check, ChevronDown, Loader2, X } from 'lucide-react'
import { useAuthStore } from '@/stores'
import type { Agent } from '@/lib/ai/types'

// =============================================
// Dropdown para atribuir / trocar / remover o agente IA de uma conversa.
// Estética Worder (laranja primary + zinc neutro), Lucide stroke 1.75.
// =============================================

interface AgentAssignmentDropdownProps {
  conversationId: string
  currentAgentId?: string | null
  onChange?: (agentId: string | null) => void
  variant?: 'inline' | 'compact'
}

interface PublishedAgent {
  id: string
  name: string
  role: string
  status: string
}

export function AgentAssignmentDropdown({
  conversationId,
  currentAgentId = null,
  onChange,
  variant = 'inline',
}: AgentAssignmentDropdownProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<PublishedAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<string | null>(currentAgentId)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelected(currentAgentId)
  }, [currentAgentId])

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Carrega agentes da org
  useEffect(() => {
    if (!open || !organizationId || agents.length > 0) return
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/ai/agents?organization_id=${organizationId}&limit=50`,
        )
        const data = await res.json()
        const list = (data.agents || []).filter((a: Agent) => a.status === 'published')
        setAgents(
          list.map((a: Agent) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            status: a.status,
          })),
        )
      } catch (err) {
        console.error('[agent-assignment] fetch', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, organizationId, agents.length])

  const choose = async (agentId: string | null) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/assign-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
      const data = await res.json()
      if (res.ok) {
        setSelected(agentId)
        onChange?.(agentId)
        setOpen(false)
      } else {
        console.error('[agent-assignment] save', data?.error)
      }
    } finally {
      setSaving(false)
    }
  }

  const currentName =
    selected ? agents.find((a) => a.id === selected)?.name ?? 'Agente atribuído' : 'Sem agente'

  if (variant === 'compact') {
    return (
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            selected
              ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
              : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <Bot className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span className="max-w-[8rem] truncate">{currentName}</span>
          <ChevronDown className="w-3 h-3" strokeWidth={1.75} />
        </button>
        {open && (
          <Popover
            agents={agents}
            loading={loading}
            saving={saving}
            selected={selected}
            onChoose={choose}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md
                   bg-white border border-zinc-200 hover:border-zinc-300 transition-colors text-sm"
      >
        <span className="inline-flex items-center gap-2">
          <Bot
            className={`w-4 h-4 ${selected ? 'text-orange-600' : 'text-zinc-400'}`}
            strokeWidth={1.75}
          />
          <span className={selected ? 'text-zinc-900' : 'text-zinc-500'}>
            {currentName}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
      </button>
      {open && (
        <Popover
          agents={agents}
          loading={loading}
          saving={saving}
          selected={selected}
          onChoose={choose}
        />
      )}
    </div>
  )
}

function Popover({
  agents,
  loading,
  saving,
  selected,
  onChoose,
}: {
  agents: PublishedAgent[]
  loading: boolean
  saving: boolean
  selected: string | null
  onChoose: (id: string | null) => void
}) {
  return (
    <div className="absolute z-50 right-0 mt-1 w-72 bg-white border border-zinc-200 rounded-lg shadow-md p-1 max-h-80 overflow-auto">
      {loading ? (
        <div className="px-3 py-4 text-xs text-zinc-500 inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          Carregando agentes…
        </div>
      ) : agents.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500">
          Nenhum agente publicado nessa organização.
          <br />
          Crie um em <span className="font-medium">/ai/agents/new</span>.
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={saving}
            onClick={() => onChoose(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              selected === null ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
            <span className="flex-1 text-left">Sem agente (humano-only)</span>
            {selected === null && (
              <Check className="w-4 h-4 text-orange-600" strokeWidth={1.75} />
            )}
          </button>
          <div className="my-1 h-px bg-zinc-100" />
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={saving}
              onClick={() => onChoose(a.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                selected === a.id
                  ? 'bg-orange-50 text-orange-700'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Bot
                className={`w-4 h-4 ${
                  selected === a.id ? 'text-orange-600' : 'text-zinc-400'
                }`}
                strokeWidth={1.75}
              />
              <span className="flex-1 text-left">
                <span className="font-medium">{a.name}</span>
                <span className="block text-xs text-zinc-500">{a.role}</span>
              </span>
              {selected === a.id && (
                <Check className="w-4 h-4 text-orange-600" strokeWidth={1.75} />
              )}
            </button>
          ))}
        </>
      )}
      {saving && (
        <div className="px-3 py-2 text-xs text-zinc-500 inline-flex items-center gap-2 border-t border-zinc-100 mt-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          Salvando…
        </div>
      )}
    </div>
  )
}
