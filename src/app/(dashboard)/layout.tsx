'use client'

import { useState, useEffect } from 'react'
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
  Moon,
  Sun,
  Menu,
  X,
  DollarSign,
  TrendingUp,
  Store,
  ChevronDown,
  Check,
  Plus,
} from 'lucide-react'

// Custom icons for ad platforms
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
)

import { useStoreStore, type ShopifyStore } from '@/stores'
import { AddStoreModal } from '@/components/store/AddStoreModal'

// Worder Logo Component
const WorderLogo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  // Logo original: 900x173 (proporção ~5.2:1)
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

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'CRM', href: '/crm', icon: Users },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { name: 'Automações', href: '/automations', icon: Zap },
]

const analyticsNav = [
  { name: 'E-mail Marketing', href: '/analytics/email', icon: Mail },
  { name: 'Facebook Ads', href: '/analytics/facebook', icon: FacebookIcon },
  { name: 'Google Ads', href: '/analytics/google', icon: GoogleIcon },
  { name: 'TikTok Ads', href: '/analytics/tiktok', icon: TikTokIcon },
]

const systemNav = [
  { name: 'Configurações', href: '/settings', icon: Settings },
  { name: 'Ajuda', href: '/help', icon: HelpCircle },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifications, setNotifications] = useState(3)
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false)
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false)
  const pathname = usePathname()
  
  const { stores, currentStore, setCurrentStore, addStore } = useStoreStore()

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
        <motion.div
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
            ${isActive
              ? 'bg-gradient-to-r from-primary-500/20 to-accent-500/10 text-white'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
            }
          `}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
        >
          {isActive && (
            <motion.div
              layoutId="activeTab"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-primary-500 to-accent-500 rounded-full"
            />
          )}
          <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary-400' : ''}`} />
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
        </motion.div>
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-dark-800/50">
        <Link href="/dashboard" className="flex flex-col gap-0.5">
          <WorderLogo size={collapsed ? 'sm' : 'md'} />
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-dark-500"
              >
                by Convertfy
              </motion.p>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
              Principal
            </p>
          )}
          <nav className="space-y-1">
            {navigation.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>

        {/* Analytics */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
              Analytics
            </p>
          )}
          <nav className="space-y-1">
            {analyticsNav.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>

        {/* System */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-dark-500 uppercase tracking-wider">
              Sistema
            </p>
          )}
          <nav className="space-y-1">
            {systemNav.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </nav>
        </div>
      </div>

      {/* Store Selector Section */}
      <div className="p-3 border-t border-dark-800/50 relative">
        {/* Store Dropdown */}
        <AnimatePresence>
          {storeDropdownOpen && !collapsed && (
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
                        className={`
                          w-full flex items-center gap-3 p-2 rounded-lg transition-colors
                          ${currentStore?.id === store.id
                            ? 'bg-primary-500/10 text-primary-400'
                            : 'hover:bg-dark-700/50 text-white'
                          }
                        `}
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
            if (collapsed) {
              setAddStoreModalOpen(true)
            } else {
              setStoreDropdownOpen(!storeDropdownOpen)
            }
          }}
          className={`
            w-full flex items-center gap-3 p-2 rounded-xl transition-all
            bg-dark-800/30 hover:bg-dark-800/50
            ${storeDropdownOpen ? 'ring-1 ring-primary-500/50' : ''}
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          {/* Store Avatar */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
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
                <p className="text-xs text-dark-400 truncate">
                  {currentStore?.domain || 'Nenhuma loja conectada'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && (
            <ChevronDown
              className={`w-4 h-4 text-dark-400 transition-transform flex-shrink-0 ${storeDropdownOpen ? 'rotate-180' : ''}`}
            />
          )}
        </button>
      </div>

      {/* Collapse button - Desktop only */}
      <div className="hidden lg:block p-3 pt-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-dark-800/30 hover:bg-dark-800/50 text-dark-400 hover:text-white transition-all"
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

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-dark-900/95 backdrop-blur-xl border-b border-dark-800/50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg bg-dark-800/50 text-dark-400 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <WorderLogo size="sm" />
            <span className="font-semibold text-white">Worder</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg bg-dark-800/50 text-dark-400 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              {notifications > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                  {notifications}
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
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-dark-900/95 backdrop-blur-xl border-r border-dark-800/50 z-50"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-lg bg-dark-800/50 text-dark-400 hover:text-white transition-colors"
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
        className="hidden lg:block fixed left-0 top-0 bottom-0 bg-dark-900/50 backdrop-blur-xl border-r border-dark-800/50 z-40"
      >
        <SidebarContent />
      </motion.aside>

      {/* Main Content */}
      <motion.main
        initial={false}
        animate={{ marginLeft: collapsed ? 80 : 280 }}
        className="min-h-screen lg:ml-[280px] pt-[72px] lg:pt-0"
      >
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center justify-between px-6 py-4 bg-dark-950/80 backdrop-blur-xl border-b border-dark-800/50">
          <div className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
              <input
                type="text"
                placeholder="Buscar em tudo..."
                className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-dark-700/50 rounded text-[10px] text-dark-400 font-mono">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2.5 rounded-xl bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-700/50 transition-all relative">
              <Bell className="w-5 h-5" />
              {notifications > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                  {notifications}
                </span>
              )}
            </button>
            <div className="w-px h-8 bg-dark-800" />
            <button className="flex items-center gap-3 p-1.5 pr-4 rounded-xl hover:bg-dark-800/50 transition-all">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">JD</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">João Demo</p>
                <p className="text-xs text-dark-400">Admin</p>
              </div>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </motion.main>

      {/* Add Store Modal */}
      <AddStoreModal
        isOpen={addStoreModalOpen}
        onClose={() => setAddStoreModalOpen(false)}
        onSuccess={handleAddStore}
      />
    </div>
  )
}
