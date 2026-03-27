// Stores - Barrel Export
// Each store is in its own file for better code splitting

export { useStoreStore } from './storeStore'
export type { ShopifyStore } from './storeStore'

export { useAuthStore } from './authStore'

export { useUIStore } from './uiStore'

export { useCRMStore } from './crmStore'

export { useWhatsAppStore } from './whatsappStore'

export { useAutomationStore } from './automationStore'

export { useInboxStore, useSelectedConversation, useFilteredConversations, useConversationMessages } from './inboxStore'
export type { Conversation, Message, WhatsAppNumber } from './inboxStore'

export {
  useFlowStore,
  useSelectedNode,
  useNodeById,
  useTriggerNodes,
  useActionNodes,
  useIsValidFlow,
  useCanUndo,
  useCanRedo
} from './flowStore'
export type { FlowNode, FlowEdge, FlowNodeData, NodeCategory, NodeStatus, TestExecution, ExecutionStep } from './flowStore'
