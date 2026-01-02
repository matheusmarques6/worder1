// =============================================
// CRM REALTIME HOOK - Supabase Realtime
// Escuta deals e contatos em tempo real
// =============================================

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient as supabase } from '@/lib/supabase-client';

// =============================================
// TYPES
// =============================================

interface Deal {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  pipeline_id: string;
  contact_id?: string;
  probability: number;
  status: string;
  [key: string]: any;
}

interface Contact {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

interface UseCRMRealtimeOptions {
  organizationId?: string;
  pipelineId?: string;
  onDealInsert?: (deal: Deal) => void;
  onDealUpdate?: (deal: Deal) => void;
  onDealDelete?: (dealId: string) => void;
  onContactInsert?: (contact: Contact) => void;
  onContactUpdate?: (contact: Contact) => void;
  onContactDelete?: (contactId: string) => void;
}

// =============================================
// HOOK PRINCIPAL
// =============================================

export function useCRMRealtime(options: UseCRMRealtimeOptions = {}) {
  const {
    organizationId,
    pipelineId,
    onDealInsert,
    onDealUpdate,
    onDealDelete,
    onContactInsert,
    onContactUpdate,
    onContactDelete,
  } = options;

  const dealsChannelRef = useRef<RealtimeChannel | null>(null);
  const contactsChannelRef = useRef<RealtimeChannel | null>(null);

  // =============================================
  // SUBSCRIÇÃO DE DEALS
  // =============================================
  useEffect(() => {
    if (!organizationId) return;

    // Unsubscribe anterior se existir
    if (dealsChannelRef.current) {
      dealsChannelRef.current.unsubscribe();
    }

    const channelName = pipelineId 
      ? `deals:${organizationId}:${pipelineId}`
      : `deals:${organizationId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          console.log('🆕 New deal:', payload.new);
          const newDeal = payload.new as Deal;
          
          // Buscar dados completos do deal (com contact)
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
            onDealInsert?.(fullDeal);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          console.log('✏️ Deal updated:', payload.new);
          const updatedDeal = payload.new as Deal;
          
          // Buscar dados completos
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
            onDealUpdate?.(fullDeal);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'deals',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('🗑️ Deal deleted:', payload.old);
          const deletedDeal = payload.old as { id: string };
          onDealDelete?.(deletedDeal.id);
        }
      )
      .subscribe((status) => {
        console.log('🔌 Deals realtime status:', status);
      });

    dealsChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [organizationId, pipelineId, onDealInsert, onDealUpdate, onDealDelete]);

  // =============================================
  // SUBSCRIÇÃO DE CONTATOS
  // =============================================
  useEffect(() => {
    if (!organizationId) return;

    // Unsubscribe anterior se existir
    if (contactsChannelRef.current) {
      contactsChannelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`contacts:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          console.log('🆕 New contact:', payload.new);
          const newContact = payload.new as Contact;
          
          // Buscar contagem de deals
          const { count } = await supabase
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', newContact.id);
          
          onContactInsert?.({ ...newContact, deals_count: count || 0 });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          console.log('✏️ Contact updated:', payload.new);
          const updatedContact = payload.new as Contact;
          
          // Buscar contagem de deals
          const { count } = await supabase
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', updatedContact.id);
          
          onContactUpdate?.({ ...updatedContact, deals_count: count || 0 });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('🗑️ Contact deleted:', payload.old);
          const deletedContact = payload.old as { id: string };
          onContactDelete?.(deletedContact.id);
        }
      )
      .subscribe((status) => {
        console.log('🔌 Contacts realtime status:', status);
      });

    contactsChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [organizationId, onContactInsert, onContactUpdate, onContactDelete]);

  // =============================================
  // CLEANUP
  // =============================================
  useEffect(() => {
    return () => {
      dealsChannelRef.current?.unsubscribe();
      contactsChannelRef.current?.unsubscribe();
    };
  }, []);

  return {
    isConnected: true, // Podemos adicionar estado de conexão se necessário
  };
}

// =============================================
// HOOK SIMPLIFICADO PARA DEALS
// =============================================

interface UseDealsRealtimeOptions {
  organizationId?: string;
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
}

export function useDealsRealtime({ organizationId, deals, setDeals }: UseDealsRealtimeOptions) {
  const handleDealInsert = useCallback((newDeal: Deal) => {
    setDeals(prev => {
      // Evitar duplicatas
      if (prev.some(d => d.id === newDeal.id)) return prev;
      return [newDeal, ...prev];
    });
  }, [setDeals]);

  const handleDealUpdate = useCallback((updatedDeal: Deal) => {
    setDeals(prev => prev.map(d => 
      d.id === updatedDeal.id ? { ...d, ...updatedDeal } : d
    ));
  }, [setDeals]);

  const handleDealDelete = useCallback((dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId));
  }, [setDeals]);

  useCRMRealtime({
    organizationId,
    onDealInsert: handleDealInsert,
    onDealUpdate: handleDealUpdate,
    onDealDelete: handleDealDelete,
  });
}

// =============================================
// HOOK SIMPLIFICADO PARA CONTATOS
// =============================================

interface UseContactsRealtimeOptions {
  organizationId?: string;
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
}

export function useContactsRealtime({ organizationId, contacts, setContacts }: UseContactsRealtimeOptions) {
  const handleContactInsert = useCallback((newContact: Contact) => {
    setContacts(prev => {
      // Evitar duplicatas
      if (prev.some(c => c.id === newContact.id)) return prev;
      return [newContact, ...prev];
    });
  }, [setContacts]);

  const handleContactUpdate = useCallback((updatedContact: Contact) => {
    setContacts(prev => prev.map(c => 
      c.id === updatedContact.id ? { ...c, ...updatedContact } : c
    ));
  }, [setContacts]);

  const handleContactDelete = useCallback((contactId: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
  }, [setContacts]);

  useCRMRealtime({
    organizationId,
    onContactInsert: handleContactInsert,
    onContactUpdate: handleContactUpdate,
    onContactDelete: handleContactDelete,
  });
}
