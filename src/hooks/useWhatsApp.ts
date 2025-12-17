'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWhatsAppStore } from '@/stores';

// ===============================
// API Helper
// ===============================
async function api(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

// ===============================
// useWhatsAppConversations
// ===============================
export function useWhatsAppConversations() {
  const { 
    conversations, setConversations, 
    selectedConversation, setSelectedConversation,
    isLoading, setLoading 
  } = useWhatsAppStore();
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async (opts?: { status?: string; search?: string }) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (opts?.status) params.set('status', opts.status);
      if (opts?.search) params.set('search', opts.search);
      const data = await api(`/api/whatsapp/conversations?${params}`);
      setConversations(data.conversations);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setConversations, setLoading]);

  const createConversation = useCallback(async (phoneNumber: string, contactName?: string) => {
    try {
      setLoading(true);
      const data = await api('/api/whatsapp/conversations', {
        method: 'POST',
        body: JSON.stringify({ phone_number: phoneNumber, contact_name: contactName }),
      });
      setConversations([data.conversation, ...conversations]);
      return data.conversation;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [conversations, setConversations, setLoading]);

  const updateConversation = useCallback(async (id: string, updates: any) => {
    try {
      const data = await api('/api/whatsapp/conversations', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...updates }),
      });
      setConversations(conversations.map(c => c.id === id ? data.conversation : c));
      if (selectedConversation?.id === id) setSelectedConversation(data.conversation);
      return data.conversation;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [conversations, selectedConversation, setConversations, setSelectedConversation]);

  return {
    conversations, selectedConversation, setSelectedConversation,
    isLoading, error, fetchConversations, createConversation, updateConversation,
  };
}

// ===============================
// useWhatsAppMessages
// ===============================
export function useWhatsAppMessages(conversationId: string | null) {
  const { messages, setMessages, addMessage } = useWhatsAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMessages = conversationId ? messages[conversationId] || [] : [];

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await api(`/api/whatsapp/messages?conversation_id=${conversationId}`);
      setMessages(conversationId, data.messages);
      return data.messages;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, setMessages]);

  const sendMessage = useCallback(async (content: string, opts?: any) => {
    if (!conversationId) return;
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, content, ...opts }),
      });
      if (data.message) addMessage(conversationId, data.message);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, addMessage]);

  useEffect(() => {
    if (conversationId && !messages[conversationId]) fetchMessages();
  }, [conversationId, messages, fetchMessages]);

  return { messages: currentMessages, isLoading, error, fetchMessages, sendMessage };
}

// ===============================
// useWhatsAppCampaigns
// ===============================
export function useWhatsAppCampaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async (status?: string) => {
    try {
      setIsLoading(true);
      const params = status ? `?status=${status}` : '';
      const data = await api(`/api/whatsapp/campaigns${params}`);
      setCampaigns(data.campaigns);
      return data.campaigns;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (campaign: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaign),
      });
      setCampaigns([data.campaign, ...campaigns]);
      return data.campaign;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [campaigns]);

  const controlCampaign = useCallback(async (id: string, action: string) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/campaigns', {
        method: 'PATCH',
        body: JSON.stringify({ id, action }),
      });
      setCampaigns(campaigns.map(c => c.id === id ? data.campaign : c));
      return data.campaign;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [campaigns]);

  const deleteCampaign = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/campaigns?id=${id}`, { method: 'DELETE' });
      setCampaigns(campaigns.filter(c => c.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [campaigns]);

  return { campaigns, isLoading, error, fetchCampaigns, createCampaign, controlCampaign, deleteCampaign };
}

// ===============================
// useWhatsAppFlows
// ===============================
export function useWhatsAppFlows() {
  const [flows, setFlows] = useState<any[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/flows');
      setFlows(data.flows);
      return data.flows;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchFlow = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const data = await api(`/api/whatsapp/flows?id=${id}`);
      setSelectedFlow(data.flow);
      return data.flow;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createFlow = useCallback(async (name: string, opts?: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/flows', {
        method: 'POST',
        body: JSON.stringify({ name, ...opts }),
      });
      setFlows([data.flow, ...flows]);
      return data.flow;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [flows]);

  const updateFlow = useCallback(async (id: string, updates: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/flows', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...updates }),
      });
      setFlows(flows.map(f => f.id === id ? data.flow : f));
      if (selectedFlow?.id === id) setSelectedFlow(data.flow);
      return data.flow;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [flows, selectedFlow]);

  const deleteFlow = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/flows?id=${id}`, { method: 'DELETE' });
      setFlows(flows.filter(f => f.id !== id));
      if (selectedFlow?.id === id) setSelectedFlow(null);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [flows, selectedFlow]);

  return { flows, selectedFlow, setSelectedFlow, isLoading, error, fetchFlows, fetchFlow, createFlow, updateFlow, deleteFlow };
}

