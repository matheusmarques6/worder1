'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  BarChart3,
  Mail,
  ShoppingCart,
  HelpCircle,
  Menu,
  X,
  Store,
  ChevronDown,
  Check,
  CheckCheck,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Info,
  ShoppingBag,
  ExternalLink,
  Loader2,
  Target,
  RefreshCcw,
  FileText,
  Package,
  Send,
  Plug,
  Briefcase,
  MessageCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Custom icons for ad platforms
import { useStoreStore, useAuthStore, useUIStore, type ShopifyStore } from '@/stores'
import { AddStoreModal } from '@/components/store/AddStoreModal'
import { cn } from '@/lib/utils'

// ============================================
// Types
// ============================================

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

// Worder Logo Component
const WorderLogo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = {
    sm: { width: 80, height: 15 },
    md: { width: 110, height: 21 },
    lg: { width: 150, height: 29 },
  };
  
  return (
    <Image
      src="/logo.png"
      alt="Worder"
      width={sizes[size].width}
      height={sizes[size].height}
      className="object-contain"
      priority
    />
  );
};

const mainNav = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inbox', href: '/inbox', icon: MessageSquare },
  { name: 'Contatos', href: '/contacts', icon: Users },
  { name: 'Email', href: '/email/campaigns', icon: Mail },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { name: 'CRM', href: '/crm', icon: Briefcase },
]

const automationNav = [
  { name: 'Automações', href: '/automations', icon: Zap },
  { name: 'Formulários', href: '/forms', icon: FileText },
  { name: 'Segmentos', href: '/segments', icon: Target },
  { name: 'Recuperação', href: '/recovery', icon: RefreshCcw },
]

const analyticsNav = [
  { name: 'Visão Geral', href: '/analytics/sales', icon: BarChart3 },
]

const footerNav = [
  { name: 'Integrações', href: '/integrations', icon: Plug },
  { name: 'Configurações', href: '/settings', icon: Settings },
  { name: 'Ajuda', href: '/help', icon: HelpCircle },
]

