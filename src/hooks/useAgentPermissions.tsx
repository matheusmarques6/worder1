'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores'

// =====================================================
// TYPES
// =====================================================

export interface AgentPermissions {
  agent_id: string | null
  access_level: 'agent' | 'admin'
  whatsapp_access_all: boolean
  whatsapp_number_ids: string[]
  pipeline_access_all: boolean
  pipeline_ids: string[]
  can_send_messages: boolean
  can_transfer_chats: boolean
  can_edit_pipeline: boolean
  can_view_reports: boolean
}

export interface UseAgentPermissionsReturn {
  // Estado
  isAgent: boolean
  isLoading: boolean
  permissions: AgentPermissions | null
  error: string | null
  
  // Helpers
  canAccessNumber: (numberId: string) => boolean
  canAccessConversation: (conversation: { whatsapp_number_id?: string }) => boolean
  canSendMessages: boolean
  canTransferChats: boolean
  canEditPipeline: boolean
  canViewReports: boolean
  
  // Ações
  refreshPermissions: () => Promise<void>
}

// =====================================================
// HOOK
// =====================================================

export function useAgentPermissions(): UseAgentPermissionsReturn {
  const { user } = useAuthStore()
  const [permissions, setPermissions] = useState<AgentPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Verificar se é agente
  const isAgent = user?.user_metadata?.is_agent === true
  const agentId = user?.user_metadata?.agent_id || null
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  
  // Buscar permissões
  const fetchPermissions = useCallback(async () => {
    if (!isAgent || !agentId || !organizationId) {
      setIsLoading(false)
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch(
        `/api/whatsapp/agents/permissions?agent_id=${agentId}&organization_id=${organizationId}`
      )
      
      if (!res.ok) {
        throw new Error('Failed to fetch permissions')
      }
      
      const data = await res.json()
      
      if (data.permissions) {
        setPermissions({
          agent_id: agentId,
          access_level: data.permissions.access_level || 'agent',
          whatsapp_access_all: data.permissions.whatsapp_access_all || false,
          whatsapp_number_ids: data.permissions.whatsapp_number_ids || [],
          pipeline_access_all: data.permissions.pipeline_access_all || false,
          pipeline_ids: data.permissions.pipeline_ids || [],
          can_send_messages: data.permissions.can_send_messages !== false,
          can_transfer_chats: data.permissions.can_transfer_chats !== false,
          can_edit_pipeline: data.permissions.can_edit_pipeline || false,
          can_view_reports: data.permissions.can_view_reports || false,
        })
      } else {
        // Permissões padrão se não existirem
        setPermissions({
          agent_id: agentId,
          access_level: 'agent',
          whatsapp_access_all: false,
          whatsapp_number_ids: [],
          pipeline_access_all: false,
          pipeline_ids: [],
          can_send_messages: true,
          can_transfer_chats: true,
          can_edit_pipeline: false,
          can_view_reports: false,
        })
      }
    } catch (err: any) {
      console.error('Error fetching agent permissions:', err)
      setError(err.message)
      
      // Definir permissões mínimas em caso de erro
      setPermissions({
        agent_id: agentId,
        access_level: 'agent',
        whatsapp_access_all: false,
        whatsapp_number_ids: [],
        pipeline_access_all: false,
        pipeline_ids: [],
        can_send_messages: true,
        can_transfer_chats: true,
        can_edit_pipeline: false,
        can_view_reports: false,
      })
    } finally {
      setIsLoading(false)
    }
  }, [isAgent, agentId, organizationId])
  
  // Carregar permissões ao montar ou quando user mudar
  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])
  
  // Helper: verificar acesso a número WhatsApp
  const canAccessNumber = useCallback((numberId: string): boolean => {
    // Se não é agente, tem acesso total
    if (!isAgent) return true
    
    // Se tem acesso a todos
    if (permissions?.whatsapp_access_all) return true
    
    // Verificar se o número está na lista permitida
    return permissions?.whatsapp_number_ids?.includes(numberId) ?? false
  }, [isAgent, permissions])
  
  // Helper: verificar acesso a conversa
  const canAccessConversation = useCallback((conversation: { whatsapp_number_id?: string }): boolean => {
    if (!conversation.whatsapp_number_id) return false
    return canAccessNumber(conversation.whatsapp_number_id)
  }, [canAccessNumber])
  
  return {
    isAgent,
    isLoading,
    permissions,
    error,
    canAccessNumber,
    canAccessConversation,
    canSendMessages: !isAgent || (permissions?.can_send_messages ?? true),
    canTransferChats: !isAgent || (permissions?.can_transfer_chats ?? true),
    canEditPipeline: !isAgent || (permissions?.can_edit_pipeline ?? false),
    canViewReports: !isAgent || (permissions?.can_view_reports ?? false),
    refreshPermissions: fetchPermissions,
  }
}

// =====================================================
// CONTEXT (opcional, para compartilhar entre componentes)
// =====================================================

import { createContext, useContext, ReactNode } from 'react'

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
