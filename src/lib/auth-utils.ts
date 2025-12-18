// =====================================================
// AUTH UTILITIES
// Funções auxiliares para verificação de autenticação e permissões
// =====================================================

import { User } from '@supabase/supabase-js'

// Verificar se usuário é um agente
export function isAgent(user: User | null): boolean {
  if (!user) return false
  return user.user_metadata?.is_agent === true
}

// Verificar se usuário é owner ou admin
export function isOwnerOrAdmin(user: User | null): boolean {
  if (!user) return false
  const role = user.user_metadata?.role
  return role === 'owner' || role === 'admin' || !user.user_metadata?.is_agent
}

// Obter agent_id do usuário (se for agente)
export function getAgentId(user: User | null): string | null {
  if (!user) return null
  return user.user_metadata?.agent_id || null
}

// Obter organization_id do usuário
export function getOrganizationId(user: User | null): string | null {
  if (!user) return null
  return user.user_metadata?.organization_id || null
}

// Interface de permissões do agente
export interface AgentPermissions {
  agent_id: string
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

// Permissões padrão para agentes
export const DEFAULT_AGENT_PERMISSIONS: Omit<AgentPermissions, 'agent_id'> = {
  access_level: 'agent',
  whatsapp_access_all: false,
  whatsapp_number_ids: [],
  pipeline_access_all: false,
  pipeline_ids: [],
  can_send_messages: true,
  can_transfer_chats: true,
  can_edit_pipeline: false,
  can_view_reports: false,
}

// Verificar se agente pode acessar um número WhatsApp específico
export function canAccessWhatsAppNumber(
  permissions: AgentPermissions | null,
  numberId: string
): boolean {
  if (!permissions) return false
  if (permissions.whatsapp_access_all) return true
  return permissions.whatsapp_number_ids.includes(numberId)
}

// Verificar se agente pode acessar uma conversa
export function canAccessConversation(
  permissions: AgentPermissions | null,
  conversation: { whatsapp_number_id?: string }
): boolean {
  if (!permissions) return false
  if (!conversation.whatsapp_number_id) return false
  return canAccessWhatsAppNumber(permissions, conversation.whatsapp_number_id)
}
