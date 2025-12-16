'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import {
  AutomationCanvas,
  AutomationListItem,
  AutomationTemplateCard,
  AUTOMATION_TEMPLATES,
} from '@/components/automation';
import { AutomationNode, AutomationEdge } from '@/types';
import { cn } from '@/lib/utils';

const stats = [
  { label: 'Automações Ativas', value: '8', icon: Zap, color: 'emerald' },
  { label: 'Processados Hoje', value: '2.4k', icon: Mail, color: 'violet' },
  { label: 'Conversões', value: '342', icon: Users, color: 'cyan' },
  { label: 'Receita (30d)', value: 'R$ 180k', icon: DollarSign, color: 'amber' },
];

interface Automation {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'paused';
  trigger_type: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  total_runs?: number;
  successful_runs?: number;
}

export default function AutomationsPage() {
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [canvasName, setCanvasName] = useState('Nova Automação');
  const [canvasStatus, setCanvasStatus] = useState<'draft' | 'active' | 'paused'>('draft');
  const [canvasNodes, setCanvasNodes] = useState<AutomationNode[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<AutomationEdge[]>([]);
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  useEffect(() => {
    try {
      const authData = localStorage.getItem('auth-storage');
      if (authData) {
        const parsed = JSON.parse(authData);
        setOrganizationId(parsed?.state?.user?.organization_id);
      }
    } catch (e) {
      console.error('Erro ao buscar organizationId:', e);
    }
    setLoading(false);
  }, []);

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
        console.error('Erro ao buscar automações:', e);
      } finally {
        setLoading(false);
      }
    }
    
    if (organizationId) {
      fetchAutomations();
    }
  }, [organizationId]);

  const filteredAutomations = automations.filter((automation) => {
    const matchesSearch = automation.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      automation.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || automation.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleNewFromTemplate = (templateId: string) => {
    const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      const triggerNode: AutomationNode = {
        id: `node-${Date.now()}`,
        type: template.trigger,
        position: { x: 250, y: 50 },
        data: { label: '', config: {} },
      };
      setCanvasName(template.name);
      setCanvasStatus('draft');
      setCanvasNodes([triggerNode]);
      setCanvasEdges([]);
      setEditingAutomation({ id: 'new', name: template.name, status: 'draft', trigger_type: template.trigger, nodes: [triggerNode], edges: [] });
      setShowNewModal(false);
    }
  };

  const handleNewBlank = () => {
    setCanvasName('Nova Automação');
    setCanvasStatus('draft');
    setCanvasNodes([]);
    setCanvasEdges([]);
    setEditingAutomation({ id: 'new', name: 'Nova Automação', status: 'draft', trigger_type: '', nodes: [], edges: [] });
    setShowNewModal(false);
  };

  const handleEditAutomation = (automation: Automation) => {
    setCanvasName(automation.name);
    setCanvasStatus(automation.status);
    setCanvasNodes(automation.nodes || []);
    setCanvasEdges(automation.edges || []);
    setEditingAutomation(automation);
  };

  const handleSave = async () => {
    if (!organizationId) return;
    
    const triggerNode = canvasNodes.find(n => n.type?.startsWith('trigger_'));
    const triggerType = triggerNode?.type?.replace('trigger_', '') || 'manual';
    
    const payload = {
      organizationId,
      name: canvasName,
      trigger_type: triggerType,
      trigger_config: triggerNode?.data.config || {},
      nodes: canvasNodes,
      edges: canvasEdges,
      status: canvasStatus,
    };

    try {
      if (editingAutomation?.id === 'new') {
        const res = await fetch('/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (res.ok) {
          const data = await res.json();
          setAutomations([...automations, data.automation]);
          setEditingAutomation(data.automation);
        }
      } else {
        const res = await fetch('/api/automations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: editingAutomation?.id }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setAutomations(automations.map(a => a.id === data.automation.id ? data.automation : a));
          setEditingAutomation(data.automation);
        }
      }
    } catch (e) {
      console.error('Erro ao salvar:', e);
    }
  };

  const handleActivate = async () => {
    const newStatus = canvasStatus === 'active' ? 'paused' : 'active';
    setCanvasStatus(newStatus);
    
    if (editingAutomation?.id && editingAutomation.id !== 'new') {
      try {
        await fetch('/api/automations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingAutomation.id,
            organizationId,
            status: newStatus,
          }),
        });
        
        setAutomations(automations.map(a => 
          a.id === editingAutomation.id ? { ...a, status: newStatus } : a
        ));
      } catch (e) {
        console.error('Erro ao ativar:', e);
      }
    }
  };

  const handleTest = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    alert('Teste executado com sucesso! (simulação)');
  };

  const handleBack = () => {
    setEditingAutomation(null);
    setCanvasNodes([]);
    setCanvasEdges([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return;
    
    try {
      const res = await fetch(`/api/automations?id=${id}&organizationId=${organizationId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setAutomations(automations.filter(a => a.id !== id));
      }
    } catch (e) {
      console.error('Erro ao excluir:', e);
    }
  };

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
        setAutomations(automations.map(a => 
          a.id === automation.id ? { ...a, status: newStatus } : a
        ));
      }
    } catch (e) {
      console.error('Erro ao alterar status:', e);
    }
  };

  if (editingAutomation) {
    return (
      <div className="h-[calc(100vh-64px)]">
        <AutomationCanvas
          automationId={editingAutomation.id}
          automationName={canvasName}
          automationStatus={canvasStatus}
          nodes={canvasNodes}
          edges={canvasEdges}
          onNodesChange={setCanvasNodes}
          onEdgesChange={setCanvasEdges}
          onNameChange={setCanvasName}
          onSave={handleSave}
          onActivate={handleActivate}
          onTest={handleTest}
          onBack={handleBack}
          organizationId={organizationId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Automações</h1>
          <p className="text-[#666666] mt-1">Gerencie seus fluxos automatizados</p>
        </div>
        <Button variant="primary" onClick={() => setShowNewModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Automação
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-[#111111] border border-[#222222] rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2.5 rounded-lg',
                stat.color === 'emerald' && 'bg-emerald-500/15',
                stat.color === 'violet' && 'bg-violet-500/15',
                stat.color === 'cyan' && 'bg-cyan-500/15',
                stat.color === 'amber' && 'bg-amber-500/15'
              )}>
                <stat.icon className={cn(
                  'w-5 h-5',
                  stat.color === 'emerald' && 'text-emerald-400',
                  stat.color === 'violet' && 'text-violet-400',
                  stat.color === 'cyan' && 'text-cyan-400',
                  stat.color === 'amber' && 'text-amber-400'
                )} />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-[#666666]">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
          <input
            type="text"
            placeholder="Buscar automações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#111111] border border-[#222222] rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-primary-500/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#111111] border border-[#222222] rounded-xl p-1">
            {(['all', 'active', 'paused', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  statusFilter === status
                    ? 'bg-primary-500 text-white'
                    : 'text-[#666666] hover:text-white hover:bg-[#1a1a1a]'
                )}
              >
                {status === 'all' ? 'Todas' : status === 'active' ? 'Ativas' : status === 'paused' ? 'Pausadas' : 'Rascunhos'}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-[#111111] border border-[#222222] rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'list' ? 'bg-[#1a1a1a] text-white' : 'text-[#555555] hover:text-white'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'grid' ? 'bg-[#1a1a1a] text-white' : 'text-[#555555] hover:text-white'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[#555555] mt-4">Carregando...</p>
        </div>
      ) : (
        <div className={cn(
          view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-3'
        )}>
          {filteredAutomations.map((automation, index) => (
            <motion.div
              key={automation.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <AutomationListItem
                automation={{
                  ...automation,
                  trigger: automation.trigger_type ? `trigger_${automation.trigger_type}` : 'trigger_manual',
                  stats: {
                    sent: automation.total_runs || 0,
                    converted: automation.successful_runs || 0,
                  },
                }}
                onEdit={() => handleEditAutomation(automation)}
                onDuplicate={() => console.log('Duplicate', automation.id)}
                onDelete={() => handleDelete(automation.id)}
                onToggleStatus={() => handleToggleStatus(automation)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAutomations.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#222222] flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-[#444444]" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Nenhuma automação encontrada
          </h3>
          <p className="text-[#555555] mb-6">
            {searchQuery || statusFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : 'Crie sua primeira automação para começar'}
          </p>
          <Button variant="primary" onClick={() => setShowNewModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Automação
          </Button>
        </div>
      )}

      {/* Modal Nova Automação */}
      <AnimatePresence>
        {showNewModal && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50"
              onClick={() => setShowNewModal(false)}
            />
            
            {/* Modal - Centralizado */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-[#0a0a0a] border border-[#222222] rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#222222]">
                <div>
                  <h2 className="text-lg font-semibold text-white">Nova Automação</h2>
                  <p className="text-sm text-[#666666]">Escolha um template ou comece do zero</p>
                </div>
                <button
                  onClick={() => setShowNewModal(false)}
                  className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#555555] hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {/* Começar do Zero */}
                <button
                  onClick={handleNewBlank}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-[#333333] hover:border-primary-500 hover:bg-primary-500/5 transition-all mb-6 text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-[#1a1a1a] group-hover:bg-primary-500/10 transition-colors">
                      <Plus className="w-6 h-6 text-[#555555] group-hover:text-primary-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-primary-500 transition-colors">
                        Começar do zero
                      </h3>
                      <p className="text-sm text-[#555555]">
                        Canvas em branco para criar sua automação
                      </p>
                    </div>
                  </div>
                </button>

                {/* Templates */}
                <div>
                  <h3 className="text-sm font-semibold text-[#555555] uppercase tracking-wider mb-4">
                    Templates populares
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AUTOMATION_TEMPLATES.map((template) => (
                      <AutomationTemplateCard
                        key={template.id}
                        template={template}
                        onSelect={() => handleNewFromTemplate(template.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
