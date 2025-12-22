'use client';

// =============================================
// Componente: WhatsApp Cloud Connect (Dark Theme)
// src/components/integrations/whatsapp/WhatsAppCloudConnect.tsx
// =============================================

import { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';

interface WhatsAppAccount {
  id: string;
  phone_number: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  status: string;
  webhook_configured: boolean;
  messages_sent_today: number;
  messages_received_today: number;
  last_message_at: string | null;
  created_at: string;
}

interface WebhookInfo {
  url: string;
  verifyToken: string;
  instructions: string[];
}

export default function WhatsAppCloudConnect() {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');

  // Form fields
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [appId, setAppId] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('supabase.auth.token');
      
      const response = await fetch('/api/whatsapp/cloud/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setAccounts(data.accounts || []);
      } else {
        setError(data.error || 'Failed to load accounts');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setConnecting(true);

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch('/api/whatsapp/cloud/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wabaId,
          phoneNumberId,
          accessToken,
          businessId,
          appId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('WhatsApp conectado com sucesso!');
        setWebhookInfo(data.webhook);
        setShowForm(false);
        loadAccounts();
        // Reset form
        setWabaId('');
        setPhoneNumberId('');
        setAccessToken('');
        setBusinessId('');
        setAppId('');
      } else {
        setError(data.error || 'Falha ao conectar');
      }
    } catch (err) {
      setError('Erro de rede');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Tem certeza que deseja desconectar esta conta?')) return;

    try {
      const token = localStorage.getItem('supabase.auth.token');

      const response = await fetch(`/api/whatsapp/cloud/accounts?id=${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setSuccess('Conta desconectada');
        loadAccounts();
      } else {
        const data = await response.json();
        setError(data.error || 'Falha ao desconectar');
      }
    } catch (err) {
      setError('Erro de rede');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(''), 2000);
  };

  const getQualityColor = (rating: string) => {
    switch (rating) {
      case 'GREEN': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
      case 'YELLOW': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      case 'RED': return 'text-red-400 bg-red-500/20 border-red-500/30';
      default: return 'text-dark-400 bg-dark-700 border-dark-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
      case 'pending': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      default: return 'text-red-400 bg-red-500/20 border-red-500/30';
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
            <MessageSquare className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">WhatsApp Business API</h2>
            <p className="text-sm text-dark-400">API oficial da Meta para WhatsApp</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAccounts}
            className="p-2.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-xl transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Conectar Número
          </button>
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

      {/* Webhook Info */}
      {webhookInfo && (
        <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">Configure o Webhook no Meta</h3>
            </div>
            <button
              onClick={() => setWebhookInfo(null)}
              className="p-1 hover:bg-blue-500/20 rounded text-blue-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-blue-300 mb-2">Callback URL</label>
              <div className="flex gap-2">
                <code className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-sm text-dark-300 font-mono overflow-x-auto">
                  {webhookInfo.url}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookInfo.url, 'url')}
                  className="px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
                >
                  {copied === 'url' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-blue-300 mb-2">Verify Token</label>
              <div className="flex gap-2">
                <code className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-sm text-dark-300 font-mono">
                  {webhookInfo.verifyToken}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookInfo.verifyToken, 'token')}
                  className="px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
                >
                  {copied === 'token' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-sm text-blue-300 mb-2">Campos para se inscrever:</p>
              <code className="px-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-sm text-dark-300">
                messages
              </code>
            </div>

            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
            >
              Abrir Meta for Developers
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* Connection Form */}
      {showForm && (
        <form onSubmit={handleConnect} className="p-6 bg-dark-800 border border-dark-700 rounded-xl space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">Conectar WhatsApp Business API</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                WABA ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
                required
              />
              <p className="text-xs text-dark-500 mt-1.5">
                WhatsApp Business Account ID
              </p>
            </div>

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
                ID do número de telefone
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Access Token <span className="text-red-400">*</span>
            </label>
            <textarea
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token permanente do sistema (EAAG...)"
              className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors h-24 font-mono text-sm resize-none"
              required
            />
            <p className="text-xs text-dark-500 mt-1.5">
              Token de acesso permanente (System User Token)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Business ID <span className="text-dark-500">(opcional)</span>
              </label>
              <input
                type="text"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                App ID <span className="text-dark-500">(opcional)</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
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
                  <li>Acesse developers.facebook.com</li>
                  <li>Vá para seu App → WhatsApp → API Setup</li>
                  <li>Copie o Phone Number ID e WABA ID</li>
                  <li>Crie um System User Token com permissões whatsapp_business_messaging</li>
                </ol>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Connected Accounts */}
      <div className="space-y-4">
        <h3 className="font-semibold text-white">Números Conectados</h3>
        
        {accounts.length === 0 ? (
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
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="p-5 bg-dark-800/50 border border-dark-700 rounded-xl hover:border-dark-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                      <Phone className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{account.verified_name}</h4>
                      <p className="text-sm text-dark-400">{account.display_phone_number}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(account.status)}`}>
                          {account.status === 'active' ? 'Ativo' : account.status}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${getQualityColor(account.quality_rating)}`}>
                          {account.quality_rating}
                        </span>
                      </div>
                      <p className="text-xs text-dark-500 mt-1.5">
                        {account.webhook_configured ? (
                          <span className="text-emerald-400">✓ Webhook configurado</span>
                        ) : (
                          <span className="text-amber-400">⚠ Webhook pendente</span>
                        )}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDisconnect(account.id)}
                      className="p-2.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                      title="Desconectar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div className="p-4 bg-dark-900 rounded-xl text-center">
                    <p className="text-2xl font-bold text-white">
                      {account.messages_sent_today}
                    </p>
                    <p className="text-xs text-dark-400 mt-1">Enviadas hoje</p>
                  </div>
                  <div className="p-4 bg-dark-900 rounded-xl text-center">
                    <p className="text-2xl font-bold text-white">
                      {account.messages_received_today}
                    </p>
                    <p className="text-xs text-dark-400 mt-1">Recebidas hoje</p>
                  </div>
                  <div className="p-4 bg-dark-900 rounded-xl text-center">
                    <p className="text-sm font-medium text-white">
                      {account.last_message_at 
                        ? new Date(account.last_message_at).toLocaleString('pt-BR')
                        : '-'
                      }
                    </p>
                    <p className="text-xs text-dark-400 mt-1">Última mensagem</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
