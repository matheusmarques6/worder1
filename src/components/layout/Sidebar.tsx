'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore, useStoreStore, useAuthStore } from '@/stores'
import {
  ChartLineUp,
  ChatCircleDots,
  UsersThree,
  Megaphone,
  Lightning,
  ShoppingCartSimple,
  Globe,
  Folder,
  ChartBar,
  Plugs,
  GearSix,
  CaretLeft,
  CaretRight,
  CaretDown,
  Storefront,
  Plus,
  Check,
  SignOut,
  Bell,
  CheckCircle,
  Trash,
  ArrowSquareOut,
  Warning,
  WarningCircle,
  Info,
  User,
  Buildings,
  List,
  Spinner,
  ShoppingBag,
  ChatCircle,
  Question,
  WhatsappLogo,
  DeviceMobileSpeaker,
  EnvelopeSimple,
  Image as ImageIcon,
  Tag,
  Upload,
  ListBullets,
  Code,
  ShieldCheck,
  Key,
} from '@phosphor-icons/react'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>
  badge?: number
  children?: NavItem[]
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
// Navigation Items — Estrutura conforme Arquitetura Worder
// ============================================

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: ChartLineUp },
  { title: 'Inbox', href: '/inbox', icon: ChatCircleDots, badge: 0 },
  { title: 'Contatos', href: '/contacts', icon: UsersThree, children: [
    { title: 'Todos', href: '/contacts', icon: UsersThree },
    { title: 'Listas', href: '/contacts/lists', icon: ListBullets },
    { title: 'Importar', href: '/contacts/import', icon: Upload },
  ]},
  { title: 'Campanhas', href: '/campaigns', icon: Megaphone },
  { title: 'Automações', href: '/automations', icon: Lightning },
  { title: 'Recuperação', href: '/recovery', icon: ShoppingCartSimple },
  { title: 'WhatsApp', href: '/whatsapp', icon: WhatsappLogo, children: [
    { title: 'Inbox', href: '/whatsapp/inbox', icon: ChatCircleDots },
    { title: 'Campanhas', href: '/whatsapp/campaigns', icon: Megaphone },
    { title: 'Broadcast', href: '/whatsapp/broadcast', icon: WhatsappLogo },
    { title: 'Phonebooks', href: '/whatsapp/phonebooks', icon: UsersThree },
  ]},
  { title: 'SMS', href: '/sms', icon: DeviceMobileSpeaker },
]

const toolsNavItems: NavItem[] = [
  { title: 'Site', href: '/site', icon: Globe },
  { title: 'Conteúdo', href: '/content', icon: Folder, children: [
    { title: 'Templates E-mail', href: '/content/templates', icon: EnvelopeSimple },
    { title: 'Templates WhatsApp', href: '/content/templates/whatsapp', icon: WhatsappLogo },
    { title: 'Mídia', href: '/content/media', icon: ImageIcon },
    { title: 'Cupons', href: '/content/coupons', icon: Tag },
  ]},
  { title: 'Analytics', href: '/analytics', icon: ChartBar },
  { title: 'Integrações', href: '/integrations', icon: Plugs },
]

