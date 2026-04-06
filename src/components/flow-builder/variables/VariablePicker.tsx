'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronRight,
  Copy,
  Check,
  X,
  Sparkles,
  User,
  Building,
  Calendar,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  VariableCategory,
  Variable,
  formatVariableForInsert,
  formatVariableWithDefault,
  getVariablesByTriggerType,
} from './variableDefinitions';

// ============================================
// VARIABLE PICKER COMPONENT
// ============================================

interface VariablePickerProps {
  triggerType: string;
  onSelect: (variable: string) => void;
  onClose: () => void;
  eventData?: Record<string, any>; // Real event data for preview
}

export function VariablePicker({ triggerType, onSelect, onClose, eventData }: VariablePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('event');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showDefaultInput, setShowDefaultInput] = useState<string | null>(null);
  const [defaultValue, setDefaultValue] = useState('');

  const categories = getVariablesByTriggerType(triggerType);

  // Filter variables based on search
  const filteredCategories = searchQuery
    ? categories.map((cat) => ({
        ...cat,
        variables: cat.variables.filter(
          (v) =>
            v.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((cat) => cat.variables.length > 0)
    : categories;

  const handleSelectVariable = useCallback((variable: Variable, withDefault?: boolean) => {
    if (withDefault && variable.defaultValue) {
      onSelect(formatVariableWithDefault(variable.key, variable.defaultValue));
    } else {
      onSelect(formatVariableForInsert(variable.key));
    }
    onClose();
  }, [onSelect, onClose]);

  const handleCopyVariable = useCallback((key: string) => {
    navigator.clipboard.writeText(formatVariableForInsert(key));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const handleAddWithDefault = useCallback((variable: Variable) => {
    if (defaultValue) {
      onSelect(formatVariableWithDefault(variable.key, defaultValue));
      onClose();
    }
  }, [defaultValue, onSelect, onClose]);

  const getCategoryIcon = (categoryId: string) => {
    switch (categoryId) {
      case 'event': return <Zap className="w-4 h-4" />;
      case 'contact': return <User className="w-4 h-4" />;
      case 'organization': return <Building className="w-4 h-4" />;
      case 'date': return <Calendar className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  // Get real value from event data if available
  const getRealValue = (key: string): string | undefined => {
    if (!eventData) return undefined;

    const parts = key.split('.');
    let value: any = eventData;

    for (const part of parts) {
      if (value === undefined || value === null) return undefined;

      // Handle array access like items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayName, index] = arrayMatch;
        value = value[arrayName]?.[parseInt(index)];
      } else {
        value = value[part];
      }
    }

    if (value === undefined || value === null) return undefined;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Personalização</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar variável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-lg',
                'bg-white border border-gray-300',
                'text-gray-900 placeholder-gray-400',
                'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
                'transition-all'
              )}
              autoFocus
            />
          </div>
        </div>

        {/* Variable Categories */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredCategories.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>Nenhuma variável encontrada</p>
            </div>
          ) : (
            filteredCategories.map((category) => (
              <div key={category.id} className="border-b border-gray-200 last:border-b-0">
                {/* Category Header */}
                <button
                  onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3',
                    'hover:bg-white transition-colors'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-gray-100 text-blue-600">
                      {getCategoryIcon(category.id)}
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-medium text-gray-900">{category.icon} {category.label}</span>
                      <span className="text-xs text-gray-500 ml-2">({category.variables.length})</span>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-gray-500 transition-transform',
                      expandedCategory === category.id && 'rotate-90'
                    )}
                  />
                </button>

                {/* Category Variables */}
                <AnimatePresence>
                  {expandedCategory === category.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2">
                        {category.variables.map((variable) => (
                          <VariableItem
                            key={variable.key}
                            variable={variable}
                            realValue={getRealValue(variable.key)}
                            copied={copiedKey === variable.key}
                            showDefaultInput={showDefaultInput === variable.key}
                            defaultValue={defaultValue}
                            onSelect={() => handleSelectVariable(variable)}
                            onSelectWithDefault={() => handleSelectVariable(variable, true)}
                            onCopy={() => handleCopyVariable(variable.key)}
                            onToggleDefault={() => {
                              setShowDefaultInput(showDefaultInput === variable.key ? null : variable.key);
                              setDefaultValue(variable.defaultValue || '');
                            }}
                            onDefaultChange={setDefaultValue}
                            onAddWithDefault={() => handleAddWithDefault(variable)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            Clique em uma variável para inserir ou use o botão de copiar. Use <code className="text-blue-600 bg-gray-100 px-1 rounded">|default:'valor'</code> para valores padrão.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// VARIABLE ITEM COMPONENT
// ============================================

interface VariableItemProps {
  variable: Variable;
  realValue?: string;
  copied: boolean;
  showDefaultInput: boolean;
  defaultValue: string;
  onSelect: () => void;
  onSelectWithDefault: () => void;
  onCopy: () => void;
  onToggleDefault: () => void;
  onDefaultChange: (value: string) => void;
  onAddWithDefault: () => void;
}

function VariableItem({
  variable,
  realValue,
  copied,
  showDefaultInput,
  defaultValue,
  onSelect,
  onSelectWithDefault,
  onCopy,
  onToggleDefault,
  onDefaultChange,
  onAddWithDefault,
}: VariableItemProps) {
  return (
    <div className="mb-1">
      <div
        className={cn(
          'flex items-center justify-between p-3 rounded-lg',
          'bg-gray-50 hover:bg-gray-100/70',
          'border border-transparent hover:border-gray-300',
          'cursor-pointer transition-all group'
        )}
        onClick={onSelect}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{variable.label}</span>
            {variable.defaultValue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                tem padrão
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-blue-600 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
              {`{{ ${variable.key} }}`}
            </code>
            {realValue && (
              <span className="text-xs text-success-400">
                = {realValue.length > 30 ? realValue.slice(0, 30) + '...' : realValue}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">{variable.description}</p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {variable.defaultValue && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectWithDefault();
              }}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-amber-400 hover:text-amber-300 transition-colors"
              title="Inserir com valor padrão"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleDefault();
            }}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
            title="Definir valor padrão"
          >
            <span className="text-xs font-mono">|</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
            title="Copiar"
          >
            {copied ? <Check className="w-4 h-4 text-success-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Default value input */}
      <AnimatePresence>
        {showDefaultInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 p-2 bg-gray-100/30 rounded-b-lg mx-1">
              <input
                type="text"
                value={defaultValue}
                onChange={(e) => onDefaultChange(e.target.value)}
                placeholder="Valor padrão se vazio..."
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg',
                  'bg-white border border-gray-300',
                  'text-sm text-gray-700 placeholder-gray-400',
                  'focus:outline-none focus:border-blue-500'
                )}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddWithDefault();
                }}
                disabled={!defaultValue}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium',
                  'bg-blue-600 hover:bg-blue-700 text-white',
                  'transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Inserir
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VariablePicker;
