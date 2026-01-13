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
      <div>
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Função do Agente
        </h2>
        <p className="text-zinc-400">
          Defina o objetivo principal e as tarefas que seu agente vai executar.
        </p>
      </div>

      {/* Objective Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-300">
          Objetivo Principal <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {OBJECTIVES.map((obj) => {
            const Icon = obj.icon;
            const isSelected = agentFunction.objective === obj.id;
            return (
              <button
                key={obj.id}
                onClick={() => handleObjectiveSelect(obj.id)}
                className={`
                  p-3 rounded-lg border text-left transition-all
                  ${isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {obj.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-2">{obj.description}</p>
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
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </motion.div>
        )}
      </div>

      {/* Main Tasks */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Tarefas Principais <span className="text-red-400">*</span>
          <span className="text-zinc-500 font-normal">({agentFunction.mainTasks.length})</span>
        </label>

        <div className="space-y-2">
          {agentFunction.mainTasks.map((task, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 p-2 bg-zinc-800/50 border border-zinc-700 rounded-lg group"
            >
              <span className="w-6 h-6 bg-blue-500/20 text-blue-400 rounded text-xs flex items-center justify-center">
                {index + 1}
              </span>
              <span className="flex-1 text-sm text-zinc-300">{task}</span>
              <button
                onClick={() => removeTask(index)}
                className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
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
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={addTask}
            disabled={!newTask.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Limitations */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Ban className="w-4 h-4" />
          Limitações (o que NÃO fazer)
          <span className="text-zinc-500 font-normal">({agentFunction.limitations.length})</span>
        </label>

        {/* Current limitations */}
        <div className="flex flex-wrap gap-2">
          {agentFunction.limitations.map((limitation, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-full"
            >
              {limitation}
              <button
                onClick={() => removeLimitation(index)}
                className="ml-1 hover:text-red-400"
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
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm rounded-full hover:border-zinc-600 hover:text-zinc-300 transition-colors"
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
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => newLimitation.trim() && addLimitation(newLimitation.trim())}
            disabled={!newLimitation.trim()}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 disabled:bg-zinc-700 disabled:text-zinc-500 text-red-400 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Handoff Rules */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <UserCheck className="w-4 h-4" />
          Quando transferir para humano
        </label>
        <textarea
          value={agentFunction.handoffRules}
          onChange={(e) => onFunctionChange({ ...agentFunction, handoffRules: e.target.value })}
          placeholder="Ex: Quando o cliente estiver irritado, quando pedir reembolso, quando a dúvida for muito complexa..."
          rows={3}
          className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none resize-none"
        />
        <p className="text-xs text-zinc-500">
          Defina situações em que o agente deve transferir a conversa para um atendente humano.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          Próximo
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Step2Function;
