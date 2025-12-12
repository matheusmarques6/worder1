'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores';

// Generic fetch hook
export function useFetch<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An error occurred'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url, options]);

  return { data, error, loading };
}

// Analytics hook
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
        `/api/analytics?organizationId=${user.organization_id}&type=${type}&period=${period}`
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

// Contacts hook
export function useContacts(options: {
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
} = {}) {
  const { user } = useAuthStore();
  const [contacts, setContacts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContacts = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        organizationId: user.organization_id,
        page: String(options.page || 1),
        limit: String(options.limit || 50),
      });
      if (options.search) params.set('search', options.search);
      if (options.tags?.length) params.set('tags', options.tags.join(','));

      const response = await fetch(`/api/contacts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      const result = await response.json();
      setContacts(result.contacts);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, options.search, options.tags, options.page, options.limit]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const createContact = async (data: any) => {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to create contact');
    const result = await response.json();
    await fetchContacts();
    return result.contact;
  };

  const updateContact = async (id: string, data: any) => {
    const response = await fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update contact');
    const result = await response.json();
    await fetchContacts();
    return result.contact;
  };

  const deleteContact = async (id: string) => {
    const response = await fetch(
      `/api/contacts?id=${id}&organizationId=${user?.organization_id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error('Failed to delete contact');
    await fetchContacts();
  };

  return {
    contacts,
    pagination,
    loading,
    error,
    refetch: fetchContacts,
    createContact,
    updateContact,
    deleteContact,
  };
}

// Deals hook
export function useDeals(pipelineId?: string) {
  const { user } = useAuthStore();
  const [deals, setDeals] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPipelines = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      const response = await fetch(
        `/api/deals?organizationId=${user.organization_id}&type=pipelines`
      );
      if (!response.ok) throw new Error('Failed to fetch pipelines');
      const result = await response.json();
      setPipelines(result.pipelines);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    }
  }, [user?.organization_id]);

  const fetchDeals = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({ organizationId: user.organization_id });
      if (pipelineId) params.set('pipelineId', pipelineId);

      const response = await fetch(`/api/deals?${params}`);
      if (!response.ok) throw new Error('Failed to fetch deals');
      const result = await response.json();
      setDeals(result.deals);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, pipelineId]);

  useEffect(() => {
    fetchPipelines();
    fetchDeals();
  }, [fetchPipelines, fetchDeals]);

  const createDeal = async (data: any) => {
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to create deal');
    const result = await response.json();
    await fetchDeals();
    return result.deal;
  };

  const updateDeal = async (id: string, data: any) => {
    const response = await fetch('/api/deals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update deal');
    const result = await response.json();
    await fetchDeals();
    return result.deal;
  };

  const deleteDeal = async (id: string) => {
    const response = await fetch(
      `/api/deals?id=${id}&organizationId=${user?.organization_id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error('Failed to delete deal');
    await fetchDeals();
  };

  const moveDeal = async (dealId: string, stageId: string, position?: number) => {
    await updateDeal(dealId, { stage_id: stageId, position });
  };

  return {
    deals,
    pipelines,
    loading,
    error,
    refetch: fetchDeals,
    refetchPipelines: fetchPipelines,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDeal,
  };
}

// Automations hook
export function useAutomations() {
  const { user } = useAuthStore();
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/automations?organizationId=${user.organization_id}`
      );
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
        organizationId: user?.organization_id,
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
      body: JSON.stringify({ id, organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update automation');
    const result = await response.json();
    await fetchAutomations();
    return result.automation;
  };

  const deleteAutomation = async (id: string) => {
    const response = await fetch(
      `/api/automations?id=${id}&organizationId=${user?.organization_id}`,
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

// WhatsApp conversations hook
export function useWhatsAppConversations() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      // This would fetch from a conversations endpoint
      // For now, using mock data structure
      setConversations([]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const sendMessage = async (conversationId: string, to: string, message: string, mediaUrl?: string, mediaType?: string) => {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send',
        organizationId: user?.organization_id,
        conversationId,
        to,
        message,
        mediaUrl,
        mediaType,
      }),
    });
    if (!response.ok) throw new Error('Failed to send message');
    const result = await response.json();
    await fetchConversations();
    return result;
  };

  const markAsRead = async (messageId: string) => {
    const response = await fetch('/api/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark-read',
        organizationId: user?.organization_id,
        messageId,
      }),
    });
    if (!response.ok) throw new Error('Failed to mark as read');
  };

  return {
    conversations,
    loading,
    error,
    refetch: fetchConversations,
    sendMessage,
    markAsRead,
  };
}

// Auth hook
export function useAuth() {
  const { user, setUser, setLoading, logout: storeLogout } = useAuthStore();
  const [error, setError] = useState<Error | null>(null);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      setUser(result.profile);
      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error('An error occurred');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup', ...data }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Signup failed');
      }

      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error('An error occurred');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      storeLogout();
      window.location.href = '/';
    } catch (e) {
      console.error('Logout error:', e);
      storeLogout();
      window.location.href = '/';
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send reset email');
      }

      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error('An error occurred');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    error,
    login,
    signup,
    logout,
    resetPassword,
  };
}
