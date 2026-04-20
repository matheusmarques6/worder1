'use client'

import { useState } from 'react'
import { Settings, Smartphone, Users, MessageSquare, Bot, Clock, ShieldCheck, Globe } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { QueuesTab } from '@/components/whatsapp/settings/QueuesTab'
import { QuickRepliesTab } from '@/components/whatsapp/settings/QuickRepliesTab'
import { AIAgentsTab } from '@/components/whatsapp/settings/AIAgentsTab'
import { BusinessHoursTab } from '@/components/whatsapp/settings/BusinessHoursTab'
import { OptStatusTab } from '@/components/whatsapp/settings/OptStatusTab'
import { WidgetTab } from '@/components/whatsapp/settings/WidgetTab'

type TabId = 'instances' | 'queues' | 'quick-replies' | 'ai-agents' | 'business-hours' | 'opt-status' | 'widget'

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'instances', label: 'Numeros', icon: Smartphone },
  { id: 'queues', label: 'Filas', icon: Users },
  { id: 'quick-replies', label: 'Respostas rapidas', icon: MessageSquare },
  { id: 'ai-agents', label: 'Agentes IA', icon: Bot },
  { id: 'business-hours', label: 'Horario', icon: Clock },
  { id: 'opt-status', label: 'Opt-in/Out', icon: ShieldCheck },
  { id: 'widget', label: 'Widget site', icon: Globe },
]

export default function WhatsAppSettingsPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const [activeTab, setActiveTab] = useState<TabId>('instances')

  const organizationId = user?.organization_id || 'default-org'
  const storeId = currentStore?.id

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="w-7 h-7 text-primary-500" />
            Configuracoes WhatsApp
          </h1>
          <p className="text-gray-500 mt-1">Configure numeros, filas, IA e integracoes</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl p-6 border">
          {activeTab === 'instances' && <InstancesTab organizationId={organizationId} />}
          {activeTab === 'queues' && <QueuesTab organizationId={organizationId} />}
          {activeTab === 'quick-replies' && <QuickRepliesTab organizationId={organizationId} />}
          {activeTab === 'ai-agents' && <AIAgentsTab organizationId={organizationId} />}
          {activeTab === 'business-hours' && <BusinessHoursTab organizationId={organizationId} storeId={storeId} />}
          {activeTab === 'opt-status' && <OptStatusTab organizationId={organizationId} />}
          {activeTab === 'widget' && <WidgetTab organizationId={organizationId} storeId={storeId} />}
        </div>
      </div>
    </div>
  )
}

function InstancesTab({ organizationId }: { organizationId: string }) {
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/meta/webhook`
    : ''

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Numeros WhatsApp</h3>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">URL do Webhook (Meta Business Suite)</h4>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono">{webhookUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(webhookUrl) }}
            className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Copiar
          </button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Configure este URL no Meta Business Suite ao conectar um novo numero WhatsApp.
        </p>
      </div>

      <div className="text-sm text-gray-600">
        Para adicionar ou gerenciar numeros, visite{' '}
        <a href="/whatsapp/settings" className="text-primary-600 underline hover:text-primary-700">
          a pagina de conexao
        </a>.
      </div>
    </div>
  )
}
