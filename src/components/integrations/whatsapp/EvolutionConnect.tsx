'use client';

// =============================================
// Componente: Evolution API Connect
// src/components/integrations/whatsapp/EvolutionConnect.tsx
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { 
  MessageSquare, 
  Phone, 
  CheckCircle, 
  AlertCircle,
  QrCode,
  Loader2,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Wifi,
  WifiOff
} from 'lucide-react';

interface EvolutionInstance {
  id: string;
  instance_name: string;
  phone_number: string | null;
  profile_name: string | null;
  status: string;
  messages_sent_today: number;
  messages_received_today: number;
  last_message_at: string | null;
  connected_at: string | null;
  created_at: string;
}

export default function EvolutionConnect() {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [polling, setPolling] = useState(false);

  // Form
  const [instanceName, setInstanceName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadInstances();
  }, []);

  // Poll for QR code updates
  useEffect(() => {
    if (!polling || !activeInstanceId) return;

    const interval = setInterval(async () => {
      await checkInstanceStatus(activeInstanceId);
    }, 3000);

    return () => clearInterval(interval);
  }, [polling, activeInstanceId]);

  const loadInstances = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('supabase.auth.token');
      
      const response = await fetch('/api/whatsapp/evolution/instances', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setInstances(data.instances || []);
      } else {
        setError(data.error || 'Failed to load instances');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const checkInstanceStatus = async (instanceId: string) => {
    try {
      const token = localStorage.getItem('supabase.auth.token');
      
      const response = await fetch('/api/whatsapp/evolution/instances', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId,
          action: 'status',
        }),
      });

      const data = await response.json();

      if (data.connected) {
        setPolling(false);
        setQrCode(null);
        setSuccess('WhatsApp conectado com sucesso!');
        loadInstances();
      }
    } catch {
      // Ignore
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch('/api/whatsapp/evolution/instances', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName: instanceName || undefined,
          serverUrl: serverUrl || undefined,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.qrcode) {
          setQrCode(data.qrcode);
          setActiveInstanceId(data.instance.id);
          setPolling(true);
        }
        setSuccess('Instância criada! Escaneie o QR Code.');
        loadInstances();
        // Reset form
        setInstanceName('');
        setServerUrl('');
        setApiKey('');
      } else {
        setError(data.error || 'Falha ao criar instância');
      }
    } catch (err) {
      setError('Erro de rede');
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = async (instanceId: string) => {
    setError('');
    setActiveInstanceId(instanceId);

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch('/api/whatsapp/evolution/instances', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId,
          action: 'connect',
        }),
      });

      const data = await response.json();

      if (data.qrcode) {
        setQrCode(data.qrcode);
        setPolling(true);
      } else if (data.connected) {
        setSuccess('Já conectado!');
        loadInstances();
      }
    } catch (err) {
      setError('Erro ao conectar');
    }
  };

  const handleLogout = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja desconectar?')) return;

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch('/api/whatsapp/evolution/instances', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId,
          action: 'logout',
        }),
      });

      if (response.ok) {
        setSuccess('Desconectado');
        loadInstances();
      }
    } catch (err) {
      setError('Erro ao desconectar');
    }
  };

  const handleDelete = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta instância? Esta ação não pode ser desfeita.')) return;

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch(`/api/whatsapp/evolution/instances?id=${instanceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setSuccess('Instância deletada');
        loadInstances();
      }
    } catch (err) {
      setError('Erro ao deletar');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting':
      case 'qr_pending': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-red-600 bg-red-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <Wifi className="w-4 h-4" />;
      case 'connecting':
      case 'qr_pending': return <Loader2 className="w-4 h-4 animate-spin" />;
      default: return <WifiOff className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <QrCode className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Evolution API</h2>
            <p className="text-sm text-gray-500">Conexão via QR Code (não-oficial)</p>
          </div>
        </div>
        <button
          onClick={loadInstances}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          title="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Warning */}
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <strong>⚠️ Atenção:</strong> A Evolution API usa conexão não-oficial (QR Code).
        Existe risco de banimento do número. Use com cautela e não abuse de envios em massa.
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">✕</button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
          <button onClick={() => setSuccess('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center">
            <h3 className="text-xl font-semibold mb-4">Escaneie o QR Code</h3>
            <p className="text-gray-500 mb-6">
              Abra o WhatsApp no seu celular, vá em Configurações {">"} Aparelhos Conectados {">"} Conectar
            </p>
            <div className="bg-white p-4 rounded-lg inline-block mb-6">
              <img 
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code" 
                className="w-64 h-64"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Aguardando conexão...
            </div>
            <button
              onClick={() => {
                setQrCode(null);
                setPolling(false);
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      <form onSubmit={handleCreate} className="p-6 bg-gray-50 rounded-xl space-y-4">
        <h3 className="font-semibold">Nova Instância</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome da Instância (opcional)
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="Ex: meu-whatsapp"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showAdvanced ? '- Ocultar configurações avançadas' : '+ Configurações avançadas'}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Server URL
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://evolution.seudominio.com"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Sua API Key"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin" />}
          Criar Instância
        </button>
      </form>

      {/* Instances List */}
      <div className="space-y-4">
        <h3 className="font-semibold">Instâncias</h3>
        
        {instances.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma instância criada</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="p-4 border rounded-xl hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      instance.status === 'connected' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Phone className={`w-6 h-6 ${
                        instance.status === 'connected' ? 'text-green-600' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <h4 className="font-semibold">{instance.instance_name}</h4>
                      <p className="text-sm text-gray-500">
                        {instance.phone_number || 'Não conectado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${getStatusColor(instance.status)}`}>
                      {getStatusIcon(instance.status)}
                      {instance.status}
                    </span>

                    <div className="flex gap-1">
                      {instance.status === 'connected' ? (
                        <button
                          onClick={() => handleLogout(instance.id)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"
                          title="Desconectar"
                        >
                          <PowerOff className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(instance.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title="Conectar"
                        >
                          <Power className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(instance.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Deletar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {instance.status === 'connected' && (
                  <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-800">
                        {instance.messages_sent_today}
                      </p>
                      <p className="text-xs text-gray-500">Enviadas hoje</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-800">
                        {instance.messages_received_today}
                      </p>
                      <p className="text-xs text-gray-500">Recebidas hoje</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-800">
                        {instance.connected_at 
                          ? new Date(instance.connected_at).toLocaleDateString('pt-BR')
                          : '-'
                        }
                      </p>
                      <p className="text-xs text-gray-500">Conectado em</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
