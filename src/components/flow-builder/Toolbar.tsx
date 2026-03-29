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

  const handleClose = () => {
    if (isDirty) {
      const confirm = window.confirm('Você tem alterações não salvas. Deseja sair mesmo assim?');
      if (!confirm) return;
    }
    onBack();
  };

  return (
    <div className="fb-toolbar h-14 bg-white border-b border-gray-200 flex items-center px-2 sm:px-4 gap-2 sm:gap-4">
      {/* Left Section - Close Button + Name */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink-0">
        <button
          onClick={handleClose}
          className={cn(
            'p-2 rounded-lg flex-shrink-0',
            'hover:bg-gray-100 text-gray-500 hover:text-gray-900',
            'transition-colors'
          )}
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

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
                'bg-white border border-gray-300',
                'text-gray-900 text-base sm:text-lg font-semibold',
                'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20',
                'w-[150px] sm:w-[200px]'
              )}
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 text-base sm:text-lg font-semibold text-gray-900 hover:text-brand-600 transition-colors group truncate max-w-[150px] sm:max-w-[250px]"
              title={automationName}
            >
              <span className="truncate">{automationName}</span>
              <Pencil className="w-4 h-4 text-gray-500 group-hover:text-brand-600 transition-colors flex-shrink-0" />
            </button>
          )}

          {/* Dirty indicator */}
          {isDirty && (
            <span className="text-[10px] sm:text-xs text-amber-400 bg-amber-500/20 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-amber-500/30 flex-shrink-0 whitespace-nowrap">
              Não salvo
            </span>
          )}
        </div>
      </div>

      {/* Center spacer */}
      <div className="flex-1" />

      {/* Right Section - Actions */}
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 flex-shrink-0">
        {/* Validation indicator - hidden on small screens */}
        {!valid && errors.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400 max-w-[200px] truncate">{errors[0]}</span>
          </div>
        )}

        {/* History */}
        <button
          onClick={toggleHistoryPanel}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'hover:bg-gray-100 text-gray-500 hover:text-gray-900',
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
            'bg-gray-100 hover:bg-gray-200',
            'text-gray-700 text-sm font-medium',
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
        <div className="hidden sm:block w-px h-8 bg-gray-100" />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'bg-gray-100 hover:bg-gray-200 border border-gray-300',
            'text-gray-700 text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Salvar"
        >
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveStatus === 'saved' && <Check className="w-4 h-4 text-green-400" />}
          {saveStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          {saveStatus === 'idle' && <Save className="w-4 h-4" />}
          <span className="hidden sm:inline">SALVAR</span>
        </button>

        {/* Save and Close */}
        <button
          onClick={handleSaveAndClose}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg',
            'bg-primary-500 hover:bg-primary-600',
            'text-gray-700 text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Salvar e Fechar"
        >
          {saveStatus === 'saving' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span className="hidden md:inline">SALVAR E FECHAR</span>
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
          ? 'bg-green-500/20 border-green-500/40 hover:bg-green-500/30'
          : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
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
        isActive ? 'text-green-400' : 'text-gray-600'
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
