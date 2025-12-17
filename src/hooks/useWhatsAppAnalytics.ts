// ============================================
// HOOK - useWhatsAppAnalytics
// Analytics de campanhas WhatsApp
// ============================================

import { useState, useCallback } from 'react';
import type {
  CampaignAnalyticsResponse,
  CampaignDetailResponse,
  DateRange,
} from '@/types/whatsapp-analytics';

interface UseWhatsAppAnalyticsReturn {
  data: CampaignAnalyticsResponse | null;
  campaignDetail: CampaignDetailResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchAnalytics: (params: FetchAnalyticsParams) => Promise<CampaignAnalyticsResponse | null>;
  fetchCampaignDetails: (campaignId: string, organizationId: string) => Promise<CampaignDetailResponse | null>;
  recalculateAnalytics: (campaignId: string, organizationId: string) => Promise<boolean>;
  exportData: (format: 'csv' | 'xlsx', params?: ExportParams) => void;
  clearError: () => void;
}

interface FetchAnalyticsParams {
  organizationId: string;
  period?: DateRange;
  startDate?: string;
  endDate?: string;
}

interface ExportParams {
  organizationId: string;
  campaignId?: string;
  period?: DateRange;
}

export function useWhatsAppAnalytics(): UseWhatsAppAnalyticsReturn {
  const [data, setData] = useState<CampaignAnalyticsResponse | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (params: FetchAnalyticsParams): Promise<CampaignAnalyticsResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams();
      searchParams.set('organization_id', params.organizationId);
      
      if (params.period) {
        searchParams.set('period', params.period);
      }
      if (params.startDate) {
        searchParams.set('start_date', params.startDate);
      }
      if (params.endDate) {
        searchParams.set('end_date', params.endDate);
      }

      const res = await fetch(`/api/whatsapp/analytics?${searchParams}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch analytics');
      }

      setData(json);
      return json;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch analytics';
      setError(errorMessage);
      console.error('useWhatsAppAnalytics error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCampaignDetails = useCallback(async (campaignId: string, organizationId: string): Promise<CampaignDetailResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams({
        organization_id: organizationId,
        campaign_id: campaignId,
      });

      const res = await fetch(`/api/whatsapp/analytics?${searchParams}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch campaign details');
      }

      setCampaignDetail(json);
      return json;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch campaign details';
      setError(errorMessage);
      console.error('fetchCampaignDetails error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recalculateAnalytics = useCallback(async (campaignId: string, organizationId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/whatsapp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, organization_id: organizationId }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to recalculate analytics');
      }

      return true;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to recalculate analytics';
      setError(errorMessage);
      console.error('recalculateAnalytics error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exportData = useCallback((format: 'csv' | 'xlsx', params?: ExportParams) => {
    if (!params?.organizationId) {
      console.error('organizationId required for export');
      return;
    }

    const searchParams = new URLSearchParams({
      format,
      organization_id: params.organizationId,
    });
    
    if (params.campaignId) {
      searchParams.set('campaign_id', params.campaignId);
    }
    if (params.period) {
      searchParams.set('period', params.period);
    }

    window.open(`/api/whatsapp/analytics/export?${searchParams}`, '_blank');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    data,
    campaignDetail,
    isLoading,
    error,
    fetchAnalytics,
    fetchCampaignDetails,
    recalculateAnalytics,
    exportData,
    clearError,
  };
}

export default useWhatsAppAnalytics;
