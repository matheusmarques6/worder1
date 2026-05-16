'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  User,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  ExternalLink,
  Mail,
  Phone,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// =====================================================
// TYPES
// =====================================================

interface RunStep {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  step_order: number;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  input_data: any;
  output_data: any;
  config_used: any;
  variables_resolved: any;
  error_message: string | null;
  error_details: any;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface RunDetail {
  id: string;
  automation_id: string;
  automation_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';
  trigger_type: string;
  trigger_data: any;
  contact: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  } | null;
  deal_id: string | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  error: {
    node_id: string;
    message: string;
  } | null;
  context: any;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

interface ExecutionDetailProps {
  runId: string;
  organizationId: string;
  onClose: () => void;
  onRerun?: () => void;
}

// =====================================================
// NODE TYPE ICONS/COLORS
// =====================================================

const NODE_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  trigger_order: { icon: '🛒', color: 'emerald', label: 'Pedido Realizado' },
  trigger_abandon: { icon: '📦', color: 'amber', label: 'Carrinho Abandonado' },
  trigger_signup: { icon: '👤', color: 'blue', label: 'Novo Cadastro' },
  trigger_tag: { icon: '🏷️', color: 'purple', label: 'Tag Adicionada' },
  trigger_deal_created: { icon: '💼', color: 'blue', label: 'Deal Criado' },
  trigger_deal_stage: { icon: '➡️', color: 'violet', label: 'Deal Mudou Estágio' },
  trigger_deal_won: { icon: '🏆', color: 'emerald', label: 'Deal Ganho' },
  trigger_deal_lost: { icon: '❌', color: 'red', label: 'Deal Perdido' },
  action_email: { icon: '📧', color: 'violet', label: 'Enviar Email' },
  action_whatsapp: { icon: '💬', color: 'green', label: 'Enviar WhatsApp' },
  action_sms: { icon: '📱', color: 'blue', label: 'Enviar SMS' },
  action_tag: { icon: '🏷️', color: 'purple', label: 'Adicionar Tag' },
  action_update: { icon: '✏️', color: 'cyan', label: 'Atualizar Contato' },
  action_create_deal: { icon: '➕', color: 'blue', label: 'Criar Deal' },
  action_move_deal: { icon: '➡️', color: 'violet', label: 'Mover Deal' },
  action_notify: { icon: '🔔', color: 'amber', label: 'Notificação' },
  action_webhook: { icon: '🔗', color: 'slate', label: 'Webhook' },
  logic_delay: { icon: '⏱️', color: 'slate', label: 'Aguardar' },
  logic_condition: { icon: '🔀', color: 'orange', label: 'Condição' },
  logic_split: { icon: '📊', color: 'pink', label: 'Teste A/B' },
};

// =====================================================
// MAIN COMPONENT
// =====================================================

