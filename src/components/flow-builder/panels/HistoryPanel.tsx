'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  User,
  Calendar,
  Filter,
  Loader2,
  AlertTriangle,
  Play,
  MoreVertical,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

interface ExecutionStep {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  step_order: number;
  status: 'success' | 'error' | 'skipped' | 'waiting';
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  duration_ms?: number;
  started_at: string;
  completed_at?: string;
}

interface ExecutionRun {
  id: string;
  automation_id: string;
  automation_name?: string;
  status: 'running' | 'success' | 'error' | 'waiting' | 'cancelled';
  trigger_type: string;
  trigger_data?: Record<string, any>;
  contact?: {
    id: string;
    email: string;
    name: string;
  };
  deal_id?: string;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  duration_ms?: number;
  error_message?: string;
  error_node_id?: string;
  started_at: string;
  completed_at?: string;
}

interface HistoryPanelProps {
  automationId: string;
  organizationId: string;
  onClose: () => void;
}

// ============================================
// HISTORY PANEL COMPONENT
// ============================================

export function HistoryPanel({ automationId, organizationId, onClose }: HistoryPanelProps) {
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ExecutionRun | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const nodes = useFlowStore((s) => s.nodes);

  // ============================================
  // FETCH RUNS
  // ============================================

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        automationId,
        pageSize: '50',
      });

      if (filter !== 'all') {
        params.set('status', filter);
      }

      const response = await fetch(`/api/automations/runs?${params}`);
      
      if (!response.ok) {
        throw new Error('Falha ao carregar histórico');
      }

      const data = await response.json();
      setRuns(data.runs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [automationId, filter]);

  // ============================================
  // FETCH RUN DETAILS
  // ============================================

  const fetchRunDetails = async (runId: string) => {
    setIsLoadingSteps(true);

    try {
      const response = await fetch(`/api/automations/runs?runId=${runId}&includeSteps=true`);
      
      if (!response.ok) {
        throw new Error('Falha ao carregar detalhes');
      }

      const data = await response.json();
      setSelectedRun(data.run);
      setSteps(data.steps || []);
    } catch (err: any) {
      console.error('Erro ao carregar detalhes:', err);
    } finally {
      setIsLoadingSteps(false);
    }
  };

  // ============================================
  // RERUN EXECUTION
  // ============================================

  const handleRerun = async (runId: string) => {
    try {
      const response = await fetch('/api/automations/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rerun', runId }),
      });

      if (!response.ok) {
        throw new Error('Falha ao reexecutar');
      }

      // Atualiza lista
      fetchRuns();
    } catch (err: any) {
      console.error('Erro ao reexecutar:', err);
    }
  };

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // ============================================
  // HELPERS
  // ============================================

  const toggleStepExpand = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'waiting':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'skipped':
        return <span className="w-4 h-4 text-white/30">—</span>;
      default:
        return <Clock className="w-4 h-4 text-white/40" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'waiting':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-[#111111] border-l border-white/10 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-white/60" />
            <h2 className="text-lg font-semibold text-white">Histórico de Execuções</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchRuns}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          <Filter className="w-4 h-4 text-white/40" />
          <div className="flex gap-1">
            {(['all', 'success', 'error'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                  filter === f
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                )}
              >
                {f === 'all' ? 'Todas' : f === 'success' ? 'Sucesso' : 'Erro'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
              <p className="text-white/60">Carregando histórico...</p>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/30 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <History className="w-12 h-12 text-white/20 mb-3" />
              <p className="text-white/60">Nenhuma execução encontrada</p>
              <p className="text-white/40 text-sm mt-1">
                Execute a automação para ver o histórico aqui
              </p>
            </div>
          ) : selectedRun ? (
            // Run Details View
            <div className="p-4 space-y-4">
              {/* Back Button */}
              <button
                onClick={() => {
                  setSelectedRun(null);
                  setSteps([]);
                }}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Voltar à lista
              </button>

              {/* Run Summary */}
              <div className={cn(
                'p-4 rounded-lg border',
                getStatusColor(selectedRun.status)
              )}>
                <div className="flex items-center gap-3 mb-3">
                  {getStatusIcon(selectedRun.status)}
                  <span className="font-medium capitalize">{selectedRun.status}</span>
                  <span className="text-xs opacity-70">
                    {formatDate(selectedRun.started_at)}
                  </span>
                </div>

                {selectedRun.contact && (
                  <div className="flex items-center gap-2 text-sm opacity-80 mb-2">
                    <User className="w-4 h-4" />
                    <span>{selectedRun.contact.name || selectedRun.contact.email}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 text-sm mt-3">
                  <div>
                    <p className="opacity-60">Passos</p>
                    <p className="font-medium">
                      {selectedRun.completed_steps}/{selectedRun.total_steps}
                    </p>
                  </div>
                  <div>
                    <p className="opacity-60">Duração</p>
                    <p className="font-medium">{formatDuration(selectedRun.duration_ms)}</p>
                  </div>
                  <div>
                    <p className="opacity-60">Erros</p>
                    <p className="font-medium">{selectedRun.failed_steps}</p>
                  </div>
                </div>

                {selectedRun.error_message && (
                  <div className="mt-3 p-2 rounded bg-black/30 text-xs">
                    <p className="opacity-60 mb-1">Erro:</p>
                    <p>{selectedRun.error_message}</p>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div>
                <h3 className="text-sm font-medium text-white/70 mb-3">
                  Passos da Execução
                </h3>

                {isLoadingSteps ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {steps.map((step) => {
                      const isExpanded = expandedSteps.has(step.id);
                      const node = nodes.find((n) => n.id === step.node_id);

                      return (
                        <div
                          key={step.id}
                          className="rounded-lg border border-white/10 overflow-hidden"
                        >
                          <button
                            onClick={() => toggleStepExpand(step.id)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                          >
                            {getStatusIcon(step.status)}
                            <span className="flex-1 text-left text-sm text-white/80">
                              {step.node_label || node?.data?.label || step.node_id}
                            </span>
                            <span className="text-xs text-white/40">
                              {formatDuration(step.duration_ms)}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-white/10"
                              >
                                <div className="p-3 bg-[#0a0a0a] space-y-3">
                                  {step.error_message && (
                                    <div className="p-2 rounded bg-red-500/20 text-red-300 text-xs">
                                      {step.error_message}
                                    </div>
                                  )}

                                  {step.input_data && Object.keys(step.input_data).length > 0 && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Input:</p>
                                      <pre className="text-xs text-white/60 overflow-x-auto bg-black/30 p-2 rounded">
                                        {JSON.stringify(step.input_data, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {step.output_data && (
                                    <div>
                                      <p className="text-xs text-white/40 mb-1">Output:</p>
                                      <pre className="text-xs text-white/60 overflow-x-auto bg-black/30 p-2 rounded">
                                        {JSON.stringify(step.output_data, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Runs List View
            <div className="p-4 space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="p-4 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(run.status)}
                      <div>
                        <p className="text-sm font-medium text-white">
                          {run.trigger_type.replace('trigger_', '').replace('_', ' ')}
                        </p>
                        <p className="text-xs text-white/50">
                          {formatDate(run.started_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium border',
                        getStatusColor(run.status)
                      )}>
                        {run.status}
                      </span>

                      <div className="relative group">
                        <button className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 py-1 bg-[#1a1a1a] rounded-lg border border-white/10 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
                          <button
                            onClick={() => fetchRunDetails(run.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
                          >
                            <Eye className="w-4 h-4" />
                            Ver detalhes
                          </button>
                          <button
                            onClick={() => handleRerun(run.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Reexecutar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {run.contact && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                      <User className="w-3 h-3" />
                      <span>{run.contact.name || run.contact.email}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
                    <span>
                      {run.completed_steps}/{run.total_steps} passos
                    </span>
                    <span>{formatDuration(run.duration_ms)}</span>
                    {run.failed_steps > 0 && (
                      <span className="text-red-400">{run.failed_steps} erro(s)</span>
                    )}
                  </div>

                  {run.error_message && (
                    <p className="mt-2 text-xs text-red-400 truncate">
                      {run.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default HistoryPanel;
