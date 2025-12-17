// =====================================================
// WORDER - INBOX TYPES
// =====================================================

// Contato
export interface InboxContact {
  id: string
  organization_id: string
  phone_number: string
  name?: string
  email?: string
  profile_picture_url?: string
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  custom_fields?: Record<string, any>
  tags: string[]
  
  // CRM
  deal_id?: string
  pipeline_id?: string
  stage_id?: string
  
  // Shopify
  shopify_customer_id?: string
  total_orders: number
  total_spent: number
  last_order_at?: string
  
  // Status
  is_blocked: boolean
  blocked_reason?: string
  blocked_at?: string
  
  // Origem
  source?: 'organic' | 'campaign' | 'import' | 'manual'
  source_campaign_id?: string
  
  // Métricas
  first_message_at?: string
  last_message_at?: string
  total_conversations: number
  total_messages_received: number
  total_messages_sent: number
  
  created_at: string
  updated_at?: string
}

// Conversa
export interface InboxConversation {
  id: string
  organization_id: string
  contact_id: string
  instance_id?: string
  phone_number: string
  wa_conversation_id?: string
  
  // Status
  status: 'open' | 'pending' | 'closed' | 'spam'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  
  // Atribuição
  assigned_agent_id?: string
  assigned_team_id?: string
  assigned_at?: string
  
  // Bot
  is_bot_active: boolean
  bot_disabled_until?: string
  bot_disabled_reason?: string
  bot_disabled_by?: string
  
  // Última mensagem
  last_message_at?: string
  last_message_preview?: string
  last_message_type?: string
  last_message_direction?: 'inbound' | 'outbound'
  
  // Contadores
  unread_count: number
  total_messages: number
  
  // Janela 24h
  window_expires_at?: string
  can_send_template_only: boolean
  
  // Nota interna
  internal_note?: string
  
  // Resolução
  first_response_at?: string
  first_response_time_seconds?: number
  resolved_at?: string
  resolved_by?: string
  rating?: number
  rating_comment?: string
  
  created_at: string
  updated_at?: string
  
  // Joins
  contact?: InboxContact
  contact_name?: string
  contact_email?: string
  contact_avatar?: string
  contact_tags?: string[]
  contact_total_orders?: number
  contact_total_spent?: number
  contact_is_blocked?: boolean
  agent_name?: string
  tags?: InboxTag[]
}

// Mensagem
export interface InboxMessage {
  id: string
  conversation_id: string
  contact_id?: string
  meta_message_id?: string
  
  // Direção
  direction: 'inbound' | 'outbound'
  
  // Tipo e conteúdo
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'sticker' | 'template' | 'interactive'
  content?: string
  
  // Mídia
  media_url?: string
  media_mime_type?: string
  media_filename?: string
  media_size?: number
  media_duration_seconds?: number
  
  // Template
  template_id?: string
  template_name?: string
  template_variables?: Record<string, any>
  
  // Reply
  reply_to_message_id?: string
  quoted_message?: {
    id: string
    content: string
    message_type: string
    direction: string
  }
  
  // Status
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  error_code?: string
  error_message?: string
  
  // Quem enviou
  sent_by_user_id?: string
  sent_by_user_name?: string
  sent_by_bot: boolean
  sent_by_agent_id?: string
  sent_by_campaign_id?: string
  
  // Timestamps
  sent_at?: string
  delivered_at?: string
  read_at?: string
  failed_at?: string
  created_at: string
  
  // Outros
  reaction?: string
  is_deleted: boolean
  deleted_at?: string
  metadata?: Record<string, any>
}

// Nota
export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important'
  is_pinned: boolean
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}

// Atividade
export interface InboxActivity {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  activity_type: string
  title: string
  description?: string
  metadata?: Record<string, any>
  related_deal_id?: string
  related_campaign_id?: string
  related_order_id?: string
  created_by?: string
  created_by_name?: string
  created_at: string
}

// Tag
export interface InboxTag {
  id: string
  organization_id: string
  name: string
  color: string
  description?: string
  contacts_count: number
  conversations_count: number
  is_active: boolean
  created_by?: string
  created_at: string
}

// Quick Reply
export interface InboxQuickReply {
  id: string
  organization_id: string
  shortcut: string
  title: string
  content: string
  media_url?: string
  media_type?: 'image' | 'video' | 'document' | 'audio'
  media_filename?: string
  category?: string
  tags?: string[]
  use_count: number
  last_used_at?: string
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at?: string
}

// Order (Shopify)
export interface InboxOrder {
  id: string
  organization_id: string
  shopify_order_id: string
  order_number: string
  customer_email?: string
  customer_phone?: string
  total_price: number
  subtotal_price: number
  currency: string
  financial_status: string
  fulfillment_status?: string
  line_items: Array<{
    title: string
    quantity: number
    price: number
    variant_title?: string
    image_url?: string
  }>
  shipping_address?: Record<string, any>
  created_at: string
}

// Cart (Abandoned)
export interface InboxCart {
  id: string
  organization_id: string
  shopify_checkout_id: string
  customer_email?: string
  customer_phone?: string
  total_price: number
  currency: string
  line_items: Array<{
    title: string
    quantity: number
    price: number
    variant_title?: string
    image_url?: string
  }>
  abandoned_checkout_url?: string
  recovered: boolean
  created_at: string
}

// Deal
export interface InboxDeal {
  id: string
  organization_id: string
  contact_id: string
  pipeline_id: string
  stage_id: string
  title: string
  value: number
  status: 'open' | 'won' | 'lost'
  probability?: number
  expected_close_date?: string
  created_by?: string
  created_at: string
  updated_at?: string
  pipeline?: {
    id: string
    name: string
  }
  stage?: {
    id: string
    name: string
    color: string
  }
}

// Filtros de conversa
export interface ConversationFilters {
  status?: 'all' | 'open' | 'pending' | 'closed'
  assignedTo?: 'all' | 'me' | 'unassigned' | string
  priority?: 'all' | 'low' | 'normal' | 'high' | 'urgent'
  botActive?: boolean
  tag?: string
  search?: string
}

// Paginação
export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore?: boolean
}

// Resposta da API
export interface ApiResponse<T> {
  data?: T
  error?: string
  pagination?: Pagination
}
