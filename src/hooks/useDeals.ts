'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore, useStoreStore } from '@/stores';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient as supabase } from '@/lib/supabase-client';

export function useDeals(pipelineId?: string, storeIdOverride?: string) {
  const { user } = useAuthStore();
  const { currentStore, _hasHydrated } = useStoreStore();
  const [deals, setDeals] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const effectiveStoreId = storeIdOverride || currentStore?.id;

  const fetchPipelines = useCallback(async () => {
    if (!user?.organization_id) {
      setLoading(false);
      return;
    }

    if (!effectiveStoreId) {
      setPipelines([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/deals?type=pipelines&storeId=${effectiveStoreId}`
      );
      if (!response.ok) throw new Error('Failed to fetch pipelines');
      const result = await response.json();
      setPipelines(result.pipelines || []);
    } catch (e) {
      console.error('Error fetching pipelines:', e);
      setError(e instanceof Error ? e : new Error('An error occurred'));
    }
  }, [user?.organization_id, effectiveStoreId]);

  const fetchDeals = useCallback(async (showLoading = true) => {
    if (!user?.organization_id) {
      setLoading(false);
      return;
    }

    if (!effectiveStoreId) {
      setDeals([]);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({
        storeId: effectiveStoreId,
      });
      if (pipelineId) params.set('pipelineId', pipelineId);

      const url = `/api/deals?${params}`;
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error('Failed to fetch deals');
      const result = await response.json();
      setDeals(result.deals || []);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('Error fetching deals:', e);
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, effectiveStoreId, pipelineId]);

  useEffect(() => {
    if (!_hasHydrated) return;
    fetchPipelines();
    fetchDeals();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPipelines, fetchDeals, _hasHydrated]);

  // Realtime
  useEffect(() => {
    if (!user?.organization_id) return;

    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`deals-realtime:${user.organization_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        async (payload) => {
          const newDeal = payload.new as any;
          const { data: fullDeal } = await supabase
            .from('deals')
            .select(`
              *,
              contact:contacts(id, email, first_name, last_name, avatar_url, company),
              stage:pipeline_stages(id, name, color)
            `)
            .eq('id', newDeal.id)
            .single();

          if (fullDeal) {
            setDeals(prev => {
              if (prev.some(d => d.id === fullDeal.id)) return prev;
              return [fullDeal, ...prev];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        async (payload) => {
          const updatedDeal = payload.new as any;

          const { data: fullDeal } = await supabase
            .from('deals')
            .select(`
              *,
              contact:contacts(id, email, first_name, last_name, avatar_url, company),
              stage:pipeline_stages(id, name, color)
            `)
            .eq('id', updatedDeal.id)
            .single();

          if (fullDeal) {
            setDeals(prev => {
              const currentDeal = prev.find(d => d.id === fullDeal.id);
              if (currentDeal && (currentDeal as any)._localUpdate) {
                return prev;
              }
              return prev.map(d => d.id === fullDeal.id ? fullDeal : d);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        (payload) => {
          const deletedDeal = payload.old as any;
          setDeals(prev => prev.filter(d => d.id !== deletedDeal.id));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user?.organization_id]);

  const createDeal = async (data: any) => {
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        store_id: effectiveStoreId,
      }),
    });
    if (!response.ok) throw new Error('Failed to create deal');
    const result = await response.json();
    return result.deal;
  };

  const updateDeal = async (id: string, data: any) => {
    const previousDeals = [...deals];

    setDeals(prev => prev.map(d =>
      d.id === id ? { ...d, ...data, _localUpdate: true } : d
    ));

    try {
      const response = await fetch('/api/deals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });

      if (!response.ok) {
        setDeals(previousDeals);
        throw new Error('Failed to update deal');
      }

      const result = await response.json();

      setDeals(prev => prev.map(d =>
        d.id === id ? { ...result.deal, _localUpdate: undefined } : d
      ));

      return result.deal;
    } catch (error) {
      setDeals(previousDeals);
      throw error;
    }
  };

  const deleteDeal = async (id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));

    const response = await fetch(
      `/api/deals?id=${id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      await fetchDeals(false);
      throw new Error('Failed to delete deal');
    }
  };

  const moveDeal = async (dealId: string, stageId: string, position?: number) => {
    await updateDeal(dealId, { stage_id: stageId, position });
  };

  return {
    deals,
    pipelines,
    loading,
    error,
    refetch: () => fetchDeals(true),
    refetchPipelines: fetchPipelines,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDeal,
    setDeals,
  };
}
