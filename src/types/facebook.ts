/**
 * TIPOS TYPESCRIPT - INTEGRAÇÃO META/FACEBOOK
 * 
 * Tipos para contas, campanhas, ad sets, ads e métricas
 */

// ==================== ENTIDADES ====================

export interface MetaAdAccount {
  id: string;                      // UUID interno
  ad_account_id: string;           // ID no Meta (sem "act_")
  ad_account_name: string;
  currency: string;
  timezone: string;
  status: 'connected' | 'expired' | 'error' | 'disconnected';
  is_active: boolean;
  last_sync_at: string | null;
  connected_at: string;
  token_expires_at: string | null;
  meta_user_id: string | null;
  meta_user_name: string | null;
  business_id: string | null;
  business_name: string | null;
  warnings?: {
    token_expiring_soon: boolean;
    token_expired: boolean;
  };
}

export interface MetaCampaign {
  id: string;                      // ID no Meta
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  objective: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  created_time?: string;
  metrics: CampaignMetrics;
  account_id: string;              // UUID da conta interna
  account_name: string;
  ad_account_id: string;           // ID da conta no Meta
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  campaign_id: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  optimization_goal: string;
  metrics: AdSetMetrics;
  targeting_summary?: TargetingSummary;
}

export interface MetaAd {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  adset_id: string;
  creative: {
    id: string;
    thumbnail_url: string | null;
    title: string | null;
    body: string | null;
  } | null;
  metrics: AdMetrics;
}

// ==================== MÉTRICAS ====================

export interface BaseMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

export interface ConversionMetrics {
  purchases: number;
  purchaseValue: number;
  costPerPurchase: number;
  roas: number;
}

export interface CampaignMetrics extends BaseMetrics, ConversionMetrics {
  reach?: number;
  frequency?: number;
}

export interface AdSetMetrics extends BaseMetrics, ConversionMetrics {}

export interface AdMetrics extends BaseMetrics, ConversionMetrics {}

// ==================== AGREGAÇÕES ====================

export interface KPIs {
  spend: MetricWithComparison;
  impressions: MetricWithComparison;
  clicks: MetricWithComparison;
  ctr: MetricWithComparison;
  cpc: MetricWithComparison;
  purchases: MetricWithComparison;
  revenue: MetricWithComparison;
  roas: MetricWithComparison;
  cpa: MetricWithComparison;
}

export interface MetricWithComparison {
  value: number;
  previous?: number;
  change_percent?: number;
}

export interface AccountBreakdown {
  account_id: string;
  account_name: string;
  ad_account_id: string;
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  share_spend?: number;           // Percentual do gasto total
  campaigns_count?: number;
  error?: string;
  needs_reconnect?: boolean;
}

export interface DailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number;
  purchases: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  ctr?: number;
  cpc?: number;
}

// ==================== FILTROS ====================

export interface DateRange {
  from: string;                   // YYYY-MM-DD
  to: string;
}

export type StatusFilter = 'all' | 'active' | 'paused';

export type ViewLevel = 'campaigns' | 'adsets' | 'ads';

export type ObjectType = 'campaign' | 'adset' | 'ad';

// ==================== API RESPONSES ====================

export interface AccountsResponse {
  accounts: MetaAdAccount[];
  total: number;
  store?: {
    id: string;
    name: string;
  };
}

export interface CampaignsResponse {
  campaigns: MetaCampaign[];
  totals: Totals | null;
  by_account: AccountBreakdown[];
  meta: {
    date_from: string;
    date_to: string;
    accounts_count: number;
    campaigns_count: number;
  };
}

export interface InsightsResponse {
  kpis: KPIs | null;
  daily: DailyMetric[];
  by_account: AccountBreakdown[];
}

export interface AdSetsResponse {
  adsets: MetaAdSet[];
  totals: {
    spend: number;
    purchases: number;
    revenue?: number;
    roas: number;
  };
  campaign: {
    id: string;
    name: string;
    status?: string;
    objective?: string;
  };
  meta: {
    date_from: string;
    date_to: string;
    adsets_count: number;
  };
}

export interface AdsResponse {
  ads: MetaAd[];
  totals: {
    spend: number;
    purchases: number;
    revenue?: number;
    roas: number;
  };
  adset: {
    id: string;
    name: string;
    status?: string;
    campaign_id?: string;
  };
  meta: {
    date_from: string;
    date_to: string;
    ads_count: number;
  };
}

export interface StatusToggleResponse {
  success: boolean;
  object_id?: string;
  object_type?: ObjectType;
  new_status?: 'ACTIVE' | 'PAUSED';
  message?: string;
  error?: string;
  needs_reconnect?: boolean;
}

export interface SyncResponse {
  success: boolean;
  summary: {
    accounts: {
      total: number;
      updated: number;
      errors: number;
      expired?: number;
    };
    pixels: {
      total: number;
      updated: number;
      new: number;
    };
  };
  synced_at: string;
}

// ==================== TARGETING ====================

export interface TargetingSummary {
  age_min?: number;
  age_max?: number;
  genders?: ('male' | 'female')[];
  geo_locations?: string[];
}

// ==================== PRESETS DE DATA ====================

export interface DatePreset {
  label: string;
  getValue: () => DateRange;
}

export const DATE_PRESETS: DatePreset[] = [
  {
    label: 'Hoje',
    getValue: () => {
      const today = new Date().toISOString().split('T')[0];
      return { from: today, to: today };
    }
  },
  {
    label: 'Ontem',
    getValue: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = yesterday.toISOString().split('T')[0];
      return { from: date, to: date };
    }
  },
  {
    label: 'Últimos 7 dias',
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0]
      };
    }
  },
  {
    label: 'Últimos 14 dias',
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 14);
      return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0]
      };
    }
  },
  {
    label: 'Últimos 30 dias',
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0]
      };
    }
  },
  {
    label: 'Este mês',
    getValue: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: from.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0]
      };
    }
  },
  {
    label: 'Mês passado',
    getValue: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0]
      };
    }
  }
];

// ==================== HELPERS ====================

export function getDefaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function formatDateRange(range: DateRange): string {
  const from = new Date(range.from + 'T00:00:00');
  const to = new Date(range.to + 'T00:00:00');
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short' 
    });
  };
  
  if (range.from === range.to) {
    return formatDate(from);
  }
  
  return `${formatDate(from)} - ${formatDate(to)}`;
}
