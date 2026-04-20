'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  deliveryId: string;
  onClose: () => void;
  onReplay?: (newId: string) => void;
}

type Tab = 'request' | 'response';

interface DeliveryDetail {
  id: string;
  subscription_id: string;
  event_type: string;
  event_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  url: string;
  payload: any;
  response_code: number | null;
  response_body: string | null;
  error_message: string | null;
  created_at: string;
  last_attempt_at: string | null;
  delivered_at: string | null;
  next_retry_at: string | null;
}

export default function DeliveryDetailDrawer({ deliveryId, onClose, onReplay }: Props) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('request');
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetch(`/api/webhooks-admin/deliveries/${deliveryId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => {
        if (!canceled) setDetail(d.delivery);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [deliveryId]);

  const handleReplay = async () => {
    if (!detail) return;
    setReplaying(true);
    try {
      const res = await fetch(`/api/webhooks-admin/deliveries/${deliveryId}/replay`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.replayed_as) {
        onReplay?.(data.replayed_as);
        alert('Reenvio enfileirado.');
      } else {
        alert(data.error ?? 'falha ao reenviar');
      }
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Detalhe da entrega</h2>
            {detail && (
              <p className="text-xs text-gray-500 font-mono">{detail.event_id}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <button
                onClick={handleReplay}
                disabled={replaying}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded hover:bg-orange-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${replaying ? 'animate-spin' : ''}`} />
                Reenviar agora
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : !detail ? (
          <div className="p-6 text-sm text-gray-500">Não encontrado.</div>
        ) : (
          <>
            <div className="border-b border-gray-200 px-4 py-2 grid grid-cols-2 gap-4 text-xs">
              <Info label="Evento" value={detail.event_type} mono />
              <Info label="Status" value={detail.status} />
              <Info label="HTTP" value={detail.response_code?.toString() ?? '—'} />
              <Info
                label="Tentativas"
                value={`${detail.attempt_count} / ${detail.max_attempts}`}
              />
              <Info label="Criado" value={new Date(detail.created_at).toLocaleString()} />
              <Info
                label="Última tentativa"
                value={
                  detail.last_attempt_at
                    ? new Date(detail.last_attempt_at).toLocaleString()
                    : '—'
                }
              />
              <Info
                label="Entregue em"
                value={
                  detail.delivered_at ? new Date(detail.delivered_at).toLocaleString() : '—'
                }
              />
              <Info
                label="Próximo retry"
                value={
                  detail.next_retry_at ? new Date(detail.next_retry_at).toLocaleString() : '—'
                }
              />
            </div>

            <div className="border-b border-gray-200 flex">
              <TabBtn active={tab === 'request'} onClick={() => setTab('request')}>
                Request
              </TabBtn>
              <TabBtn active={tab === 'response'} onClick={() => setTab('response')}>
                Response
              </TabBtn>
            </div>

            <div className="flex-1 overflow-auto p-4 text-xs font-mono">
              {tab === 'request' ? (
                <>
                  <div className="mb-3 text-gray-600">
                    POST <span className="text-gray-900">{detail.url}</span>
                  </div>
                  <div className="text-gray-600 mb-1">Headers (reconstruídos):</div>
                  <pre className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap mb-3">
{`Content-Type: application/json
X-Worder-Event: ${detail.event_type}
X-Worder-Event-Id: ${detail.event_id}
X-Worder-Delivery-Id: ${detail.id}
X-Worder-Signature: sha256=<mascarado>
X-Worder-Timestamp: <gerado no envio>`}
                  </pre>
                  <div className="text-gray-600 mb-1">Body:</div>
                  <pre className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                    {JSON.stringify(detail.payload, null, 2)}
                  </pre>
                </>
              ) : (
                <>
                  <div className="mb-3 text-gray-600">
                    HTTP{' '}
                    <span className="text-gray-900">{detail.response_code ?? '—'}</span>
                  </div>
                  {detail.error_message && (
                    <>
                      <div className="text-gray-600 mb-1">Erro:</div>
                      <pre className="bg-red-50 p-3 rounded border border-red-200 whitespace-pre-wrap mb-3 text-red-900">
                        {detail.error_message}
                      </pre>
                    </>
                  )}
                  <div className="text-gray-600 mb-1">Body (máx 2KB):</div>
                  <pre className="bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                    {detail.response_body ?? '(vazio)'}
                  </pre>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-gray-500">{label}</div>
      <div className={`text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 ${
        active ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}
