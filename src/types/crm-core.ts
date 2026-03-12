import type { User } from './auth';

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
  // Analytics / Computed
  total_revenue?: number;
  total_page_views?: number;
  last_page_view_at?: string;
  total_sessions?: number;
  last_session_at?: string;
  browser?: string;
  device?: string;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  ip_address?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  notes?: string;
  status?: string;
  type?: string;
  score?: number;
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
  commit_level?: 'omit' | 'pipeline' | 'best_case' | 'commit';
  forecast_category?: string;
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
  commit_level?: 'omit' | 'pipeline' | 'best_case' | 'commit';
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
