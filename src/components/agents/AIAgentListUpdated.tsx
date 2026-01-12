'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Plus,
  Search,
  Power,
  PowerOff,
  Trash2,
  Settings,
  MessageSquare,
  MoreVertical,
  Loader2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Clock,
  Zap,
  Store,
} from 'lucide-react';
import AIAgentEditor from './AIAgentEditor';
import { CreateAgentFlow } from './create';
import { AIAgent } from '@/lib/ai/types';
import { AgentListSkeleton, StatsGridSkeleton } from './create/Skeletons';

interface AIAgentListProps {
  organizationId: string;
}

interface ShopifyStore {
  id: string;
  shop_domain: string;
  shop_name: string;
  is_connected: boolean;
}

export default function AIAgentListUpdated({ organizationId }: AIAgentListProps) {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [shopifyStore, setShopifyStore] = useState<ShopifyStore | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch agents
  useEffect(() => {
    fetchAgents();
    fetchShopifyStore();
  }, [organizationId]);

  const fetchAgents = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/ai/agents?organization_id=${organizationId}`);
      if (!res.ok) throw new Error('Erro ao carregar agentes');

      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchShopifyStore = async () => {
    try {
      const res = await fetch(`/api/shopify/stores?organization_id=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        const connected = (data.stores || []).find((s: ShopifyStore) => s.is_connected);
        setShopifyStore(connected || null);
      }
    } catch (err) {
      console.error('Error fetching shopify store:', err);
    }
  };

  // Toggle agent active status
  const handleToggleActive = async (agent: AIAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingId(agent.id);

    try {
      const res = await fetch(`/api/ai/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          is_active: !agent.is_active,
        }),
      });

      if (res.ok) {
        setAgents(agents.map((a) => (a.id === agent.id ? { ...a, is_active: !a.is_active } : a)));
      }
    } catch (err) {
      console.error('Error toggling agent:', err);
    } finally {
      setTogglingId(null);
    }
  };

  // Delete agent
  const handleDelete = async (agentId: string) => {
    if (!confirm('Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita.'))
      return;

    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAgents(agents.filter((a) => a.id !== agentId));
        setMenuOpenId(null);
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
    }
  };

  // Safe agents array
  const safeAgents = Array.isArray(agents) ? agents : [];

  // Filter agents
  const filteredAgents = safeAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && agent.is_active) ||
      (filterStatus === 'inactive' && !agent.is_active);
    return matchesSearch && matchesFilter;
  });

  // Stats
  const activeAgents = safeAgents.filter((a) => a.is_active).length;
  const totalMessages = safeAgents.reduce((sum, a) => sum + (a.total_messages || 0), 0);
  const totalConversations = safeAgents.reduce((sum, a) => sum + (a.total_conversations || 0), 0);

  // Format number
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <>
      <div className="h-full flex flex-col bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Agentes de IA</h2>
              <p className="text-sm text-zinc-500">Gerencie seus assistentes inteligentes</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateFlow(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Novo Agente
          </button>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-zinc-800">
          {loading ? (
            <StatsGridSkeleton />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
                className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50"
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-1">
                  <Bot className="w-4 h-4" />
                  <span className="text-xs">Total de Agentes</span>
                </div>
                <p className="text-2xl font-bold text-white">{safeAgents.length}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50"
              >
                <div className="flex items-center gap-2 text-green-400 mb-1">
                  <Power className="w-4 h-4" />
                  <span className="text-xs">Ativos</span>
                </div>
                <p className="text-2xl font-bold text-white">{activeAgents}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50"
              >
                <div className="flex items-center gap-2 text-blue-400 mb-1">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-xs">Mensagens</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatNumber(totalMessages)}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50"
              >
                <div className="flex items-center gap-2 text-purple-400 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">Conversas</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatNumber(totalConversations)}</p>
              </motion.div>
            </div>
          )}
        </div>

        {/* Connected Store Banner */}
        {shopifyStore && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mx-4 mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <Store className="w-5 h-5 text-green-400" />
              <div className="flex-1">
                <p className="text-sm text-green-300">
                  <strong>{shopifyStore.shop_name}</strong> conectada
                </p>
                <p className="text-xs text-green-400/70">
                  Ao criar um agente, podemos analisar sua loja automaticamente
                </p>
              </div>
              <Sparkles className="w-4 h-4 text-green-400" />
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 p-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar agentes..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {status === 'all' ? 'Todos' : status === 'active' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <AgentListSkeleton count={3} />
          ) : error ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
              <p className="text-white mb-2">Erro ao carregar agentes</p>
              <p className="text-sm text-zinc-400 mb-4">{error}</p>
              <button
                onClick={fetchAgents}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl transition-colors"
              >
                Tentar novamente
              </button>
            </motion.div>
          ) : filteredAgents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mb-4">
                <Sparkles className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {searchQuery || filterStatus !== 'all'
                  ? 'Nenhum agente encontrado'
                  : 'Crie seu primeiro agente'}
              </h3>
              <p className="text-sm text-zinc-400 text-center max-w-md mb-6">
                {searchQuery || filterStatus !== 'all'
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Agentes de IA podem responder automaticamente às mensagens dos seus clientes, 24 horas por dia.'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <button
                  onClick={() => setShowCreateFlow(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
                >
                  <Zap className="w-5 h-5" />
                  Criar Agente com IA
                </button>
              )}
            </motion.div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredAgents.map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`bg-zinc-800/50 border rounded-xl p-4 cursor-pointer transition-all ${
                      agent.is_active
                        ? 'border-zinc-700/50 hover:border-blue-500/30'
                        : 'border-zinc-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          agent.is_active
                            ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20'
                            : 'bg-zinc-700'
                        }`}
                      >
                        <Bot
                          className={`w-6 h-6 ${agent.is_active ? 'text-blue-400' : 'text-zinc-500'}`}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-medium truncate">{agent.name}</h3>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              agent.is_active
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-zinc-700 text-zinc-500'
                            }`}
                          >
                            {agent.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>

                        {agent.description && (
                          <p className="text-sm text-zinc-400 truncate mb-2">{agent.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            {agent.provider} • {agent.model}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {formatNumber(agent.total_messages || 0)} msgs
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(agent.updated_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleActive(agent, e)}
                          disabled={togglingId === agent.id}
                          className={`p-2 rounded-lg transition-colors ${
                            agent.is_active
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-zinc-700 text-zinc-500 hover:text-white'
                          }`}
                          title={agent.is_active ? 'Desativar' : 'Ativar'}
                        >
                          {togglingId === agent.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : agent.is_active ? (
                            <Power className="w-4 h-4" />
                          ) : (
                            <PowerOff className="w-4 h-4" />
                          )}
                        </button>

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === agent.id ? null : agent.id);
                            }}
                            className="p-2 rounded-lg bg-zinc-700/50 text-zinc-400 hover:text-white transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          <AnimatePresence>
                            {menuOpenId === agent.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setSelectedAgentId(agent.id);
                                    setMenuOpenId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                                >
                                  <Settings className="w-4 h-4" />
                                  Configurar
                                </button>
                                <button
                                  onClick={() => handleDelete(agent.id)}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Excluir
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Agent Editor Drawer */}
      <AnimatePresence>
        {selectedAgentId && (
          <AIAgentEditor
            agentId={selectedAgentId}
            organizationId={organizationId}
            onClose={() => setSelectedAgentId(null)}
            onUpdate={fetchAgents}
            onDelete={fetchAgents}
          />
        )}
      </AnimatePresence>

      {/* Create Agent Flow (Fullscreen) */}
      <AnimatePresence>
        {showCreateFlow && (
          <CreateAgentFlow
            organizationId={organizationId}
            storeId={shopifyStore?.id}
            onClose={() => setShowCreateFlow(false)}
            onSuccess={(newAgentId) => {
              setShowCreateFlow(false);
              setSelectedAgentId(newAgentId);
              fetchAgents();
            }}
          />
        )}
      </AnimatePresence>

      {/* Click outside to close menu */}
      {menuOpenId && <div className="fixed inset-0 z-0" onClick={() => setMenuOpenId(null)} />}
    </>
  );
}
