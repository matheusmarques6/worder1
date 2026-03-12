'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useStoreStore, useAuthStore, useUIStore, type ShopifyStore } from '@/stores'
import { AddStoreModal } from '@/components/store/AddStoreModal'
import { Sidebar, Header } from '@/components/layout/Sidebar'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { sidebarCollapsed } = useUIStore()
  const [addStoreModalOpen, setAddStoreModalOpen] = useState(false)
  const pathname = usePathname()

  const { stores, currentStore, setStores, setCurrentStore, addStore, _hasHydrated } = useStoreStore()
  const { user, setUser } = useAuthStore()

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
          setUser(null)
        }
      }
    }

    initializeUser()
  }, [user, setUser])

  // Load stores from database on mount
  useEffect(() => {
    if (!_hasHydrated) return

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

          if (currentStore) {
            const storeStillExists = formattedStores.some((s: any) => s.id === currentStore.id)
            if (!storeStillExists) {
              setCurrentStore(formattedStores[0])
            }
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

  // Listen for openAddStoreModal event
  useEffect(() => {
    const handleOpenAddStoreModal = () => setAddStoreModalOpen(true)
    window.addEventListener('openAddStoreModal', handleOpenAddStoreModal)
    return () => window.removeEventListener('openAddStoreModal', handleOpenAddStoreModal)
  }, [])

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

  return (
    <div className="min-h-screen bg-[#0F0F0F]">
      {/* Sidebar */}
      <Sidebar />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main
        className={cn(
          "min-h-screen pt-16 transition-all duration-300",
          "ml-0",
          sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[260px]"
        )}
      >
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
