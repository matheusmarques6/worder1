'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Key,
  LogOut,
  ChevronDown,
  Circle,
  Settings,
  Moon,
  Sun,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// Status options for agents
const statusOptions = [
  { id: 'online', label: 'Online', color: 'bg-green-500', textColor: 'text-green-400' },
  { id: 'away', label: 'Ausente', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
  { id: 'busy', label: 'Ocupado', color: 'bg-red-500', textColor: 'text-red-400' },
  { id: 'offline', label: 'Offline', color: 'bg-dark-500', textColor: 'text-dark-400' },
]

export function UserMenu() {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [agentStatus, setAgentStatus] = useState('online')
  const [statusLoading, setStatusLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Check if user is agent
  const isAgent = user?.user_metadata?.is_agent === true
  const agentId = user?.user_metadata?.agent_id

  // Get user display info
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'
  const userEmail = user?.email || ''
  const userRole = isAgent ? 'Atendente' : (user?.role === 'owner' ? 'Owner' : 'Admin')
  
  // Get initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch agent status on mount
  useEffect(() => {
    if (isAgent && agentId) {
      fetchAgentStatus()
    }
  }, [isAgent, agentId])

  const fetchAgentStatus = async () => {
    try {
      const res = await fetch(`/api/whatsapp/agents/status?agent_id=${agentId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status) {
          setAgentStatus(data.status)
        }
      }
    } catch (error) {
      console.error('Error fetching agent status:', error)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!agentId || statusLoading) return
    
    setStatusLoading(true)
    try {
      const res = await fetch('/api/whatsapp/agents/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          status: newStatus,
        }),
      })

      if (res.ok) {
        setAgentStatus(newStatus)
      }
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setStatusLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      // Call logout API
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })

      // Clear local state
      signOut()

      // Redirect to login
      router.push('/')
    } catch (error) {
      console.error('Error logging out:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleProfileClick = () => {
    setIsOpen(false)
    router.push('/profile')
  }

  const handleChangePasswordClick = () => {
    setIsOpen(false)
    router.push('/change-password')
  }

  // Get current status info
  const currentStatus = statusOptions.find(s => s.id === agentStatus) || statusOptions[0]

  return (
    <div ref={menuRef} className="relative">
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 pr-4 rounded-xl hover:bg-dark-800/50 transition-all"
      >
        {/* Avatar */}
        <div className="relative">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {getInitials(userName)}
            </span>
          </div>
          {/* Status indicator for agents */}
          {isAgent && (
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${currentStatus.color} rounded-full border-2 border-dark-950`} />
          )}
        </div>

        {/* Name and Role */}
        <div className="text-left hidden sm:block">
          <p className="text-sm font-medium text-white truncate max-w-[120px]">
            {userName}
          </p>
          <p className="text-xs text-dark-400">
            {userRole}
          </p>
        </div>

        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-64 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-50"
          >
            {/* User Info Header */}
            <div className="p-4 border-b border-dark-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {getInitials(userName)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {userName}
                  </p>
                  <p className="text-xs text-dark-400 truncate">
                    {userEmail}
                  </p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${
                    isAgent 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : userRole === 'Owner' 
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-primary-500/20 text-primary-400'
                  }`}>
                    {userRole}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Section - Only for Agents */}
            {isAgent && (
              <div className="p-2 border-b border-dark-700">
                <p className="px-2 py-1 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
                  Status
                </p>
                <div className="space-y-0.5 mt-1">
                  {statusOptions.map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id)}
                      disabled={statusLoading}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        agentStatus === status.id
                          ? 'bg-dark-700/50'
                          : 'hover:bg-dark-700/30'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${status.color}`} />
                      <span className={`text-sm ${
                        agentStatus === status.id ? status.textColor : 'text-dark-300'
                      }`}>
                        {status.label}
                      </span>
                      {agentStatus === status.id && (
                        <span className="ml-auto text-xs text-dark-500">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Menu Options */}
            <div className="p-2">
              <button
                onClick={handleProfileClick}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="text-sm">Meu Perfil</span>
              </button>

              <button
                onClick={handleChangePasswordClick}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors"
              >
                <Key className="w-4 h-4" />
                <span className="text-sm">Trocar Senha</span>
              </button>

              {!isAgent && (
                <button
                  onClick={() => {
                    setIsOpen(false)
                    router.push('/settings')
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Configurações</span>
                </button>
              )}
            </div>

            {/* Logout */}
            <div className="p-2 border-t border-dark-700">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">
                  {isLoggingOut ? 'Saindo...' : 'Sair'}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
