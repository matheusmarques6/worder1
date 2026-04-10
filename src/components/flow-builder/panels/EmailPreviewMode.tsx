'use client';

import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Monitor, Smartphone, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EventRecord {
  id: string;
  contact_id: string;
  event_type: string;
  properties: Record<string, any>;
  occurred_at: string;
  contact?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    city: string;
    state: string;
    country: string;
    company: string;
    tags: string[];
    total_orders: number;
    total_spent: number;
    created_at: string;
  };
}

interface PreviewData {
  html: string;
  event: EventRecord | null;
}

interface EmailPreviewModeProps {
  templateId: string;
  triggerType: string;
  organizationId: string;
  onClose: () => void;
}

export function EmailPreviewMode({ templateId, triggerType, organizationId, onClose }: EmailPreviewModeProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showEventProps, setShowEventProps] = useState(true);
  const [showProfileProps, setShowProfileProps] = useState(true);

  // Fetch recent events matching the trigger type
  useEffect(() => {
    setLoading(true);
    fetch('/api/automations/email-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        triggerType,
        organizationId,
        action: 'list_events',
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.events?.length > 0) {
          setEvents(data.events);
          loadPreviewForEvent(data.events[0]);
        } else if (data.html) {
          // Fallback: API returned single preview
          setPreviewData({ html: data.html, event: data.event });
          if (data.event) setEvents([data.event]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templateId, triggerType, organizationId]);

  const loadPreviewForEvent = async (event: EventRecord) => {
    setLoading(true);
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          contactId: event.contact_id,
          triggerType,
          organizationId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData({
          html: data.html,
          event: {
            ...event,
            contact: data.contact,
          },
        });
      }
    } catch {}
    setLoading(false);
  };

  const handlePrev = () => {
    const newIdx = Math.max(0, selectedIdx - 1);
    setSelectedIdx(newIdx);
    if (events[newIdx]) loadPreviewForEvent(events[newIdx]);
  };

  const handleNext = () => {
    const newIdx = Math.min(events.length - 1, selectedIdx + 1);
    setSelectedIdx(newIdx);
    if (events[newIdx]) loadPreviewForEvent(events[newIdx]);
  };

  const currentEvent = events[selectedIdx];
  const contact = previewData?.event?.contact;
  const eventProps = currentEvent?.properties || previewData?.event?.properties || {};

  const renderValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Render nested object as tree (Klaviyo style)
  const renderObjectTree = (obj: Record<string, any>, depth: number = 0): React.ReactNode => {
    return Object.entries(obj).map(([key, value]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return (
          <div key={key} className={cn('mt-1', depth > 0 && 'ml-4')}>
            <details open={depth < 2}>
              <summary className="text-xs font-mono text-blue-600 cursor-pointer hover:text-blue-800">
                {key}:
              </summary>
              <div className="ml-2 border-l border-gray-200 pl-3 mt-1">
                {renderObjectTree(value, depth + 1)}
              </div>
            </details>
          </div>
        );
      }
      if (Array.isArray(value)) {
        return (
          <div key={key} className={cn('mt-1', depth > 0 && 'ml-4')}>
            <details open={depth < 1}>
              <summary className="text-xs font-mono text-blue-600 cursor-pointer hover:text-blue-800">
                {key}: <span className="text-gray-400">Array({value.length})</span>
              </summary>
              <div className="ml-2 border-l border-gray-200 pl-3 mt-1">
                {value.map((item, i) => (
                  <div key={i} className="mt-1">
                    {typeof item === 'object' ? (
                      <details>
                        <summary className="text-xs font-mono text-blue-600 cursor-pointer">{i}:</summary>
                        <div className="ml-2 border-l border-gray-200 pl-3 mt-1">
                          {renderObjectTree(item, depth + 2)}
                        </div>
                      </details>
                    ) : (
                      <div className="flex gap-2">
                        <span className="text-xs font-mono text-gray-500">{i}:</span>
                        <span className="text-xs text-gray-700">{renderValue(item)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
        );
      }
      return (
        <div key={key} className={cn('flex gap-3 mt-1', depth > 0 && 'ml-4')}>
          <span className="text-xs font-mono font-semibold text-gray-700 shrink-0">{key}:</span>
          <span className="text-xs text-gray-600 break-all">{renderValue(value)}</span>
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Modo de visualização</h1>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Pronto
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
                  className={cn('w-full border-0', viewMode === 'mobile' ? 'h-[600px]' : 'h-[700px]')}
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            ) : (
              <div className="text-center text-gray-400 mt-20">
                <p>Nenhum preview disponível. Selecione um evento.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Event selector + properties */}
        <div className="w-[380px] border-l border-gray-200 flex flex-col overflow-hidden bg-white shrink-0">
          {/* Event selector */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">Selecione um evento recente</p>
              <span className="text-xs text-gray-400">
                {events.length > 0 ? `${selectedIdx + 1} de ${events.length}` : '0'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handlePrev} disabled={selectedIdx === 0}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex-1">
                {currentEvent ? (
                  <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="text-sm font-medium text-gray-900">
                      {contact?.email || currentEvent.contact_id}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {currentEvent.event_type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(currentEvent.occurred_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-gray-200 text-center">
                    <p className="text-xs text-gray-400">Nenhum evento encontrado</p>
                  </div>
                )}
              </div>

              <button onClick={handleNext} disabled={selectedIdx >= events.length - 1}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Properties panels */}
          <div className="flex-1 overflow-y-auto">
            {/* Event Properties */}
            <div className="border-b border-gray-100">
              <button
                onClick={() => setShowEventProps(!showEventProps)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
              >
                <span className="text-sm font-semibold text-gray-900">Propriedades do evento</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', !showEventProps && '-rotate-90')} />
              </button>
              {showEventProps && Object.keys(eventProps).length > 0 && (
                <div className="px-5 pb-4">
                  {renderObjectTree(eventProps)}
                </div>
              )}
              {showEventProps && Object.keys(eventProps).length === 0 && (
                <p className="px-5 pb-4 text-xs text-gray-400">Sem propriedades de evento</p>
              )}
            </div>

            {/* Profile Properties */}
            <div className="border-b border-gray-100">
              <button
                onClick={() => setShowProfileProps(!showProfileProps)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
              >
                <span className="text-sm font-semibold text-gray-900">Propriedades do perfil</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', !showProfileProps && '-rotate-90')} />
              </button>
              {showProfileProps && contact && (
                <div className="px-5 pb-4 space-y-2">
                  {Object.entries(contact).map(([key, value]) => (
                    <div key={key} className="flex gap-3">
                      <span className="text-xs font-semibold text-gray-700 min-w-[100px] shrink-0">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                      </span>
                      <span className="text-xs text-gray-600 break-all">{renderValue(value)}</span>
                    </div>
                  ))}
                </div>
              )}
              {showProfileProps && !contact && (
                <p className="px-5 pb-4 text-xs text-gray-400">Sem dados do perfil</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailPreviewMode;
