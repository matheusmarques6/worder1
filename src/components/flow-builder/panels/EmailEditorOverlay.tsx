'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { WorderEmailEditorHandle } from '@/components/email-builder/WorderEmailEditor';
import type { EmailSiblingItem } from '@/components/email-builder/modals/EmailSwitcher';

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false });
// Loaded lazily — only the templates whose editor_type='text' pull this
// chunk, so existing flows feel no bundle weight from the new editor.
const TextEmailEditor = dynamic(() => import('@/components/email-text-builder/TextEmailEditor'), { ssr: false });

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

  // Text-based save: persist subject/preview into top-level columns and
  // mark editor_type explicitly so a later GET round-trips the same flavor.
  const handleSaveText = async (design: any, html: string) => {
    try {
      const url = storeId
        ? `/api/email/templates/${templateId}?storeId=${storeId}`
        : `/api/email/templates/${templateId}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design,
          design_json: design,
          html,
          subject: design.subject,
          preview_text: design.previewText,
          editor_type: 'text',
          store_id: storeId,
        }),
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

  // Dispatch by editor_type so the same overlay path serves both the
  // drag-and-drop builder and the new founder-style text editor. Default
  // keeps the legacy editor for any row created before this column existed.
  if (template.editor_type === 'text') {
    return (
      <div className="fixed inset-0 z-[9999] bg-white">
        <TextEmailEditor
          key={templateId}
          templateName={template.name || 'Template'}
          templateId={templateId}
          design={template.design_json || template.design}
          storeId={storeId}
          organizationId={organizationId}
          onSave={handleSaveText}
          onRename={handleRename}
          onBack={handleClose}
          flowName={flowName}
        />
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
