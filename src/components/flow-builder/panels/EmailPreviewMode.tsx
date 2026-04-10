'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Monitor, Smartphone, ExternalLink, ChevronDown, Send, Mail, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailPreviewModeProps {
  templateId: string;
  triggerType: string;
  organizationId: string;
  onClose: () => void;
}

interface EventItem {
  id: string;
  contact_id: string;
  event_type: string;
  properties: Record<string, any>;
  occurred_at: string;
}

export function EmailPreviewMode({ templateId, triggerType, organizationId, onClose }: EmailPreviewModeProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'send_test'>('preview');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [html, setHtml] = useState<string>('');
  const [contact, setContact] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEventProps, setShowEventProps] = useState(true);
  const [showProfileProps, setShowProfileProps] = useState(true);
  // Send test
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<'success' | 'error' | null>(null);

  // 1. Load events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, triggerType, organizationId, action: 'list_events' }),
      });
      const data = await res.json();
      const eventList: EventItem[] = data.events || [];
      setEvents(eventList);
      if (eventList.length > 0) {
        await renderPreview(eventList[0].contact_id);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [templateId, triggerType, organizationId]);

  // 2. Render preview for a specific contact
  const renderPreview = async (contactId: string) => {
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, contactId, triggerType, organizationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setHtml(data.html || '');
        setContact(data.contact || null);
      }
    } catch {}
  };

  const selectEvent = async (idx: number) => {
    setSelectedIdx(idx);
    const ev = events[idx];
    if (ev?.contact_id) {
      setLoading(true);
      await renderPreview(ev.contact_id);
      setLoading(false);
    }
  };

  const currentEvent = events[selectedIdx];
  const eventProps = currentEvent?.properties || {};

  // Send test email
  const handleSendTest = async () => {
    if (!testEmail) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          contactId: currentEvent?.contact_id,
          triggerType,
          organizationId,
          action: 'send_test',
          testEmail,
        }),
      });
      setSendResult(res.ok ? 'success' : 'error');
    } catch {
      setSendResult('error');
    }
    setSending(false);
  };

  // Render nested object tree
  const renderTree = (obj: Record<string, any>, depth = 0): React.ReactNode => {
    return Object.entries(obj).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (
          <div key={key} className={cn(depth > 0 && 'ml-3')}>
            <details open={depth < 1}>
              <summary className="text-xs font-mono cursor-pointer text-blue-600 hover:text-blue-800 py-0.5">{key}:</summary>
              <div className="ml-2 pl-3 border-l border-gray-200">{renderTree(value, depth + 1)}</div>
            </details>
          </div>
        );
      }
      if (Array.isArray(value)) {
        return (
          <div key={key} className={cn(depth > 0 && 'ml-3')}>
            <details>
              <summary className="text-xs font-mono cursor-pointer text-blue-600 hover:text-blue-800 py-0.5">
                {key}: <span className="text-gray-400">Array({value.length})</span>
              </summary>
              <div className="ml-2 pl-3 border-l border-gray-200">
                {value.map((item, i) => (
                  <div key={i}>
                    {typeof item === 'object' ? (
                      <details><summary className="text-xs font-mono cursor-pointer text-blue-600 py-0.5">{i}:</summary>
                        <div className="ml-2 pl-3 border-l border-gray-200">{renderTree(item, depth + 2)}</div>
                      </details>
                    ) : <div className="flex gap-2 py-0.5"><span className="text-xs font-mono text-gray-500">{i}:</span><span className="text-xs text-gray-700">{String(value)}</span></div>}
                  </div>
                ))}
              </div>
            </details>
          </div>
        );
      }
      return (
        <div key={key} className={cn('flex gap-2 py-0.5', depth > 0 && 'ml-3')}>
          <span className="text-xs font-mono font-bold text-gray-700 shrink-0">{key}:</span>
          <span className="text-xs text-gray-600 break-all">{value === null || value === undefined ? '-' : String(value)}</span>
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-semibold text-gray-900">Preview mode</h1>
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'preview' ? 'text-gray-900 bg-gray-100' : 'text-gray-500 hover:text-gray-700')}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab('send_test')}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'send_test' ? 'text-gray-900 bg-gray-100' : 'text-gray-500 hover:text-gray-700')}
            >
              Enviar teste
            </button>
          </div>
        </div>
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Pronto
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: email preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'preview' && (
            <>
              {/* Desktop/Mobile */}
              <div className="flex justify-center py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
                  <button onClick={() => setViewMode('desktop')}
                    className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors',
                      viewMode === 'desktop' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500')}>
                    <Monitor className="w-4 h-4" /> Desktop
                  </button>
                  <button onClick={() => setViewMode('mobile')}
                    className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors',
                      viewMode === 'mobile' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500')}>
                    <Smartphone className="w-4 h-4" /> Mobile
                  </button>
                </div>
              </div>

              {/* Preview iframe */}
              <div className="flex-1 overflow-auto bg-gray-100 p-6 flex justify-center">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : html ? (
                  <div className={cn('bg-white shadow-lg overflow-hidden transition-all duration-200',
                    viewMode === 'mobile' ? 'w-[375px] rounded-[2rem]' : 'w-full max-w-[680px] rounded-lg')}>
                    {viewMode === 'mobile' && (
                      <div className="bg-black pt-3 pb-1 flex justify-center">
                        <div className="w-20 h-1 bg-gray-700 rounded-full" />
                      </div>
                    )}
                    <iframe srcDoc={html} className={cn('w-full border-0', viewMode === 'mobile' ? 'h-[640px]' : 'h-[720px]')}
                      sandbox="allow-same-origin" title="Email preview" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Mail className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm">Selecione um evento para visualizar o email</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'send_test' && (
            <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
              <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Send className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Enviar email de teste</h3>
                    <p className="text-xs text-gray-500">Envia com dados do evento selecionado</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    type="email" value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="Digite o email de teste"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleSendTest}
                    disabled={!testEmail || sending}
                    className={cn('w-full py-3 rounded-lg text-sm font-medium transition-colors',
                      'bg-gray-900 text-white hover:bg-gray-800',
                      'disabled:opacity-50 disabled:cursor-not-allowed')}
                  >
                    {sending ? 'Enviando...' : 'Enviar teste'}
                  </button>
                  {sendResult === 'success' && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-green-600" />
                      <p className="text-xs text-green-700">Email de teste enviado com sucesso!</p>
                    </div>
                  )}
                  {sendResult === 'error' && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <p className="text-xs text-red-700">Erro ao enviar. Verifique as configurações.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="w-[360px] border-l border-gray-200 flex flex-col bg-white shrink-0">
          {/* Event selector header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Evento selecionado</p>
              <span className="text-xs text-gray-400">
                {events.length > 0 ? `${selectedIdx + 1} de ${events.length}` : '—'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={() => selectEvent(Math.max(0, selectedIdx - 1))} disabled={selectedIdx === 0}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 disabled:opacity-20">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1">
                {currentEvent ? (
                  <div className="p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{contact?.email || '...'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{currentEvent.event_type}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(currentEvent.occurred_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-gray-200 text-center">
                    <p className="text-xs text-gray-400">Nenhum evento</p>
                  </div>
                )}
              </div>
              <button onClick={() => selectEvent(Math.min(events.length - 1, selectedIdx + 1))}
                disabled={selectedIdx >= events.length - 1}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 disabled:opacity-20">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Properties scroll area */}
          <div className="flex-1 overflow-y-auto">
            {/* Event properties */}
            <div className="border-b border-gray-100">
              <button onClick={() => setShowEventProps(!showEventProps)}
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50">
                <span className="text-sm font-semibold text-gray-900">Propriedades do evento</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', !showEventProps && '-rotate-90')} />
              </button>
              {showEventProps && (
                <div className="px-5 pb-4">
                  {Object.keys(eventProps).length > 0 ? renderTree(eventProps) : (
                    <p className="text-xs text-gray-400">Sem dados do evento</p>
                  )}
                </div>
              )}
            </div>

            {/* Profile properties */}
            <div className="border-b border-gray-100">
              <button onClick={() => setShowProfileProps(!showProfileProps)}
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50">
                <span className="text-sm font-semibold text-gray-900">Propriedades do perfil</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', !showProfileProps && '-rotate-90')} />
              </button>
              {showProfileProps && contact && (
                <div className="px-5 pb-4 space-y-1.5">
                  {Object.entries(contact).map(([key, value]) => (
                    <div key={key} className="flex gap-3">
                      <span className="text-xs font-semibold text-gray-600 min-w-[90px] shrink-0">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                      </span>
                      <span className="text-xs text-gray-700 break-all">
                        {value === null || value === undefined ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
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
