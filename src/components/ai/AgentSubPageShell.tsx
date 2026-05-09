'use client'

// =============================================
// Shell padrão para páginas internas do agente (/ai/agents/[id]/*).
// Estrutura: container Worder (px-8 py-10) + breadcrumb minimalista
// + sub-nav + page header. Status badge alinhado ao /lib/ai/ui/status.
// =============================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { AgentSubNav } from './AgentSubNav'
import { Badge } from './ui/primitives'
import { statusLabel } from '@/lib/ai/ui/status'
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

const STATUS_TONE: Record<AgentStatus, 'success' | 'subtle' | 'neutral'> = {
  draft: 'neutral',
  simulating: 'subtle',
  published: 'success',
  paused: 'neutral',
  archived: 'neutral',
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
    <div className="px-8 py-10 lg:px-12 lg:py-12 pb-16 max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-[#71717A] mb-4">
        <Link href="/ai" className="hover:text-[#18181B] transition-colors">
          IA
        </Link>
        <ChevronRight className="w-3 h-3 text-[#A1A1AA]" strokeWidth={1.75} />
        <Link href="/ai/agents" className="hover:text-[#18181B] transition-colors">
          Agentes
        </Link>
        {loadingAgent ? (
          <Loader2 className="w-3 h-3 animate-spin text-[#A1A1AA]" strokeWidth={1.75} />
        ) : agent ? (
          <>
            <ChevronRight className="w-3 h-3 text-[#A1A1AA]" strokeWidth={1.75} />
            <Link
              href={`/ai/agents/${agentId}`}
              className="text-[#18181B] hover:text-[#18181B] font-medium"
            >
              {agent.name}
            </Link>
            <Badge tone={STATUS_TONE[agent.status]} className="ml-1">
              {statusLabel(agent.status)}
            </Badge>
          </>
        ) : null}
      </div>

      <AgentSubNav agentId={agentId} />

      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-[26px] font-bold text-[#18181B] leading-tight"
            style={{ letterSpacing: '-0.03em' }}
          >
            {pageTitle}
          </h1>
          {pageDescription && (
            <p className="text-[14px] text-[#A1A1AA] mt-1">{pageDescription}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      {children}
    </div>
  )
}
