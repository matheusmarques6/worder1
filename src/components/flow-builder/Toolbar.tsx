'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save,
  PlayCircle,
  History,
  Loader2,
  Check,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Undo2,
  Redo2,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, useIsValidFlow } from '@/stores/flowStore';

// ============================================
// TOOLBAR COMPONENT
// ============================================

interface ToolbarProps {
  onSave: () => Promise<string | undefined>;
  onTest: () => void;
  onBack: () => void;
  organizationId?: string;
}

export function Toolbar({ onSave, onTest, onBack, organizationId }: ToolbarProps) {
  const automationName = useFlowStore((state) => state.automationName);
  const setAutomationName = useFlowStore((state) => state.setAutomationName);
  const automationStatus = useFlowStore((state) => state.automationStatus);
  const setAutomationStatus = useFlowStore((state) => state.setAutomationStatus);
  const isSaving = useFlowStore((state) => state.isSaving);
  const setSaving = useFlowStore((state) => state.setSaving);
  const isDirty = useFlowStore((state) => state.isDirty);
  const setDirty = useFlowStore((state) => state.setDirty);
  const toggleHistoryPanel = useFlowStore((state) => state.toggleHistoryPanel);
  const undo = useFlowStore((state) => state.undo);
  const redo = useFlowStore((state) => state.redo);
  const canUndo = useFlowStore((state) => state.canUndo);
  const canRedo = useFlowStore((state) => state.canRedo);
  const showAnalytics = useFlowStore((state) => state.showAnalytics);
  const toggleAnalytics = useFlowStore((state) => state.toggleAnalytics);

  const { valid, errors } = useIsValidFlow();

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isEditing, setIsEditing] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const isActive = automationStatus === 'active';

  const handleSave = async () => {
    if (isSaving) return;

    setSaving(true);
    setSaveStatus('saving');

    try {
      const result = await onSave();
      if (result) {
        setSaveStatus('saved');
        setDirty(false);
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    if (isSaving) return;

    setSaving(true);
    setSaveStatus('saving');

    try {
      const result = await onSave();
      if (result) {
        setSaveStatus('saved');
        setDirty(false);
        setTimeout(() => {
          onBack();
        }, 500);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!valid) {
      alert('Corrija os erros antes de ativar:\n\n' + errors.join('\n'));
      return;
    }

    setIsTogglingStatus(true);
    const newStatus = isActive ? 'paused' : 'active';
    setAutomationStatus(newStatus);

    try {
      setSaving(true);
      const result = await onSave();
      if (result) {
        setDirty(false);
      } else {
        setAutomationStatus(automationStatus);
      }
    } catch (e) {
      setAutomationStatus(automationStatus);
    } finally {
      setSaving(false);
      setIsTogglingStatus(false);
    }
  };

  const handleTest = () => {
    if (!valid) {
      alert(errors.join('\n'));
      return;
    }
    onTest();
  };

  return (
    <div className="h-14 bg-zinc-900 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 shrink-0">
      {/* Left Section - Name */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink-0">
        {/* Name - Left aligned */}
        <div className="flex items-center gap-2 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={automationName}
              onChange={(e) => setAutomationName(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
              autoFocus
              className={cn(
                'px-3 py-1.5 rounded-lg',
                'bg-zinc-800 border border-zinc-700',
                'text-white text-base sm:text-lg font-semibold',
                'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
                'w-[150px] sm:w-[200px]'
              )}
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 text-base sm:text-lg font-semibold text-white hover:text-zinc-200 transition-colors group truncate max-w-[150px] sm:max-w-[250px]"
              title={automationName}
            >
              <span className="truncate">{automationName}</span>
              <Pencil className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
            </button>
          )}

          {/* Dirty indicator */}
          {isDirty && (
            <span className="text-[10px] sm:text-xs text-amber-300 bg-amber-500/15 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-amber-500/30 flex-shrink-0 whitespace-nowrap">
              Não salvo
            </span>
          )}
        </div>
      </div>

      {/* Center spacer */}
      <div className="flex-1" />

      {/* Right Section - Actions */}
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 flex-shrink-0">
        {/* Undo/Redo */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo()}
            className={cn(
              'p-2 rounded-lg transition-colors',
              canUndo() ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'text-zinc-600 cursor-not-allowed opacity-40'
            )}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className={cn(
              'p-2 rounded-lg transition-colors',
              canRedo() ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'text-zinc-600 cursor-not-allowed opacity-40'
            )}
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Validation indicator - Alerts */}
        {!valid && errors.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-300 max-w-[200px] truncate">{errors[0]}</span>
            {errors.length > 1 && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                +{errors.length - 1}
              </span>
            )}
          </div>
        )}

        {/* Analytics Toggle */}
        <button
          onClick={toggleAnalytics}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'text-sm transition-colors',
            showAnalytics
              ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
              : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
          )}
          title="Mostrar Métricas"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden lg:inline">Métricas</span>
        </button>

        {/* Analytics Timeframe (shown when analytics active) */}
        {showAnalytics && (
          <AnalyticsTimeframeSelector />
        )}

        {/* History */}
        <button
          onClick={toggleHistoryPanel}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'hover:bg-zinc-800 text-zinc-400 hover:text-white',
            'transition-colors text-sm'
          )}
          title="Histórico"
        >
          <History className="w-4 h-4" />
          <span className="hidden lg:inline">Histórico</span>
        </button>

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={!valid}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'border border-zinc-700 hover:bg-zinc-800',
            'text-zinc-300 hover:text-white text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Testar"
        >
          <PlayCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Testar</span>
        </button>

        {/* Activation Toggle */}
        <ActivationToggle
          isActive={isActive}
          isLoading={isTogglingStatus}
          disabled={!valid && !isActive}
          onToggle={handleToggleStatus}
        />

        {/* Divider - hidden on small screens */}
        <div className="hidden sm:block w-px h-8 bg-zinc-700" />

        {/* Save status indicator */}
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Salvando...</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <Check className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salvo</span>
          </div>
        )}

        {/* Salvar e Fechar */}
        <button
          onClick={handleSaveAndClose}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-white hover:bg-zinc-100',
            'text-zinc-900 text-sm font-semibold',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          Salvar e Fechar
        </button>
      </div>
    </div>
  );
}

