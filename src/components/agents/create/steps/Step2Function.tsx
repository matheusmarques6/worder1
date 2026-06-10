'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  ListChecks,
  Ban,
  UserCheck,
  Plus,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShoppingCart,
  Headphones,
  Calendar,
  HelpCircle,
  Settings,
} from 'lucide-react';
import type { NicheTemplate } from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';

// Tipos
export interface AgentFunction {
  objective: string;
  objectiveCustom?: string;
  mainTasks: string[];
  limitations: string[];
  handoffRules: string;
}

interface Step2FunctionProps {
  template: NicheTemplate;
  storeAnalysis: StoreAnalysis | null;
  agentFunction: AgentFunction;
  onFunctionChange: (fn: AgentFunction) => void;
  onNext: () => void;
  onBack: () => void;
}

// Objetivos pré-definidos
const OBJECTIVES = [
  { 
    id: 'sales', 
    label: 'Vendas e conversão', 
    icon: ShoppingCart,
    description: 'Ajudar clientes a comprar, recomendar produtos, fechar vendas',
    suggestedTasks: [
      'Responder dúvidas sobre produtos',
      'Recomendar produtos baseado nas necessidades',
      'Informar preços e disponibilidade',
      'Explicar formas de pagamento',
      'Enviar links de produtos',
    ],
  },
  { 
    id: 'support', 
    label: 'Atendimento e suporte', 
    icon: Headphones,
    description: 'Resolver problemas, tirar dúvidas, acompanhar pedidos',
    suggestedTasks: [
      'Verificar status de pedidos',
      'Resolver problemas de entrega',
      'Processar trocas e devoluções',
      'Esclarecer políticas da loja',
      'Encaminhar casos complexos',
    ],
  },
  { 
    id: 'leads', 
    label: 'Qualificação de leads', 
    icon: Target,
    description: 'Coletar informações, qualificar interesse, agendar contato',
    suggestedTasks: [
      'Coletar nome e contato',
      'Identificar necessidades',
      'Avaliar perfil do cliente',
      'Agendar ligação/reunião',
      'Enviar materiais informativos',
    ],
  },
  { 
    id: 'scheduling', 
    label: 'Agendamento', 
    icon: Calendar,
    description: 'Agendar consultas, serviços ou atendimentos',
    suggestedTasks: [
      'Verificar disponibilidade',
      'Agendar horários',
      'Enviar confirmações',
      'Reagendar quando necessário',
      'Enviar lembretes',
    ],
  },
  { 
    id: 'faq', 
    label: 'FAQ e informações', 
    icon: HelpCircle,
    description: 'Responder perguntas frequentes e fornecer informações',
    suggestedTasks: [
      'Responder perguntas frequentes',
      'Informar horário de funcionamento',
      'Explicar como funciona o serviço',
      'Fornecer endereço e contatos',
      'Enviar links úteis',
    ],
  },
  { 
    id: 'custom', 
    label: 'Personalizado', 
    icon: Settings,
    description: 'Definir objetivo customizado para seu negócio',
    suggestedTasks: [],
  },
];

// Limitações sugeridas
const SUGGESTED_LIMITATIONS = [
  'Não oferecer descontos sem autorização',
  'Não prometer prazos de entrega específicos',
  'Não compartilhar dados de outros clientes',
  'Não fazer promessas que não pode cumprir',
  'Não discutir assuntos fora do escopo do negócio',
];

