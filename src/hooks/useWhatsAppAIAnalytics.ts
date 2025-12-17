// ============================================
// HOOK - useWhatsAppAIAnalytics
// Analytics de agentes de IA WhatsApp
// ============================================

import { useState, useCallback } from 'react';
import type {
  AIAnalyticsResponse,
  AIAgentDetailResponse,
} from '@/types/whatsapp-ai-analytics';
import type { DateRange } from '@/types/whatsapp-analytics';

interface UseWhatsAppAIAnalyticsReturn {
  data: AIAnalyticsResponse | null;
  agentDetail: AIAgentDetailResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchAnalytics: (params: FetchAIAnalyticsParams) => Promise<AIAnalyticsResponse | null>;
  fetchAgentDetails: (agentId: string, organizationId: string, period?: DateRange) => Promise<AIAgentDetailResponse | null>;
  clearError: () => void;
  clearData: () => void;
}

interface FetchAIAnalyticsParams {
  organizationId: string;
  period?: DateRange;
  startDate?: string;
  endDate?: string;
}

export function useWhatsAppAIAnalytics(): UseWhatsAppAIAnalyticsReturn {
  const [data, setData] = useState<AIAnalyticsResponse | null>(null);
  const [agentDetail, setAgentDetail] = useState<AIAgentDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (params: FetchAIAnalyticsParams): Promise<AIAnalyticsResponse | null> => {
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

      const res = await fetch(`/api/whatsapp/ai/analytics?${searchParams}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch AI analytics');
      }

      setData(json);
      return json;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch AI analytics';
      setError(errorMessage);
      console.error('useWhatsAppAIAnalytics error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAgentDetails = useCallback(async (
    agentId: string, 
    organizationId: string,
    period?: DateRange
  ): Promise<AIAgentDetailResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams({
        organization_id: organizationId,
        agent_id: agentId,
      });

      if (period) {
        searchParams.set('period', period);
      }

      const res = await fetch(`/api/whatsapp/ai/analytics?${searchParams}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch agent details');
      }

      setAgentDetail(json);
      return json;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch agent details';
      setError(errorMessage);
      console.error('fetchAgentDetails error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setAgentDetail(null);
  }, []);

  return {
    data,
    agentDetail,
    isLoading,
    error,
    fetchAnalytics,
    fetchAgentDetails,
    clearError,
    clearData,
  };
}

export default useWhatsAppAIAnalytics;
