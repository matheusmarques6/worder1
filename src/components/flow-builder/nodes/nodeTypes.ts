import {
  ShoppingCart,
  Package,
  UserPlus,
  Tag,
  Briefcase,
  MoveRight,
  Trophy,
  XCircle,
  Star,
  Users,
  Webhook,
  MessageSquare,
  Mail,
  Send,
  Database,
  PlusCircle,
  Bell,
  Clock,
  GitBranch,
  Split,
  Filter,
  Zap,
  LucideIcon,
} from 'lucide-react';
import { NodeCategory } from '@/stores/flowStore';

// ============================================
// NODE TYPE DEFINITIONS
// ============================================

export interface NodeTypeDefinition {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: NodeCategory;
  color: string;
  defaultConfig?: Record<string, any>;
}

// ============================================
// TRIGGERS
// ============================================

export const TRIGGER_NODES: NodeTypeDefinition[] = [
  {
    type: 'trigger_order',
    label: 'Pedido Realizado',
    description: 'Quando um pedido for criado',
    icon: ShoppingCart,
    category: 'trigger',
    color: 'emerald',
  },
  {
    type: 'trigger_order_paid',
    label: 'Pedido Pago',
    description: 'Quando um pedido for pago',
    icon: ShoppingCart,
    category: 'trigger',
    color: 'emerald',
  },
  {
    type: 'trigger_abandon',
    label: 'Carrinho Abandonado',
    description: 'Quando carrinho for abandonado',
    icon: Package,
    category: 'trigger',
    color: 'amber',
  },
  {
    type: 'trigger_signup',
    label: 'Novo Cadastro',
    description: 'Quando um contato for criado',
    icon: UserPlus,
    category: 'trigger',
    color: 'blue',
  },
  {
    type: 'trigger_tag',
    label: 'Tag Adicionada',
    description: 'Quando uma tag for adicionada',
    icon: Tag,
    category: 'trigger',
    color: 'purple',
  },
  {
    type: 'trigger_deal_created',
    label: 'Deal Criado',
    description: 'Quando um deal for criado',
    icon: Briefcase,
    category: 'trigger',
    color: 'blue',
  },
  {
    type: 'trigger_deal_stage',
    label: 'Deal Mudou Estágio',
    description: 'Quando deal mudar de estágio',
    icon: MoveRight,
    category: 'trigger',
    color: 'violet',
  },
  {
    type: 'trigger_deal_won',
    label: 'Deal Ganho',
    description: 'Quando deal for ganho',
    icon: Trophy,
    category: 'trigger',
    color: 'emerald',
  },
  {
    type: 'trigger_deal_lost',
    label: 'Deal Perdido',
    description: 'Quando deal for perdido',
    icon: XCircle,
    category: 'trigger',
    color: 'red',
  },
  {
    type: 'trigger_date',
    label: 'Data Especial',
    description: 'Em data específica (aniversário, etc)',
    icon: Star,
    category: 'trigger',
    color: 'pink',
  },
  {
    type: 'trigger_segment',
    label: 'Entrou em Segmento',
    description: 'Quando entrar em segmento',
    icon: Users,
    category: 'trigger',
    color: 'cyan',
  },
  {
    type: 'trigger_webhook',
    label: 'Webhook Recebido',
    description: 'Quando webhook for recebido',
    icon: Webhook,
    category: 'trigger',
    color: 'orange',
  },
  {
    type: 'trigger_whatsapp',
    label: 'WhatsApp Recebido',
    description: 'Quando mensagem for recebida',
    icon: MessageSquare,
    category: 'trigger',
    color: 'green',
  },
];

// ============================================
// ACTIONS
// ============================================

