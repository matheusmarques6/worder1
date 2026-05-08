'use client'

// =============================================
// Shell padrão para páginas internas do agente (/ai/agents/[id]/*).
// Header com back-link + nome do agente + sub-nav + slot de conteúdo.
// =============================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AgentSubNav } from './AgentSubNav'
import { statusPillClass, statusLabel } from '@/lib/ai/ui/status'
import type { AgentStatus } from '@/lib/ai/types'

interface AgentLite {
  id: string
  name: string
  status: AgentStatus
  role: string
}

interface AgentSubPageShellProps {
  agentId: string
  pageTitle: string
  pageDescription?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function AgentSubPageShell({
  agentId,
  pageTitle,
  pageDescription,
  actions,
  children,
}: AgentSubPageShellProps) {
  const [agent, setAgent] = useState<AgentLite | null>(null)
  const [loadingAgent, setLoadingAgent] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingAgent(true)
    fetch(`/api/ai/agents/${agentId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.agent) {
          setAgent({
            id: j.agent.id,
            name: j.agent.name,
            status: j.agent.status,
            role: j.agent.role,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAgent(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Top bar: back + agent identity */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href="/ai/agents"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900
                     transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Agentes
        </Link>
        {loadingAgent ? (
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" strokeWidth={1.75} />
        ) : agent ? (
          <>
            <span className="text-zinc-300">/</span>
            <Link
              href={`/ai/agents/${agentId}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900
                         hover:text-orange-600 transition-colors"
            >
              {agent.name}
            </Link>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusPillClass(
                agent.status,
              )}`}
            >
              {statusLabel(agent.status)}
            </span>
          </>
        ) : null}
      </div>

      <AgentSubNav agentId={agentId} />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{pageTitle}</h1>
          {pageDescription && (
            <p className="text-sm text-zinc-500 mt-1">{pageDescription}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  )
}
