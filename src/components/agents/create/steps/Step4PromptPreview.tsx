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
    <div className="accordion">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`acc-head ${isOpen ? 'open' : ''}`}
      >
        <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="ch" />
        ) : (
          <ChevronDown className="ch" />
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
            <div className="acc-body">
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
      <div className="sec-head">
        <div className="sec-ico">
          <FileText />
        </div>
        <div>
          <h2 className="sec-t">Preview do Prompt</h2>
          <p className="sec-s">
            Revise como o prompt foi construído e edite se necessário.
          </p>
        </div>
      </div>

      {/* Prompt Editor/Viewer */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="label" style={{ marginBottom: 0 }}>
            Prompt Final
            {isModified && (
              <span className="ml-2 text-xs" style={{ color: 'var(--amber)' }}>(modificado)</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="btn btn-soft btn-icon btn-sm"
              title={showRaw ? 'Ver formatado' : 'Ver raw'}
            >
              {showRaw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopy}
              className="btn btn-soft btn-icon btn-sm"
              title="Copiar"
            >
              {copied ? <Check className="w-4 h-4" style={{ color: 'var(--green)' }} /> : <Copy className="w-4 h-4" />}
            </button>
            {isModified && (
              <button
                onClick={handleReset}
                className="btn btn-soft btn-icon btn-sm"
                title="Restaurar original"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`btn btn-sm ${isEditing ? 'btn-primary' : 'btn-soft'}`}
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
            className="field"
            style={{ height: 320, fontFamily: 'var(--mono)', fontSize: 13 }}
            placeholder="Digite o prompt do agente..."
          />
        ) : (
          <div className="prompt-box">
            {editedPrompt}
          </div>
        )}
      </div>

      {/* How it was built */}
      <div className="space-y-3">
        <h3 className="label uppercase flex items-center gap-2" style={{ marginBottom: 0 }}>
          <Zap className="w-4 h-4" />
          Como foi construído
        </h3>

        <div className="space-y-2">
          {/* Template */}
          <Accordion title="Template Escolhido" icon={Sparkles} defaultOpen>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{template.icon}</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{template.name}</span>
              </div>
              <p style={{ color: 'var(--text-3)' }}>{template.description}</p>
            </div>
          </Accordion>

          {/* Function */}
          <Accordion title="Função do Agente" icon={Target}>
            <div className="space-y-3 text-sm">
              <div>
                <span style={{ color: 'var(--text-3)' }}>Objetivo:</span>
                <p style={{ color: 'var(--text)' }}>
                  {agentFunction.objective === 'custom'
                    ? agentFunction.objectiveCustom
                    : agentFunction.objective}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)' }}>Tarefas ({agentFunction.mainTasks.length}):</span>
                <ul className="mt-1 space-y-1">
                  {agentFunction.mainTasks.map((task, i) => (
                    <li key={i} className="flex items-start gap-2" style={{ color: 'var(--text-2)' }}>
                      <span style={{ color: 'var(--brand)' }}>•</span>
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
              {agentFunction.limitations.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-3)' }}>Limitações ({agentFunction.limitations.length}):</span>
                  <ul className="mt-1 space-y-1">
                    {agentFunction.limitations.map((lim, i) => (
                      <li key={i} className="flex items-start gap-2" style={{ color: 'var(--red)' }}>
                        <span>⚠️</span>
                        {lim}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {agentFunction.handoffRules && (
                <div>
                  <span style={{ color: 'var(--text-3)' }}>Transferir quando:</span>
                  <p className="mt-1" style={{ color: 'var(--text-2)' }}>{agentFunction.handoffRules}</p>
                </div>
              )}
            </div>
          </Accordion>

          {/* Variables */}
          <Accordion title="Variáveis Preenchidas" icon={MessageSquare}>
            <div className="space-y-2 text-sm">
              {Object.entries(formData).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <code className="kbd">
                    {key}
                  </code>
                  <span style={{ color: 'var(--text-2)' }}>{value || '(vazio)'}</span>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Persona */}
          <Accordion title="Persona" icon={User}>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span style={{ color: 'var(--text-3)' }}>Tom de voz</span>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{toneLabels[persona.tone]}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)' }}>Tamanho</span>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{lengthLabels[persona.responseLength]}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)' }}>Delay</span>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{persona.replyDelay}s</p>
              </div>
            </div>
          </Accordion>

          {/* Store Analysis */}
          {storeAnalysis && (
            <Accordion title="Dados da Loja" icon={Zap}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Loja</span>
                  <span style={{ color: 'var(--text)' }}>{storeAnalysis.storeName}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Produtos</span>
                  <span style={{ color: 'var(--text)' }}>{storeAnalysis.products?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Coleções</span>
                  <span style={{ color: 'var(--text)' }}>{storeAnalysis.categories?.length || 0}</span>
                </div>
              </div>
            </Accordion>
          )}
        </div>
      </div>

      {/* Runtime context info */}
      <div className="callout blue">
        <AlertCircle className="flex-shrink-0" />
        <div>
          <h4 className="font-semibold">Contexto Dinâmico (em tempo de execução)</h4>
          <p className="mt-1">
            A engine adiciona automaticamente: histórico da conversa, conhecimento do RAG,
            instruções de ações/transferências, e informações do contato.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="btn btn-ghost btn-lg"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!editedPrompt.trim()}
          className="btn btn-primary btn-lg flex-1"
        >
          Próximo
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Step4PromptPreview;
