'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores';

export function useAutomations() {
  const { user } = useAuthStore();
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/automations`);
      if (!response.ok) throw new Error('Failed to fetch automations');
      const result = await response.json();
      setAutomations(result.automations);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const createAutomation = async (data: any) => {
    const response = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        ...data,
      }),
    });
    if (!response.ok) throw new Error('Failed to create automation');
    const result = await response.json();
    await fetchAutomations();
    return result.automation;
  };

  const updateAutomation = async (id: string, data: any) => {
    const response = await fetch('/api/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update automation');
    const result = await response.json();
    await fetchAutomations();
    return result.automation;
  };

  const deleteAutomation = async (id: string) => {
    const response = await fetch(
      `/api/automations?id=${id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error('Failed to delete automation');
    await fetchAutomations();
  };

  const toggleAutomation = async (id: string, active: boolean) => {
    await updateAutomation(id, { status: active ? 'active' : 'paused' });
  };

  return {
    automations,
    loading,
    error,
    refetch: fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
  };
}
