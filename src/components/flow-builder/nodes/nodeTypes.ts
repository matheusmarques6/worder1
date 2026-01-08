'use client';

/**
 * NODE TYPES - React Flow v12 Compatible
 * Maps node type strings to React components
 */

import { TriggerNode } from './TriggerNode';
import { ActionNode } from './ActionNode';
import { ConditionNode } from './ConditionNode';
import { ControlNode } from './ControlNode';

// ============================================
// NODE TYPE DEFINITIONS
// ============================================

export interface NodeTypeDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: 'trigger' | 'action' | 'condition' | 'control';
  color: string;
  defaultConfig?: Record<string, any>;
}

// ============================================
// TRIGGER DEFINITIONS
// ============================================

export const triggerTypes: NodeTypeDefinition[] = [
  {
    type: 'trigger_order',
    label: 'Pedido Criado',
    description: 'Dispara quando um novo pedido é criado',
    icon: 'ShoppingCart',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_order_paid',
    label: 'Pedido Pago',
    description: 'Dispara quando um pedido é pago',
    icon: 'CreditCard',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_abandon',
    label: 'Carrinho Abandonado',
    description: 'Dispara quando cliente abandona carrinho',
    icon: 'ShoppingBag',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_signup',
    label: 'Novo Cadastro',
    description: 'Dispara quando um novo contato é criado',
    icon: 'UserPlus',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_tag',
    label: 'Tag Adicionada',
    description: 'Dispara quando uma tag é adicionada ao contato',
    icon: 'Tag',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_created',
    label: 'Deal Criado',
    description: 'Dispara quando um novo deal é criado',
    icon: 'Briefcase',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_stage',
    label: 'Deal Mudou Estágio',
    description: 'Dispara quando deal muda de estágio',
    icon: 'ArrowRight',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_won',
    label: 'Deal Ganho',
    description: 'Dispara quando deal é marcado como ganho',
    icon: 'Trophy',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_lost',
    label: 'Deal Perdido',
    description: 'Dispara quando deal é marcado como perdido',
    icon: 'XCircle',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_date',
    label: 'Data Especial',
    description: 'Dispara em data especial do contato',
    icon: 'Calendar',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_segment',
    label: 'Entrou no Segmento',
    description: 'Dispara quando contato entra em um segmento',
    icon: 'Users',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_webhook',
    label: 'Webhook',
    description: 'Dispara quando um webhook é recebido',
    icon: 'Webhook',
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_whatsapp',
    label: 'WhatsApp Recebido',
    description: 'Dispara quando uma mensagem é recebida',
    icon: 'MessageSquare',
    category: 'trigger',
    color: '#10b981',
  },
];

// ============================================
// ACTION DEFINITIONS
// ============================================

export const actionTypes: NodeTypeDefinition[] = [
  {
    type: 'action_whatsapp',
    label: 'Enviar WhatsApp',
    description: 'Envia mensagem via WhatsApp',
    icon: 'MessageSquare',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_email',
    label: 'Enviar Email',
    description: 'Envia email para o contato',
    icon: 'Mail',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_sms',
    label: 'Enviar SMS',
    description: 'Envia SMS para o contato',
    icon: 'Phone',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_tag',
    label: 'Adicionar Tag',
    description: 'Adiciona tag ao contato',
    icon: 'Tag',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_remove_tag',
    label: 'Remover Tag',
    description: 'Remove tag do contato',
    icon: 'UserMinus',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_update',
    label: 'Atualizar Contato',
    description: 'Atualiza dados do contato',
    icon: 'Edit',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_create_deal',
    label: 'Criar Deal',
    description: 'Cria um novo deal no CRM',
    icon: 'Briefcase',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_move_deal',
    label: 'Mover Deal',
    description: 'Move deal para outro estágio',
    icon: 'ArrowRight',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_notify',
    label: 'Notificação Interna',
    description: 'Envia notificação para equipe',
    icon: 'Bell',
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_webhook',
    label: 'HTTP Request',
    description: 'Faz requisição HTTP externa',
    icon: 'Globe',
    category: 'action',
    color: '#3b82f6',
  },
];

