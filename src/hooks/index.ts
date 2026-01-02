'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient as supabase } from '@/lib/supabase-client';

// Re-export usePipelines
export { usePipelines } from './usePipelines';

// Re-export CRM Realtime
export { useCRMRealtime, useDealsRealtime, useContactsRealtime } from './useCRMRealtime';

// Re-export useWhatsAppConnection
export { useWhatsAppConnection } from './useWhatsAppConnection';

// Re-export WhatsApp hooks
export {
  useWhatsAppConversations,
  useWhatsAppMessages,
  useWhatsAppCampaigns,
  useWhatsAppFlows,
  useWhatsAppPhonebooks,
  useWhatsAppTags,
  useWhatsAppAgents,
  useWhatsAppTemplates,
} from './useWhatsApp';

// Re-export new agent hooks
export { useAgents, useAIModels, useApiKeys } from './useAgents';
export type { Agent, AIConfig, AgentPermissions, CreateAgentData, UpdateAgentData } from './useAgents';

// Re-export AI Agent hooks (novo sistema de agentes)
export { useAgent, useAgentsList } from './useAgent';

// Re-export agent permissions hook
export { useAgentPermissions, AgentPermissionsProvider, useAgentPermissionsContext } from './useAgentPermissions';
export type { UseAgentPermissionsReturn, AgentPermissions as AgentPermissionsType } from './useAgentPermissions';

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

// Contacts hook com realtime
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
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchContacts = useCallback(async (showLoading = true) => {
    if (!user?.organization_id) return;

    try {
      if (showLoading) setLoading(true);
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

  // =============================================
  // REALTIME - Escutar mudanças em contatos
  // =============================================
  useEffect(() => {
    if (!user?.organization_id) return;

    // Cleanup anterior
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabaseRealtime
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
          console.log('🆕 [Realtime] New contact:', payload.new);
          const newContact = { ...(payload.new as any), deals_count: 0 };
          setContacts(prev => {
            if (prev.some(c => c.id === newContact.id)) return prev;
            return [newContact, ...prev];
          });
          // Atualizar paginação
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
          console.log('✏️ [Realtime] Contact updated:', payload.new);
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
          console.log('🗑️ [Realtime] Contact deleted:', payload.old);
          const deleted = payload.old as any;
          setContacts(prev => prev.filter(c => c.id !== deleted.id));
          // Atualizar paginação
          setPagination((prev: any) => prev ? { ...prev, total: Math.max(0, (prev.total || 0) - 1) } : prev);
        }
      )
      .subscribe((status) => {
        console.log('🔌 Contacts realtime:', status);
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user?.organization_id]);

  // Operações - não precisam mais chamar fetchContacts() pois realtime atualiza
  const createContact = async (data: any) => {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to create contact');
    const result = await response.json();
    // Realtime vai atualizar automaticamente
    return result.contact;
  };

  const updateContact = async (id: string, data: any) => {
    // Atualização otimista
    setContacts(prev => prev.map(c => 
      c.id === id ? { ...c, ...data } : c
    ));
    
    const response = await fetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) {
      await fetchContacts(false);
      throw new Error('Failed to update contact');
    }
    const result = await response.json();
    return result.contact;
  };

  const deleteContact = async (id: string) => {
    // Remoção otimista
    setContacts(prev => prev.filter(c => c.id !== id));
    
    const response = await fetch(
      `/api/contacts?id=${id}&organizationId=${user?.organization_id}`,
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

// Supabase client para realtime (lazy loaded)
const supabaseRealtime = supabase;

// Deals hook com realtime
export function useDeals(pipelineId?: string) {
  const { user } = useAuthStore();
  const [deals, setDeals] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchPipelines = useCallback(async () => {
    if (!user?.organization_id) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/deals?organizationId=${user.organization_id}&type=pipelines`
      );
      if (!response.ok) throw new Error('Failed to fetch pipelines');
      const result = await response.json();
      setPipelines(result.pipelines || []);
    } catch (e) {
      console.error('Error fetching pipelines:', e);
      setError(e instanceof Error ? e : new Error('An error occurred'));
    }
  }, [user?.organization_id]);

  const fetchDeals = useCallback(async (showLoading = true) => {
    if (!user?.organization_id) {
      setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({ organizationId: user.organization_id });
      if (pipelineId) params.set('pipelineId', pipelineId);

      const response = await fetch(`/api/deals?${params}`);
      if (!response.ok) throw new Error('Failed to fetch deals');
      const result = await response.json();
      setDeals(result.deals || []);
    } catch (e) {
      console.error('Error fetching deals:', e);
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, pipelineId]);

  // Fetch inicial
  useEffect(() => {
    fetchPipelines();
    fetchDeals();
  }, [fetchPipelines, fetchDeals]);

  // =============================================
  // REALTIME - Escutar mudanças em deals
  // =============================================
  useEffect(() => {
    if (!user?.organization_id) return;

    // Cleanup anterior
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabaseRealtime
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
          console.log('🆕 [Realtime] New deal:', payload.new);
          const newDeal = payload.new as any;
          // Buscar deal completo com relações
          const { data: fullDeal } = await supabaseRealtime
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
          console.log('✏️ [Realtime] Deal updated:', payload.new);
          const updatedDeal = payload.new as any;
          // Buscar deal completo
          const { data: fullDeal } = await supabaseRealtime
            .from('deals')
            .select(`
              *,
              contact:contacts(id, email, first_name, last_name, avatar_url, company),
              stage:pipeline_stages(id, name, color)
            `)
            .eq('id', updatedDeal.id)
            .single();
          
          if (fullDeal) {
            setDeals(prev => prev.map(d => 
              d.id === fullDeal.id ? fullDeal : d
            ));
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
          console.log('🗑️ [Realtime] Deal deleted:', payload.old);
          const deletedDeal = payload.old as any;
          setDeals(prev => prev.filter(d => d.id !== deletedDeal.id));
        }
      )
      .subscribe((status) => {
        console.log('🔌 Deals realtime:', status);
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user?.organization_id]);

  // Operações - não precisam mais chamar fetchDeals() pois realtime atualiza
  const createDeal = async (data: any) => {
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to create deal');
    const result = await response.json();
    // Realtime vai atualizar automaticamente
    return result.deal;
  };

  const updateDeal = async (id: string, data: any) => {
    // Atualização otimista local primeiro
    setDeals(prev => prev.map(d => 
      d.id === id ? { ...d, ...data } : d
    ));
    
    const response = await fetch('/api/deals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, organizationId: user?.organization_id, ...data }),
    });
    if (!response.ok) {
      // Reverter em caso de erro
      await fetchDeals(false);
      throw new Error('Failed to update deal');
    }
    const result = await response.json();
    // Realtime vai sincronizar com dados completos
    return result.deal;
  };

  const deleteDeal = async (id: string) => {
    // Remoção otimista local primeiro
    setDeals(prev => prev.filter(d => d.id !== id));
    
    const response = await fetch(
      `/api/deals?id=${id}&organizationId=${user?.organization_id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      // Reverter em caso de erro
      await fetchDeals(false);
      throw new Error('Failed to delete deal');
    }
    // Realtime confirma a remoção
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
    setDeals, // Expor para uso externo se necessário
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
