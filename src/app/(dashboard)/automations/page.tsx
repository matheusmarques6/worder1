'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Zap,
  Mail,
  Users,
  DollarSign,
  X,
  Play,
  Pause,
  Trash2,
  Edit,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { FlowBuilder, getFlowDataForSave } from '@/components/flow-builder';

// ============================================
// TYPES
// ============================================

interface Automation {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'paused';
  trigger_type: string;
  nodes: any[];
  edges: any[];
  total_runs?: number;
  successful_runs?: number;
  failed_runs?: number;
  last_run_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface DashboardStats {
  activeAutomations: number;
  processedToday: number;
  conversions30d: number;
  revenue30d: number;
}

// STATS são carregados dinamicamente via API

// ============================================
// FORMATTERS
// ============================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
}

// ============================================
// TEMPLATES
// ============================================

const AUTOMATION_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    description: 'Enviar email de boas-vindas para novos contatos',
    trigger: 'trigger_signup',
    icon: '👋',
  },
  {
    id: 'abandoned',
    name: 'Carrinho Abandonado',
    description: 'Recuperar carrinhos abandonados com email',
    trigger: 'trigger_abandon',
    icon: '🛒',
  },
  {
    id: 'order',
    name: 'Pedido Realizado',
    description: 'Notificar equipe sobre novos pedidos',
    trigger: 'trigger_order',
    icon: '📦',
  },
  {
    id: 'deal',
    name: 'Deal Criado',
    description: 'Criar tarefas quando deal for criado',
    trigger: 'trigger_deal_created',
    icon: '💼',
  },
  {
    id: 'welcome-series',
    name: 'Welcome Series',
    description: 'Série de boas-vindas: 3 emails ao longo de 5 dias',
    trigger: 'trigger_signup',
    icon: '✉️',
    channels: ['email'],
  },
  {
    id: 'cart-recovery-multi',
    name: 'Recuperação Carrinho (Multi)',
    description: 'Email + WhatsApp para recuperar carrinhos abandonados',
    trigger: 'trigger_abandon',
    icon: '🛒',
    channels: ['email', 'whatsapp'],
  },
  {
    id: 'post-purchase',
    name: 'Pós-Compra',
    description: 'Confirmação + pedido de review por email',
    trigger: 'trigger_order',
    icon: '📬',
    channels: ['email'],
  },
  {
    id: 'winback',
    name: 'Win-back',
    description: 'Reengajar clientes inativos com email + WhatsApp',
    trigger: 'trigger_segment',
    icon: '💌',
    channels: ['email', 'whatsapp'],
  },
  {
    id: 'boleto-pix-reminder',
    name: 'Lembrete Boleto/PIX',
    description: 'Lembrar pagamento pendente via email e WhatsApp',
    trigger: 'trigger_order',
    icon: '💳',
    channels: ['email', 'whatsapp'],
  },
  {
    id: 'review-request',
    name: 'Pedido de Review',
    description: 'Solicitar avaliação após entrega do pedido',
    trigger: 'trigger_order_paid',
    icon: '⭐',
    channels: ['email', 'whatsapp'],
  },
  {
    id: 'vip-upgrade',
    name: 'VIP Upgrade',
    description: 'Boas-vindas ao programa VIP com benefícios',
    trigger: 'trigger_segment',
    icon: '👑',
    channels: ['email'],
  },
  {
    id: 'browse-abandonment',
    name: 'Browse Abandonment',
    description: 'Email para quem viu produto mas não comprou',
    trigger: 'trigger_webhook',
    icon: '👀',
    channels: ['email'],
  },
];

// ============================================
// MAIN COMPONENT
// ============================================

