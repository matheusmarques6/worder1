// =====================================================
// WORDER - INBOX TYPES
// =====================================================

// Contato (UNIFICADO - tabela contacts)
export interface InboxContact {
  id: string
  organization_id: string
  
  // Identificadores
  phone_number: string
  phone?: string
  whatsapp?: string
  email?: string
  
  // Nome
  name?: string
  first_name?: string
  last_name?: string
  full_name?: string
  profile_name?: string
  
  // Empresa
  company?: string
  position?: string
  
  // Avatar
  profile_picture_url?: string
  avatar_url?: string
  
  // Endereço
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  
  // Campos customizados
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
  lifetime_value?: number
  last_order_at?: string
  
  // Status
  is_blocked: boolean
  blocked_reason?: string
  blocked_at?: string
  
  // Subscriptions
  is_subscribed_email?: boolean
  is_subscribed_sms?: boolean
  is_subscribed_whatsapp?: boolean
  
  // Origem
  source?: 'organic' | 'campaign' | 'import' | 'manual' | 'whatsapp' | 'shopify'
  source_campaign_id?: string
  first_contact_channel?: string
  
  // Métricas WhatsApp
  first_message_at?: string
  last_message_at?: string
  total_conversations: number
  total_messages_received: number
  total_messages_sent: number
  
  // Contexto
  last_conversation_id?: string
  
  // Contagens relacionadas
  deals_count?: number
  deals_won_count?: number
  deals_open_count?: number
  tasks_pending_count?: number
  invoices_count?: number
  
  created_at: string
  updated_at?: string
}

// Conversa
export interface InboxConversation {
  id: string
  organization_id: string
  store_id?: string // Loja associada
  contact_id: string
  unified_contact_id?: string // Novo campo para tabela contacts
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
  
  // IA (Agentes)
  ai_enabled?: boolean
  ai_agent_id?: string
  ai_disabled_at?: string
  ai_disabled_reason?: string
  
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

// Nota (compatibilidade com API antiga)
export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important' | 'note'
  is_pinned: boolean
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}

// Comentário (nova tabela contact_comments)
export interface InboxComment {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  deal_id?: string
  task_id?: string
  
  content: string
  comment_type: 'note' | 'call_log' | 'meeting_note' | 'important' | 'follow_up'
  
  is_pinned: boolean
  pinned_at?: string
  pinned_by?: string
  
  mentions: string[]
  
  created_by: string
  created_by_name?: string
  created_by_avatar?: string
  
  created_at: string
  updated_at?: string
}

// Atividade (tabela contact_activities)
export interface InboxActivity {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  deal_id?: string
  task_id?: string
  invoice_id?: string
  order_id?: string
  
  activity_type: 
    // Conversas
    | 'conversation_started' | 'conversation_closed' | 'message_sent' | 'message_received'
    // Bot
    | 'bot_interaction' | 'bot_enabled' | 'bot_disabled'
    // Agentes
    | 'agent_assigned' | 'agent_removed'
    // Tags
    | 'tag_added' | 'tag_removed'
    // Deals
    | 'deal_created' | 'deal_updated' | 'deal_won' | 'deal_lost' | 'deal_stage_changed'
    // Pedidos
    | 'order_placed' | 'order_fulfilled' | 'order_cancelled' | 'cart_abandoned' | 'cart_recovered'
    // Tarefas
    | 'task_created' | 'task_completed' | 'task_assigned'
    // NFs
    | 'invoice_uploaded' | 'invoice_sent'
    // Contato
    | 'contact_created' | 'contact_updated' | 'blocked' | 'unblocked'
    // Campanhas
    | 'campaign_sent' | 'campaign_replied' | 'campaign_clicked'
    // Notas
    | 'note_added' | 'comment_added'
    // Avaliações
    | 'rating_received'
    | string
    
  title: string
  description?: string
  metadata?: Record<string, any>
  
  // Deprecated fields (manter para compatibilidade)
  related_deal_id?: string
  related_campaign_id?: string
  related_order_id?: string
  
  created_by?: string
  created_by_name?: string
  created_at: string
}

// Tarefa
export interface InboxTask {
  id: string
  organization_id: string
  
  // Vinculações
  contact_id?: string
  unified_contact_id?: string
  deal_id?: string
  conversation_id?: string
  ticket_id?: string
  
  // Dados da tarefa
  title: string
  description?: string
  type: 'task' | 'call' | 'email' | 'whatsapp' | 'meeting' | 'followup' | 'payment'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  
  // Agendamento
  due_date: string
  due_time?: string
  all_day?: boolean
  
  // Lembrete
  reminder_at?: string
  reminder_sent?: boolean
  
  // Atribuição
  assigned_to?: string
  assigned_to_name?: string
  assigned_user?: {
    id: string
    first_name: string
    last_name?: string
    avatar_url?: string
  }
  
  created_by?: string
  created_by_name?: string
  
  // Status
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  completed_at?: string
  completed_by?: string
  completed_by_name?: string
  
  // Resultado
  outcome?: string
  outcome_type?: 'success' | 'no_answer' | 'rescheduled' | 'cancelled'
  
  // Contexto
  deal?: InboxDeal
  
  // Calculados
  is_overdue?: boolean
  is_today?: boolean
  
  // Metadata
  tags?: string[]
  metadata?: Record<string, any>
  
  created_at: string
  updated_at?: string
}

// Nota Fiscal
export interface InboxInvoice {
  id: string
  organization_id: string
  contact_id: string
  
  // Contexto
  deal_id?: string
  order_id?: string
  
  // Dados da NF
  invoice_number?: string
  invoice_type: 'nfe' | 'nfce' | 'nfse' | 'outros'
  invoice_series?: string
  invoice_key?: string
  
  // Valores
  total_value: number
  tax_value?: number
  discount_value?: number
  
  // Datas
  issue_date?: string
  due_date?: string
  
  // Status
  status: 'pending' | 'issued' | 'cancelled' | 'rejected'
  
  // Arquivos
  pdf_url?: string
  xml_url?: string
  
  // Dados parseados do XML
  parsed_data?: {
    emitente?: {
      cnpj?: string
      nome?: string
      endereco?: string
    }
    destinatario?: {
      cpf_cnpj?: string
      nome?: string
      endereco?: string
    }
    itens?: Array<{
      descricao: string
      quantidade: number
      valor_unitario: number
      valor_total: number
    }>
    impostos?: {
      icms?: number
      ipi?: number
      pis?: number
      cofins?: number
    }
  }
  
  // Notas
  notes?: string
  metadata?: Record<string, any>
  
  // Quem enviou
  uploaded_by?: string
  uploaded_by_name?: string
  
  created_at: string
  updated_at?: string
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
    color?: string
  }
  stage?: {
    id: string
    name: string
    color: string
    is_won?: boolean
    is_lost?: boolean
  }
}

// Filtros de conversa
export interface ConversationFilters {
  status?: 'all' | 'open' | 'pending' | 'closed'
  assignedTo?: 'all' | 'me' | 'unassigned' | string
  priority?: 'all' | 'low' | 'normal' | 'high' | 'urgent'
  botActive?: boolean
  aiActive?: boolean
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

// Resposta da API de contato completo
export interface ContactFullResponse {
  contact: InboxContact
  notes: InboxNote[]
  activities: InboxActivity[]
  deals: InboxDeal[]
  tasks: InboxTask[]
  invoices: InboxInvoice[]
  _legacy?: boolean
}
