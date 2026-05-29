'use client'

import { useState, useEffect } from 'react'
import {
  Smartphone, Plus, Trash2, Loader2, Wifi, WifiOff, Copy, Check,
} from 'lucide-react'
import { useStoreStore } from '@/stores'
import WhatsAppConnectUnified from '@/components/whatsapp/WhatsAppConnectUnified'
import { authedFetch } from '@/lib/api/authed-fetch'

interface BusinessAccount {
  id: string
  title: string
  phone_number: string | null
  phone_number_id: string
  waba_id: string | null
  status: string
  connection_method: string | null
  webhook_configured: boolean
  store_id: string | null
  created_at: string
  updated_at: string
}

interface AccountsTabProps {
  organizationId: string
}

/**
 * AccountsTab (Onda 3 E.4) — Cloud-only list of WhatsApp Business accounts.
 * Reads from /api/whatsapp/business-accounts which queries
 * whatsapp_business_accounts (the canonical table /api/whatsapp/connect
 * now writes into). Replaces the old InstancesTab that read the deprecated
 * whatsapp_instances table and rendered Evolution-only QR UI.
 */
export function AccountsTab({ organizationId }: AccountsTabProps) {
  const { currentStore } = useStoreStore()
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/cloud/webhook`
    : ''

  useEffect(() => {
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, currentStore?.id])

  async function loadAccounts() {
    setLoading(true)
    try {
      const qs = currentStore?.id ? `?store_id=${currentStore.id}` : ''
      const res = await authedFetch(`/api/whatsapp/business-accounts${qs}`)
      if (!res.ok) {
        console.error('Error loading accounts:', await res.text())
        setAccounts([])
        return
      }
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (e) {
      console.error('Error loading accounts:', e)
    } finally {
      setLoading(false)
    }
  }

  async function deleteAccount(accountId: string) {
    if (!confirm('Tem certeza que deseja desconectar este número?')) return
    try {
      const res = await authedFetch(`/api/whatsapp/business-accounts?id=${accountId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setAccounts(accounts.filter(a => a.id !== accountId))
      } else {
        console.error('Error deleting account:', await res.text())
      }
    } catch (e) {
      console.error('Error deleting account:', e)
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary-500" />
          Numeros WhatsApp
        </h3>
        <button
          onClick={() => setShowConnectModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar Numero
        </button>
      </div>

      {/* Webhook URL (configurar na Meta Business Suite quando usar API Manual) */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">URL do Webhook (Meta Business Suite)</h4>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono break-all">{webhookUrl}</code>
          <button
            onClick={copyWebhook}
            className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center gap-1"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Usado pelo metodo Manual. Embedded Signup (Login com Facebook) configura o webhook automaticamente.
        </p>
      </div>

      {/* Lista de Contas */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium text-gray-600">Nenhum numero conectado</p>
          <p className="text-xs mt-1">Clique em &quot;Adicionar Numero&quot; para conectar via Facebook ou API Manual.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => {
            const isActive = account.status === 'active'
            return (
              <div key={account.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {isActive ? (
                        <Wifi className="w-5 h-5 text-green-600" />
                      ) : (
                        <WifiOff className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{account.title}</h3>
                      <p className="text-sm text-gray-500">
                        {account.phone_number || account.phone_number_id}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Cloud API (Meta){account.connection_method ? ` • ${account.connection_method}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {account.status}
                    </span>
                    <button
                      onClick={() => deleteAccount(account.id)}
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      title="Desconectar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <WhatsAppConnectUnified
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={() => {
          setShowConnectModal(false)
          loadAccounts()
        }}
        organizationId={organizationId}
        storeId={currentStore?.id}
      />
    </div>
  )
}

export default AccountsTab
