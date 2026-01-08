'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

interface TestModalProps {
  onClose: () => void;
  onTest: (triggerData: Record<string, any>) => Promise<any>;
}

// ============================================
// TEST MODAL COMPONENT
// ============================================

export function TestModal({ onClose, onTest }: TestModalProps) {
  const [triggerData, setTriggerData] = useState('{}');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const nodes = useFlowStore((s) => s.nodes);
  const testExecution = useFlowStore((s) => s.testExecution);

  // ============================================
  // HANDLERS
  // ============================================

  const handleTest = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      let data = {};
      try {
        data = JSON.parse(triggerData);
      } catch {
        throw new Error('JSON inválido nos dados de teste');
      }

      const testResult = await onTest(data);
      setResult(testResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleNodeExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
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
            <h2 className="text-lg font-semibold text-white">Testar Automação</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
            {/* Trigger Data Input */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Dados do Gatilho (JSON)
              </label>
              <textarea
                value={triggerData}
                onChange={(e) => setTriggerData(e.target.value)}
                placeholder='{"email": "teste@exemplo.com", "name": "João"}'
                className={cn(
                  'w-full h-32 px-3 py-2 rounded-lg font-mono text-sm',
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
              <div className="space-y-3">
                {/* Summary */}
                <div className={cn(
                  'p-4 rounded-lg border',
                  result.status === 'success' 
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                )}>
                  <div className="flex items-center gap-3">
                    {result.status === 'success' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-400" />
                    )}
                    <div>
                      <p className={cn(
                        'font-medium',
                        result.status === 'success' ? 'text-green-300' : 'text-red-300'
                      )}>
                        {result.status === 'success' ? 'Teste bem sucedido!' : 'Teste falhou'}
                      </p>
                      <p className="text-sm text-white/50">
                        Duração: {result.duration}ms
                      </p>
                    </div>
                  </div>
                </div>

                {/* Node Results */}
                <div>
                  <h3 className="text-sm font-medium text-white/70 mb-2">
                    Resultado por Nó
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(result.nodeResults || {}).map(([nodeId, nodeResult]: [string, any]) => {
                      const node = nodes.find((n) => n.id === nodeId);
                      const isExpanded = expandedNodes.has(nodeId);

                      return (
                        <div
                          key={nodeId}
                          className="rounded-lg border border-white/10 overflow-hidden"
                        >
                          {/* Node Header */}
                          <button
                            onClick={() => toggleNodeExpand(nodeId)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                          >
                            {/* Status Icon */}
                            {nodeResult.status === 'success' && (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            )}
                            {nodeResult.status === 'error' && (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                            {nodeResult.status === 'skipped' && (
                              <span className="w-4 h-4 text-white/30">—</span>
                            )}
                            {nodeResult.status === 'waiting' && (
                              <Clock className="w-4 h-4 text-amber-400" />
                            )}

                            {/* Node Name */}
                            <span className="flex-1 text-left text-sm text-white/80">
                              {node?.data.label || nodeId}
                            </span>

                            {/* Duration */}
                            {nodeResult.duration !== undefined && (
                              <span className="text-xs text-white/40">
                                {nodeResult.duration}ms
                              </span>
                            )}

                            {/* Expand Icon */}
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
                                  {nodeResult.error && (
                                    <div className="mb-2 p-2 rounded bg-red-500/20 text-red-300 text-xs">
                                      {nodeResult.error}
                                    </div>
                                  )}
                                  <pre className="text-xs text-white/60 overflow-x-auto">
                                    {JSON.stringify(nodeResult.output, null, 2)}
                                  </pre>
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
