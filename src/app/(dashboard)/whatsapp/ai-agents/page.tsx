'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores'
import AIAgentList from '@/components/agents/AIAgentList'
import ApiKeysManager from '@/components/whatsapp/ApiKeysManager'
import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import ReportsView from '@/components/agents/reports/ReportsView'
import EvalView from '@/components/agents/eval/EvalView'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Bot, Key, BookOpen, BarChart3, ClipboardCheck, Loader2 } from 'lucide-react'

type TabId = 'agents' | 'reports' | 'eval' | 'knowledge' | 'api-keys'

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'eval', label: 'Avaliação', icon: ClipboardCheck },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { id: 'api-keys', label: 'API Keys', icon: Key },
]

const VALID_TABS = TABS.map(t => t.id)

function AIAgentsPageInner() {
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
    router.replace(`/whatsapp/ai-agents${qs ? `?${qs}` : ''}`)
  }

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Tabs */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'agents' && <AIAgentList organizationId={organizationId} />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'eval' && <EvalView organizationId={organizationId} />}
        {activeTab === 'knowledge' && <KnowledgeBasePanel organizationId={organizationId} />}
        {activeTab === 'api-keys' && <ApiKeysManager />}
      </div>
    </AgentsTheme>
  )
}

export default function AIAgentsPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    }>
      <AIAgentsPageInner />
    </Suspense>
  )
}
