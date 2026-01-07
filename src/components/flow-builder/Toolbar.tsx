'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  PlayCircle,
  History,
  Settings,
  Loader2,
  Check,
  AlertCircle,
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
  
  const { valid, error } = useIsValidFlow();
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isEditing, setIsEditing] = useState(false);

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
    const newStatus = automationStatus === 'active' ? 'paused' : 'active';
    setAutomationStatus(newStatus);
    // Save will be triggered by parent
  };

  const handleTest = () => {
    if (!valid) {
      alert(error);
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
        {!valid && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400">{error}</span>
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

        {/* Activate / Pause */}
        <button
          onClick={handleToggleStatus}
          disabled={!valid || automationStatus === 'draft'}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'text-sm font-medium transition-colors',
            automationStatus === 'active'
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {automationStatus === 'active' ? (
            <>
              <Pause className="w-4 h-4" />
              Pausar
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Ativar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================
// STATUS BADGE COMPONENT
// ============================================

function StatusBadge({ status }: { status: 'draft' | 'active' | 'paused' }) {
  const config = {
    draft: { label: 'Rascunho', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    active: { label: 'Ativa', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    paused: { label: 'Pausada', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
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

export default Toolbar;
