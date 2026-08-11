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
import ApiKeysManager from '@/components/whatsapp/ApiKeysManager'
import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import MissionsTab from '@/components/agents/MissionsTab'
import ReportsView from '@/components/agents/reports/ReportsView'
import EvalView from '@/components/agents/eval/EvalView'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Bot, Key, BookOpen, BarChart3, ClipboardCheck, Loader2, Target } from 'lucide-react'

type TabId = 'agents' | 'missions' | 'knowledge' | 'reports' | 'eval' | 'api-keys'

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agente', icon: Bot },
  { id: 'missions', label: 'Missões', icon: Target },
  { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
  { id: 'reports', label: 'Atividade', icon: BarChart3 },
  { id: 'eval', label: 'Avaliação', icon: ClipboardCheck },
  { id: 'api-keys', label: 'API Keys', icon: Key },
]

const VALID_TABS = TABS.map(t => t.id)

function AiHubPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  const paramTab = searchParams?.get('tab')
  const initialTab = (paramTab && VALID_TABS.includes(paramTab as TabId) ? paramTab : 'agents') as TabId
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const t = searchParams?.get('tab')
    if (t && VALID_TABS.includes(t as TabId)) {
      setActiveTab(t as TabId)
    } else if (!t) {
      setActiveTab('agents')
    }
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
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
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
        {activeTab === 'reports' && <ReportsView organizationId={organizationId} />}
        {activeTab === 'eval' && <EvalView organizationId={organizationId} />}
        {activeTab === 'api-keys' && <ApiKeysManager />}
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
