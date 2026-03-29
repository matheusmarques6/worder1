'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Check,
  MessageSquare,
  Phone,
  Clock,
  Zap,
  AlertCircle,
  Loader2,
  Copy,
  CheckCircle,
} from 'lucide-react';
import type { NicheTemplate } from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';

interface WhatsAppChannel {
  id: string;
  phone_number: string;
  display_name: string;
  is_connected: boolean;
}

interface Step4ActivateProps {
  template: NicheTemplate;
  formData: Record<string, string>;
  persona: {
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  };
  faqCount: number;
  storeAnalysis: StoreAnalysis | null;
  organizationId: string;
  onBack: () => void;
  onCreateAgent: (activateNow: boolean, channelIds: string[]) => Promise<void>;
  creating: boolean;
  createdAgentId: string | null;
}

export function Step4Activate({
  template,
  formData,
  persona,
  faqCount,
  storeAnalysis,
  organizationId,
  onBack,
  onCreateAgent,
  creating,
  createdAgentId,
}: Step4ActivateProps) {
  const [activateNow, setActivateNow] = useState(true);
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [copied, setCopied] = useState(false);

  // Buscar canais de WhatsApp
  useEffect(() => {
    fetchChannels();
  }, [organizationId]);

  const fetchChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/whatsapp/numbers?organization_id=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        const connected = (data.numbers || []).filter((n: WhatsAppChannel) => n.is_connected);
        setChannels(connected);
        // NÃO auto-selecionar - usuário deve escolher explicitamente
        // setSelectedChannels(connected.map((c: WhatsAppChannel) => c.id));
      }
    } catch (err) {
      console.error('Error fetching channels:', err);
    } finally {
      setLoadingChannels(false);
    }
  };

  // Validação: precisa selecionar pelo menos 1 canal se ativar agora
  const canCreate = !activateNow || selectedChannels.length > 0;
  const showChannelWarning = activateNow && selectedChannels.length === 0 && channels.length > 0;

  // Toggle channel selection
  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  // Handle create
  const handleCreate = () => {
    onCreateAgent(activateNow, selectedChannels);
  };

  // Tone labels
  const toneLabels = {
    casual: 'Casual',
    friendly: 'Amigável',
    professional: 'Profissional',
    luxury: 'Luxo',
  };

  // Copy agent ID
  const copyAgentId = () => {
    if (createdAgentId) {
      navigator.clipboard.writeText(createdAgentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Success state
  if (createdAgentId) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle className="w-10 h-10 text-green-400" />
        </motion.div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Agente criado com sucesso! 🎉
        </h2>
        <p className="text-gray-500 mb-6">
          {formData.storeName || 'Seu agente'} está {activateNow ? 'ativo e pronto para atender' : 'criado mas inativo'}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg mb-6">
          <span className="text-xs text-gray-500">ID:</span>
          <code className="text-sm text-gray-700">{createdAgentId}</code>
          <button onClick={copyAgentId} className="p-1 hover:bg-gray-100 rounded">
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>

        <div className="flex justify-center gap-3">
          <a
            href={`/agents?edit=${createdAgentId}`}
            className="px-6 py-3 bg-gray-100 hover:bg-zinc-600 text-gray-900 font-medium rounded-lg transition-colors"
          >
            Editar agente
          </a>
          <a
            href="/agents"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-gray-900 font-medium rounded-lg transition-colors"
          >
            Ver todos os agentes
          </a>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Revisar e Ativar
        </h2>
        <p className="text-gray-500">
          Revise as configurações do seu agente antes de criar.
        </p>
      </div>

      {/* Summary */}
      <div className="p-4 bg-gray-50/50 border border-gray-200 rounded-xl space-y-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          {template.icon} Resumo do Agente
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Nome</span>
            <p className="text-gray-900 font-medium">
              {formData.storeName || formData.agentName || 'Assistente'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Nicho</span>
            <p className="text-gray-900 font-medium">{template.name}</p>
          </div>
          <div>
            <span className="text-gray-500">Tom de voz</span>
            <p className="text-gray-900 font-medium">{toneLabels[persona.tone]}</p>
          </div>
          <div>
            <span className="text-gray-500">FAQ</span>
            <p className="text-gray-900 font-medium">{faqCount} perguntas</p>
          </div>
        </div>

        {storeAnalysis && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-500">
                Configurado com dados da loja ({storeAnalysis.products.total} produtos)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Activation Options */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Ativação
        </h3>

        <div className="space-y-2">
          <button
            onClick={() => setActivateNow(true)}
            className={`
              w-full p-4 rounded-lg border text-left transition-all
              ${activateNow
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-200 bg-gray-50/50 hover:border-gray-200'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  activateNow ? 'border-green-500 bg-green-500' : 'border-gray-200'
                }`}
              >
                {activateNow && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="font-medium text-gray-900">Criar e ativar agora</p>
                <p className="text-sm text-gray-500">
                  O agente começará a responder imediatamente
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActivateNow(false)}
            className={`
              w-full p-4 rounded-lg border text-left transition-all
              ${!activateNow
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-200 bg-gray-50/50 hover:border-gray-200'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  !activateNow ? 'border-blue-500 bg-blue-500' : 'border-gray-200'
                }`}
              >
                {!activateNow && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="font-medium text-gray-900">Criar inativo</p>
                <p className="text-sm text-gray-500">
                  Configure mais detalhes antes de ativar
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Channel Selection */}
      {activateNow && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Canais para ativar <span className="text-red-400">*</span>
          </h3>

          {loadingChannels ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando canais...
            </div>
          ) : channels.length > 0 ? (
            <div className="space-y-2">
              {/* Aviso de seleção obrigatória */}
              {showChannelWarning && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-300">
                    Selecione pelo menos um número para o agente responder.
                  </p>
                </div>
              )}
              
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => toggleChannel(channel.id)}
                  className={`
                    w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3
                    ${selectedChannels.includes(channel.id)
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-gray-200 bg-gray-50/50 hover:border-gray-200'
                    }
                  `}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center ${
                      selectedChannels.includes(channel.id)
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-200'
                    }`}
                  >
                    {selectedChannels.includes(channel.id) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <Phone className="w-4 h-4 text-green-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {channel.display_name || channel.phone_number}
                    </p>
                    <p className="text-xs text-gray-500">{channel.phone_number}</p>
                  </div>
                </button>
              ))}
              
              {/* Aviso de segurança */}
              <p className="text-xs text-gray-500 flex items-start gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                O agente só responderá nos números selecionados. Nunca responderá em números não autorizados.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-gray-50/50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 font-medium">
                    Nenhum canal WhatsApp conectado
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Você pode conectar um número depois em Configurações → WhatsApp
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          disabled={creating}
          className="px-6 py-3 bg-gray-100 hover:bg-zinc-600 disabled:bg-gray-50 text-gray-900 font-medium rounded-lg transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || !canCreate}
          className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-gray-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {creating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Criando...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              {activateNow ? 'Criar e Ativar Agente' : 'Criar Agente'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default Step4Activate;
