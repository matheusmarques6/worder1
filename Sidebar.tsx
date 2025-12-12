'use client'

import * as React from 'react'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore, useStoreStore } from '@/stores'
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
  Plus,
  ShoppingBag,
} from 'lucide-react'
import { Avatar, Tooltip } from '@/components/ui'
import { AddStoreModal } from '@/components/store/AddStoreModal'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'CRM', href: '/crm', icon: Users },
  { title: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, badge: 3 },
  { title: 'Automações', href: '/automations', icon: Zap },
]

const analyticsNavItems: NavItem[] = [
  { title: 'Shopify', href: '/analytics/shopify', icon: ShoppingBag },
  { title: 'E-mail Marketing', href: '/analytics/email', icon: Mail },
  { title: 'Facebook Ads', href: '/analytics/facebook', icon: BarChart3 },
  { title: 'Google Ads', href: '/analytics/google', icon: BarChart3 },
  { title: 'TikTok Ads', href: '/analytics/tiktok', icon: BarChart3 },
]

const settingsNavItems: NavItem[] = [
  { title: 'Configurações', href: '/settings', icon: Settings },
  { title: 'Ajuda', href: '/help', icon: HelpCircle },
]

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
                Analytics
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

export function Header() {
  const { sidebarCollapsed } = useUIStore()
  const { currentStore } = useStoreStore()

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
        <button className="relative p-2 rounded-xl hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full" />
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-3 pl-4 border-l border-dark-700">
          <div className="text-right">
            <p className="text-sm font-medium text-white">João Demo</p>
            <p className="text-xs text-dark-400">Admin</p>
          </div>
          <Avatar
            fallback="JD"
            size="sm"
            status="online"
          />
        </div>
      </div>
    </header>
  )
}
