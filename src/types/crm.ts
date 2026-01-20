// =============================================
// SPRINT 3: TIPOS TYPESCRIPT
// =============================================

// =============================================
// CUSTOMER EVENTS
// =============================================
export type EventType = 
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'checkout_started'
  | 'checkout_completed'
  | 'purchase'
  | 'order_paid'
  | 'order_fulfilled'
  | 'identify'
  | 'custom'

export type EventSource = 'web' | 'app' | 'shopify' | 'api'

export interface CustomerEvent {
  id: string
  organization_id: string
  contact_id?: string
  visitor_id?: string
  customer_email?: string
  customer_phone?: string
  shopify_customer_id?: string
  
  event_type: EventType
  event_source: EventSource
  event_data?: Record<string, any>
  
  product_id?: string
  product_name?: string
  product_price?: number
  product_quantity?: number
  product_category?: string
  
  order_id?: string
  order_total?: number
  
  session_id?: string
  page_url?: string
  referrer_url?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  
  device_type?: 'desktop' | 'mobile' | 'tablet'
  browser?: string
  ip_address?: string
  country?: string
  city?: string
  
  event_timestamp: string
  created_at: string
}

// =============================================
// RFM SCORES
// =============================================
export type RFMSegment = 
  | 'champions'
  | 'loyal'
  | 'potential_loyal'
  | 'new_customers'
  | 'at_risk'
  | 'cant_lose'
  | 'hibernating'
  | 'lost'
  | 'others'

export interface RFMScore {
  id: string
  organization_id: string
  contact_id: string
  
  last_purchase_date?: string
  total_orders: number
  total_spent: number
  avg_order_value: number
  
  recency_score: 1 | 2 | 3 | 4 | 5
  frequency_score: 1 | 2 | 3 | 4 | 5
  monetary_score: 1 | 2 | 3 | 4 | 5
  rfm_score: string // "555", "321", etc
  rfm_segment: RFMSegment
  
  calculation_period_days: number
  calculated_at: string
}

export interface RFMSegmentInfo {
  count: number
  label: string
  color: string
  description: string
}

// =============================================
// SEGMENTS
// =============================================
export type SegmentType = 'static' | 'dynamic' | 'rfm'

export type RuleOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_null'
  | 'is_not_null'
  | 'in'
  | 'not_in'

export interface SegmentRule {
  field: string
  operator: RuleOperator
  value: any
}

export interface CustomerSegment {
  id: string
  organization_id: string
  name: string
  description?: string
  color: string
  icon: string
  
  segment_type: SegmentType
  rules: SegmentRule[]
  rules_logic: 'AND' | 'OR'
  rfm_segments?: RFMSegment[]
  
  contact_count: number
  last_count_at?: string
  is_active: boolean
  
  created_at: string
  updated_at: string
  created_by?: string
}

// =============================================
// PLAYBOOKS
// =============================================
export type PlaybookCategory = 
  | 'abandoned_cart'
  | 'winback'
  | 'welcome'
  | 'post_purchase'
  | 'birthday'
  | 'reactivation'
  | 'upsell'
  | 'custom'

export type PlaybookTriggerType = 
  | 'event'
  | 'schedule'
  | 'segment_entry'
  | 'manual'

export type PlaybookStepType = 
  | 'wait'
  | 'send_whatsapp'
  | 'send_email'
  | 'send_sms'
  | 'condition'
  | 'split'
  | 'update_contact'
  | 'add_tag'
  | 'remove_tag'
  | 'webhook'
  | 'end'

export interface PlaybookStep {
  id: string
  type: PlaybookStepType
  config: Record<string, any>
  next?: string
}

export interface PlaybookTriggerConfig {
  event_type?: EventType
  delay_minutes?: number
  schedule?: string
  segment_id?: string
  condition?: string
}

export interface PlaybookSettings {
  max_per_contact?: number
  cooldown_days?: number
  exclude_segments?: string[]
  working_hours?: {
    start: string
    end: string
    timezone: string
  }
}

export interface AutomationPlaybook {
  id: string
  organization_id?: string
  name: string
  description?: string
  category: PlaybookCategory
  
  is_template: boolean
  is_active: boolean
  
  trigger_type: PlaybookTriggerType
  trigger_config: PlaybookTriggerConfig
  steps: PlaybookStep[]
  settings: PlaybookSettings
  
  total_runs: number
  total_conversions: number
  total_revenue: number
  
  created_at: string
  updated_at: string
  created_by?: string
}

// =============================================
// PLAYBOOK RUNS
// =============================================
export type PlaybookRunStatus = 
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface PlaybookRun {
  id: string
  organization_id: string
  playbook_id: string
  contact_id: string
  
  status: PlaybookRunStatus
  current_step: number
  triggered_by: 'event' | 'schedule' | 'manual'
  trigger_event_id?: string
  
  steps_completed: Array<{
    step_id: string
    completed_at: string
    result?: Record<string, any>
  }>
  
  converted: boolean
  conversion_order_id?: string
  conversion_revenue?: number
  converted_at?: string
  
  started_at: string
  completed_at?: string
  next_step_at?: string
}

// =============================================
// REVENUE ATTRIBUTION
// =============================================
export type AttributionModel = 
  | 'first_touch'
  | 'last_touch'
  | 'linear'
  | 'time_decay'

export interface ChannelAttribution {
  channel: 'whatsapp' | 'email' | 'sms' | 'web' | 'ads'
  campaign_id?: string
  weight: number
  revenue: number
}

export interface Touchpoint {
  channel: string
  timestamp: string
  campaign_id?: string
  event_id?: string
}

export interface RevenueAttribution {
  id: string
  organization_id: string
  
  order_id: string
  order_total: number
  order_date: string
  
  contact_id?: string
  customer_email?: string
  
  attribution_model: AttributionModel
  channels: ChannelAttribution[]
  touchpoints: Touchpoint[]
  
  playbook_id?: string
  playbook_run_id?: string
  
  created_at: string
}

// =============================================
// API RESPONSES
// =============================================
export interface RFMSummaryResponse {
  summary: Record<RFMSegment, RFMSegmentInfo>
  total_contacts: number
  total_revenue: number
  last_calculated?: string
}

export interface PlaybookMetrics {
  total_runs: number
  completed: number
  converted: number
  total_revenue: number
  conversion_rate?: number
}