export const ACTION_NODES: NodeTypeDefinition[] = [
  {
    type: 'action_email',
    label: 'Enviar Email',
    description: 'Enviar email para o contato',
    icon: Mail,
    category: 'action',
    color: 'violet',
    defaultConfig: {
      subject: '',
      templateId: '',
    },
  },
  {
    type: 'action_whatsapp',
    label: 'Enviar WhatsApp',
    description: 'Enviar mensagem WhatsApp',
    icon: MessageSquare,
    category: 'action',
    color: 'green',
    defaultConfig: {
      templateId: '',
      instanceId: '',
    },
  },
  {
    type: 'action_sms',
    label: 'Enviar SMS',
    description: 'Enviar SMS para o contato',
    icon: Send,
    category: 'action',
    color: 'blue',
    defaultConfig: {
      message: '',
    },
  },
  {
    type: 'action_tag',
    label: 'Adicionar Tag',
    description: 'Adicionar tag ao contato',
    icon: Tag,
    category: 'action',
    color: 'purple',
    defaultConfig: {
      tagName: '',
    },
  },
  {
    type: 'action_remove_tag',
    label: 'Remover Tag',
    description: 'Remover tag do contato',
    icon: Tag,
    category: 'action',
    color: 'red',
    defaultConfig: {
      tagName: '',
    },
  },
  {
    type: 'action_update',
    label: 'Atualizar Contato',
    description: 'Atualizar campos do contato',
    icon: Database,
    category: 'action',
    color: 'cyan',
    defaultConfig: {
      fields: {},
    },
  },
  {
    type: 'action_create_deal',
    label: 'Criar Deal',
    description: 'Criar novo deal no CRM',
    icon: PlusCircle,
    category: 'action',
    color: 'blue',
    defaultConfig: {
      pipelineId: '',
      stageId: '',
      title: '',
      value: 0,
    },
  },
  {
    type: 'action_move_deal',
    label: 'Mover Deal',
    description: 'Mover deal para outro estágio',
    icon: MoveRight,
    category: 'action',
    color: 'violet',
    defaultConfig: {
      stageId: '',
    },
  },
  {
    type: 'action_assign_deal',
    label: 'Atribuir Deal',
    description: 'Atribuir deal a um agente',
    icon: UserPlus,
    category: 'action',
    color: 'cyan',
    defaultConfig: {
      userId: '',
    },
  },
  {
    type: 'action_notify',
    label: 'Notificação Interna',
    description: 'Enviar notificação para equipe',
    icon: Bell,
    category: 'action',
    color: 'amber',
    defaultConfig: {
      message: '',
      userIds: [],
    },
  },
  {
    type: 'action_webhook',
    label: 'Chamar Webhook',
    description: 'Fazer requisição HTTP externa',
    icon: Webhook,
    category: 'action',
    color: 'slate',
    defaultConfig: {
      url: '',
      method: 'POST',
      headers: {},
      body: '',
    },
  },
];

// ============================================
// CONDITIONS / LOGIC
// ============================================

export const CONDITION_NODES: NodeTypeDefinition[] = [
  {
    type: 'condition_has_tag',
    label: 'Tem Tag?',
    description: 'Verificar se contato tem tag',
    icon: Tag,
    category: 'condition',
    color: 'amber',
    defaultConfig: {
      tagName: '',
    },
  },
  {
    type: 'condition_field',
    label: 'Campo Igual?',
    description: 'Verificar valor de um campo',
    icon: GitBranch,
    category: 'condition',
    color: 'amber',
    defaultConfig: {
      field: '',
      operator: 'equals',
      value: '',
    },
  },
  {
    type: 'condition_deal_value',
    label: 'Valor do Deal?',
    description: 'Comparar valor do deal',
    icon: Briefcase,
    category: 'condition',
    color: 'amber',
    defaultConfig: {
      operator: 'greater_than',
      value: 0,
    },
  },
  {
    type: 'condition_order_value',
    label: 'Valor do Pedido?',
    description: 'Comparar valor do pedido',
    icon: ShoppingCart,
    category: 'condition',
    color: 'amber',
    defaultConfig: {
      operator: 'greater_than',
      value: 0,
    },
  },
  {
    type: 'logic_split',
    label: 'Teste A/B',
    description: 'Dividir tráfego aleatoriamente',
    icon: Split,
    category: 'condition',
    color: 'pink',
    defaultConfig: {
      percentageA: 50,
    },
  },
  {
    type: 'logic_filter',
    label: 'Filtrar',
    description: 'Filtrar por condição avançada',
    icon: Filter,
    category: 'condition',
    color: 'indigo',
    defaultConfig: {
      conditions: [],
    },
  },
];

// ============================================
// CONTROL FLOW
// ============================================

