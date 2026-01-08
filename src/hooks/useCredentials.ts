'use client';

import { useState, useCallback, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

export interface Credential {
  id: string;
  name: string;
  type: string;
  created_at: string;
  updated_at?: string;
  last_used_at?: string;
  last_test_success?: boolean;
  automations_using?: string[];
}

export interface CredentialType {
  type: string;
  name: string;
  icon: string;
  fields: string[];
}

interface UseCredentialsOptions {
  type?: string;
  autoLoad?: boolean;
}

// ============================================
// HOOK
// ============================================

export function useCredentials(options: UseCredentialsOptions = {}) {
  const { type, autoLoad = true } = options;

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [types, setTypes] = useState<CredentialType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // LOAD CREDENTIALS
  // ============================================

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      params.set('includeTypes', 'true');

      const response = await fetch(`/api/credentials?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load credentials');
      }

      setCredentials(data.credentials || []);
      setTypes(data.types || []);

    } catch (err: any) {
      setError(err.message);
      console.error('Error loading credentials:', err);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [load, autoLoad]);

  // ============================================
  // CREATE CREDENTIAL
  // ============================================

  const create = useCallback(async (
    name: string,
    credType: string,
    data: Record<string, any>
  ): Promise<Credential | null> => {
    setError(null);

    try {
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: credType, data }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create credential');
      }

      // Refresh list
      await load();

      return result.credential;

    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [load]);

  // ============================================
  // UPDATE CREDENTIAL
  // ============================================

  const update = useCallback(async (
    id: string,
    updates: { name?: string; data?: Record<string, any> }
  ): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch('/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update credential');
      }

      // Refresh list
      await load();

      return true;

    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [load]);

  // ============================================
  // DELETE CREDENTIAL
  // ============================================

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setError(null);

    try {
      const response = await fetch(`/api/credentials?id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete credential');
      }

      // Refresh list
      await load();

      return true;

    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [load]);

  // ============================================
  // TEST CREDENTIAL
  // ============================================

  const test = useCallback(async (id: string): Promise<{
    success: boolean;
    message: string;
  } | null> => {
    setError(null);

    try {
      const response = await fetch('/api/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'test' }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to test credential');
      }

      // Refresh list to get updated test status
      await load();

      return {
        success: result.success,
        message: result.message,
      };

    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [load]);

  // ============================================
  // GET CREDENTIAL BY TYPE
  // ============================================

  const getByType = useCallback((credType: string): Credential[] => {
    return credentials.filter(c => c.type === credType);
  }, [credentials]);

  // ============================================
  // RETURN
  // ============================================

  return {
    credentials,
    types,
    isLoading,
    error,

    // Actions
    load,
    create,
    update,
    remove,
    test,
    getByType,
    clearError: () => setError(null),
  };
}

export default useCredentials;
