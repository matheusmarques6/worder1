'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  PlayCircle,
  History,
  Loader2,
  Check,
  AlertCircle,
  Power,
  Zap,
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
  const toggleTestModal = useFlowStore((state) => state.toggleTestModal);
  
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

  return (
    <div className="fb-toolbar h-14 bg-[#111111] border-b border-white/10 flex items-center justify-between px-4">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Back Button */}
        <button
          onClick={onBack}
          className={cn(
            'p-2 rounded-lg',
            'hover:bg-white/10 text-white/60 hover:text-white',
            'transition-colors'
          )}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Name */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <input
              type="text"
              value={automationName}
              onChange={(e) => setAutomationName(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
              autoFocus
              className={cn(
                'px-2 py-1 rounded-lg',
                'bg-white/10 border border-white/20',
                'text-white text-lg font-semibold',
                'focus:outline-none focus:border-blue-500'
              )}
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="text-lg font-semibold text-white hover:text-blue-400 transition-colors"
            >
              {automationName}
            </button>
          )}
          
          {/* Status Badge */}
          <StatusBadge status={automationStatus} />
          
          {/* Dirty indicator */}
          {isDirty && (
            <span className="text-[10px] text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
              Não salvo
            </span>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Validation indicator */}
        {!valid && errors.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400">{errors[0]}</span>
          </div>
        )}

        {/* History */}
        <button
          onClick={toggleHistoryPanel}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'hover:bg-white/10 text-white/60 hover:text-white',
            'transition-colors'
          )}
        >
          <History className="w-4 h-4" />
          <span className="text-sm hidden sm:inline">Histórico</span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Test */}
        <button
          onClick={handleTest}
          disabled={!valid}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-white/10 hover:bg-white/20',
            'text-white text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <PlayCircle className="w-4 h-4" />
          Testar
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-blue-600 hover:bg-blue-500',
            'text-white text-sm font-medium',
            'transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveStatus === 'saved' && <Check className="w-4 h-4" />}
          {saveStatus === 'error' && <AlertCircle className="w-4 h-4" />}
          {saveStatus === 'idle' && <Save className="w-4 h-4" />}
          <span>
            {saveStatus === 'saving' && 'Salvando...'}
            {saveStatus === 'saved' && 'Salvo!'}
            {saveStatus === 'error' && 'Erro'}
            {saveStatus === 'idle' && 'Salvar'}
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Activate / Pause Toggle */}
        <ActivationToggle
          isActive={isActive}
          isLoading={isTogglingStatus}
          disabled={!valid && !isActive}
          onToggle={handleToggleStatus}
        />
      </div>
    </div>
  );
}

// ============================================
// STATUS BADGE COMPONENT
// ============================================

function StatusBadge({ status }: { status: 'draft' | 'active' | 'paused' | 'error' }) {
  const config = {
    draft: { label: 'Rascunho', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    active: { label: 'Ativa', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    paused: { label: 'Pausada', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    error: { label: 'Erro', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  };

  const { label, color } = config[status];

  return (
    <span className={cn(
      'px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border',
      color
    )}>
      {label}
    </span>
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
        'relative flex items-center gap-3 px-4 py-2 rounded-xl',
        'transition-all duration-300',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isActive
          ? 'bg-green-500/20 border border-green-500/40 hover:bg-green-500/30'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      )}
    >
      {/* Toggle Track */}
      <div className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-300',
        isActive ? 'bg-green-500' : 'bg-white/20'
      )}>
        {/* Toggle Thumb */}
        <motion.div
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full',
            'flex items-center justify-center',
            isActive ? 'bg-white' : 'bg-white/60'
          )}
          animate={{
            left: isActive ? 24 : 4,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {isLoading ? (
            <Loader2 className="w-2.5 h-2.5 text-green-600 animate-spin" />
          ) : isActive ? (
            <Zap className="w-2.5 h-2.5 text-green-600" />
          ) : null}
        </motion.div>
      </div>

      {/* Label */}
      <div className="flex flex-col items-start">
        <span className={cn(
          'text-sm font-medium leading-tight',
          isActive ? 'text-green-400' : 'text-white/70'
        )}>
          {isLoading ? 'Salvando...' : isActive ? 'Ativa' : 'Inativa'}
        </span>
        <span className="text-[10px] text-white/40 leading-tight">
          {isActive ? 'Automação rodando' : 'Clique para ativar'}
        </span>
      </div>

      {/* Active Glow Effect */}
      <AnimatePresence>
        {isActive && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-1 -right-1"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

export default Toolbar;
