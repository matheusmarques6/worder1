import { useState, useEffect, useCallback } from 'react';

// Types
export interface DashboardMetrics {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalSpend: number;
    totalSpendChange: number;
    totalConversions: number;
    totalConversionValue: number;
    cpa: number;
    roas: number;
    ctr: number;
  };
  platforms: {
    meta: PlatformMetrics;
    google: PlatformMetrics;
    tiktok: PlatformMetrics & { videoViews: number };
  };
  spendDistribution: Array<{ name: string; value: number; color: string }>;
  dailyData: Array<{
    date: string;
    label: string;
    meta: number;
    google: number;
    tiktok: number;
    total: number;
  }>;
  topCampaigns: Array<{
    id: string;
    name: string;
    sent: number;
    opens: number;
    clicks: number;
    revenue: number;
    openRate: number;
    clickRate: number;
  }>;
  stores: Array<{
    id: string;
    name: string;
    domain: string;
    totalOrders: number;
    totalRevenue: number;
  }>;
  integrations: {
    shopify: boolean;
    klaviyo: boolean;
    meta: boolean;
    google: boolean;
    tiktok: boolean;
  };
}

export interface PlatformMetrics {
  spend: number;
  spendChange: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  cpa: number;
  roas: number;
  ctr: number;
}

export interface Integration {
  id: string;
  name: string;
  isConnected: boolean;
  lastSyncAt?: string;
  accountName?: string;
}

// Hook: Dashboard Metrics
export function useDashboardMetrics(organizationId: string | null, period: string = '7d') {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/dashboard/metrics?organizationId=${organizationId}&period=${period}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, period]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}

// Hook: Integration Status
export function useIntegrations(organizationId: string | null) {
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({
    shopify: { id: 'shopify', name: 'Shopify', isConnected: false },
    klaviyo: { id: 'klaviyo', name: 'Klaviyo', isConnected: false },
    meta: { id: 'meta', name: 'Facebook Ads', isConnected: false },
    google: { id: 'google', name: 'Google Ads', isConnected: false },
    tiktok: { id: 'tiktok', name: 'TikTok Ads', isConnected: false },
  });
  const [loading, setLoading] = useState(true);

  const fetchIntegrations = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fetch all integration statuses in parallel
      const [shopify, klaviyo, meta, google, tiktok] = await Promise.all([
        fetch(`/api/shopify?action=status&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/klaviyo?organizationId=${organizationId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/integrations/meta?action=accounts&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/integrations/google?action=accounts&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/integrations/tiktok?action=accounts&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({})),
      ]);

      setIntegrations({
        shopify: {
          id: 'shopify',
          name: 'Shopify',
          isConnected: !!shopify.connected || !!shopify.stores?.length,
          lastSyncAt: shopify.lastSyncAt,
          accountName: shopify.shopName,
        },
        klaviyo: {
          id: 'klaviyo',
          name: 'Klaviyo',
          isConnected: !!klaviyo.account,
          lastSyncAt: klaviyo.lastSyncAt,
          accountName: klaviyo.accountName,
        },
        meta: {
          id: 'meta',
          name: 'Facebook Ads',
          isConnected: (meta.accounts?.length || 0) > 0,
          lastSyncAt: meta.accounts?.[0]?.last_sync_at,
          accountName: meta.accounts?.[0]?.ad_account_name,
        },
        google: {
          id: 'google',
          name: 'Google Ads',
          isConnected: (google.accounts?.length || 0) > 0,
          lastSyncAt: google.accounts?.[0]?.last_sync_at,
          accountName: google.accounts?.[0]?.customer_name,
        },
        tiktok: {
          id: 'tiktok',
          name: 'TikTok Ads',
          isConnected: (tiktok.accounts?.length || 0) > 0,
          lastSyncAt: tiktok.accounts?.[0]?.last_sync_at,
          accountName: tiktok.accounts?.[0]?.advertiser_name,
        },
      });
    } catch (err) {
      console.error('Error fetching integrations:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return { integrations, loading, refetch: fetchIntegrations };
}

// Hook: Connect Integration
export function useConnectIntegration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (
    platform: 'meta' | 'google' | 'tiktok',
    organizationId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/${platform}?action=auth_url&organizationId=${organizationId}`
      );
      
      const { authUrl } = await response.json();
      
      if (authUrl) {
        // Open OAuth flow in popup or redirect
        window.location.href = authUrl;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async (
    platform: 'meta' | 'google' | 'tiktok',
    organizationId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/${platform}?organizationId=${organizationId}`,
        { method: 'DELETE' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async (
    platform: 'meta' | 'google' | 'tiktok',
    organizationId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/integrations/${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', organizationId }),
      });
      
      if (!response.ok) {
        throw new Error('Sync failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { connect, disconnect, sync, loading, error };
}

// Hook: Ads Metrics by Platform
export function useAdsMetrics(
  organizationId: string | null,
  platform: 'meta' | 'google' | 'tiktok',
  startDate: string,
  endDate: string
) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/${platform}?action=metrics&organizationId=${organizationId}&startDate=${startDate}&endDate=${endDate}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${platform} metrics`);
      }
      
      const result = await response.json();
      setData(result.metrics || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, platform, startDate, endDate]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { data, loading, error, refetch: fetchMetrics };
}

// Hook: Top Ads
export function useTopAds(organizationId: string | null, limit: number = 10) {
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTopAds = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fetch campaign-level metrics from all platforms
      const [metaCampaigns, googleCampaigns, tiktokCampaigns] = await Promise.all([
        fetch(`/api/integrations/meta?action=campaigns&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({ campaigns: [] })),
        fetch(`/api/integrations/google?action=campaigns&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({ campaigns: [] })),
        fetch(`/api/integrations/tiktok?action=campaigns&organizationId=${organizationId}`).then(r => r.json()).catch(() => ({ campaigns: [] })),
      ]);

      // Combine and sort by some metric (e.g., status active first)
      const allAds = [
        ...(metaCampaigns.campaigns || []).map((c: any) => ({ ...c, platform: 'meta' })),
        ...(googleCampaigns.campaigns || []).map((c: any) => ({ ...c, platform: 'google' })),
        ...(tiktokCampaigns.campaigns || []).map((c: any) => ({ ...c, platform: 'tiktok' })),
      ];

      setAds(allAds.slice(0, limit));
    } catch (err) {
      console.error('Error fetching top ads:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, limit]);

  useEffect(() => {
    fetchTopAds();
  }, [fetchTopAds]);

  return { ads, loading, refetch: fetchTopAds };
}

// Export existing hooks from original file
export * from './index';
