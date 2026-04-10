'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const WorderEditor = dynamic(() => import('@/components/email-builder/WorderEmailEditor'), { ssr: false });

interface EmailEditorOverlayProps {
  templateId: string;
  onClose: () => void;
}

/**
 * Opens the email editor FULLSCREEN inside the flow builder.
 * When user clicks Exit/Back, returns to the flow at the same node.
 */
export function EmailEditorOverlay({ templateId, onClose }: EmailEditorOverlayProps) {
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTemplate = useCallback(async () => {
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
    <div className="fixed inset-0 z-[9999] bg-white">
      <WorderEditor
        templateName={template.name || 'Template'}
        design={template.design_json || template.design}
        onSave={handleSave}
        onBack={onClose}
      />
    </div>
  );
}

export default EmailEditorOverlay;
