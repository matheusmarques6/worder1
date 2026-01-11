'use client';

import { useStoreStore } from '@/stores';

/**
 * ✅ Hook centralizado para obter storeId após hydration
 * Evita race condition e duplicação de código em múltiplas páginas
 * 
 * @returns {Object}
 * - storeId: string | undefined - ID da loja atual (só definido após hydration)
 * - hasHydrated: boolean - Se o Zustand terminou de carregar do localStorage
 * - ready: boolean - Se está pronto para fazer fetch (hydrated E tem storeId)
 * - currentStore: objeto completo da loja (se precisar de mais dados)
 */
export function useHydratedStoreId() {
  // Usar seletores específicos para evitar re-renders desnecessários
  const storeId = useStoreStore((s) => s.currentStore?.id);
  const hasHydrated = useStoreStore((s) => s._hasHydrated);
  const currentStore = useStoreStore((s) => s.currentStore);

  return {
    storeId,
    hasHydrated,
    ready: hasHydrated && !!storeId,
    currentStore,
  };
}

/**
 * ✅ Hook para UI Store hydration
 * Útil para componentes que dependem do estado do sidebar
 */
export function useHydratedUI() {
  // Importar dinamicamente para evitar dependência circular
  const { useUIStore } = require('@/stores');
  
  const sidebarCollapsed = useUIStore((s: any) => s.sidebarCollapsed);
  const hasHydrated = useUIStore((s: any) => s._hasHydrated);
  const toggleSidebar = useUIStore((s: any) => s.toggleSidebar);

  return {
    sidebarCollapsed,
    hasHydrated,
    ready: hasHydrated,
    toggleSidebar,
  };
}

export default useHydratedStoreId;
