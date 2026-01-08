'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Variable, Search, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface VariableGroup {
  id: string;
  label: string;
  icon?: string;
  variables: Variable[];
}

interface Variable {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  description?: string;
  example?: string;
}

interface VariablePickerProps {
  onSelect: (variable: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

// ============================================
// DEFAULT VARIABLES
// ============================================

const DEFAULT_VARIABLE_GROUPS: VariableGroup[] = [
  {
    id: 'contact',
    label: 'Contato',
    variables: [
      { path: 'contact.name', label: 'Nome', type: 'string', example: 'João Silva' },
      { path: 'contact.firstName', label: 'Primeiro Nome', type: 'string', example: 'João' },
      { path: 'contact.lastName', label: 'Sobrenome', type: 'string', example: 'Silva' },
      { path: 'contact.email', label: 'Email', type: 'string', example: 'joao@email.com' },
      { path: 'contact.phone', label: 'Telefone', type: 'string', example: '+5511999999999' },
      { path: 'contact.tags', label: 'Tags', type: 'array', description: 'Lista de tags do contato' },
      { path: 'contact.createdAt', label: 'Data de Cadastro', type: 'date' },
    ],
  },
  {
    id: 'deal',
    label: 'Deal',
    variables: [
      { path: 'deal.title', label: 'Título', type: 'string', example: 'Venda para João' },
      { path: 'deal.value', label: 'Valor', type: 'number', example: '1500.00' },
      { path: 'deal.stageName', label: 'Estágio', type: 'string', example: 'Negociação' },
      { path: 'deal.pipelineName', label: 'Pipeline', type: 'string', example: 'Vendas' },
      { path: 'deal.probability', label: 'Probabilidade', type: 'number', example: '75' },
    ],
  },
  {
    id: 'order',
    label: 'Pedido',
    variables: [
      { path: 'order.orderNumber', label: 'Número', type: 'string', example: '#1234' },
      { path: 'order.totalPrice', label: 'Total', type: 'number', example: '299.90' },
      { path: 'order.currency', label: 'Moeda', type: 'string', example: 'BRL' },
      { path: 'order.financialStatus', label: 'Status Financeiro', type: 'string', example: 'paid' },
      { path: 'order.customer.email', label: 'Email do Cliente', type: 'string' },
      { path: 'order.lineItems', label: 'Itens', type: 'array', description: 'Lista de produtos' },
    ],
  },
  {
    id: 'trigger',
    label: 'Gatilho',
    variables: [
      { path: 'trigger.type', label: 'Tipo', type: 'string', description: 'Tipo do gatilho' },
      { path: 'trigger.timestamp', label: 'Data/Hora', type: 'date', description: 'Quando foi disparado' },
      { path: 'trigger.data', label: 'Dados', type: 'object', description: 'Dados do evento' },
    ],
  },
  {
    id: 'time',
    label: 'Data/Hora',
    variables: [
      { path: 'now', label: 'Agora (ISO)', type: 'date', example: '2024-01-15T10:30:00.000Z' },
      { path: 'now.date', label: 'Data Atual', type: 'string', example: '2024-01-15' },
      { path: 'now.time', label: 'Hora Atual', type: 'string', example: '10:30:00' },
      { path: 'now.dayOfWeek', label: 'Dia da Semana', type: 'number', description: '0=Dom, 6=Sáb' },
    ],
  },
  {
    id: 'workflow',
    label: 'Automação',
    variables: [
      { path: 'workflow.id', label: 'ID da Automação', type: 'string' },
      { path: 'workflow.name', label: 'Nome da Automação', type: 'string' },
      { path: 'workflow.executionId', label: 'ID da Execução', type: 'string' },
    ],
  },
];

const FILTERS = [
  { name: 'uppercase', description: 'Converter para maiúsculas' },
  { name: 'lowercase', description: 'Converter para minúsculas' },
  { name: 'capitalize', description: 'Primeira letra maiúscula' },
  { name: 'currency', description: 'Formatar como moeda (R$)' },
  { name: 'date', description: 'Formatar data (dd/MM/yyyy)' },
  { name: 'phone', description: 'Formatar telefone brasileiro' },
  { name: 'default:valor', description: 'Valor padrão se vazio' },
  { name: 'truncate:50', description: 'Limitar a 50 caracteres' },
];

// ============================================
// VARIABLE PICKER COMPONENT
// ============================================

export function VariablePicker({ onSelect, onClose, anchorRef }: VariablePickerProps) {
  const [search, setSearch] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string>('contact');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter variables by search
  const filteredGroups = DEFAULT_VARIABLE_GROUPS.map((group) => ({
    ...group,
    variables: group.variables.filter(
      (v) =>
        v.label.toLowerCase().includes(search.toLowerCase()) ||
        v.path.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((g) => g.variables.length > 0);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle variable selection
  const handleSelect = (path: string) => {
    if (showFilters && selectedVariable) {
      // Add filter
      onSelect(`{{${selectedVariable} | ${path}}}`);
      onClose();
    } else {
      setSelectedVariable(path);
      setShowFilters(true);
    }
  };

  const handleDirectSelect = (path: string) => {
    onSelect(`{{${path}}}`);
    onClose();
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute z-50 w-80 max-h-96 overflow-hidden rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl"
      style={{
        top: anchorRef?.current?.offsetHeight ? anchorRef.current.offsetHeight + 4 : 'auto',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Variable className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">
            {showFilters ? 'Adicionar Filtro' : 'Inserir Variável'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar variável..."
            className={cn(
              'w-full pl-9 pr-3 py-2 rounded-lg text-sm',
              'bg-[#0a0a0a] border border-white/10 text-white',
              'placeholder-white/30',
              'focus:outline-none focus:border-blue-500/50'
            )}
            autoFocus
          />
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-64">
        {showFilters ? (
          // Filters list
          <div className="p-2 space-y-1">
            <button
              onClick={() => {
                if (selectedVariable) {
                  handleDirectSelect(selectedVariable);
                }
              }}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-white/10 transition-colors"
            >
              <span className="text-sm text-white/80">Sem filtro</span>
              <span className="text-xs text-white/40 ml-auto">
                {`{{${selectedVariable}}}`}
              </span>
            </button>
            {FILTERS.map((filter) => (
              <button
                key={filter.name}
                onClick={() => handleSelect(filter.name)}
                className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-white/10 transition-colors"
              >
                <div>
                  <span className="text-sm text-white/80">{filter.name}</span>
                  <p className="text-xs text-white/40">{filter.description}</p>
                </div>
              </button>
            ))}
            <button
              onClick={() => {
                setShowFilters(false);
                setSelectedVariable(null);
              }}
              className="w-full p-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              ← Voltar
            </button>
          </div>
        ) : (
          // Variables list
          <div className="p-2">
            {filteredGroups.map((group) => (
              <div key={group.id} className="mb-2">
                {/* Group Header */}
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group.id ? '' : group.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-white/40 transition-transform',
                      expandedGroup === group.id && 'rotate-90'
                    )}
                  />
                  <span className="text-sm font-medium text-white/80">{group.label}</span>
                  <span className="text-xs text-white/30 ml-auto">
                    {group.variables.length}
                  </span>
                </button>

                {/* Group Variables */}
                <AnimatePresence>
                  {expandedGroup === group.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-6 space-y-1">
                        {group.variables.map((variable) => (
                          <button
                            key={variable.path}
                            onClick={() => handleSelect(variable.path)}
                            className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-white/10 transition-colors group"
                          >
                            <div className="min-w-0">
                              <span className="text-sm text-white/80">{variable.label}</span>
                              <p className="text-xs text-white/40 truncate">
                                {variable.example || variable.description || variable.path}
                              </p>
                            </div>
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              'bg-white/5 text-white/40',
                              variable.type === 'string' && 'text-green-400',
                              variable.type === 'number' && 'text-blue-400',
                              variable.type === 'date' && 'text-amber-400',
                              variable.type === 'array' && 'text-purple-400',
                              variable.type === 'object' && 'text-pink-400'
                            )}>
                              {variable.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {filteredGroups.length === 0 && (
              <p className="text-sm text-white/40 text-center py-4">
                Nenhuma variável encontrada
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default VariablePicker;
