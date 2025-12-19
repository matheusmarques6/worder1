'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { useAuthStore } from '@/stores'

// =====================================================
// TYPES
// =====================================================

export interface AgentPermissions {
  // Identificação
  agentId: string | null
  
  // Nível de acesso geral
  accessLevel: 'agent' | 'supervisor' | 'admin'
  
  // Conversas/WhatsApp
  canViewAllConversations: boolean
  canTransferConversations: boolean
  canUseAiSuggestions: boolean
  canSendMedia: boolean
  canUseQuickReplies: boolean
  
  // WhatsApp - Números permitidos
  whatsappAccessAll: boolean
  whatsappNumberIds: string[]
  
  // Contatos
  canViewContactInfo: boolean
  canEditContactInfo: boolean
  canAddNotes: boolean
  canViewOrderHistory: boolean
  
  // CRM
  canAccessCrm: boolean
  canAccessPipelines: boolean
  canCreateDeals: boolean
  canManageTags: boolean
  
  // Pipelines específicos
  pipelineAccessAll: boolean
  pipelineIds: string[]
  
  // Analytics
  canViewAnalytics: boolean
  canViewReports: boolean
  
  // Limites
  maxConcurrentChats: number
  
  // Horários permitidos
  allowedHoursStart: string | null
  allowedHoursEnd: string | null
  allowedDays: number[] | null
}

export interface AgentInfo {
  id: string
  name: string
  email: string
  role: 'agent' | 'supervisor' | 'admin'
  status: string
  organization_id: string
}

export interface UseAgentPermissionsReturn {
  // Estado
  isAgent: boolean
  isAdmin: boolean
  isLoading: boolean
  permissions: AgentPermissions | null
  agent: AgentInfo | null
  error: string | null
  
  // Helpers para controle de acesso a números/conversas
  canAccessNumber: (numberId: string) => boolean
  canAccessConversation: (conversation: { whatsapp_number_id?: string }) => boolean
  canAccessPipeline: (pipelineId: string) => boolean
  
  // Helpers para permissões específicas
  canSendMessages: boolean
  canTransferChats: boolean
  canEditPipeline: boolean
  canViewReports: boolean
  
  // Helper genérico para verificar qualquer permissão
  canAccess: (permission: keyof AgentPermissions) => boolean
  
  // Helper para verificar acesso a rotas/menu
  canAccessRoute: (route: string) => boolean
  
  // Ações
  refreshPermissions: () => Promise<void>
}

// =====================================================
// MAPEAMENTO DE ROTAS PARA PERMISSÕES
// =====================================================

const routePermissionMap: Record<string, keyof AgentPermissions | 'admin' | 'always'> = {
  // Sempre liberado para agentes
  '/inbox': 'always',
  '/profile': 'always',
  '/change-password': 'always',
  
  // Requer permissões específicas
  '/crm': 'canAccessCrm',
  '/crm/contacts': 'canAccessCrm',
  '/crm/pipelines': 'canAccessPipelines',
  
  // Analytics
  '/analytics': 'canViewAnalytics',
  '/analytics/shopify': 'canViewAnalytics',
  '/analytics/email': 'canViewAnalytics',
  '/analytics/facebook': 'canViewAnalytics',
  '/analytics/google': 'canViewAnalytics',
  '/analytics/tiktok': 'canViewAnalytics',
  
  // Apenas admin
  '/dashboard': 'admin',
  '/whatsapp': 'admin',
  '/automations': 'admin',
  '/integrations': 'admin',
  '/settings': 'admin',
}

// =====================================================
// HOOK
// =====================================================

