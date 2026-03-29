'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Edit3,
  RotateCcw,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target,
  User,
  MessageSquare,
  AlertCircle,
  Zap,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { NicheTemplate } from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';
import type { AgentFunction } from './Step2Function';

interface Step4PromptPreviewProps {
  template: NicheTemplate;
  storeAnalysis: StoreAnalysis | null;
  formData: Record<string, string>;
  persona: {
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  };
  agentFunction: AgentFunction;
  generatedPrompt: string;
  editedPrompt: string;
  onPromptChange: (prompt: string) => void;
  onNext: () => void;
  onBack: () => void;
}

// Accordion component
function Accordion({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50/50 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-white/50 border-t border-gray-200">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Step4PromptPreview({
  template,
  storeAnalysis,
  formData,
  persona,
  agentFunction,
  generatedPrompt,
  editedPrompt,
  onPromptChange,
  onNext,
  onBack,
}: Step4PromptPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Tone labels
  const toneLabels = {
    casual: 'Casual',
    friendly: 'Amigável',
    professional: 'Profissional',
    luxury: 'Luxo',
  };

  // Response length labels
  const lengthLabels = {
    short: 'Curto (100-200 chars)',
    medium: 'Médio (150-250 chars)',
    long: 'Longo (200-300 chars)',
  };

  // Copy prompt
  const handleCopy = () => {
    navigator.clipboard.writeText(editedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset to original
  const handleReset = () => {
    onPromptChange(generatedPrompt);
    setIsEditing(false);
  };

  // Check if prompt was edited
  const isModified = editedPrompt !== generatedPrompt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-400" />
          Preview do Prompt
        </h2>
        <p className="text-gray-500">
          Revise como o prompt foi construído e edite se necessário.
        </p>
      </div>

      {/* Prompt Editor/Viewer */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Prompt Final
            {isModified && (
              <span className="ml-2 text-xs text-amber-400">(modificado)</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="p-2 text-gray-500 hover:text-white hover:bg-gray-50 rounded-lg transition-colors"
              title={showRaw ? 'Ver formatado' : 'Ver raw'}
            >
              {showRaw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopy}
              className="p-2 text-gray-500 hover:text-white hover:bg-gray-50 rounded-lg transition-colors"
              title="Copiar"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            {isModified && (
              <button
                onClick={handleReset}
                className="p-2 text-gray-500 hover:text-amber-400 hover:bg-gray-50 rounded-lg transition-colors"
                title="Restaurar original"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5
                ${isEditing 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-100 hover:bg-zinc-600 text-gray-700'}
              `}
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditing ? 'Salvar' : 'Editar'}
            </button>
          </div>
        </div>

        {isEditing ? (
          <textarea
            value={editedPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            className="w-full h-80 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-white font-mono text-sm focus:border-purple-500 focus:outline-none resize-none"
            placeholder="Digite o prompt do agente..."
          />
        ) : (
          <div className="relative">
            <pre className="w-full h-80 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 font-mono text-sm overflow-y-auto whitespace-pre-wrap">
              {editedPrompt}
            </pre>
          </div>
        )}
      </div>

      {/* How it was built */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Como foi construído
        </h3>

        <div className="space-y-2">
          {/* Template */}
          <Accordion title="Template Escolhido" icon={Sparkles} defaultOpen>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{template.icon}</span>
                <span className="text-gray-900 font-medium">{template.name}</span>
              </div>
              <p className="text-gray-500">{template.description}</p>
            </div>
          </Accordion>

          {/* Function */}
          <Accordion title="Função do Agente" icon={Target}>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Objetivo:</span>
                <p className="text-white">
                  {agentFunction.objective === 'custom' 
                    ? agentFunction.objectiveCustom 
                    : agentFunction.objective}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Tarefas ({agentFunction.mainTasks.length}):</span>
                <ul className="mt-1 space-y-1">
                  {agentFunction.mainTasks.map((task, i) => (
                    <li key={i} className="text-gray-700 flex items-start gap-2">
                      <span className="text-blue-400">•</span>
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
              {agentFunction.limitations.length > 0 && (
                <div>
                  <span className="text-gray-500">Limitações ({agentFunction.limitations.length}):</span>
                  <ul className="mt-1 space-y-1">
                    {agentFunction.limitations.map((lim, i) => (
                      <li key={i} className="text-red-300 flex items-start gap-2">
                        <span className="text-red-400">⚠️</span>
                        {lim}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {agentFunction.handoffRules && (
                <div>
                  <span className="text-gray-500">Transferir quando:</span>
                  <p className="text-gray-700 mt-1">{agentFunction.handoffRules}</p>
                </div>
              )}
            </div>
          </Accordion>

          {/* Variables */}
          <Accordion title="Variáveis Preenchidas" icon={MessageSquare}>
            <div className="space-y-2 text-sm">
              {Object.entries(formData).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-blue-300">
                    {key}
                  </code>
                  <span className="text-gray-700">{value || '(vazio)'}</span>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Persona */}
          <Accordion title="Persona" icon={User}>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Tom de voz</span>
                <p className="text-gray-900 font-medium">{toneLabels[persona.tone]}</p>
              </div>
              <div>
                <span className="text-gray-500">Tamanho</span>
                <p className="text-gray-900 font-medium">{lengthLabels[persona.responseLength]}</p>
              </div>
              <div>
                <span className="text-gray-500">Delay</span>
                <p className="text-gray-900 font-medium">{persona.replyDelay}s</p>
              </div>
            </div>
          </Accordion>

          {/* Store Analysis */}
          {storeAnalysis && (
            <Accordion title="Dados da Loja" icon={Zap}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Loja</span>
                  <span className="text-white">{storeAnalysis.storeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Produtos</span>
                  <span className="text-white">{storeAnalysis.products?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Coleções</span>
                  <span className="text-white">{storeAnalysis.categories?.length || 0}</span>
                </div>
              </div>
            </Accordion>
          )}
        </div>
      </div>

      {/* Runtime context info */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-300">Contexto Dinâmico (em tempo de execução)</h4>
            <p className="text-xs text-blue-200/70 mt-1">
              A engine adiciona automaticamente: histórico da conversa, conhecimento do RAG, 
              instruções de ações/transferências, e informações do contato.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 hover:bg-zinc-600 text-gray-900 font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!editedPrompt.trim()}
          className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-100 disabled:text-gray-500 text-gray-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          Próximo
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Step4PromptPreview;
