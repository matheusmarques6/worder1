/**
 * META/FACEBOOK GRAPH API HELPERS
 * 
 * Funções utilitárias para interagir com a Graph API do Facebook/Meta
 */

import { createServerClient } from '@/lib/supabase';

// ============================================
// CONSTANTES
// ============================================

export const META_API_VERSION = 'v19.0';
export const META_API_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ============================================
// TIPOS
// ============================================

export interface MetaApiError {
  code: number;
  message: string;
  type: string;
  fbtrace_id?: string;
}

export interface MetaInsight {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal: string;
  targeting?: any;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    title?: string;
    body?: string;
  };
}

export interface MetaAccount {
  id: string;
  ad_account_id: string;
  ad_account_name: string;
  access_token: string;
  currency: string;
  timezone: string;
  store_id: string | null;
  is_active: boolean;
  status: string;
}

export interface PurchaseMetrics {
  purchases: number;
  purchaseValue: number;
  costPerPurchase: number;
  roas: number;
}

// ============================================
// CLASSE PRINCIPAL
// ============================================

export class MetaApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Faz uma requisição GET para a Graph API
   */
  async get<T = any>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${META_API_URL}${endpoint}`);
    url.searchParams.set('access_token', this.accessToken);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error) {
      const error = data.error as MetaApiError;
      throw new MetaApiClientError(error.message, error.code, error.type);
    }

    return data;
  }

  /**
   * Faz uma requisição POST para a Graph API
   */
  async post<T = any>(endpoint: string, body: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${META_API_URL}${endpoint}`);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        access_token: this.accessToken,
      }),
    });

    const data = await response.json();

    if (data.error) {
      const error = data.error as MetaApiError;
      throw new MetaApiClientError(error.message, error.code, error.type);
    }

    return data;
  }

  /**
   * Busca campanhas de uma conta
   */
  async getCampaigns(adAccountId: string): Promise<MetaCampaign[]> {
    const data = await this.get<{ data: MetaCampaign[] }>(
      `/act_${adAccountId}/campaigns`,
      {
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time',
        limit: '500',
      }
    );
    return data.data || [];
  }

  /**
   * Busca insights de um objeto (conta, campanha, adset, ad)
   */
  async getInsights(
    objectId: string,
    dateFrom: string,
    dateTo: string,
    level?: 'account' | 'campaign' | 'adset' | 'ad'
  ): Promise<MetaInsight[]> {
    const params: Record<string, string> = {
      fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,cost_per_action_type',
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    };

    if (level) {
      params.level = level;
    }

    const data = await this.get<{ data: MetaInsight[] }>(
      `/${objectId}/insights`,
      params
    );

    return data.data || [];
  }

  /**
   * Busca ad sets de uma campanha
   */
  async getAdSets(campaignId: string): Promise<MetaAdSet[]> {
    const data = await this.get<{ data: MetaAdSet[] }>(
      `/${campaignId}/adsets`,
      {
        fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,targeting',
        limit: '500',
      }
    );
    return data.data || [];
  }

  /**
   * Busca anúncios de um ad set
   */
  async getAds(adsetId: string): Promise<MetaAd[]> {
    const data = await this.get<{ data: MetaAd[] }>(
      `/${adsetId}/ads`,
      {
        fields: 'id,name,status,creative{id,thumbnail_url,title,body}',
        limit: '500',
      }
    );
    return data.data || [];
  }

  /**
   * Atualiza status de um objeto (campanha, adset, ad)
   */
  async updateStatus(objectId: string, status: 'ACTIVE' | 'PAUSED'): Promise<boolean> {
    await this.post(`/${objectId}`, { status });
    return true;
  }
}

// ============================================
// ERRO CUSTOMIZADO
// ============================================

export class MetaApiClientError extends Error {
  code: number;
  type: string;
  needsReconnect: boolean;

  constructor(message: string, code: number, type: string) {
    super(message);
    this.name = 'MetaApiClientError';
    this.code = code;
    this.type = type;
    // Code 190 = token expirado ou inválido
    this.needsReconnect = code === 190;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Extrai métricas de purchase de um insight
 */
export function extractPurchaseMetrics(insight: MetaInsight): PurchaseMetrics {
  const purchasesStr = insight.actions?.find(
    a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
  )?.value || '0';

  const purchaseValueStr = insight.action_values?.find(
    a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
  )?.value || '0';

  const costPerPurchaseStr = insight.cost_per_action_type?.find(
    a => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
  )?.value || '0';

  const purchases = parseInt(purchasesStr);
  const purchaseValue = parseFloat(purchaseValueStr);
  const costPerPurchase = parseFloat(costPerPurchaseStr);
  const spend = parseFloat(insight.spend || '0');
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
    purchases,
    purchaseValue,
    costPerPurchase,
    roas,
  };
}

/**
 * Valida acesso a uma loja
 */
export async function validateStoreAccess(
  storeId: string,
  organizationId: string
): Promise<{ valid: boolean; error?: string }> {
  const supabase = createServerClient();
  
  if (!supabase) {
    return { valid: false, error: 'Database connection not available' };
  }

  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('id', storeId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !store) {
    return { valid: false, error: 'Store not found or access denied' };
  }

  return { valid: true };
}

/**
 * Busca contas Meta ativas de uma loja
 */
export async function getActiveMetaAccounts(
  storeId: string,
  accountIds?: string[]
): Promise<MetaAccount[]> {
  const supabase = createServerClient();
  
  if (!supabase) {
    throw new Error('Database connection not available');
  }

  let query = supabase
    .from('meta_accounts')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('status', 'connected');

  if (accountIds && accountIds.length > 0) {
    query = query.in('id', accountIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch accounts: ${error.message}`);
  }

  return (data || []) as MetaAccount[];
}

/**
 * Formata orçamento do Meta (vem em centavos)
 */
export function formatBudget(budget?: string): number | null {
  if (!budget) return null;
  return parseFloat(budget) / 100;
}

/**
 * Calcula métricas derivadas
 */
export function calculateMetrics(insight: MetaInsight) {
  const spend = parseFloat(insight.spend || '0');
  const impressions = parseInt(insight.impressions || '0');
  const clicks = parseInt(insight.clicks || '0');
  const reach = parseInt(insight.reach || '0');

  return {
    spend,
    impressions,
    clicks,
    reach,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    frequency: reach > 0 ? impressions / reach : 0,
  };
}
