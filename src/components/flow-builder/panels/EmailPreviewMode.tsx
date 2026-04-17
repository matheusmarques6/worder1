'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Monitor, Smartphone, ChevronDown, Send, Mail, CheckCircle2, XCircle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Event-type labels (clean, muted style — no heavy coloring) ────────────
const EVENT_LABELS: Record<string, string> = {
  placed_order:        'Placed Order',
  order_paid:          'Order Paid',
  fulfilled_order:     'Fulfilled Order',
  cancelled_order:     'Cancelled Order',
  refunded_order:      'Refunded Order',
  checkout_started:    'Checkout Started',
  checkout_abandoned:  'Checkout Abandoned',
  checkout_completed:  'Checkout Completed',
  abandoned_cart:      'Abandoned Cart',
  added_to_cart:       'Added to Cart',
  viewed_product:      'Viewed Product',
  viewed_collection:   'Viewed Collection',
  profile_created:     'Profile Created',
  profile_updated:     'Profile Updated',
  subscribed_email:    'Subscribed',
  customer_created:    'Customer Created',
  form_submitted:      'Form Submitted',
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function initialsFrom(s: string | null | undefined): string {
  if (!s) return '?';
  const clean = s.trim();
  if (clean.includes('@')) return clean[0]!.toUpperCase();
  const parts = clean.split(/\s+/);
  return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase() || clean[0]!.toUpperCase();
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// Profile fields to display in a curated order, with PT-BR labels.
const PROFILE_FIELDS: [string, string][] = [
  ['email', 'Email'],
  ['first_name', 'First Name'],
  ['last_name', 'Last Name'],
  ['phone', 'Phone'],
  ['city', 'City'],
  ['state', 'State'],
  ['country', 'Country'],
  ['company', 'Company'],
  ['tags', 'Tags'],
  ['total_orders', 'Total Orders'],
  ['total_spent', 'Total Spent'],
  ['created_at', 'Created At'],
];

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
      // Always render preview — API handles missing contactId gracefully
      if (eventList.length > 0) {
        await renderPreview(eventList[0].contact_id || '');
      } else {
        // No events — still render template without merge tags
        await renderPreview('');
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [templateId, triggerType, organizationId]);

  // 2. Render preview for a specific contact
  const renderPreview = async (contactId?: string) => {
    try {
      const res = await fetch('/api/automations/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          ...(contactId ? { contactId } : {}),
          triggerType,
          organizationId,
        }),
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

  // Render nested object tree — Klaviyo-style: mono keys, indented values,
  // collapsible objects/arrays with accent lines.
  const renderTree = (obj: Record<string, any>, depth = 0): React.ReactNode => {
    return Object.entries(obj).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (
          <details key={key} open={depth < 1} className="group">
            <summary className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer text-zinc-900 hover:text-zinc-700 py-0.5 list-none">
              <ChevronDown className="w-3 h-3 text-zinc-400 transition-transform group-open:rotate-0 -rotate-90" />
              <span className="font-semibold">{key}</span>
              <span className="text-zinc-400 font-normal">{'{' + Object.keys(value).length + '}'}</span>
            </summary>
            <div className="ml-2 pl-3 border-l border-zinc-200">{renderTree(value, depth + 1)}</div>
          </details>
        );
      }
      if (Array.isArray(value)) {
        return (
          <details key={key} className="group">
            <summary className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer text-zinc-900 hover:text-zinc-700 py-0.5 list-none">
              <ChevronDown className="w-3 h-3 text-zinc-400 transition-transform group-open:rotate-0 -rotate-90" />
              <span className="font-semibold">{key}</span>
              <span className="text-zinc-400 font-normal">Array({value.length})</span>
            </summary>
            <div className="ml-2 pl-3 border-l border-zinc-200">
              {value.map((item, i) =>
                typeof item === 'object' && item !== null ? (
                  <details key={i} className="group">
                    <summary className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer text-zinc-600 hover:text-zinc-800 py-0.5 list-none">
                      <ChevronDown className="w-3 h-3 text-zinc-400 transition-transform group-open:rotate-0 -rotate-90" />
                      <span>[{i}]</span>
                    </summary>
                    <div className="ml-2 pl-3 border-l border-zinc-200">{renderTree(item, depth + 2)}</div>
                  </details>
                ) : (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className="text-[11px] font-mono text-zinc-400">[{i}]</span>
                    <span className="text-[11px] text-zinc-700 font-mono break-all">{formatValue(item)}</span>
                  </div>
                )
              )}
            </div>
          </details>
        );
      }
      return (
        <div key={key} className="flex gap-3 py-[3px] leading-tight">
          <span className="text-[11px] font-mono text-zinc-500 shrink-0 min-w-[110px]">{key}:</span>
          <span className="text-[11px] text-zinc-900 break-all font-medium">{formatValue(value)}</span>
        </div>
      );
    });
  };

  const displayName = (currentEvent as any)?.contact_email || contact?.email || 'Sem lead';

  return (
    <div className="fixed inset-0 z-[9999] bg-zinc-50 flex flex-col font-sans">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-7">
          <h1 className="text-[15px] font-semibold text-zinc-900 tracking-tight">Preview mode</h1>
          <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('preview')}
              className={cn('px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all',
                activeTab === 'preview' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab('send_test')}
              className={cn('px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all',
                activeTab === 'send_test' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
            >
              Enviar teste
            </button>
          </div>
        </div>
        <button onClick={onClose}
          className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white text-[13px] font-medium hover:bg-zinc-800 transition-colors">
          Pronto
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─ Left: email preview ─ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'preview' && (
            <>
              {/* Desktop/Mobile toolbar */}
              <div className="flex items-center justify-center h-12 border-b border-zinc-200 bg-white shrink-0">
                <div className="flex bg-zinc-100 rounded-lg p-0.5">
                  <button onClick={() => setViewMode('desktop')}
                    className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all',
                      viewMode === 'desktop' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}>
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                  <button onClick={() => setViewMode('mobile')}
                    className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all',
                      viewMode === 'mobile' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}>
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </button>
                </div>
              </div>

              {/* Preview frame */}
              <div className="flex-1 overflow-auto bg-white px-6 py-8 flex justify-center">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                  </div>
                ) : html ? (
                  <div className={cn(
                    'overflow-hidden transition-all duration-200 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] ring-1 ring-zinc-200/50',
                    viewMode === 'mobile' ? 'w-[375px] rounded-[2.25rem] bg-white' : 'w-[600px] max-w-[600px] rounded-lg',
                  )}>
                    {viewMode === 'mobile' && (
                      <div className="bg-zinc-900 h-6 flex justify-center items-center">
                        <div className="w-16 h-1 bg-zinc-700 rounded-full" />
                      </div>
                    )}
                    <iframe srcDoc={html}
                      className={cn('w-full border-0', viewMode === 'mobile' ? 'h-[640px] bg-white' : 'h-[720px]')}
                      sandbox="allow-same-origin" title="Email preview" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center mb-4">
                      <Mail className="w-6 h-6 text-zinc-300" />
                    </div>
                    <p className="text-[13px] text-zinc-500 font-medium">Nenhum preview disponível</p>
                    <p className="text-[12px] text-zinc-400 mt-1">Selecione um lead com evento à direita</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'send_test' && (
            <div className="flex-1 flex items-center justify-center bg-zinc-100 p-8">
              <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                    <Send className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-zinc-900">Enviar email de teste</h3>
                    <p className="text-[11px] text-zinc-500">Usa os dados do evento selecionado</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    type="email" value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="voce@exemplo.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 text-[13px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                  <button
                    onClick={handleSendTest}
                    disabled={!testEmail || sending}
                    className={cn('w-full py-2.5 rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-2',
                      'bg-zinc-900 text-white hover:bg-zinc-800',
                      'disabled:opacity-50 disabled:cursor-not-allowed')}
                  >
                    {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar teste'}
                  </button>
                  {sendResult === 'success' && (
                    <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-emerald-800">Email de teste enviado com sucesso</p>
                    </div>
                  )}
                  {sendResult === 'error' && (
                    <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-rose-800">Erro ao enviar. Verifique as configurações.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─ Right: lead selector + properties ─ */}
        <div className="w-[360px] border-l border-zinc-200/80 flex flex-col bg-zinc-50/50 shrink-0">
          {/* Lead selector */}
          <div className="px-5 pt-5 pb-4 bg-white border-b border-zinc-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.08em]">Lead selecionado</p>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {events.length > 0 ? `${selectedIdx + 1} de ${events.length}` : '—'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => selectEvent(Math.max(0, selectedIdx - 1))} disabled={selectedIdx <= 0}
                className="shrink-0 p-1 text-zinc-300 hover:text-zinc-600 disabled:opacity-0 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                {currentEvent ? (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-900 text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
                      {initialsFrom(contact?.first_name || displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-zinc-900 truncate">{displayName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-500">{eventLabel(currentEvent.event_type)}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">
                        {new Date(currentEvent.occurred_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                      <Inbox className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] text-zinc-500">Sem eventos</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Nenhum evento encontrado para esta automação</p>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => selectEvent(Math.min(events.length - 1, selectedIdx + 1))}
                disabled={selectedIdx >= events.length - 1}
                className="shrink-0 p-1 text-zinc-300 hover:text-zinc-600 disabled:opacity-0 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Properties */}
          <div className="flex-1 overflow-y-auto">
            {/* Event props */}
            <div className="border-b border-zinc-100">
              <button onClick={() => setShowEventProps(!showEventProps)}
                className="w-full flex items-center justify-between px-5 h-10 text-left hover:bg-white/80 transition-colors">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.04em]">Propriedades do evento</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-300 transition-transform', !showEventProps && '-rotate-90')} />
              </button>
              {showEventProps && (
                <div className="px-5 pb-4 bg-white mx-3 mb-3 rounded-lg border border-zinc-100">
                  <div className="pt-3">
                    {Object.keys(eventProps).length > 0 ? (
                      <div className="space-y-0">{renderTree(eventProps)}</div>
                    ) : (
                      <p className="text-[11px] text-zinc-400">Sem dados</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile props */}
            <div>
              <button onClick={() => setShowProfileProps(!showProfileProps)}
                className="w-full flex items-center justify-between px-5 h-10 text-left hover:bg-white/80 transition-colors">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.04em]">Propriedades do perfil</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-300 transition-transform', !showProfileProps && '-rotate-90')} />
              </button>
              {showProfileProps && contact && (
                <div className="mx-3 mb-3 bg-white rounded-lg border border-zinc-100 overflow-hidden">
                  <table className="w-full">
                    <tbody>
                      {PROFILE_FIELDS.map(([field, label]) => {
                        const raw = contact[field];
                        if (raw === undefined) return null;
                        let display: string;
                        if (raw === null || raw === '') {
                          display = '—';
                        } else if (Array.isArray(raw)) {
                          display = raw.join(', ');
                        } else if (typeof raw === 'object') {
                          display = JSON.stringify(raw);
                        } else {
                          display = String(raw);
                        }
                        return (
                          <tr key={field} className="border-b border-zinc-50 last:border-0">
                            <td className="pl-4 pr-2 py-2 text-[11px] text-zinc-400 whitespace-nowrap align-top w-[110px]">{label}</td>
                            <td className="pr-4 py-2 text-[11px] text-zinc-800 break-all">{display}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {showProfileProps && !contact && (
                <p className="px-5 pb-4 text-[11px] text-zinc-400">Sem dados do perfil</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailPreviewMode;
