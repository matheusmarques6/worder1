// ===============================
// USER & AUTH TYPES
// ===============================

// Re-export AI Agent types
export * from './ai-agents'

export interface UserMetadata {
  name?: string;
  role?: string;
  organization_id?: string;
  is_agent?: boolean;
  agent_id?: string;
  [key: string]: any;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  company_name?: string;
  organization_id?: string;
  role?: string;
  user_metadata?: UserMetadata;
  created_at: string;
  updated_at: string;
}

// ===============================
// SHOPIFY TYPES
// ===============================
export interface ShopifyStore {
  id: string;
  user_id: string;
  shop_domain: string;
  access_token: string;
  shop_name: string;
  currency: string;
  created_at: string;
}

export interface ShopifyOrder {
  id: string;
  order_number: number;
  email: string;
  total_price: string;
  subtotal_price: string;
  currency: string;
  financial_status: 'pending' | 'paid' | 'refunded' | 'voided';
  fulfillment_status: 'fulfilled' | 'partial' | 'unfulfilled' | null;
  customer: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  created_at: string;
  source_name?: string;
  tags?: string;
  note?: string;
}

export interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  orders_count: number;
  total_spent: string;
  tags?: string;
  created_at: string;
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  variant_title?: string;
  product_id: string;
}

// ===============================
// KLAVIYO TYPES
// ===============================
export interface KlaviyoIntegration {
  id: string;
  user_id: string;
  api_key: string;
  public_api_key?: string;
  created_at: string;
}

export interface KlaviyoCampaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  send_time?: string;
  created_at: string;
  updated_at: string;
  stats?: KlaviyoCampaignStats;
}

export interface KlaviyoCampaignStats {
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  revenue: number;
}

export interface KlaviyoFlow {
  id: string;
  name: string;
  status: 'draft' | 'live' | 'paused';
  trigger_type: string;
  created_at: string;
  updated_at: string;
  stats?: KlaviyoFlowStats;
}

export interface KlaviyoFlowStats {
  recipients: number;
  revenue: number;
  conversion_rate: number;
}

export interface KlaviyoMetrics {
  total_revenue: number;
  total_orders: number;
  average_order_value: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
  subscribers: number;
  unsubscribe_rate: number;
}

// ===============================
// CRM TYPES
// ===============================
export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  color: string;
  is_default: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
  probability: number;
  rotting_days?: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  deal_count?: number;
}

// Alias for backward compatibility
export type PipelineColumn = PipelineStage;

export interface Contact {
  id: string;
  organization_id: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  position?: string;
  avatar_url?: string;
  source: string;
  shopify_customer_id?: string;
  klaviyo_profile_id?: string;
  total_orders: number;
  total_spent: number;
  average_order_value: number;
  last_order_at?: string;
  lifetime_value: number;
  tags: string[];
  custom_fields: Record<string, any>;
  is_subscribed_email: boolean;
  is_subscribed_sms: boolean;
  is_subscribed_whatsapp: boolean;
  deals?: Deal[];
  deals_count?: number;
  created_at: string;
  updated_at: string;
  // Computed
  total_revenue?: number;
}

export interface Deal {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id?: string;
  assigned_to?: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  expected_close_date?: string;
  status: 'open' | 'won' | 'lost';
  won_at?: string;
  lost_at?: string;
  lost_reason?: string;
  notes?: string;
  tags: string[];
  custom_fields: Record<string, any>;
  position: number;
  created_at: string;
  updated_at: string;
  // Relations
  contact?: Contact;
  stage?: PipelineStage;
  assigned_user?: User;
  // Legacy alias
  column_id?: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  user_id?: string;
  type: 'note' | 'email' | 'call' | 'meeting' | 'task' | 'stage_change' | 'value_change' | 'created';
  title?: string;
  description?: string;
  content?: string;
  metadata?: Record<string, any>;
  created_at: string;
  user?: User;
}

// Legacy alias
export type Activity = DealActivity;

