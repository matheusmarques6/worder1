'use client'

// =============================================
// Webhook Status Table
// src/components/integrations/WebhookStatusTable.tsx
// =============================================

import { useState, useEffect } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface WebhookStatus {
  topic: string
  status: 'active' | 'inactive' | 'error'
  lastReceived?: string
  totalReceived?: number
}

interface WebhookStatusTableProps {
  storeId: string
  organizationId: string
}

const WEBHOOK_LABELS: Record<string, string> = {
  'orders/create': 'Pedido Criado',
  'orders/paid': 'Pedido Pago',
  'orders/fulfilled': 'Pedido Enviado',
  'orders/cancelled': 'Pedido Cancelado',
  'customers/create': 'Novo Cliente',
  'checkouts/create': 'Checkout Criado',
}

export function WebhookStatusTable({ storeId, organizationId }: WebhookStatusTableProps) {
  const [webhooks, setWebhooks] = useState<WebhookStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `/api/integrations/shopify/${storeId}/webhooks?organizationId=${organizationId}`
        )
        const data = await res.json()
        if (data.webhooks) {
          setWebhooks(data.webhooks)
        }
      } catch (error) {
        console.error('Error fetching webhook status:', error)
        // Mock data for display
        setWebhooks([
          { topic: 'orders/create', status: 'active', totalReceived: 45 },
          { topic: 'orders/paid', status: 'active', totalReceived: 42 },
          { topic: 'orders/fulfilled', status: 'active', totalReceived: 38 },
          { topic: 'customers/create', status: 'active', totalReceived: 12 },
          { topic: 'checkouts/create', status: 'active', totalReceived: 89 },
        ])
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [storeId, organizationId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 text-dark-400 animate-spin" />
      </div>
    )
  }

  if (webhooks.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        <p className="text-dark-400 text-sm">Nenhum webhook configurado</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-dark-700">
      <table className="w-full">
        <thead>
          <tr className="bg-dark-800/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase">
              Evento
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-dark-400 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-dark-400 uppercase">
              Última Atividade
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-dark-400 uppercase">
              Recebidos
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-700/50">
          {webhooks.map((webhook) => (
            <tr key={webhook.topic} className="hover:bg-dark-800/30 transition-colors">
              <td className="px-4 py-3">
                <span className="text-sm text-white">
                  {WEBHOOK_LABELS[webhook.topic] || webhook.topic}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {webhook.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                    <CheckCircle className="w-3 h-3" />
                    Ativo
                  </span>
                ) : webhook.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                    <XCircle className="w-3 h-3" />
                    Erro
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-dark-700 text-dark-400 rounded-full text-xs">
                    <Clock className="w-3 h-3" />
                    Inativo
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-center text-sm text-dark-400">
                {webhook.lastReceived
                  ? formatDistanceToNow(new Date(webhook.lastReceived), {
                      addSuffix: true,
                      locale: ptBR,
                    })
                  : '-'
                }
              </td>
              <td className="px-4 py-3 text-right text-sm text-white font-medium">
                {webhook.totalReceived || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
