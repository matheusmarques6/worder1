'use client';

// =============================================
// Componente: Evolution API Connect (Dark Theme)
// src/components/integrations/whatsapp/EvolutionConnect.tsx
// =============================================

import { useState, useEffect } from 'react';
import { 
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
  WifiOff,
  Plus,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle
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
      case 'connected': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
      case 'connecting': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      default: return 'text-dark-400 bg-dark-700 border-dark-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <Wifi className="w-4 h-4" />;
      case 'connecting': return <Loader2 className="w-4 h-4 animate-spin" />;
      default: return <WifiOff className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
            <QrCode className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Evolution API</h2>
            <p className="text-sm text-dark-400">Conexão via QR Code (não-oficial)</p>
          </div>
        </div>
        <button
          onClick={loadInstances}
          className="p-2.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-xl transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-300">
          <strong>Atenção:</strong> A Evolution API usa conexão não-oficial (QR Code).
          Existe risco de banimento do número. Use com cautela e não abuse de envios em massa.
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-500/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            <h3 className="text-xl font-semibold text-white mb-4">Escaneie o QR Code</h3>
            <p className="text-dark-400 mb-6">
              Abra o WhatsApp no seu celular, vá em Configurações → Aparelhos Conectados → Conectar
            </p>
            <div className="bg-white p-4 rounded-xl inline-block mb-6">
              <img 
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code" 
                className="w-64 h-64"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-dark-400 mb-6">
              <Loader2 className="w-4 h-4 animate-spin text-green-500" />
              Aguardando conexão...
            </div>
            <button
              onClick={() => {
                setQrCode(null);
                setPolling(false);
              }}
              className="px-5 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      <form onSubmit={handleCreate} className="p-6 bg-dark-800 border border-dark-700 rounded-xl space-y-5">
        <div className="flex items-center gap-3">
          <Plus className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-white">Nova Instância</h3>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">
            Nome da Instância <span className="text-dark-500">(opcional)</span>
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="Ex: meu-whatsapp"
            className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300"
        >
          <Settings className="w-4 h-4" />
          Configurações avançadas
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t border-dark-700">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Server URL
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://evolution.seudominio.com"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Sua API Key"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin" />}
          Criar Instância
        </button>
      </form>

      {/* Instances List */}
      <div className="space-y-4">
        <h3 className="font-semibold text-white">Instâncias</h3>
        
        {instances.length === 0 ? (
          <div className="text-center py-16 bg-dark-800/50 border border-dark-700 rounded-xl">
            <Phone className="w-12 h-12 mx-auto mb-4 text-dark-600" />
            <p className="text-dark-400">Nenhuma instância criada</p>
          </div>
        ) : (
          <div className="space-y-4">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="p-5 bg-dark-800/50 border border-dark-700 rounded-xl hover:border-dark-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      instance.status === 'connected' ? 'bg-green-500/20' : 'bg-dark-700'
                    }`}>
                      <Phone className={`w-6 h-6 ${
                        instance.status === 'connected' ? 'text-green-400' : 'text-dark-500'
                      }`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{instance.instance_name}</h4>
                      <p className="text-sm text-dark-400">
                        {instance.phone_number || 'Não conectado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${getStatusColor(instance.status)}`}>
                      {getStatusIcon(instance.status)}
                      {instance.status === 'connected' ? 'Conectado' : 'Desconectado'}
                    </span>

                    <div className="flex gap-1">
                      {instance.status === 'connected' ? (
                        <button
                          onClick={() => handleLogout(instance.id)}
                          className="p-2.5 text-amber-400 hover:bg-amber-500/20 rounded-xl transition-colors"
                          title="Desconectar"
                        >
                          <PowerOff className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(instance.id)}
                          className="p-2.5 text-green-400 hover:bg-green-500/20 rounded-xl transition-colors"
                          title="Conectar"
                        >
                          <Power className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(instance.id)}
                        className="p-2.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                        title="Deletar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {instance.status === 'connected' && (
                  <div className="mt-5 grid grid-cols-3 gap-4">
                    <div className="p-4 bg-dark-900 rounded-xl text-center">
                      <p className="text-2xl font-bold text-white">
                        {instance.messages_sent_today}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Enviadas hoje</p>
                    </div>
                    <div className="p-4 bg-dark-900 rounded-xl text-center">
                      <p className="text-2xl font-bold text-white">
                        {instance.messages_received_today}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Recebidas hoje</p>
                    </div>
                    <div className="p-4 bg-dark-900 rounded-xl text-center">
                      <p className="text-sm font-medium text-white">
                        {instance.connected_at 
                          ? new Date(instance.connected_at).toLocaleDateString('pt-BR')
                          : '-'
                        }
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Conectado em</p>
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