const systemNavItems: NavItem[] = [
  { title: 'Configurações', href: '/settings', icon: GearSix, children: [
    { title: 'Geral', href: '/settings', icon: GearSix },
    { title: 'API', href: '/settings/api', icon: Code },
    { title: 'LGPD', href: '/settings/lgpd', icon: ShieldCheck },
    { title: 'Credenciais', href: '/settings/credentials', icon: Key },
  ]},
  { title: 'Ajuda', href: '/help', icon: Question },
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

  const [expandedItems, setExpandedItems] = useState<string[]>([])

  const toggleExpand = (href: string) => {
    setExpandedItems(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href])
  }

  // Auto-expand parent if child is active
  useEffect(() => {
    const allItems = [...mainNavItems, ...toolsNavItems, ...systemNavItems]
    allItems.forEach(item => {
      if (item.children) {
        const childActive = item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
        if (childActive && !expandedItems.includes(item.href)) {
          setExpandedItems(prev => [...prev, item.href])
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const NavLink = ({ item }: { item: NavItem }) => {
    const isExactActive = pathname === item.href
    const isActive = isExactActive || pathname.startsWith(item.href + '/')
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.includes(item.href)
    const Icon = item.icon

    const linkContent = (
      <div
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer',
          'hover:bg-white/[0.06]',
          isActive && !hasChildren && 'bg-white/[0.08] text-white',
          isActive && hasChildren && 'text-white',
          !isActive && 'text-dark-400 hover:text-dark-200'
        )}
        onClick={hasChildren && !sidebarCollapsed ? (e: React.MouseEvent) => { e.preventDefault(); toggleExpand(item.href) } : undefined}
      >
        {/* Active indicator — barra lateral laranja */}
        {isActive && !hasChildren && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-gradient-to-b from-[#F26B2A] to-[#F5A623]"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
          />
        )}

        <Icon
          className={cn('w-5 h-5 flex-shrink-0 transition-colors', isActive && 'text-[#F26B2A]')}
          weight={isActive ? 'fill' : 'regular'}
        />
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1"
            >
              {item.title}
            </motion.span>
          )}
        </AnimatePresence>
        {hasChildren && !sidebarCollapsed && (
          <CaretDown
            className={cn('w-3.5 h-3.5 text-dark-500 transition-transform', isExpanded && 'rotate-180')}
            weight="bold"
          />
        )}
        {item.badge !== undefined && item.badge > 0 && !sidebarCollapsed && (
          <span className="ml-auto bg-[#F26B2A] text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {item.badge !== undefined && item.badge > 0 && sidebarCollapsed && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#F26B2A] rounded-full ring-2 ring-[#1A1A1A]" />
        )}
      </div>
    )

    const wrappedLink = hasChildren && !sidebarCollapsed ? (
      <div>{linkContent}</div>
    ) : (
      <Link href={item.href}>{linkContent}</Link>
    )

    if (sidebarCollapsed) {
      return (
        <Tooltip content={item.title} side="right">
          <div className="relative">
            <Link href={item.href}>{linkContent}</Link>
          </div>
        </Tooltip>
      )
    }

    return (
      <div>
        {wrappedLink}
        {hasChildren && (
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="ml-4 pl-3 border-l border-white/[0.06] mt-1 space-y-0.5">
                  {item.children!.map((child) => {
                    const ChildIcon = child.icon
                    const isChildActive = pathname === child.href || (child.href !== item.href && pathname.startsWith(child.href + '/'))
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all duration-200',
                          'hover:bg-white/[0.06]',
                          isChildActive ? 'text-[#F26B2A] bg-white/[0.04]' : 'text-dark-400 hover:text-dark-200'
                        )}
                      >
                        <ChildIcon className="w-4 h-4 flex-shrink-0" weight={isChildActive ? 'fill' : 'regular'} />
                        <span className="font-medium">{child.title}</span>
                      </Link>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {!sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 flex flex-col",
          "bg-[#1A1A1A] border-r border-white/[0.06]",
          sidebarCollapsed && "max-lg:-translate-x-full",
          "transition-transform duration-300"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.06]">
          <Link href="/dashboard" className="flex flex-col gap-0.5">
            <Image
              src="/logo.png"
              alt="Worder"
              width={sidebarCollapsed ? 32 : 100}
              height={sidebarCollapsed ? 7 : 19}
              className="object-contain"
              priority
            />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] text-dark-500 tracking-wide"
                >
                  by Convertfy
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-dark-400 hover:text-white transition-all duration-200"
          >
            {sidebarCollapsed ? (
              <CaretRight className="w-3.5 h-3.5" weight="bold" />
            ) : (
              <CaretLeft className="w-3.5 h-3.5" weight="bold" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Principal */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-[0.12em]">
                Principal
              </p>
            )}
            <div className="space-y-0.5">
              {mainNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>

          {/* Ferramentas */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-[0.12em]">
                Ferramentas
              </p>
            )}
            <div className="space-y-0.5">
              {toolsNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>

          {/* Sistema */}
          <div>
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-[0.12em]">
                Sistema
              </p>
            )}
            <div className="space-y-0.5">
              {systemNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        </nav>

        {/* Store Selector */}
        <div className="p-2.5 border-t border-white/[0.06] relative">
          {/* Store Dropdown */}
          <AnimatePresence>
            {storeDropdownOpen && !sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#222222] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
              >
                {stores.length > 0 && (
                  <div className="p-2 border-b border-white/[0.06]">
                    <p className="px-2 py-1 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
                      Suas Lojas
                    </p>
                    <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => {
                            setCurrentStore(store)
                            setStoreDropdownOpen(false)
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200',
                            currentStore?.id === store.id
                              ? 'bg-[#F26B2A]/10 text-[#F26B2A]'
                              : 'hover:bg-white/[0.06] text-white'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center text-xs font-bold">
                            {getInitials(store.name)}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium truncate">{store.name}</p>
                            <p className="text-xs text-dark-500 truncate">{store.domain}</p>
                          </div>
                          {currentStore?.id === store.id && (
                            <Check className="w-4 h-4 text-[#F26B2A] flex-shrink-0" weight="bold" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-2">
                  <button
                    onClick={() => {
                      setAddStoreModalOpen(true)
                      setStoreDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-[#F26B2A] hover:bg-[#F26B2A]/10 transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#F26B2A]/15 flex items-center justify-center">
                      <Plus className="w-4 h-4" weight="bold" />
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
              'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200',
              'bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06]',
              storeDropdownOpen && 'border-[#F26B2A]/30 bg-[#F26B2A]/5',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-lg shadow-[#F26B2A]/20">
              {currentStore ? getInitials(currentStore.name) : <Storefront className="w-4 h-4" weight="fill" />}
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
                  <p className="text-[11px] text-dark-500 truncate">
                    {currentStore?.domain || 'Nenhuma loja conectada'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!sidebarCollapsed && (
              <CaretDown
                className={cn(
                  'w-3.5 h-3.5 text-dark-500 transition-transform flex-shrink-0',
                  storeDropdownOpen && 'rotate-180'
                )}
                weight="bold"
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
// Header Component
// ============================================

const POLLING_INTERVAL = 30000

export function Header() {
  const router = useRouter()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { currentStore } = useStoreStore()
  const { user, signOut } = useAuthStore()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const userRole = user?.role || 'admin'
  const userAvatar = user?.avatar_url

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [agents, setAgents] = useState<Array<{
    id: string
    name: string
    avatar_url?: string
    status: 'online' | 'offline' | 'away' | 'busy'
  }>>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Administrador'
      case 'manager': return 'Gerente'
      case 'agent': return 'Agente'
      default: return 'Admin'
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (userMenuOpen && user?.organization_id) {
      fetchAgents()
    }
  }, [userMenuOpen, user?.organization_id, fetchAgents])

  const loadNotifications = useCallback(async () => {
    if (!user?.organization_id) return
    try {
      const res = await fetch(`/api/notifications?limit=15`)
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = async (ids: string[]) => {
    if (!user?.organization_id || ids.length === 0) return
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
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
        body: JSON.stringify({ markAllRead: true }),
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
    if (type === 'shopify') {
      return <ShoppingBag className="w-4 h-4 text-[#95BF47]" weight="fill" />
    }
    if (type === 'whatsapp') {
      return <ChatCircle className="w-4 h-4 text-[#25D366]" weight="fill" />
    }
    switch (notification.priority) {
      case 'urgent':
        return <WarningCircle className="w-4 h-4 text-red-500" weight="fill" />
      case 'high':
        return <Warning className="w-4 h-4 text-amber-500" weight="fill" />
      default:
        return <Info className="w-4 h-4 text-blue-500" weight="fill" />
    }
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-16 bg-[#0F0F0F]/80 backdrop-blur-xl border-b border-white/[0.06] z-30 flex items-center justify-between px-4 lg:px-6 transition-all duration-300',
        'left-0',
        'lg:left-[72px]',
        !sidebarCollapsed && 'lg:left-[260px]'
      )}
    >
      {/* Mobile hamburger */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-2 rounded-lg hover:bg-white/[0.06] text-dark-400 hover:text-white transition-colors mr-2"
      >
        <List className="w-5 h-5" weight="bold" />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar em tudo..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-[#F26B2A]/40 focus:ring-2 focus:ring-[#F26B2A]/15 transition-all duration-200"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-dark-500 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.06]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 rounded-xl hover:bg-white/[0.06] text-dark-400 hover:text-white transition-colors"
          >
            <Bell className="w-5 h-5" weight={notificationsOpen ? 'fill' : 'regular'} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#F26B2A] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
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
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-96 bg-[#1A1A1A] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white font-display">Notificações</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-[#F26B2A]/15 text-[#F26B2A] text-xs font-medium rounded-full">
                        {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" weight="fill" />
                      Marcar todas
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-96 overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="flex items-center justify-center py-12">
                      <Spinner className="w-6 h-6 animate-spin text-dark-400" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <div className="w-12 h-12 bg-white/[0.04] rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bell className="w-6 h-6 text-dark-500" weight="duotone" />
                      </div>
                      <p className="text-sm text-dark-400">Nenhuma notificação</p>
                      <p className="text-xs text-dark-500 mt-1">Você será notificado sobre eventos importantes</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          'px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors',
                          !notification.read && 'bg-[#F26B2A]/[0.03]'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-sm font-medium line-clamp-1",
                                notification.read ? 'text-dark-300' : 'text-white'
                              )}>
                                {notification.title}
                              </p>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {!notification.read && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); markAsRead([notification.id]) }}
                                    className="p-1 text-dark-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                    title="Marcar como lida"
                                  >
                                    <Check className="w-3.5 h-3.5" weight="bold" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id) }}
                                  className="p-1 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                  title="Excluir"
                                >
                                  <Trash className="w-3.5 h-3.5" weight="bold" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-dark-400 mt-0.5 line-clamp-2">{notification.message}</p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-dark-500">
                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                              {notification.action_url && (
                                <a
                                  href={notification.action_url}
                                  onClick={() => { markAsRead([notification.id]); setNotificationsOpen(false) }}
                                  className="text-xs text-[#F26B2A] hover:text-[#F5A623] flex items-center gap-1 transition-colors"
                                >
                                  {notification.action_label ?? 'Ver mais'}
                                  <ArrowSquareOut className="w-3 h-3" weight="bold" />
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
                  <div className="px-4 py-3 border-t border-white/[0.06]">
                    <a
                      href="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                      className="w-full text-center text-sm text-[#F26B2A] hover:text-[#F5A623] transition-colors flex items-center justify-center gap-1"
                    >
                      Ver todas as notificações
                      <ArrowSquareOut className="w-3.5 h-3.5" weight="bold" />
                    </a>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Avatar with Dropdown */}
        <div className="relative flex items-center gap-3 pl-3 border-l border-white/[0.06]">
          <button
            ref={buttonRef}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 p-1 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{userName}</p>
              <p className="text-[11px] text-dark-500">{getRoleLabel(userRole)}</p>
            </div>
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <Avatar fallback={userInitials} size="sm" status="online" />
            )}
            <CaretDown className={cn("w-3.5 h-3.5 text-dark-500 transition-transform", userMenuOpen && "rotate-180")} weight="bold" />
          </button>

          {/* User Menu Dropdown */}
          {mounted && userMenuOpen && createPortal(
            <div className="fixed inset-0 z-[9999]">
              <div className="absolute inset-0" onClick={() => setUserMenuOpen(false)} />
              <motion.div
                ref={userMenuRef}
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-6 top-16 w-72 bg-[#1A1A1A] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* User Info */}
                <div className="p-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    {userAvatar ? (
                      <img src={userAvatar} alt={userName} className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center">
                        <span className="text-white font-bold text-lg">{userInitials}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{userName}</p>
                      <p className="text-xs text-dark-500 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#F26B2A]/15 text-[#F26B2A]">
                        {getRoleLabel(userRole)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Agents */}
                {agents.length > 0 && (
                  <div className="px-3 py-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <UsersThree className="w-3.5 h-3.5 text-dark-500" weight="duotone" />
                      <span className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
                        Agentes ({agents.filter(a => a.status === 'online').length} online)
                      </span>
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {loadingAgents ? (
                        <div className="flex items-center justify-center py-2">
                          <Spinner className="w-4 h-4 animate-spin text-dark-500" />
                        </div>
                      ) : (
                        agents.map((agent) => (
                          <div key={agent.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                            <div className="relative">
                              {agent.avatar_url ? (
                                <img src={agent.avatar_url} alt={agent.name} className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center">
                                  <span className="text-[10px] text-dark-400">{agent.name?.substring(0, 2).toUpperCase()}</span>
                                </div>
                              )}
                              <div className={cn(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1A1A1A]',
                                agent.status === 'online' && 'bg-green-500',
                                agent.status === 'away' && 'bg-yellow-500',
                                agent.status === 'busy' && 'bg-red-500',
                                agent.status === 'offline' && 'bg-dark-600',
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
                  <Link href="/settings?tab=profile" onClick={() => setUserMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.04] transition-colors">
                    <User className="w-4 h-4 text-dark-400" weight="duotone" />
                    <span className="text-sm text-dark-300">Meu Perfil</span>
                  </Link>
                  <Link href="/settings?tab=store" onClick={() => setUserMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.04] transition-colors">
                    <Buildings className="w-4 h-4 text-dark-400" weight="duotone" />
                    <span className="text-sm text-dark-300">Configurações da Loja</span>
                  </Link>
                  <Link href="/integrations" onClick={() => setUserMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.04] transition-colors">
                    <Plugs className="w-4 h-4 text-dark-400" weight="duotone" />
                    <span className="text-sm text-dark-300">Integrações</span>
                  </Link>
                </div>

                {/* Logout */}
                <div className="px-4 py-2 border-t border-white/[0.06]">
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-red-400 disabled:opacity-50"
                  >
                    <SignOut className="w-4 h-4" weight="bold" />
                    <span className="text-sm">{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
                  </button>
                </div>
              </motion.div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </header>
  )
}
