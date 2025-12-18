'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Send, Bot } from 'lucide-react'
import InboxTab from './components/InboxTab'
import CampaignsTab from './components/CampaignsTab'
import AgentsTab from './components/AgentsTab'

type TabType = 'inbox' | 'campaigns' | 'agents'

const tabs: { id: TabType; label: string; icon: any }[] = [
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'campaigns', label: 'Campanhas', icon: Send },
  { id: 'agents', label: 'Agentes', icon: Bot },
]

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<TabType>('inbox')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <h1 className="text-2xl font-bold text-white mb-1">WhatsApp</h1>
        <p className="text-dark-400 text-sm">Gerencie suas conversas, campanhas e agentes</p>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4">
        <div className="flex items-center gap-1 border-b border-dark-700/50">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                  ${isActive ? 'text-primary-400' : 'text-dark-400 hover:text-white'}
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'inbox' && <InboxTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'agents' && <AgentsTab />}
      </div>
    </div>
  )
}
