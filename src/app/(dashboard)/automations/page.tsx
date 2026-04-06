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
  ShoppingCart,
  UserPlus,
  Package,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { FlowBuilder, getFlowDataForSave } from '@/components/flow-builder';
import { FLOW_TEMPLATES } from '@/lib/automation/flow-templates';
import type { FlowTemplate } from '@/lib/automation/flow-templates';

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

// Icon mapping for flow templates
const TEMPLATE_ICONS: Record<string, typeof ShoppingCart> = {
  'abandoned-cart': ShoppingCart,
  'welcome-series': UserPlus,
  'post-purchase': Package,
  'winback': ArrowRight,
  'browse-abandonment': Eye,
};

function getTemplateIcon(templateId: string) {
  return TEMPLATE_ICONS[templateId] || Zap;
}

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
    const template = FLOW_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setEditingAutomation({
        id: 'new',
        name: template.name,
        status: 'draft',
        trigger_type: template.triggerType,
        nodes: template.nodes,
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
            className="fixed inset-0 z-[9999] bg-white"
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
          <h1 className="text-2xl font-bold text-gray-900">Automações</h1>
          <p className="text-gray-500 mt-1">Gerencie seus fluxos automatizados</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl',
            'bg-primary-500 hover:bg-primary-600 text-white font-medium',
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
          className="p-4 bg-white border border-gray-200 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Zap className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
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
          className="p-4 bg-white border border-gray-200 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Mail className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
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
          className="p-4 bg-white border border-gray-200 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <Users className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
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
          className="p-4 bg-white border border-gray-200 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary-500/15">
              <DollarSign className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              {statsLoading ? (
                <div className="h-6 w-12 bg-gray-100 rounded animate-pulse" />
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar automações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl',
              'bg-white border border-gray-200',
              'text-gray-900 placeholder-gray-400',
              'focus:outline-none focus:border-brand-400',
              'transition-colors'
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            {(['all', 'active', 'paused', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  statusFilter === status
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
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
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-900'
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
          <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Nenhuma automação encontrada</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 text-brand-600 hover:text-brand-500 text-sm"
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

// Trigger type to icon mapping
const TRIGGER_ICON_MAP: Record<string, typeof ShoppingCart> = {
  trigger_abandon: ShoppingCart,
  trigger_checkout_abandoned: ShoppingCart,
  trigger_order: Package,
  trigger_order_paid: Package,
  trigger_signup: UserPlus,
  trigger_form_submitted: Mail,
  trigger_viewed_product: Eye,
  trigger_segment: Users,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function AutomationCard({ automation, view, onEdit, onDelete, onToggleStatus }: AutomationCardProps) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    draft: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  const statusLabels: Record<string, string> = { active: 'Ativa', paused: 'Pausada', draft: 'Rascunho' };
  const TriggerIcon = TRIGGER_ICON_MAP[automation.trigger_type] || Zap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white border border-gray-200 rounded-xl',
        'hover:border-gray-300 hover:shadow-sm transition-all',
        view === 'list' ? 'p-4' : 'p-5'
      )}
    >
      <div className={cn('flex', view === 'list' ? 'items-center justify-between' : 'flex-col gap-4')}>
        {/* Info */}
        <div className={cn('flex items-center gap-4', view === 'grid' && 'w-full')}>
          <div className="p-3 bg-emerald-50 rounded-xl">
            <TriggerIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{automation.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {automation.description && (
                <p className="text-sm text-gray-500 truncate">{automation.description}</p>
              )}
              {automation.last_run_at && (
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {formatTimeAgo(automation.last_run_at)}
                </span>
              )}
            </div>
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-medium border', statusColors[automation.status] || statusColors.draft)}>
            {statusLabels[automation.status] || 'Rascunho'}
          </span>
        </div>

        {/* Stats */}
        {view === 'grid' && (
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {automation.total_runs !== undefined && (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3" />
                {automation.total_runs} execuções
              </span>
            )}
            {automation.successful_runs !== undefined && (
              <span className="flex items-center gap-1 text-green-600">
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
              'hover:bg-gray-100 text-gray-500 hover:text-gray-900',
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
              'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
            )}
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'hover:bg-error-500/20 text-gray-500 hover:text-error-400'
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
        className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Nova Automação</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
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
              'bg-white border border-gray-200',
              'hover:border-brand-400 hover:bg-primary-500/5',
              'transition-colors group'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-500/15 rounded-xl">
                <Plus className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                  Começar do Zero
                </h3>
                <p className="text-sm text-gray-500">Criar uma automação em branco</p>
              </div>
            </div>
          </button>

          {/* Templates */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Ou escolha um template</h3>
            <div className="grid grid-cols-2 gap-3">
              {FLOW_TEMPLATES.map((template) => {
                const Icon = getTemplateIcon(template.id);
                const emailCount = template.nodes.filter(n => n.data.category === 'action').length;
                return (
                  <button
                    key={template.id}
                    onClick={() => onSelectTemplate(template.id)}
                    className={cn(
                      'p-4 rounded-xl text-left',
                      'bg-white border border-gray-200',
                      'hover:border-blue-300 hover:bg-blue-50/30',
                      'transition-colors group'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-emerald-50">
                        <Icon className="w-4 h-4 text-emerald-600" />
                      </div>
                      {template.tags.includes('Recomendado') && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Recomendado</span>
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors text-sm">
                      {template.name}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{template.description}</p>
                    <p className="text-[10px] text-gray-400 mt-2">
                      {emailCount} email{emailCount !== 1 ? 's' : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
