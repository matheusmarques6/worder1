'use client';

import { useCallback, useEffect } from 'react';
import { useStoreStore } from '@/stores';

// Interface para loja com organization_id
interface StoreWithOrg {
  id: string
  name: string
  domain: string
  email?: string
  currency?: string
  isActive: boolean
  totalOrders?: number
  totalRevenue?: number
  lastSyncAt?: string
  organization_id: string
  organization_name?: string
  connectionStatus?: string
  statusMessage?: string
  healthCheckedAt?: string
  consecutiveFailures?: number
}

export interface UseStoreReturn {
  stores: StoreWithOrg[];
  currentStore: StoreWithOrg | null;
  loading: boolean;
  selectStore: (storeId: string) => void;
  refreshStores: () => Promise<void>;
  hasStores: boolean;
  storeId: string | null;
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

  // Buscar da API que retorna organization_id
  const refreshStores = useCallback(async () => {
    try {
      setLoading(true);
      
      // IMPORTANTE: usar /api/shopify/stores (nova API)
      const response = await fetch('/api/shopify/stores');
      const data = await response.json();
      
      if (data.stores && data.stores.length > 0) {
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
          organization_id: s.organization_id,
          organization_name: s.organization_name,
          connectionStatus: s.connectionStatus,
          statusMessage: s.statusMessage,
          healthCheckedAt: s.healthCheckedAt,
          consecutiveFailures: s.consecutiveFailures,
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

  useEffect(() => {
    if (stores.length === 0 && !isLoading) {
      refreshStores();
    }
  }, [stores.length, isLoading, refreshStores]);

  const typedCurrentStore = currentStore as StoreWithOrg | null;

  return {
    stores: stores as StoreWithOrg[],
    currentStore: typedCurrentStore,
    loading: isLoading,
    selectStore,
    refreshStores,
    hasStores: stores.length > 0,
    storeId: currentStore?.id || null,
    currentOrganizationId: typedCurrentStore?.organization_id || null,
  };
}

export default useStore;
