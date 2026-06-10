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
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: 'var(--green-tint)' }}
        >
          <CheckCircle className="w-10 h-10" style={{ color: 'var(--green)' }} />
        </motion.div>

        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
          Agente criado com sucesso! 🎉
        </h2>
        <p className="mb-6" style={{ color: 'var(--text-3)' }}>
          {formData.storeName || 'Seu agente'} está {activateNow ? 'ativo e pronto para atender' : 'criado mas inativo'}
        </p>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6" style={{ background: 'var(--surface-3)' }}>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>ID:</span>
          <code className="text-sm" style={{ color: 'var(--text-2)' }}>{createdAgentId}</code>
          <button onClick={copyAgentId} className="btn btn-soft btn-icon btn-sm">
            {copied ? (
              <Check className="w-4 h-4" style={{ color: 'var(--green)' }} />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex justify-center gap-3">
          <a
            href={`/agents?edit=${createdAgentId}`}
            className="btn btn-ghost btn-lg"
          >
            Editar agente
          </a>
          <a
            href="/agents"
            className="btn btn-primary btn-lg"
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
      <div className="sec-head">
        <div className="sec-ico">
          <Rocket />
        </div>
        <div>
          <h2 className="sec-t">Revisar e Ativar</h2>
          <p className="sec-s">
            Revise as configurações do seu agente antes de criar.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="card space-y-4" style={{ padding: 16 }}>
        <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          {template.icon} Resumo do Agente
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span style={{ color: 'var(--text-3)' }}>Nome</span>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>
              {formData.storeName || formData.agentName || 'Assistente'}
            </p>
          </div>
          <div>
            <span style={{ color: 'var(--text-3)' }}>Nicho</span>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{template.name}</p>
          </div>
          <div>
            <span style={{ color: 'var(--text-3)' }}>Tom de voz</span>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{toneLabels[persona.tone]}</p>
          </div>
          <div>
            <span style={{ color: 'var(--text-3)' }}>FAQ</span>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{faqCount} perguntas</p>
          </div>
        </div>

        {storeAnalysis && (
          <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4" style={{ color: 'var(--amber)' }} />
              <span style={{ color: 'var(--text-3)' }}>
                Configurado com dados da loja ({storeAnalysis.products.total} produtos)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Activation Options */}
      <div className="space-y-3">
        <h3 className="label uppercase" style={{ marginBottom: 0 }}>
          Ativação
        </h3>

        <div className="space-y-2">
          <button
            onClick={() => setActivateNow(true)}
            className={`selcard ${activateNow ? 'on' : ''}`}
            style={{ width: '100%' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  border: '2px solid',
                  borderColor: activateNow ? 'var(--brand)' : 'var(--border-strong)',
                  background: activateNow ? 'var(--brand)' : 'transparent',
                }}
              >
                {activateNow && <Check className="w-3 h-3" style={{ color: "#fff" }} />}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Criar e ativar agora</p>
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  O agente começará a responder imediatamente
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setActivateNow(false)}
            className={`selcard ${!activateNow ? 'on blue' : ''}`}
            style={{ width: '100%' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  border: '2px solid',
                  borderColor: !activateNow ? 'var(--blue)' : 'var(--border-strong)',
                  background: !activateNow ? 'var(--blue)' : 'transparent',
                }}
              >
                {!activateNow && <Check className="w-3 h-3" style={{ color: "#fff" }} />}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Criar inativo</p>
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
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
          <h3 className="label uppercase" style={{ marginBottom: 0 }}>
            Canais para ativar <span style={{ color: 'var(--red)' }}>*</span>
          </h3>

          {loadingChannels ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando canais...
            </div>
          ) : channels.length > 0 ? (
            <div className="space-y-2">
              {/* Aviso de seleção obrigatória */}
              {showChannelWarning && (
                <div className="callout amber">
                  <AlertCircle className="flex-shrink-0" />
                  <p>
                    Selecione pelo menos um número para o agente responder.
                  </p>
                </div>
              )}

              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => toggleChannel(channel.id)}
                  className={`selcard ${selectedChannels.includes(channel.id) ? 'on' : ''}`}
                  style={{ width: '100%' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center"
                      style={{
                        border: '1px solid',
                        borderColor: selectedChannels.includes(channel.id) ? 'var(--brand)' : 'var(--border-strong)',
                        background: selectedChannels.includes(channel.id) ? 'var(--brand)' : 'transparent',
                      }}
                    >
                      {selectedChannels.includes(channel.id) && (
                        <Check className="w-3 h-3" style={{ color: "#fff" }} />
                      )}
                    </div>
                    <Phone className="w-4 h-4" style={{ color: 'var(--green)' }} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {channel.display_name || channel.phone_number}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{channel.phone_number}</p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Aviso de segurança */}
              <p className="hint flex items-start gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                O agente só responderá nos números selecionados. Nunca responderá em números não autorizados.
              </p>
            </div>
          ) : (
            <div className="callout amber">
              <AlertCircle className="flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  Nenhum canal WhatsApp conectado
                </p>
                <p className="mt-1">
                  Você pode conectar um número depois em Configurações → WhatsApp
                </p>
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
          className="btn btn-ghost btn-lg"
        >
          Voltar
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || !canCreate}
          className="btn btn-primary btn-lg flex-1"
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
