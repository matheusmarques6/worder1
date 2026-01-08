'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Webhook, 
  Copy, 
  Check, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Loader2,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface WebhookData {
  id: string;
  url: string;
  token: string;
  secret: string;
  name: string;
  status: 'active' | 'paused';
  receivedCount?: number;
  lastReceivedAt?: string;
}

interface WebhookConfigProps {
  automationId?: string;
  nodeId: string;
  organizationId?: string;
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
}

// ============================================
// WEBHOOK CONFIG COMPONENT
// ============================================

export function WebhookConfig({
  automationId,
  nodeId,
  organizationId,
  config,
  onUpdate,
}: WebhookConfigProps) {
  const [webhook, setWebhook] = useState<WebhookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing webhook
  useEffect(() => {
    if (config.webhookId) {
      loadWebhook(config.webhookId);
    }
  }, [config.webhookId]);

  // ============================================
  // HANDLERS
  // ============================================

  const loadWebhook = async (webhookId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations/webhooks?id=${webhookId}`);
      if (res.ok) {
        const data = await res.json();
        setWebhook(data.webhook);
      } else {
        setError('Webhook não encontrado');
      }
    } catch (e) {
      setError('Erro ao carregar webhook');
    } finally {
      setIsLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!automationId) {
      setError('Salve a automação antes de criar o webhook');
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/automations/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId,
          nodeId,
          name: `Webhook - Trigger`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setWebhook(data.webhook);
        onUpdate('webhookId', data.webhook.id);
        onUpdate('webhookUrl', data.webhook.url);
      } else {
        const err = await res.json();
        setError(err.error || 'Erro ao criar webhook');
      }
    } catch (e) {
      setError('Erro de conexão');
    } finally {
      setIsCreating(false);
    }
  };

  const regenerateSecret = async () => {
    if (!webhook) return;
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/automations/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: webhook.id,
          regenerateSecret: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setWebhook(data.webhook);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'url' | 'secret') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  if (!webhook && !config.webhookId) {
    return (
      <div className="space-y-4">
        {/* Create webhook section */}
        <div className="p-4 rounded-xl bg-[#0a0a0a] border border-white/10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/15">
              <Webhook className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-white mb-1">
                Criar Webhook URL
              </h4>
              <p className="text-xs text-white/50 mb-3">
                Gere uma URL única para receber dados externos e disparar esta automação.
              </p>
              
              {error && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/15 border border-red-500/30 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-300">{error}</span>
                </div>
              )}

              <button
                onClick={createWebhook}
                disabled={isCreating || !automationId}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-blue-600 hover:bg-blue-500 text-white text-sm',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Webhook className="w-4 h-4" />
                    Gerar URL
                  </>
                )}
              </button>

              {!automationId && (
                <p className="text-xs text-amber-400 mt-2">
                  ⚠️ Salve a automação primeiro para criar o webhook
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <h5 className="text-xs font-medium text-white/70 mb-2">Como funciona:</h5>
          <ul className="space-y-1 text-xs text-white/50">
            <li>• Receba dados via POST request</li>
            <li>• Suporta JSON e form-data</li>
            <li>• Valida assinatura HMAC opcional</li>
            <li>• Dados disponíveis em variáveis</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Webhook URL */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Webhook URL</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 p-3 rounded-lg bg-[#0a0a0a] border border-white/10 font-mono text-xs text-white/80 overflow-x-auto whitespace-nowrap">
            {webhook?.url || config.webhookUrl}
          </div>
          <button
            onClick={() => copyToClipboard(webhook?.url || config.webhookUrl, 'url')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'hover:bg-white/10 text-white/50 hover:text-white'
            )}
          >
            {copied === 'url' ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Secret */}
      {webhook?.secret && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/60 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Secret (para validação HMAC)
            </label>
            <button
              onClick={regenerateSecret}
              className="text-[10px] text-white/40 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 rounded-lg bg-[#0a0a0a] border border-white/10 font-mono text-xs text-white/80">
              {showSecret ? webhook.secret : '••••••••••••••••••••••••'}
            </div>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => copyToClipboard(webhook.secret, 'secret')}
              className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              {copied === 'secret' ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {webhook && (
        <div className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{webhook.receivedCount || 0}</p>
            <p className="text-[10px] text-white/40">Recebidos</p>
          </div>
          {webhook.lastReceivedAt && (
            <div className="text-center border-l border-white/10 pl-4">
              <p className="text-xs text-white/60">
                {new Date(webhook.lastReceivedAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-[10px] text-white/40">Último recebido</p>
            </div>
          )}
        </div>
      )}

      {/* Usage Instructions */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <h5 className="text-xs font-medium text-white/70 mb-2 flex items-center gap-2">
          <ExternalLink className="w-3 h-3" />
          Exemplo de uso
        </h5>
        <pre className="text-[10px] text-white/50 bg-[#0a0a0a] p-2 rounded overflow-x-auto">
{`curl -X POST "${webhook?.url || '[URL]'}" \\
  -H "Content-Type: application/json" \\
  -d '{"event": "test", "data": {...}}'`}
        </pre>
      </div>

      {/* Variables available */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <h5 className="text-xs font-medium text-white/70 mb-2">Variáveis disponíveis:</h5>
        <div className="space-y-1 font-mono text-[10px]">
          <p className="text-blue-400">{'{{trigger.webhook.payload}}'}</p>
          <p className="text-blue-400">{'{{trigger.webhook.headers}}'}</p>
          <p className="text-blue-400">{'{{trigger.webhook.queryParams}}'}</p>
        </div>
      </div>
    </div>
  );
}

export default WebhookConfig;
