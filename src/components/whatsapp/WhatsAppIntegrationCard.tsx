'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MessageSquare,
  Settings,
  RefreshCw,
  Trash2,
  ExternalLink,
  Wifi,
  Phone,
  Building2,
  Clock,
  AlertTriangle,
  Plus
} from 'lucide-react'

interface WhatsAppIntegrationCardProps {
  organizationId: string
}

interface WhatsAppConfig {
  id: string
  phone_number_id: string
  waba_id: string | null
  business_name: string
  phone_number: string
  is_active: boolean
  webhook_verified: boolean
  created_at: string
}

interface WhatsAppInstance {
  id: string
  title: string
  phone_number: string
  status: string
  api_type: string
  created_at: string
}

export default function WhatsAppIntegrationCard({ organizationId }: WhatsAppIntegrationCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [organizationId])

  const fetchStatus = async () => {
    try {
      setLoading(true)
      
      // Buscar configuração da API oficial
      const configRes = await fetch(`/api/whatsapp/connect?organizationId=${organizationId}`)
      const configData = await configRes.json()
      
      // Buscar instâncias (QR Code)
      const instancesRes = await fetch(`/api/whatsapp/instances?organizationId=${organizationId}`)
      const instancesData = await instancesRes.json()
      
      const hasConfig = configData.connected
      const hasInstances = instancesData.instances?.length > 0
      
      setConnected(hasConfig || hasInstances)
      setConfig(configData.config)
      setInstances(instancesData.instances || [])
    } catch (error) {
      console.error('Error fetching WhatsApp status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = () => {
    // Redirecionar para página de configuração do WhatsApp
    router.push('/integrations/whatsapp')
  }

  const handleConfigure = () => {
    // Redirecionar para página de configuração do WhatsApp
    router.push('/integrations/whatsapp')
  }

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp Business?')) return

    setDisconnecting(true)
    try {
      await fetch(`/api/whatsapp/connect?organizationId=${organizationId}`, {
        method: 'DELETE'
      })
      setConnected(false)
      setConfig(null)
      setInstances([])
    } catch (error) {
      console.error('Error disconnecting:', error)
    } finally {
      setDisconnecting(false)
    }
  }

  // Contar conexões ativas
  const activeConnections = (config ? 1 : 0) + instances.filter(i => i.status === 'connected').length

  if (loading) {
    return (
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-green-500/20 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 bg-dark-700 rounded animate-pulse" />
            <div className="h-4 w-48 bg-dark-700/50 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative bg-dark-800/50 border rounded-2xl p-6 transition-all duration-200
        ${connected 
          ? 'border-green-500/30 hover:border-green-500/50' 
          : 'border-dark-700/50 hover:border-dark-600'
        }
      `}
    >
      {/* Connected Badge */}
      {connected && (
        <div className="absolute -top-2 -right-2">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full text-[10px] font-bold text-white shadow-lg">
            <Wifi className="w-3 h-3" />
            {activeConnections} {activeConnections === 1 ? 'Conexão' : 'Conexões'}
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-7 h-7 text-green-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white">WhatsApp Business</h3>
            {connected ? (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-green-500/20 text-green-400 border-green-500/30">
                Ativo
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-dark-700/50 text-dark-400 border-dark-600">
                Desconectado
              </span>
            )}
          </div>
          <p className="text-sm text-dark-400">
            {connected 
              ? 'Envie mensagens e gerencie conversas'
              : 'Conecte via API oficial ou QR Code'
            }
          </p>

          {/* Config Details */}
          {connected && (
            <div className="mt-3 space-y-2">
              {/* API Oficial */}
              {config && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 text-dark-300">
                    <Building2 className="w-4 h-4 text-dark-500" />
                    <span>{config.business_name || 'API Oficial'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-dark-300">
                    <Phone className="w-4 h-4 text-dark-500" />
                    <span>{config.phone_number}</span>
                  </div>
                </div>
              )}
              
              {/* Instâncias QR Code */}
              {instances.filter(i => i.status === 'connected').map(instance => (
                <div key={instance.id} className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2 text-dark-300">
                    <MessageSquare className="w-4 h-4 text-dark-500" />
                    <span>{instance.title || 'QR Code'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-dark-300">
                    <Phone className="w-4 h-4 text-dark-500" />
                    <span>{instance.phone_number}</span>
                  </div>
                </div>
              ))}
              
              {config && !config.webhook_verified && (
                <div className="flex items-center gap-2 text-amber-400 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Webhook não verificado - configure no Meta</span>
                </div>
              )}

              {config && (
                <div className="flex items-center gap-2 text-dark-500 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Conectado em {new Date(config.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        {connected ? (
          <>
            <button
              onClick={handleConfigure}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-700/50 hover:bg-dark-700 rounded-xl text-sm text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              Configurar
            </button>
            <button
              onClick={fetchStatus}
              className="p-2.5 rounded-xl bg-dark-700/50 hover:bg-dark-700 text-dark-300 hover:text-white transition-colors"
              title="Atualizar status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
              title="Desconectar"
            >
              {disconnecting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-sm font-medium text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Conectar WhatsApp
          </button>
        )}
      </div>

      {/* Quick Links */}
      {connected && (
        <div className="mt-4 pt-4 border-t border-dark-700/50">
          <div className="flex items-center gap-3 text-xs">
            <a 
              href="/whatsapp" 
              className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Inbox
            </a>
            <span className="text-dark-700">•</span>
            <a 
              href="/whatsapp?tab=campaigns" 
              className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Campanhas
            </a>
            <span className="text-dark-700">•</span>
            <a
              href="https://business.facebook.com/settings/whatsapp-business-accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Meta Business Suite
            </a>
          </div>
        </div>
      )}
    </motion.div>
  )
}
