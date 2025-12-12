'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  Zap,
  Play,
  Pause,
  MoreHorizontal,
  TrendingUp,
  Mail,
  Users,
  DollarSign,
  ArrowLeft,
  X,
} from 'lucide-react';
import { Button, Input, Badge, Card } from '@/components/ui';
import {
  AutomationCanvas,
  AutomationListItem,
  AutomationTemplateCard,
  AUTOMATION_TEMPLATES,
  NODE_TYPES,
} from '@/components/automation';
import { AutomationNode, AutomationEdge } from '@/types';
import { cn } from '@/lib/utils';

// Mock data for existing automations
const mockAutomations = [
  {
    id: '1',
    name: 'Carrinho Abandonado',
    description: 'Recupera carrinhos abandonados com série de 3 emails + WhatsApp',
    status: 'active' as const,
    trigger: 'trigger_abandon',
    stats: { sent: 12450, converted: 1556, revenue: 89000 },
    updatedAt: '2 horas atrás',
  },
  {
    id: '2',
    name: 'Boas-vindas',
    description: 'Série de boas-vindas para novos inscritos',
    status: 'active' as const,
    trigger: 'trigger_signup',
    stats: { sent: 8200, converted: 672, revenue: 45000 },
    updatedAt: '1 dia atrás',
  },
  {
    id: '3',
    name: 'Pós-compra Cross-sell',
    description: 'Oferece produtos complementares após compra',
    status: 'active' as const,
    trigger: 'trigger_order',
    stats: { sent: 5400, converted: 324, revenue: 34000 },
    updatedAt: '3 dias atrás',
  },
  {
    id: '4',
    name: 'Reativação 60 dias',
    description: 'Reativa clientes que não compraram há 60 dias',
    status: 'paused' as const,
    trigger: 'trigger_segment',
    stats: { sent: 3200, converted: 128, revenue: 12000 },
    updatedAt: '1 semana atrás',
  },
  {
    id: '5',
    name: 'Nova automação',
    description: 'Automação em construção',
    status: 'draft' as const,
    trigger: 'trigger_tag',
    updatedAt: '5 min atrás',
  },
];

// Stats summary
const stats = [
  { label: 'Automações Ativas', value: '8', icon: Zap, color: 'emerald' },
  { label: 'Processados Hoje', value: '2.4k', icon: Mail, color: 'violet' },
  { label: 'Conversões', value: '342', icon: Users, color: 'cyan' },
  { label: 'Receita (30d)', value: 'R$ 180k', icon: DollarSign, color: 'amber' },
];

export default function AutomationsPage() {
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<string | null>(null);
  const [canvasNodes, setCanvasNodes] = useState<AutomationNode[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<AutomationEdge[]>([]);

  const filteredAutomations = mockAutomations.filter((automation) => {
    const matchesSearch = automation.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      automation.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || automation.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleNewFromTemplate = (templateId: string) => {
    const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      // Create initial nodes based on template
      const triggerNode: AutomationNode = {
        id: 'node-1',
        type: 'trigger' as const,
        position: { x: 300, y: 100 },
        data: { label: template.trigger, config: {} },
      };
      setCanvasNodes([triggerNode]);
      setCanvasEdges([]);
      setShowNewModal(false);
      setEditingAutomation('new');
    }
  };

  const handleNewBlank = () => {
    setCanvasNodes([]);
    setCanvasEdges([]);
    setShowNewModal(false);
    setEditingAutomation('new');
  };

  // If editing, show canvas
  if (editingAutomation) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingAutomation(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <div className="w-px h-6 bg-white/10" />
            <Input
              value="Nova Automação"
              onChange={() => {}}
              className="w-64 bg-transparent border-none text-lg font-semibold"
            />
            <Badge variant="warning">Rascunho</Badge>
          </div>
        </div>

        {/* Canvas */}
        <AutomationCanvas
          nodes={canvasNodes}
          edges={canvasEdges}
          onNodesChange={setCanvasNodes}
          onEdgesChange={setCanvasEdges}
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
          <p className="text-slate-400 mt-1">Gerencie seus fluxos automatizados</p>
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
            className="p-4 bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-lg',
                stat.color === 'emerald' && 'bg-emerald-500/10',
                stat.color === 'violet' && 'bg-violet-500/10',
                stat.color === 'cyan' && 'bg-cyan-500/10',
                stat.color === 'amber' && 'bg-amber-500/10'
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
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar automações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800/50 rounded-xl p-1">
            {(['all', 'active', 'paused', 'draft'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  statusFilter === status
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                {status === 'all' ? 'Todas' : status === 'active' ? 'Ativas' : status === 'paused' ? 'Pausadas' : 'Rascunhos'}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-slate-800/50 rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={cn(
                'p-2 rounded-lg transition-all',
                view === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Automations List */}
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
              automation={automation}
              onEdit={() => setEditingAutomation(automation.id)}
              onDuplicate={() => console.log('Duplicate', automation.id)}
              onDelete={() => console.log('Delete', automation.id)}
              onToggleStatus={() => console.log('Toggle', automation.id)}
            />
          </motion.div>
        ))}
      </div>

      {filteredAutomations.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Nenhuma automação encontrada
          </h3>
          <p className="text-slate-400 mb-4">
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

      {/* New Automation Modal */}
      <AnimatePresence>
        {showNewModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowNewModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 sm:inset-auto sm:top-[10%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                  <h2 className="text-lg font-semibold text-white">Nova Automação</h2>
                  <p className="text-sm text-slate-400">Escolha um template ou comece do zero</p>
                </div>
                <button
                  onClick={() => setShowNewModal(false)}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Blank Option */}
                <button
                  onClick={handleNewBlank}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all mb-6 text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-slate-800/50 group-hover:bg-primary/10 transition-colors">
                      <Plus className="w-6 h-6 text-slate-400 group-hover:text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-primary transition-colors">
                        Começar do zero
                      </h3>
                      <p className="text-sm text-slate-400">
                        Canvas em branco para criar sua automação
                      </p>
                    </div>
                  </div>
                </button>

                {/* Templates */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
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
