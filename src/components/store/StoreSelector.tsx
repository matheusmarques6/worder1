'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store,
  ChevronDown,
  Check,
  Plus,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ShopifyStore {
  id: string
  name: string
  domain: string
  isActive: boolean
  logoUrl?: string
}

interface StoreSelectorProps {
  stores: ShopifyStore[]
  currentStore: ShopifyStore | null
  onStoreSelect: (store: ShopifyStore) => void
  onAddStore: () => void
  userName?: string
  userEmail?: string
  onLogout?: () => void
  collapsed?: boolean
}

export function StoreSelector({
  stores,
  currentStore,
  onStoreSelect,
  onAddStore,
  userName = 'Usuário',
  userEmail = '',
  onLogout,
  collapsed = false,
}: StoreSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get store initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm"
      >
        {currentStore ? getInitials(currentStore.name) : <Store className="w-5 h-5" />}
      </button>
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-3 p-3 rounded-xl transition-all',
          'bg-dark-800/50 border border-dark-700/50 hover:border-dark-600',
          isOpen && 'border-primary-500/50 bg-dark-800'
        )}
      >
        {/* Store Avatar */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {currentStore ? getInitials(currentStore.name) : <Store className="w-5 h-5" />}
        </div>

        {/* Store Info */}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {currentStore?.name || 'Selecionar Loja'}
          </p>
          <p className="text-xs text-dark-400 truncate">
            {currentStore?.domain || 'Nenhuma loja conectada'}
          </p>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-dark-400 transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-50"
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
                        onStoreSelect(store)
                        setIsOpen(false)
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
                  onAddStore()
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg text-primary-400 hover:bg-primary-500/10 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Adicionar Nova Loja</span>
              </button>
            </div>

            {/* User Section */}
            <div className="p-2 border-t border-dark-700 bg-dark-900/50">
              <div className="flex items-center gap-3 px-2 py-1">
                <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-xs font-bold text-white">
                  {getInitials(userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{userName}</p>
                  <p className="text-xs text-dark-400 truncate">{userEmail}</p>
                </div>
              </div>
              
              {onLogout && (
                <button
                  onClick={() => {
                    onLogout()
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-3 p-2 mt-1 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sair</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StoreSelector