export const CONTROL_NODES: NodeTypeDefinition[] = [
  {
    type: 'control_delay',
    label: 'Aguardar',
    description: 'Pausar execução por um tempo',
    icon: Clock,
    category: 'control',
    color: 'slate',
    defaultConfig: {
      value: 1,
      unit: 'hours',
    },
  },
  {
    type: 'control_delay_until',
    label: 'Aguardar Até',
    description: 'Pausar até data/hora específica',
    icon: Clock,
    category: 'control',
    color: 'slate',
    defaultConfig: {
      datetime: '',
      timezone: 'America/Sao_Paulo',
    },
  },
];

// ============================================
// ALL NODES
// ============================================

export const ALL_NODE_TYPES: NodeTypeDefinition[] = [
  ...TRIGGER_NODES,
  ...ACTION_NODES,
  ...CONDITION_NODES,
  ...CONTROL_NODES,
];

// ============================================
// HELPERS
// ============================================

export function getNodeDefinition(nodeType: string): NodeTypeDefinition | undefined {
  return ALL_NODE_TYPES.find((n) => n.type === nodeType);
}

export function getNodesByCategory(category: NodeCategory): NodeTypeDefinition[] {
  return ALL_NODE_TYPES.filter((n) => n.category === category);
}

export function getNodeColor(color: string): {
  bg: string;
  border: string;
  text: string;
  solid: string;
  glow: string;
} {
  const colors: Record<string, any> = {
    emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/50', text: 'text-emerald-400', solid: 'bg-emerald-500', glow: 'shadow-emerald-500/30' },
    amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/50', text: 'text-amber-400', solid: 'bg-amber-500', glow: 'shadow-amber-500/30' },
    blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/50', text: 'text-blue-400', solid: 'bg-blue-500', glow: 'shadow-blue-500/30' },
    purple: { bg: 'bg-purple-500/15', border: 'border-purple-500/50', text: 'text-purple-400', solid: 'bg-purple-500', glow: 'shadow-purple-500/30' },
    pink: { bg: 'bg-pink-500/15', border: 'border-pink-500/50', text: 'text-pink-400', solid: 'bg-pink-500', glow: 'shadow-pink-500/30' },
    cyan: { bg: 'bg-cyan-500/15', border: 'border-cyan-500/50', text: 'text-cyan-400', solid: 'bg-cyan-500', glow: 'shadow-cyan-500/30' },
    orange: { bg: 'bg-orange-500/15', border: 'border-orange-500/50', text: 'text-orange-400', solid: 'bg-orange-500', glow: 'shadow-orange-500/30' },
    violet: { bg: 'bg-violet-500/15', border: 'border-violet-500/50', text: 'text-violet-400', solid: 'bg-violet-500', glow: 'shadow-violet-500/30' },
    green: { bg: 'bg-green-500/15', border: 'border-green-500/50', text: 'text-green-400', solid: 'bg-green-500', glow: 'shadow-green-500/30' },
    slate: { bg: 'bg-slate-500/15', border: 'border-slate-500/50', text: 'text-slate-400', solid: 'bg-slate-500', glow: 'shadow-slate-500/30' },
    indigo: { bg: 'bg-indigo-500/15', border: 'border-indigo-500/50', text: 'text-indigo-400', solid: 'bg-indigo-500', glow: 'shadow-indigo-500/30' },
    red: { bg: 'bg-red-500/15', border: 'border-red-500/50', text: 'text-red-400', solid: 'bg-red-500', glow: 'shadow-red-500/30' },
  };
  return colors[color] || colors.slate;
}

// ============================================
// SECTIONS FOR SIDEBAR
// ============================================

export const NODE_SECTIONS = [
  {
    id: 'triggers',
    label: 'Gatilhos',
    icon: Zap,
    nodes: TRIGGER_NODES,
  },
  {
    id: 'actions',
    label: 'Ações',
    icon: Send,
    nodes: ACTION_NODES,
  },
  {
    id: 'conditions',
    label: 'Condições',
    icon: GitBranch,
    nodes: CONDITION_NODES,
  },
  {
    id: 'control',
    label: 'Controle',
    icon: Clock,
    nodes: CONTROL_NODES,
  },
];