// ============================================
// CONDITION DEFINITIONS
// ============================================

export const conditionTypes: NodeTypeDefinition[] = [
  {
    type: 'condition_has_tag',
    label: 'Tem Tag?',
    description: 'Verifica se contato tem tag específica',
    icon: 'Tag',
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_field',
    label: 'Campo Igual?',
    description: 'Compara valor de campo do contato',
    icon: 'GitBranch',
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_deal_value',
    label: 'Valor do Deal?',
    description: 'Verifica valor do deal',
    icon: 'Target',
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_order_value',
    label: 'Valor do Pedido?',
    description: 'Verifica valor do pedido',
    icon: 'ShoppingCart',
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'logic_split',
    label: 'Teste A/B',
    description: 'Divide contatos aleatoriamente',
    icon: 'Percent',
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'logic_filter',
    label: 'Filtro Avançado',
    description: 'Filtra com múltiplas condições',
    icon: 'Filter',
    category: 'condition',
    color: '#f59e0b',
  },
];

// ============================================
// CONTROL DEFINITIONS
// ============================================

export const controlTypes: NodeTypeDefinition[] = [
  {
    type: 'control_delay',
    label: 'Aguardar',
    description: 'Aguarda tempo determinado',
    icon: 'Clock',
    category: 'control',
    color: '#a855f7',
  },
  {
    type: 'control_delay_until',
    label: 'Aguardar Até',
    description: 'Aguarda até data/hora específica',
    icon: 'Calendar',
    category: 'control',
    color: '#a855f7',
  },
];

// ============================================
// ALL NODE DEFINITIONS
// ============================================

export const allNodeTypes: NodeTypeDefinition[] = [
  ...triggerTypes,
  ...actionTypes,
  ...conditionTypes,
  ...controlTypes,
];

// ============================================
// NODE TYPES MAP FOR REACT FLOW
// Using 'any' to bypass strict typing issues with React Flow v12
// ============================================

export const nodeTypes: Record<string, any> = {
  // Triggers
  trigger_order: TriggerNode,
  trigger_order_paid: TriggerNode,
  trigger_abandon: TriggerNode,
  trigger_signup: TriggerNode,
  trigger_tag: TriggerNode,
  trigger_deal_created: TriggerNode,
  trigger_deal_stage: TriggerNode,
  trigger_deal_won: TriggerNode,
  trigger_deal_lost: TriggerNode,
  trigger_date: TriggerNode,
  trigger_segment: TriggerNode,
  trigger_webhook: TriggerNode,
  trigger_whatsapp: TriggerNode,
  
  // Actions
  action_whatsapp: ActionNode,
  action_email: ActionNode,
  action_sms: ActionNode,
  action_tag: ActionNode,
  action_remove_tag: ActionNode,
  action_update: ActionNode,
  action_create_deal: ActionNode,
  action_move_deal: ActionNode,
  action_notify: ActionNode,
  action_webhook: ActionNode,
  
  // Conditions
  condition_has_tag: ConditionNode,
  condition_field: ConditionNode,
  condition_deal_value: ConditionNode,
  condition_order_value: ConditionNode,
  logic_split: ConditionNode,
  logic_filter: ConditionNode,
  
  // Control
  control_delay: ControlNode,
  control_delay_until: ControlNode,
  logic_delay: ControlNode,
  
  // Generic fallbacks
  triggerNode: TriggerNode,
  actionNode: ActionNode,
  conditionNode: ConditionNode,
  controlNode: ControlNode,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getNodeDefinition(nodeType: string): NodeTypeDefinition | undefined {
  return allNodeTypes.find(n => n.type === nodeType);
}

export function getNodesByCategory(category: string): NodeTypeDefinition[] {
  return allNodeTypes.filter(n => n.category === category);
}

export default nodeTypes;
