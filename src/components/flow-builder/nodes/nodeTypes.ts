'use client';

/**
 * NODE TYPES - React Flow v12 Compatible
 * Maps node type strings to React components
 */

import {
  ShoppingCart,
  CreditCard,
  ShoppingBag,
  UserPlus,
  Tag,
  Briefcase,
  ArrowRight,
  Trophy,
  XCircle,
  Calendar,
  Users,
  Webhook,
  MessageSquare,
  Clock,
  Mail,
  Phone,
  Bell,
  Edit,
  GitBranch,
  Percent,
  Filter,
  Zap,
  Send,
  UserMinus,
  Target,
  Globe,
  Bot,
  Shuffle,
  Timer,
  UserCog,
  Package,
  LucideIcon,
} from 'lucide-react';

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
  icon: LucideIcon;
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
    icon: ShoppingCart,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_order_paid',
    label: 'Pedido Pago',
    description: 'Dispara quando um pedido é pago',
    icon: CreditCard,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_abandon',
    label: 'Carrinho Abandonado',
    description: 'Dispara quando cliente abandona carrinho',
    icon: ShoppingBag,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_signup',
    label: 'Novo Cadastro',
    description: 'Dispara quando um novo contato é criado',
    icon: UserPlus,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_tag',
    label: 'Tag Adicionada',
    description: 'Dispara quando uma tag é adicionada ao contato',
    icon: Tag,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_created',
    label: 'Deal Criado',
    description: 'Dispara quando um novo deal é criado',
    icon: Briefcase,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_stage',
    label: 'Deal Mudou Estágio',
    description: 'Dispara quando deal muda de estágio',
    icon: ArrowRight,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_won',
    label: 'Deal Ganho',
    description: 'Dispara quando deal é marcado como ganho',
    icon: Trophy,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_deal_lost',
    label: 'Deal Perdido',
    description: 'Dispara quando deal é marcado como perdido',
    icon: XCircle,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_date',
    label: 'Data Especial',
    description: 'Dispara em data especial do contato',
    icon: Calendar,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_segment',
    label: 'Entrou no Segmento',
    description: 'Dispara quando contato entra em um segmento',
    icon: Users,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_webhook',
    label: 'Webhook',
    description: 'Dispara quando um webhook é recebido',
    icon: Webhook,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_whatsapp',
    label: 'WhatsApp Recebido',
    description: 'Dispara quando uma mensagem é recebida',
    icon: MessageSquare,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_list_added',
    label: 'Adicionado à Lista',
    description: 'Dispara quando contato é adicionado a uma lista',
    icon: Users,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_order_fulfilled',
    label: 'Pedido Entregue',
    description: 'Dispara quando pedido é marcado como entregue',
    icon: ShoppingBag,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_order_pending',
    label: 'Pedido Pendente',
    description: 'Dispara quando pedido fica pendente (boleto/PIX)',
    icon: CreditCard,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_inactivity',
    label: 'Inatividade',
    description: 'Dispara após período de inatividade do contato',
    icon: Clock,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_viewed_product',
    label: 'Visualizou Produto',
    description: 'Dispara quando contato visualiza um produto',
    icon: Target,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_whatsapp_keyword',
    label: 'Keyword Detectada',
    description: 'Dispara quando keyword especifica e detectada',
    icon: MessageSquare,
    category: 'trigger',
    color: '#10b981',
    defaultConfig: { keywords: [] },
  },
  {
    type: 'trigger_whatsapp_first_message',
    label: 'Primeira Mensagem',
    description: 'Dispara na primeira mensagem de um contato novo',
    icon: UserPlus,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_rfm_segment_change',
    label: 'Mudou Segmento RFM',
    description: 'Dispara quando contato muda de segmento RFM',
    icon: Users,
    category: 'trigger',
    color: '#10b981',
    defaultConfig: { fromSegment: '', toSegment: '' },
  },
  {
    type: 'trigger_back_in_stock',
    label: 'Produto Voltou ao Estoque',
    description: 'Dispara quando produto volta ao estoque',
    icon: Package,
    category: 'trigger',
    color: '#10b981',
  },
  {
    type: 'trigger_ctwa_ad',
    label: 'Click-to-WhatsApp Ad',
    description: 'Dispara quando conversa vem de anuncio (janela 72h)',
    icon: Target,
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
    icon: MessageSquare,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_email',
    label: 'Enviar Email',
    description: 'Envia email para o contato',
    icon: Mail,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_sms',
    label: 'Enviar SMS',
    description: 'Envia SMS para o contato',
    icon: Phone,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_tag',
    label: 'Adicionar Tag',
    description: 'Adiciona tag ao contato',
    icon: Tag,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_remove_tag',
    label: 'Remover Tag',
    description: 'Remove tag do contato',
    icon: UserMinus,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_update',
    label: 'Atualizar Contato',
    description: 'Atualiza dados do contato',
    icon: Edit,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_create_deal',
    label: 'Criar Deal',
    description: 'Cria um novo deal no CRM',
    icon: Briefcase,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_move_deal',
    label: 'Mover Deal',
    description: 'Move deal para outro estágio',
    icon: ArrowRight,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_notify',
    label: 'Notificação Interna',
    description: 'Envia notificação para equipe',
    icon: Bell,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_webhook',
    label: 'HTTP Request',
    description: 'Faz requisição HTTP externa',
    icon: Globe,
    category: 'action',
    color: '#3b82f6',
  },
  {
    type: 'action_whatsapp_wait_reply',
    label: 'Aguardar Resposta',
    description: 'Aguarda resposta do contato no WhatsApp',
    icon: Clock,
    category: 'action',
    color: '#3b82f6',
    defaultConfig: { timeoutMinutes: 60, timeoutBranch: 'timeout' },
  },
  {
    type: 'action_whatsapp_transfer',
    label: 'Transferir para Agente',
    description: 'Transfere conversa para agente ou fila',
    icon: UserPlus,
    category: 'action',
    color: '#8b5cf6',
    defaultConfig: { targetType: 'queue', targetId: '' },
  },
  {
    type: 'action_whatsapp_ai',
    label: 'IA Responder',
    description: 'Agente IA responde a conversa',
    icon: Bot,
    category: 'action',
    color: '#06b6d4',
    defaultConfig: { aiAgentId: '', maxInteractions: 5 },
  },
  {
    type: 'action_shopify_coupon',
    label: 'Gerar Cupom Shopify',
    description: 'Gera cupom de desconto na Shopify',
    icon: Tag,
    category: 'action',
    color: '#f97316',
    defaultConfig: { discountType: 'percentage', value: 10, prefix: 'WORDER', expiryDays: 7 },
  },
  {
    type: 'action_whatsapp_catalog',
    label: 'Enviar Catalogo',
    description: 'Envia catalogo de produtos no WhatsApp',
    icon: ShoppingBag,
    category: 'action',
    color: '#059669',
  },
  {
    type: 'action_whatsapp_payment',
    label: 'Enviar Link Pagamento',
    description: 'Envia link de pagamento no WhatsApp',
    icon: CreditCard,
    category: 'action',
    color: '#2563eb',
    defaultConfig: { amount: 0, description: '' },
  },
  {
    type: 'action_update_contact',
    label: 'Atualizar Contato',
    description: 'Adiciona tag, muda pipeline ou atualiza campo',
    icon: UserCog,
    category: 'action',
    color: '#78716c',
  },
  {
    type: 'action_back_in_stock_notify',
    label: 'Notificar Volta Estoque',
    description: 'Notifica contatos sobre produto em estoque',
    icon: Package,
    category: 'action',
    color: '#84cc16',
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
    icon: Tag,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_field',
    label: 'Campo Igual?',
    description: 'Compara valor de campo do contato',
    icon: GitBranch,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_deal_value',
    label: 'Valor do Deal?',
    description: 'Verifica valor do deal',
    icon: Target,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_order_value',
    label: 'Valor do Pedido?',
    description: 'Verifica valor do pedido',
    icon: ShoppingCart,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'logic_split',
    label: 'Teste A/B',
    description: 'Divide contatos aleatoriamente',
    icon: Percent,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'logic_filter',
    label: 'Filtro Avançado',
    description: 'Filtra com múltiplas condições',
    icon: Filter,
    category: 'condition',
    color: '#f59e0b',
  },
  {
    type: 'condition_whatsapp_keyword',
    label: 'Condicao WhatsApp',
    description: 'Verifica keyword na mensagem (contem/igual/regex)',
    icon: GitBranch,
    category: 'condition',
    color: '#f59e0b',
    defaultConfig: { matchType: 'contains', keyword: '' },
  },
  {
    type: 'logic_randomizer',
    label: 'Randomizer A/B',
    description: 'Divide contatos aleatoriamente entre A e B',
    icon: Shuffle,
    category: 'condition',
    color: '#ec4899',
    defaultConfig: { percentA: 50 },
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
    icon: Clock,
    category: 'control',
    color: '#a855f7',
  },
  {
    type: 'control_delay_until',
    label: 'Aguardar Até',
    description: 'Aguarda até data/hora específica',
    icon: Calendar,
    category: 'control',
    color: '#a855f7',
  },
  {
    type: 'control_delay_configurable',
    label: 'Aguardar Delay',
    description: 'Aguarda minutos/horas/dias configuravel',
    icon: Timer,
    category: 'control',
    color: '#6b7280',
    defaultConfig: { delayValue: 1, delayUnit: 'hours' },
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
  trigger_list_added: TriggerNode,
  trigger_order_fulfilled: TriggerNode,
  trigger_order_pending: TriggerNode,
  trigger_inactivity: TriggerNode,
  trigger_viewed_product: TriggerNode,

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
  
  // New WhatsApp triggers
  trigger_whatsapp_keyword: TriggerNode,
  trigger_whatsapp_first_message: TriggerNode,
  trigger_rfm_segment_change: TriggerNode,
  trigger_back_in_stock: TriggerNode,
  trigger_ctwa_ad: TriggerNode,

  // New WhatsApp actions
  action_whatsapp_wait_reply: ActionNode,
  action_whatsapp_transfer: ActionNode,
  action_whatsapp_ai: ActionNode,
  action_shopify_coupon: ActionNode,
  action_whatsapp_catalog: ActionNode,
  action_whatsapp_payment: ActionNode,
  action_update_contact: ActionNode,
  action_back_in_stock_notify: ActionNode,

  // New conditions
  condition_whatsapp_keyword: ConditionNode,
  logic_randomizer: ConditionNode,

  // New control
  control_delay_configurable: ControlNode,

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

// ============================================
// NODE SECTIONS (for Sidebar)
// ============================================

export const NODE_SECTIONS = [
  {
    id: 'triggers',
    label: 'Triggers',
    title: 'Triggers',
    category: 'trigger',
    icon: Zap,
    nodes: triggerTypes,
  },
  {
    id: 'actions',
    label: 'Ações',
    title: 'Ações',
    category: 'action',
    icon: Send,
    nodes: actionTypes,
  },
  {
    id: 'conditions',
    label: 'Condições',
    title: 'Condições',
    category: 'condition',
    icon: GitBranch,
    nodes: conditionTypes,
  },
  {
    id: 'control',
    label: 'Controle',
    title: 'Controle',
    category: 'control',
    icon: Clock,
    nodes: controlTypes,
  },
];

// ============================================
// HELPER: Get node color classes by color string
// ============================================

export function getNodeColor(color?: string): { solid: string; bg: string; text: string } {
  const colorMap: Record<string, { solid: string; bg: string; text: string }> = {
    '#10b981': {
      solid: 'bg-emerald-500',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
    },
    '#3b82f6': {
      solid: 'bg-blue-500',
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
    },
    '#f59e0b': {
      solid: 'bg-amber-500',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
    },
    '#a855f7': {
      solid: 'bg-purple-500',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
    },
    '#ec4899': {
      solid: 'bg-pink-500',
      bg: 'bg-pink-500/10',
      text: 'text-pink-400',
    },
    // Named colors fallback
    'emerald': {
      solid: 'bg-emerald-500',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
    },
    'blue': {
      solid: 'bg-blue-500',
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
    },
    'amber': {
      solid: 'bg-amber-500',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
    },
    'purple': {
      solid: 'bg-purple-500',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
    },
    'pink': {
      solid: 'bg-pink-500',
      bg: 'bg-pink-500/10',
      text: 'text-pink-400',
    },
    'slate': {
      solid: 'bg-slate-500',
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
    },
  };

  return colorMap[color || 'slate'] || {
    solid: 'bg-slate-500',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
  };
}

export default nodeTypes;
