'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore, useStoreStore, useAuthStore } from '@/stores'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Mail,
  BarChart3,
  Workflow,
  Store,
  HelpCircle,
  LogOut,
  Bell,
  ChevronDown,
  Check,
  CheckCheck,
  Plus,
  ShoppingBag,
  Bot,
  Key,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Loader2,
  TrendingUp,
  User,
  Building2,
  CreditCard,
} from 'lucide-react'
import { Avatar, Tooltip } from '@/components/ui'
import { AddStoreModal } from '@/components/store/AddStoreModal'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ============================================
// Types
// ============================================

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface NotificationData {
  integration_type?: string
}

interface Notification {
  id: string
  type: string
  category: string
  priority: string
  title: string
  message: string
  data: NotificationData
  action_url?: string
  action_label?: string
  read: boolean
  read_at?: string
  created_at: string
}

// ============================================
// Navigation Items
// ============================================

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'CRM', href: '/crm', icon: Users },
  { title: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, badge: 3 },
  { title: 'Automações', href: '/automations', icon: Zap },
]

const analyticsNavItems: NavItem[] = [
  { title: 'Vendas/CRM', href: '/crm/analytics', icon: TrendingUp },
  { title: 'WhatsApp', href: '/whatsapp/analytics', icon: MessageSquare },
  { title: 'Shopify', href: '/analytics/shopify', icon: ShoppingBag },
  { title: 'E-mail Marketing', href: '/analytics/email', icon: Mail },
  { title: 'Facebook Ads', href: '/analytics/facebook', icon: BarChart3 },
  { title: 'Google Ads', href: '/analytics/google', icon: BarChart3 },
  { title: 'TikTok Ads', href: '/analytics/tiktok', icon: BarChart3 },
]

const settingsNavItems: NavItem[] = [
  { title: 'Configurações', href: '/settings', icon: Settings },
  { title: 'API Keys', href: '/settings?tab=api', icon: Key },
  { title: 'Ajuda', href: '/help', icon: HelpCircle },
]

