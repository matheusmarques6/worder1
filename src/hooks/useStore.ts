/**
 * useStore - Hook para gerenciar lojas Shopify
 * 
 * Wrapper simplificado para useStoreStore
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useStoreStore, type ShopifyStore } from '@/stores';

export interface UseStoreReturn {
  // Estado
  stores: ShopifyStore[];
  currentStore: ShopifyStore | null;
  loading: boolean;
  
  // Ações
  selectStore: (storeId: string) => void;
  refreshStores: () => Promise<void>;
  
  // Helpers
  hasStores: boolean;
  storeId: string | null;
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

  // Carregar lojas do servidor
  const refreshStores = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/shopify/stores');
      const data = await response.json();
      
      if (data.stores) {
        setStores(data.stores);
        
        // Se não tem loja selecionada e tem lojas, selecionar a primeira
        if (!currentStore && data.stores.length > 0) {
          setCurrentStore(data.stores[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setLoading(false);
    }
  }, [setStores, setCurrentStore, setLoading, currentStore]);

  // Selecionar uma loja
  const selectStore = useCallback((storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    if (store) {
      setCurrentStore(store);
    }
  }, [stores, setCurrentStore]);

  // Carregar lojas ao montar se não tiver
  useEffect(() => {
    if (stores.length === 0 && !isLoading) {
      refreshStores();
    }
  }, [stores.length, isLoading, refreshStores]);

  return {
    stores,
    currentStore,
    loading: isLoading,
    selectStore,
    refreshStores,
    hasStores: stores.length > 0,
    storeId: currentStore?.id || null,
  };
}

export default useStore;