// ============================================
// ACTIVATION TOGGLE COMPONENT
// ============================================

interface ActivationToggleProps {
  isActive: boolean;
  isLoading: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function ActivationToggle({ isActive, isLoading, disabled, onToggle }: ActivationToggleProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled || isLoading}
      className={cn(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg',
        'transition-all duration-300 border',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive
          ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
          : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
      )}
    >
      {/* Toggle Track */}
      <div className={cn(
        'relative w-10 h-5 rounded-full transition-colors duration-300',
        isActive ? 'bg-green-500' : 'bg-zinc-600'
      )}>
        {/* Toggle Thumb */}
        <motion.div
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
            'flex items-center justify-center'
          )}
          animate={{
            left: isActive ? 20 : 2,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {isLoading && (
            <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
          )}
        </motion.div>
      </div>

      {/* Label */}
      <span className={cn(
        'text-sm font-medium',
        isActive ? 'text-green-300' : 'text-zinc-300'
      )}>
        {isLoading ? '...' : isActive ? 'Ativo' : 'Inativo'}
      </span>

      {/* Active Indicator */}
      <AnimatePresence>
        {isActive && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="absolute -top-1 -right-1"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

// ============================================
// ANALYTICS TIMEFRAME SELECTOR
// ============================================

function AnalyticsTimeframeSelector() {
  const timeframe = useFlowStore((state) => state.analyticsTimeframe);
  const setTimeframe = useFlowStore((state) => state.setAnalyticsTimeframe);

  const options: Array<{ value: '7d' | '30d' | '90d' | 'all'; label: string }> = [
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: 'all', label: 'Tudo' },
  ];

  return (
    <div className="hidden sm:flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTimeframe(opt.value)}
          className={cn(
            'px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
            timeframe === opt.value
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default Toolbar;