export function Step2Function({
  template,
  storeAnalysis,
  agentFunction,
  onFunctionChange,
  onNext,
  onBack,
}: Step2FunctionProps) {
  const [newTask, setNewTask] = useState('');
  const [newLimitation, setNewLimitation] = useState('');

  // Get current objective data
  const currentObjective = OBJECTIVES.find(o => o.id === agentFunction.objective) || OBJECTIVES[0];

  // Handle objective selection
  const handleObjectiveSelect = (objectiveId: string) => {
    const objective = OBJECTIVES.find(o => o.id === objectiveId);
    onFunctionChange({
      ...agentFunction,
      objective: objectiveId,
      // Auto-preencher tarefas sugeridas se mudar de objetivo
      mainTasks: objective?.suggestedTasks || agentFunction.mainTasks,
    });
  };

  // Add task
  const addTask = () => {
    if (newTask.trim()) {
      onFunctionChange({
        ...agentFunction,
        mainTasks: [...agentFunction.mainTasks, newTask.trim()],
      });
      setNewTask('');
    }
  };

  // Remove task
  const removeTask = (index: number) => {
    onFunctionChange({
      ...agentFunction,
      mainTasks: agentFunction.mainTasks.filter((_, i) => i !== index),
    });
  };

  // Add limitation
  const addLimitation = (limitation: string) => {
    if (!agentFunction.limitations.includes(limitation)) {
      onFunctionChange({
        ...agentFunction,
        limitations: [...agentFunction.limitations, limitation],
      });
    }
    setNewLimitation('');
  };

  // Remove limitation
  const removeLimitation = (index: number) => {
    onFunctionChange({
      ...agentFunction,
      limitations: agentFunction.limitations.filter((_, i) => i !== index),
    });
  };

  // Validation
  const canProceed = agentFunction.objective && 
    (agentFunction.objective !== 'custom' || agentFunction.objectiveCustom?.trim()) &&
    agentFunction.mainTasks.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Target />
        </div>
        <div>
          <h2 className="sec-t">Função do Agente</h2>
          <p className="sec-s">
            Defina o objetivo principal e as tarefas que seu agente vai executar.
          </p>
        </div>
      </div>

      {/* Objective Selection */}
      <div className="space-y-3">
        <label className="label" style={{ marginBottom: 0 }}>
          Objetivo Principal <span style={{ color: 'var(--red)' }}>*</span>
        </label>
        <div className="obj-grid">
          {OBJECTIVES.map((obj) => {
            const Icon = obj.icon;
            const isSelected = agentFunction.objective === obj.id;
            return (
              <button
                key={obj.id}
                onClick={() => handleObjectiveSelect(obj.id)}
                className={`obj ${isSelected ? 'on' : ''}`}
              >
                <div className="obj-ico">
                  <Icon />
                </div>
                <div>
                  <div className="obj-t">{obj.label}</div>
                  <p className="obj-d line-clamp-2">{obj.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom objective input */}
        {agentFunction.objective === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3"
          >
            <input
              type="text"
              value={agentFunction.objectiveCustom || ''}
              onChange={(e) => onFunctionChange({ ...agentFunction, objectiveCustom: e.target.value })}
              placeholder="Descreva o objetivo do seu agente..."
              className="field"
            />
          </motion.div>
        )}
      </div>

      {/* Main Tasks */}
      <div className="space-y-3">
        <label className="label flex items-center gap-2" style={{ marginBottom: 0 }}>
          <ListChecks className="w-4 h-4" />
          Tarefas Principais <span style={{ color: 'var(--red)' }}>*</span>
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({agentFunction.mainTasks.length})</span>
        </label>

        <div className="space-y-2">
          {agentFunction.mainTasks.map((task, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="task-item"
            >
              <span className="task-num">{index + 1}</span>
              <span className="flex-1">{task}</span>
              <button
                onClick={() => removeTask(index)}
                className="task-del"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Add task input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTask()}
            placeholder="Adicionar tarefa..."
            className="field flex-1"
          />
          <button
            onClick={addTask}
            disabled={!newTask.trim()}
            className="btn btn-primary btn-icon"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Limitations */}
      <div className="space-y-3">
        <label className="label flex items-center gap-2" style={{ marginBottom: 0 }}>
          <Ban className="w-4 h-4" />
          Limitações (o que NÃO fazer)
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({agentFunction.limitations.length})</span>
        </label>

        {/* Current limitations */}
        <div className="flex flex-wrap gap-2">
          {agentFunction.limitations.map((limitation, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="chip chip-red"
            >
              {limitation}
              <button
                onClick={() => removeLimitation(index)}
                className="ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
        </div>

        {/* Suggested limitations */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_LIMITATIONS.filter(l => !agentFunction.limitations.includes(l)).map((limitation, index) => (
            <button
              key={index}
              onClick={() => addLimitation(limitation)}
              className="chip chip-outline"
            >
              <Plus className="w-3 h-3" />
              {limitation}
            </button>
          ))}
        </div>

        {/* Custom limitation input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newLimitation}
            onChange={(e) => setNewLimitation(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && newLimitation.trim() && addLimitation(newLimitation.trim())}
            placeholder="Adicionar limitação personalizada..."
            className="field flex-1"
          />
          <button
            onClick={() => newLimitation.trim() && addLimitation(newLimitation.trim())}
            disabled={!newLimitation.trim()}
            className="btn btn-soft btn-icon"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Handoff Rules */}
      <div className="space-y-3">
        <label className="label flex items-center gap-2" style={{ marginBottom: 0 }}>
          <UserCheck className="w-4 h-4" />
          Quando transferir para humano
        </label>
        <textarea
          value={agentFunction.handoffRules}
          onChange={(e) => onFunctionChange({ ...agentFunction, handoffRules: e.target.value })}
          placeholder="Ex: Quando o cliente estiver irritado, quando pedir reembolso, quando a dúvida for muito complexa..."
          rows={3}
          className="field"
        />
        <p className="hint">
          Defina situações em que o agente deve transferir a conversa para um atendente humano.
        </p>
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
          disabled={!canProceed}
          className="btn btn-primary btn-lg flex-1"
        >
          Próximo
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Step2Function;
