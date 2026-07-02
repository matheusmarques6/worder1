'use client'

import { toast } from '@/components/ui/Toast'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  MessageCircle,
  Instagram,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Phone,
  Hash,
  Key,
  Globe,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// ==========================================
// TYPES
// ==========================================
interface WhatsAppAccount {
  id: string
  phone_number: string
  phone_number_id: string
  display_name: string
  verified_name: string
  quality_rating: string
  status: string
  webhook_configured: boolean
  messages_sent_today: number
  messages_received_today: number
  last_message_at: string | null
}

interface InstagramAccount {
  id: string
  ig_user_id: string
  username: string
  name: string
  profile_picture_url: string | null
  followers_count: number
  status: string
  webhook_configured: boolean
  messages_received_today: number
  last_message_at: string | null
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function MetaIntegrationsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'instagram'>('whatsapp')

  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([])
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([])

  const [showAddModal, setShowAddModal] = useState(false)
  const [showTokens, setShowTokens] = useState(false)

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    try {
      // Fetch WhatsApp accounts
      const waRes = await fetch('/api/whatsapp/cloud/accounts')
      if (waRes.ok) {
        const waData = await waRes.json()
        setWhatsappAccounts(waData.accounts || [])
      }

      // Fetch Instagram accounts
      const igRes = await fetch('/api/instagram/accounts')
      if (igRes.ok) {
        const igData = await igRes.json()
        setInstagramAccounts(igData.accounts || [])
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/${activeTab === 'whatsapp' ? 'whatsapp/cloud' : 'instagram'}/webhook`
    : ''

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // Toast notification could be added here
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integracoes Meta</h1>
          <p className="text-gray-500 mt-1">WhatsApp Business API e Instagram Messaging</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Conectar Conta
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'whatsapp'
              ? 'bg-green-500 text-white'
              : 'text-gray-500 hover:text-white'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'instagram'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
              : 'text-gray-500 hover:text-white'
          }`}
        >
          <Instagram className="w-5 h-5" />
          Instagram
        </button>
      </div>

      {/* Setup Instructions */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-400" />
          Configuracao do Webhook
        </h2>

        <div className="space-y-4">
          {/* Webhook URL */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Webhook URL</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 font-mono text-sm">
                {webhookUrl}
              </div>
              <button
                onClick={() => copyToClipboard(webhookUrl)}
                className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-white transition-colors"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Verify Token */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Verify Token (use no Meta Developer)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 font-mono text-sm flex items-center justify-between">
                <span>{showTokens ? (process.env.NEXT_PUBLIC_WEBHOOK_VERIFY_TOKEN || 'Defina WEBHOOK_VERIFY_TOKEN no .env') : '••••••••••••••••'}</span>
                <button
                  onClick={() => setShowTokens(!showTokens)}
                  className="text-gray-500 hover:text-white"
                >
                  {showTokens ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(process.env.NEXT_PUBLIC_WEBHOOK_VERIFY_TOKEN || '')}
                className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-white transition-colors"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mt-4">
            <h3 className="text-sm font-medium text-blue-400 mb-2">Instrucoes de Configuracao</h3>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Meta for Developers</a></li>
              <li>Crie ou selecione seu App</li>
              <li>Adicione os produtos <strong>WhatsApp</strong> e/ou <strong>Instagram</strong></li>
              <li>Configure o Webhook usando a URL e o Token acima</li>
              <li>Inscreva-se nos campos: <code className="bg-gray-100 px-1 rounded">messages</code>, <code className="bg-gray-100 px-1 rounded">messaging_postbacks</code></li>
              <li>Gere um Access Token permanente e adicione abaixo</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeTab === 'whatsapp' ? 'Contas WhatsApp Conectadas' : 'Contas Instagram Conectadas'}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-dark-700/50">
            {activeTab === 'whatsapp' ? (
              whatsappAccounts.length === 0 ? (
                <EmptyState type="whatsapp" onAdd={() => setShowAddModal(true)} />
              ) : (
                whatsappAccounts.map(account => (
                  <WhatsAppAccountRow key={account.id} account={account} />
                ))
              )
            ) : (
              instagramAccounts.length === 0 ? (
                <EmptyState type="instagram" onAdd={() => setShowAddModal(true)} />
              ) : (
                instagramAccounts.map(account => (
                  <InstagramAccountRow key={account.id} account={account} />
                ))
              )
            )}
          </div>
        )}
      </div>

      {/* Environment Variables Info */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-400" />
          Variaveis de Ambiente Necessarias
        </h2>

        <div className="bg-white rounded-xl p-4 font-mono text-sm">
          <pre className="text-gray-600 whitespace-pre-wrap">
{`# Meta App Configuration
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret

# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_WABA_ID=your_waba_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# Instagram Messaging API
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_verify_token

# Optional: Global webhook verify token
WEBHOOK_VERIFY_TOKEN=your_global_verify_token`}
          </pre>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          type={activeTab}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            // Refresh accounts so the newly connected one appears
            fetchAccounts()
          }}
        />
      )}
    </div>
  )
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

