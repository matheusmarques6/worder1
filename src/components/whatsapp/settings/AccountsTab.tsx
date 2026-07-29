'use client'

import { useState, useEffect } from 'react'
import {
  Smartphone, Plus, Trash2, Loader2, Wifi, WifiOff, Copy, Check,
  RefreshCw, KeyRound, AlertTriangle, ShieldCheck, X, Radio, Link2,
} from 'lucide-react'
import { useStoreStore } from '@/stores'
import { useToast } from '@/components/ui/Toast'
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
  // Health snapshot (added Onda 6 — populated by GET /accounts/[id]/health)
  last_health_check_at?: string | null
  last_health_status?: 'healthy' | 'expired' | 'invalid' | 'error' | null
  last_health_error_code?: number | null
  last_health_expires_at?: string | null
}

/**
 * Estado da inscricao do app nos webhooks do WABA. Espelha
 * WABASubscriptionState em lib/whatsapp/cloud-api.ts.
 */
interface WebhookSubscription {
  subscribed: boolean | null
  subscribedFields: string[]
  missingFields: string[]
  appCount: number
  note?: string
}

interface HealthCheckResult {
  valid: boolean
  status?: 'healthy' | 'expired' | 'invalid' | 'error'
  expiresAt?: string | null
  errorCode?: number
  errorMessage?: string
  webhook?: WebhookSubscription
  webhookError?: string
  checkedAt: string
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
  const toast = useToast()
  const [accounts, setAccounts] = useState<BusinessAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [resubscribingId, setResubscribingId] = useState<string | null>(null)
  const [refreshingAccount, setRefreshingAccount] = useState<BusinessAccount | null>(null)
  // Veredito ao vivo da ultima checagem, por conta. Nao vem do banco: o
  // snapshot persistido guarda so o booleano (webhook_configured), e aqui
  // queremos tambem os campos ausentes e o motivo de um indeterminado.
  const [webhookState, setWebhookState] = useState<
    Record<string, { result?: WebhookSubscription; error?: string }>
  >({})

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

