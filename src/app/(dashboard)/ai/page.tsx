'use client'

// IA Hub — core/agentes-por-evento.md §4.1/§4.2.
//
// A casa nova dos agentes (era /whatsapp/ai-agents, que agora redireciona
// para cá): as abas herdadas seguem as mesmas, e entra "Missões" — o catálogo
// por evento com o limite de concessão DENTRO de cada missão. Momentos têm
// página própria (/moments): momento é estado da loja, não do agente.

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores'
import AgentTab from '@/components/ai-hub/AgentTab'
import ActivityTab from '@/components/ai-hub/ActivityTab'
import LimitsTab from '@/components/ai-hub/LimitsTab'
import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import MissionsTab from '@/components/agents/MissionsTab'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Bot, BookOpen, BarChart3, Loader2, Shield, Target } from 'lucide-react'

// 10.3 — as 5 sub-abas do doc-fonte. Avaliação fundiu com Atividade
// (sub-views); API Keys foi absorvida pela área Motor & budget da radial.
type TabId = 'agents' | 'missions' | 'knowledge' | 'limits' | 'activity'

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agente', icon: Bot },
  { id: 'missions', label: 'Missões', icon: Target },
  { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
  { id: 'limits', label: 'Limites', icon: Shield },
  { id: 'activity', label: 'Atividade', icon: BarChart3 },
]

const VALID_TABS = TABS.map(t => t.id)

// Links antigos continuam aterrissando no lugar certo.
const LEGACY_TABS: Record<string, TabId> = {
  reports: 'activity',
  eval: 'activity',
  'api-keys': 'agents',
}

function resolveTab(raw: string | null | undefined): TabId {
  if (raw && VALID_TABS.includes(raw as TabId)) return raw as TabId
  if (raw && LEGACY_TABS[raw]) return LEGACY_TABS[raw]
  return 'agents'
}

function AiHubPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  const [activeTab, setActiveTab] = useState<TabId>(resolveTab(searchParams?.get('tab')))

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setActiveTab(resolveTab(searchParams?.get('tab')))
  }, [searchParams])

  if (!mounted || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    )
  }

  if (!user || !user.organization_id) {
    router.push('/login')
    return null
  }

  const organizationId = user.organization_id as string

  const handleTabChange = (id: TabId) => {
    setActiveTab(id)
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (id === 'agents') {
      params.delete('tab')
    } else {
      params.set('tab', id)
    }
    const qs = params.toString()
    router.replace(`/ai${qs ? `?${qs}` : ''}`)
  }

  return (
    // O layout do dashboard embrulha toda página em `p-4 lg:p-6` de fluxo
    // normal — bom para listas, ruim para uma bancada: `h-full` não resolvia
    // contra nada, o radial colapsava no mínimo e sobrava um mar de branco.
    // Margens negativas devolvem as bordas e o calc prende a altura ao
    // viewport (72px = top bar mobile; 61px = header sticky do desktop);
    // cada aba rola por dentro do próprio painel.
    <AgentsTheme
      className="flex flex-col -m-4 lg:-m-6 h-[calc(100dvh-72px)] lg:h-[calc(100dvh-61px)]"
      style={{ background: 'var(--bg)' }}
    >
      <div className="tabs-row">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`tab${isActive ? ' on' : ''}`}
            >
              <Icon />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'agents' && <AgentTab organizationId={organizationId} />}
        {activeTab === 'missions' && <MissionsTab />}
        {activeTab === 'knowledge' && <KnowledgeBasePanel organizationId={organizationId} />}
        {activeTab === 'limits' && <LimitsTab organizationId={organizationId} />}
        {activeTab === 'activity' && <ActivityTab organizationId={organizationId} />}
      </div>
    </AgentsTheme>
  )
}

export default function AiHubPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    }>
      <AiHubPageInner />
    </Suspense>
  )
}
