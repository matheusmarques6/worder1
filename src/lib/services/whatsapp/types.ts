// =============================================
// WhatsApp Service Types
// src/lib/services/whatsapp/types.ts
// =============================================

// ---- Instance ----
export interface WhatsAppInstance {
  id: string
  organization_id: string
  store_id?: string
  phone_number_id: string
  waba_id: string
  access_token: string
  display_phone?: string
  business_name?: string
  webhook_verify_token: string
  is_active: boolean
  is_verified: boolean
  webhook_verified: boolean
  tier: number
  daily_limit: number
  api_version: string
  quality_rating?: string
  messaging_limit?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ---- Conversation ----
export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'archived'
export type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ConversationOrigin = 'organic' | 'ad' | 'api' | 'campaign' | 'automation'

export interface Conversation {
  id: string
  organization_id: string
  store_id?: string
  instance_id?: string
  contact_id?: string
  contact_phone: string
  contact_name?: string
  contact_avatar_url?: string
  status: ConversationStatus
  priority: ConversationPriority
  assigned_agent_id?: string
  queue_id?: string
  bot_active: boolean
  ai_agent_id?: string
  unread_count: number
  last_message_at?: string
  last_message_preview?: string
  last_message_direction?: 'inbound' | 'outbound'
  service_window_expires_at?: string
  is_contact_initiated: boolean
  first_response_at?: string
  resolved_at?: string
  resolved_by?: string
  origin: ConversationOrigin
  ad_referral?: Record<string, unknown>
  tags: string[]
  custom_fields: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ---- Message ----
export type MessageDirection = 'inbound' | 'outbound'
export type MessageType =
  | 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker'
  | 'location' | 'contacts' | 'template' | 'interactive' | 'reaction'
  | 'order' | 'system' | 'note'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type SenderType = 'agent' | 'bot' | 'system' | 'contact'

export interface Message {
  id: string
  organization_id: string
  conversation_id: string
  wamid?: string
  direction: MessageDirection
  message_type: MessageType
  content?: string
  media_url?: string
  media_mime_type?: string
  media_filename?: string
  media_size?: number
  media_id?: string
  template_name?: string
  template_data?: Record<string, unknown>
  interactive_data?: Record<string, unknown>
  quoted_message_id?: string
  context_wamid?: string
  sender_id?: string
  sender_name?: string
  sender_type: SenderType
  status: MessageStatus
  error_code?: string
  error_message?: string
  is_from_me: boolean
  is_internal_note: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ---- Queue ----
export interface Queue {
  id: string
  organization_id: string
  store_id?: string
  name: string
  color: string
  greeting_message?: string
  out_of_hours_message?: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ---- Agent Status ----
export type AgentOnlineStatus = 'online' | 'away' | 'offline'

export interface AgentStatus {
  id: string
  agent_id: string
  organization_id: string
  status: AgentOnlineStatus
  active_conversations: number
  max_conversations: number
  last_seen_at: string
  updated_at: string
}

// ---- Transfer ----
export interface Transfer {
  id: string
  organization_id: string
  conversation_id: string
  from_agent_id?: string
  from_agent_name?: string
  to_agent_id?: string
  to_agent_name?: string
  from_queue_id?: string
  to_queue_id?: string
  reason?: string
  created_at: string
}

// ---- Quick Reply ----
export type QuickReplyCategory = 'greeting' | 'support' | 'sales' | 'closing' | 'general'

export interface QuickReply {
  id: string
  organization_id: string
  store_id?: string
  shortcut: string
  title: string
  content: string
  category: QuickReplyCategory
  is_active: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

// ---- Note ----
export interface ConversationNote {
  id: string
  organization_id: string
  conversation_id: string
  agent_id: string
  agent_name?: string
  content: string
  created_at: string
  updated_at: string
}

// ---- Tag ----
export interface Tag {
  id: string
  organization_id: string
  name: string
  color: string
  usage_count: number
  created_at: string
}

// ---- CSAT ----
export interface CSATRating {
  id: string
  organization_id: string
  conversation_id: string
  contact_id?: string
  agent_id?: string
  rating: number
  comment?: string
  created_at: string
}

// ---- Business Hours ----
export interface BusinessHours {
  id: string
  organization_id: string
  store_id?: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  timezone: string
  out_of_hours_message: string
  out_of_hours_bot_id?: string
  enable_auto_reply: boolean
  enable_bot_outside_hours: boolean
  created_at: string
  updated_at: string
}

// ---- AI Agent ----
export type AIAgentType = 'sales' | 'support' | 'post_sale'
export type AIAgentMode = 'auto' | 'copilot' | 'both'

export interface AIAgent {
  id: string
  organization_id: string
  store_id?: string
  name: string
  agent_type: AIAgentType
  model: string
  system_prompt: string
  knowledge_base: string
  temperature: number
  max_tokens: number
  handoff_keywords: string[]
  mode: AIAgentMode
  max_interactions?: number
  is_active: boolean
  total_conversations: number
  total_messages: number
  avg_satisfaction: number
  created_at: string
  updated_at: string
}

// ---- Template ----
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED'

export interface WhatsAppTemplate {
  id: string
  organization_id: string
  instance_id?: string
  meta_template_id?: string
  name: string
  language: string
  category: TemplateCategory
  status: TemplateStatus
  components: unknown[]
  header_type?: string
  body_text?: string
  footer_text?: string
  buttons: unknown[]
  variables_count: number
  quality_score?: Record<string, unknown>
  rejection_reason?: string
  usage_count: number
  last_used_at?: string
  created_at: string
  updated_at: string
}

// ---- Campaign ----
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type AudienceType = 'contacts' | 'csv' | 'rfm' | 'tags' | 'pipeline'

export interface Campaign {
  id: string
  organization_id: string
  store_id?: string
  instance_id?: string
  template_id?: string
  name: string
  status: CampaignStatus
  audience_type: AudienceType
  audience_filters: Record<string, unknown>
  variable_mappings: Record<string, unknown>
  total_contacts: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  replied_count: number
  estimated_cost: number
  actual_cost: number
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ---- Opt Status ----
export type OptStatus = 'opted_in' | 'opted_out'

export interface ContactOptStatus {
  id: string
  organization_id: string
  contact_id?: string
  phone: string
  status: OptStatus
  opted_in_at?: string
  opted_out_at?: string
  opt_in_source: string
  opt_out_reason?: string
  created_at: string
  updated_at: string
}

// ---- RFM ----
export interface ContactRFMScore {
  id: string
  organization_id: string
  store_id?: string
  contact_id: string
  recency_score: number
  frequency_score: number
  monetary_score: number
  rfm_segment: string
  total_orders: number
  total_spent: number
  avg_order_value: number
  last_order_at?: string
  days_since_last_order?: number
  calculated_at: string
  created_at: string
  updated_at: string
}

// ---- Widget ----
export interface WidgetConfig {
  id: string
  organization_id: string
  store_id?: string
  instance_id?: string
  phone_number: string
  welcome_message: string
  position: 'left' | 'right'
  color: string
  delay_seconds: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---- Webhook Payload (Meta) ----
export interface MetaWebhookEntry {
  id: string
  changes: Array<{
    field: string
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<{
        wa_id: string
        profile: { name: string }
      }>
      messages?: Array<MetaWebhookMessage>
      statuses?: Array<MetaWebhookStatus>
      errors?: Array<{ code: number; title: string; message?: string; href?: string }>
    }
  }>
}

export interface MetaWebhookMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  video?: { id: string; mime_type: string; sha256: string; caption?: string }
  audio?: { id: string; mime_type: string; sha256: string; voice?: boolean }
  document?: { id: string; filename: string; mime_type: string; sha256: string; caption?: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  contacts?: unknown[]
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  button?: { text: string; payload: string }
  sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean }
  reaction?: { message_id: string; emoji: string }
  order?: { catalog_id: string; product_items: unknown[] }
  referral?: { source_url: string; source_type: string; source_id: string; headline?: string; body?: string; ctwa_clid?: string }
  context?: { from: string; id: string }
}

export interface MetaWebhookStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  conversation?: {
    id: string
    origin: { type: string }
    expiration_timestamp?: string
  }
  pricing?: {
    billable: boolean
    pricing_model: string
    category: string
  }
  errors?: Array<{
    code: number
    title: string
    message?: string
    error_data?: { details: string }
    href?: string
  }>
}

// ---- Service Return ----
export interface ServiceResult<T> {
  data?: T
  error?: string
  code?: number
}