  async function safeJson(res: Response): Promise<any> {
    const text = await res.text()
    if (!text) return {}
    try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } }
  }

  async function checkHealth(accountId: string) {
    setCheckingId(accountId)
    try {
      const res = await authedFetch(`/api/whatsapp/cloud/accounts/${accountId}/health`)
      const data = await safeJson(res)
      if (!res.ok) {
        toast.error('Falha ao verificar', data.error || `HTTP ${res.status}`)
        return
      }
      const h: HealthCheckResult = data.health
      setAccounts(prev => prev.map(a =>
        a.id === accountId
          ? {
              ...a,
              last_health_check_at: h.checkedAt,
              last_health_status: h.status ?? null,
              last_health_error_code: h.errorCode ?? null,
              last_health_expires_at: h.expiresAt ?? null,
              webhook_configured:
                typeof h.webhook?.subscribed === 'boolean'
                  ? h.webhook.subscribed
                  : a.webhook_configured,
            }
          : a
      ))
      setWebhookState(prev => ({
        ...prev,
        [accountId]: { result: h.webhook, error: h.webhookError },
      }))

      // Webhook morto vence o resultado do token na mensagem: e a falha que
      // deixa o envio funcionando e o recebimento parado.
      if (h.webhook?.subscribed === false) {
        toast.error(
          'Webhook desinscrito',
          'Nenhuma mensagem recebida chega ate reinscrever. Clique em "Reinscrever webhook".',
        )
      } else if (h.valid) {
        toast.success('Conexao ativa', h.expiresAt ? `Expira em ${formatRelativeExpiry(h.expiresAt)}` : 'Token sem expiracao')
      } else {
        toast.warning('Conexao com problema', h.errorMessage || 'Token invalido')
      }
    } catch (e: any) {
      toast.error('Erro de rede', e?.message || 'Tente novamente')
    } finally {
      setCheckingId(null)
    }
  }

  async function resubscribeWebhook(accountId: string) {
    setResubscribingId(accountId)
    try {
      const res = await authedFetch(
        `/api/whatsapp/cloud/accounts/${accountId}/resubscribe`,
        { method: 'POST' },
      )
      const data = await safeJson(res)
      if (!res.ok) {
        toast.error('Falha ao reinscrever', data.hint || data.details || data.error || `HTTP ${res.status}`)
        return
      }

      const webhook: WebhookSubscription | undefined = data.webhook
      setWebhookState(prev => ({
        ...prev,
        [accountId]: { result: webhook, error: data.webhookError },
      }))
      if (typeof webhook?.subscribed === 'boolean') {
        setAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, webhook_configured: webhook.subscribed as boolean } : a
        ))
      }

      if (webhook?.subscribed === false) {
        // POST aceito mas a releitura desmentiu — nao dizer "resolvido".
        toast.warning('Reinscricao nao confirmada', 'A Meta aceitou a chamada mas o app segue fora da lista.')
      } else {
        toast.success('Webhook reinscrito', 'Peca ao cliente para enviar uma mensagem de teste.')
      }
    } catch (e: any) {
      toast.error('Erro de rede', e?.message || 'Tente novamente')
    } finally {
      setResubscribingId(null)
    }
  }

  async function submitTokenRefresh(accountId: string, newToken: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await authedFetch(`/api/whatsapp/cloud/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: newToken.trim() }),
      })
      const data = await safeJson(res)
      if (!res.ok) return { ok: false, error: data.error || data.details || `HTTP ${res.status}` }

      const h: HealthCheckResult = data.health
      setAccounts(prev => prev.map(a =>
        a.id === accountId
          ? {
              ...a,
              last_health_check_at: h.checkedAt,
              last_health_status: h.status ?? null,
              last_health_error_code: null,
              last_health_expires_at: h.expiresAt ?? null,
            }
          : a
      ))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Erro de rede' }
    }
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
            const isChecking = checkingId === account.id
            const isResubscribing = resubscribingId === account.id
            const wh = webhookState[account.id]
            const webhookBroken = wh?.result?.subscribed === false
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

                {/* Token + webhook health section */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <HealthBadge account={account} />
                    <WebhookBadge account={account} live={wh} />
                    {account.last_health_check_at && (
                      <span className="text-xs text-gray-400">
                        Verificado: {formatAbsoluteTime(account.last_health_check_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => checkHealth(account.id)}
                      disabled={isChecking}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg disabled:opacity-50"
                    >
                      {isChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Verificar agora
                    </button>
                    <button
                      onClick={() => resubscribeWebhook(account.id)}
                      disabled={isResubscribing}
                      title="Reinscreve este app nos webhooks do WABA na Meta"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg disabled:opacity-50 ${
                        webhookBroken
                          ? 'text-white bg-red-600 hover:bg-red-700 border-red-600'
                          : 'text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-200'
                      }`}
                    >
                      {isResubscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Reinscrever webhook
                    </button>
                    <button
                      onClick={() => setRefreshingAccount(account)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Atualizar token
                    </button>
                  </div>
                </div>

                {/* Explicacao do estado do webhook — so quando ha algo a dizer */}
                {(webhookBroken || wh?.error || wh?.result?.note || (wh?.result?.missingFields?.length ?? 0) > 0) && (
                  <div
                    className={`mt-3 rounded-lg border p-3 text-xs ${
                      webhookBroken
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    {webhookBroken && (
                      <p className="font-medium mb-1">
                        Este numero nao recebe webhook da Meta. O envio continua
                        funcionando, mas nenhuma mensagem do cliente entra e as
                        mensagens enviadas nunca saem de &quot;enviada&quot;.
                      </p>
                    )}
                    {wh?.result?.note && <p>{wh.result.note}</p>}
                    {(wh?.result?.missingFields?.length ?? 0) > 0 && (
                      <p>Campos ausentes na inscricao: {wh!.result!.missingFields.join(', ')}</p>
                    )}
                    {wh?.error && <p>Nao foi possivel checar: {wh.error}</p>}
                  </div>
                )}
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

      {refreshingAccount && (
        <RefreshTokenDialog
          account={refreshingAccount}
          onClose={() => setRefreshingAccount(null)}
          onSubmit={submitTokenRefresh}
        />
      )}
    </div>
  )
}

export default AccountsTab

// =============================================
// Helpers
// =============================================

function formatRelativeExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'agora'
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  if (days >= 2) return `${days} dias`
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours >= 2) return `${hours} horas`
  const minutes = Math.max(1, Math.round(ms / (1000 * 60)))
  return `${minutes} min`
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// =============================================
// HealthBadge
// =============================================

function HealthBadge({ account }: { account: BusinessAccount }) {
  const status = account.last_health_status
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
        Nao verificado
      </span>
    )
  }
  if (status === 'healthy') {
    // Within 7 days of expiry, warn instead of plain healthy.
    const exp = account.last_health_expires_at
    if (exp) {
      const ms = new Date(exp).getTime() - Date.now()
      const days = ms / (1000 * 60 * 60 * 24)
      if (days < 7) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
            <AlertTriangle className="w-3 h-3" />
            Expira em {formatRelativeExpiry(exp)}
          </span>
        )
      }
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
        <ShieldCheck className="w-3 h-3" />
        Conectado
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" />
        Token expirado
      </span>
    )
  }
  if (status === 'invalid') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" />
        Token invalido
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
      <AlertTriangle className="w-3 h-3" />
      Erro
    </span>
  )
}

// =============================================
// WebhookBadge
//
// Separado do HealthBadge de proposito: token valido e webhook vivo sao
// coisas independentes, e tratar "token ok" como "conectado" foi exatamente
// o que escondeu um WABA sem inscricao recebendo zero mensagens.
// =============================================

function WebhookBadge({
  account,
  live,
}: {
  account: BusinessAccount
  live?: { result?: WebhookSubscription; error?: string }
}) {
  // Veredito ao vivo tem prioridade; sem ele cai no snapshot do banco.
  const subscribed = live?.result
    ? live.result.subscribed
    : live?.error
      ? null
      : account.last_health_check_at
        ? account.webhook_configured
        : undefined

  if (subscribed === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
        <Radio className="w-3 h-3" />
        Webhook nao verificado
      </span>
    )
  }

  if (subscribed === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" />
        Webhook desinscrito
      </span>
    )
  }

  if (subscribed === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
        <AlertTriangle className="w-3 h-3" />
        Webhook indeterminado
      </span>
    )
  }

  // Inscrito, mas faltando campo que processamos (ex.: sem 'messages').
  if ((live?.result?.missingFields.length ?? 0) > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
        <AlertTriangle className="w-3 h-3" />
        Webhook incompleto
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
      <Radio className="w-3 h-3" />
      Webhook ativo
    </span>
  )
}

// =============================================
// RefreshTokenDialog
// =============================================

function RefreshTokenDialog({
  account,
  onClose,
  onSubmit,
}: {
  account: BusinessAccount
  onClose: () => void
  onSubmit: (accountId: string, token: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function handleSubmit() {
    if (token.trim().length < 20) {
      setError('Token muito curto. Cole o token completo.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await onSubmit(account.id, token.trim())
    setSubmitting(false)
    if (result.ok) {
      toast.success('Token atualizado', 'Conexao validada com sucesso')
      onClose()
    } else {
      setError(result.error || 'Falha ao validar token')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">Atualizar token de acesso</h3>
            <p className="text-xs text-gray-500 mt-0.5">{account.title} - {account.phone_number || account.phone_number_id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>Gere um token long-lived em <strong>Meta Business Manager &gt; Configuracoes &gt; Usuarios do sistema</strong>.</p>
            <p>Scopes necessarios:</p>
            <ul className="list-disc list-inside text-xs text-gray-500 ml-2">
              <li><code>whatsapp_business_messaging</code></li>
              <li><code>whatsapp_business_management</code></li>
            </ul>
            <a
              href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-primary-600 hover:underline"
            >
              Documentacao Meta &rarr;
            </a>
          </div>

          <div>
            <label htmlFor="new-token" className="block text-sm font-medium text-gray-700 mb-1">
              Novo access_token
            </label>
            <textarea
              id="new-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAJ..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-primary-500"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !token.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Validar e salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
