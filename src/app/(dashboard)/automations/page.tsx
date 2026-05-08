'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Copy,
  Share2,
  ArrowRight as ArrowRightIcon,
  ShoppingCart,
  UserPlus,
  Package,
  ArrowRight,
  Eye,
  AlertCircle,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useStoreStore } from '@/stores';
import { FlowBuilder, getFlowDataForSave } from '@/components/flow-builder';
import { CloneToStoreModal } from '@/components/ui/CloneToStoreModal';
import { MoveToStoreModal } from '@/components/ui/MoveToStoreModal';
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
  const { currentStore } = useStoreStore();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [cloneToStoreTarget, setCloneToStoreTarget] = useState<{ id: string; name: string } | null>(null);
  const [moveToStoreTarget, setMoveToStoreTarget] = useState<{ id: string; name: string } | null>(null);
  // Orphans = flows in this org that are NOT in the active store (other store, or null store_id)
  const [orphans, setOrphans] = useState<Array<{ id: string; name: string; status: string; store_id: string | null; store_name: string | null; updated_at: string }>>([]);
  const [orphansExpanded, setOrphansExpanded] = useState(false);
  const [movingOrphanId, setMovingOrphanId] = useState<string | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);
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
      if (!currentStore?.id) return
      setStatsLoading(true);
      try {
        const statsParams = new URLSearchParams();
        if (currentStore?.id) statsParams.set('storeId', currentStore.id);
        const res = await fetch(`/api/automations/dashboard-stats?${statsParams}`);
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
  }, [currentStore?.id]);

  // Fetch automations
  useEffect(() => {
    async function fetchAutomations() {
      if (!organizationId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({ organizationId });
        if (currentStore?.id) params.set('storeId', currentStore.id);
        const res = await fetch(`/api/automations?${params}`);
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
  }, [organizationId, currentStore?.id]);

  // Fetch orphans — flows in this org that aren't in the active store.
  // Useful when a flow "disappears" because it's actually attached to
  // another store or to no store (legacy automations from before the
  // strict store_id filter existed).
  const fetchOrphans = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = new URLSearchParams();
      if (currentStore?.id) params.set('currentStoreId', currentStore.id);
      const res = await fetch(`/api/automations/orphans?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrphans(data.orphans || []);
      }
    } catch (e) {
      console.error('Error fetching orphan flows:', e);
    }
  }, [organizationId, currentStore?.id]);
  useEffect(() => { fetchOrphans(); }, [fetchOrphans]);

  // Move an orphan flow to the current store (one-click recovery)
  async function recoverOrphan(orphanId: string, orphanName: string) {
    if (!currentStore?.id) {
      setToast({ msg: 'Selecione uma loja primeiro', type: 'error' });
      return;
    }
    setMovingOrphanId(orphanId);
    try {
      const res = await fetch(`/api/automations/${orphanId}/move-to-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStoreId: currentStore.id }),
      });
      const j = await res.json();
      if (res.ok && j.success) {
        setToast({ msg: `"${orphanName}" foi movida para ${currentStore.name || 'a loja atual'}`, type: 'success' });
        // Refresh both lists: orphan goes away, main list gets the flow
        await Promise.all([fetchOrphans(), (async () => {
          const params = new URLSearchParams({ organizationId: organizationId! });
          if (currentStore?.id) params.set('storeId', currentStore.id);
          const r = await fetch(`/api/automations?${params}`);
          if (r.ok) {
            const d = await r.json();
            setAutomations(d.automations || []);
          }
        })()]);
      } else {
        setToast({ msg: j.error || 'Falha ao mover automação', type: 'error' });
      }
    } catch (e: any) {
      setToast({ msg: e.message || 'Erro de rede', type: 'error' });
    } finally {
      setMovingOrphanId(null);
    }
  }

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
        edges: template.edges,
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
          setToast({ msg: 'Erro ao salvar: ' + (data.error || 'Erro desconhecido'), type: 'error' });
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
          setToast({ msg: 'Erro ao salvar: ' + (data.error || 'Erro desconhecido'), type: 'error' });
          return undefined;
        }
      }
    } catch (e) {
      console.error('Error saving automation:', e);
      setToast({ msg: 'Erro de conexão ao salvar automação.', type: 'error' });
      return undefined;
    }
  };

  // Handle back
  const handleBack = () => {
    setEditingAutomation(null);
  };

  // Handle duplicate
  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.automation) {
          setAutomations((prev) => [data.automation, ...prev]);
        }
      }
    } catch (e) {
      console.error('Error duplicating:', e);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setConfirmDelete(null);

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

    // Validate before activating
    if (newStatus === 'active') {
      if (!automation.trigger_type || automation.trigger_type === 'manual') {
        setToast({ msg: 'Configure um gatilho antes de ativar a automação.', type: 'error' });
        return;
      }
      if (!automation.nodes || automation.nodes.length < 2) {
        setToast({ msg: 'Adicione pelo menos uma ação ao fluxo antes de ativar.', type: 'error' });
        return;
      }

      // Validate each action node has required config
      const errors: string[] = [];
      for (const node of automation.nodes) {
        const cfg = node.data?.config || {};
        const label = node.data?.label || node.type;

        if (node.type === 'action_email' || node.data?.nodeType === 'action_email') {
          if (!cfg.subject && !cfg.templateId) {
            errors.push(`Email "${label}" precisa de um assunto ou template`);
          }
          if (cfg.templateId === '__new__') {
            errors.push(`Email "${label}" tem template pendente — abra o editor para salvar`);
          }
        }

        if (node.type === 'action_whatsapp' || node.data?.nodeType === 'action_whatsapp') {
          if (!cfg.message && !cfg.templateName) {
            errors.push(`WhatsApp "${label}" precisa de uma mensagem ou template`);
          }
        }

        if (node.type === 'action_sms' || node.data?.nodeType === 'action_sms') {
          if (!cfg.message) {
            errors.push(`SMS "${label}" precisa de uma mensagem`);
          }
        }

        if (node.type === 'condition_field' || node.data?.nodeType === 'condition_field') {
          if (!cfg.field) {
            errors.push(`Condição "${label}" precisa de um campo configurado`);
          }
        }

        if (node.type === 'control_delay' || node.data?.nodeType === 'control_delay' || node.type === 'logic_delay' || node.data?.nodeType === 'logic_delay') {
          // The delay UI stores the value at config.delay.value; older
          // flows used config.value / config.minutes / config.duration.
          // The Sidebar drop produces config.delayValue (defaultConfig
          // in nodeTypes.ts). Accept all of them so legitimate flows
          // don't get blocked at activation.
          const value = Number(
            cfg?.delay?.value ??
            cfg?.value ??
            cfg?.delayValue ??
            cfg?.minutes ??
            cfg?.duration ??
            cfg?.amount ??
            0
          );
          if (!isFinite(value) || value <= 0) {
            errors.push(`Delay "${label}" precisa de um tempo configurado`);
          }
        }
      }

      if (errors.length > 0) {
        setToast({ msg: 'Corrija antes de ativar: ' + errors.join(', '), type: 'error' });
        return;
      }
    }

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
              key={editingAutomation.id}
              automationId={editingAutomation.id}
              automationName={editingAutomation.name}
              automationStatus={editingAutomation.status}
              automationStoreId={(editingAutomation as any).store_id || currentStore?.id}
              initialNodes={editingAutomation.nodes || []}
              initialEdges={editingAutomation.edges || []}
              onSave={handleSave}
              onBack={handleBack}
              organizationId={organizationId}
              automations={automations
                .filter(a => a.id !== 'new')
                .map(a => ({ id: a.id, name: a.name, status: a.status as 'active' | 'paused' | 'draft' }))
              }
              onSwitchAutomation={(id) => {
                const target = automations.find(a => a.id === id);
                if (target) setEditingAutomation(target);
              }}
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
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          <div className="flex items-center gap-2">
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="text-current opacity-50 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
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
            'bg-blue-600 hover:bg-blue-700 text-white font-medium',
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
            <div className="p-2.5 rounded-lg bg-blue-50">
              <Zap className="w-5 h-5 text-blue-600" />
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
            <div className="p-2.5 rounded-lg bg-blue-50">
              <Mail className="w-5 h-5 text-blue-600" />
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
            <div className="p-2.5 rounded-lg bg-blue-50">
              <Users className="w-5 h-5 text-blue-600" />
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
            <div className="p-2.5 rounded-lg bg-blue-50">
              <DollarSign className="w-5 h-5 text-blue-600" />
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
              'focus:outline-none focus:border-blue-400',
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
                    ? 'bg-blue-600 text-white'
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

        </div>
      </div>

      {/* Orphan flows recovery banner — shows automations that exist
          in this org but aren't in the active store. One-click "Trazer
          pra cá" moves the flow to the current store. */}
      {orphans.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setOrphansExpanded(v => !v)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-amber-100/50 transition-colors text-left"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-amber-900">
                {orphans.length} {orphans.length === 1 ? 'fluxo está' : 'fluxos estão'} em outra loja ou sem loja
              </p>
              <p className="text-[11.5px] text-amber-700">
                Clique pra ver e trazer{orphans.length === 1 ? '-lo' : '-los'} para {currentStore?.name || 'esta loja'}.
              </p>
            </div>
            {orphansExpanded ? <ChevronUp className="w-4 h-4 text-amber-700" /> : <ChevronDown className="w-4 h-4 text-amber-700" />}
          </button>
          {orphansExpanded && (
            <div className="border-t border-amber-200 divide-y divide-amber-100 max-h-[400px] overflow-y-auto bg-white">
              {orphans.map(o => (
                <div key={o.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{o.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {o.store_name ? (
                        <>Atualmente em: <span className="font-medium text-gray-700">{o.store_name}</span></>
                      ) : (
                        <span className="italic">Sem loja atribuída (legacy)</span>
                      )}
                      {' · '}
                      <span className={cn(
                        'font-medium',
                        o.status === 'active' && 'text-emerald-700',
                        o.status === 'paused' && 'text-amber-700',
                        o.status === 'draft' && 'text-gray-500',
                      )}>{o.status}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => recoverOrphan(o.id, o.name)}
                    disabled={movingOrphanId === o.id || !currentStore?.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex-shrink-0"
                    title={`Mover para ${currentStore?.name || 'loja atual'}`}
                  >
                    {movingOrphanId === o.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                    )}
                    Trazer pra cá
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Automations Table — Omnisend/Klaviyo style */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAutomations.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Zap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhuma automacao encontrada</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Criar sua primeira automacao
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <div className="col-span-4">Flow</div>
            <div className="col-span-1 text-center">Type</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1">Date</div>
            <div className="col-span-1 text-right">Sent</div>
            <div className="col-span-1 text-right">Open rate</div>
            <div className="col-span-1 text-right">Click rate</div>
            <div className="col-span-1 text-right">Revenue</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table rows */}
          {filteredAutomations.map((automation) => {
            const TriggerIcon = TRIGGER_ICON_MAP[automation.trigger_type] || Zap;
            const statusColors: Record<string, string> = {
              active: 'bg-green-50 text-green-700 border border-green-200',
              paused: 'bg-amber-50 text-amber-700 border border-amber-200',
              draft: 'bg-gray-50 text-gray-500 border border-gray-200',
            };
            const statusLabels: Record<string, string> = {
              active: 'Ativa', paused: 'Pausada', draft: 'Rascunho',
            };
            const statusDots: Record<string, string> = {
              active: 'bg-green-500',
              paused: 'bg-amber-500',
              draft: 'bg-gray-400',
            };

            // Map trigger_type to readable event name
            const triggerEventNames: Record<string, string> = {
              trigger_abandon: 'Abandoned Cart',
              trigger_checkout_abandoned: 'Checkout Started',
              trigger_order: 'Placed Order',
              trigger_order_paid: 'Order Paid',
              trigger_fulfilled_order: 'Fulfilled Order',
              trigger_cancelled_order: 'Cancelled Order',
              trigger_viewed_product: 'Viewed Product',
              trigger_added_to_cart: 'Added to Cart',
              trigger_signup: 'Customer Created',
              trigger_form_submitted: 'Form Submitted',
              trigger_segment: 'Entered Segment',
              trigger_tag: 'Tag Added',
              trigger_date: 'Date Property',
              trigger_custom_event: 'Custom Event',
              trigger_webhook: 'Webhook',
              trigger_deal_created: 'Deal Created',
              trigger_deal_stage: 'Deal Stage Changed',
              trigger_deal_won: 'Deal Won',
              trigger_deal_lost: 'Deal Lost',
              trigger_whatsapp: 'WhatsApp Received',
            };
            const eventName = triggerEventNames[automation.trigger_type] || automation.trigger_type?.replace('trigger_', '').replace(/_/g, ' ');

            return (
              <div
                key={automation.id}
                className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50/60 transition-colors cursor-pointer items-center"
                onClick={() => handleEdit(automation)}
              >
                {/* Name + event name */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <TriggerIcon className="w-4.5 h-4.5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-blue-600 hover:text-blue-700 truncate">{automation.name}</p>
                    <p className="text-xs text-gray-400 truncate">{eventName}</p>
                  </div>
                </div>

                {/* Type icon */}
                <div className="col-span-1 flex justify-center">
                  <Mail className="w-4 h-4 text-gray-400" />
                </div>

                {/* Status */}
                <div className="col-span-1 flex justify-center">
                  <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium', statusColors[automation.status] || statusColors.draft)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', statusDots[automation.status] || statusDots.draft)} />
                    {statusLabels[automation.status] || 'Rascunho'}
                  </span>
                </div>

                {/* Date */}
                <div className="col-span-1 text-xs text-gray-500">
                  {automation.updated_at
                    ? new Date(automation.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                    : '--'}
                </div>

                {/* Sent */}
                <div className="col-span-1 text-right text-sm text-gray-700 font-medium tabular-nums">
                  {automation.total_runs || '--'}
                </div>

                {/* Open rate */}
                <div className="col-span-1 text-right text-sm text-gray-700 tabular-nums">
                  --
                </div>

                {/* Click rate */}
                <div className="col-span-1 text-right text-sm text-gray-700 tabular-nums">
                  --
                </div>

                {/* Revenue */}
                <div className="col-span-1 text-right text-sm font-medium text-gray-900 tabular-nums">
                  R$0.00
                </div>

                {/* Actions */}
                <div className="col-span-1 flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleStatus(automation)}
                    disabled={automation.status === 'draft'}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    {automation.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDuplicate(automation.id)}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Duplicar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setCloneToStoreTarget({ id: automation.id, name: automation.name })}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Clonar para outra loja"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setMoveToStoreTarget({ id: automation.id, name: automation.name })}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Mover para outra loja"
                  >
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                  {confirmDelete === automation.id ? (
                    <button
                      onClick={() => handleDelete(automation.id)}
                      onBlur={() => setConfirmDelete(null)}
                      className="px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-medium"
                      autoFocus
                    >
                      Confirmar
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(automation.id)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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

      {/* Clone to Store modal */}
      {cloneToStoreTarget && (
        <CloneToStoreModal
          open={!!cloneToStoreTarget}
          onClose={() => setCloneToStoreTarget(null)}
          endpoint={`/api/automations/${cloneToStoreTarget.id}/clone-to-store`}
          resourceName={cloneToStoreTarget.name}
          resourceLabel="Automação"
          currentStoreId={currentStore?.id}
          showSubresourceCount
          subresourceLabel="template"
          onCloned={() => {
            setToast({ msg: `Automação clonada com sucesso!`, type: 'success' });
          }}
        />
      )}

      {/* Move to Store modal */}
      {moveToStoreTarget && (
        <MoveToStoreModal
          open={!!moveToStoreTarget}
          onClose={() => setMoveToStoreTarget(null)}
          endpoint={`/api/automations/${moveToStoreTarget.id}/move-to-store`}
          resourceName={moveToStoreTarget.name}
          resourceLabel="Automação"
          currentStoreId={currentStore?.id}
          onMoved={() => {
            // Reload list since the moved automation no longer belongs to current store
            window.location.reload();
          }}
        />
      )}
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
              'hover:border-blue-300 hover:bg-blue-50',
              'transition-colors group'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
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
