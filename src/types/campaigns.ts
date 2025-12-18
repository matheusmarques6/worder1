// =====================================================
// CAMPANHAS WHATSAPP - TIPOS TYPESCRIPT
// =====================================================

// Template HSM
export interface WhatsAppTemplate {
  id: string
  organization_id: string
  instance_id?: string
  meta_template_id?: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status: 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled'
  rejection_reason?: string
  header_type?: 'none' | 'text' | 'image' | 'video' | 'document'
  header_text?: string
  header_media_url?: string
  body_text: string
  body_variables: number
  footer_text?: string
  buttons: TemplateButton[]
  use_count: number
  last_used_at?: string
  created_at: string
  updated_at?: string
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  url?: string
  phone_number?: string
}

// Segmento de audiência
export interface WhatsAppSegment {
  id: string
  organization_id: string
  name: string
  description?: string
  filters: SegmentFilters
  contact_count: number
  last_calculated_at?: string
  is_dynamic: boolean
  created_by?: string
  created_at: string
  updated_at?: string
}

export interface SegmentFilters {
  tags?: string[]
  hasOrders?: boolean
  minSpent?: number
  maxSpent?: number
  lastMessageDays?: number
  source?: string
  cities?: string[]
  excludeTags?: string[]
}

// Campanha
export interface WhatsAppCampaign {
  id: string
  organization_id: string
  instance_id?: string
  name: string
  description?: string
  type: CampaignType
  status: CampaignStatus
  
  // Template
  template_id?: string
  template_name?: string
  template_variables: Record<string, TemplateVariable>
  template?: WhatsAppTemplate
  
  // Mídia
  media_url?: string
  media_type?: 'image' | 'video' | 'document'
  
  // Audiência
  audience_type: AudienceType
  audience_tags?: string[]
  audience_segment_id?: string
  audience_filters?: SegmentFilters
  audience_count: number
  imported_contacts?: ImportedContact[]
  
  // Agendamento
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  timezone: string
  
  // Rate limiting
  messages_per_second: number
  batch_size: number
  delay_between_batches: number
  
  // Métricas
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_read: number
  total_clicked: number
  total_replied: number
  total_failed: number
  total_opted_out: number
  
  // Atribuição
  attributed_revenue: number
  attributed_orders: number
  attribution_window_hours: number
  
  // Custo
  cost_per_message: number
  total_cost: number
  
  // Meta
  created_by?: string
  created_by_name?: string
  updated_by?: string
  created_at: string
  updated_at?: string
}

export type CampaignType = 'broadcast' | 'automated' | 'recurring'

export type CampaignStatus = 
  | 'draft' 
  | 'scheduled' 
  | 'running' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled'

export type AudienceType = 'all' | 'tags' | 'segment' | 'import'

export interface TemplateVariable {
  type: 'field' | 'static'
  value: string // 'name', 'phone', 'email' ou valor estático
}

export interface ImportedContact {
  phone: string
  name?: string
  variables?: Record<string, string>
}

// Destinatário da campanha
export interface CampaignRecipient {
  id: string
  campaign_id: string
  contact_id?: string
  phone_number: string
  contact_name?: string
  status: RecipientStatus
  
  // Timestamps
  queued_at?: string
  sent_at?: string
  delivered_at?: string
  read_at?: string
  clicked_at?: string
  replied_at?: string
  failed_at?: string
  opted_out_at?: string
  
  // Erro
  error_code?: string
  error_message?: string
  retry_count: number
  
  // Mensagem
  message_id?: string
  meta_message_id?: string
  
  // Variáveis
  resolved_variables: Record<string, string>
  
  // Conversão
  conversion_value?: number
  conversion_order_id?: string
  converted_at?: string
  
  created_at: string
}

export type RecipientStatus = 
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'clicked'
  | 'replied'
  | 'failed'
  | 'opted_out'

// Log da campanha
export interface CampaignLog {
  id: string
  campaign_id: string
  log_type: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: Record<string, any>
  created_at: string
}

// =====================================================
// TIPOS PARA FORMULÁRIOS
// =====================================================

export interface CreateCampaignInput {
  name: string
  description?: string
  type: CampaignType
  template_id?: string
  template_variables?: Record<string, TemplateVariable>
  media_url?: string
  media_type?: string
  audience_type: AudienceType
  audience_tags?: string[]
  audience_segment_id?: string
  audience_filters?: SegmentFilters
  imported_contacts?: ImportedContact[]
  scheduled_at?: string
  timezone?: string
  messages_per_second?: number
}

export interface UpdateCampaignInput {
  name?: string
  description?: string
  template_id?: string
  template_variables?: Record<string, TemplateVariable>
  media_url?: string
  media_type?: string
  audience_type?: AudienceType
  audience_tags?: string[]
  audience_segment_id?: string
  audience_filters?: SegmentFilters
  scheduled_at?: string
  timezone?: string
}

// =====================================================
// TIPOS PARA ANALYTICS
// =====================================================

export interface CampaignAnalytics {
  campaign: WhatsAppCampaign
  metrics: CampaignMetrics
  timeline: TimelinePoint[]
  topPerformers?: RecipientPerformance[]
  errors?: ErrorSummary[]
}

export interface CampaignMetrics {
  deliveryRate: number // % entregues
  readRate: number // % lidas (de entregues)
  clickRate: number // % cliques (de entregues)
  replyRate: number // % respostas (de entregues)
  failureRate: number // % falhas
  optOutRate: number // % opt-outs
  roi?: number // Se tiver atribuição de receita
}

export interface TimelinePoint {
  timestamp: string
  sent: number
  delivered: number
  read: number
  clicked: number
  replied: number
}

export interface RecipientPerformance {
  contact_id: string
  contact_name: string
  phone_number: string
  status: RecipientStatus
  conversion_value?: number
}

export interface ErrorSummary {
  error_code: string
  error_message: string
  count: number
  percentage: number
}

// =====================================================
// TIPOS PARA API
// =====================================================

export interface CampaignsListParams {
  organizationId: string
  status?: CampaignStatus
  type?: CampaignType
  search?: string
  page?: number
  limit?: number
}

export interface CampaignsListResponse {
  campaigns: WhatsAppCampaign[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface TemplatesListParams {
  organizationId: string
  category?: string
  status?: string
  search?: string
}

export interface AudienceEstimateParams {
  organizationId: string
  type: AudienceType
  tags?: string[]
  segmentId?: string
  filters?: SegmentFilters
}

export interface AudienceEstimateResponse {
  count: number
  estimatedCost: number
  tags?: { name: string; count: number }[]
}

// =====================================================
// WIZARD STATE
// =====================================================

export interface CampaignWizardState {
  step: 1 | 2 | 3 | 4
  
  // Step 1: Details
  name: string
  description: string
  type: CampaignType
  
  // Step 2: Audience
  audienceType: AudienceType
  selectedTags: string[]
  selectedSegmentId?: string
  customFilters?: SegmentFilters
  importedContacts?: ImportedContact[]
  estimatedAudience: number
  
  // Step 3: Message
  selectedTemplateId?: string
  selectedTemplate?: WhatsAppTemplate
  templateVariables: Record<string, TemplateVariable>
  mediaUrl?: string
  mediaType?: string
  
  // Step 4: Schedule
  sendNow: boolean
  scheduledDate?: Date
  scheduledTime?: string
  timezone: string
  
  // Validation
  isValid: boolean
  errors: Record<string, string>
}
