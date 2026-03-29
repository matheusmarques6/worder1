'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShoppingCart,
  Users,
  ShoppingBag,
  Webhook,
  ArrowLeft,
  ExternalLink,
  Play,
  Copy,
  Check,
} from 'lucide-react'
import Link from 'next/link'

interface DiagnosticData {
  status: string
  timestamp: string
  organizationId: string
  issues: string[]
  recommendations: string[]
  store?: {
    id: string
    shop_domain: string
    shop_name: string
    is_active: boolean
    is_configured: boolean
    connection_status: string
    has_access_token: boolean
    has_api_secret: boolean
  }
  config?: {
    default_pipeline_id: string | null
    default_stage_id: string | null
    contact_type: string
    sync_customers: boolean
    sync_orders: boolean
    sync_checkouts: boolean
    auto_tags: string[]
  }
  pipeline?: {
    id: string
    name: string
  }
  registeredWebhooks?: {
    id: number
    topic: string
    address: string
    created_at: string
  }[]
  recentWebhookEvents?: any[]
  shopifyContacts?: any[]
  recentOrders?: any[]
  recentDeals?: any[]
  summary?: {
    storeConnected: boolean
    storeActive: boolean
    hasAccessToken: boolean
    hasApiSecret: boolean
    hasPipelineConfigured: boolean
    syncCustomersEnabled: boolean
    syncOrdersEnabled: boolean
    webhooksRegistered: number
    webhookEventsReceived: number
    contactsCreated: number
    ordersImported: number
    issuesCount: number
  }
}

export default function ShopifyDiagnosticoPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [data, setData] = useState<DiagnosticData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [fixResult, setFixResult] = useState<any>(null)

  useEffect(() => {
    if (user?.organization_id) {
      loadDiagnostic()
    }
  }, [user?.organization_id])

  const loadDiagnostic = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/shopify/debug?organizationId=${user?.organization_id}`)
      const result = await res.json()
      setData(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fixWebhooks = async () => {
    setFixing(true)
    setFixResult(null)
    try {
      const res = await fetch('/api/cron/shopify?job=health')
      const result = await res.json()
      setFixResult(result)
      // Recarregar diagnóstico
      await loadDiagnostic()
    } catch (e: any) {
      setFixResult({ error: e.message })
    } finally {
      setFixing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
          <span className="text-gray-700">Carregando diagnóstico...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erro ao carregar</h2>
          <p className="text-gray-500">{error}</p>
          <button
            onClick={loadDiagnostic}
            className="mt-4 px-4 py-2 bg-primary-500 rounded-lg text-white"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle className="w-5 h-5 text-emerald-500" />
    ) : (
      <XCircle className="w-5 h-5 text-red-500" />
    )

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/integrations"
            className="p-2 rounded-lg bg-white hover:bg-gray-100 text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-7 h-7 text-[#96bf48]" />
              Diagnóstico Shopify
            </h1>
            <p className="text-gray-500 text-sm">
              Verificação completa da integração
            </p>
          </div>
        </div>
        <button
          onClick={loadDiagnostic}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 rounded-xl text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Status Geral */}
      <div
        className={`p-6 rounded-2xl border ${
          data?.status?.includes('OK')
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : data?.status?.includes('críticos')
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {data?.status?.includes('OK') ? (
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          ) : data?.status?.includes('críticos') ? (
            <XCircle className="w-8 h-8 text-red-500" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{data?.status}</h2>
            <p className="text-gray-500 text-sm">
              Última verificação: {new Date(data?.timestamp || '').toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Problemas encontrados */}
      {data?.issues && data.issues.length > 0 && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Problemas Encontrados ({data.issues.length})
          </h3>
          <ul className="space-y-2">
            {data.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-600">
                <span className="mt-1">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>

          {/* Botão de corrigir */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={fixWebhooks}
              disabled={fixing}
              className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
            >
              {fixing ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              Corrigir Webhooks Automaticamente
            </button>

            {fixResult && (
              <div className="mt-4 p-4 bg-white rounded-xl">
                <pre className="text-sm text-gray-600 overflow-auto">
                  {JSON.stringify(fixResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumo */}
      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon ok={data.summary.storeConnected} />
              <span className="text-gray-500 text-sm">Loja Conectada</span>
            </div>
            <p className="text-gray-900 font-semibold">
              {data.summary.storeConnected ? 'Sim' : 'Não'}
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Webhook className="w-5 h-5 text-brand-600" />
              <span className="text-gray-500 text-sm">Webhooks</span>
            </div>
            <p className="text-gray-900 font-semibold">
              {data.summary.webhooksRegistered} registrados
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-gray-500 text-sm">Contatos</span>
            </div>
            <p className="text-gray-900 font-semibold">
              {data.summary.contactsCreated} do Shopify
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
              <span className="text-gray-500 text-sm">Pedidos</span>
            </div>
            <p className="text-gray-900 font-semibold">
              {data.summary.ordersImported} importados
            </p>
          </div>
        </div>
      )}

      {/* Detalhes da Loja */}
      {data?.store && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalhes da Loja</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-500 text-sm">Domínio</p>
              <p className="text-gray-900 font-medium flex items-center gap-2">
                {data.store.shop_domain}
                <a
                  href={`https://${data.store.shop_domain}/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:text-brand-500"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Nome</p>
              <p className="text-gray-900 font-medium">{data.store.shop_name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Status</p>
              <p className={`font-medium ${data.store.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.store.connection_status}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Configurado</p>
              <p className={`font-medium ${data.store.is_configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {data.store.is_configured ? 'Sim' : 'Não'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Configurações */}
      {data?.config && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Pipeline padrão</span>
              <span className={`font-medium ${data.config.default_pipeline_id ? 'text-gray-900' : 'text-red-400'}`}>
                {data.pipeline?.name || (data.config.default_pipeline_id ? data.config.default_pipeline_id : '❌ Não configurado')}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Tipo de contato</span>
              <span className="text-gray-900 font-medium">{data.config.contact_type}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Sincronizar clientes</span>
              <StatusIcon ok={data.config.sync_customers} />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <span className="text-gray-500">Sincronizar pedidos</span>
              <StatusIcon ok={data.config.sync_orders} />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-500">Sincronizar checkouts</span>
              <StatusIcon ok={data.config.sync_checkouts} />
            </div>
          </div>

          {!data.config.default_pipeline_id && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm">
                ⚠️ <strong>Pipeline não configurado!</strong> Os deals não serão criados.{' '}
                <Link href="/integrations" className="underline">
                  Configure agora →
                </Link>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Webhooks */}
      {data?.registeredWebhooks && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Webhooks Registrados ({data.registeredWebhooks.length})
          </h3>
          {data.registeredWebhooks.length > 0 ? (
            <div className="space-y-2">
              {data.registeredWebhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg"
                >
                  <div>
                    <p className="text-gray-900 font-medium">{webhook.topic}</p>
                    <p className="text-gray-400 text-xs truncate max-w-md">{webhook.address}</p>
                  </div>
                  {webhook.address.includes('/api/webhooks/shopify') ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Nenhum webhook registrado</p>
          )}

          {/* URL correta */}
          <div className="mt-4 p-4 bg-white rounded-xl">
            <p className="text-gray-500 text-sm mb-2">URL correta para webhooks:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white rounded text-emerald-400 text-sm">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shopify
              </code>
              <button
                onClick={() =>
                  copyToClipboard(`${window.location.origin}/api/webhooks/shopify`)
                }
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-white transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Últimos contatos */}
      {data?.shopifyContacts && data.shopifyContacts.length > 0 && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Últimos Contatos do Shopify ({data.shopifyContacts.length})
          </h3>
          <div className="space-y-2">
            {data.shopifyContacts.slice(0, 5).map((contact: any) => (
              <div
                key={contact.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg"
              >
                <div>
                  <p className="text-gray-900 font-medium">
                    {contact.first_name} {contact.last_name}
                  </p>
                  <p className="text-gray-400 text-sm">{contact.email}</p>
                </div>
                <span className="text-gray-400 text-xs">
                  {new Date(contact.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendações */}
      {data?.recommendations && data.recommendations.length > 0 && (
        <div className="p-6 bg-brand-50 rounded-2xl border border-brand-300">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Recomendações</h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-600">
                <span className="text-brand-600">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
