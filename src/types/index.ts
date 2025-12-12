// ===============================
// USER & AUTH TYPES
// ===============================
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  company_name?: string;
  organization_id?: string;
  role?: string;
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
  user_id: string;
  name: string;
  description?: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
  columns: PipelineColumn[];
}

export interface PipelineColumn {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  company?: string;
  position?: string;
  avatar_url?: string;
  tags: string[];
  custom_fields: Record<string, string | number | boolean>;
  shopify_customer_id?: string;
  total_revenue: number;
  total_orders: number;
  last_order_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  pipeline_id: string;
  column_id: string;
  contact_id: string;
  user_id: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  expected_close_date?: string;
  notes?: string;
  position: number;
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export interface Activity {
  id: string;
  user_id: string;
  contact_id?: string;
  deal_id?: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'whatsapp' | 'task';
  title: string;
  description?: string;
  completed: boolean;
  due_date?: string;
  completed_at?: string;
  created_at: string;
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
  user_id: string;
  contact_id?: string;
  phone_number: string;
  contact_name?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  status: 'open' | 'closed' | 'pending';
  assigned_to?: string;
  created_at: string;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  from_number: string;
  to_number: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template';
  content: string;
  media_url?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  is_outgoing: boolean;
  created_at: string;
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