export function ExecutionDetail({
  runId,
  organizationId,
  onClose,
  onRerun,
}: ExecutionDetailProps) {
  const toast = useToast();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Buscar detalhes
  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/automations/runs?organizationId=${organizationId}&runId=${runId}&includeSteps=true`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao buscar detalhes');
        }

        setRun(data.run);
        setSteps(data.steps || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [runId, organizationId]);

  // Toggle step expandido
  const toggleStep = (stepId: string) => {
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

  // Formatar duração
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  // Formatar data/hora completa
  const formatFullDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Copiar para clipboard + feedback de toast (antes era silencioso
  // e o usuário não sabia se o copy tinha funcionado).
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado para a área de transferência');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  // Status badge do step
  const StepStatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />;
      case 'skipped':
        return <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">—</div>;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-xl bg-gray-50 border-l border-gray-200 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {run && (
              <div className={cn(
                'p-2 rounded-xl',
                run.status === 'completed' && 'bg-green-500/20',
                run.status === 'failed' && 'bg-red-500/20',
                run.status === 'running' && 'bg-amber-500/20',
              )}>
                {run.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                {run.status === 'failed' && <XCircle className="w-5 h-5 text-red-400" />}
                {run.status === 'running' && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {run?.automation_name || 'Carregando...'}
              </h2>
              {run && (
                <p className="text-xs text-gray-500">
                  {formatFullDateTime(run.started_at)} • {formatDuration(run.duration_ms)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-400">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">{error}</p>
          </div>
        ) : run ? (
          <div className="flex-1 overflow-y-auto">
            {/* Contexto */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Contexto
              </h3>
              
              <div className="space-y-3">
                {/* Contato */}
                {run.contact && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-gray-900 font-semibold">
                      {(run.contact.name?.[0] || run.contact.email[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {run.contact.name || 'Sem nome'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {run.contact.email}
                        </span>
                        {run.contact.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {run.contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Deal ID */}
                {run.deal_id && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        Deal vinculado
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {run.deal_id}
                      </p>
                    </div>
                  </div>
                )}

                {/* Trigger Data */}
                {run.trigger_data && Object.keys(run.trigger_data).length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs font-medium text-gray-500 mb-2">Dados do Trigger</p>
                    <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto max-h-[100px]">
                      {JSON.stringify(run.trigger_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-700">{run.completed_steps} sucesso</span>
              </div>
              {run.failed_steps > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-700">{run.failed_steps} erro</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-500">{run.total_steps} total</span>
              </div>
            </div>

            {/* Steps */}
            <div className="p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Steps ({steps.length})
              </h3>

              <div className="space-y-2">
                {steps.map((step, index) => {
                  const isExpanded = expandedSteps.has(step.id);
                  const nodeConfig = NODE_TYPE_CONFIG[step.node_type] || {
                    icon: '⚡',
                    color: 'slate',
                    label: step.node_type,
                  };

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'rounded-xl border overflow-hidden transition-all',
                        step.status === 'success' && 'border-green-500/30 bg-green-500/5',
                        step.status === 'error' && 'border-red-500/30 bg-red-500/5',
                        step.status === 'skipped' && 'border-gray-200 bg-gray-50 opacity-60',
                        step.status === 'running' && 'border-amber-500/30 bg-amber-500/5',
                        step.status === 'pending' && 'border-gray-200 bg-gray-50',
                      )}
                    >
                      {/* Step Header */}
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer"
                        onClick={() => toggleStep(step.id)}
                      >
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs text-gray-600">
                          {index + 1}
                        </div>

                        <StepStatusIcon status={step.status} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{nodeConfig.icon}</span>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {step.node_label || nodeConfig.label}
                            </span>
                          </div>
                          {step.error_message && (
                            <p className="text-xs text-red-400 truncate mt-0.5">
                              {step.error_message}
                            </p>
                          )}
                        </div>

                        <span className="text-xs text-gray-400">
                          {formatDuration(step.duration_ms)}
                        </span>

                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>

                      {/* Step Details (Expanded) */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-gray-200"
                          >
                            <div className="p-3 space-y-3 bg-gray-50">
                              {/* Input */}
                              {step.input_data && Object.keys(step.input_data).length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-medium text-gray-500">INPUT</p>
                                    <button
                                      onClick={() => copyToClipboard(JSON.stringify(step.input_data, null, 2))}
                                      className="p-1 hover:bg-gray-100 rounded"
                                    >
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto max-h-[150px]">
                                    {JSON.stringify(step.input_data, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Output */}
                              {step.output_data && Object.keys(step.output_data).length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-medium text-gray-500">OUTPUT</p>
                                    <button
                                      onClick={() => copyToClipboard(JSON.stringify(step.output_data, null, 2))}
                                      className="p-1 hover:bg-gray-100 rounded"
                                    >
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto max-h-[150px]">
                                    {JSON.stringify(step.output_data, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Error Details */}
                              {step.error_details && (
                                <div>
                                  <p className="text-xs font-medium text-red-400 mb-1">ERRO</p>
                                  <pre className="text-xs text-red-300 bg-red-950/50 rounded-lg p-2 overflow-x-auto max-h-[100px]">
                                    {JSON.stringify(step.error_details, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Config Used */}
                              {step.config_used && Object.keys(step.config_used).length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 mb-1">CONFIG</p>
                                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto max-h-[100px]">
                                    {JSON.stringify(step.config_used, null, 2)}
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
            </div>

            {/* Error Message */}
            {run.error && (
              <div className="p-4 border-t border-gray-200">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-400">Erro na execução</p>
                      <p className="text-xs text-red-300 mt-1">{run.error.message}</p>
                      {run.error.node_id && (
                        <p className="text-xs text-red-400/60 mt-1">
                          Nó: {run.error.node_id}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(runId)}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copiar ID
          </Button>
          <div className="flex items-center gap-2">
            {onRerun && run?.status !== 'running' && (
              <Button variant="secondary" size="sm" onClick={onRerun}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-executar
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ExecutionDetail;
