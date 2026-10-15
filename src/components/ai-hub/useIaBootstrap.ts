'use client'

// A tela cheia da IA (Construtor, Conhecimento) fica fora do layout do
// dashboard, que é quem carrega o usuário e as lojas. Este hook faz o mesmo
// mínimo: usuário pela rota /api/auth e lojas por /api/stores, sem repetir
// quando o estado já veio do dashboard.

import { useEffect } from 'react'
import { useAuthStore, useStoreStore } from '@/stores'

export function useIaBootstrap(): { ready: boolean; organizationId: string | null } {
  const { user, setUser, setLoading } = useAuthStore()
  const { stores, setStores, setCurrentStore, _hasHydrated } = useStoreStore()

  useEffect(() => {
    if (user?.organization_id) { setLoading(false); return }
    let cancelled = false
    fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-or-create-org' }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled || !result?.organization) return
        setUser({
          id: result.user?.id || 'default-user',
          email: result.user?.email || '',
          name: result.user?.name || `${result.user?.first_name || ''} ${result.user?.last_name || ''}`.trim() || 'Usuário',
          avatar_url: result.user?.avatar_url,
          organization_id: result.user?.organization_id || result.organization.id,
          role: result.user?.role || 'admin',
          user_metadata: result.user?.user_metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, setUser, setLoading])

  useEffect(() => {
    if (!_hasHydrated || stores.length > 0) return
    fetch('/api/stores')
      .then((r) => r.json())
      .then((result) => {
        if (!result?.success || !result.stores?.length) return
        const formatted = result.stores.map((s: any) => ({
          id: s.id, name: s.shop_name || s.shop_domain, domain: s.shop_domain, email: s.shop_email,
          currency: s.currency, isActive: s.is_active !== false, totalOrders: s.total_orders || 0,
          totalRevenue: s.total_revenue || 0, lastSyncAt: s.last_sync_at,
        }))
        setStores(formatted)
        const selected = useStoreStore.getState().currentStore
        setCurrentStore((selected && formatted.find((s: any) => s.id === selected.id)) || formatted[0])
      })
      .catch(() => {})
  }, [_hasHydrated, stores.length, setStores, setCurrentStore])

  return { ready: Boolean(user?.organization_id), organizationId: (user?.organization_id as string) ?? null }
}
