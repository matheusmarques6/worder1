'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores'
import AIAgentList from '@/components/agents/AIAgentList'
import ApiKeysManager from '@/components/whatsapp/ApiKeysManager'
import { Bot, Key, Loader2 } from 'lucide-react'

type TabId = 'agents' | 'api-keys'

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'api-keys', label: 'API Keys', icon: Key },
]

function AIAgentsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  const initialTab = (searchParams?.get('tab') === 'api-keys' ? 'api-keys' : 'agents') as TabId
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const t = searchParams?.get('tab')
    if (t === 'api-keys' || t === 'agents') {
      setActiveTab(t as TabId)
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
    <div className="h-full bg-white flex flex-col">
      {/* Tabs */}
      <div className="px-6 pt-4 border-b border-gray-200">
        <div className="flex items-center gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                  isActive
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'agents' && <AIAgentList organizationId={organizationId} />}
        {activeTab === 'api-keys' && <ApiKeysManager />}
      </div>
    </div>
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
