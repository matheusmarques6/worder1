'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store,
  Sparkles,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  Package,
  Tags,
  FileText,
  Brain,
  BarChart,
  MessageSquare,
  Zap,
} from 'lucide-react';
import type { StoreAnalysis } from '@/types/store-analysis';

interface AnalysisStep {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'running' | 'complete' | 'error';
}

interface StoreAnalyzerProps {
  storeId: string;
  storeName?: string;
  onComplete: (analysis: StoreAnalysis) => void;
  onError?: (error: string) => void;
}

const ANALYSIS_STEPS: Omit<AnalysisStep, 'status'>[] = [
  { id: 'shop', name: 'Informações da loja', icon: Store },
  { id: 'products', name: 'Produtos', icon: Package },
  { id: 'collections', name: 'Categorias', icon: Tags },
  { id: 'policies', name: 'Políticas', icon: FileText },
  { id: 'ai', name: 'Análise com IA', icon: Brain },
  { id: 'score', name: 'Calculando scores', icon: BarChart },
  { id: 'faq', name: 'Gerando FAQ', icon: MessageSquare },
];

export function StoreAnalyzer({
  storeId,
  storeName,
  onComplete,
  onError,
}: StoreAnalyzerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [steps, setSteps] = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s) => ({ ...s, status: 'pending' }))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  const startAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setSteps(ANALYSIS_STEPS.map((s) => ({ ...s, status: 'pending' })));

    try {
      // Simular progresso enquanto a API processa
      const progressInterval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < ANALYSIS_STEPS.length - 1) {
            setSteps((steps) =>
              steps.map((s, i) => ({
                ...s,
                status: i < prev + 1 ? 'complete' : i === prev + 1 ? 'running' : 'pending',
              }))
            );
            return prev + 1;
          }
          return prev;
        });
      }, 2500);

      // Chamar API
      const response = await fetch('/api/ai/analyze-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao analisar loja');
      }

      const data = await response.json();

      // Marcar todos como completos
      setSteps((steps) => steps.map((s) => ({ ...s, status: 'complete' })));
      setCurrentStep(ANALYSIS_STEPS.length);

      // Pequeno delay para mostrar sucesso
      await new Promise((resolve) => setTimeout(resolve, 500));

      onComplete(data.analysis);
    } catch (err: any) {
      setError(err.message);
      setSteps((steps) =>
        steps.map((s, i) => ({
          ...s,
          status: i < currentStep ? 'complete' : i === currentStep ? 'error' : 'pending',
        }))
      );
      onError?.(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const progress = (currentStep / ANALYSIS_STEPS.length) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center chip-blue">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
              {storeName || 'Analisar loja'}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              {isAnalyzing
                ? 'Analisando sua loja...'
                : 'Detectamos uma loja Shopify conectada'}
            </p>
          </div>
        </div>

        {!isAnalyzing && (
          <button
            onClick={startAnalysis}
            className="btn btn-primary btn-sm"
          >
            <Sparkles className="w-4 h-4" />
            Analisar com IA
          </button>
        )}
      </div>

      {/* Progress */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-4"
        >
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-3)' }}>Progresso</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
              <motion.div
                className="h-full"
                style={{ background: 'var(--grad)' }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Steps toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm font-semibold transition-colors"
            style={{ color: 'var(--text-2)' }}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
            />
            {showDetails ? 'Ocultar' : 'Ver'} detalhes
          </button>

          {/* Steps list */}
          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-2 rounded-lg transition-colors"
                      style={
                        step.status === 'running'
                          ? { background: 'var(--brand-tint)' }
                          : step.status === 'complete'
                          ? { opacity: 0.6 }
                          : step.status === 'error'
                          ? { background: 'var(--red-tint)' }
                          : undefined
                      }
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={
                          step.status === 'running'
                            ? { background: 'var(--brand-tint-2)', color: 'var(--brand-ink)' }
                            : step.status === 'complete'
                            ? { background: 'var(--green-tint)', color: 'var(--green)' }
                            : step.status === 'error'
                            ? { background: 'var(--red-tint)', color: 'var(--red)' }
                            : { background: 'var(--surface-3)', color: 'var(--text-3)' }
                        }
                      >
                        {step.status === 'running' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : step.status === 'complete' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : step.status === 'error' ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <span
                        className="text-sm"
                        style={
                          step.status === 'running'
                            ? { color: 'var(--text)', fontWeight: 600 }
                            : step.status === 'error'
                            ? { color: 'var(--red)' }
                            : { color: 'var(--text-3)' }
                        }
                      >
                        {step.name}
                      </span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="callout red"
        >
          <XCircle className="flex-shrink-0" />
          <div>
            <p className="font-semibold">Erro na análise</p>
            <p className="mt-1">{error}</p>
            <button
              onClick={startAnalysis}
              className="btn btn-sm mt-3"
              style={{ background: 'var(--red-tint)', color: 'var(--red)' }}
            >
              Tentar novamente
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default StoreAnalyzer;