// ============================================
// Sidebar Component
// ============================================

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { stores, currentStore, setCurrentStore, addStore } = useStoreStore()
  
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false)

  // Get store initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleAddStore = (store: { name: string; domain: string; accessToken: string }) => {
    const newStore = {
      id: `store-${Date.now()}`,
      name: store.name,
      domain: store.domain,
      isActive: true,
    }
    addStore(newStore)
    setAddStoreModalOpen(false)
  }

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const Icon = item.icon

    const content = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
          'hover:bg-dark-800',
          isActive && 'bg-primary-500/10 text-primary-400',
          !isActive && 'text-dark-400 hover:text-dark-100'
        )}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary-400')} />
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="font-medium whitespace-nowrap overflow-hidden"
            >
              {item.title}
            </motion.span>
          )}
        </AnimatePresence>
        {item.badge && !sidebarCollapsed && (
          <span className="ml-auto bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
            {item.badge}
          </span>
        )}
        {item.badge && sidebarCollapsed && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary-500 rounded-full" />
        )}
      </Link>
    )

    if (sidebarCollapsed) {
      return (
        <Tooltip content={item.title} side="right">
          <div className="relative">{content}</div>
        </Tooltip>
      )
    }

    return content
  }

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 80 : 280 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 bottom-0 z-40 bg-dark-900/80 backdrop-blur-xl border-r border-dark-700/50 flex flex-col"
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-dark-700/50">
          <Link href="/dashboard" className="flex flex-col gap-0.5">
            <Image
              src="/logo.png"
              alt="Worder"
              width={sidebarCollapsed ? 40 : 110}
              height={sidebarCollapsed ? 8 : 21}
              className="object-contain"
              priority
            />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] text-dark-500"
                >
                  by Convertfy
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          <button
            onClick={toggleSidebar}
            className="w-8 h-8 rounded-lg bg-dark-800 hover:bg-dark-700 flex items-center justify-center text-dark-400 hover:text-dark-100 transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {/* Main */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-4 mb-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
                Principal
              </p>
            )}
            <div className="space-y-1">
              {mainNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>

          {/* Analytics */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-4 mb-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
                Forecast
              </p>
            )}
            <div className="space-y-1">
              {analyticsNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>

          {/* Settings */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-4 mb-2 text-xs font-semibold text-dark-500 uppercase tracking-wider">
                Sistema
              </p>
            )}
            <div className="space-y-1">
              {settingsNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        </nav>

        {/* Store Selector Section */}
        <div className="p-3 border-t border-dark-700/50 relative">
          {/* Store Dropdown */}
          <AnimatePresence>
            {storeDropdownOpen && !sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-3 right-3 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-50"
              >
                {/* Stores List */}
                {stores.length > 0 && (
                  <div className="p-2 border-b border-dark-700">
                    <p className="px-2 py-1 text-xs font-medium text-dark-500 uppercase tracking-wider">
                      Suas Lojas
                    </p>
                    <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => {
                            setCurrentStore(store)
                            setStoreDropdownOpen(false)
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                            currentStore?.id === store.id
                              ? 'bg-primary-500/10 text-primary-400'
                              : 'hover:bg-dark-700/50 text-white'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center text-xs font-bold">
                            {getInitials(store.name)}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium truncate">{store.name}</p>
                            <p className="text-xs text-dark-400 truncate">{store.domain}</p>
                          </div>
                          {currentStore?.id === store.id && (
                            <Check className="w-4 h-4 text-primary-400 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Store Button */}
                <div className="p-2">
                  <button
                    onClick={() => {
                      setAddStoreModalOpen(true)
                      setStoreDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-primary-400 hover:bg-primary-500/10 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Adicionar Nova Loja</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Store Selector Button */}
          <button
            onClick={() => {
              if (sidebarCollapsed) {
                setAddStoreModalOpen(true)
              } else {
                setStoreDropdownOpen(!storeDropdownOpen)
              }
            }}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl transition-all',
              'bg-dark-800/50 border border-dark-700/50 hover:border-dark-600',
              storeDropdownOpen && 'border-primary-500/50 bg-dark-800',
              sidebarCollapsed && 'justify-center'
            )}
          >
            {/* Store Avatar */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {currentStore ? getInitials(currentStore.name) : <Store className="w-5 h-5" />}
            </div>

            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 text-left min-w-0 overflow-hidden"
                >
                  <p className="text-sm font-semibold text-white truncate">
                    {currentStore?.name || 'Selecionar Loja'}
                  </p>
                  <p className="text-xs text-dark-400 truncate">
                    {currentStore?.domain || 'Nenhuma loja conectada'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!sidebarCollapsed && (
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-dark-400 transition-transform flex-shrink-0',
                  storeDropdownOpen && 'rotate-180'
                )}
              />
            )}
          </button>
        </div>
      </motion.aside>

      {/* Add Store Modal */}
      <AddStoreModal
        isOpen={addStoreModalOpen}
        onClose={() => setAddStoreModalOpen(false)}
        onSuccess={handleAddStore}
      />
    </>
  )
}

// ============================================
// Header Component (com Notificações Reais)
// ============================================

const POLLING_INTERVAL = 30000 // 30 segundos

export function Header() {
  const router = useRouter()
  const { sidebarCollapsed } = useUIStore()
  const { currentStore } = useStoreStore()
  const { user, signOut } = useAuthStore()
  
  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // User data
  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const userRole = user?.role || 'admin'
  const userAvatar = user?.avatar_url

  // User menu state
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [agents, setAgents] = useState<Array<{
    id: string
    name: string
    avatar_url?: string
    status: 'online' | 'offline' | 'away' | 'busy'
  }>>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Fetch agents when menu opens
  const fetchAgents = useCallback(async () => {
    if (!user?.organization_id) return
    setLoadingAgents(true)
    try {
      const res = await fetch('/api/agents/status')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }, [user?.organization_id])

  // Handle logout
  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      signOut()
      router.push('/')
    } catch (error) {
      console.error('Error logging out:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  // Get role label
  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Administrador'
      case 'manager': return 'Gerente'
      case 'agent': return 'Agente'
      default: return 'Admin'
    }
  }

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Fetch agents when menu opens
  useEffect(() => {
    if (userMenuOpen && user?.organization_id) {
      fetchAgents()
    }
  }, [userMenuOpen, user?.organization_id, fetchAgents])

  // ============================================
  // Load notifications from API
  // ============================================
  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return
    
    try {
      const res = await fetch(
        `/api/notifications?limit=15`
      )
      
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch (err) {
      console.error('Error loading notifications:', err)
    }
  }, [user?.organization_id])

  // Initial load + polling
  useEffect(() => {
    if (user?.organization_id) {
      setLoadingNotifications(true)
      loadNotifications().finally(() => setLoadingNotifications(false))
      
      const interval = setInterval(loadNotifications, POLLING_INTERVAL)
      return () => clearInterval(interval)
    }
  }, [user?.organization_id, loadNotifications])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ============================================
  // Notification actions
  // ============================================
  const markAsRead = async (ids: string[]) => {
    if (!user?.organization_id || ids.length === 0) return
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationIds: ids,
        }),
      })
      
      setNotifications(prev => 
        prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - ids.length))
    } catch (err) {
      console.error('Error marking as read:', err)
    }
  }

  const markAllAsRead = async () => {
    if (!user?.organization_id) return
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markAllRead: true,
        }),
      })
      
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' })
      setNotifications(prev => {
        const notification = prev.find(n => n.id === id)
        if (notification && !notification.read) {
          setUnreadCount(c => Math.max(0, c - 1))
        }
        return prev.filter(n => n.id !== id)
      })
    } catch (err) {
      console.error('Error deleting notification:', err)
    }
  }

  // ============================================
  // Helper functions
  // ============================================
  const getNotificationIcon = (notification: Notification) => {
    const type = notification.data?.integration_type
    
    if (type === 'shopify') {
      return <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
    }
    if (type === 'whatsapp') {
      return <MessageSquare className="w-4 h-4 text-[#25D366]" />
    }
    
    switch (notification.priority) {
      case 'urgent':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />
      default:
        return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-16 bg-dark-950/80 backdrop-blur-xl border-b border-dark-700/50 z-30 flex items-center justify-between px-6 transition-all duration-300',
        sidebarCollapsed ? 'left-20' : 'left-[280px]'
      )}
    >
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar em tudo..."
            className="w-full bg-dark-800/50 border border-dark-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-dark-100 placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-500 bg-dark-700 px-2 py-1 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 rounded-xl hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-primary-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-96 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">Notificações</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs font-medium rounded-full">
                        {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Marcar todas
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="max-h-96 overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <div className="w-12 h-12 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bell className="w-6 h-6 text-dark-500" />
                      </div>
                      <p className="text-sm text-dark-400">Nenhuma notificação</p>
                      <p className="text-xs text-dark-500 mt-1">
                        Você será notificado sobre eventos importantes
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          'px-4 py-3 border-b border-dark-700/50 hover:bg-dark-800/50 transition-colors',
                          !notification.read && 'bg-primary-500/5'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification)}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-sm font-medium line-clamp-1",
                                notification.read ? 'text-dark-300' : 'text-white'
                              )}>
                                {notification.title}
                              </p>
                              
                              {/* Actions */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {!notification.read && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      markAsRead([notification.id])
                                    }}
                                    className="p-1 text-dark-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                    title="Marcar como lida"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteNotification(notification.id)
                                  }}
                                  className="p-1 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            
                            <p className="text-xs text-dark-400 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-dark-500">
                                {formatDistanceToNow(new Date(notification.created_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </p>
                              
                              {notification.action_url && (
                                <a
                                  href={notification.action_url}
                                  onClick={() => {
                                    markAsRead([notification.id])
                                    setNotificationsOpen(false)
                                  }}
                                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
                                >
                                  {notification.action_label ?? 'Ver mais'}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="px-4 py-3 border-t border-dark-700">
                    <a 
                      href="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                      className="w-full text-center text-sm text-primary-400 hover:text-primary-300 transition-colors flex items-center justify-center gap-1"
                    >
                      Ver todas as notificações
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Avatar with Dropdown Menu */}
        <div ref={userMenuRef} className="relative flex items-center gap-3 pl-4 border-l border-dark-700">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 p-1 rounded-lg hover:bg-dark-800/50 transition-colors"
          >
            <div className="text-right">
              <p className="text-sm font-medium text-white">{userName}</p>
              <p className="text-xs text-dark-400">{getRoleLabel(userRole)}</p>
            </div>
            {userAvatar ? (
              <img 
                src={userAvatar} 
                alt={userName}
                className="w-9 h-9 rounded-lg object-cover"
              />
            ) : (
              <Avatar
                fallback={userInitials}
                size="sm"
                status="online"
              />
            )}
            <ChevronDown className={cn(
              "w-4 h-4 text-dark-400 transition-transform",
              userMenuOpen && "rotate-180"
            )} />
          </button>

          {/* User Menu Dropdown */}
          <AnimatePresence>
            {userMenuOpen && (
              <>
                {/* Backdrop para fechar ao clicar fora */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setUserMenuOpen(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="fixed right-6 top-16 w-72 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                {/* User Info Header */}
                <div className="p-4 border-b border-dark-700">
                  <div className="flex items-center gap-3">
                    {userAvatar ? (
                      <img 
                        src={userAvatar} 
                        alt={userName}
                        className="w-12 h-12 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">{userInitials}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{userName}</p>
                      <p className="text-xs text-dark-400 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary-500/20 text-primary-400">
                        {getRoleLabel(userRole)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Agents Section */}
                {agents.length > 0 && (
                  <div className="px-3 py-2 border-b border-dark-700">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <Users className="w-3.5 h-3.5 text-dark-500" />
                      <span className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
                        Agentes ({agents.filter(a => a.status === 'online').length} online)
                      </span>
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {loadingAgents ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="w-4 h-4 animate-spin text-dark-500" />
                        </div>
                      ) : (
                        agents.map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                          >
                            <div className="relative">
                              {agent.avatar_url ? (
                                <img 
                                  src={agent.avatar_url} 
                                  alt={agent.name}
                                  className="w-6 h-6 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center">
                                  <span className="text-[10px] text-dark-400">
                                    {agent.name?.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div className={cn(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-dark-800',
                                agent.status === 'online' && 'bg-green-500',
                                agent.status === 'away' && 'bg-yellow-500',
                                agent.status === 'busy' && 'bg-red-500',
                                agent.status === 'offline' && 'bg-dark-500',
                              )} />
                            </div>
                            <span className="text-xs text-dark-300 truncate flex-1">{agent.name}</span>
                            <span className={cn(
                              'text-[10px]',
                              agent.status === 'online' && 'text-green-400',
                              agent.status === 'away' && 'text-yellow-400',
                              agent.status === 'busy' && 'text-red-400',
                              agent.status === 'offline' && 'text-dark-500',
                            )}>
                              {agent.status === 'online' ? 'Online' : 
                               agent.status === 'away' ? 'Ausente' :
                               agent.status === 'busy' ? 'Ocupado' : 'Offline'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Menu Options */}
                <div className="py-2">
                  <Link
                    href="/settings?tab=profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-dark-700/50 transition-colors"
                  >
                    <User className="w-4 h-4 text-dark-400" />
                    <span className="text-sm text-dark-300">Meu Perfil</span>
                  </Link>
                  <Link
                    href="/settings?tab=store"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-dark-700/50 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-dark-400" />
                    <span className="text-sm text-dark-300">Configurações da Loja</span>
                  </Link>
                  <Link
                    href="/settings?tab=integrations"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-dark-700/50 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-dark-400" />
                    <span className="text-sm text-dark-300">Integrações</span>
                  </Link>
                </div>

                {/* Logout */}
                <div className="px-4 py-2 border-t border-dark-700">
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-red-400 disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
                  </button>
                </div>
              </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
