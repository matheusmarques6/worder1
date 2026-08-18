'use client';

// Hooks - Barrel Export
// Each hook is in its own file for better code splitting

// Core hooks
export { useFetch } from './useFetch';
export { useAuth } from './useAuth';
export { useAnalytics } from './useAnalytics';

// Hydration hooks
export { useHydratedStoreId, useHydratedUI } from './useHydratedStoreId';

// CRM hooks
export { usePipelines } from './usePipelines';
export { useContacts } from './useContacts';
export { useDeals } from './useDeals';
export { useCRMRealtime, useDealsRealtime, useContactsRealtime } from './useCRMRealtime';

// WhatsApp hooks
export { useWhatsAppConnection } from './useWhatsAppConnection';
export {
  useWhatsAppConversations,
  useWhatsAppMessages,
  useWhatsAppCampaigns,
  useWhatsAppFlows,
  useWhatsAppPhonebooks,
  useWhatsAppTags,
  useWhatsAppAgents,
  useWhatsAppTemplates,
} from './useWhatsApp';

// Agent hooks
export { useAgents, useAIModels, useApiKeys } from './useAgents';
export type { Agent, AIConfig, AgentPermissions, CreateAgentData, UpdateAgentData } from './useAgents';
export { useAgentPermissions, AgentPermissionsProvider, useAgentPermissionsContext } from './useAgentPermissions';
export type { UseAgentPermissionsReturn, AgentPermissions as AgentPermissionsType } from './useAgentPermissions';

// Automation hooks
export { useAutomations } from './useAutomations';
