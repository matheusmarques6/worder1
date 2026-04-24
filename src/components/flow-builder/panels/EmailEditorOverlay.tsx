'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false });

export interface EmailSibling {
  templateId: string;
  nodeName: string;
  nodeId: string;
}

interface EmailEditorOverlayProps {
  templateId: string;
  triggerType?: string;
  organizationId?: string;
  onClose: () => void;
  siblings?: EmailSibling[];
  onNavigate?: (templateId: string) => void;
}

/**
 * Opens the email editor FULLSCREEN inside the flow builder.
 * When user clicks Exit/Back, returns to the flow at the same node.
 * Passes flowContext so Preview uses real event data.
 *
 * When `siblings` is provided with more than one entry, a navigation
 * toolbar is rendered so the user can switch between email nodes
 * without leaving the editor overlay.
 */
export function EmailEditorOverlay({
  templateId,
  triggerType,
  organizationId,
  onClose,
  siblings,
  onNavigate,
}: EmailEditorOverlayProps) {
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const showNav = siblings && siblings.length > 1;
  const currentIdx = siblings?.findIndex(s => s.templateId === templateId) ?? -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < (siblings?.length ?? 0) - 1;

  const goTo = useCallback(
    (newTemplateId: string) => {
      // TODO: save current template before navigating. The WorderEmailEditor
      // does not expose an imperative save handle, so we cannot trigger a save
      // from outside. The user's unsaved edits in the current template may be
      // lost when navigating away.
      onNavigate?.(newTemplateId);
    },
    [onNavigate],
  );

  const goPrev = useCallback(() => {
    if (hasPrev && siblings) {
      goTo(siblings[currentIdx - 1].templateId);
    }
  }, [hasPrev, siblings, currentIdx, goTo]);

  const goNext = useCallback(() => {
    if (hasNext && siblings) {
      goTo(siblings[currentIdx + 1].templateId);
    }
  }, [hasNext, siblings, currentIdx, goTo]);

  // Keyboard shortcuts: Alt+ArrowLeft / Alt+ArrowRight
  useEffect(() => {
    if (!showNav) return;
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showNav, goPrev, goNext]);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    setError('');
    setTemplate(null);
    try {
      const res = await fetch(`/api/email/templates/${templateId}`);
      if (!res.ok) throw new Error('Template não encontrado');
      const data = await res.json();
      setTemplate(data.template || data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar template');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  const handleRename = async (name: string) => {
    try {
      await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setTemplate((prev: any) => prev ? { ...prev, name } : prev);
    } catch {}
  };

  const handleSave = async (design: Record<string, any>, html: string) => {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, design_json: design, html }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert('Erro ao salvar: ' + (err.error || 'Tente novamente'));
        return false;
      }
      return true;
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
      return false;
    }
  };

  // -- Navigation toolbar --------------------------------------------------
  const navToolbar = showNav ? (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
      <button
        onClick={onClose}
        className="text-sm text-gray-600 hover:text-gray-900 font-medium"
      >
        Voltar ao flow
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={goPrev}
          disabled={!hasPrev}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          title="Email anterior (Alt + Left)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <select
          value={templateId}
          onChange={(e) => goTo(e.target.value)}
          className="text-sm border border-gray-200 rounded px-2 py-1"
        >
          {siblings!.map((s, i) => (
            <option key={s.templateId} value={s.templateId}>
              Email {i + 1}/{siblings!.length}: {s.nodeName}
            </option>
          ))}
        </select>

        <button
          onClick={goNext}
          disabled={!hasNext}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
          title="Proximo email (Alt + Right)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer to keep the select centered */}
      <div className="w-[100px]" />
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-3">{error || 'Template não encontrado'}</p>
          <button onClick={onClose} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Voltar ao flow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      {navToolbar}
      <div className="flex-1 min-h-0">
        <WorderEditor
          key={templateId}
          templateName={template.name || 'Template'}
          design={template.design_json || template.design}
          onSave={handleSave}
          onRename={handleRename}
          onBack={onClose}
          flowContext={triggerType && organizationId ? {
            templateId,
            triggerType,
            organizationId,
          } : undefined}
        />
      </div>
    </div>
  );
}

export default EmailEditorOverlay;
