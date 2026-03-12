export interface Automation {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'draft';
  trigger: AutomationTrigger;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  stats?: AutomationStats;
  created_at: string;
  updated_at: string;
}

export interface AutomationTrigger {
  type: 'order_created' | 'order_paid' | 'order_fulfilled' | 'cart_abandoned' |
        'customer_created' | 'tag_added' | 'form_submitted' | 'date_trigger' | 'manual';
  config: Record<string, any>;
}

export interface AutomationNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: AutomationNodeData;
}

export interface AutomationNodeData {
  label: string;
  description?: string;
  config: Record<string, any>;
  stats?: {
    sent?: number;
    opened?: number;
    clicked?: number;
    converted?: number;
  };
  action_type?: 'send_whatsapp' | 'send_email' | 'send_sms' | 'add_tag' | 'remove_tag' |
                'create_deal' | 'update_contact' | 'webhook';
  condition_type?: 'has_tag' | 'order_value' | 'customer_tag' | 'time_since' | 'custom';
  delay_type?: 'minutes' | 'hours' | 'days' | 'specific_time';
  delay_value?: number;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
}

export interface AutomationStats {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  messages_sent: number;
  revenue_generated: number;
}

// ===============================
// PIPELINE AUTOMATION TYPES
// ===============================

export type AutomationSourceType =
  | 'shopify'
  | 'whatsapp'
  | 'hotmart'
  | 'webhook'
  | 'form';

export type AutomationTriggerEvent =
  // Shopify
  | 'order_created'
  | 'order_paid'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_refunded'
  | 'checkout_abandoned'
  | 'customer_created'
  // WhatsApp
  | 'conversation_started'
  | 'message_received'
  | 'conversation_ended'
  // Hotmart
  | 'purchase_started'
  | 'purchase_approved'
  | 'purchase_canceled'
  | 'subscription_renewed'
  | 'subscription_canceled'
  // Form/Webhook
  | 'form_submitted';

export type AutomationActionType =
  | 'create_deal'
  | 'move_deal'
  | 'update_contact';

export interface PipelineAutomationRule {
  id: string;
  pipeline_id: string;
  organization_id: string;
  source_type: AutomationSourceType;
  trigger_event: AutomationTriggerEvent;
  action_type: AutomationActionType;
  target_stage_id: string;
  auto_tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationAvailableSource {
  type: AutomationSourceType;
  name: string;
  connected: boolean;
  integration_id?: string;
  integration_name?: string;
}

export interface AutomationEventConfig {
  event: AutomationTriggerEvent;
  label: string;
  description: string;
}

export const AUTOMATION_EVENTS: Record<AutomationSourceType, AutomationEventConfig[]> = {
  shopify: [
    { event: 'order_created', label: 'Novo pedido', description: 'Quando cliente realizar pedido' },
    { event: 'order_paid', label: 'Pedido pago', description: 'Quando pagamento for confirmado' },
    { event: 'checkout_abandoned', label: 'Carrinho abandonado', description: 'Quando abandonar carrinho' },
    { event: 'customer_created', label: 'Novo cliente', description: 'Quando cliente se cadastrar' },
    { event: 'order_shipped', label: 'Pedido enviado', description: 'Quando pedido for despachado' },
    { event: 'order_delivered', label: 'Pedido entregue', description: 'Quando entrega for confirmada' },
    { event: 'order_refunded', label: 'Reembolso', description: 'Quando reembolso for processado' },
  ],
  whatsapp: [
    { event: 'conversation_started', label: 'Nova conversa', description: 'Quando cliente iniciar conversa' },
    { event: 'message_received', label: 'Mensagem recebida', description: 'Quando receber mensagem' },
    { event: 'conversation_ended', label: 'Conversa finalizada', description: 'Quando conversa encerrar' },
  ],
  hotmart: [
    { event: 'purchase_started', label: 'Nova compra', description: 'Quando compra for iniciada' },
    { event: 'purchase_approved', label: 'Compra aprovada', description: 'Quando pagamento aprovar' },
    { event: 'purchase_canceled', label: 'Compra cancelada', description: 'Quando compra for cancelada' },
    { event: 'subscription_renewed', label: 'Assinatura renovada', description: 'Quando renovar assinatura' },
    { event: 'subscription_canceled', label: 'Assinatura cancelada', description: 'Quando cancelar assinatura' },
  ],
  webhook: [
    { event: 'form_submitted', label: 'Webhook recebido', description: 'Quando receber webhook externo' },
  ],
  form: [
    { event: 'form_submitted', label: 'Formulário enviado', description: 'Quando formulário for preenchido' },
  ],
};
