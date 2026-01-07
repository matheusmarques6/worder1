'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore, useStoreStore } from '@/stores'; // ✅ ADICIONADO useStoreStore
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
// ✅ AJUSTE 1: Removido organizationId da URL - API pega do JWT
export function useAnalytics(type: string = 'overview', period: string = '30d') {
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      // ✅ CORRIGIDO: Sem organizationId na URL
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

// Contacts hook com realtime
// ✅ CORRIGIDO: Agora filtra por storeId (multi-tenant por loja)
export function useContacts(options: {
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  storeId?: string; // ✅ NOVO: Filtro por loja
} = {}) {
  const { user } = useAuthStore();
  const { currentStore } = useStoreStore(); // ✅ NOVO: Pegar loja selecionada
  const [contacts, setContacts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ✅ NOVO: Usar storeId do parâmetro ou do store global
  const effectiveStoreId = options.storeId || currentStore?.id;

  const fetchContacts = useCallback(async (showLoading = true) => {
    if (!user?.organization_id) return;
    
    // ✅ NOVO: Não buscar se não tiver loja selecionada
    if (!effectiveStoreId) {
      setContacts([]);
      setPagination(null);
      setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({
        page: String(options.page || 1),
        limit: String(options.limit || 50),
        storeId: effectiveStoreId, // ✅ NOVO: Enviar storeId
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
  }, [user?.organization_id, effectiveStoreId, options.search, options.tags, options.page, options.limit]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // =============================================
  // REALTIME - Escutar mudanças em contatos
  // ✅ MANTER organization_id nos filtros Realtime (é client-side, OK)
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

  // Operações - ✅ CORRIGIDO: Agora inclui store_id
  const createContact = async (data: any) => {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ...data, 
        store_id: effectiveStoreId, // ✅ NOVO: Incluir store_id
      }),
    });
    if (!response.ok) throw new Error('Failed to create contact');
    const result = await response.json();
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
      body: JSON.stringify({ id, ...data }), // ✅ Sem organizationId
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
    
    // ✅ CORRIGIDO: Sem organizationId na URL
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

// Supabase client para realtime (lazy loaded)
const supabaseRealtime = supabase;

// Deals hook com realtime
// ✅ CORRIGIDO: Agora filtra por storeId (multi-tenant por loja)
export function useDeals(pipelineId?: string, storeIdOverride?: string) {
  const { user } = useAuthStore();
  const { currentStore } = useStoreStore(); // ✅ NOVO
  const [deals, setDeals] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ✅ NOVO: Usar storeId do parâmetro ou do store global
  const effectiveStoreId = storeIdOverride || currentStore?.id;

  const fetchPipelines = useCallback(async () => {
    if (!user?.organization_id) {
      setLoading(false);
      return;
    }
    
    // ✅ NOVO: Não buscar se não tiver loja selecionada
    if (!effectiveStoreId) {
      setPipelines([]);
      return;
    }

    try {
      // ✅ CORRIGIDO: Incluir storeId na URL
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
    
    // ✅ NOVO: Não buscar se não tiver loja selecionada
    if (!effectiveStoreId) {
      setDeals([]);
      setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);
      // ✅ CORRIGIDO: Incluir storeId no URLSearchParams
      const params = new URLSearchParams({
        storeId: effectiveStoreId, // ✅ NOVO
      });
      if (pipelineId) params.set('pipelineId', pipelineId);

      const url = `/api/deals?${params}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch deals');
      const result = await response.json();
      setDeals(result.deals || []);
    } catch (e) {
      console.error('Error fetching deals:', e);
      setError(e instanceof Error ? e : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id, effectiveStoreId, pipelineId]);

  // Fetch inicial
  useEffect(() => {
    fetchPipelines();
    fetchDeals();
  }, [fetchPipelines, fetchDeals]);

  // =============================================
  // REALTIME - Escutar mudanças em deals
  // ✅ MANTER organization_id nos filtros Realtime (é client-side, OK)
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
            // ✅ Usar callback para acessar estado atual e evitar sobrescrever updates locais
            setDeals(prev => {
              const currentDeal = prev.find(d => d.id === fullDeal.id);
              // Se o deal tem flag _localUpdate, ignorar o realtime update
              if (currentDeal && (currentDeal as any)._localUpdate) {
                console.log('⏭️ [Realtime] Skipping - local update in progress for', fullDeal.id);
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

  // Operações - ✅ CORRIGIDO: Agora inclui store_id
  const createDeal = async (data: any) => {
    const response = await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ...data,
        store_id: effectiveStoreId, // ✅ NOVO: Incluir store_id
      }),
    });
    if (!response.ok) throw new Error('Failed to create deal');
    const result = await response.json();
    return result.deal;
  };

  const updateDeal = async (id: string, data: any) => {
    // Atualização otimista local primeiro
    const previousDeals = [...deals]; // Guardar estado anterior para rollback
    
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
        // Reverter em caso de erro
        setDeals(previousDeals);
        throw new Error('Failed to update deal');
      }
      
      const result = await response.json();
      
      // Atualizar com dados do servidor (remove flag _localUpdate)
      setDeals(prev => prev.map(d => 
        d.id === id ? { ...result.deal, _localUpdate: undefined } : d
      ));
      
      return result.deal;
    } catch (error) {
      // Reverter em caso de qualquer erro
      setDeals(previousDeals);
      throw error;
    }
  };

  const deleteDeal = async (id: string) => {
    // Remoção otimista local primeiro
    setDeals(prev => prev.filter(d => d.id !== id));
    
    // ✅ CORRIGIDO: Sem organizationId na URL
    const response = await fetch(
      `/api/deals?id=${id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      // Reverter em caso de erro
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

// Automations hook
// ✅ AJUSTE 1: Removido organizationId das URLs - API pega do JWT
export function useAutomations() {
  const { user } = useAuthStore();
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      // ✅ CORRIGIDO: Sem organizationId na URL
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
      // ✅ CORRIGIDO: Sem organizationId no body
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
      // ✅ CORRIGIDO: Sem organizationId no body
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update automation');
    const result = await response.json();
    await fetchAutomations();
    return result.automation;
  };

  const deleteAutomation = async (id: string) => {
    // ✅ CORRIGIDO: Sem organizationId na URL
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

      // Transform profile to match User interface
      const userFromProfile = {
        id: result.profile?.id || result.user?.id,
        email: result.profile?.email || result.user?.email,
        name: result.profile?.first_name && result.profile?.last_name
          ? `${result.profile.first_name} ${result.profile.last_name}`
          : result.profile?.first_name || result.user?.email?.split('@')[0] || 'Usuário',
        avatar_url: result.profile?.avatar_url,
        organization_id: result.profile?.organization_id,
        role: result.profile?.role || 'admin',
        user_metadata: result.user?.user_metadata,
        created_at: result.profile?.created_at || new Date().toISOString(),
        updated_at: result.profile?.updated_at || new Date().toISOString(),
      };
      
      setUser(userFromProfile);
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
