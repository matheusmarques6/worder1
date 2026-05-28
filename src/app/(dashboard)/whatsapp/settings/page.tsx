'use client'

import { useState } from 'react'
import { Settings, Smartphone, Users, MessageSquare, Clock, ShieldCheck, Globe } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { InstancesTab } from '@/components/whatsapp/settings/InstancesTab'
import { QueuesTab } from '@/components/whatsapp/settings/QueuesTab'
import { QuickRepliesTab } from '@/components/whatsapp/settings/QuickRepliesTab'
import { BusinessHoursTab } from '@/components/whatsapp/settings/BusinessHoursTab'
import { OptStatusTab } from '@/components/whatsapp/settings/OptStatusTab'
import { WidgetTab } from '@/components/whatsapp/settings/WidgetTab'

type TabId = 'instances' | 'queues' | 'quick-replies' | 'business-hours' | 'opt-status' | 'widget'

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'instances', label: 'Numeros', icon: Smartphone },
  { id: 'queues', label: 'Filas', icon: Users },
  { id: 'quick-replies', label: 'Respostas Rapidas', icon: MessageSquare },
  { id: 'business-hours', label: 'Horario', icon: Clock },
  { id: 'opt-status', label: 'Opt-in/Out', icon: ShieldCheck },
  { id: 'widget', label: 'Widget', icon: Globe },
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
          <p className="text-gray-500 mt-1">Configure numeros, filas, horarios e integracoes</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
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

        {/* Content */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          {activeTab === 'instances' && <InstancesTab organizationId={organizationId} />}
          {activeTab === 'queues' && <QueuesTab organizationId={organizationId} />}
          {activeTab === 'quick-replies' && <QuickRepliesTab organizationId={organizationId} />}
          {activeTab === 'business-hours' && <BusinessHoursTab organizationId={organizationId} storeId={storeId} />}
          {activeTab === 'opt-status' && <OptStatusTab organizationId={organizationId} />}
          {activeTab === 'widget' && <WidgetTab organizationId={organizationId} storeId={storeId} />}
        </div>
      </div>
    </div>
  )
}