export default function AutomationsPage() {
  const { user } = useAuthStore();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const organizationId = user?.organization_id;

  // Track if mounted for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Fetch dashboard stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/automations/dashboard-stats');
        if (res.ok) {
          const data = await res.json();
          setDashboardStats(data);
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Fetch automations
  useEffect(() => {
    async function fetchAutomations() {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/automations?organizationId=${organizationId}`);
        if (res.ok) {
          const data = await res.json();
          setAutomations(data.automations || []);
        }
      } catch (e) {
        console.error('Error fetching automations:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchAutomations();
  }, [organizationId]);

  // Filter automations
  const filteredAutomations = automations.filter((automation) => {
    const matchesSearch =
      automation.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      automation.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || automation.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle new from template
  const handleNewFromTemplate = (templateId: string) => {
    const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setEditingAutomation({
        id: 'new',
        name: template.name,
        status: 'draft',
        trigger_type: template.trigger,
        nodes: [
          {
            id: `node-${Date.now()}`,
            type: template.trigger,
            position: { x: 250, y: 50 },
            data: { label: '', config: {} },
          },
        ],
        edges: [],
      });
      setShowNewModal(false);
    }
  };

  // Handle new blank
  const handleNewBlank = () => {
    setEditingAutomation({
      id: 'new',
      name: 'Nova Automação',
      status: 'draft',
      trigger_type: '',
      nodes: [],
      edges: [],
    });
    setShowNewModal(false);
  };

  // Handle edit
  const handleEdit = (automation: Automation) => {
    setEditingAutomation(automation);
  };

  // Handle save
  const handleSave = async (): Promise<string | undefined> => {
    if (!organizationId || !editingAutomation) return undefined;

    const flowData = getFlowDataForSave();
    const triggerNode = flowData.nodes.find((n: any) => n.type?.startsWith('trigger_'));
    // ✅ CORREÇÃO: Manter o prefixo trigger_ (ex: trigger_deal_created)
    const triggerType = triggerNode?.type || 'manual';

    const payload = {
      organizationId,
      name: flowData.name,
      trigger_type: triggerType,
      trigger_config: triggerNode?.data.config || {},
      nodes: flowData.nodes,
      edges: flowData.edges,
      status: flowData.status,
    };

    try {
      if (editingAutomation.id === 'new') {
        const res = await fetch('/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data.automation) {
          setAutomations((prev) => [...prev, data.automation]);
          setEditingAutomation(data.automation);
          return data.automation.id;
        } else {
          alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido'));
          return undefined;
        }
      } else {
        const res = await fetch('/api/automations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: editingAutomation.id }),
        });

        const data = await res.json();

        if (res.ok && data.automation) {
          setAutomations((prev) =>
            prev.map((a) => (a.id === data.automation.id ? data.automation : a))
          );
          setEditingAutomation(data.automation);
          return data.automation.id;
        } else {
          alert('Erro ao salvar: ' + (data.error || 'Erro desconhecido'));
          return undefined;
        }
      }
    } catch (e) {
      console.error('Error saving automation:', e);
      alert('Erro de conexão ao salvar automação.');
      return undefined;
    }
  };

  // Handle back
  const handleBack = () => {
    setEditingAutomation(null);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return;

    try {
      const res = await fetch(`/api/automations?id=${id}&organizationId=${organizationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAutomations(automations.filter((a) => a.id !== id));
      }
    } catch (e) {
      console.error('Error deleting automation:', e);
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (automation: Automation) => {
    const newStatus = automation.status === 'active' ? 'paused' : 'active';

    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: automation.id,
          organizationId,
          status: newStatus,
        }),
      });

      if (res.ok) {
        setAutomations(
          automations.map((a) => (a.id === automation.id ? { ...a, status: newStatus } : a))
        );
      }
    } catch (e) {
      console.error('Error toggling status:', e);
    }
  };

  // ============================================
  // RENDER FULLSCREEN EDITOR (Portal)
  // ============================================

  const renderFullscreenEditor = () => {
    if (!mounted) return null;

    return createPortal(
      <AnimatePresence>
        {editingAutomation && (
          <motion.div
            key="flow-builder-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-dark-900"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <FlowBuilder
              automationId={editingAutomation.id}
              automationName={editingAutomation.name}
              automationStatus={editingAutomation.status}
              initialNodes={editingAutomation.nodes || []}
              initialEdges={editingAutomation.edges || []}
              onSave={handleSave}
              onBack={handleBack}
              organizationId={organizationId}
            />
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  };

  // ============================================
  // RENDER LIST
  // ============================================

  return (
    <div className="space-y-6 p-6">
      {/* Fullscreen Editor Portal */}
      {renderFullscreenEditor()}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Automações</h1>
          <p className="text-dark-400 mt-1">Gerencie seus fluxos automatizados</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl',
            'bg-orange-500 hover:bg-orange-600 text-white font-medium',
            'transition-colors'
          )}
        >
          <Plus className="w-4 h-4" />
          Nova Automação
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Automações Ativas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Zap className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {dashboardStats?.activeAutomations || 0}
                </p>
              )}
              <p className="text-xs text-gray-500">Automações Ativas</p>
            </div>
          </div>
        </motion.div>

        {/* Processados Hoje */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Mail className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {formatNumber(dashboardStats?.processedToday || 0)}
                </p>
              )}
              <p className="text-xs text-gray-500">Processados Hoje</p>
            </div>
          </div>
        </motion.div>

        {/* Conversões */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Users className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {formatNumber(dashboardStats?.conversions30d || 0)}
                </p>
              )}
              <p className="text-xs text-gray-500">Conversões (30d)</p>
            </div>
          </div>
        </motion.div>

        {/* Receita */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <DollarSign className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(dashboardStats?.revenue30d || 0)}
                </p>
              )}
              <p className="text-xs text-gray-500">Receita (30d)</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Buscar automações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl',
              'bg-dark-800/60 border border-dark-700/50',
              'text-white placeholder-dark-500',
              'focus:outline-none focus:border-primary-500/50',
              'transition-colors'
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center bg-dark-800/60 border border-dark-700/50 rounded-xl p-1">
            {(['all', 'active', 'paused', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  statusFilter === status
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                )}
              >
                {status === 'all' && 'Todas'}
                {status === 'active' && 'Ativas'}
                {status === 'paused' && 'Pausadas'}
                {status === 'draft' && 'Rascunhos'}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-dark-800/60 border border-dark-700/50 rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'list' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'grid' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Automations List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAutomations.length === 0 ? (
        <div className="text-center py-20">
          <Zap className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400">Nenhuma automação encontrada</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 text-primary-400 hover:text-primary-300 text-sm"
          >
            Criar sua primeira automação
          </button>
        </div>
      ) : (
        <div
          className={cn(
            view === 'list' ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          )}
        >
          {filteredAutomations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              view={view}
              onEdit={() => handleEdit(automation)}
              onDelete={() => handleDelete(automation.id)}
              onToggleStatus={() => handleToggleStatus(automation)}
            />
          ))}
        </div>
      )}

      {/* New Automation Modal */}
      <AnimatePresence>
        {showNewModal && (
          <NewAutomationModal
            onClose={() => setShowNewModal(false)}
            onSelectTemplate={handleNewFromTemplate}
            onSelectBlank={handleNewBlank}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// AUTOMATION CARD
// ============================================

interface AutomationCardProps {
  automation: Automation;
  view: 'list' | 'grid';
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

function AutomationCard({ automation, view, onEdit, onDelete, onToggleStatus }: AutomationCardProps) {
  const statusConfig = {
    active: { label: 'Ativa', color: 'bg-green-100 text-green-700 border-green-200' },
    paused: { label: 'Pausada', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  };

  const { label, color } = statusConfig[automation.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-dark-800/60 border border-dark-700/50 rounded-xl',
        'hover:border-dark-600 transition-colors',
        view === 'list' ? 'p-4' : 'p-5'
      )}
    >
      <div className={cn('flex', view === 'list' ? 'items-center justify-between' : 'flex-col gap-4')}>
        {/* Info */}
        <div className={cn('flex items-center gap-4', view === 'grid' && 'w-full')}>
          <div className="p-3 bg-primary-500/15 rounded-xl">
            <Zap className="w-5 h-5 text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate">{automation.name}</h3>
            {automation.description && (
              <p className="text-sm text-dark-400 truncate">{automation.description}</p>
            )}
          </div>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border', color)}>
            {label}
          </span>
        </div>

        {/* Stats */}
        {view === 'grid' && (
          <div className="flex items-center gap-4 text-xs text-dark-400">
            {automation.total_runs !== undefined && (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3" />
                {automation.total_runs} execuções
              </span>
            )}
            {automation.successful_runs !== undefined && (
              <span className="flex items-center gap-1 text-success-400">
                <CheckCircle className="w-3 h-3" />
                {automation.successful_runs}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleStatus}
            disabled={automation.status === 'draft'}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'hover:bg-dark-700/50 text-dark-400 hover:text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {automation.status === 'active' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'hover:bg-dark-700/50 text-dark-400 hover:text-white'
            )}
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'hover:bg-error-500/20 text-dark-400 hover:text-error-400'
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// NEW AUTOMATION MODAL
// ============================================

interface NewAutomationModalProps {
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onSelectBlank: () => void;
}

function NewAutomationModal({ onClose, onSelectTemplate, onSelectBlank }: NewAutomationModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-dark-900 border border-dark-700/50 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <h2 className="text-lg font-semibold text-white">Nova Automação</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Blank */}
          <button
            onClick={onSelectBlank}
            className={cn(
              'w-full p-4 rounded-xl text-left',
              'bg-dark-800/60 border border-dark-700/50',
              'hover:border-primary-500/50 hover:bg-primary-500/5',
              'transition-colors group'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-500/15 rounded-xl">
                <Plus className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-primary-400 transition-colors">
                  Começar do Zero
                </h3>
                <p className="text-sm text-dark-400">Criar uma automação em branco</p>
              </div>
            </div>
          </button>

          {/* Templates */}
          <div>
            <h3 className="text-sm font-medium text-dark-400 mb-3">Ou escolha um template</h3>
            <div className="grid grid-cols-2 gap-3">
              {AUTOMATION_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  className={cn(
                    'bg-white border border-gray-200 rounded-lg p-4 text-left',
                    'hover:border-brand-500 hover:shadow-md',
                    'transition-all group'
                  )}
                >
                  <div className="text-2xl mb-2">{template.icon}</div>
                  <h4 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                    {template.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                  {'channels' in template && Array.isArray(template.channels) && template.channels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.channels.map((channel: string) => (
                        <span
                          key={channel}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            channel === 'email' ? 'bg-blue-100 text-blue-700' : '',
                            channel === 'whatsapp' ? 'bg-green-100 text-green-700' : ''
                          )}
                        >
                          {channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : channel}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
