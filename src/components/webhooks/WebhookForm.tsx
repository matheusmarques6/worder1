'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Copy, AlertCircle } from 'lucide-react';
import EventCheckboxGroup from './EventCheckboxGroup';

interface Store {
  id: string;
  shop_domain: string;
  shop_name: string | null;
}

interface Subscription {
  id: string;
  store_id: string;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  description?: string | null;
}

interface Props {
  initial?: Subscription;
}

export default function WebhookForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState(initial?.name ?? '');
  const [storeId, setStoreId] = useState(initial?.store_id ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<Subscription['status']>(initial?.status ?? 'active');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);

  useEffect(() => {
    fetch('/api/webhooks-admin/stores')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  const isValidUrl = (u: string) => /^https:\/\//.test(u) || u.startsWith('http://localhost');

  const acceptConsent = async () => {
    await fetch('/api/webhooks-admin/consent', { method: 'POST' });
    setConsentRequired(false);
    submit();
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Nome é obrigatório');
    if (!storeId) return setError('Selecione uma loja');
    if (!isValidUrl(url)) return setError('URL deve começar com https://');
    if (events.length === 0) return setError('Selecione ao menos um evento');

    setSubmitting(true);
    try {
      const endpoint = isEdit
        ? `/api/webhooks-admin/subscriptions/${initial!.id}`
        : '/api/webhooks-admin/subscriptions';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          name,
          url,
          events,
          description,
          ...(isEdit ? { status } : {}),
        }),
      });

      if (res.status === 412) {
        setConsentRequired(true);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'falha ao salvar');
        return;
      }

      if (!isEdit && data.secret) {
        setCreatedSecret(data.secret);
      } else {
        router.push('/settings/webhooks');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (createdSecret) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Webhook criado. Copie o secret agora — ele não será mostrado novamente.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white rounded px-3 py-2 text-sm font-mono border border-green-200 break-all">
              {createdSecret}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(createdSecret)}
              className="p-2 hover:bg-green-100 rounded-lg"
              title="Copiar"
            >
              <Copy className="w-4 h-4 text-green-600" />
            </button>
          </div>
        </div>
        <button
          onClick={() => router.push('/settings/webhooks')}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
        >
          Concluir
        </button>
      </div>
    );
  }

  if (consentRequired) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold">Consentimento LGPD</h2>
          <p className="text-sm text-gray-700">
            Ao criar um webhook de saída, sua organização envia dados pessoais (emails,
            nomes, telefones, IDs de clientes e produtos) ao endpoint configurado.
            Você é responsável por garantir que o destinatário tem base legal pra tratar
            esses dados e contrato de confidencialidade adequado.
          </p>
          <p className="text-sm text-gray-700">
            Entregas falhadas/sucedidas são retidas por 30 dias e depois purgadas.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={acceptConsent}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
            >
              Aceito e quero continuar
            </button>
            <button
              onClick={() => setConsentRequired(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="ex: Integração com CRM externo"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Loja</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          disabled={isEdit}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-50"
        >
          <option value="">— selecione —</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shop_name ?? s.shop_domain}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL do endpoint</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          placeholder="https://exemplo.com/webhooks/worder"
        />
        <p className="text-xs text-gray-500 mt-1">Deve ser https://. Worder nunca envia a IPs privados.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Eventos</label>
        <EventCheckboxGroup value={events} onChange={setEvents} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      {isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Subscription['status'])}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
            <option value="disabled">Desabilitado</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? 'Salvar alterações' : 'Criar webhook'}
        </button>
        <button
          onClick={() => router.push('/settings/webhooks')}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
