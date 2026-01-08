'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  User,
  Zap,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

interface TestModalProps {
  automationId: string;
  organizationId: string;
  onClose: () => void;
}

interface NodeResult {
  nodeId: string;
  status: 'success' | 'error' | 'skipped' | 'waiting';
  output?: Record<string, any>;
  error?: string;
  duration: number;
}

interface TestResult {
  success: boolean;
  executionId: string;
  contact: Record<string, any>;
  trigger: Record<string, any>;
  steps: NodeResult[];
  totalDuration: number;
  error?: string;
}

interface SampleContact {
  id: string;
  email: string;
  name: string;
  phone?: string;
}

// ============================================
// TEST MODAL COMPONENT
// ============================================

export function TestModal({ automationId, organizationId, onClose }: TestModalProps) {
  // State
  const [triggerData, setTriggerData] = useState('{}');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [useSampleData, setUseSampleData] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<SampleContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Store
  const nodes = useFlowStore((s) => s.nodes);
  const triggerNode = nodes.find((n) => n.type?.startsWith('trigger') || n.data?.category === 'trigger');

  // ============================================
  // LOAD CONTACTS
  // ============================================

  useEffect(() => {
    async function loadContacts() {
      setIsLoadingContacts(true);
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
      } finally {
        setIsLoadingContacts(false);
      }
    }
    loadContacts();
  }, []);

  // ============================================
  // GENERATE SAMPLE DATA BASED ON TRIGGER
  // ============================================

  const getSampleDataForTrigger = () => {
    const triggerType = triggerNode?.data?.nodeType || triggerNode?.type || '';

    switch (triggerType) {
      case 'trigger_order':
      case 'trigger_order_paid':
        return JSON.stringify({
          order_id: 'ORD-12345',
          order_value: 299.90,
          products: [
            { name: 'Produto Exemplo', price: 149.95, quantity: 2 }
          ],
          payment_method: 'credit_card',
        }, null, 2);

      case 'trigger_abandon':
        return JSON.stringify({
          cart_id: 'CART-67890',
          cart_value: 450.00,
          cart_items: [
            { name: 'Produto no Carrinho', price: 150.00, quantity: 3 }
          ],
          abandon_time_minutes: 30,
        }, null, 2);

      case 'trigger_signup':
        return JSON.stringify({
          source: 'website',
          landing_page: '/promocao',
          utm_source: 'google',
          utm_medium: 'cpc',
        }, null, 2);

      case 'trigger_tag':
        return JSON.stringify({
          tag_name: 'vip',
          previous_tags: ['cliente', 'ativo'],
        }, null, 2);

      case 'trigger_deal_created':
      case 'trigger_deal_stage':
      case 'trigger_deal_won':
      case 'trigger_deal_lost':
        return JSON.stringify({
          deal_id: 'DEAL-11111',
          deal_title: 'Contrato Premium',
          deal_value: 5000,
          stage_from: 'negotiation',
          stage_to: 'closed_won',
        }, null, 2);

      case 'trigger_webhook':
        return JSON.stringify({
          event: 'custom_event',
          data: { key: 'value' },
          timestamp: new Date().toISOString(),
        }, null, 2);

      case 'trigger_whatsapp':
        return JSON.stringify({
          message_id: 'MSG-12345',
          message_text: 'Olá, quero saber mais!',
          message_type: 'text',
        }, null, 2);

      default:
        return JSON.stringify({
          custom_field: 'valor',
          timestamp: new Date().toISOString(),
        }, null, 2);
    }
  };

  // ============================================
  // SET SAMPLE DATA
  // ============================================

  useEffect(() => {
    if (useSampleData) {
      setTriggerData(getSampleDataForTrigger());
    }
  }, [useSampleData, triggerNode]);

  // ============================================
  // RUN TEST
  // ============================================

  const handleTest = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // Validate JSON
      let parsedData = {};
      try {
        parsedData = JSON.parse(triggerData);
      } catch {
        throw new Error('JSON inválido nos dados do gatilho');
      }

      // Call test API
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

      const testResult = await response.json();
      setResult(testResult);

      // Auto-expand first error node
      const errorStep = testResult.steps?.find((s: NodeResult) => s.status === 'error');
      if (errorStep) {
        setExpandedNodes(new Set([errorStep.nodeId]));
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const toggleNodeExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-white/30" />;
      case 'waiting':
        return <Clock className="w-4 h-4 text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-white/40" />;
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-[#111111] border border-white/10 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Testar Automação</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
            {/* Contact Selection */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Contato para Teste
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSampleData}
                    onChange={(e) => setUseSampleData(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-white/70">Usar dados de exemplo</span>
                </label>
              </div>

              {!useSampleData && (
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className={cn(
                    'w-full mt-2 px-3 py-2 rounded-lg',
                    'bg-[#0a0a0a] border border-white/10 text-white',
                    'focus:outline-none focus:border-blue-500/50'
                  )}
                >
                  <option value="">Selecione um contato real</option>
                  {isLoadingContacts ? (
                    <option disabled>Carregando...</option>
                  ) : (
                    contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Trigger Data Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white/70">
                  Dados do Gatilho (JSON)
                </label>
                {triggerNode && (
                  <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                    {triggerNode.data?.label || triggerNode.data?.nodeType}
                  </span>
                )}
              </div>
              <textarea
                value={triggerData}
                onChange={(e) => setTriggerData(e.target.value)}
                placeholder='{"key": "value"}'
                className={cn(
                  'w-full h-40 px-3 py-2 rounded-lg font-mono text-sm',
                  'bg-[#0a0a0a] border border-white/10 text-white',
                  'placeholder-white/30',
                  'focus:outline-none focus:border-blue-500/50',
                  'resize-none'
                )}
              />
              <p className="mt-1 text-xs text-white/40">
                Estes dados simularão o evento que dispara a automação
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4">
                {/* Summary */}
                <div className={cn(
                  'p-4 rounded-lg border',
                  result.success 
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                )}>
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-400" />
                    )}
                    <div>
                      <p className={cn(
                        'font-medium',
                        result.success ? 'text-green-300' : 'text-red-300'
                      )}>
                        {result.success ? 'Teste bem sucedido!' : 'Teste falhou'}
                      </p>
                      <p className="text-sm text-white/50">
                        Duração: {result.totalDuration}ms • ID: {result.executionId}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contact Used */}
                {result.contact && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-white/40" />
                      <span className="text-white/70">Contato:</span>
                      <span className="text-white">
                        {result.contact.full_name || result.contact.first_name || result.contact.email}
                      </span>
                      {result.contact.email && (
                        <span className="text-white/40">({result.contact.email})</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Node Results */}
                <div>
                  <h3 className="text-sm font-medium text-white/70 mb-2">
                    Resultado por Nó ({result.steps?.length || 0} passos)
                  </h3>
                  <div className="space-y-2">
                    {result.steps?.map((step) => {
                      const node = nodes.find((n) => n.id === step.nodeId);
                      const isExpanded = expandedNodes.has(step.nodeId);

                      return (
                        <div
                          key={step.nodeId}
                          className="rounded-lg border border-white/10 overflow-hidden"
                        >
                          {/* Node Header */}
                          <button
                            onClick={() => toggleNodeExpand(step.nodeId)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                          >
                            {getStatusIcon(step.status)}
                            <span className="flex-1 text-left text-sm text-white/80">
                              {node?.data?.label || step.nodeId}
                            </span>
                            {step.duration !== undefined && (
                              <span className="text-xs text-white/40">
                                {step.duration}ms
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                          </button>

                          {/* Node Details */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-white/10"
                              >
                                <div className="p-3 bg-[#0a0a0a]">
                                  {step.error && (
                                    <div className="mb-2 p-2 rounded bg-red-500/20 text-red-300 text-xs">
                                      {step.error}
                                    </div>
                                  )}
                                  {step.output && (
                                    <pre className="text-xs text-white/60 overflow-x-auto">
                                      {JSON.stringify(step.output, null, 2)}
                                    </pre>
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
              </div>
            )}

            {/* Running State */}
            {isRunning && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
                <p className="text-white/60">Executando teste...</p>
                <p className="text-white/40 text-sm mt-1">
                  Isso pode levar alguns segundos
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
            <button
              onClick={onClose}
              className={cn(
                'px-4 py-2 rounded-lg',
                'text-sm font-medium text-white/60',
                'hover:bg-white/10 hover:text-white',
                'transition-colors'
              )}
            >
              Fechar
            </button>
            <button
              onClick={handleTest}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-blue-600 hover:bg-blue-500 text-white',
                'text-sm font-medium',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default TestModal;
