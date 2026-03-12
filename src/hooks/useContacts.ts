'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore, useStoreStore } from '@/stores';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient as supabase } from '@/lib/supabase-client';

export function useContacts(options: {
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  storeId?: string;
} = {}) {
  const { user } = useAuthStore();
  const { currentStore, _hasHydrated } = useStoreStore();
  const [contacts, setContacts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const effectiveStoreId = options.storeId || currentStore?.id;

  const fetchContacts = useCallback(async (showLoading = true) => {
    if (!user?.organization_id) return;

    if (!effectiveStoreId) {
      setContacts([]);
      setPagination(null);
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
        page: String(options.page || 1),
        limit: String(options.limit || 50),
        storeId: effectiveStoreId,
      });
      if (options.search) params.set('search', options.search);
      if (options.tags?.length) params.set('tags', options.tags.join(','));

      const response = await fetch(`/api/contacts?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!response.ok) throw new Error('Failed to fetch contacts');
      const result = await response.json();
      setContacts(result.contacts);
      setPagination(result.pagination);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, effectiveStoreId, options.search, options.tags, options.page, options.limit]);

  useEffect(() => {
    if (!_hasHydrated) return;
    fetchContacts();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchContacts, _hasHydrated]);

  // Realtime
  useEffect(() => {
    if (!user?.organization_id) return;

    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`contacts-realtime:${user.organization_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        async (payload) => {
          console.log('[Realtime] New contact:', payload.new);
          const newContact = { ...(payload.new as any), deals_count: 0 };
          setContacts(prev => {
            if (prev.some(c => c.id === newContact.id)) return prev;
            return [newContact, ...prev];
          });
          setPagination((prev: any) => prev ? { ...prev, total: (prev.total || 0) + 1 } : prev);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setContacts(prev => prev.map(c =>
            c.id === updated.id ? { ...c, ...updated } : c
          ));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${user.organization_id}`,
        },
        (payload) => {
          const deleted = payload.old as any;
          setContacts(prev => prev.filter(c => c.id !== deleted.id));
          setPagination((prev: any) => prev ? { ...prev, total: Math.max(0, (prev.total || 0) - 1) } : prev);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user?.organization_id]);

  const createContact = async (data: any) => {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        store_id: effectiveStoreId,
      }),
    });
    if (!response.ok) throw new Error('Failed to create contact');
    const result = await response.json();
    return result.contact;
  };

  const updateContact = async (id: string, data: any) => {
    setContacts(prev => prev.map(c =>
      c.id === id ? { ...c, ...data } : c
    ));

    const response = await fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) {
      await fetchContacts(false);
      throw new Error('Failed to update contact');
    }
    const result = await response.json();
    return result.contact;
  };

  const deleteContact = async (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));

    const response = await fetch(
      `/api/contacts?id=${id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      await fetchContacts(false);
      throw new Error('Failed to delete contact');
    }
  };

  return {
    contacts,
    pagination,
    loading,
    error,
    refetch: () => fetchContacts(true),
    createContact,
    updateContact,
    deleteContact,
    setContacts,
  };
}
