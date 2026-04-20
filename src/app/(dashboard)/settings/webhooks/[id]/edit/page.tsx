'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import WebhookForm from '@/components/webhooks/WebhookForm';

export default function EditWebhookPage() {
  const params = useParams();
  const id = params?.id as string;
  const [sub, setSub] = useState<any | null>(null);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/webhooks-admin/subscriptions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => setSub(d.subscription))
      .catch(() => setSub(null));
  }, [id]);

  const rotateSecret = async () => {
    if (!confirm('Rotacionar o secret? O secret antigo fica válido por 24h pra dual-signing.')) return;
    setRotating(true);
    try {
      const res = await fetch(`/api/webhooks-admin/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_secret: true }),
      });
      const data = await res.json();
      if (res.ok) setNewSecret(data.secret);
      else alert(data.error ?? 'falha');
    } finally {
      setRotating(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const res = await fetch(`/api/webhooks-admin/subscriptions/${id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestMessage(
        res.ok
          ? 'Teste disparado. Veja os logs em alguns segundos.'
          : data.error ?? 'falha ao testar'
      );
    } finally {
      setTesting(false);
    }
  };

  if (!sub) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div>
      <div className="px-6 pt-6 flex items-start justify-between max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Editar webhook</h1>
          <p className="text-sm text-gray-500 mt-1">{sub.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sendTest}
            disabled={testing}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? 'Enviando...' : 'Testar entrega'}
          </button>
          <button
            onClick={rotateSecret}
            disabled={rotating}
            className="px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50"
          >
            {rotating ? 'Rotacionando...' : 'Rotacionar secret'}
          </button>
        </div>
      </div>

      {testMessage && (
        <div className="px-6 pt-4 max-w-2xl">
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded p-3">
            {testMessage}
          </div>
        </div>
      )}

      {newSecret && (
        <div className="px-6 pt-4 max-w-2xl">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800 mb-2">
              Novo secret gerado. Copie agora; o antigo expira em 24h.
            </p>
            <code className="block bg-white rounded px-3 py-2 text-xs font-mono border border-green-200 break-all">
              {newSecret}
            </code>
          </div>
        </div>
      )}

      <WebhookForm initial={sub} />
    </div>
  );
}
