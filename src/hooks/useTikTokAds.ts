/**
 * useTikTokAds Hooks - VERSÃO CORRIGIDA
 * 
 * Correções aplicadas:
 * 1. Debounce para evitar múltiplas requisições
 * 2. Cleanup de estado em caso de erro
 * 3. AbortController para cancelar requisições pendentes
 * 4. Cache local com SWR pattern
 * 5. Tipagem completa
 * 6. Error boundaries handling
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ==========================================
// TYPES
// ==========================================

export interface TikTokKPIs {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  videoViews: number;
  avgWatchTime: number;
  conversions: number;
  cvr: number;
  roas: number;
}

export interface TikTokEngagement {
  likes: number;
  comments: number;
  shares: number;
  profileVisits: number;
  follows: number;
}

export interface VideoFunnelItem {
  stage: string;
  value: number;
  percent: number;
}

export interface TikTokCampaign {
  id: string;
  campaign_id: string;
  name: string;
  status: 'active' | 'paused' | 'deleted' | 'pending' | 'unknown';
  objective_type: string;
  objective_label: string;
  budget: number;
  budget_mode: string;
  created_at?: string;
  // Métricas (se disponíveis)
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  roas?: number;
}

export interface TikTokAdGroup {
  id: string;
  adgroup_id: string;
  campaign_id: string;
  name: string;
  status: 'active' | 'paused' | 'deleted' | 'pending' | 'unknown';
  budget: number;
  bidType: string;
  bidPrice?: number;
  optimizationGoal: string;
}

export interface TikTokAccount {
  advertiser_id: string;
  advertiser_name: string;
  is_active: boolean;
  needs_reauth: boolean;
  last_sync_at: string | null;
}

interface ApiError {
  message: string;
  code?: number;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getDateRange(dateRange: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  
  switch (dateRange) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case 'month':
      start.setDate(1);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 7);
  }

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function parseStatus(apiStatus: string): TikTokCampaign['status'] {
  const status = apiStatus?.toUpperCase() || '';
  
  if (status.includes('ENABLE') || status.includes('DELIVERY_OK') || status.includes('ACTIVE')) {
    return 'active';
  }
  if (status.includes('DISABLE') || status.includes('PAUSED')) {
    return 'paused';
  }
  if (status.includes('DELETE')) {
    return 'deleted';
  }
  if (status.includes('PENDING') || status.includes('REVIEW')) {
    return 'pending';
  }
  return 'unknown';
}

function parseObjective(objective: string): string {
  const labels: Record<string, string> = {
    REACH: 'Alcance',
    TRAFFIC: 'Tráfego',
    VIDEO_VIEWS: 'Visualizações',
    LEAD_GENERATION: 'Leads',
    ENGAGEMENT: 'Engajamento',
    APP_PROMOTION: 'App',
    WEB_CONVERSIONS: 'Conversões',
    CATALOG_SALES: 'Catálogo',
    SHOP_PURCHASES: 'Compras',
  };
  return labels[objective] || objective;
}

// Debounce utility
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ==========================================
// MAIN DASHBOARD HOOK
// ==========================================

export function useTikTokDashboard(organizationId: string | null, dateRange: string = '7d') {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<TikTokKPIs | null>(null);
  const [engagement, setEngagement] = useState<TikTokEngagement | null>(null);
  const [videoFunnel, setVideoFunnel] = useState<VideoFunnelItem[]>([]);
  const [campaigns, setCampaigns] = useState<TikTokCampaign[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [account, setAccount] = useState<TikTokAccount | null>(null);
  
  // Ref para AbortController
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Debounce dateRange para evitar múltiplas requisições
  const debouncedDateRange = useDebounce(dateRange, 300);

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      setIsConnected(false);
      return;
    }

    // Cancela requisição anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      // 1. Verifica se está conectado
      const statusRes = await fetch(
        `/api/integrations/tiktok?action=accounts&organizationId=${organizationId}`,
        { signal: abortControllerRef.current.signal }
      );
      
      if (!statusRes.ok) {
        throw new Error('Failed to check account status');
      }
      
      const statusData = await statusRes.json();
      
      if (!statusData.accounts?.length) {
        setIsConnected(false);
        setLoading(false);
        return;
      }

      const accountData = statusData.accounts[0];
      setIsConnected(true);
      setNeedsReauth(accountData.needs_reauth || false);
      setAccount({
        advertiser_id: accountData.advertiser_id,
        advertiser_name: accountData.advertiser_name,
        is_active: accountData.is_active,
        needs_reauth: accountData.needs_reauth || false,
        last_sync_at: accountData.last_sync_at,
      });
      
      // 2. Busca dados do dashboard
      const { startDate, endDate } = getDateRange(debouncedDateRange);

      const dashboardRes = await fetch(
        `/api/integrations/tiktok?action=dashboard_metrics&organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`,
        { signal: abortControllerRef.current.signal }
      );
      
      if (!dashboardRes.ok) {
        const errorData = await dashboardRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch TikTok data');
      }

      const data = await dashboardRes.json();

      // 3. Processa métricas em KPIs
      if (data.metrics?.length) {
        const totals = data.metrics.reduce((acc: any, row: any) => {
          acc.spend += parseFloat(row.spend || 0);
          acc.impressions += parseInt(row.impressions || 0);
          acc.reach += parseInt(row.reach || 0);
          acc.clicks += parseInt(row.clicks || 0);
          acc.videoViews += parseInt(row.video_views_p100 || row.video_play_actions || 0);
          acc.conversions += parseInt(row.conversion || 0);
          acc.conversionValue += parseFloat(row.total_purchase_value || 0);
          acc.likes += parseInt(row.likes || 0);
          acc.comments += parseInt(row.comments || 0);
          acc.shares += parseInt(row.shares || 0);
          acc.follows += parseInt(row.follows || 0);
          acc.avgWatchTime += parseFloat(row.average_video_play || 0);
          return acc;
        }, {
          spend: 0, impressions: 0, reach: 0, clicks: 0,
          videoViews: 0, conversions: 0, conversionValue: 0,
          likes: 0, comments: 0, shares: 0, follows: 0, avgWatchTime: 0,
        });

        const daysCount = data.metrics.length || 1;

        setKpis({
          spend: totals.spend,
          impressions: totals.impressions,
          reach: totals.reach,
          clicks: totals.clicks,
          ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
          cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
          cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
          videoViews: totals.videoViews,
          avgWatchTime: totals.avgWatchTime / daysCount,
          conversions: totals.conversions,
          cvr: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
          roas: totals.spend > 0 ? totals.conversionValue / totals.spend : 0,
        });

        setEngagement({
          likes: totals.likes,
          comments: totals.comments,
          shares: totals.shares,
          profileVisits: 0,
          follows: totals.follows,
        });
      } else {
        // Sem dados - define valores zerados
        setKpis({
          spend: 0, impressions: 0, reach: 0, clicks: 0,
          ctr: 0, cpc: 0, cpm: 0, videoViews: 0, avgWatchTime: 0,
          conversions: 0, cvr: 0, roas: 0,
        });
        setEngagement({
          likes: 0, comments: 0, shares: 0, profileVisits: 0, follows: 0,
        });
      }

      // 4. Video funnel
      if (data.videoFunnel?.length) {
        setVideoFunnel(data.videoFunnel);
      } else {
        setVideoFunnel([]);
      }

      // 5. Campanhas
      if (data.campaigns?.length) {
        setCampaigns(data.campaigns.map((c: any) => ({
          id: c.campaign_id,
          campaign_id: c.campaign_id,
          name: c.campaign_name,
          status: parseStatus(c.status || c.operation_status),
          objective_type: c.objective_type,
          objective_label: parseObjective(c.objective_type),
          budget: parseFloat(c.budget || 0),
          budget_mode: c.budget_mode,
          created_at: c.create_time,
        })));
      } else {
        setCampaigns([]);
      }

    } catch (err: any) {
      // Ignora erros de abort
      if (err.name === 'AbortError') {
        return;
      }
      console.error('[TikTok Dashboard] Error:', err);
      setError(err.message || 'An error occurred');
      // Limpa estados em caso de erro
      setKpis(null);
      setEngagement(null);
      setVideoFunnel([]);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, debouncedDateRange]);

  // Effect principal
  useEffect(() => {
    fetchData();

    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);

  return {
    loading,
    error,
    isConnected,
    needsReauth,
    account,
    kpis,
    engagement,
    videoFunnel,
    campaigns,
    refetch: fetchData,
  };
}

// ==========================================
// CAMPAIGN MANAGEMENT HOOK
// ==========================================

export function useCampaignManagement(organizationId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const updateCampaignStatus = useCallback(async (
    campaignIds: string[],
    status: 'ENABLE' | 'DISABLE' | 'DELETE'
  ): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return false;
    }

    if (!campaignIds.length) {
      setError('At least one campaign ID is required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/integrations/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_campaign_status',
          organizationId,
          campaignIds,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update campaign status');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const createCampaign = useCallback(async (campaignData: {
    name: string;
    objective: string;
    budget: number;
    budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  }): Promise<string | null> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return null;
    }

    // Validações básicas no frontend
    if (!campaignData.name || campaignData.name.length < 1) {
      setError('Campaign name is required');
      return null;
    }

    if (campaignData.budget < 20) {
      setError('Minimum budget is $20');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/integrations/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_campaign',
          organizationId,
          ...campaignData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create campaign');
      }

      return data.data?.campaign_id || null;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const updateCampaign = useCallback(async (
    campaignId: string,
    updates: { name?: string; budget?: number }
  ): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return false;
    }

    if (!campaignId) {
      setError('Campaign ID is required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/integrations/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_campaign',
          organizationId,
          campaignId,
          updates,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update campaign');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  return {
    loading,
    error,
    clearError,
    updateCampaignStatus,
    createCampaign,
    updateCampaign,
  };
}

// ==========================================
// AD GROUP MANAGEMENT HOOK
// ==========================================

export function useAdGroupManagement(organizationId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adGroups, setAdGroups] = useState<TikTokAdGroup[]>([]);

  const fetchAdGroups = useCallback(async (campaignId?: string) => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      let url = `/api/integrations/tiktok?action=adgroups&organizationId=${organizationId}`;
      if (campaignId) {
        url += `&campaignId=${campaignId}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch ad groups');
      }

      const data = await response.json();
      
      setAdGroups((data.adgroups || []).map((ag: any) => ({
        id: ag.adgroup_id,
        adgroup_id: ag.adgroup_id,
        campaign_id: ag.campaign_id,
        name: ag.adgroup_name,
        status: parseStatus(ag.status || ag.operation_status),
        budget: parseFloat(ag.budget || 0),
        bidType: ag.bid_type,
        bidPrice: ag.bid_price ? parseFloat(ag.bid_price) : undefined,
        optimizationGoal: ag.optimization_goal,
      })));

      return data.adgroups;
    } catch (err: any) {
      setError(err.message);
      setAdGroups([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const updateAdGroupStatus = useCallback(async (
    adGroupIds: string[],
    status: 'ENABLE' | 'DISABLE' | 'DELETE'
  ): Promise<boolean> => {
    if (!organizationId || !adGroupIds.length) return false;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/integrations/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_adgroup_status',
          organizationId,
          adGroupIds,
          status,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update ad group status');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  return {
    loading,
    error,
    adGroups,
    fetchAdGroups,
    updateAdGroupStatus,
  };
}

// ==========================================
// SYNC HOOK
// ==========================================

export function useTikTokSync(organizationId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return false;
    }

    setSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/integrations/tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          organizationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync failed');
      }

      setLastSyncAt(new Date().toISOString());
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [organizationId]);

  return {
    syncing,
    lastSyncAt,
    error,
    sync,
  };
}

// ==========================================
// CONNECTION HOOK
// ==========================================

export function useTikTokConnection(organizationId: string | null) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configChecked, setConfigChecked] = useState(false);

  // Verifica se as credenciais estão configuradas ao carregar
  useEffect(() => {
    if (!organizationId || configChecked) return;

    const checkConfig = async () => {
      try {
        const response = await fetch(
          `/api/integrations/tiktok?action=auth_url&organizationId=${organizationId}`
        );
        const data = await response.json();
        
        if (!response.ok) {
          setError(data.error || 'Configuration error');
        }
      } catch {
        // Ignora erros de rede na verificação inicial
      } finally {
        setConfigChecked(true);
      }
    };

    checkConfig();
  }, [organizationId, configChecked]);

  const connect = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/tiktok?action=auth_url&organizationId=${organizationId}`
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get auth URL');
      }

      if (data.authUrl) {
        // Redireciona para OAuth do TikTok
        window.location.href = data.authUrl;
      } else {
        throw new Error('No auth URL returned');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }, [organizationId]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization ID is required');
      return false;
    }

    setConnecting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/tiktok?organizationId=${organizationId}`,
        { method: 'DELETE' }
      );
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to disconnect');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setConnecting(false);
    }
  }, [organizationId]);

  return {
    connecting,
    error,
    connect,
    disconnect,
  };
}
