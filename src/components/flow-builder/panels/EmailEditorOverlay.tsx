'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { WorderEmailEditorHandle } from '@/components/email-builder/WorderEmailEditor';
import type { EmailSiblingItem } from '@/components/email-builder/modals/EmailSwitcher';

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false });

export { type EmailSiblingItem as EmailSibling };

interface EmailEditorOverlayProps {
  templateId: string;
  triggerType?: string;
  organizationId?: string;
  storeId?: string;
  onClose: () => void;
  flowName?: string;
  emailSiblings?: EmailSiblingItem[];
  onNavigate?: (templateId: string) => void;
}

export function EmailEditorOverlay({
  templateId,
  triggerType,
  organizationId,
  storeId,
  onClose,
  flowName,
  emailSiblings,
  onNavigate,
}: EmailEditorOverlayProps) {
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const editorRef = useRef<WorderEmailEditorHandle>(null);

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
      // Include storeId so the API auto-attaches orphan templates to current store
      const url = storeId
        ? `/api/email/templates/${templateId}?storeId=${storeId}`
        : `/api/email/templates/${templateId}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, design_json: design, html, store_id: storeId }),
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  };

  const handleClose = useCallback(async () => {
    try { await editorRef.current?.save(); } catch {}
    onClose();
  }, [onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-base font-medium text-gray-500 mb-3">{error || 'Template não encontrado'}</p>
          <button onClick={onClose} className="text-sm text-zinc-700 hover:text-zinc-900 font-medium">
            Voltar ao flow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-white">
      <WorderEditor
        ref={editorRef}
        key={templateId}
        templateName={template.name || 'Template'}
        design={template.design_json || template.design}
        onSave={handleSave}
        onRename={handleRename}
        onBack={handleClose}
        flowContext={triggerType && organizationId ? {
          templateId,
          triggerType,
          organizationId,
        } : undefined}
        flowName={flowName}
        emailSiblings={emailSiblings}
        currentTemplateId={templateId}
        onNavigateEmail={onNavigate}
      />
    </div>
  );
}

export default EmailEditorOverlay;
