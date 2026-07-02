'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string;
}

export default function ApiSettingsPage() {
  const { user } = useAuthStore();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/settings/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {}
    setLoading(false);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (res.ok) {
        const data = await res.json();
        const realKey = data.key || data.api_key;
        if (!realKey) {
          toast.error('Chave não retornada', 'A chave foi criada mas não foi retornada pelo servidor. Verifique na lista ou tente novamente.');
          fetchKeys();
          setNewKeyName('');
        } else {
          setCreatedKey(realKey);
          fetchKeys();
          setNewKeyName('');
        }
      } else {
        toast.error('Erro ao criar chave', 'Não foi possível criar a chave de API. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao criar chave', 'Não foi possível criar a chave de API. Tente novamente.');
    }
    setCreating(false);
  };

  const deleteKey = async (id: string) => {
    const target = keys.find(k => k.id === id);
    const ok = await confirm({
      title: `Excluir a chave ${target?.name || ''}?`.trim(),
      description: 'Integrações que a usam vão parar de funcionar.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setKeys(keys.filter(k => k.id !== id));
        toast.success('Chave excluída');
      } else {
        toast.error('Erro ao excluir', 'Não foi possível excluir a chave. Tente novamente.');
      }
    } catch {
      toast.error('Erro ao excluir', 'Não foi possível excluir a chave. Tente novamente.');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado', 'Chave copiada para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar', 'Copie manualmente a chave exibida.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie suas chaves de API para integrações externas</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedKey(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Chave
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Chave criada! Copie agora, ela não será mostrada novamente.</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white rounded px-3 py-2 text-sm font-mono border border-green-200">{createdKey}</code>
            <button onClick={() => copyToClipboard(createdKey)} className="p-2 hover:bg-green-100 rounded-lg transition-colors">
              <Copy className="w-4 h-4 text-green-600" />
            </button>
          </div>
        </div>
      )}

      {showCreate && !createdKey && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Criar nova chave de API</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Nome da chave (ex: Integração ERP)"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
            <button
              onClick={createKey}
              disabled={creating || !newKeyName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Criar
            </button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma chave de API</h3>
            <p className="text-sm text-gray-500">Crie sua primeira chave para integrar sistemas externos</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Chave</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Criada</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map(key => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{key.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{key.key_prefix}...****</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {key.created_at ? new Date(key.created_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteKey(key.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
