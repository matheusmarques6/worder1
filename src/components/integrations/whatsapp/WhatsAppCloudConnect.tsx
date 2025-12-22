'use client';

// =============================================
// Componente: WhatsApp Cloud Connect
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
  Info
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copiado!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const getQualityColor = (rating: string) => {
    switch (rating) {
      case 'GREEN': return 'text-green-600 bg-green-100';
      case 'YELLOW': return 'text-yellow-600 bg-yellow-100';
      case 'RED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-red-600 bg-red-100';
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
            <MessageSquare className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">WhatsApp Business API</h2>
            <p className="text-sm text-gray-500">API oficial da Meta para WhatsApp</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAccounts}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Atualizar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            + Conectar Número
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Webhook Info Modal */}
      {webhookInfo && (
        <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Configure o Webhook no Meta
            </h3>
            <button
              onClick={() => setWebhookInfo(null)}
              className="text-blue-600 hover:text-blue-800"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-blue-700 font-medium">Callback URL:</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 p-2 bg-white rounded border text-sm">
                  {webhookInfo.url}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookInfo.url)}
                  className="p-2 hover:bg-blue-100 rounded"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-blue-700 font-medium">Verify Token:</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 p-2 bg-white rounded border text-sm font-mono">
                  {webhookInfo.verifyToken}
                </code>
                <button
                  onClick={() => copyToClipboard(webhookInfo.verifyToken)}
                  className="p-2 hover:bg-blue-100 rounded"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm text-blue-700 font-medium">Instruções:</label>
              <ol className="mt-2 space-y-1 text-sm text-blue-800">
                {webhookInfo.instructions.map((instruction, i) => (
                  <li key={i}>{instruction}</li>
                ))}
              </ol>
            </div>

            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
            >
              Abrir Meta for Developers
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* Connection Form */}
      {showForm && (
        <form onSubmit={handleConnect} className="p-6 bg-gray-50 rounded-xl space-y-4">
          <h3 className="font-semibold">Conectar WhatsApp Business API</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WABA ID *
              </label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                WhatsApp Business Account ID
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number ID *
              </label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                ID do número de telefone
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Access Token *
            </label>
            <textarea
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token permanente do sistema"
              className="w-full px-3 py-2 border rounded-lg h-20 font-mono text-sm"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Token de acesso permanente (System User Token)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business ID (opcional)
              </label>
              <input
                type="text"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App ID (opcional)
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="Ex: 123456789012345"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
              Conectar
            </button>
          </div>

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <strong>Como obter as credenciais:</strong>
            <ol className="mt-2 space-y-1 list-decimal list-inside">
              <li>Acesse developers.facebook.com</li>
              <li>Vá para seu App {">"} WhatsApp {">"} API Setup</li>
              <li>Copie o Phone Number ID e WABA ID</li>
              <li>Crie um System User Token com permissões whatsapp_business_messaging</li>
            </ol>
          </div>
        </form>
      )}

      {/* Connected Accounts */}
      <div className="space-y-4">
        <h3 className="font-semibold">Números Conectados</h3>
        
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum número conectado</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-green-600 hover:text-green-700"
            >
              Conectar seu primeiro número
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="p-4 border rounded-xl hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Phone className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{account.verified_name}</h4>
                      <p className="text-sm text-gray-500">{account.display_phone_number}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(account.status)}`}>
                          {account.status}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQualityColor(account.quality_rating)}`}>
                          {account.quality_rating}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {account.webhook_configured ? '✓ Webhook configurado' : '⚠ Webhook pendente'}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDisconnect(account.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Desconectar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-800">
                      {account.messages_sent_today}
                    </p>
                    <p className="text-xs text-gray-500">Enviadas hoje</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-800">
                      {account.messages_received_today}
                    </p>
                    <p className="text-xs text-gray-500">Recebidas hoje</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-800">
                      {account.last_message_at 
                        ? new Date(account.last_message_at).toLocaleString('pt-BR')
                        : '-'
                      }
                    </p>
                    <p className="text-xs text-gray-500">Última mensagem</p>
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
