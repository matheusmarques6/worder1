'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  User,
  Zap,
  SkipForward,
  RefreshCw,
  Eye,
  EyeOff,
  Settings,
  Beaker,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, NodeStatus } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

interface ExecutionPanelProps {
  automationId: string;
  organizationId: string;
  onClose: () => void;
}

interface StepResult {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  output?: Record<string, any>;
  error?: string;
  duration?: number;
  startedAt?: Date;
}

interface SampleContact {
  id: string;
  email: string;
  name: string;
  phone?: string;
}

// ============================================
// EXECUTION PANEL COMPONENT
// ============================================

export function ExecutionPanel({ automationId, organizationId, onClose }: ExecutionPanelProps) {
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [useSampleData, setUseSampleData] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contacts, setContacts] = useState<SampleContact[]>([]);
  const [triggerData, setTriggerData] = useState('{}');
  const [executionSpeed, setExecutionSpeed] = useState<'normal' | 'fast' | 'slow'>('normal');
  
  // Refs
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // Store
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const updateNodeStatus = useFlowStore((s) => s.updateNodeStatus);
  const resetNodeStatuses = useFlowStore((s) => s.resetNodeStatuses);
  const testExecution = useFlowStore((s) => s.testExecution);

  // Get trigger node for sample data
  const triggerNode = nodes.find((n) => n.type?.startsWith('trigger') || n.data?.category === 'trigger');

  // ============================================
  // LOAD CONTACTS
  // ============================================

  useEffect(() => {
    async function loadContacts() {
      try {
        const response = await fetch('/api/contacts?pageSize=10');
        if (response.ok) {
          const data = await response.json();
          setContacts(data.contacts?.map((c: any) => ({
            id: c.id,
            email: c.email,
            name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
            phone: c.phone,
          })) || []);
        }
      } catch (err) {
        console.error('Erro ao carregar contatos:', err);
      }
    }
    loadContacts();
  }, []);

  // ============================================
  // GENERATE SAMPLE DATA
  // ============================================

  const getSampleDataForTrigger = useCallback(() => {
    const triggerType = triggerNode?.data?.nodeType || triggerNode?.type || '';

    const samples: Record<string, object> = {
      trigger_order: {
        order_id: 'ORD-12345',
        order_value: 299.90,
        products: [{ name: 'Produto Exemplo', price: 149.95, quantity: 2 }],
        payment_method: 'credit_card',
      },
      trigger_order_paid: {
        order_id: 'ORD-12345',
        order_value: 299.90,
        payment_status: 'paid',
      },
      trigger_abandon: {
        cart_id: 'CART-67890',
        cart_value: 450.00,
        cart_items: [{ name: 'Produto no Carrinho', price: 150.00, quantity: 3 }],
        abandon_time_minutes: 30,
      },
      trigger_signup: {
        source: 'website',
        landing_page: '/promocao',
        utm_source: 'google',
      },
      trigger_tag: {
        tag_name: 'vip',
        previous_tags: ['cliente', 'ativo'],
      },
      trigger_deal_stage: {
        deal_id: 'DEAL-11111',
        deal_title: 'Contrato Premium',
        deal_value: 5000,
        stage_from: 'negotiation',
        stage_to: 'closed_won',
      },
      trigger_webhook: {
        event: 'custom_event',
        data: { key: 'value' },
        timestamp: new Date().toISOString(),
      },
    };

    return JSON.stringify(samples[triggerType] || { custom_field: 'valor' }, null, 2);
  }, [triggerNode]);

  useEffect(() => {
    if (useSampleData) {
      setTriggerData(getSampleDataForTrigger());
    }
  }, [useSampleData, getSampleDataForTrigger]);

  // ============================================
  // GET EXECUTION ORDER
  // ============================================

  const getExecutionOrder = useCallback(() => {
    const order: string[] = [];
    const visited = new Set<string>();
    
    // Find trigger node
    const trigger = nodes.find((n) => n.type?.startsWith('trigger_') || n.data?.category === 'trigger');
    if (!trigger) return order;
    
    // BFS from trigger
    const queue = [trigger.id];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      order.push(nodeId);
      
      // Find connected nodes
      const connectedEdges = edges.filter((e) => e.source === nodeId);
      for (const edge of connectedEdges) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
    
    return order;
  }, [nodes, edges]);

  // ============================================
  // RUN TEST
  // ============================================

  const runTest = async () => {
    setIsRunning(true);
    setIsPaused(false);
    setError(null);
    setSuccess(null);
    setTotalDuration(0);
    resetNodeStatuses();

    // Validate JSON
    let parsedData = {};
    try {
      parsedData = JSON.parse(triggerData);
    } catch {
      setError('JSON inválido nos dados do gatilho');
      setIsRunning(false);
      return;
    }

    // Get execution order
    const executionOrder = getExecutionOrder();
    
    // Initialize steps
    const initialSteps: StepResult[] = executionOrder.map((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return {
        nodeId,
        nodeLabel: node?.data?.label || nodeId,
        nodeType: node?.type || '',
        status: 'pending',
      };
    });
    setSteps(initialSteps);
    setCurrentStepIndex(-1);

    const startTime = Date.now();

    try {
      // Call the API
      const response = await fetch(`/api/automations/${automationId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          contactId: selectedContactId || undefined,
          useSampleData,
          triggerData: parsedData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao executar teste');
      }

      const result = await response.json();

      // Animate through each step
      const speedMs = executionSpeed === 'fast' ? 300 : executionSpeed === 'slow' ? 1000 : 500;

      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        setCurrentStepIndex(i);

        // Update node status to running
        updateNodeStatus(step.nodeId, 'running');
        
        // Update step to running
        setSteps((prev) => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'running', startedAt: new Date() } : s
        ));

        // Wait for visual effect
        await new Promise((resolve) => setTimeout(resolve, speedMs));

        // Update to final status
        const finalStatus = step.status as NodeStatus;
        updateNodeStatus(step.nodeId, finalStatus, step.error, step.duration);

        // Update step
        setSteps((prev) => prev.map((s, idx) => 
          idx === i ? {
            ...s,
            status: step.status,
            output: step.output,
            error: step.error,
            duration: step.duration,
          } : s
        ));

        // Auto-expand error steps
        if (step.status === 'error') {
          setExpandedSteps((prev) => new Set([...prev, step.nodeId]));
        }

        // Scroll to current step
        if (stepsContainerRef.current) {
          const stepEl = stepsContainerRef.current.querySelector(`[data-step="${i}"]`);
          stepEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      setTotalDuration(result.totalDuration || Date.now() - startTime);
      setSuccess(result.success);

    } catch (err: any) {
      setError(err.message);
      setSuccess(false);
    } finally {
      setIsRunning(false);
      setCurrentStepIndex(-1);
    }
  };

  // ============================================
  // RESET
  // ============================================

  const resetExecution = () => {
    setSteps([]);
    setCurrentStepIndex(-1);
    setError(null);
    setSuccess(null);
    setTotalDuration(0);
    resetNodeStatuses();
  };

  // ============================================
  // TOGGLE STEP
  // ============================================

  const toggleStep = (nodeId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // ============================================
  // STATUS ICON
  // ============================================

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-white/30" />;
    }
  };

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
        'w-[400px] bg-[#0d0d0d] border-l border-white/10',
        'flex flex-col shadow-2xl'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Beaker className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Testar Automação</h2>
            <p className="text-xs text-white/50">Simule a execução visualmente</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Config Section (Collapsible) */}
      <div className="border-b border-white/10">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2 text-white/70">
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Configurações do Teste</span>
          </div>
          {showConfig ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </button>

        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 pt-0 space-y-4">
                {/* Data Source */}
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">
                    Fonte de Dados
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUseSampleData(true)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                        useSampleData
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      )}
                    >
                      Dados de Exemplo
                    </button>
                    <button
                      onClick={() => setUseSampleData(false)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                        !useSampleData
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      )}
                    >
                      Contato Real
                    </button>
                  </div>
                </div>

                {/* Contact Select */}
                {!useSampleData && (
                  <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">
                      Contato
                    </label>
                    <select
                      value={selectedContactId}
                      onChange={(e) => setSelectedContactId(e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-[#0a0a0a] border border-white/10 text-white text-sm',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    >
                      <option value="">Selecione um contato</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Speed */}
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">
                    Velocidade da Simulação
                  </label>
                  <div className="flex gap-2">
                    {(['slow', 'normal', 'fast'] as const).map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setExecutionSpeed(speed)}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors capitalize',
                          executionSpeed === speed
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/5 text-white/50 hover:bg-white/10'
                        )}
                      >
                        {speed === 'slow' ? 'Lenta' : speed === 'normal' ? 'Normal' : 'Rápida'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trigger Data */}
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-2">
                    Dados do Gatilho (JSON)
                  </label>
                  <textarea
                    value={triggerData}
                    onChange={(e) => setTriggerData(e.target.value)}
                    className={cn(
                      'w-full h-24 px-3 py-2 rounded-lg font-mono text-xs',
                      'bg-[#0a0a0a] border border-white/10 text-white',
                      'focus:outline-none focus:border-blue-500/50 resize-none'
                    )}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Steps */}
      <div ref={stepsContainerRef} className="flex-1 overflow-y-auto p-4">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-full bg-white/5 mb-4">
              <Zap className="w-8 h-8 text-white/30" />
            </div>
            <p className="text-white/50 text-sm mb-2">
              Clique em "Executar Teste" para simular
            </p>
            <p className="text-white/30 text-xs">
              Os nós serão executados em sequência com visualização em tempo real
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.nodeId);
              const isCurrent = index === currentStepIndex;

              return (
                <motion.div
                  key={step.nodeId}
                  data-step={index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ 
                    opacity: 1, 
                    x: 0,
                    scale: isCurrent ? 1.02 : 1,
                  }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    'rounded-lg border overflow-hidden',
                    step.status === 'running' && 'border-blue-500/50 bg-blue-500/10',
                    step.status === 'success' && 'border-green-500/30 bg-green-500/5',
                    step.status === 'error' && 'border-red-500/30 bg-red-500/5',
                    step.status === 'skipped' && 'border-slate-500/30 bg-slate-500/5',
                    step.status === 'pending' && 'border-white/10 bg-white/5',
                    isCurrent && 'ring-2 ring-blue-500/50'
                  )}
                >
                  {/* Step Header */}
                  <button
                    onClick={() => step.output && toggleStep(step.nodeId)}
                    disabled={!step.output && !step.error}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left',
                      (step.output || step.error) && 'hover:bg-white/5 cursor-pointer'
                    )}
                  >
                    <div className="flex-shrink-0">
                      {getStatusIcon(step.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {step.nodeLabel}
                      </p>
                      <p className="text-xs text-white/40">
                        {(step.nodeType || '').replace('trigger_', '').replace('action_', '').replace('logic_', '')}
                      </p>
                    </div>
                    {step.duration !== undefined && (
                      <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                        {step.duration}ms
                      </span>
                    )}
                    {(step.output || step.error) && (
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-white/40" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-white/40" />
                        )}
                      </div>
                    )}
                  </button>

                  {/* Step Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10"
                      >
                        <div className="p-3 bg-[#0a0a0a] space-y-2">
                          {step.error && (
                            <div className="p-2 rounded bg-red-500/20 text-red-300 text-xs flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{step.error}</span>
                            </div>
                          )}
                          {step.output && (
                            <div>
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                                Output
                              </p>
                              <pre className="text-xs text-white/60 overflow-x-auto bg-black/40 p-2 rounded max-h-40">
                                {JSON.stringify(step.output, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 flex items-start gap-2"
          >
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}

        {/* Success Summary */}
        {success !== null && !isRunning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'mt-4 p-4 rounded-lg border',
              success
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            )}
          >
            <div className="flex items-center gap-3">
              {success ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <div>
                <p className={cn('font-medium', success ? 'text-green-300' : 'text-red-300')}>
                  {success ? 'Teste concluído com sucesso!' : 'Teste falhou'}
                </p>
                <p className="text-sm text-white/50">
                  {steps.filter((s) => s.status === 'success').length}/{steps.length} passos • {totalDuration}ms
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-[#0a0a0a]">
        <div className="flex gap-3">
          {steps.length > 0 && !isRunning && (
            <button
              onClick={resetExecution}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white',
                'text-sm font-medium transition-colors'
              )}
            >
              <RefreshCw className="w-4 h-4" />
              Resetar
            </button>
          )}
          <button
            onClick={runTest}
            disabled={isRunning}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-blue-600 hover:bg-blue-500 text-white',
              'text-sm font-medium transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Executar Teste
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default ExecutionPanel;
