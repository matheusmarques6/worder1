'use client';

import { useStoreStore } from '@/stores';
import { useCallback } from 'react';

/**
 * Hook para fazer requisições às APIs com filtro automático por loja
 * 
 * Uso:
 * const { fetchWithStore, storeId } = useStoreApi();
 * const response = await fetchWithStore('/api/contacts');
 */
export function useStoreApi() {
  const { currentStore } = useStoreStore();
  const storeId = currentStore?.id;

  const fetchWithStore = useCallback(async (url: string, options?: RequestInit) => {
    // Adicionar storeId como query param
    const separator = url.includes('?') ? '&' : '?';
    const urlWithStore = storeId 
      ? `${url}${separator}storeId=${storeId}`
      : url;
    
    return fetch(urlWithStore, options);
  }, [storeId]);

  const postWithStore = useCallback(async (url: string, data: any, options?: RequestInit) => {
    // Adicionar store_id no body
    const bodyWithStore = storeId
      ? { ...data, store_id: storeId }
      : data;
    
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify(bodyWithStore),
      ...options,
    });
  }, [storeId]);

  return { 
    fetchWithStore, 
    postWithStore,
    storeId,
    hasStore: !!storeId,
  };
}
