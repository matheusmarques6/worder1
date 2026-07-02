'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import DeliveryDetailDrawer from '@/components/webhooks/DeliveryDetailDrawer';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Delivery {
  id: string;
  event_type: string;
  event_id: string;
  status: 'pending' | 'in_flight' | 'delivered' | 'failed' | 'retrying';
  response_code: number | null;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
}

const STATUS_COLOR: Record<Delivery['status'], string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_flight: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  retrying: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABEL: Record<Delivery['status'], string> = {
  pending: 'Pendente',
  in_flight: 'Em andamento',
  delivered: 'Entregue',
  failed: 'Falha',
  retrying: 'Reentregando',
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'delivered', label: 'Entregues' },
  { value: 'failed', label: 'Falhas' },
  { value: 'retrying', label: 'Reentregando' },
  { value: 'pending', label: 'Pendentes' },
];

const MAX_REPLAY_ALL = 50;

export default function DeliveriesPage() {
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();
  const { confirm } = useConfirm();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [replayingAll, setReplayingAll] = useState(false);

  const fetchDeliveries = async () => {
    setLoading(true);
    const qs = new URLSearchParams({ subscription_id: id });
    if (statusFilter) qs.set('status', statusFilter);
    const res = await fetch(`/api/webhooks-admin/deliveries?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setDeliveries(data.deliveries ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) fetchDeliveries();
  }, [id, statusFilter]);

  const replayAllFailed = async () => {
    const failed = deliveries.filter((d) => d.status === 'failed').slice(0, MAX_REPLAY_ALL);
    if (failed.length === 0) {
      toast.info('Nenhuma falha para reenviar');
      return;
    }
    const confirmed = await confirm({
      title: `Reenviar ${failed.length} entrega(s) falhada(s)?`,
      description: 'As entregas serão colocadas novamente na fila de envio.',
      confirmLabel: 'Reenviar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setReplayingAll(true);
    let ok = 0;
    for (const d of failed) {
      try {
        const res = await fetch(`/api/webhooks-admin/deliveries/${d.id}/replay`, {
          method: 'POST',
        });
        if (res.ok) ok++;
      } catch {}
    }
    setReplayingAll(false);
    if (ok === failed.length) {
      toast.success(`${ok} de ${failed.length} entrega(s) reenviada(s)`);
    } else {
      toast.warning(`${ok} de ${failed.length} entrega(s) reenviada(s)`, 'Algumas entregas não puderam ser reenviadas. Tente novamente.');
    }
    fetchDeliveries();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings/webhooks"
            className="p-2 hover:bg-gray-100 rounded"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Logs de entregas</h1>
            <p className="text-sm text-gray-500">
              Últimas 100 tentativas. Entregas retidas por 30 dias.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={fetchDeliveries}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={replayAllFailed}
            disabled={replayingAll}
            className="px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded hover:bg-orange-50 disabled:opacity-50"
          >
            {replayingAll ? 'Reenviando...' : `Reenviar falhas (até ${MAX_REPLAY_ALL})`}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : deliveries.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-600">
          Nenhuma entrega registrada ainda.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">Tentativas</th>
                <th className="px-3 py-2">Criado</th>
                <th className="px-3 py-2">Última tentativa</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-mono text-xs">{d.event_type}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[d.status]}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{d.response_code ?? '—'}</td>
                  <td className="px-3 py-2">
                    {d.attempt_count}/{d.max_attempts}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {d.last_attempt_at ? new Date(d.last_attempt_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <DeliveryDetailDrawer
          deliveryId={selectedId}
          onClose={() => setSelectedId(null)}
          onReplay={() => fetchDeliveries()}
        />
      )}
    </div>
  );
}
