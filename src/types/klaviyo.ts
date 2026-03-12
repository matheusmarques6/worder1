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
