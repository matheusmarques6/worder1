'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
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
  ChevronDown,
  FastForward,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useFlowStore, useIsValidFlow } from '@/stores/flowStore';
import { AutomationSwitcher } from './AutomationSwitcher';

// ============================================
// TOOLBAR COMPONENT
// ============================================

interface ToolbarProps {
  onSave: () => Promise<string | undefined>;
  onTest: () => void;
  onBack: () => void;
  organizationId?: string;
  automations?: Array<{ id: string; name: string; status: 'active' | 'paused' | 'draft' }>;
  currentAutomationId?: string;
  onSwitchAutomation?: (id: string) => void;
}

export function Toolbar({ onSave, onTest, onBack, organizationId, automations, currentAutomationId, onSwitchAutomation }: ToolbarProps) {
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

  const [isEditing, setIsEditing] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [toolbarToast, setToolbarToast] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const nameAnchorRef = useRef<HTMLDivElement>(null);
  const lastSavedAt = useFlowStore(s => s.lastSavedAt);
  const [savedAgo, setSavedAgo] = useState('');

  useEffect(() => {
    if (!lastSavedAt) { setSavedAgo(''); return; }
    const update = () => {
      const seconds = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
      if (seconds < 5) setSavedAgo('Salvo agora');
      else if (seconds < 60) setSavedAgo(`Salvo há ${seconds}s`);
      else if (seconds < 3600) setSavedAgo(`Salvo há ${Math.floor(seconds / 60)}min`);
      else setSavedAgo(`Salvo há ${Math.floor(seconds / 3600)}h`);
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  const isActive = automationStatus === 'active';

  const handleToggleStatus = async () => {
    if (!valid) {
      setToolbarToast('Corrija os erros antes de ativar: ' + errors.join(', ')); setTimeout(() => setToolbarToast(null), 5000);
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
      setToolbarToast(errors.join(', ')); setTimeout(() => setToolbarToast(null), 5000);
      return;
    }
    onTest();
  };

  return (
    <>
    {toolbarToast && (
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm shadow-lg max-w-lg">
        {toolbarToast}
      </div>
    )}
    <div className="h-[60px] bg-zinc-950 border-b border-zinc-800 flex items-center px-3 sm:px-5 gap-3 sm:gap-4 shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      {/* Left Section - Logo + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        {/* Worder brand mark — clicking goes back to the main dashboard */}
        <Link href="/dashboard" aria-label="Voltar para o dashboard" className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Worder"
            className="h-7"
          />
        </Link>
        <div className="h-5 w-px bg-zinc-700" />

        {/* Name + Switcher */}
        <div ref={nameAnchorRef} className="relative flex items-center gap-1 min-w-0">
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
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white hover:text-white/90 transition-colors group truncate max-w-[180px] sm:max-w-[280px]"
                title={`Renomear: ${automationName}`}
              >
                <span className="truncate">{automationName}</span>
                <Pencil className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors flex-shrink-0" strokeWidth={2} />
              </button>

              {automations && automations.length > 1 && (
                <button
                  onClick={() => setSwitcherOpen(o => !o)}
                  className={cn(
                    'p-1 rounded-md transition-colors flex-shrink-0',
                    switcherOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  )}
                  title="Trocar de automação"
                  aria-expanded={switcherOpen}
                >
                  <ChevronDown className={cn('w-4 h-4 transition-transform', switcherOpen && 'rotate-180')} strokeWidth={2} />
                </button>
              )}
            </>
          )}

          {/* Save status */}
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 px-2 py-0.5 flex-shrink-0 ml-1">
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />
              Salvando...
            </span>
          ) : isDirty ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-200 px-2 py-0.5 flex-shrink-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Alterações pendentes
            </span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 px-2 py-0.5 flex-shrink-0 ml-1">
              <Check className="w-3 h-3" strokeWidth={2.5} />
              {savedAgo}
            </span>
          ) : null}

          {automations && currentAutomationId && onSwitchAutomation && (
            <AutomationSwitcher
              open={switcherOpen}
              onClose={() => setSwitcherOpen(false)}
              currentId={currentAutomationId}
              automations={automations}
              anchorRef={nameAnchorRef}
              onSelect={async (id) => {
                setSwitcherOpen(false);
                if (isDirty) { setSaving(true); try { await onSave(); setDirty(false); } finally { setSaving(false); } }
                onSwitchAutomation?.(id);
              }}
            />
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

        {/* Diagnose — runs the automation-trace endpoint and shows the
            punch list in a popup. Lets the merchant see WHY their
            automation isn't firing without digging through Vercel logs. */}
        <button
          onClick={async () => {
            if (!currentAutomationId) {
              setToolbarToast('Salve a automação primeiro');
              setTimeout(() => setToolbarToast(null), 3000);
              return;
            }
            setToolbarToast('Diagnosticando…');
            try {
              const res = await fetch(`/api/diagnostics/automation-trace?automationId=${currentAutomationId}`);
              const j = await res.json();
              if (!res.ok || j.error) {
                setToolbarToast(`Erro: ${j.error || 'falhou'}`);
                setTimeout(() => setToolbarToast(null), 5000);
                return;
              }
              // Open in a modal-like alert with full content (alert is
              // ugly but avoids needing a new modal component for
              // something this rare). The verdict carries the actionable
              // summary; the full report is logged for inspection.
              console.log('[automation-trace] Full report:', j);
              const lines = [
                `Automação: ${j.automation.name}`,
                `Status: ${j.automation.status}`,
                `Trigger type: ${j.automation.trigger_type}`,
                `Nodes: ${j.automation.total_nodes} (${j.automation.trigger_nodes} triggers, ${j.automation.action_nodes} ações)`,
                ``,
                `Resumo: ${j.summary.ok} ok, ${j.summary.warnings} avisos, ${j.summary.missing} faltando, ${j.summary.failed} falhas`,
                ``,
                ...j.checks.map((c: any) => {
                  const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : c.status === 'missing' ? '❓' : '❌';
                  return `${icon} [${c.stage}] ${c.message}`;
                }),
                ``,
                `Veredicto:\n${j.verdict}`,
              ];
              alert(lines.join('\n'));
              setToolbarToast(null);
            } catch (e: any) {
              setToolbarToast(`Erro: ${e?.message || 'falhou'}`);
              setTimeout(() => setToolbarToast(null), 5000);
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'hover:bg-zinc-800 text-zinc-200 hover:text-white',
            'transition-colors text-[13px] font-medium'
          )}
          title="Diagnosticar — ver onde a automação está parando"
        >
          <AlertTriangle className="w-4 h-4" strokeWidth={2} />
          <span className="hidden lg:inline">Diagnosticar</span>
        </button>

        {/* Force resume — manually run the check-delayed-runs cron so
            stuck waiting runs (whose waiting_until has already passed)
            unblock immediately. Useful when the Vercel cron is delayed
            or the merchant doesn't want to wait. */}
        <button
          onClick={async () => {
            setToolbarToast('Retomando runs em waiting…');
            try {
              const res = await fetch('/api/cron/check-delayed-runs', {
                method: 'POST',
                headers: { 'X-Internal-Request': 'true' },
              });
              const j = await res.json();
              if (!res.ok) {
                setToolbarToast(`Erro: ${j.error || 'falhou'}`);
                setTimeout(() => setToolbarToast(null), 5000);
                return;
              }
              const checked = j.checked ?? 0;
              const enqueued = j.enqueued ?? 0;
              const cancelled = j.cancelled ?? 0;
              setToolbarToast(
                checked === 0
                  ? 'Nenhum run em waiting com tempo já vencido'
                  : `${enqueued} retomados, ${cancelled} cancelados (de ${checked})`
              );
              setTimeout(() => setToolbarToast(null), 5000);
            } catch (e: any) {
              setToolbarToast(`Erro: ${e?.message || 'falhou'}`);
              setTimeout(() => setToolbarToast(null), 5000);
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'hover:bg-zinc-800 text-zinc-200 hover:text-white',
            'transition-colors text-[13px] font-medium'
          )}
          title="Forçar retomada dos runs em waiting cujo tempo já venceu"
        >
          <FastForward className="w-4 h-4" strokeWidth={2} />
          <span className="hidden lg:inline">Retomar</span>
        </button>

        {/* Limpar runs travados — cancela todos os runs desta automação
            que estão em waiting/pending/running. Útil quando o canvas
            mudou e os runs antigos referenciam node ids que não existem
            mais no flow atual. */}
        <button
          onClick={async () => {
            if (!currentAutomationId) {
              setToolbarToast('Salve a automação primeiro');
              setTimeout(() => setToolbarToast(null), 3000);
              return;
            }
            if (!confirm('Cancelar todos os runs em waiting/pending/running desta automação? Use para limpar histórico antes de retestar.')) {
              return;
            }
            setToolbarToast('Cancelando runs ativos…');
            try {
              const res = await fetch('/api/automations/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel_active', automationId: currentAutomationId }),
              });
              const j = await res.json();
              if (!res.ok) {
                setToolbarToast(`Erro: ${j.error || 'falhou'}`);
                setTimeout(() => setToolbarToast(null), 5000);
                return;
              }
              setToolbarToast(`${j.cancelled} run(s) cancelados`);
              setTimeout(() => setToolbarToast(null), 4000);
            } catch (e: any) {
              setToolbarToast(`Erro: ${e?.message || 'falhou'}`);
              setTimeout(() => setToolbarToast(null), 5000);
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
            'hover:bg-zinc-800 text-zinc-200 hover:text-white',
            'transition-colors text-[13px] font-medium'
          )}
          title="Cancelar todos os runs ativos desta automação"
        >
          <Trash2 className="w-4 h-4" strokeWidth={2} />
          <span className="hidden lg:inline">Limpar</span>
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

        {/* Fechar */}
        <button
          onClick={onBack}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md ml-1',
            'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700',
            'text-white text-[13px] font-medium',
            'transition-colors'
          )}
          title="Fechar editor"
        >
          Fechar
        </button>
      </div>
    </div>
    </>
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