export function useAgentPermissions(): UseAgentPermissionsReturn {
  const { user } = useAuthStore()
  const [permissions, setPermissions] = useState<AgentPermissions | null>(null)
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [isAgent, setIsAgent] = useState(false)
  const [isAdmin, setIsAdmin] = useState(true) // Default true para não bloquear enquanto carrega
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Buscar permissões da API
  const fetchPermissions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/whatsapp/agents/me')
      
      if (!res.ok) {
        throw new Error('Falha ao buscar permissões')
      }
      
      const data = await res.json()
      
      console.log('[useAgentPermissions] Dados recebidos:', {
        isAgent: data.isAgent,
        isAdmin: data.isAdmin,
        hasPermissions: !!data.permissions,
        permissions: data.permissions
      })
      
      setIsAgent(data.isAgent || false)
      setIsAdmin(data.isAdmin || false)
      setAgent(data.agent || null)
      
      if (data.permissions) {
        setPermissions(data.permissions)
      } else if (data.isAdmin) {
        // Admin não precisa de permissões específicas
        setPermissions(null)
      } else {
        // Agente sem permissões - usar defaults restritivos
        setPermissions({
          agentId: null,
          accessLevel: 'agent',
          canViewAllConversations: false,
          canTransferConversations: true,
          canUseAiSuggestions: true,
          canSendMedia: true,
          canUseQuickReplies: true,
          whatsappAccessAll: false,
          whatsappNumberIds: [],
          canViewContactInfo: true,
          canEditContactInfo: false,
          canAddNotes: true,
          canViewOrderHistory: true,
          canAccessCrm: false,
          canAccessPipelines: false,
          canCreateDeals: false,
          canManageTags: false,
          pipelineAccessAll: false,
          pipelineIds: [],
          canViewAnalytics: false,
          canViewReports: false,
          maxConcurrentChats: 10,
          allowedHoursStart: null,
          allowedHoursEnd: null,
          allowedDays: null,
        })
      }
    } catch (err: any) {
      console.error('[useAgentPermissions] Erro:', err)
      setError(err.message)
      // Em caso de erro, assumir que é admin para não bloquear
      setIsAdmin(true)
      setIsAgent(false)
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  // Carregar permissões ao montar
  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])
  
  // Re-buscar quando user mudar
  useEffect(() => {
    if (user?.id) {
      fetchPermissions()
    }
  }, [user?.id, fetchPermissions])
  
  // Helper: verificar acesso a número WhatsApp
  const canAccessNumber = useCallback((numberId: string): boolean => {
    if (isAdmin) return true
    if (!isAgent) return true
    if (permissions?.whatsappAccessAll) return true
    return permissions?.whatsappNumberIds?.includes(numberId) ?? false
  }, [isAdmin, isAgent, permissions])
  
  // Helper: verificar acesso a conversa
  const canAccessConversation = useCallback((conversation: { whatsapp_number_id?: string }): boolean => {
    if (!conversation.whatsapp_number_id) return false
    return canAccessNumber(conversation.whatsapp_number_id)
  }, [canAccessNumber])
  
  // Helper: verificar acesso a pipeline
  const canAccessPipeline = useCallback((pipelineId: string): boolean => {
    if (isAdmin) return true
    if (!isAgent) return true
    if (!permissions?.canAccessPipelines) return false
    if (permissions?.pipelineAccessAll) return true
    return permissions?.pipelineIds?.includes(pipelineId) ?? false
  }, [isAdmin, isAgent, permissions])
  
  // Helper: verificar qualquer permissão
  const canAccess = useCallback((permission: keyof AgentPermissions): boolean => {
    if (isAdmin) return true
    if (!isAgent) return true
    if (!permissions) return false
    
    const value = permissions[permission]
    if (typeof value === 'boolean') return value
    if (Array.isArray(value)) return value.length > 0
    return !!value
  }, [isAdmin, isAgent, permissions])
  
  // Helper: verificar acesso a rota
  const canAccessRoute = useCallback((route: string): boolean => {
    if (isAdmin) return true
    if (!isAgent) return true
    
    // Encontrar a permissão necessária para a rota
    let requiredPermission: keyof AgentPermissions | 'admin' | 'always' | null = null
    
    // Verificar correspondência exata primeiro
    if (routePermissionMap[route]) {
      requiredPermission = routePermissionMap[route]
    } else {
      // Verificar se a rota começa com alguma das rotas mapeadas
      for (const [mappedRoute, permission] of Object.entries(routePermissionMap)) {
        if (route.startsWith(mappedRoute)) {
          requiredPermission = permission
          break
        }
      }
    }
    
    // Se não encontrou mapeamento, bloquear por padrão
    if (!requiredPermission) return false
    
    // Sempre permitido
    if (requiredPermission === 'always') return true
    
    // Se requer admin, não tem acesso
    if (requiredPermission === 'admin') return false
    
    // Verificar a permissão
    return canAccess(requiredPermission)
  }, [isAdmin, isAgent, canAccess])
  
  return {
    isAgent,
    isAdmin,
    isLoading,
    permissions,
    agent,
    error,
    canAccessNumber,
    canAccessConversation,
    canAccessPipeline,
    canSendMessages: isAdmin || (permissions?.canSendMedia ?? true),
    canTransferChats: isAdmin || (permissions?.canTransferConversations ?? true),
    canEditPipeline: isAdmin || (permissions?.canAccessPipelines ?? false),
    canViewReports: isAdmin || (permissions?.canViewReports ?? false),
    canAccess,
    canAccessRoute,
    refreshPermissions: fetchPermissions,
  }
}

// =====================================================
// CONTEXT (para compartilhar entre componentes)
// =====================================================

const AgentPermissionsContext = createContext<UseAgentPermissionsReturn | null>(null)

export function AgentPermissionsProvider({ children }: { children: ReactNode }) {
  const permissions = useAgentPermissions()
  
  return (
    <AgentPermissionsContext.Provider value={permissions}>
      {children}
    </AgentPermissionsContext.Provider>
  )
}

export function useAgentPermissionsContext(): UseAgentPermissionsReturn {
  const context = useContext(AgentPermissionsContext)
  if (!context) {
    throw new Error('useAgentPermissionsContext must be used within AgentPermissionsProvider')
  }
  return context
}
