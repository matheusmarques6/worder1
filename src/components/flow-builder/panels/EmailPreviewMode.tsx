'use client';

import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Monitor, Smartphone, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreviewData {
  html: string;
  subject: string;
  contact: Record<string, any>;
  event: { id: string; type: string; properties: Record<string, any>; occurred_at: string } | null;
  eventProperties: Record<string, any>;
  contactProperties: Record<string, any>;
}

interface EmailPreviewModeProps {
  templateId: string;
  triggerType: string;
  organizationId: string;
  onClose: () => void;
}

export function EmailPreviewMode({ templateId, triggerType, organizationId, onClose }: EmailPreviewModeProps) {
  const [contacts, setContacts] = useState<Array<{ id: string; email: string; first_name: string; last_name: string }>>([]);
  const [selectedContactIdx, setSelectedContactIdx] = useState(0);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showAllProps, setShowAllProps] = useState(true);

  // Fetch contacts list
  useEffect(() => {
    fetch(`/api/contacts?limit=10&organizationId=${organizationId}`)
      .then(r => r.json())
      .then(data => {
        const list = data.contacts || data || [];
        setContacts(list);
        if (list.length > 0) loadPreview(list[0].id);
      })
      .catch(() => setLoading(false));
  }, [organizationId]);

  const loadPreview = async (contactId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, contactId, triggerType, organizationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch {}
    setLoading(false);
  };

  const handlePrev = () => {
    const newIdx = Math.max(0, selectedContactIdx - 1);
    setSelectedContactIdx(newIdx);
    if (contacts[newIdx]) loadPreview(contacts[newIdx].id);
  };

  const handleNext = () => {
    const newIdx = Math.min(contacts.length - 1, selectedContactIdx + 1);
    setSelectedContactIdx(newIdx);
    if (contacts[newIdx]) loadPreview(contacts[newIdx].id);
  };

  const renderValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Preview mode</h1>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Done
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop/Mobile toggle */}
          <div className="flex justify-center py-4 border-b border-gray-100">
            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('desktop')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'desktop' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Monitor className="w-4 h-4" /> Desktop
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'mobile' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Smartphone className="w-4 h-4" /> Mobile
              </button>
            </div>
          </div>

          {/* Email preview */}
          <div className="flex-1 overflow-auto bg-gray-50 p-6 flex justify-center">
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : previewData?.html ? (
              <div className={cn(
                'bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-200',
                viewMode === 'mobile' ? 'w-[375px]' : 'w-full max-w-[700px]'
              )}>
                {viewMode === 'mobile' && (
                  <div className="bg-gray-800 rounded-t-[20px] px-6 pt-3 pb-2 flex items-center justify-between">
                    <div className="w-16 h-1.5 bg-gray-600 rounded-full" />
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-600 rounded-full" />
                      <div className="w-2 h-2 bg-gray-600 rounded-full" />
                    </div>
                  </div>
                )}
                <iframe
                  srcDoc={previewData.html}
                  className={cn(
                    'w-full border-0',
                    viewMode === 'mobile' ? 'h-[600px]' : 'h-[700px]'
                  )}
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            ) : (
              <div className="text-center text-gray-400 mt-20">
                <p>Nenhum preview disponivel</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Event & Profile properties panel */}
        <div className="w-[380px] border-l border-gray-200 flex flex-col overflow-hidden bg-white shrink-0">
          {/* Contact selector */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">Select a recent event for the preview</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span>{selectedContactIdx + 1} of {contacts.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handlePrev} disabled={selectedContactIdx === 0}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex-1">
                <p className="text-xs text-gray-400">Previewing as</p>
                {previewData?.contact ? (
                  <div className="mt-1 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{previewData.contact.email}</p>
                        <p className="text-xs text-gray-500">{previewData.event?.type || triggerType}</p>
                        {previewData.event?.occurred_at && (
                          <p className="text-xs text-gray-400">{new Date(previewData.event.occurred_at).toLocaleString('pt-BR')}</p>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Nenhum contato selecionado</p>
                )}
              </div>

              <button onClick={handleNext} disabled={selectedContactIdx >= contacts.length - 1}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Properties */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Toggle */}
            <button
              onClick={() => setShowAllProps(!showAllProps)}
              className="flex items-center gap-1 text-sm font-medium text-gray-900 mb-4"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', !showAllProps && '-rotate-90')} />
              All properties
            </button>

            {showAllProps && previewData && (
              <div className="space-y-6">
                {/* Event properties */}
                {previewData.eventProperties && Object.keys(previewData.eventProperties).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Event properties</h4>
                    <div className="space-y-2">
                      {Object.entries(previewData.eventProperties).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-3">
                          <span className="text-xs font-medium text-gray-700 min-w-[100px] shrink-0 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                            {key}:
                          </span>
                          <span className="text-xs text-gray-600 break-all">
                            {typeof value === 'object' ? (
                              <details className="cursor-pointer">
                                <summary className="text-blue-600">{Array.isArray(value) ? `Array(${value.length})` : 'Object'}</summary>
                                <pre className="mt-1 text-[10px] bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>
                              </details>
                            ) : renderValue(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Profile properties */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Profile properties</h4>
                  <div className="space-y-2">
                    {previewData.contact && Object.entries(previewData.contact).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-3">
                        <span className="text-xs font-medium text-gray-700 min-w-[100px] shrink-0">
                          {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                        </span>
                        <span className="text-xs text-gray-600 break-all">{renderValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailPreviewMode;
