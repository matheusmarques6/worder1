/**
 * HOOKS - INTEGRAÇÃO META/FACEBOOK
 * 
 * Hooks para gerenciar dados do Meta/Facebook Ads
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MetaAdAccount,
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  KPIs,
  AccountBreakdown,
  DailyMetric,
  DateRange,
  StatusFilter,
  Totals,
  AccountsResponse,
  CampaignsResponse,
  InsightsResponse,
  AdSetsResponse,
  AdsResponse,
  StatusToggleResponse,
  SyncResponse,
  ObjectType,
  getDefaultDateRange,
} from '@/types/facebook';

// ==================== useMetaAccounts ====================
// Lista contas vinculadas a uma loja

export function useMetaAccounts(storeId: string | null) {
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!storeId) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/meta/accounts?store_id=${storeId}`);
      const data: AccountsResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error || 'Erro ao carregar contas');
      }

      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const disconnect = useCallback(async (accountId: string) => {
    try {
      const response = await fetch('/api/meta/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, store_id: storeId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao desconectar conta');
      }

      // Refresh list
      await fetchAccounts();
      return { success: true };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Erro' 
      };
    }
  }, [storeId, fetchAccounts]);

  const connect = useCallback(async () => {
    if (!storeId) return;
    
    try {
      // Buscar URL de OAuth
      const response = await fetch(`/api/integrations/meta?action=auth_url&store_id=${storeId}`);
      const data = await response.json();
      
      if (data.authUrl) {
        // Abrir em nova aba
        window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Error getting auth URL:', err);
    }
  }, [storeId]);

  const activeAccounts = accounts.filter(a => a.is_active && a.status === 'connected');

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
    connect,
    disconnect,
    hasAccounts: accounts.length > 0,
    activeAccounts,
    connectedCount: activeAccounts.length,
  };
}

// ==================== useMetaInsights ====================
// KPIs agregados para dashboard

export function useMetaInsights(
  storeId: string | null,
  accountIds: string[],
  dateRange: DateRange,
  compare: boolean = true
) {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [daily, setDaily] = useState<DailyMetric[]>([]);
  const [byAccount, setByAccount] = useState<AccountBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!storeId || accountIds.length === 0) {
      setKpis(null);
      setDaily([]);
      setByAccount([]);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        store_id: storeId,
        account_ids: accountIds.join(','),
        date_from: dateRange.from,
        date_to: dateRange.to,
        compare: compare.toString(),
      });

      const response = await fetch(`/api/meta/insights?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      
      const data: InsightsResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error || 'Erro ao carregar métricas');
      }

      setKpis(data.kpis);
      setDaily(data.daily || []);
      setByAccount(data.by_account || []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [storeId, accountIds, dateRange, compare]);

  useEffect(() => {
    fetchInsights();
    return () => abortControllerRef.current?.abort();
  }, [fetchInsights]);

  return {
    kpis,
    daily,
    byAccount,
    loading,
    error,
    refetch: fetchInsights,
  };
}

// ==================== useMetaCampaigns ====================
// Lista campanhas com métricas

export function useMetaCampaigns(
  storeId: string | null,
  accountIds: string[],
  dateRange: DateRange,
  statusFilter: StatusFilter = 'all'
) {
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byAccount, setByAccount] = useState<AccountBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCampaigns = useCallback(async () => {
    if (!storeId || accountIds.length === 0) {
      setCampaigns([]);
      setTotals(null);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        store_id: storeId,
        account_ids: accountIds.join(','),
        date_from: dateRange.from,
        date_to: dateRange.to,
        status: statusFilter,
      });

      const response = await fetch(`/api/meta/campaigns?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      
      const data: CampaignsResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error || 'Erro ao carregar campanhas');
      }

      setCampaigns(data.campaigns || []);
      setTotals(data.totals || null);
      setByAccount(data.by_account || []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [storeId, accountIds, dateRange, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
    return () => abortControllerRef.current?.abort();
  }, [fetchCampaigns]);

  // Filtragem local por status (além do filtro da API)
  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return c.status === 'ACTIVE';
    if (statusFilter === 'paused') return c.status === 'PAUSED';
    return true;
  });

  return {
    campaigns: filteredCampaigns,
    allCampaigns: campaigns,
    totals,
    byAccount,
    loading,
    error,
    refetch: fetchCampaigns,
  };
}

// ==================== useMetaAdSets ====================
// Lista ad sets de uma campanha

export function useMetaAdSets(
  storeId: string | null,
  campaignId: string | null,
  dateRange: DateRange
) {
  const [adsets, setAdsets] = useState<MetaAdSet[]>([]);
  const [campaign, setCampaign] = useState<AdSetsResponse['campaign'] | null>(null);
  const [totals, setTotals] = useState<AdSetsResponse['totals'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdSets = useCallback(async () => {
    if (!storeId || !campaignId) {
      setAdsets([]);
      setCampaign(null);
      setTotals(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        store_id: storeId,
        campaign_id: campaignId,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });

      const response = await fetch(`/api/meta/adsets?${params}`);
      const data: AdSetsResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error || 'Erro ao carregar conjuntos');
      }

      setAdsets(data.adsets || []);
      setCampaign(data.campaign || null);
      setTotals(data.totals || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [storeId, campaignId, dateRange]);

  useEffect(() => {
    fetchAdSets();
  }, [fetchAdSets]);

  return {
    adsets,
    campaign,
    totals,
    loading,
    error,
    refetch: fetchAdSets,
  };
}

// ==================== useMetaAds ====================
// Lista anúncios de um ad set

export function useMetaAds(
  storeId: string | null,
  adsetId: string | null,
  dateRange: DateRange
) {
  const [ads, setAds] = useState<MetaAd[]>([]);
  const [adset, setAdset] = useState<AdsResponse['adset'] | null>(null);
  const [totals, setTotals] = useState<AdsResponse['totals'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAds = useCallback(async () => {
    if (!storeId || !adsetId) {
      setAds([]);
      setAdset(null);
      setTotals(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        store_id: storeId,
        adset_id: adsetId,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });

      const response = await fetch(`/api/meta/ads?${params}`);
      const data: AdsResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).error || 'Erro ao carregar anúncios');
      }

      setAds(data.ads || []);
      setAdset(data.adset || null);
      setTotals(data.totals || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [storeId, adsetId, dateRange]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  return {
    ads,
    adset,
    totals,
    loading,
    error,
    refetch: fetchAds,
  };
}

// ==================== useStatusToggle ====================
// Ativar/pausar campanhas, ad sets ou anúncios

export function useStatusToggle(storeId: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleStatus = useCallback(async (
    objectId: string,
    objectType: ObjectType,
    newStatus: 'ACTIVE' | 'PAUSED'
  ): Promise<StatusToggleResponse> => {
    if (!storeId) {
      return { success: false, error: 'Store não selecionada' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ads/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object_id: objectId,
          object_type: objectType,
          status: newStatus,
          store_id: storeId,
        }),
      });

      const data: StatusToggleResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Erro ao atualizar status');
      }

      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  return {
    toggleStatus,
    loading,
    error,
    clearError: () => setError(null),
  };
}

// ==================== useMetaSync ====================
// Sincronizar dados

export function useMetaSync(storeId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (): Promise<SyncResponse | null> => {
    if (!storeId) {
      return null;
    }

    setSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      });

      const data: SyncResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error((data as any).error || 'Erro ao sincronizar');
      }

      setLastSyncAt(data.synced_at);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return null;
    } finally {
      setSyncing(false);
    }
  }, [storeId]);

  return {
    sync,
    syncing,
    lastSyncAt,
    error,
  };
}

// ==================== useFacebookAds (HOOK COMBINADO) ====================
// Para uso simplificado na página

export function useFacebookAds(storeId: string | null) {
  // Estado de seleção
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Estado de navegação
  const [viewLevel, setViewLevel] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);

  // Hooks de dados
  const accountsHook = useMetaAccounts(storeId);
  const statusHook = useStatusToggle(storeId);
  const syncHook = useMetaSync(storeId);

  // Auto-selecionar todas as contas ativas quando carregarem
  useEffect(() => {
    if (accountsHook.activeAccounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accountsHook.activeAccounts.map(a => a.id));
    }
  }, [accountsHook.activeAccounts, selectedAccountIds.length]);

  // Hooks condicionais
  const insightsHook = useMetaInsights(storeId, selectedAccountIds, dateRange);
  const campaignsHook = useMetaCampaigns(storeId, selectedAccountIds, dateRange, statusFilter);
  const adsetsHook = useMetaAdSets(storeId, selectedCampaignId, dateRange);
  const adsHook = useMetaAds(storeId, selectedAdSetId, dateRange);

  // Navegação
  const selectCampaign = useCallback((campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setSelectedAdSetId(null);
    setViewLevel('adsets');
  }, []);

  const selectAdSet = useCallback((adsetId: string) => {
    setSelectedAdSetId(adsetId);
    setViewLevel('ads');
  }, []);

  const goBack = useCallback(() => {
    if (viewLevel === 'ads') {
      setSelectedAdSetId(null);
      setViewLevel('adsets');
    } else if (viewLevel === 'adsets') {
      setSelectedCampaignId(null);
      setViewLevel('campaigns');
    }
  }, [viewLevel]);

  const goToCampaigns = useCallback(() => {
    setSelectedCampaignId(null);
    setSelectedAdSetId(null);
    setViewLevel('campaigns');
  }, []);

  // Refresh all
  const refetchAll = useCallback(() => {
    accountsHook.refetch();
    insightsHook.refetch();
    campaignsHook.refetch();
    if (selectedCampaignId) adsetsHook.refetch();
    if (selectedAdSetId) adsHook.refetch();
  }, [accountsHook, insightsHook, campaignsHook, adsetsHook, adsHook, selectedCampaignId, selectedAdSetId]);

  return {
    // Contas
    accounts: accountsHook.accounts,
    activeAccounts: accountsHook.activeAccounts,
    hasAccounts: accountsHook.hasAccounts,
    accountsLoading: accountsHook.loading,
    accountsError: accountsHook.error,
    connectAccount: accountsHook.connect,
    disconnectAccount: accountsHook.disconnect,

    // Seleção de contas
    selectedAccountIds,
    setSelectedAccountIds,

    // Filtros
    dateRange,
    setDateRange,
    statusFilter,
    setStatusFilter,

    // KPIs
    kpis: insightsHook.kpis,
    daily: insightsHook.daily,
    byAccount: insightsHook.byAccount,
    kpisLoading: insightsHook.loading,
    kpisError: insightsHook.error,

    // Campanhas
    campaigns: campaignsHook.campaigns,
    campaignsTotals: campaignsHook.totals,
    campaignsLoading: campaignsHook.loading,
    campaignsError: campaignsHook.error,
    campaignsByAccount: campaignsHook.byAccount,

    // Ad Sets
    adsets: adsetsHook.adsets,
    adsetsTotals: adsetsHook.totals,
    adsetsLoading: adsetsHook.loading,
    adsetsError: adsetsHook.error,
    currentCampaign: adsetsHook.campaign,

    // Ads
    ads: adsHook.ads,
    adsTotals: adsHook.totals,
    adsLoading: adsHook.loading,
    adsError: adsHook.error,
    currentAdSet: adsHook.adset,

    // Navegação
    viewLevel,
    selectCampaign,
    selectAdSet,
    goBack,
    goToCampaigns,

    // Ações
    toggleStatus: statusHook.toggleStatus,
    statusLoading: statusHook.loading,
    statusError: statusHook.error,
    
    // Sync
    sync: syncHook.sync,
    syncing: syncHook.syncing,
    lastSyncAt: syncHook.lastSyncAt,

    // Refresh
    refetchAll,
    refetchAccounts: accountsHook.refetch,
    refetchCampaigns: campaignsHook.refetch,
    refetchAdSets: adsetsHook.refetch,
    refetchAds: adsHook.refetch,
  };
}

export default useFacebookAds;
