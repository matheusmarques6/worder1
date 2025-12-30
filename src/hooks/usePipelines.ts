'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores';

export function usePipelines() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPipeline = useCallback(async (data: {
    name: string;
    description?: string;
    stages: { name: string; color: string }[];
  }) => {
    if (!user?.organization_id) throw new Error('Organization not found');

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-pipeline',
          organizationId: user.organization_id,
          ...data,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao criar pipeline');
      }

      const result = await response.json();
      return result.pipeline;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  const updatePipeline = useCallback(async (id: string, data: {
    name?: string;
    description?: string;
    color?: string;
  }) => {
    if (!user?.organization_id) throw new Error('Organization not found');

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pipeline',
          id,
          organizationId: user.organization_id,
          ...data,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao atualizar pipeline');
      }

      const result = await response.json();
      return result.pipeline;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  const deletePipeline = useCallback(async (id: string) => {
    if (!user?.organization_id) throw new Error('Organization not found');

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/deals?type=pipeline&id=${id}&organizationId=${user.organization_id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao deletar pipeline');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  const createStage = useCallback(async (pipelineId: string, data: {
    name: string;
    color: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-stage',
          pipelineId,
          ...data,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao criar estágio');
      }

      const result = await response.json();
      return result.stage;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStage = useCallback(async (id: string, data: {
    name?: string;
    color?: string;
    position?: number;
    probability?: number;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'stage',
          id,
          ...data,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao atualizar estágio');
      }

      const result = await response.json();
      return result.stage;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStage = useCallback(async (id: string) => {
    if (!user?.organization_id) throw new Error('Organization not found');

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/deals?type=stage&id=${id}&organizationId=${user.organization_id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Erro ao deletar estágio');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  return {
    loading,
    error,
    createPipeline,
    updatePipeline,
    deletePipeline,
    createStage,
    updateStage,
    deleteStage,
  };
}