function EmptyState({ type, onAdd }: { type: 'whatsapp' | 'instagram'; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {type === 'whatsapp' ? (
        <MessageCircle className="w-12 h-12 text-gray-500 mb-4" />
      ) : (
        <Instagram className="w-12 h-12 text-gray-500 mb-4" />
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Nenhuma conta {type === 'whatsapp' ? 'WhatsApp' : 'Instagram'} conectada
      </h3>
      <p className="text-gray-500 mb-4 max-w-md">
        Conecte sua conta {type === 'whatsapp' ? 'WhatsApp Business' : 'Instagram Business'} para comecar a receber e enviar mensagens.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Conectar Conta
      </button>
    </div>
  )
}

function WhatsAppAccountRow({ account }: { account: WhatsAppAccount }) {
  const statusColors = {
    active: 'text-green-400 bg-green-500/10',
    inactive: 'text-amber-400 bg-amber-500/10',
    disconnected: 'text-red-400 bg-red-500/10',
    error: 'text-red-400 bg-red-500/10',
  }

  const qualityColors = {
    GREEN: 'text-green-400',
    YELLOW: 'text-amber-400',
    RED: 'text-red-400',
  }

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
        <Phone className="w-6 h-6 text-green-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-gray-900 font-medium">{account.display_name || account.verified_name}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[account.status as keyof typeof statusColors] || statusColors.inactive}`}>
            {account.status}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-gray-500 text-sm">{account.phone_number}</span>
          <span className="text-gray-500 text-sm">ID: {account.phone_number_id}</span>
          <span className={`text-sm ${qualityColors[account.quality_rating as keyof typeof qualityColors] || 'text-gray-500'}`}>
            Quality: {account.quality_rating}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900">{account.messages_sent_today}</div>
          <div className="text-xs text-gray-500">Enviadas hoje</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900">{account.messages_received_today}</div>
          <div className="text-xs text-gray-500">Recebidas hoje</div>
        </div>
        <div className="flex items-center gap-2">
          {account.webhook_configured ? (
            <span title="Webhook configurado">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </span>
          ) : (
            <span title="Webhook nao configurado">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function InstagramAccountRow({ account }: { account: InstagramAccount }) {
  const statusColors = {
    active: 'text-green-400 bg-green-500/10',
    inactive: 'text-amber-400 bg-amber-500/10',
    disconnected: 'text-red-400 bg-red-500/10',
    error: 'text-red-400 bg-red-500/10',
  }

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
        {account.profile_picture_url ? (
          <img
            src={account.profile_picture_url}
            alt={account.username}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Instagram className="w-6 h-6 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-gray-900 font-medium">{account.name || account.username}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[account.status as keyof typeof statusColors] || statusColors.inactive}`}>
            {account.status}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-gray-500 text-sm">@{account.username}</span>
          <span className="text-gray-500 text-sm">{account.followers_count?.toLocaleString()} seguidores</span>
        </div>
      </div>

      <div className="flex items-center gap-6 flex-shrink-0">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900">{account.messages_received_today}</div>
          <div className="text-xs text-gray-500">Mensagens hoje</div>
        </div>
        <div className="flex items-center gap-2">
          {account.webhook_configured ? (
            <span title="Webhook configurado">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </span>
          ) : (
            <span title="Webhook nao configurado">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function AddAccountModal({
  type,
  onClose,
  onSuccess,
}: {
  type: 'whatsapp' | 'instagram'
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    accessToken: '',
    phoneNumberId: '', // WhatsApp only
    wabaId: '', // WhatsApp only
    igUserId: '', // Instagram only
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = type === 'whatsapp' ? '/api/whatsapp/cloud/accounts' : '/api/instagram/accounts'
      const body = type === 'whatsapp'
        ? {
            phone_number_id: formData.phoneNumberId,
            waba_id: formData.wabaId,
            access_token: formData.accessToken,
          }
        : {
            ig_user_id: formData.igUserId,
            access_token: formData.accessToken,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        toast({ type: 'error', title: data.error || 'Erro ao conectar conta' })
      }
    } catch (error) {
      console.error('Error adding account:', error)
      toast({ type: 'error', title: 'Erro ao conectar conta' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-md"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Conectar {type === 'whatsapp' ? 'WhatsApp Business' : 'Instagram'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Access Token
            </label>
            <input
              type="password"
              value={formData.accessToken}
              onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              placeholder="EAAxxxxxxxxx..."
              className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
              required
            />
          </div>

          {type === 'whatsapp' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  value={formData.phoneNumberId}
                  onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                  placeholder="1234567890"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  WABA ID (WhatsApp Business Account ID)
                </label>
                <input
                  type="text"
                  value={formData.wabaId}
                  onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                  placeholder="1234567890"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Instagram Business Account ID
              </label>
              <input
                type="text"
                value={formData.igUserId}
                onChange={(e) => setFormData({ ...formData, igUserId: e.target.value })}
                placeholder="17841400000000000"
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-900 placeholder:text-gray-500 focus:border-primary-500 focus:outline-none"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-900 font-medium hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-primary-500 hover:bg-primary-600 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
