'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MessageSquare,
  LogOut,
  User,
  HelpCircle,
  Loader2,
  Circle,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { AgentPermissionsProvider } from '@/hooks/useAgentPermissions'

// =====================================================
// AGENT LAYOUT
// Layout simplificado para atendentes
// =====================================================

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, setUser, isLoading, setLoading } = useAuthStore()
  const [status, setStatus] = useState<'online' | 'away' | 'busy' | 'offline'>('online')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Inicializar usuário
  useEffect(() => {
    const initializeUser = async () => {
      if (initialized) return
      
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-or-create-org' }),
        })
        const result = await response.json()
        
        if (result.user) {
          setUser({
            id: result.user.id,
            email: result.user.email,
            name: result.user.name || result.user.user_metadata?.name || result.user.email?.split('@')[0],
            organization_id: result.organization?.id || result.user.user_metadata?.organization_id,
            role: result.user.role || 'agent',
            user_metadata: result.user.user_metadata,
            created_at: result.user.created_at || new Date().toISOString(),
            updated_at: result.user.updated_at || new Date().toISOString(),
          })
        }
      } catch (error) {
        console.error('Error initializing user:', error)
      } finally {
        setLoading(false)
        setInitialized(true)
      }
    }
    
    initializeUser()
  }, [initialized, setUser, setLoading])

  // Verificar se é agente e redirecionar se necessário
  useEffect(() => {
    if (!initialized || isLoading) return
    
    if (user) {
      const isAgent = user.user_metadata?.is_agent === true
      if (!isAgent) {
        // Se não é agente, redirecionar para dashboard
        router.push('/dashboard')
      }
    }
  }, [user, initialized, isLoading, router])

  // Atualizar status
  const handleStatusChange = async (newStatus: typeof status) => {
    setUpdatingStatus(true)
    try {
      const agentId = user?.user_metadata?.agent_id
      const orgId = user?.organization_id || user?.user_metadata?.organization_id
      
      if (agentId && orgId) {
        await fetch('/api/whatsapp/agents/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: agentId,
            organization_id: orgId,
            status: newStatus,
          }),
        })
      }
      setStatus(newStatus)
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setUpdatingStatus(false)
      setShowStatusMenu(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    // Marcar como offline antes de sair
    await handleStatusChange('offline')
    
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
    } catch (e) {
      console.error('Logout error:', e)
    }
    
    // Limpar store e redirecionar
    setUser(null)
    router.push('/')
  }

  // Status config
  const statusConfig = {
    online: { label: 'Online', color: 'bg-green-500', textColor: 'text-green-400' },
    away: { label: 'Ausente', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
    busy: { label: 'Ocupado', color: 'bg-red-500', textColor: 'text-red-400' },
    offline: { label: 'Offline', color: 'bg-gray-500', textColor: 'text-gray-400' },
  }

  // Mostrar loading enquanto inicializa
  if (!initialized || isLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  // Se não tem usuário, mostrar loading (vai redirecionar pelo middleware)
  if (!user) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  const userName = user?.user_metadata?.name || user?.name || user?.email?.split('@')[0] || 'Agente'

  return (
    <AgentPermissionsProvider>
      <div className="min-h-screen bg-dark-950 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-dark-900 border-b border-dark-800 flex items-center justify-between px-4 flex-shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-white">Worder</span>
          </div>

          {/* User Info & Status */}
          <div className="flex items-center gap-4">
            {/* Status Selector */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={updatingStatus}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full ${statusConfig[status].color}`} />
                <span className={`text-sm ${statusConfig[status].textColor}`}>
                  {statusConfig[status].label}
                </span>
                {updatingStatus && <Loader2 className="w-3 h-3 animate-spin text-dark-400" />}
              </button>

              {/* Status Dropdown */}
              {showStatusMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full mt-2 w-40 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-50"
                >
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key as typeof status)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-dark-700 transition-colors ${
                        status === key ? 'bg-dark-700' : ''
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                      <span className="text-sm text-white">{config.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{userName}</p>
                <p className="text-xs text-dark-400">Atendente</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-dark-700 flex items-center justify-center">
                <User className="w-4 h-4 text-dark-400" />
              </div>
            </div>

            {/* Help */}
            <button className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Click outside to close status menu */}
        {showStatusMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowStatusMenu(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </AgentPermissionsProvider>
  )
}
