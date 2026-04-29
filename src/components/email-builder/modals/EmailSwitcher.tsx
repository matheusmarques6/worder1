'use client';

import { useEffect, useRef } from 'react';
import { Mail, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmailSiblingItem {
  templateId: string;
  nodeName: string;
  nodeId: string;
}

interface EmailSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentTemplateId: string;
  flowName: string;
  siblings: EmailSiblingItem[];
  onSelect: (templateId: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function EmailSwitcher({ open, onClose, currentTemplateId, flowName, siblings, onSelect, anchorRef }: EmailSwitcherProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

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

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className={cn(
        'absolute top-full left-0 mt-2 z-[10000]',
        'w-[360px] max-w-[calc(100vw-32px)] max-h-[420px]',
        'bg-white rounded-lg shadow-xl border border-zinc-200',
        'flex flex-col overflow-hidden'
      )}
      role="dialog"
      aria-label="Trocar de email"
    >
      <div className="px-3 py-2 border-b border-zinc-100 flex-shrink-0">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Fluxo</div>
        <div className="text-[12px] text-zinc-700 font-medium truncate">{flowName}</div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {siblings.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-zinc-400">
            Nenhum outro email neste fluxo
          </div>
        ) : (
          siblings.map((s, idx) => {
            const isCurrent = s.templateId === currentTemplateId;
            return (
              <button
                key={s.templateId}
                onClick={() => { if (!isCurrent) onSelect(s.templateId); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  isCurrent ? 'bg-orange-50' : 'hover:bg-zinc-50'
                )}
              >
                <div className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 text-[10px] font-semibold',
                  isCurrent ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-500'
                )}>
                  {idx + 1}
                </div>
                <Mail className={cn('w-3.5 h-3.5 flex-shrink-0', isCurrent ? 'text-orange-500' : 'text-zinc-400')} strokeWidth={2} />
                <span className={cn(
                  'flex-1 text-[13px] truncate',
                  isCurrent ? 'text-orange-700 font-medium' : 'text-zinc-700'
                )}>
                  {s.nodeName || `Email ${idx + 1}`}
                </span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
