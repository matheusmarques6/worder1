export interface DashboardMetrics {
  email_revenue: number;
  email_revenue_change: number;
  email_orders: number;
  email_orders_change: number;
  email_conversion_rate: number;
  email_conversion_rate_change: number;

  total_revenue: number;
  total_revenue_change: number;
  total_orders: number;
  total_orders_change: number;
  average_order_value: number;
  aov_change: number;

  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;

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