// ===============================
// useWhatsAppPhonebooks
// ===============================
export function useWhatsAppPhonebooks() {
  const [phonebooks, setPhonebooks] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhonebooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/phonebooks');
      setPhonebooks(data.phonebooks);
      return data.phonebooks;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async (phonebookId: string, opts?: any) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ phonebook_id: phonebookId });
      if (opts?.search) params.set('search', opts.search);
      const data = await api(`/api/whatsapp/phonebooks?${params}`);
      setContacts(data.contacts);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPhonebook = useCallback(async (name: string, description?: string) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/phonebooks', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_phonebook', name, description }),
      });
      setPhonebooks([data.phonebook, ...phonebooks]);
      return data.phonebook;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [phonebooks]);

  const addContacts = useCallback(async (phonebookId: string, contacts: any[]) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/phonebooks', {
        method: 'POST',
        body: JSON.stringify({ action: 'add_contacts', phonebook_id: phonebookId, contacts }),
      });
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importCSV = useCallback(async (phonebookId: string, csvData: string) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/phonebooks', {
        method: 'POST',
        body: JSON.stringify({ action: 'import_csv', phonebook_id: phonebookId, csv_data: csvData }),
      });
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deletePhonebook = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/phonebooks?id=${id}`, { method: 'DELETE' });
      setPhonebooks(phonebooks.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [phonebooks]);

  return { phonebooks, contacts, isLoading, error, fetchPhonebooks, fetchContacts, createPhonebook, addContacts, importCSV, deletePhonebook };
}

// ===============================
// useWhatsAppTags
// ===============================
export function useWhatsAppTags() {
  const [tags, setTags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/tags');
      setTags(data.tags);
      return data.tags;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createTag = useCallback(async (title: string, color?: string) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/tags', {
        method: 'POST',
        body: JSON.stringify({ title, color }),
      });
      setTags([data.tag, ...tags]);
      return data.tag;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [tags]);

  const assignTag = useCallback(async (conversationId: string, tagId: string) => {
    await api('/api/whatsapp/tags', {
      method: 'POST',
      body: JSON.stringify({ action: 'assign', conversation_id: conversationId, tag_id: tagId }),
    });
  }, []);

  const removeTag = useCallback(async (conversationId: string, tagId: string) => {
    await api('/api/whatsapp/tags', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove', conversation_id: conversationId, tag_id: tagId }),
    });
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/tags?id=${id}`, { method: 'DELETE' });
      setTags(tags.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [tags]);

  return { tags, isLoading, error, fetchTags, createTag, assignTag, removeTag, deleteTag };
}

// ===============================
// useWhatsAppAgents
// ===============================
export function useWhatsAppAgents() {
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async (includeStats = false) => {
    try {
      setIsLoading(true);
      const params = includeStats ? '?include_stats=true' : '';
      const data = await api(`/api/whatsapp/agents${params}`);
      setAgents(data.agents);
      return data.agents;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAgent = useCallback(async (agent: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/agents', {
        method: 'POST',
        body: JSON.stringify(agent),
      });
      setAgents([data.agent, ...agents]);
      return data.agent;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [agents]);

  const assignChat = useCallback(async (conversationId: string, agentId: string | null) => {
    await api('/api/whatsapp/agents', {
      method: 'POST',
      body: JSON.stringify({ action: 'assign', conversation_id: conversationId, agent_id: agentId }),
    });
  }, []);

  const resolveChat = useCallback(async (conversationId: string) => {
    await api('/api/whatsapp/agents', {
      method: 'POST',
      body: JSON.stringify({ action: 'resolve', conversation_id: conversationId }),
    });
  }, []);

  const updateAgent = useCallback(async (id: string, updates: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/agents', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...updates }),
      });
      setAgents(agents.map(a => a.id === id ? data.agent : a));
      return data.agent;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [agents]);

  const deleteAgent = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/agents?id=${id}`, { method: 'DELETE' });
      setAgents(agents.filter(a => a.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [agents]);

  return { agents, isLoading, error, fetchAgents, createAgent, assignChat, resolveChat, updateAgent, deleteAgent };
}

// ===============================
// useWhatsAppTemplates
// ===============================
export function useWhatsAppTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async (opts?: { status?: string; category?: string }) => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (opts?.status) params.set('status', opts.status);
      if (opts?.category) params.set('category', opts.category);
      const data = await api(`/api/whatsapp/templates?${params}`);
      setTemplates(data.templates);
      return data.templates;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createTemplate = useCallback(async (template: any) => {
    try {
      setIsLoading(true);
      const data = await api('/api/whatsapp/templates', {
        method: 'POST',
        body: JSON.stringify(template),
      });
      await fetchTemplates();
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (name: string) => {
    try {
      setIsLoading(true);
      await api(`/api/whatsapp/templates?name=${name}`, { method: 'DELETE' });
      setTemplates(templates.filter(t => t.name !== name));
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [templates]);

  return { templates, isLoading, error, fetchTemplates, createTemplate, deleteTemplate };
}
