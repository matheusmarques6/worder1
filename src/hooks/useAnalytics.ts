'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores';

export function useAnalytics(type: string = 'overview', period: string = '30d') {
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/analytics?type=${type}&period=${period}`
      );
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, type, period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { data, loading, error, refetch: fetchAnalytics };
}
