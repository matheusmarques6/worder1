'use client'

import { useMemo } from 'react'
import { useAuthStore, useStoreStore } from '@/stores'

// Interface estendida para lojas com organization_id
interface StoreWithOrg {
  id: string
  name: string
  domain: string
  organization_id?: string
  organization_name?: string
  [key: string]: any
}

interface UseCurrentOrganizationReturn {
  /** O organization_id ativo (da loja selecionada ou do user) */
  organizationId: string | null
  /** A loja atualmente selecionada */
  currentStore: StoreWithOrg | null
  /** Se está carregando */
  isLoading: boolean
  /** Se tem uma organização válida */
  hasOrganization: boolean
  /** Nome da organização atual */
  organizationName: string | null
}

/**
 * Hook que retorna o organization_id correto baseado na loja selecionada
 * 
 * PRIORIDADE:
 * 1. Se tem loja selecionada (currentStore) → usa organization_id da loja
 * 2. Se não tem loja → usa organization_id do user profile
 * 
 * @example
 * // ❌ ANTES (ERRADO - não muda quando troca de loja):
 * const { user } = useAuthStore()
 * const organizationId = user?.organization_id
 * 
 * // ✅ DEPOIS (CORRETO - muda quando troca de loja):
 * const { organizationId } = useCurrentOrganization()
 */
export function useCurrentOrganization(): UseCurrentOrganizationReturn {
  const { user, isLoading: authLoading } = useAuthStore()
  const storeState = useStoreStore()
  const currentStore = storeState.currentStore as StoreWithOrg | null
  const storeLoading = storeState.isLoading

  const organizationId = useMemo(() => {
    // PRIORIDADE 1: Organization da loja selecionada
    if (currentStore?.organization_id) {
      return currentStore.organization_id
    }
    
    // PRIORIDADE 2: Organization do profile do usuário (fallback)
    if (user?.organization_id) {
      return user.organization_id
    }
    
    return null
  }, [currentStore?.organization_id, user?.organization_id])

  const organizationName = useMemo(() => {
    if (currentStore?.organization_name) {
      return currentStore.organization_name
    }
    return null
  }, [currentStore?.organization_name])

  return {
    organizationId,
    currentStore,
    isLoading: authLoading || storeLoading,
    hasOrganization: !!organizationId,
    organizationName,
  }
}

/**
 * Hook simplificado que retorna apenas o organizationId
 */
export function useOrganizationId(): string | null {
  const { organizationId } = useCurrentOrganization()
  return organizationId
}

export default useCurrentOrganization
