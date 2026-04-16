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

// ---- Deal Activity Type (use DealActivity from crm-core.ts) ----
export type DealActivityType = 'note' | 'call' | 'email' | 'meeting' | 'task' | 'stage_change' | 'value_change' | 'custom'

// ---- AI Knowledge Source ----
export type AiSourceType = 'file' | 'url' | 'text' | 'faq' | 'shopify_products' | 'shopify_policies'
export type AiSourceStatus = 'pending' | 'processing' | 'ready' | 'error'

export interface AiKnowledgeSource {
  id: string
  agent_id: string
  organization_id: string
  name: string
  source_type: AiSourceType
  status: AiSourceStatus
  chunks_count: number
  file_size?: number | null
  error_message?: string | null
  created_at: string
}

// ---- Billing ----
export type BillingPlan = 'free' | 'starter' | 'pro' | 'business' | 'enterprise'

// ---- Attribution ----
export interface AttributionTouchpoint {
  id: string
  organization_id: string
  contact_id?: string | null
  visitor_id?: string | null
  touchpoint_type: 'first' | 'last' | 'assist'
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  gclid?: string | null
  fbclid?: string | null
  ttclid?: string | null
  occurred_at: string
  order_id?: string | null
  revenue?: number | null
  currency?: string
}
