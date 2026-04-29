'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutomationListItem {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'draft';
}

interface AutomationSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentId: string;
  automations: AutomationListItem[];
  onSelect: (id: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function AutomationSwitcher({ open, onClose, currentId, automations, onSelect, anchorRef }: AutomationSwitcherProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const current = automations.find(a => a.id === currentId);
      const others = automations.filter(a => a.id !== currentId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return current ? [current, ...others] : others;
    }
    return automations
      .filter(a => a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [automations, query, currentId]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className={cn(
        'absolute top-full left-0 mt-2 z-[10000]',
        'w-[380px] max-w-[calc(100vw-32px)] max-h-[480px]',
        'bg-white rounded-lg shadow-xl border border-zinc-200',
        'flex flex-col overflow-hidden'
      )}
      role="dialog"
      aria-label="Trocar de automação"
    >
      <div className="p-2 border-b border-zinc-100 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" strokeWidth={2} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar automações"
            className={cn(
              'w-full pl-8 pr-2.5 py-2 rounded-md',
              'bg-zinc-50 border border-zinc-200',
              'text-[13px] text-zinc-900 placeholder:text-zinc-400',
              'focus:outline-none focus:bg-white focus:border-zinc-300'
            )}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-zinc-400">
            Nenhuma automação encontrada
          </div>
        ) : (
          filtered.map(a => {
            const isCurrent = a.id === currentId;
            return (
              <button
                key={a.id}
                onClick={() => { if (!isCurrent) onSelect(a.id); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  isCurrent ? 'bg-orange-50' : 'hover:bg-zinc-50'
                )}
              >
                <Zap className={cn('w-3.5 h-3.5 flex-shrink-0', isCurrent ? 'text-orange-500' : 'text-zinc-400')} strokeWidth={2} />
                <span className={cn(
                  'flex-1 text-[13px] truncate',
                  isCurrent ? 'text-orange-700 font-medium' : 'text-zinc-700'
                )}>
                  {a.name}
                </span>
                <StatusDot status={a.status} />
                {isCurrent && <Check className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' ? 'bg-emerald-500' : status === 'paused' ? 'bg-amber-500' : 'bg-zinc-300';
  const label = status === 'active' ? 'Ativo' : status === 'paused' ? 'Pausado' : 'Rascunho';
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} title={label} />;
}
