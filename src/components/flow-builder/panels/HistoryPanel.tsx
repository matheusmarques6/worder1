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
  Loader2,
  AlertTriangle,
  Play,
  RotateCcw,
  TrendingUp,
  Activity,
  Search,
  ChevronLeft,
  SkipForward,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, NodeStatus } from '@/stores/flowStore';

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
  status: 'pending' | 'running' | 'completed' | 'success' | 'error' | 'waiting' | 'cancelled' | 'failed';
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

interface Stats {
  total: number;
  success: number;
  error: number;
  pending: number;
  avgDuration: number;
  successRate: number;
}

// ============================================
// HISTORY PANEL COMPONENT
// ============================================

export function HistoryPanel({ automationId, organizationId, onClose }: HistoryPanelProps) {
  // State
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ExecutionRun | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Stats>({
    total: 0,
    success: 0,
    error: 0,
    pending: 0,
    avgDuration: 0,
    successRate: 0,
  });
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStep, setReplayStep] = useState(-1);

  // Store
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeStatus = useFlowStore((s) => s.updateNodeStatus);
  const resetNodeStatuses = useFlowStore((s) => s.resetNodeStatuses);

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
        const statusMap: Record<string, string> = {
          success: 'completed',
          error: 'failed',
          pending: 'pending',
        };
        params.set('status', statusMap[filter] || filter);
      }

      const response = await fetch(`/api/automations/runs?${params}`);
      
      if (!response.ok) {
        throw new Error('Falha ao carregar histórico');
      }

      const data = await response.json();
      const runsData = data.runs || [];
      setRuns(runsData);

      // Calculate stats
      const successCount = runsData.filter((r: ExecutionRun) => 
        r.status === 'completed' || r.status === 'success'
      ).length;
      const errorCount = runsData.filter((r: ExecutionRun) => 
        r.status === 'error' || r.status === 'failed'
      ).length;
      const pendingCount = runsData.filter((r: ExecutionRun) => 
        r.status === 'pending' || r.status === 'running' || r.status === 'waiting'
      ).length;
      const totalDuration = runsData.reduce((sum: number, r: ExecutionRun) => 
        sum + (r.duration_ms || 0), 0
      );

      setStats({
        total: runsData.length,
        success: successCount,
        error: errorCount,
        pending: pendingCount,
        avgDuration: runsData.length > 0 ? Math.round(totalDuration / runsData.length) : 0,
        successRate: runsData.length > 0 ? Math.round((successCount / runsData.length) * 100) : 0,
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [automationId, filter]);

  // ============================================
  // FETCH RUN DETAILS
  // ============================================

  const fetchRunDetails = async (run: ExecutionRun) => {
    setIsLoadingSteps(true);
    setSelectedRun(run);

    try {
      const response = await fetch(`/api/automations/runs?runId=${run.id}&includeSteps=true`);
      
      if (!response.ok) {
        throw new Error('Falha ao carregar detalhes');
      }

      const data = await response.json();
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

      fetchRuns();
    } catch (err: any) {
      console.error('Erro ao reexecutar:', err);
    }
  };

  // ============================================
  // REPLAY EXECUTION VISUALLY
  // ============================================

  const replayExecution = async () => {
    if (!selectedRun || steps.length === 0) return;

    setIsReplaying(true);
    resetNodeStatuses();

    for (let i = 0; i < steps.length; i++) {
      setReplayStep(i);
      const step = steps[i];

      // Set node to running
      updateNodeStatus(step.node_id, 'running');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Set final status
      const status: NodeStatus = step.status === 'success' ? 'success' : 
                     step.status === 'error' ? 'error' : 
                     step.status === 'skipped' ? 'skipped' : 'success';
      updateNodeStatus(step.node_id, status, step.error_message, step.duration_ms);

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsReplaying(false);
    setReplayStep(-1);
  };

  const stopReplay = () => {
    setIsReplaying(false);
    setReplayStep(-1);
    resetNodeStatuses();
  };

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    return () => {
      resetNodeStatuses();
    };
  }, []);

  // ============================================
  // HELPERS
  // ============================================

  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const getStatusIcon = (status: string, size: 'sm' | 'md' = 'sm') => {
    const sizeClass = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    switch (status) {
      case 'success':
      case 'completed':
        return <CheckCircle2 className={cn(sizeClass, 'text-green-400')} />;
      case 'error':
      case 'failed':
        return <XCircle className={cn(sizeClass, 'text-red-400')} />;
      case 'running':
        return <Loader2 className={cn(sizeClass, 'text-blue-400 animate-spin')} />;
      case 'waiting':
        return <Clock className={cn(sizeClass, 'text-amber-400')} />;
      case 'cancelled':
        return <Ban className={cn(sizeClass, 'text-slate-400')} />;
      case 'skipped':
        return <SkipForward className={cn(sizeClass, 'text-slate-400')} />;
      default:
        return <Clock className={cn(sizeClass, 'text-white/40')} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'error':
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'waiting':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const formatTriggerType = (type: string) => {
    const names: Record<string, string> = {
      trigger_order: 'Pedido',
      trigger_order_paid: 'Pagamento',
      trigger_abandon: 'Carrinho',
      trigger_signup: 'Cadastro',
      trigger_tag: 'Tag',
      trigger_deal_stage: 'Pipeline',
      trigger_deal_won: 'Deal Ganho',
      trigger_deal_lost: 'Deal Perdido',
      trigger_webhook: 'Webhook',
      trigger_whatsapp: 'WhatsApp',
    };
    return names[type] || type.replace('trigger_', '').replace('_', ' ');
  };

  const filteredRuns = runs.filter((run) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      run.contact?.email?.toLowerCase().includes(term) ||
      run.contact?.name?.toLowerCase().includes(term) ||
      run.id.toLowerCase().includes(term)
    );
  });

  // ============================================
  // RENDER
  // ============================================

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'fixed right-0 top-0 bottom-0 z-50',
        'w-[450px] bg-[#0d0d0d] border-l border-white/10',
        'flex flex-col shadow-2xl'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {selectedRun ? (
            <button
              onClick={() => {
                setSelectedRun(null);
                setSteps([]);
                resetNodeStatuses();
              }}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="p-2 rounded-lg bg-purple-500/20">
              <History className="w-5 h-5 text-purple-400" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedRun ? 'Detalhes da Execução' : 'Histórico'}
            </h2>
            <p className="text-xs text-white/50">
              {selectedRun 
                ? formatDate(selectedRun.started_at)
                : `${stats.total} execuções`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!selectedRun && (
            <button
              onClick={fetchRuns}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {selectedRun ? (
        // Run Detail View
        <div className="flex-1 overflow-y-auto">
          {/* Run Summary Card */}
          <div className="p-4 border-b border-white/10">
            <div className={cn(
              'p-4 rounded-xl border',
              getStatusColor(selectedRun.status)
            )}>
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon(selectedRun.status, 'md')}
                <div className="flex-1">
                  <p className="font-semibold text-white capitalize">
                    {selectedRun.status === 'completed' || selectedRun.status === 'success' 
                      ? 'Concluído' 
                      : selectedRun.status === 'failed' || selectedRun.status === 'error'
                      ? 'Falhou'
                      : selectedRun.status}
                  </p>
                  <p className="text-sm text-white/60">
                    {formatTriggerType(selectedRun.trigger_type)}
                  </p>
                </div>
                <span className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border',
                  getStatusColor(selectedRun.status)
                )}>
                  {selectedRun.status}
                </span>
              </div>

              {/* Contact */}
              {selectedRun.contact && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 mb-3">
                  <User className="w-4 h-4 text-white/40" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {selectedRun.contact.name || selectedRun.contact.email}
                    </p>
                    {selectedRun.contact.name && (
                      <p className="text-xs text-white/40 truncate">
                        {selectedRun.contact.email}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2 rounded-lg bg-black/20 text-center">
                  <p className="text-lg font-bold text-white">
                    {selectedRun.completed_steps}/{selectedRun.total_steps}
                  </p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Passos</p>
                </div>
                <div className="p-2 rounded-lg bg-black/20 text-center">
                  <p className="text-lg font-bold text-white">
                    {formatDuration(selectedRun.duration_ms)}
                  </p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Duração</p>
                </div>
                <div className="p-2 rounded-lg bg-black/20 text-center">
                  <p className={cn(
                    'text-lg font-bold',
                    selectedRun.failed_steps > 0 ? 'text-red-400' : 'text-green-400'
                  )}>
                    {selectedRun.failed_steps}
                  </p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Erros</p>
                </div>
              </div>

              {/* Error Message */}
              {selectedRun.error_message && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/20 border border-red-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{selectedRun.error_message}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={replayExecution}
                disabled={isReplaying || isLoadingSteps || steps.length === 0}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                  'bg-blue-600 hover:bg-blue-500 text-white',
                  'text-sm font-medium transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isReplaying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reproduzindo...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Reproduzir no Canvas
                  </>
                )}
              </button>
              {isReplaying && (
                <button
                  onClick={stopReplay}
                  className={cn(
                    'px-4 py-2.5 rounded-lg',
                    'bg-red-600/20 hover:bg-red-600/30 text-red-400',
                    'text-sm font-medium transition-colors'
                  )}
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => handleRerun(selectedRun.id)}
                className={cn(
                  'px-4 py-2.5 rounded-lg',
                  'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white',
                  'text-sm font-medium transition-colors'
                )}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Steps Timeline */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Timeline da Execução
            </h3>

            {isLoadingSteps ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-sm">
                Nenhum passo registrado
              </div>
            ) : (
              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-white/10" />

                {/* Steps */}
                <div className="space-y-1">
                  {steps.map((step, index) => {
                    const isExpanded = expandedSteps.has(step.id);
                    const isReplayingThis = isReplaying && replayStep === index;
                    const node = nodes.find((n) => n.id === step.node_id);

                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ 
                          opacity: 1, 
                          x: 0,
                          scale: isReplayingThis ? 1.02 : 1,
                        }}
                        transition={{ delay: index * 0.03 }}
                        className={cn(
                          'relative',
                          isReplayingThis && 'z-10'
                        )}
                      >
                        {/* Timeline Dot */}
                        <div className={cn(
                          'absolute left-0 top-3 w-[38px] h-[38px] rounded-full',
                          'flex items-center justify-center',
                          'border-2 bg-[#0d0d0d]',
                          step.status === 'success' && 'border-green-500/50',
                          step.status === 'error' && 'border-red-500/50',
                          step.status === 'skipped' && 'border-slate-500/50',
                          !['success', 'error', 'skipped'].includes(step.status) && 'border-white/20',
                          isReplayingThis && 'border-blue-500 ring-4 ring-blue-500/30'
                        )}>
                          {getStatusIcon(step.status)}
                        </div>

                        {/* Step Content */}
                        <div className={cn(
                          'ml-12 rounded-lg border overflow-hidden',
                          step.status === 'success' && 'border-green-500/20 bg-green-500/5',
                          step.status === 'error' && 'border-red-500/20 bg-red-500/5',
                          step.status === 'skipped' && 'border-slate-500/20 bg-slate-500/5',
                          !['success', 'error', 'skipped'].includes(step.status) && 'border-white/10 bg-white/5',
                          isReplayingThis && 'ring-2 ring-blue-500/50'
                        )}>
                          <button
                            onClick={() => toggleStepExpand(step.id)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {step.node_label || node?.data?.label || step.node_id}
                              </p>
                              <p className="text-xs text-white/40">
                                {step.node_type.replace('trigger_', '').replace('action_', '').replace('logic_', '')}
                              </p>
                            </div>
                            {step.duration_ms !== undefined && (
                              <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                                {step.duration_ms}ms
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                          </button>

                          {/* Expanded Content */}
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
                                    <div className="p-2 rounded bg-red-500/20 text-red-300 text-xs flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                      <span>{step.error_message}</span>
                                    </div>
                                  )}

                                  {step.input_data && Object.keys(step.input_data).length > 0 && (
                                    <div>
                                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                                        Input
                                      </p>
                                      <pre className="text-xs text-white/60 overflow-x-auto bg-black/40 p-2 rounded max-h-32">
                                        {JSON.stringify(step.input_data, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {step.output_data && (
                                    <div>
                                      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                                        Output
                                      </p>
                                      <pre className="text-xs text-white/60 overflow-x-auto bg-black/40 p-2 rounded max-h-32">
                                        {JSON.stringify(step.output_data, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-4 text-[10px] text-white/40">
                                    <span>Início: {new Date(step.started_at).toLocaleTimeString()}</span>
                                    {step.completed_at && (
                                      <span>Fim: {new Date(step.completed_at).toLocaleTimeString()}</span>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Runs List View
        <>
          {/* Stats Cards */}
          <div className="p-4 border-b border-white/10">
            <div className="grid grid-cols-4 gap-2">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <Activity className="w-4 h-4 text-white/40" />
                  <span className="text-lg font-bold text-white">{stats.total}</span>
                </div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Total</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center justify-between mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-lg font-bold text-green-400">{stats.success}</span>
                </div>
                <p className="text-[10px] text-green-400/70 uppercase tracking-wider">Sucesso</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center justify-between mb-1">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-lg font-bold text-red-400">{stats.error}</span>
                </div>
                <p className="text-[10px] text-red-400/70 uppercase tracking-wider">Erros</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center justify-between mb-1">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-lg font-bold text-blue-400">{stats.successRate}%</span>
                </div>
                <p className="text-[10px] text-blue-400/70 uppercase tracking-wider">Taxa</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-white/10 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="Buscar por contato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(
                  'w-full pl-10 pr-4 py-2 rounded-lg',
                  'bg-white/5 border border-white/10 text-white text-sm',
                  'placeholder-white/30',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              {(['all', 'success', 'error', 'pending'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                    filter === f
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                  )}
                >
                  {f === 'all' && 'Todos'}
                  {f === 'success' && 'Sucesso'}
                  {f === 'error' && 'Erros'}
                  {f === 'pending' && 'Pendentes'}
                </button>
              ))}
            </div>
          </div>

          {/* Runs List */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-300 text-sm">{error}</p>
                <button
                  onClick={fetchRuns}
                  className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                >
                  Tentar novamente
                </button>
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/50 text-sm">Nenhuma execução encontrada</p>
                {filter !== 'all' && (
                  <button
                    onClick={() => setFilter('all')}
                    className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRuns.map((run, index) => (
                  <motion.div
                    key={run.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => fetchRunDetails(run)}
                    className={cn(
                      'p-4 rounded-xl border cursor-pointer',
                      'hover:border-white/20 hover:bg-white/5',
                      'transition-all duration-200',
                      run.status === 'completed' || run.status === 'success'
                        ? 'border-green-500/20 bg-green-500/5'
                        : run.status === 'failed' || run.status === 'error'
                        ? 'border-red-500/20 bg-red-500/5'
                        : 'border-white/10 bg-white/5'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'p-2 rounded-lg',
                        run.status === 'completed' || run.status === 'success'
                          ? 'bg-green-500/20'
                          : run.status === 'failed' || run.status === 'error'
                          ? 'bg-red-500/20'
                          : 'bg-white/10'
                      )}>
                        {getStatusIcon(run.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-white">
                            {formatTriggerType(run.trigger_type)}
                          </p>
                          <span className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium border',
                            getStatusColor(run.status)
                          )}>
                            {run.status}
                          </span>
                        </div>
                        {run.contact && (
                          <p className="text-xs text-white/50 truncate">
                            {run.contact.name || run.contact.email}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(run.started_at)}
                          </span>
                          <span>{run.completed_steps}/{run.total_steps} passos</span>
                          {run.duration_ms && (
                            <span>{formatDuration(run.duration_ms)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/30" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

export default HistoryPanel;
