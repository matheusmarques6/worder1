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
  // Subscribe to past/future length directly so the component re-renders
  // when history mutates (canUndo/canRedo are functions that access get(),
  // which doesn't trigger a Zustand re-render on its own).
  const pastLength = useFlowStore((state) => state.past.length);
  const futureLength = useFlowStore((state) => state.future.length);
  const canUndo = () => pastLength > 0;
  const canRedo = () => futureLength > 0;
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
    <div className="h-[60px] bg-zinc-950 border-b border-zinc-800 flex items-center px-3 sm:px-5 gap-3 sm:gap-4 shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      {/* Left Section - Logo + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        {/* Worder brand mark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="Worder"
          className="h-7 flex-shrink-0"
        />
        <div className="h-5 w-px bg-zinc-700" />

        {/* Name - inline editable */}
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
                'px-3 py-1 rounded-md',
                'bg-zinc-800 border border-zinc-700',
                'text-white text-[15px] font-semibold tracking-tight',
                'focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10',
                'w-[180px] sm:w-[240px]'
              )}
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white hover:text-white/90 transition-colors group truncate max-w-[180px] sm:max-w-[280px]"
              title={`Renomear: ${automationName}`}
            >
              <span className="truncate">{automationName}</span>
              <Pencil className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={2} />
            </button>
          )}

          {/* Dirty indicator */}
          {isDirty && (
            <span className="text-[10px] sm:text-[11px] font-medium text-amber-200 bg-amber-500/10 px-1.5 sm:px-2 py-0.5 rounded-full border border-amber-400/30 flex-shrink-0 whitespace-nowrap">
              Não salvo
            </span>
          )}
        </div>
      </div>

      {/* Center spacer */}
      <div className="flex-1" />

      {/* Right Section - Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        {/* Undo/Redo */}
        <div className="hidden sm:flex items-center gap-0.5">
          <button
            onClick={undo}
            disabled={!canUndo()}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              canUndo() ? 'hover:bg-zinc-800 text-zinc-300 hover:text-white' : 'text-zinc-600 cursor-not-allowed'
            )}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="w-[15px] h-[15px]" strokeWidth={2} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              canRedo() ? 'hover:bg-zinc-800 text-zinc-300 hover:text-white' : 'text-zinc-600 cursor-not-allowed'
            )}
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-[15px] h-[15px]" strokeWidth={2} />
          </button>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-zinc-800 mx-1" />

        {/* Validation indicator - Alerts */}
        {!valid && errors.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-400/25 rounded-md">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[11px] text-amber-100 max-w-[200px] truncate">{errors[0]}</span>
            {errors.length > 1 && (
              <span className="text-[10px] bg-amber-500/25 text-amber-100 px-1.5 py-0.5 rounded-full font-medium">
                +{errors.length - 1}
              </span>
            )}
          </div>
        )}

        {/* Analytics Toggle */}
        <button
          onClick={toggleAnalytics}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'text-[13px] font-medium transition-colors',
            showAnalytics
              ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15'
              : 'hover:bg-zinc-800 text-zinc-200 hover:text-white'
          )}
          title="Métricas"
        >
          <BarChart3 className="w-4 h-4" strokeWidth={2} />
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
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'hover:bg-zinc-800 text-zinc-200 hover:text-white',
            'transition-colors text-[13px] font-medium'
          )}
          title="Histórico"
        >
          <History className="w-4 h-4" strokeWidth={2} />
          <span className="hidden lg:inline">Histórico</span>
        </button>

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={!valid}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'hover:bg-zinc-800 text-zinc-200 hover:text-white',
            'transition-colors text-[13px] font-medium',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Testar automação"
        >
          <PlayCircle className="w-4 h-4" strokeWidth={2} />
          <span className="hidden sm:inline">Testar</span>
        </button>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-zinc-800 mx-1" />

        {/* Activation Toggle */}
        <ActivationToggle
          isActive={isActive}
          isLoading={isTogglingStatus}
          disabled={!valid && !isActive}
          onToggle={handleToggleStatus}
        />

        {/* Save status indicator */}
        {saveStatus === 'saving' && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 pl-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Salvando...</span>
          </div>
        )}
        {saveStatus === 'saved' && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 pl-1">
            <Check className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salvo</span>
          </div>
        )}

        {/* Salvar e Fechar */}
        <button
          onClick={handleSaveAndClose}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md ml-1',
            'bg-white hover:bg-zinc-100',
            'text-zinc-900 text-[13px] font-semibold tracking-tight',
            'shadow-sm transition-colors',
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
        'relative flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md',
        'transition-all duration-200 ring-1 ring-inset',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive
          ? 'bg-emerald-500/10 ring-emerald-400/30 hover:bg-emerald-500/15'
          : 'bg-zinc-800/60 ring-zinc-700 hover:bg-zinc-800'
      )}
    >
      {/* Toggle Track */}
      <div className={cn(
        'relative w-8 h-[18px] rounded-full transition-colors duration-300',
        isActive ? 'bg-emerald-500' : 'bg-zinc-600'
      )}>
        {/* Toggle Thumb */}
        <motion.div
          className={cn(
            'absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white shadow',
            'flex items-center justify-center'
          )}
          animate={{
            left: isActive ? 16 : 2,
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
        'text-[13px] font-medium tracking-tight',
        isActive ? 'text-emerald-200' : 'text-zinc-200'
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
    <div className="hidden sm:flex items-center gap-0.5 bg-zinc-800/80 ring-1 ring-inset ring-zinc-700 rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTimeframe(opt.value)}
          className={cn(
            'px-2 py-0.5 rounded-[4px] text-[11px] font-semibold tracking-tight transition-colors',
            timeframe === opt.value
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-300 hover:text-white'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default Toolbar;
