'use client';

// =============================================
// Componente: WhatsApp Cloud Connect (Dark Theme)
// Usa a API existente /api/whatsapp/connect
// =============================================

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores';
import { 
  MessageSquare, 
  Phone, 
  CheckCircle, 
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  RefreshCw,
  Info,
  Plus,
  Shield,
  Zap,
  X,
  Eye,
  EyeOff
} from 'lucide-react';

interface WhatsAppConfig {
  id: string;
  phone_number_id: string;
  waba_id: string;
  business_name: string;
  phone_number: string;
  is_active: boolean;
  webhook_verified: boolean;
  created_at: string;
}

export default function WhatsAppCloudConnect() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Form fields
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  // Webhook info
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');

  useEffect(() => {
    if (user?.organization_id) {
      loadConfig();
    }
  }, [user?.organization_id]);

  const loadConfig = async () => {
    if (!user?.organization_id) return;

    try {
      setLoading(true);
      
      const response = await fetch(
        `/api/whatsapp/connect?organizationId=${user.organization_id}`
      );

      const data = await response.json();
      
      if (response.ok) {
        setConfig(data.config);
        
        // Gerar URL do webhook
        const baseUrl = window.location.origin;
        setWebhookUrl(`${baseUrl}/api/whatsapp/webhook`);
      } else {
        if (data.error !== 'Config not found') {
          setError(data.error || 'Falha ao carregar configuração');
        }
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.organization_id) {
      setError('Usuário não autenticado');
      return;
    }

    if (!phoneNumberId.trim() || !accessToken.trim()) {
      setError('Phone Number ID e Access Token são obrigatórios');
      return;
    }

    setError('');
    setSuccess('');
    setConnecting(true);

    try {
      // Gerar verify token
      const verifyToken = `worder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const response = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim() || undefined,
          accessToken: accessToken.trim(),
          webhookVerifyToken: verifyToken,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('WhatsApp conectado com sucesso!');
        setWebhookVerifyToken(verifyToken);
        setShowForm(false);
        loadConfig();
        // Reset form
        setWabaId('');
        setPhoneNumberId('');
        setAccessToken('');
      } else {
        setError(data.error || 'Falha ao conectar');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp Business?')) return;
    if (!user?.organization_id) return;

    try {
      const response = await fetch(
        `/api/whatsapp/connect?organizationId=${user.organization_id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setSuccess('Conta desconectada');
        setConfig(null);
        loadConfig();
      } else {
        const data = await response.json();
        setError(data.error || 'Falha ao desconectar');
      }
    } catch (err) {
      setError('Erro de conexão');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(''), 2000);
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
            <MessageSquare className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">WhatsApp Business API</h2>
            <p className="text-sm text-dark-400">API oficial da Meta para WhatsApp</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadConfig}
            className="p-2.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-xl transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {!config && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Conectar Número
            </button>
          )}
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

      {/* Connected Account */}
      {config && (
        <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <Phone className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">{config.business_name || 'WhatsApp Business'}</h4>
                <p className="text-sm text-dark-400">{config.phone_number}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium border text-emerald-400 bg-emerald-500/20 border-emerald-500/30">
                Conectado
              </span>
              <button
                onClick={handleDisconnect}
                className="p-2.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                title="Desconectar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Webhook Status */}
          <div className="p-4 bg-dark-900 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-dark-400" />
              <span className="text-sm text-dark-300">Configuração do Webhook</span>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-dark-500 mb-1">Callback URL</label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-xs text-dark-300 font-mono overflow-x-auto">
                    {webhookUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(webhookUrl, 'url')}
                    className="px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white transition-colors"
                  >
                    {copied === 'url' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {config.webhook_verified ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Webhook verificado
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Webhook pendente - configure no Meta Business Suite
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="p-4 bg-dark-900 rounded-xl text-center">
              <p className="text-sm font-medium text-white">
                {new Date(config.created_at).toLocaleDateString('pt-BR')}
              </p>
              <p className="text-xs text-dark-400 mt-1">Conectado em</p>
            </div>
            <div className="p-4 bg-dark-900 rounded-xl text-center">
              <p className="text-sm font-medium text-white">{config.phone_number_id}</p>
              <p className="text-xs text-dark-400 mt-1">Phone Number ID</p>
            </div>
          </div>
        </div>
      )}

      {/* Connection Form */}
      {showForm && !config && (
        <form onSubmit={handleConnect} className="p-6 bg-dark-800 border border-dark-700 rounded-xl space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">Conectar WhatsApp Business API</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Phone Number ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
                required
              />
              <p className="text-xs text-dark-500 mt-1.5">
                ID do número de telefone no Meta
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                WABA ID <span className="text-dark-500">(opcional)</span>
              </label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
              />
              <p className="text-xs text-dark-500 mt-1.5">
                WhatsApp Business Account ID
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Access Token <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Token permanente do sistema (EAAG...)"
                className="w-full px-4 py-3 pr-12 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors h-24 font-mono text-sm resize-none"
                style={{ fontFamily: showToken ? 'monospace' : 'inherit' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-3 p-1.5 text-dark-400 hover:text-white rounded"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-dark-500 mt-1.5">
              Token de acesso permanente (System User Token)
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
            >
              {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
              Conectar
            </button>
          </div>

          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-300">
                <strong>Como obter as credenciais:</strong>
                <ol className="mt-2 space-y-1 list-decimal list-inside text-amber-300/80">
                  <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">developers.facebook.com</a></li>
                  <li>Vá para seu App → WhatsApp → API Setup</li>
                  <li>Copie o Phone Number ID e WABA ID</li>
                  <li>Crie um System User Token com permissões whatsapp_business_messaging</li>
                </ol>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Empty State */}
      {!config && !showForm && (
        <div className="text-center py-16 bg-dark-800/50 border border-dark-700 rounded-xl">
          <Phone className="w-12 h-12 mx-auto mb-4 text-dark-600" />
          <p className="text-dark-400 mb-4">Nenhum número conectado</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-green-400 hover:text-green-300 font-medium"
          >
            Conectar seu primeiro número
          </button>
        </div>
      )}
    </div>
  );
}
