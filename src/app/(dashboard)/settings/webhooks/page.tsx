'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Webhook as WebhookIcon, Loader2, FileText, Pencil, Trash2 } from 'lucide-react';

interface Subscription {
  id: string;
  store_id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  description?: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Subscription['status'], string> = {
  active: 'Ativo',
  paused: 'Pausado',
  disabled: 'Desabilitado',
};

const STATUS_COLOR: Record<Subscription['status'], string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  disabled: 'bg-gray-200 text-gray-700',
};

export default function WebhooksListPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const res = await fetch('/api/webhooks-admin/subscriptions');
    if (res.ok) {
      const data = await res.json();
      setSubs(data.subscriptions ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este webhook? Entregas passadas ficam no histórico.')) return;
    const res = await fetch(`/api/webhooks-admin/subscriptions/${id}`, { method: 'DELETE' });
    if (res.ok) setSubs((prev) => prev.filter((s) => s.id !== id));
    else alert('Falha ao remover');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <WebhookIcon className="w-6 h-6" />
            Webhooks de saída
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Receba eventos da sua loja em endpoints externos, assinados com HMAC SHA-256.
          </p>
        </div>
        <Link
          href="/settings/webhooks/new"
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo webhook
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : subs.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <WebhookIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">Nenhum webhook configurado ainda.</p>
          <Link
            href="/settings/webhooks/new"
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Criar o primeiro
          </Link>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">URL</th>
                <th className="px-4 py-2">Eventos</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-xs">
                    {s.url}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.events.length}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[s.status]}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/settings/webhooks/${s.id}/deliveries`}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Logs"
                      >
                        <FileText className="w-4 h-4 text-gray-600" />
                      </Link>
                      <Link
                        href={`/settings/webhooks/${s.id}/edit`}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4 text-gray-600" />
                      </Link>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-2 hover:bg-red-50 rounded"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
