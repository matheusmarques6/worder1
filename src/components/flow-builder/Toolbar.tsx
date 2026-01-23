'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  PlayCircle,
  History,
  Loader2,
  Check,
  AlertCircle,
  Zap,
  Pencil,
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
        // Close after short delay
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

    // Determine new status
    const newStatus = isActive ? 'paused' : 'active';

    // Update status in store
    setAutomationStatus(newStatus);

    // Auto-save when toggling status
    try {
      setSaving(true);
      const result = await onSave();
      if (result) {
        setDirty(false);
      } else {
        // Revert on failure
        setAutomationStatus(automationStatus);
      }
    } catch (e) {
      // Revert on error
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

  const handleClose = () => {
    if (isDirty) {
      const confirm = window.confirm('Você tem alterações não salvas. Deseja sair mesmo assim?');
      if (!confirm) return;
    }
    onBack();
  };

  return (
    <div className="fb-toolbar h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
      {/* Left Section - Close Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleClose}
          className={cn(
            'p-2 rounded-lg',
            'hover:bg-gray-100 text-gray-500 hover:text-gray-700',
            'transition-colors'
          )}
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Center Section - Name */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {isEditing ? (
          <input
            type="text"
            value={automationName}
            onChange={(e) => setAutomationName(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
            autoFocus
            className={cn(
              'px-3 py-1.5 rounded-lg text-center',
              'bg-gray-100 border border-gray-300',
              'text-gray-900 text-lg font-semibold',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'min-w-[200px]'
            )}
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors group"
          >
            {automationName}
            <Pencil className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </button>
        )}

        {/* Dirty indicator */}
        {isDirty && (
          <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
            Não salvo
          </span>
        )}
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-3">
        {/* Validation indicator */}
        {!valid && errors.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-700">{errors[0]}</span>
          </div>
        )}

        {/* History */}
        <button
          onClick={toggleHistoryPanel}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'hover:bg-gray-100 text-gray-600 hover:text-gray-900',
            'transition-colors text-sm'
          )}
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">Histórico</span>
        </button>

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={!valid}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-gray-100 hover:bg-gray-200',
            'text-gray-700 text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <PlayCircle className="w-4 h-4" />
          Testar
        </button>

        {/* Activation Toggle */}
        <ActivationToggle
          isActive={isActive}
          isLoading={isTogglingStatus}
          disabled={!valid && !isActive}
          onToggle={handleToggleStatus}
        />

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200" />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-gray-100 hover:bg-gray-200 border border-gray-300',
            'text-gray-700 text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveStatus === 'saved' && <Check className="w-4 h-4 text-green-600" />}
          {saveStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
          {saveStatus === 'idle' && <Save className="w-4 h-4" />}
          <span>SALVAR</span>
        </button>

        {/* Save and Close */}
        <button
          onClick={handleSaveAndClose}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-blue-600 hover:bg-blue-700',
            'text-white text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {saveStatus === 'saving' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>SALVAR E FECHAR</span>
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
          ? 'bg-green-50 border-green-200 hover:bg-green-100'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      )}
    >
      {/* Toggle Track */}
      <div className={cn(
        'relative w-10 h-5 rounded-full transition-colors duration-300',
        isActive ? 'bg-green-500' : 'bg-gray-300'
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
        isActive ? 'text-green-700' : 'text-gray-600'
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

export default Toolbar;
