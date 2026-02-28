'use client';

// =============================================
// Componente: Evolution API Connect (Dark Theme)
// Usa a API existente /api/whatsapp/instances
// =============================================

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores';
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
  title: string;
  instance_name: string;
  phone_number: string | null;
  profile_name: string | null;
  status: string;
  api_type: string;
  messages_sent: number;
  messages_received: number;
  last_message_at: string | null;
  created_at: string;
}

export default function EvolutionConnect() {
  const { user } = useAuthStore();
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
    if (user?.organization_id) {
      loadInstances();
    }
  }, [user?.organization_id]);

  // Poll for connection status
  useEffect(() => {
    if (!polling || !activeInstanceId || !user?.organization_id) return;

    const interval = setInterval(async () => {
      await checkInstanceStatus(activeInstanceId);
    }, 3000);

    return () => clearInterval(interval);
  }, [polling, activeInstanceId, user?.organization_id]);

  const loadInstances = async () => {
    if (!user?.organization_id) return;
    
    try {
      setLoading(true);
      
      const response = await fetch(
        `/api/whatsapp/instances?organization_id=${user.organization_id}`
      );

      const data = await response.json();
      
      if (response.ok) {
        // Filtrar apenas instâncias Evolution
        const evolutionInstances = (data.instances || []).filter(
          (i: EvolutionInstance) => i.api_type === 'EVOLUTION'
        );
        setInstances(evolutionInstances);
      } else {
        setError(data.error || 'Falha ao carregar instâncias');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const checkInstanceStatus = async (instanceId: string) => {
    if (!user?.organization_id) return;
    
    try {
      const response = await fetch(
        `/api/whatsapp/instances?organization_id=${user.organization_id}&id=${instanceId}`
      );

      const data = await response.json();

      if (data.instance?.status === 'connected') {
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
    
    if (!instanceName.trim()) {
      setError('Nome da instância é obrigatório');
      return;
    }
    
    if (!user?.organization_id) {
      setError('Usuário não autenticado');
      return;
    }

    setError('');
    setSuccess('');
    setCreating(true);

    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: user.organization_id,
          title: instanceName,
          api_type: 'EVOLUTION',
          api_url: serverUrl || undefined,
          api_key: apiKey || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Se retornou QR code, mostrar
        if (data.qrCode || data.qrcode) {
          setQrCode(data.qrCode || data.qrcode);
          setActiveInstanceId(data.instance?.id);
          setPolling(true);
        }
        setSuccess('Instância criada! Escaneie o QR Code.');
        loadInstances();
        setInstanceName('');
        setServerUrl('');
        setApiKey('');
      } else {
        setError(data.error || 'Falha ao criar instância');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = async (instanceId: string) => {
    if (!user?.organization_id) return;
    
    setError('');
    setActiveInstanceId(instanceId);

    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          organization_id: user.organization_id,
          instance_id: instanceId,
        }),
      });

      const data = await response.json();

      if (data.qrCode || data.qrcode) {
        setQrCode(data.qrCode || data.qrcode);
        setPolling(true);
      } else if (data.connected || data.instance?.status === 'connected') {
        setSuccess('Já conectado!');
        loadInstances();
      } else {
        setError(data.error || 'Erro ao gerar QR Code');
      }
    } catch (err) {
      setError('Erro ao conectar');
    }
  };

  const handleLogout = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja desconectar?')) return;
    if (!user?.organization_id) return;

    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'logout',
          organization_id: user.organization_id,
          instance_id: instanceId,
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
    if (!confirm('Tem certeza que deseja deletar esta instância?')) return;
    if (!user?.organization_id) return;

    try {
      const response = await fetch('/api/whatsapp/instances', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: user.organization_id,
          instance_id: instanceId,
        }),
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
            Nome da Instância <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="Ex: Atendimento, Vendas, Suporte..."
            className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
            required
          />
          <p className="text-xs text-dark-500 mt-1.5">
            Um nome para identificar esta conexão
          </p>
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
            <p className="text-xs text-dark-500">
              Deixe em branco para usar o servidor Evolution padrão do sistema.
            </p>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Server URL <span className="text-dark-500">(opcional)</span>
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
                API Key <span className="text-dark-500">(opcional)</span>
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
          disabled={creating || !instanceName.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
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
                      <h4 className="font-semibold text-white">{instance.title || instance.instance_name}</h4>
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
                        {instance.messages_sent || 0}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Enviadas</p>
                    </div>
                    <div className="p-4 bg-dark-900 rounded-xl text-center">
                      <p className="text-2xl font-bold text-white">
                        {instance.messages_received || 0}
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Recebidas</p>
                    </div>
                    <div className="p-4 bg-dark-900 rounded-xl text-center">
                      <p className="text-sm font-medium text-white">
                        {instance.created_at 
                          ? new Date(instance.created_at).toLocaleDateString('pt-BR')
                          : '-'
                        }
                      </p>
                      <p className="text-xs text-dark-400 mt-1">Criado em</p>
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