// API Request Types
export interface CreateDealData {
  title: string;
  value?: number;
  probability?: number;
  expected_close_date?: string;
  contact_id?: string;
  stage_id: string;
  pipeline_id: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateDealData {
  title?: string;
  value?: number;
  probability?: number;
  expected_close_date?: string;
  contact_id?: string;
  stage_id?: string;
  notes?: string;
  tags?: string[];
  status?: 'open' | 'won' | 'lost';
  lost_reason?: string;
}

export interface CreatePipelineData {
  name: string;
  description?: string;
  stages: {
    name: string;
    color: string;
    probability?: number;
  }[];
}

// ===============================
// WHATSAPP TYPES
// ===============================
export interface WhatsAppIntegration {
  id: string;
  user_id: string;
  phone_number: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  webhook_secret?: string;
  status: 'active' | 'disconnected' | 'pending';
  created_at: string;
}

export interface WhatsAppConversation {
  id: string;
  user_id?: string;
  organization_id?: string;
  contact_id?: string;
  phone_number: string;
  contact_name?: string;
  last_message?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  status: 'open' | 'closed' | 'pending';
  assigned_to?: string;
  assigned_agent_id?: string;
  created_at: string;
  updated_at?: string;
  // Novas propriedades do CRM
  origin?: 'meta' | 'qr' | 'evolution';
  instance_id?: string;
  chat_note?: string;
  is_bot_active?: boolean;
  bot_disabled_until?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  source?: string;
  // Relações
  contact?: {
    id?: string;
    email?: string;
    phone?: string;
    total_orders?: number;
    total_spent?: number;
  };
  tags?: Array<{
    tag?: {
      id?: string;
      title?: string;
      color?: string;
    };
  }>;
  assigned_agent?: {
    id?: string;
    name?: string;
    email?: string;
  };
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  from_number?: string;
  to_number?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template';
  content: string;
  media_url?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  is_outgoing?: boolean;
  direction?: 'inbound' | 'outbound';
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  meta_message_id?: string;
  wa_message_id?: string;
}

export interface WhatsAppTemplate {
  id: string;
  user_id: string;
  name: string;
  language: string;
  category: 'marketing' | 'utility' | 'authentication';
  status: 'approved' | 'pending' | 'rejected';
  components: WhatsAppTemplateComponent[];
  created_at: string;
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button';
  text?: string;
  format?: string;
  buttons?: { type: string; text: string; url?: string }[];
}

// ===============================
// AUTOMATION TYPES
// ===============================
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
  type: string; // e.g., 'trigger_order', 'action_email', 'logic_delay', etc.
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
  // For action nodes
  action_type?: 'send_whatsapp' | 'send_email' | 'send_sms' | 'add_tag' | 'remove_tag' | 
                'create_deal' | 'update_contact' | 'webhook';
  // For condition nodes
  condition_type?: 'has_tag' | 'order_value' | 'customer_tag' | 'time_since' | 'custom';
  // For delay nodes
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
// DASHBOARD TYPES
// ===============================
export interface DashboardMetrics {
  // Email Marketing Metrics
  email_revenue: number;
  email_revenue_change: number;
  email_orders: number;
  email_orders_change: number;
  email_conversion_rate: number;
  email_conversion_rate_change: number;
  
  // Operation Metrics
  total_revenue: number;
  total_revenue_change: number;
  total_orders: number;
  total_orders_change: number;
  average_order_value: number;
  aov_change: number;
  
  // Engagement Metrics
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
  
  // Attribution
  email_attribution_percentage: number;
}

export interface RevenueChartData {
  date: string;
  email_revenue: number;
  total_revenue: number;
  orders: number;
}

export interface TopCampaign {
  id: string;
  name: string;
  sent_date: string;
  recipients: number;
  revenue: number;
  open_rate: number;
  click_rate: number;
}

export interface TopFlow {
  id: string;
  name: string;
  status: 'live' | 'paused';
  revenue: number;
  recipients: number;
  conversion_rate: number;
}

// ===============================
// API RESPONSE TYPES
// ===============================
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ===============================
// UI TYPES
// ===============================
export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavItem[];
}

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TableColumn<T> {
  key: keyof T | string;
  title: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'daterange' | 'number';
  options?: SelectOption[];
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

// Eventos disponíveis por fonte
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
