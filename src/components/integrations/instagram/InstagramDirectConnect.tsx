'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Instagram,
  Check,
  ChevronRight,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  X,
  Users,
  MessageSquare,
  Settings,
  Trash2,
} from 'lucide-react'

interface InstagramAccount {
  page_id: string
  page_name: string
  page_access_token: string
  instagram_business_id: string
  instagram_username: string
  instagram_name: string
  instagram_profile_picture: string
  instagram_followers: number
}

interface ConnectedAccount {
  id: string
  instagram_business_id: string
  username: string
  name: string
  profile_picture_url: string
  followers_count: number
  status: string
  messages_received_today: number
  total_messages_received: number
  created_at: string
}

interface InstagramDirectConnectProps {
  onConnect?: () => void
  onDisconnect?: () => void
}

export function InstagramDirectConnect({ onConnect, onDisconnect }: InstagramDirectConnectProps) {
  const [step, setStep] = useState<'initial' | 'selecting' | 'connecting' | 'connected'>('initial')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableAccounts, setAvailableAccounts] = useState<InstagramAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null)
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(params.get('error_description') || 'Erro na autenticacao')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (code && state) {
      handleOAuthCallback(code, state)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Load connected accounts
  useEffect(() => {
    loadConnectedAccounts()
  }, [])

  const loadConnectedAccounts = async () => {
    try {
      const res = await fetch('/api/instagram/accounts')
      if (res.ok) {
        const data = await res.json()
        setConnectedAccounts(data.accounts || [])
        if (data.accounts?.length > 0) {
          setStep('connected')
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error)
    }
  }

  const handleOAuthCallback = async (code: string, state: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/instagram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao processar autenticacao')
        return
      }

      setAvailableAccounts(data.accounts || [])
      setOrganizationId(data.organization_id)
      setTokenExpiresAt(data.token_expires_at)
      setStep('selecting')
    } catch (error) {
      console.error('OAuth callback error:', error)
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const startOAuth = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/instagram/auth')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao iniciar autenticacao')
        return
      }

      // Redirect to Facebook OAuth
      window.location.href = data.url
    } catch (error) {
      console.error('OAuth start error:', error)
      setError('Erro de conexao. Tente novamente.')
      setIsLoading(false)
    }
  }

  const connectAccount = async () => {
    if (!selectedAccount || !organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/instagram/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          page_id: selectedAccount.page_id,
          page_access_token: selectedAccount.page_access_token,
          instagram_business_id: selectedAccount.instagram_business_id,
          instagram_username: selectedAccount.instagram_username,
          instagram_name: selectedAccount.instagram_name,
          instagram_profile_picture: selectedAccount.instagram_profile_picture,
          instagram_followers: selectedAccount.instagram_followers,
          token_expires_at: tokenExpiresAt,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao conectar conta')
        return
      }

      setStep('connected')
      await loadConnectedAccounts()
      onConnect?.()
    } catch (error) {
      console.error('Connect error:', error)
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const disconnectAccount = async (accountId: string) => {
    if (!confirm('Tem certeza que deseja desconectar esta conta?')) return

    setIsLoading(true)
    try {
      const res = await fetch(`/api/instagram/accounts?account_id=${accountId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await loadConnectedAccounts()
        if (connectedAccounts.length <= 1) {
          setStep('initial')
        }
        onDisconnect?.()
      }
    } catch (error) {
      console.error('Disconnect error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)}>
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connected Accounts */}
      {step === 'connected' && connectedAccounts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Contas Conectadas</h3>
            <button
              onClick={startOAuth}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-500/10 text-primary-400 rounded-lg hover:bg-primary-500/20 transition-colors"
            >
              <Instagram className="w-4 h-4" />
              Adicionar conta
            </button>
          </div>

          <div className="space-y-3">
            {connectedAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200"
              >
                {account.profile_picture_url ? (
                  <img
                    src={account.profile_picture_url}
                    alt={account.username}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Instagram className="w-7 h-7 text-white" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{account.name || account.username}</h4>
                    {account.status === 'active' && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">@{account.username}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {account.followers_count?.toLocaleString()} seguidores
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {account.total_messages_received} mensagens
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => disconnectAccount(account.id)}
                    disabled={isLoading}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="p-4 bg-white rounded-xl text-center">
              <p className="text-2xl font-bold text-gray-900">
                {connectedAccounts.reduce((sum, a) => sum + (a.messages_received_today || 0), 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Mensagens hoje</p>
            </div>
            <div className="p-4 bg-white rounded-xl text-center">
              <p className="text-2xl font-bold text-gray-900">
                {connectedAccounts.reduce((sum, a) => sum + (a.total_messages_received || 0), 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total de mensagens</p>
            </div>
            <div className="p-4 bg-white rounded-xl text-center">
              <p className="text-2xl font-bold text-gray-900">{connectedAccounts.length}</p>
              <p className="text-xs text-gray-500 mt-1">Contas conectadas</p>
            </div>
          </div>
        </div>
      )}

      {/* Account Selection */}
      {step === 'selecting' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Selecione uma conta</h3>
          <p className="text-sm text-gray-500">
            Escolha qual conta do Instagram Business voce deseja conectar
          </p>

          <div className="space-y-3">
            {availableAccounts.map((account) => (
              <button
                key={account.instagram_business_id}
                onClick={() => setSelectedAccount(account)}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left',
                  selectedAccount?.instagram_business_id === account.instagram_business_id
                    ? 'bg-primary-500/10 border-primary-500/50'
                    : 'bg-white border-gray-200 hover:border-gray-200'
                )}
              >
                {account.instagram_profile_picture ? (
                  <img
                    src={account.instagram_profile_picture}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Instagram className="w-6 h-6 text-white" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900">{account.instagram_name}</h4>
                  <p className="text-sm text-gray-500">@{account.instagram_username}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {account.instagram_followers?.toLocaleString()} seguidores
                  </p>
                </div>

                {selectedAccount?.instagram_business_id === account.instagram_business_id && (
                  <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => {
                setStep('initial')
                setAvailableAccounts([])
                setSelectedAccount(null)
              }}
              className="px-4 py-2 text-gray-600 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={connectAccount}
              disabled={!selectedAccount || isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-gray-900 font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Instagram className="w-5 h-5" />
                  Conectar Conta
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Initial State - Connect Button */}
      {step === 'initial' && (
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
            <Instagram className="w-10 h-10 text-white" />
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-2">Conecte seu Instagram</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Receba e responda mensagens do Direct diretamente na plataforma. Configure automacoes para mover leads para pipelines especificos.
          </p>

          <div className="space-y-4 max-w-sm mx-auto text-left mb-8">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 text-primary-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Inbox unificada</p>
                <p className="text-xs text-gray-500">Todas as mensagens em um so lugar</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 text-primary-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Automacoes inteligentes</p>
                <p className="text-xs text-gray-500">Crie gatilhos para seu pipeline de vendas</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 text-primary-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Responda stories</p>
                <p className="text-xs text-gray-500">Veja e responda mencoes e respostas aos seus stories</p>
              </div>
            </div>
          </div>

          <button
            onClick={startOAuth}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-gray-900 font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Instagram className="w-5 h-5" />
                Conectar com Instagram
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 mt-4">
            Requer conta Instagram Business conectada a uma Pagina do Facebook
          </p>
        </div>
      )}
    </div>
  )
}
