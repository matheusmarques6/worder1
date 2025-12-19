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

// =============================================
// TYPES
// =============================================

interface WhatsAppInstance {
  id: string
  title: string
  phone_number: string | null
  phone_number_id: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'GENERATING' | 'connected' | 'disconnected'
  online_status: 'available' | 'unavailable' | null
  api_type: 'EVOLUTION' | 'META_CLOUD'
  created_at: string
  updated_at: string
}

interface ConnectionManagerProps {
  organizationId: string
  selectedInstance: WhatsAppInstance | null
  onSelectInstance: (instance: WhatsAppInstance | null) => void
  onConnectClick: () => void
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function WhatsAppConnectionManager({
  organizationId,
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
  // FETCH INSTANCES
  // =============================================

  const fetchInstances = async () => {
    try {
      const response = await fetch(`/api/whatsapp/instances?organization_id=${organizationId}`)
      const data = await response.json()
      
      if (data.instances) {
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
      }
    } catch (error) {
      console.error('Error fetching instances:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (organizationId) {
      fetchInstances()
    }
  }, [organizationId])

  // =============================================
  // ACTIONS
  // =============================================

  const handleRefreshStatus = async (instance: WhatsAppInstance) => {
    setActionLoading(instance.id)
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'status',
          id: instance.id
        })
      })
      
      const data = await response.json()
      
      // Atualizar lista
      await fetchInstances()
      
      // Atualizar selecionado se for o mesmo
      if (selectedInstance?.id === instance.id) {
        const updated = instances.find(i => i.id === instance.id)
        if (updated) onSelectInstance(updated)
      }
    } catch (error) {
      console.error('Error refreshing status:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  const handleDisconnect = async (instance: WhatsAppInstance) => {
    if (!confirm('Tem certeza que deseja desconectar esta instância?')) return
    
    setActionLoading(instance.id)
    try {
      await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect',
          id: instance.id
        })
      })
      
      await fetchInstances()
      
      if (selectedInstance?.id === instance.id) {
        onSelectInstance(null)
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  const handleDelete = async (instance: WhatsAppInstance) => {
    if (!confirm('Tem certeza que deseja remover esta instância? Esta ação não pode ser desfeita.')) return
    
    setActionLoading(instance.id)
    try {
      await fetch(`/api/whatsapp/instances?id=${instance.id}`, {
        method: 'DELETE'
      })
      
      await fetchInstances()
      
      if (selectedInstance?.id === instance.id) {
        onSelectInstance(null)
      }
    } catch (error) {
      console.error('Error deleting:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  const handleReconnect = async (instance: WhatsAppInstance) => {
    setActionLoading(instance.id)
    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'qr',
          id: instance.id,
          organization_id: organizationId
        })
      })
      
      const data = await response.json()
      
      if (data.qr_code) {
        // Abrir modal de QR ou redirecionar
        // Por enquanto, apenas atualizar status
        await fetchInstances()
      }
    } catch (error) {
      console.error('Error reconnecting:', error)
    } finally {
      setActionLoading(null)
      setMenuOpen(null)
    }
  }

  // =============================================
  // HELPERS
  // =============================================

  const getStatusInfo = (instance: WhatsAppInstance) => {
    const isActive = instance.status === 'ACTIVE' || instance.status === 'connected'
    const isOnline = instance.online_status === 'available'
    
    if (isActive && isOnline) {
      return { color: 'green', label: 'Online', icon: Wifi }
    }
    if (isActive) {
      return { color: 'yellow', label: 'Conectado', icon: Wifi }
    }
    if (instance.status === 'GENERATING') {
      return { color: 'blue', label: 'Gerando QR', icon: QrCode }
    }
    return { color: 'red', label: 'Offline', icon: WifiOff }
  }

  const getApiTypeIcon = (apiType: string) => {
    return apiType === 'META_CLOUD' ? Cloud : Smartphone
  }

  // =============================================
  // RENDER
  // =============================================

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-dark-800 rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-dark-400" />
        <span className="text-sm text-dark-400">Carregando...</span>
      </div>
    )
  }

  // No instances - show connect button
  if (instances.length === 0) {
    return (
      <button
        onClick={onConnectClick}
        className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-white font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Conectar WhatsApp
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl transition-colors min-w-[200px]"
      >
        {selectedInstance ? (
          <>
            {/* Status Indicator */}
            <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center ${
              getStatusInfo(selectedInstance).color === 'green' ? 'bg-green-500/20' :
              getStatusInfo(selectedInstance).color === 'yellow' ? 'bg-yellow-500/20' :
              getStatusInfo(selectedInstance).color === 'blue' ? 'bg-blue-500/20' :
              'bg-red-500/20'
            }`}>
              {(() => {
                const Icon = getApiTypeIcon(selectedInstance.api_type)
                return <Icon className={`w-4 h-4 ${
                  getStatusInfo(selectedInstance).color === 'green' ? 'text-green-400' :
                  getStatusInfo(selectedInstance).color === 'yellow' ? 'text-yellow-400' :
                  getStatusInfo(selectedInstance).color === 'blue' ? 'text-blue-400' :
                  'text-red-400'
                }`} />
              })()}
              {/* Online dot */}
              <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-dark-800 ${
                getStatusInfo(selectedInstance).color === 'green' ? 'bg-green-400' :
                getStatusInfo(selectedInstance).color === 'yellow' ? 'bg-yellow-400' :
                getStatusInfo(selectedInstance).color === 'blue' ? 'bg-blue-400 animate-pulse' :
                'bg-red-400'
              }`} />
            </div>
            
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white truncate max-w-[120px]">
                {selectedInstance.title || selectedInstance.phone_number || 'WhatsApp'}
              </p>
              <p className="text-xs text-dark-400">
                {selectedInstance.phone_number || selectedInstance.api_type}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-dark-400" />
            </div>
            <span className="text-sm text-dark-400">Selecionar número</span>
          </>
        )}
        
        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => { setIsOpen(false); setMenuOpen(null); }}
            />
            
            {/* Dropdown Content */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-2 w-80 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="p-3 border-b border-dark-700 flex items-center justify-between">
                <span className="text-sm font-medium text-white">Conexões WhatsApp</span>
                <button
                  onClick={() => { setIsOpen(false); onConnectClick(); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-xs text-green-400 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova
                </button>
              </div>

              {/* Instances List */}
              <div className="max-h-[300px] overflow-y-auto p-2">
                {instances.map((instance) => {
                  const statusInfo = getStatusInfo(instance)
                  const ApiIcon = getApiTypeIcon(instance.api_type)
                  const isSelected = selectedInstance?.id === instance.id
                  
                  return (
                    <div
                      key={instance.id}
                      className={`relative group rounded-xl transition-colors ${
                        isSelected ? 'bg-dark-700' : 'hover:bg-dark-700/50'
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSelectInstance(instance)
                          setIsOpen(false)
                        }}
                        className="w-full flex items-center gap-3 p-3"
                      >
                        {/* Icon */}
                        <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${
                          statusInfo.color === 'green' ? 'bg-green-500/20' :
                          statusInfo.color === 'yellow' ? 'bg-yellow-500/20' :
                          statusInfo.color === 'blue' ? 'bg-blue-500/20' :
                          'bg-red-500/20'
                        }`}>
                          <ApiIcon className={`w-5 h-5 ${
                            statusInfo.color === 'green' ? 'text-green-400' :
                            statusInfo.color === 'yellow' ? 'text-yellow-400' :
                            statusInfo.color === 'blue' ? 'text-blue-400' :
                            'text-red-400'
                          }`} />
                          <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${
                            statusInfo.color === 'green' ? 'bg-green-400' :
                            statusInfo.color === 'yellow' ? 'bg-yellow-400' :
                            statusInfo.color === 'blue' ? 'bg-blue-400 animate-pulse' :
                            'bg-red-400'
                          }`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-white">
                            {instance.title || instance.phone_number || 'WhatsApp'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-dark-400">
                              {instance.phone_number || 'Sem número'}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              instance.api_type === 'META_CLOUD' 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {instance.api_type === 'META_CLOUD' ? 'API' : 'QR'}
                            </span>
                          </div>
                        </div>

                        {/* Selected Check */}
                        {isSelected && (
                          <Check className="w-4 h-4 text-green-400" />
                        )}
                      </button>

                      {/* Actions Menu */}
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpen(menuOpen === instance.id ? null : instance.id)
                          }}
                          className="p-1.5 hover:bg-dark-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4 text-dark-400" />
                        </button>

                        {/* Submenu */}
                        <AnimatePresence>
                          {menuOpen === instance.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute top-full right-0 mt-1 w-40 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-10 overflow-hidden"
                            >
                              <button
                                onClick={() => handleRefreshStatus(instance)}
                                disabled={actionLoading === instance.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:bg-dark-600 hover:text-white transition-colors disabled:opacity-50"
                              >
                                {actionLoading === instance.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                                Atualizar status
                              </button>

                              {instance.api_type === 'EVOLUTION' && statusInfo.color === 'red' && (
                                <button
                                  onClick={() => handleReconnect(instance)}
                                  disabled={actionLoading === instance.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:bg-dark-600 hover:text-white transition-colors disabled:opacity-50"
                                >
                                  <Power className="w-4 h-4" />
                                  Reconectar
                                </button>
                              )}

                              {statusInfo.color !== 'red' && (
                                <button
                                  onClick={() => handleDisconnect(instance)}
                                  disabled={actionLoading === instance.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-dark-600 transition-colors disabled:opacity-50"
                                >
                                  <PowerOff className="w-4 h-4" />
                                  Desconectar
                                </button>
                              )}

                              <button
                                onClick={() => handleDelete(instance)}
                                disabled={actionLoading === instance.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-dark-600 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remover
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-dark-700 bg-dark-800/50">
                <div className="flex items-center justify-between text-xs text-dark-500">
                  <span>{instances.length} conexão(ões)</span>
                  <button
                    onClick={() => fetchInstances()}
                    className="flex items-center gap-1 hover:text-dark-300 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Atualizar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
