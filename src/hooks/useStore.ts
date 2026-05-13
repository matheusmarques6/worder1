// ===============================
// CORREÇÃO: useStore hook
// ===============================
// Este hook agora salva organization_id ao carregar as lojas
//
// SUBSTITUIR: src/hooks/useStore.ts

'use client';

import { useCallback, useEffect } from 'react';
import { useStoreStore, type ShopifyStore } from '@/stores';

export interface UseStoreReturn {
  stores: ShopifyStore[];
  currentStore: ShopifyStore | null;
  loading: boolean;
  selectStore: (storeId: string) => void;
  refreshStores: () => Promise<void>;
  hasStores: boolean;
  storeId: string | null;
  // ✅ NOVO: organization_id da loja atual
  currentOrganizationId: string | null;
}

export function useStore(): UseStoreReturn {
  const { 
    stores, 
    currentStore, 
    isLoading,
    setStores,
    setCurrentStore,
    setLoading
  } = useStoreStore();

  // ✅ CORRIGIDO: Buscar lojas com organization_id
  const refreshStores = useCallback(async () => {
    try {
      setLoading(true);
      
      // Usa a API corrigida que retorna organization_id
      const response = await fetch('/api/shopify/connect');
      const data = await response.json();
      
      if (data.stores && data.stores.length > 0) {
        // ✅ Salva COM organization_id
        const formattedStores = data.stores.map((s: any) => ({
          id: s.id,
          name: s.name,
          domain: s.domain,
          email: s.email,
          currency: s.currency,
          isActive: s.isActive ?? true,
          totalOrders: s.totalOrders,
          totalRevenue: s.totalRevenue,
          lastSyncAt: s.lastSyncAt,
          // ✅ CRÍTICO: Salvar organization_id
          organization_id: s.organization_id,
          organization_name: s.organization_name,
          // Surface storefront install state so the forms dashboard can
          // show a "activate Theme App Embed" prompt when the merchant
          // hasn't toggled us on yet. Field name differs by route, so
          // accept both shapes.
          embedInstalled: s.embedInstalled ?? s.embed_installed ?? false,
          embedInstalledAt: s.embedInstalledAt ?? s.embed_installed_at ?? null,
          webhooksRegistered: s.webhooksRegistered ?? s.webhooks_registered ?? false,
          connectionType: s.connectionType ?? s.connection_type ?? 'oauth',
        }));
        
        setStores(formattedStores);
        
        // Se não tem loja selecionada, selecionar a primeira
        if (!currentStore && formattedStores.length > 0) {
          setCurrentStore(formattedStores[0]);
        }
        
        // Se a loja atual não está mais na lista, selecionar a primeira
        if (currentStore) {
          const storeStillExists = formattedStores.some((s: any) => s.id === currentStore.id);
          if (!storeStillExists && formattedStores.length > 0) {
            setCurrentStore(formattedStores[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setLoading(false);
    }
  }, [setStores, setCurrentStore, setLoading, currentStore]);

  const selectStore = useCallback((storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    if (store) {
      console.log(`🏪 [useStore] Selecionando loja: ${store.name} (org: ${(store as any).organization_id})`);
      setCurrentStore(store);
    }
  }, [stores, setCurrentStore]);

  // Refresh on mount even when zustand already has cached stores —
  // the cached row can be stale (e.g. embedInstalled=false from before
  // the merchant ran install-extras). 30s TTL avoids hammering the
  // endpoint when the user clicks around quickly.
  useEffect(() => {
    if (isLoading) return;
    const STALE_MS = 30_000;
    let lastFetch = 0;
    try {
      lastFetch = Number(sessionStorage.getItem('worder-stores-last-fetch') || '0');
    } catch { /* ignore */ }
    const isStale = Date.now() - lastFetch > STALE_MS;
    if (stores.length === 0 || isStale) {
      refreshStores().then(() => {
        try { sessionStorage.setItem('worder-stores-last-fetch', String(Date.now())); } catch { /* ignore */ }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    stores,
    currentStore,
    loading: isLoading,
    selectStore,
    refreshStores,
    hasStores: stores.length > 0,
    storeId: currentStore?.id || null,
    // ✅ NOVO: Retornar organization_id da loja atual
    currentOrganizationId: (currentStore as any)?.organization_id || null,
  };
}

export default useStore;
