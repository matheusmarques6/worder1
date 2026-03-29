'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Zap,
  Settings,
  Bell,
  Search,
  LogOut,
  Mail,
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
  Puzzle,
  Send,
  BarChart3,
  Briefcase,
  Package,
  Tag,
  Image as ImageIcon,
  Palette,
  MessageCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

// ============================================
// Navigation — SINGLE SOURCE OF TRUTH (with submenus)
// ============================================
interface NavChild { name: string; href: string }
interface NavItem { name: string; href: string; icon: any; children?: NavChild[] }
interface NavSection { label?: string; items: NavItem[] }

const navigation: NavSection[] = [
  {
    items: [
      { name: 'Início', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Campanhas', href: '/campaigns', icon: Send },
      { name: 'Fluxos', href: '/automations', icon: Zap },
    ],
  },
  {
    label: 'Canais',
    items: [
      {
        name: 'Email', href: '/email/campaigns', icon: Mail,
        children: [
          { name: 'Campanhas', href: '/email/campaigns' },
          { name: 'Templates', href: '/email/templates' },
        ],
      },
      {
        name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle,
        children: [
          { name: 'Inbox', href: '/whatsapp' },
          { name: 'Campanhas', href: '/whatsapp/campaigns' },
          { name: 'Agentes IA', href: '/whatsapp/ai-agents' },
        ],
      },
    ],
  },
  {
    label: 'Audiência',
    items: [
      { name: 'Contatos', href: '/contacts', icon: Users },
      { name: 'Segmentos', href: '/segments', icon: Target },
      { name: 'Formulários', href: '/forms', icon: FileText },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      { name: 'Templates', href: '/email/templates', icon: Palette },
      { name: 'Produtos', href: '/content/products', icon: Package },
      { name: 'Cupons', href: '/content/coupons', icon: Tag },
      { name: 'Mídia', href: '/content/media', icon: ImageIcon },
    ],
  },
  {
    label: 'Analytics',
    items: [
      {
        name: 'Relatórios', href: '/analytics', icon: BarChart3,
        children: [
          { name: 'Visão Geral', href: '/analytics' },
          { name: 'Vendas', href: '/analytics/sales' },
          { name: 'Campanhas', href: '/analytics/email' },
          { name: 'Entregabilidade', href: '/analytics/deliverability' },
        ],
      },
      { name: 'CRM', href: '/crm', icon: Briefcase },
    ],
  },
  {
    items: [
      { name: 'Recuperação', href: '/recovery', icon: RefreshCcw },
      { name: 'Integrações', href: '/integrations', icon: Puzzle },
      { name: 'Configurações', href: '/settings', icon: Settings },
    ],
  },
]

const POLLING_INTERVAL = 30000

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { sidebarCollapsed: collapsed, toggleSidebar, _hasHydrated: uiHasHydrated } = useUIStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false)
  const pathname = usePathname()

  const { stores, currentStore, setStores, setCurrentStore, addStore, _hasHydrated } = useStoreStore()
  const { user, setUser } = useAuthStore()

  // ============================================
  // Notifications State
  // ============================================
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const userRole = user?.role || 'Admin'

  // ============================================
  // Load Notifications
  // ============================================
  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return
    try {
      const res = await fetch(`/api/notifications?organizationId=${user.organization_id}&limit=15`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch (err) {
      console.error('Error loading notifications:', err)
    }
  }, [user?.organization_id])

  useEffect(() => {
    if (user?.organization_id) {
      setLoadingNotifications(true)
      loadNotifications().finally(() => setLoadingNotifications(false))
      const interval = setInterval(loadNotifications, POLLING_INTERVAL)
      return () => clearInterval(interval)
    }
  }, [user?.organization_id, loadNotifications])

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
        body: JSON.stringify({ organizationId: user.organization_id, notificationIds: ids }),
      })
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
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
        body: JSON.stringify({ organizationId: user.organization_id, markAllRead: true }),
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

  const getNotificationIcon = (notification: Notification) => {
    const type = notification.data?.integration_type
    if (type === 'shopify') return <ShoppingBag className="w-4 h-4 text-[#95BF47]" />
    if (type === 'whatsapp') return <MessageSquare className="w-4 h-4 text-[#25D366]" />
    switch (notification.priority) {
      case 'urgent': return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'high': return <AlertTriangle className="w-4 h-4 text-amber-500" />
      default: return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  // Initialize user
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
        } catch {
          setUser({
            id: 'default-user', email: 'demo@worder.com', name: 'Usuário',
            organization_id: 'default-org', role: 'admin',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          })
        }
      }
    }
    initializeUser()
  }, [user, setUser])

  const getInitials = (name: string) =>
    name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2)

  const handleAddStore = (store: { name: string; domain: string; accessToken: string }) => {
    const newStore: ShopifyStore = {
      id: `store-${Date.now()}`, name: store.name, domain: store.domain, isActive: true,
    }
    addStore(newStore)
    setAddStoreModalOpen(false)
  }

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Load stores
  useEffect(() => {
    if (!_hasHydrated) return
    const loadStores = async () => {
      try {
        const response = await fetch('/api/stores')
        const result = await response.json()
        if (result.success && result.stores?.length > 0) {
          const formattedStores = result.stores.map((s: any) => ({
            id: s.id, name: s.shop_name || s.shop_domain, domain: s.shop_domain, isActive: s.is_active,
          }))
          setStores(formattedStores)
          if (currentStore) {
            const storeStillExists = formattedStores.some((s: any) => s.id === currentStore.id)
            if (!storeStillExists) setCurrentStore(formattedStores[0])
          } else if (formattedStores.length > 0) {
            setCurrentStore(formattedStores[0])
          }
        }
      } catch (error) {
        console.error('Error loading stores:', error)
      }
    }
    loadStores()
  }, [_hasHydrated])

  useEffect(() => {
    const handleOpenAddStoreModal = () => setAddStoreModalOpen(true)
    window.addEventListener('openAddStoreModal', handleOpenAddStoreModal)
    return () => window.removeEventListener('openAddStoreModal', handleOpenAddStoreModal)
  }, [])

  // ============================================
  // Expandable submenu state
  // ============================================
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpand = (name: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // Auto-expand active sections
  useEffect(() => {
    const newExpanded = new Set<string>()
    for (const section of navigation) {
      for (const item of section.items) {
        if (item.children) {
          const isChildActive = item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
          if (isChildActive) newExpanded.add(item.name)
        }
      }
    }
    if (newExpanded.size > 0) setExpandedItems(newExpanded)
  }, [pathname])

  // ============================================
  // Nav Item Renderer
  // ============================================
  const SidebarNavItem = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const isExpanded = expandedItems.has(item.name)
    const Icon = item.icon
    const hasChildren = item.children && item.children.length > 0

    const itemClasses = cn(
      'flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors w-full',
      isActive && !hasChildren ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
    )

    if (hasChildren && !collapsed) {
      return (
        <div>
          <button onClick={() => toggleExpand(item.name)} className={cn(itemClasses, 'justify-between', isExpanded && 'text-gray-200')}>
            <div className="flex items-center gap-3">
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="truncate">{item.name}</span>
            </div>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-180')} />
          </button>
          {isExpanded && (
            <div className="ml-9 mt-0.5 space-y-0.5">
              {item.children!.map(child => (
                <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block py-1.5 px-3 rounded-md text-[12px] transition-colors',
                    pathname === child.href || pathname.startsWith(child.href + '/')
                      ? 'text-white bg-white/10'
                      : 'text-gray-500 hover:text-gray-300'
                  )}>
                  {child.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link href={item.href} onClick={() => setMobileOpen(false)}>
        <div className={itemClasses}>
          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span className="truncate">{item.name}</span>}
        </div>
      </Link>
    )
  }

  // ============================================
  // Sidebar Content (Omnisend-style dark sidebar with sections)
  // ============================================
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-800/50">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Worder" width={collapsed ? 32 : 100} height={collapsed ? 6 : 19} className="object-contain" priority />
          {!collapsed && <span className="text-gray-500 text-[10px]">by Convertfy</span>}
        </Link>
      </div>

      {/* Navigation with sections */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navigation.map((section, i) => (
          <div key={i} className={section.label ? 'mt-4' : i > 0 ? 'mt-2 pt-2 border-t border-gray-800/30 mx-3' : ''}>
            {section.label && !collapsed && (
              <div className="px-5 pb-1">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em]">{section.label}</p>
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => (
                <SidebarNavItem key={item.name + item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Store Selector */}
      <div className="border-t border-gray-800/50 p-3 relative">
        <AnimatePresence>
          {storeDropdownOpen && !collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full left-3 right-3 mb-2 bg-[#252A2F] border border-gray-700/50 rounded-lg shadow-xl overflow-hidden z-50"
            >
              {stores.length > 0 && (
                <div className="p-2 border-b border-gray-700/50">
                  <p className="px-2 py-1 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Suas Lojas</p>
                  <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                    {stores.map((store) => (
                      <button key={store.id} onClick={() => { setCurrentStore(store); setStoreDropdownOpen(false) }}
                        className={cn('w-full flex items-center gap-3 p-2 rounded-md transition-colors',
                          currentStore?.id === store.id ? 'bg-brand-500/10 text-brand-400' : 'text-gray-300 hover:bg-white/5')}>
                        <div className="w-7 h-7 rounded bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300">
                          {getInitials(store.name)}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">{store.name}</p>
                          <p className="text-[11px] text-gray-500 truncate">{store.domain}</p>
                        </div>
                        {currentStore?.id === store.id && <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-2">
                <button onClick={() => { setAddStoreModalOpen(true); setStoreDropdownOpen(false) }}
                  className="w-full flex items-center gap-3 p-2 rounded-md text-brand-400 hover:bg-white/5 transition-colors">
                  <div className="w-7 h-7 rounded bg-brand-500/10 flex items-center justify-center"><Plus className="w-4 h-4" /></div>
                  <span className="text-sm font-medium">Adicionar Loja</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => collapsed ? setAddStoreModalOpen(true) : setStoreDropdownOpen(!storeDropdownOpen)}
          className={cn('w-full flex items-center gap-3 p-2 rounded-md transition-colors hover:bg-white/5', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded bg-brand-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
            {currentStore ? getInitials(currentStore.name) : <Store className="w-4 h-4" />}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium text-gray-300 truncate">{currentStore?.name || 'Selecionar Loja'}</p>
                <p className="text-[11px] text-gray-500 truncate">{currentStore?.domain || 'Nenhuma loja'}</p>
              </div>
              <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform flex-shrink-0', storeDropdownOpen && 'rotate-180')} />
            </>
          )}
        </button>
      </div>

      {/* User Footer */}
      <div className="border-t border-gray-800/50 p-3">
        <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs font-medium flex-shrink-0">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-gray-300 truncate">{userName}</p>
              <p className="text-[11px] text-gray-500 truncate">{userRole}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ============================================
  // Render
  // ============================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-900">Worder</span>
          </div>
          <div className="relative" ref={notificationsRef}>
            <button onClick={() => setNotificationsOpen(!notificationsOpen)} className="p-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 bg-black/60 z-50" />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[240px] bg-[#1B1F23] z-50">
              <button onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex fixed left-0 top-0 bottom-0 bg-[#1B1F23] z-40 flex-col transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[220px]'
      )}>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className={cn(
        'min-h-screen pt-[72px] lg:pt-0 transition-all duration-300 ml-0',
        collapsed ? 'lg:ml-[72px]' : 'lg:ml-[220px]'
      )}>
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button onClick={() => toggleSidebar()} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar..."
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={notificationsRef}>
              <button onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-brand-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm">Notificações</h3>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 bg-brand-100 text-brand-600 text-xs font-medium rounded-full">
                            {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xs text-brand-600 hover:text-brand-500 flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {loadingNotifications ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                          <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">Nenhuma notificação</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div key={notification.id}
                            className={cn('px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors', !notification.read && 'bg-brand-50/30')}>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(notification)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={cn('text-sm font-medium line-clamp-1', notification.read ? 'text-gray-600' : 'text-gray-900')}>
                                    {notification.title}
                                  </p>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {!notification.read && (
                                      <button onClick={(e) => { e.stopPropagation(); markAsRead([notification.id]) }}
                                        className="p-1 text-gray-400 hover:text-emerald-500 rounded transition-colors" title="Marcar como lida">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id) }}
                                      className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors" title="Excluir">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-xs text-gray-400">
                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                                  </p>
                                  {notification.action_url && (
                                    <a href={notification.action_url}
                                      onClick={() => { markAsRead([notification.id]); setNotificationsOpen(false) }}
                                      className="text-xs text-brand-600 hover:text-brand-500 flex items-center gap-1">
                                      {notification.action_label ?? 'Ver mais'} <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="px-4 py-3 border-t border-gray-100">
                        <Link href="/notifications" onClick={() => setNotificationsOpen(false)}
                          className="w-full text-center text-sm text-brand-600 hover:text-brand-500 flex items-center justify-center gap-1">
                          Ver todas <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-8 bg-gray-200" />

            <div className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
                <span className="text-white font-semibold text-xs">{userInitials}</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-[11px] text-gray-500">{userRole}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>

      <AddStoreModal isOpen={addStoreModalOpen} onClose={() => setAddStoreModalOpen(false)} onSuccess={handleAddStore} />
    </div>
  )
}
