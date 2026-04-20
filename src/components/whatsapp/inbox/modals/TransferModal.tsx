'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRightLeft,
  Users,
  User,
  X,
  Loader2,
  Circle,
} from 'lucide-react'
import type { AgentStatus, Queue } from '@/lib/services/whatsapp/types'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  onTransfer: (params: {
    toAgentId?: string
    toQueueId?: string
    reason?: string
  }) => Promise<void>
  organizationId: string
  conversationId: string
}

export function TransferModal({
  isOpen,
  onClose,
  onTransfer,
  organizationId,
}: TransferModalProps) {
  const [tab, setTab] = useState<'agent' | 'queue'>('agent')
  const [agents, setAgents] = useState<(AgentStatus & { name?: string })[]>([])
  const [queues, setQueues] = useState<Queue[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    fetchData()
  }, [isOpen, organizationId])

  async function fetchData() {
    setIsLoading(true)
    try {
      const [agentRes, queueRes] = await Promise.all([
        fetch(`/api/whatsapp/agents/status?organizationId=${organizationId}`),
        fetch(`/api/whatsapp/queues?organizationId=${organizationId}`),
      ])

      if (agentRes.ok) {
        const { data } = await agentRes.json()
        setAgents(data || [])
      }
      if (queueRes.ok) {
        const { data } = await queueRes.json()
        setQueues(data || [])
      }
    } catch {
      // Non-critical
    }
    setIsLoading(false)
  }

  async function handleTransfer() {
    if (tab === 'agent' && !selectedAgentId) return
    if (tab === 'queue' && !selectedQueueId) return

    setIsTransferring(true)
    try {
      await onTransfer({
        toAgentId: tab === 'agent' ? selectedAgentId || undefined : undefined,
        toQueueId: tab === 'queue' ? selectedQueueId || undefined : undefined,
        reason: reason || undefined,
      })
      onClose()
    } catch {
      // Error handled upstream
    }
    setIsTransferring(false)
  }

  if (!isOpen) return null

  const statusColor = (s: string) => {
    if (s === 'online') return 'bg-green-500'
    if (s === 'away') return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold">Transferir conversa</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setTab('agent')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'agent'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="w-4 h-4 inline mr-1" />
            Agente
          </button>
          <button
            onClick={() => setTab('queue')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'queue'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline mr-1" />
            Fila
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : tab === 'agent' ? (
            <div className="space-y-2">
              {agents.filter((a) => a.status !== 'offline').length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nenhum agente online
                </p>
              ) : (
                agents
                  .filter((a) => a.status !== 'offline')
                  .map((agent) => (
                    <button
                      key={agent.agent_id}
                      onClick={() => setSelectedAgentId(agent.agent_id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedAgentId === agent.agent_id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-500" />
                        </div>
                        <Circle
                          className={`w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full ${statusColor(agent.status)}`}
                          fill="currentColor"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">
                          {agent.name || `Agente ${agent.agent_id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {agent.active_conversations} conversas ativas
                        </p>
                      </div>
                    </button>
                  ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {queues.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nenhuma fila configurada
                </p>
              ) : (
                queues.map((queue) => (
                  <button
                    key={queue.id}
                    onClick={() => setSelectedQueueId(queue.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      selectedQueueId === queue.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: queue.color + '20' }}
                    >
                      <Users className="w-5 h-5" style={{ color: queue.color }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{queue.name}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Reason */}
        <div className="px-4 pb-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da transferencia (opcional)"
            className="w-full p-2 border rounded-lg text-sm resize-none h-16 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={
              isTransferring ||
              (tab === 'agent' && !selectedAgentId) ||
              (tab === 'queue' && !selectedQueueId)
            }
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isTransferring && <Loader2 className="w-4 h-4 animate-spin" />}
            Transferir
          </button>
        </div>
      </div>
    </div>
  )
}