const POLLING_INTERVAL = 30000 // 30 segundos

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ✅ MODIFICADO: Usar useUIStore para persistência do sidebar
  const { sidebarCollapsed: collapsed, toggleSidebar, _hasHydrated: uiHasHydrated } = useUIStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false)
  const pathname = usePathname()
  
  // ✅ MODIFICADO: Adicionar _hasHydrated para controlar quando carregar lojas
  const { stores, currentStore, setStores, setCurrentStore, addStore, _hasHydrated } = useStoreStore()
  const { user, setUser } = useAuthStore()

  // ✅ NOVO: Função para alternar sidebar (wrapper para manter compatibilidade)
  const setCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    // Se for função, ignorar e só fazer toggle
    // Se for boolean, comparar com atual e fazer toggle se diferente
    if (typeof value === 'boolean') {
      if (value !== collapsed) {
        toggleSidebar()
      }
    } else {
      toggleSidebar()
    }
  }

  // ============================================
  // Notifications State
  // ============================================
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)

  // User display data
  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const userRole = user?.role || 'Admin'

  // ============================================
  // Load Notifications
  // ============================================
  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return
    
    try {
      const res = await fetch(
        `/api/notifications?organizationId=${user.organization_id}&limit=15`
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
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ============================================
  // Notification Actions
  // ============================================
  const markAsRead = async (ids: string[]) => {
    if (!user?.organization_id || ids.length === 0) return
    
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
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
          organizationId: user.organization_id,
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
  // Helper: Get notification icon
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

  // Initialize user with default organization if not set
  useEffect(() => {
    const initializeUser = async () => {
      if (!user || !user.organization_id) {
        try {
          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-or-create-org' }),
          })
          const result = await response.json()
          
          if (result.organization) {
            setUser({
              id: result.user?.id || 'default-user',
              email: result.user?.email || 'demo@worder.com',
              name: result.user?.name || `${result.user?.first_name || ''} ${result.user?.last_name || ''}`.trim() || 'Usuário',
              avatar_url: result.user?.avatar_url,
              organization_id: result.user?.organization_id || result.organization.id,
              role: result.user?.role || 'admin',
              user_metadata: result.user?.user_metadata,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          }
        } catch (error) {
          console.error('Error initializing user:', error)
          setUser({
            id: 'default-user',
            email: 'demo@worder.com',
            name: 'Usuário',
            organization_id: 'default-org',
            role: 'admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
    }
    
    initializeUser()
  }, [user, setUser])

  // Get store initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleAddStore = (store: { name: string; domain: string; accessToken: string }) => {
    const newStore: ShopifyStore = {
      id: `store-${Date.now()}`,
      name: store.name,
      domain: store.domain,
      isActive: true,
    }
    addStore(newStore)
    setAddStoreModalOpen(false)
  }

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Load stores from database on mount - ✅ CORRIGIDO: Esperar hydration
  useEffect(() => {
    // ✅ CRÍTICO: Só rodar DEPOIS que o Zustand terminar de carregar do localStorage
    if (!_hasHydrated) {
      return
    }
    
    const loadStores = async () => {
      try {
        const response = await fetch('/api/stores')
        const result = await response.json()
        if (result.success && result.stores?.length > 0) {
          const formattedStores = result.stores.map((s: any) => ({
            id: s.id,
            name: s.shop_name || s.shop_domain,
            domain: s.shop_domain,
            isActive: s.is_active,
          }))
          setStores(formattedStores)
          
          // ✅ Agora currentStore já foi carregado do localStorage pelo Zustand
          // Verificar se a loja salva ainda existe na lista
          if (currentStore) {
            const storeStillExists = formattedStores.some((s: any) => s.id === currentStore.id)
            if (!storeStillExists) {
              // Loja não existe mais, selecionar a primeira
              setCurrentStore(formattedStores[0])
            }
          } else if (formattedStores.length > 0) {
            // Nenhuma loja selecionada, usar a primeira
            setCurrentStore(formattedStores[0])
          }
        }
      } catch (error) {
        console.error('Error loading stores:', error)
      }
    }
    loadStores()
  }, [_hasHydrated]) // ✅ MODIFICADO: Dependência em _hasHydrated

  // Listen for openAddStoreModal event from other components
  useEffect(() => {
    const handleOpenAddStoreModal = () => {
      setAddStoreModalOpen(true)
    }
    
    window.addEventListener('openAddStoreModal', handleOpenAddStoreModal)
    
    return () => {
      window.removeEventListener('openAddStoreModal', handleOpenAddStoreModal)
    }
  }, [])

  const NavLink = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const Icon = item.icon

    return (
      <Link href={item.href}>
        <div
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
            ${isActive
              ? 'bg-sidebar-active text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-sidebar-hover'
            }
          `}
        >
          {isActive && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand-500 rounded-full"
            />
          )}
          <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-400' : ''}`} />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="font-medium whitespace-nowrap overflow-hidden"
              >
                {item.name}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700/30">
        <Link href="/dashboard" className="flex flex-col gap-0.5">
          <WorderLogo size={collapsed ? 'sm' : 'md'} />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-gray-500"
              >
                by Convertfy
              </motion.p>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {/* Main */}
        <nav className="space-y-0.5">
          {mainNav.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}
        </nav>

        {/* Automação */}
        <div>
          {!collapsed && (
            <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              Automação
            </p>
          )}
          <nav className="space-y-0.5">
            {automationNav.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>

        {/* Analytics */}
        <div>
          {!collapsed && (
            <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              Analytics
            </p>
          )}
          <nav className="space-y-0.5">
            {analyticsNav.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>

        {/* Footer nav */}
        <div>
          <nav className="space-y-0.5">
            {footerNav.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>
      </div>

      {/* Store Selector Section */}
      <div className="p-3 border-t border-gray-700/30 relative">
        {/* Store Dropdown */}
        <AnimatePresence>
          {storeDropdownOpen && !collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-3 right-3 mb-2 bg-sidebar border border-gray-700/50 rounded-xl shadow-xl overflow-hidden z-50"
            >
              {/* Stores List */}
              {stores.length > 0 && (
                <div className="p-2 border-b border-gray-700/50">
                  <p className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                        className={`
                          w-full flex items-center gap-3 p-2 rounded-lg transition-colors
                          ${currentStore?.id === store.id
                            ? 'bg-brand-500/10 text-brand-400'
                            : 'hover:bg-sidebar-hover text-white'
                          }
                        `}
                      >
                        <div className="w-8 h-8 rounded-lg bg-sidebar-hover text-gray-300 flex items-center justify-center text-xs font-bold">
                          {getInitials(store.name)}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">{store.name}</p>
                          <p className="text-xs text-gray-500 truncate">{store.domain}</p>
                        </div>
                        {currentStore?.id === store.id && (
                          <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
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
                  className="w-full flex items-center gap-3 p-2 rounded-lg text-brand-400 hover:bg-brand-500/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
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
            if (collapsed) {
              setAddStoreModalOpen(true)
            } else {
              setStoreDropdownOpen(!storeDropdownOpen)
            }
          }}
          className={`
            w-full flex items-center gap-3 p-2 rounded-xl transition-all
            bg-sidebar-hover/30 hover:bg-sidebar-hover
            ${storeDropdownOpen ? 'ring-1 ring-brand-500/50' : ''}
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          {/* Store Avatar */}
          <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {currentStore ? getInitials(currentStore.name) : <Store className="w-4 h-4" />}
          </div>

          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-medium text-white truncate">
                  {currentStore?.name || 'Selecionar Loja'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {currentStore?.domain || 'Nenhuma loja conectada'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && (
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${storeDropdownOpen ? 'rotate-180' : ''}`}
            />
          )}
        </button>
      </div>

      {/* Collapse button - Desktop only */}
      <div className="hidden lg:block p-3 pt-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-sidebar-hover/30 hover:bg-sidebar-hover text-gray-400 hover:text-white transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Recolher</span>
            </>
          )}
        </button>
      </div>
    </div>
  )

  // ============================================
  // Notifications Dropdown Component
  // ============================================
  const NotificationsDropdown = () => (
    <AnimatePresence>
      {notificationsOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">Notificações</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-brand-50 text-brand-600 text-xs font-medium rounded-full">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-1"
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
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-sm text-gray-500">Nenhuma notificação</p>
                <p className="text-xs text-gray-400 mt-1">
                  Você será notificado sobre eventos importantes
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`
                    px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors
                    ${!notification.read ? 'bg-brand-50/50' : ''}
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium line-clamp-1 ${notification.read ? 'text-gray-500' : 'text-gray-900'}`}>
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
                              className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
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
                            className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-gray-400">
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
                            className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
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
            <div className="px-4 py-3 border-t border-gray-200">
              <a
                href="/notifications"
                onClick={() => setNotificationsOpen(false)}
                className="w-full text-center text-sm text-brand-600 hover:text-brand-700 transition-colors flex items-center justify-center gap-1"
              >
                Ver todas as notificações
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <WorderLogo size="sm" />
            <span className="font-semibold text-gray-900">Worder</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationsDropdown />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-sidebar z-50"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-lg bg-sidebar-hover/30 hover:bg-sidebar-hover text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 280 }}
        className="hidden lg:block fixed left-0 top-0 bottom-0 bg-sidebar border-r border-gray-700/20 z-40"
      >
        <SidebarContent />
      </motion.aside>

      {/* Main Content */}
      {/* ✅ CORRIGIDO: Remover animate marginLeft que quebrava mobile */}
      {/* Agora usa classes Tailwind que só aplicam no desktop (lg:) */}
      <main
        className={cn(
          "min-h-screen pt-[72px] lg:pt-0 transition-all duration-300",
          // Mobile: sempre ml-0
          "ml-0",
          // Desktop: margem baseada no estado do sidebar
          collapsed ? "lg:ml-20" : "lg:ml-[280px]"
        )}
      >
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar em tudo..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-gray-200 rounded text-[10px] text-gray-500 font-mono">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications Button */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2.5 rounded-xl bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-brand-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationsDropdown />
            </div>
            
            <div className="w-px h-8 bg-gray-200" />
            
            {/* User Info */}
            <button className="flex items-center gap-3 p-1.5 pr-4 rounded-xl hover:bg-gray-100 transition-all">
              <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
                <span className="text-brand-700 font-semibold text-sm">{userInitials}</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{userRole}</p>
              </div>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Add Store Modal */}
      <AddStoreModal
        isOpen={addStoreModalOpen}
        onClose={() => setAddStoreModalOpen(false)}
        onSuccess={handleAddStore}
      />
    </div>
  )
}
