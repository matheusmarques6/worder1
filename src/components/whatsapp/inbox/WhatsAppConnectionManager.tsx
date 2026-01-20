'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Check,
  ChevronDown,
  Smartphone,
  Cloud,
  Wifi,
  WifiOff,
  Loader2,
  Settings,
  Trash2,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  MoreVertical,
  QrCode,
  Power,
  PowerOff
} from 'lucide-react'
import { type WhatsAppInstance } from '@/hooks/useWhatsAppConnectionManager'

// =============================================
// TYPES
// =============================================

interface ConnectionManagerProps {
  organizationId: string
  storeId?: string | null // ✅ NOVO: ID da loja
  selectedInstance: WhatsAppInstance | null
  onSelectInstance: (instance: WhatsAppInstance | null) => void
  onConnectClick: () => void
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function WhatsAppConnectionManager({
  organizationId,
  storeId, // ✅ NOVO
  selectedInstance,
  onSelectInstance,
  onConnectClick
}: ConnectionManagerProps) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // =============================================
  // FETCH INSTANCES - COM STORE_ID
  // =============================================

  const fetchInstances = async () => {
    // ✅ CRÍTICO: Não buscar sem storeId
    if (!storeId) {
      setInstances([])
      setLoading(false)
      return
    }

    try {
      // ✅ CRÍTICO: Passar store_id na requisição
      const response = await fetch(`/api/whatsapp/instances?organization_id=${organizationId}&store_id=${storeId}`)
      const data = await response.json()
      
      if (data.instances) {
        console.log(`[ConnectionManager] Found ${data.instances.length} instances for store ${storeId}`)
        setInstances(data.instances)
        
        // Auto-select first active instance if none selected
        if (!selectedInstance && data.instances.length > 0) {
          const activeInstance = data.instances.find(
            (i: WhatsAppInstance) => i.status === 'ACTIVE' || i.status === 'connected'
          )
          if (activeInstance) {
            onSelectInstance(activeInstance)
          }
        }
        
        // Se a instância selecionada mudou de status, atualizar
        if (selectedInstance) {
          const updated = data.instances.find((i: WhatsAppInstance) => i.id === selectedInstance.id)
          if (updated && updated.status !== selectedInstance.status) {
            console.log('[ConnectionManager] Instance status changed:', updated.status)
            onSelectInstance(updated)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching instances:', error)
    } finally {
      setLoading(false)
    }
  }

  // ✅ CORREÇÃO: Refetch quando storeId mudar
  useEffect(() => {
    if (organizationId) {
      console.log('[ConnectionManager] Store changed to:', storeId)
      setInstances([])
      onSelectInstance(null)
      fetchInstances()
    }
  }, [organizationId, storeId])
  
  // Auto-refresh
  useEffect(() => {
    if (!organizationId || !storeId) return
    
    const interval = setInterval(fetchInstances, 5000)
    return () => clearInterval(interval)
  }, [organizationId, storeId])

  // =============================================
  // ACTIONS
  // =============================================

  const handleDisconnect = async (instanceId: string) => {
    setActionLoading(instanceId)
    try {
      await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', instance_id: instanceId })
      })
      await fetchInstances()
    } catch (error) {
      console.error('Error disconnecting:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  const handleDelete = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conexão?')) return
    
    setActionLoading(instanceId)
    try {
      await fetch(`/api/whatsapp/instances?id=${instanceId}`, { method: 'DELETE' })
      if (selectedInstance?.id === instanceId) {
        onSelectInstance(null)
      }
      await fetchInstances()
    } catch (error) {
      console.error('Error deleting:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'ACTIVE':
        return 'bg-green-500'
      case 'connecting':
      case 'qr_pending':
        return 'bg-yellow-500'
      default:
        return 'bg-red-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
      case 'ACTIVE':
        return 'Conectado'
      case 'connecting':
        return 'Conectando...'
      case 'qr_pending':
        return 'Aguardando QR'
      default:
        return 'Desconectado'
    }
  }

  // ✅ NOVO: Mostrar mensagem se não tiver loja
  if (!storeId) {
    return (
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p className="text-sm text-yellow-500 text-center">
          Selecione uma loja para ver as conexões
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Current Selection */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-2 bg-dark-800/50 hover:bg-dark-800 border border-dark-700 rounded-lg transition-colors"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 text-dark-400 animate-spin" />
        ) : selectedInstance ? (
          <>
            <div className="relative">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedInstance.status === 'connected' ? 'bg-green-500/20' : 'bg-dark-700'
              }`}>
                <Smartphone className={`w-5 h-5 ${
                  selectedInstance.status === 'connected' ? 'text-green-400' : 'text-dark-400'
                }`} />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${
                getStatusColor(selectedInstance.status)
              }`} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {selectedInstance.title || selectedInstance.phone_number || 'WhatsApp'}
              </p>
              <p className="text-xs text-dark-400">
                {selectedInstance.phone_number || getStatusText(selectedInstance.status)}
              </p>
            </div>
          </>
        ) : instances.length === 0 ? (
          <>
            <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
              <Plus className="w-5 h-5 text-dark-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">Conectar WhatsApp</p>
              <p className="text-xs text-dark-400">Nenhuma conexão</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-dark-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">Selecione um número</p>
              <p className="text-xs text-dark-400">{instances.length} disponível(is)</p>
            </div>
          </>
        )}
        <ChevronDown className={`w-5 h-5 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-dark-800 border border-dark-700 rounded-lg shadow-xl overflow-hidden"
          >
            {/* Instance List */}
            <div className="max-h-64 overflow-y-auto">
              {instances.length === 0 ? (
                <div className="p-4 text-center">
                  <Smartphone className="w-8 h-8 text-dark-500 mx-auto mb-2" />
                  <p className="text-sm text-dark-400">Nenhum WhatsApp conectado</p>
                  <p className="text-xs text-dark-500 mt-1">para esta loja</p>
                </div>
              ) : (
                instances.map((instance) => (
                  <div
                    key={instance.id}
                    className={`flex items-center gap-3 p-3 hover:bg-dark-700/50 cursor-pointer ${
                      selectedInstance?.id === instance.id ? 'bg-primary-500/10' : ''
                    }`}
                  >
                    <div
                      className="flex-1 flex items-center gap-3"
                      onClick={() => {
                        onSelectInstance(instance)
                        setIsOpen(false)
                      }}
                    >
                      <div className="relative">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          instance.status === 'connected' ? 'bg-green-500/20' : 'bg-dark-700'
                        }`}>
                          <Smartphone className={`w-4 h-4 ${
                            instance.status === 'connected' ? 'text-green-400' : 'text-dark-400'
                          }`} />
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-dark-800 ${
                          getStatusColor(instance.status)
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {instance.title || instance.phone_number || 'WhatsApp'}
                        </p>
                        <p className="text-xs text-dark-400">
                          {instance.phone_number || getStatusText(instance.status)}
                        </p>
                      </div>
                      {selectedInstance?.id === instance.id && (
                        <Check className="w-4 h-4 text-primary-400 flex-shrink-0" />
                      )}
                    </div>

                    {/* Actions Menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(menuOpen === instance.id ? null : instance.id)
                        }}
                        className="p-1 hover:bg-dark-600 rounded"
                      >
                        <MoreVertical className="w-4 h-4 text-dark-400" />
                      </button>

                      {menuOpen === instance.id && (
                        <div className="absolute right-0 mt-1 w-40 bg-dark-700 border border-dark-600 rounded-lg shadow-xl z-10">
                          {instance.status === 'connected' && (
                            <button
                              onClick={() => handleDisconnect(instance.id)}
                              disabled={actionLoading === instance.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-dark-600"
                            >
                              {actionLoading === instance.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <PowerOff className="w-4 h-4" />
                              )}
                              Desconectar
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(instance.id)}
                            disabled={actionLoading === instance.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-dark-600"
                          >
                            {actionLoading === instance.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add New Button */}
            <div className="border-t border-dark-700 p-2">
              <button
                onClick={() => {
                  setIsOpen(false)
                  onConnectClick()
                }}
                className="w-full flex items-center justify-center gap-2 p-2 text-sm text-primary-400 hover:bg-dark-700/50 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Conectar novo WhatsApp
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
