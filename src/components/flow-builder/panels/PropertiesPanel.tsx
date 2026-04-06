'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Copy, Settings, ChevronDown, Sparkles, MessageCircle, ExternalLink, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, useSelectedNode } from '@/stores/flowStore';
import { getNodeDefinition, getNodeColor } from '../nodes/nodeTypes';
import { WebhookConfig } from './WebhookConfig';
import { CredentialSelector } from './CredentialSelector';
import { MessageEditor, VariableButton } from '../variables';
import { WhatsAppTemplateEditor } from '../whatsapp';

// ============================================
// TYPES
// ============================================

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
}

// ============================================
// PROPERTIES PANEL
// ============================================

export function PropertiesPanel({ organizationId, automationId }: { organizationId?: string; automationId?: string }) {
  const selectedNode = useSelectedNode();
  const selectNode = useFlowStore((state) => state.selectNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const removeNode = useFlowStore((state) => state.removeNode);
  const showPanel = useFlowStore((state) => state.showPropertiesPanel);
  const nodes = useFlowStore((state) => state.nodes);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  // Get trigger type from flow nodes
  const triggerType = useMemo(() => {
    const triggerNode = nodes.find(n => n.data?.category === 'trigger');
    return triggerNode?.data?.nodeType || triggerNode?.type || 'trigger_abandon';
  }, [nodes]);

  // Fetch pipelines when needed
  useEffect(() => {
    if (!organizationId) return;
    
    const needsPipelines = selectedNode?.data.nodeType?.includes('deal') || 
                          selectedNode?.data.nodeType?.includes('stage');
    
    if (needsPipelines && pipelines.length === 0) {
      fetchPipelines();
    }
  }, [selectedNode?.data.nodeType, organizationId, pipelines.length]);

  const fetchPipelines = async () => {
    if (!organizationId) return;
    setLoadingPipelines(true);
    try {
      const res = await fetch(`/api/deals?type=pipelines&organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines || []);
      }
    } catch (e) {
      console.error('Error fetching pipelines:', e);
    } finally {
      setLoadingPipelines(false);
    }
  };

  if (!selectedNode || !showPanel) return null;

  const definition = getNodeDefinition(selectedNode.data.nodeType);
  const colors = getNodeColor(definition?.color || 'slate');
  const Icon = definition?.icon || Settings;

  const handleUpdate = (key: string, value: any) => {
    updateNode(selectedNode.id, {
      config: { ...selectedNode.data.config, [key]: value },
    });
  };

  const handleLabelChange = (label: string) => {
    updateNode(selectedNode.id, { label });
  };

  const handleDescriptionChange = (description: string) => {
    updateNode(selectedNode.id, { description });
  };

  const handleDelete = () => {
    if (confirm('Tem certeza que deseja excluir este nó?')) {
      removeNode(selectedNode.id);
    }
  };

  const handleClose = () => {
    selectNode(null);
  };

  const selectedPipeline = pipelines.find(
    (p) => p.id === selectedNode.data.config?.pipelineId
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 320, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-[340px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden"
      >
        {/* Header - Omnisend style */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {selectedNode.data.nodeType === 'action_email' ? 'Edit email' :
               selectedNode.data.nodeType === 'control_delay' ? 'Edit delay' :
               selectedNode.data.nodeType === 'condition_field' ? 'Edit condition' :
               selectedNode.data.nodeType === 'logic_split' ? 'Edit A/B test' :
               definition?.label || 'Configurar'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Basic Info */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Informações Básicas
            </h4>
            
            <div className="space-y-2">
              <label className="text-xs text-gray-600/60">Nome do Nó</label>
              <input
                type="text"
                value={selectedNode.data.label || ''}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder={definition?.label}
                className={cn(
                  'w-full px-3 py-2 rounded-lg',
                  'bg-white border border-gray-200',
                  'text-sm text-gray-700 placeholder-gray-400',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-600/60">Descrição (opcional)</label>
              <textarea
                value={selectedNode.data.description || ''}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Adicionar descrição..."
                rows={2}
                className={cn(
                  'w-full px-3 py-2 rounded-lg resize-none',
                  'bg-white border border-gray-200',
                  'text-sm text-gray-700 placeholder-gray-400',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>
          </section>

          {/* Dynamic Config based on node type */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Configuração
            </h4>

            {/* WEBHOOK TRIGGER */}
            {selectedNode.data.nodeType === 'trigger_webhook' && (
              <WebhookConfig
                automationId={automationId}
                nodeId={selectedNode.id}
                organizationId={organizationId}
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
              />
            )}

            {/* TRIGGER: DATE - Aniversário/Data Especial */}
            {selectedNode.data.nodeType === 'trigger_date' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Campo de Data</label>
                  <SelectField
                    value={selectedNode.data.config?.dateField || 'birth_date'}
                    onChange={(v) => handleUpdate('dateField', v)}
                    options={[
                      { value: 'birth_date', label: 'Aniversário' },
                      { value: 'created_at', label: 'Data de Cadastro' },
                      { value: 'custom_date', label: 'Campo Personalizado' },
                    ]}
                  />
                </div>

                {selectedNode.data.config?.dateField === 'custom_date' && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Nome do Campo</label>
                    <input
                      type="text"
                      value={selectedNode.data.config?.customFieldName || ''}
                      onChange={(e) => handleUpdate('customFieldName', e.target.value)}
                      placeholder="Ex: data_renovacao"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700 placeholder-gray-400',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Quando Disparar?</label>
                  <SelectField
                    value={selectedNode.data.config?.timing || 'on_date'}
                    onChange={(v) => handleUpdate('timing', v)}
                    options={[
                      { value: '7_days_before', label: '7 dias antes' },
                      { value: '3_days_before', label: '3 dias antes' },
                      { value: '1_day_before', label: '1 dia antes' },
                      { value: 'on_date', label: 'No dia' },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Horário de Disparo</label>
                  <input
                    type="time"
                    value={selectedNode.data.config?.triggerTime || '09:00'}
                    onChange={(e) => handleUpdate('triggerTime', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700',
                      'focus:outline-none focus:border-blue-500/50',
                      '[color-scheme:light]'
                    )}
                  />
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-[11px] text-emerald-700">
                    Ideal para campanhas de aniversário, renovações, etc.
                  </p>
                </div>
              </>
            )}

            {/* TRIGGER: WHATSAPP RECEIVED */}
            {selectedNode.data.nodeType === 'trigger_whatsapp' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Tipo de Mensagem</label>
                  <SelectField
                    value={selectedNode.data.config?.messageType || 'any'}
                    onChange={(v) => handleUpdate('messageType', v)}
                    options={[
                      { value: 'any', label: 'Qualquer mensagem' },
                      { value: 'text', label: 'Apenas texto' },
                      { value: 'image', label: 'Apenas imagens' },
                      { value: 'audio', label: 'Apenas áudios' },
                      { value: 'document', label: 'Apenas documentos' },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Contém Palavra-chave (opcional)</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.keyword || ''}
                    onChange={(e) => handleUpdate('keyword', e.target.value)}
                    placeholder="Ex: comprar, ajuda, suporte..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                  <p className="text-[10px] text-gray-400">
                    Deixe vazio para disparar em qualquer mensagem
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.config?.onlyFirstMessage || false}
                      onChange={(e) => handleUpdate('onlyFirstMessage', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 bg-transparent text-green-500"
                    />
                    <span className="text-xs text-gray-600/60">
                      Apenas primeira mensagem (novo contato)
                    </span>
                  </label>
                </div>

                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-[11px] text-green-700">
                    Dispara quando uma mensagem WhatsApp é recebida
                  </p>
                </div>
              </>
            )}

            {/* TRIGGER: CART ABANDONED */}
            {selectedNode.data.nodeType === 'trigger_abandon' && (
              <AbandonedCartConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                organizationId={organizationId}
              />
            )}

            {/* TRIGGER: ORDER CREATED */}
            {selectedNode.data.nodeType === 'trigger_order' && (
              <OrderTriggerConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                organizationId={organizationId}
                label="Pedido Criado"
              />
            )}

            {/* TRIGGER: ORDER PAID */}
            {selectedNode.data.nodeType === 'trigger_order_paid' && (
              <OrderTriggerConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                organizationId={organizationId}
                label="Pedido Pago"
              />
            )}

            {/* TRIGGER: DEAL STAGE CHANGED */}
            {selectedNode.data.nodeType === 'trigger_deal_stage' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Pipeline</label>
                  <SelectField
                    value={selectedNode.data.config?.pipelineId || ''}
                    onChange={(v) => {
                      handleUpdate('pipelineId', v);
                      handleUpdate('fromStageId', '');
                      handleUpdate('stageId', '');
                    }}
                    options={[
                      { value: '', label: 'Selecione o pipeline...' },
                      ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    loading={loadingPipelines}
                  />
                </div>
                
                {selectedPipeline && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-600/60">De qual estágio? (opcional)</label>
                      <SelectField
                        value={selectedNode.data.config?.fromStageId || ''}
                        onChange={(v) => handleUpdate('fromStageId', v)}
                        options={[
                          { value: '', label: 'Qualquer estágio' },
                          ...selectedPipeline.stages.map((s) => ({ 
                            value: s.id, 
                            label: s.name 
                          })),
                        ]}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs text-gray-600/60">Para qual estágio?</label>
                      <SelectField
                        value={selectedNode.data.config?.stageId || ''}
                        onChange={(v) => handleUpdate('stageId', v)}
                        options={[
                          { value: '', label: 'Qualquer estágio' },
                          ...selectedPipeline.stages.map((s) => ({ 
                            value: s.id, 
                            label: s.name 
                          })),
                        ]}
                      />
                    </div>
                  </>
                )}
                
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-[11px] text-blue-700">
                    Exemplo: Dispara quando deal mover de "Qualificação" para "Proposta"
                  </p>
                </div>
              </>
            )}

            {/* TAG NODES */}
            {(selectedNode.data.nodeType === 'trigger_tag' || 
              selectedNode.data.nodeType === 'action_tag' ||
              selectedNode.data.nodeType === 'action_remove_tag' ||
              selectedNode.data.nodeType === 'condition_has_tag') && (
              <div className="space-y-2">
                <label className="text-xs text-gray-600/60">Nome da Tag</label>
                <input
                  type="text"
                  value={selectedNode.data.config?.tagName || ''}
                  onChange={(e) => handleUpdate('tagName', e.target.value)}
                  placeholder="Ex: cliente-vip"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg',
                    'bg-white border border-gray-200',
                    'text-sm text-gray-700 placeholder-gray-400',
                    'focus:outline-none focus:border-blue-500/50'
                  )}
                />
              </div>
            )}

            {/* TRIGGER: DEAL CREATED - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_created' && (
              <div className="space-y-2">
                <label className="text-xs text-gray-600/60">Pipeline (opcional)</label>
                <SelectField
                  value={selectedNode.data.config?.pipelineId || ''}
                  onChange={(v) => handleUpdate('pipelineId', v)}
                  options={[
                    { value: '', label: 'Qualquer pipeline' },
                    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  loading={loadingPipelines}
                />
                <p className="text-[10px] text-gray-400">
                  Deixe vazio para disparar em qualquer pipeline
                </p>
              </div>
            )}

            {/* TRIGGER: DEAL WON - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_won' && (
              <div className="space-y-2">
                <label className="text-xs text-gray-600/60">Pipeline (opcional)</label>
                <SelectField
                  value={selectedNode.data.config?.pipelineId || ''}
                  onChange={(v) => handleUpdate('pipelineId', v)}
                  options={[
                    { value: '', label: 'Qualquer pipeline' },
                    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  loading={loadingPipelines}
                />
                <p className="text-[10px] text-gray-400">
                  Filtre por pipeline específico ou deixe vazio para todos
                </p>
              </div>
            )}

            {/* TRIGGER: DEAL LOST - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_lost' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Pipeline (opcional)</label>
                  <SelectField
                    value={selectedNode.data.config?.pipelineId || ''}
                    onChange={(v) => handleUpdate('pipelineId', v)}
                    options={[
                      { value: '', label: 'Qualquer pipeline' },
                      ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    loading={loadingPipelines}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Motivo da Perda (opcional)</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.lostReason || ''}
                    onChange={(e) => handleUpdate('lostReason', e.target.value)}
                    placeholder="Ex: preço, concorrente..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
              </>
            )}

            {/* ============================== */}
            {/* GENERIC TRIGGER INFO          */}
            {/* For triggers without specific config */}
            {/* ============================== */}
            {selectedNode.data.category === 'trigger' && ![
              'trigger_webhook', 'trigger_date', 'trigger_whatsapp', 'trigger_abandon',
              'trigger_order', 'trigger_order_paid', 'trigger_deal_stage', 'trigger_deal_created',
              'trigger_deal_won', 'trigger_deal_lost', 'trigger_tag',
            ].includes(selectedNode.data.nodeType) && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs text-gray-600">
                  {selectedNode.data.nodeType === 'trigger_signup' && 'Dispara quando um novo contato e criado no sistema.'}
                  {selectedNode.data.nodeType === 'trigger_segment' && 'Dispara quando um contato entra em um segmento dinamico.'}
                  {selectedNode.data.nodeType === 'trigger_viewed_product' && 'Dispara quando um contato visualiza um produto na loja.'}
                  {selectedNode.data.nodeType === 'trigger_added_to_cart' && 'Dispara quando um produto e adicionado ao carrinho.'}
                  {selectedNode.data.nodeType === 'trigger_checkout_abandoned' && 'Dispara quando um checkout e abandonado (sem conclusao).'}
                  {selectedNode.data.nodeType === 'trigger_fulfilled_order' && 'Dispara quando um pedido e marcado como enviado/entregue.'}
                  {selectedNode.data.nodeType === 'trigger_cancelled_order' && 'Dispara quando um pedido e cancelado.'}
                  {selectedNode.data.nodeType === 'trigger_form_submitted' && 'Dispara quando um formulario e enviado.'}
                  {selectedNode.data.nodeType === 'trigger_custom_event' && 'Dispara quando um evento personalizado e recebido via API.'}
                </p>
              </div>
            )}

            {/* ============================== */}
            {/* UNIVERSAL TRIGGER CONFIG       */}
            {/* Shown for ALL trigger nodes    */}
            {/* ============================== */}
            {selectedNode.data.category === 'trigger' && (
              <TriggerFiltersConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                triggerType={selectedNode.data.nodeType || ''}
              />
            )}

            {/* ACTION: UPDATE CONTACT */}
            {selectedNode.data.nodeType === 'action_update' && (
              <ContactFieldsEditor
                fields={selectedNode.data.config?.fields || {}}
                onFieldsChange={(fields) => handleUpdate('fields', fields)}
              />
            )}

            {/* DELAY NODES */}
            {(selectedNode.data.nodeType === 'control_delay' ||
              selectedNode.data.nodeType === 'logic_delay') && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Duração</label>
                    <input
                      type="number"
                      min="1"
                      value={selectedNode.data.config?.value || 1}
                      onChange={(e) => handleUpdate('value', parseInt(e.target.value) || 1)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Unidade</label>
                    <SelectField
                      value={selectedNode.data.config?.unit || 'hours'}
                      onChange={(v) => handleUpdate('unit', v)}
                      options={[
                        { value: 'minutes', label: 'Minutos' },
                        { value: 'hours', label: 'Horas' },
                        { value: 'days', label: 'Dias' },
                        { value: 'weeks', label: 'Semanas' },
                      ]}
                    />
                  </div>
                </div>

                {/* Day restrictions */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.config?.restrictDays || false}
                      onChange={(e) => handleUpdate('restrictDays', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500"
                    />
                    <span className="text-xs text-gray-600">Enviar apenas em dias específicos</span>
                  </label>
                  {selectedNode.data.config?.restrictDays && (
                    <div className="flex gap-1 flex-wrap">
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, i) => {
                        const days = selectedNode.data.config?.allowedDays || [0,1,2,3,4];
                        const isSelected = days.includes(i);
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              const newDays = isSelected
                                ? days.filter((d: number) => d !== i)
                                : [...days, i].sort();
                              handleUpdate('allowedDays', newDays);
                            }}
                            className={cn(
                              'px-2 py-1 rounded text-xs font-medium border transition-colors',
                              isSelected
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-gray-200 text-gray-400'
                            )}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Time window */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNode.data.config?.restrictTime || false}
                      onChange={(e) => handleUpdate('restrictTime', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500"
                    />
                    <span className="text-xs text-gray-600">Enviar dentro de horário específico</span>
                  </label>
                  {selectedNode.data.config?.restrictTime && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={selectedNode.data.config?.timeFrom || '09:00'}
                        onChange={(e) => handleUpdate('timeFrom', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500/50 [color-scheme:light]"
                      />
                      <span className="text-xs text-gray-500">até</span>
                      <input
                        type="time"
                        value={selectedNode.data.config?.timeTo || '21:00'}
                        onChange={(e) => handleUpdate('timeTo', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500/50 [color-scheme:light]"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DELAY UNTIL - Wait until specific date/time */}
            {selectedNode.data.nodeType === 'control_delay_until' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Tipo de Espera</label>
                  <SelectField
                    value={selectedNode.data.config?.waitType || 'datetime'}
                    onChange={(v) => handleUpdate('waitType', v)}
                    options={[
                      { value: 'datetime', label: 'Data e Hora Específica' },
                      { value: 'time', label: 'Horário do Dia' },
                    ]}
                  />
                </div>

                {selectedNode.data.config?.waitType === 'time' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Horário</label>
                    <input
                      type="time"
                      value={selectedNode.data.config?.time || '09:00'}
                      onChange={(e) => handleUpdate('time', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                    <p className="text-[10px] text-gray-400">
                      Se o horário já passou hoje, aguardará até amanhã
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Data e Hora</label>
                    <input
                      type="datetime-local"
                      value={selectedNode.data.config?.datetime || ''}
                      onChange={(e) => handleUpdate('datetime', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700',
                        'focus:outline-none focus:border-blue-500/50',
                        '[color-scheme:light]'
                      )}
                    />
                  </div>
                )}

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-[11px] text-purple-700">
                    A automação pausará neste ponto até a data/hora especificada
                  </p>
                </div>
              </>
            )}

            {/* EMAIL ACTION */}
            {selectedNode.data.nodeType === 'action_email' && (
              <EmailActionConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                triggerType={triggerType}
              />
            )}

            {/* WHATSAPP ACTION */}
            {selectedNode.data.nodeType === 'action_whatsapp' && (
              <WhatsAppActionConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                triggerType={triggerType}
              />
            )}

            {/* DEAL NODES */}
            {(selectedNode.data.nodeType === 'action_create_deal' ||
              selectedNode.data.nodeType === 'action_move_deal' ||
              selectedNode.data.nodeType === 'trigger_deal_stage') && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Pipeline</label>
                  <SelectField
                    value={selectedNode.data.config?.pipelineId || ''}
                    onChange={(v) => handleUpdate('pipelineId', v)}
                    options={[
                      { value: '', label: 'Selecione...' },
                      ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    loading={loadingPipelines}
                  />
                </div>
                
                {selectedPipeline && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Estágio</label>
                    <SelectField
                      value={selectedNode.data.config?.stageId || ''}
                      onChange={(v) => handleUpdate('stageId', v)}
                      options={[
                        { value: '', label: 'Selecione...' },
                        ...selectedPipeline.stages.map((s) => ({ 
                          value: s.id, 
                          label: s.name 
                        })),
                      ]}
                    />
                  </div>
                )}

                {selectedNode.data.nodeType === 'action_create_deal' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-600/60">Título do Deal</label>
                      <input
                        type="text"
                        value={selectedNode.data.config?.title || ''}
                        onChange={(e) => handleUpdate('title', e.target.value)}
                        placeholder="Ex: Venda - {{contact.name}}"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-white border border-gray-200',
                          'text-sm text-gray-700 placeholder-gray-400',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-gray-600/60">Valor</label>
                      <input
                        type="number"
                        value={selectedNode.data.config?.value || 0}
                        onChange={(e) => handleUpdate('value', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-white border border-gray-200',
                          'text-sm text-gray-700 placeholder-gray-400',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* CONDITION NODES */}
            {selectedNode.data.nodeType === 'condition_field' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Nome da Condição</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.conditionName || ''}
                    onChange={(e) => handleUpdate('conditionName', e.target.value)}
                    placeholder="Ex: Valor do carrinho alto?"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Tipo</label>
                  <SelectField
                    value={selectedNode.data.config?.conditionType || 'contact'}
                    onChange={(v) => handleUpdate('conditionType', v)}
                    options={[
                      { value: 'contact', label: 'Perfil do Contato' },
                      { value: 'event', label: 'Dados do Evento' },
                      { value: 'message', label: 'Comportamento de Mensagem' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Campo</label>
                  <SelectField
                    value={selectedNode.data.config?.field || ''}
                    onChange={(v) => handleUpdate('field', v)}
                    options={selectedNode.data.config?.conditionType === 'event' ? [
                      { value: '', label: 'Selecione...' },
                      { value: 'event.cart_value', label: 'Valor do Carrinho' },
                      { value: 'event.order_value', label: 'Valor do Pedido' },
                      { value: 'event.item_count', label: 'Qtd. de Itens' },
                      { value: 'event.product_name', label: 'Nome do Produto' },
                      { value: 'event.product_category', label: 'Categoria do Produto' },
                      { value: 'event.discount_code', label: 'Código de Desconto' },
                      { value: 'event.payment_method', label: 'Método de Pagamento' },
                      { value: 'event.currency', label: 'Moeda' },
                    ] : [
                      { value: '', label: 'Selecione...' },
                      { value: 'contact.email', label: 'Email' },
                      { value: 'contact.phone', label: 'Telefone' },
                      { value: 'contact.first_name', label: 'Nome' },
                      { value: 'contact.last_name', label: 'Sobrenome' },
                      { value: 'contact.city', label: 'Cidade' },
                      { value: 'contact.state', label: 'Estado' },
                      { value: 'contact.country', label: 'País' },
                      { value: 'contact.tags', label: 'Tags' },
                      { value: 'contact.lifecycle_stage', label: 'Estágio do Ciclo de Vida' },
                      { value: 'contact.total_orders', label: 'Total de Pedidos' },
                      { value: 'contact.total_spent', label: 'Total Gasto' },
                      { value: 'contact.aov', label: 'Ticket Médio' },
                      { value: 'contact.last_order_at', label: 'Data Último Pedido' },
                      { value: 'contact.created_at', label: 'Data de Cadastro' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Operador</label>
                  <SelectField
                    value={selectedNode.data.config?.operator || 'equals'}
                    onChange={(v) => handleUpdate('operator', v)}
                    options={[
                      { value: 'equals', label: 'Igual a' },
                      { value: 'not_equals', label: 'Diferente de' },
                      { value: 'greater_than', label: 'Maior que' },
                      { value: 'less_than', label: 'Menor que' },
                      { value: 'greater_or_equal', label: 'Maior ou igual a' },
                      { value: 'less_or_equal', label: 'Menor ou igual a' },
                      { value: 'contains', label: 'Contém' },
                      { value: 'not_contains', label: 'Não contém' },
                      { value: 'starts_with', label: 'Começa com' },
                      { value: 'ends_with', label: 'Termina com' },
                      { value: 'is_set', label: 'Está definido' },
                      { value: 'is_not_set', label: 'Não está definido' },
                      { value: 'in_list', label: 'Está na lista' },
                      { value: 'not_in_list', label: 'Não está na lista' },
                      { value: 'before_date', label: 'Antes de' },
                      { value: 'after_date', label: 'Depois de' },
                      { value: 'in_last_x_days', label: 'Nos últimos X dias' },
                      { value: 'not_in_last_x_days', label: 'Fora dos últimos X dias' },
                      { value: 'between', label: 'Entre' },
                      { value: 'regex', label: 'Regex' },
                    ]}
                  />
                </div>
                {!['is_set', 'is_not_set'].includes(selectedNode.data.config?.operator || '') && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Valor</label>
                    <input
                      type="text"
                      value={selectedNode.data.config?.value || ''}
                      onChange={(e) => handleUpdate('value', e.target.value)}
                      placeholder="Valor para comparar"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700 placeholder-gray-400',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>
                )}
                {selectedNode.data.config?.operator === 'between' && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600/60">Valor Máximo</label>
                    <input
                      type="text"
                      value={selectedNode.data.config?.valueTo || ''}
                      onChange={(e) => handleUpdate('valueTo', e.target.value)}
                      placeholder="Valor máximo"
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-white border border-gray-200',
                        'text-sm text-gray-700 placeholder-gray-400',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Conector Lógico</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate('logicConnector', 'and')}
                      className={cn(
                        'flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        (selectedNode.data.config?.logicConnector || 'and') === 'and'
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      E (AND)
                    </button>
                    <button
                      onClick={() => handleUpdate('logicConnector', 'or')}
                      className={cn(
                        'flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        selectedNode.data.config?.logicConnector === 'or'
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      OU (OR)
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* CONDITION: ORDER VALUE */}
            {selectedNode.data.nodeType === 'condition_order_value' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Operador</label>
                  <SelectField
                    value={selectedNode.data.config?.operator || 'greater_than'}
                    onChange={(v) => handleUpdate('operator', v)}
                    options={[
                      { value: 'greater_than', label: 'Maior que' },
                      { value: 'greater_or_equal', label: 'Maior ou igual a' },
                      { value: 'less_than', label: 'Menor que' },
                      { value: 'less_or_equal', label: 'Menor ou igual a' },
                      { value: 'equals', label: 'Igual a' },
                      { value: 'not_equals', label: 'Diferente de' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => handleUpdate('value', e.target.value)}
                    placeholder="Ex: 100.00"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[11px] text-amber-700">
                    Exemplo: "Maior que R$ 100" vai seguir o caminho "Sim" se o pedido for acima de R$ 100
                  </p>
                </div>
              </>
            )}

            {/* CONDITION: DEAL VALUE */}
            {selectedNode.data.nodeType === 'condition_deal_value' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Operador</label>
                  <SelectField
                    value={selectedNode.data.config?.operator || 'greater_than'}
                    onChange={(v) => handleUpdate('operator', v)}
                    options={[
                      { value: 'greater_than', label: 'Maior que' },
                      { value: 'greater_or_equal', label: 'Maior ou igual a' },
                      { value: 'less_than', label: 'Menor que' },
                      { value: 'less_or_equal', label: 'Menor ou igual a' },
                      { value: 'equals', label: 'Igual a' },
                      { value: 'not_equals', label: 'Diferente de' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => handleUpdate('value', e.target.value)}
                    placeholder="Ex: 5000.00"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[11px] text-amber-700">
                    Exemplo: "Maior que R$ 5.000" vai seguir o caminho "Sim" se o deal for acima desse valor
                  </p>
                </div>
              </>
            )}

            {/* LOGIC FILTER - Advanced Conditions */}
            {selectedNode.data.nodeType === 'logic_filter' && (
              <FilterConditionsEditor
                conditions={selectedNode.data.config?.conditions || []}
                logicOperator={selectedNode.data.config?.logicOperator || 'and'}
                onConditionsChange={(conditions) => handleUpdate('conditions', conditions)}
                onLogicOperatorChange={(op) => handleUpdate('logicOperator', op)}
              />
            )}

            {/* A/B SPLIT */}
            {selectedNode.data.nodeType === 'logic_split' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Proporção</label>
                  <input
                    type="range"
                    min="5"
                    max="95"
                    step="5"
                    value={selectedNode.data.config?.percentageA || 50}
                    onChange={(e) => handleUpdate('percentageA', parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-blue-600">A: {selectedNode.data.config?.percentageA || 50}%</span>
                    <span className="text-xs font-medium text-orange-600">B: {100 - (selectedNode.data.config?.percentageA || 50)}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Nome do Caminho A</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.labelA || ''}
                    onChange={(e) => handleUpdate('labelA', e.target.value)}
                    placeholder="Ex: Com Desconto"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Nome do Caminho B</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.labelB || ''}
                    onChange={(e) => handleUpdate('labelB', e.target.value)}
                    placeholder="Ex: Sem Desconto"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate('percentageA', 100)}
                    className="flex-1 py-2 text-xs font-medium rounded-md bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    A como vencedor (100%)
                  </button>
                  <button
                    onClick={() => handleUpdate('percentageA', 0)}
                    className="flex-1 py-2 text-xs font-medium rounded-md bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors"
                  >
                    B como vencedor (100%)
                  </button>
                </div>
              </div>
            )}

            {/* WEBHOOK ACTION */}
            {selectedNode.data.nodeType === 'action_webhook' && (
              <>
                <CredentialSelector
                  connectionType="http"
                  value={selectedNode.data.config?.credentialId}
                  onChange={(id) => handleUpdate('credentialId', id)}
                  label="Autenticação (opcional)"
                />
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">URL</label>
                  <input
                    type="url"
                    value={selectedNode.data.config?.url || ''}
                    onChange={(e) => handleUpdate('url', e.target.value)}
                    placeholder="https://..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-white border border-gray-200',
                      'text-sm text-gray-700 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Método</label>
                  <SelectField
                    value={selectedNode.data.config?.method || 'POST'}
                    onChange={(v) => handleUpdate('method', v)}
                    options={[
                      { value: 'GET', label: 'GET' },
                      { value: 'POST', label: 'POST' },
                      { value: 'PUT', label: 'PUT' },
                      { value: 'PATCH', label: 'PATCH' },
                      { value: 'DELETE', label: 'DELETE' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Headers (JSON)</label>
                  <textarea
                    value={selectedNode.data.config?.headers || '{}'}
                    onChange={(e) => handleUpdate('headers', e.target.value)}
                    placeholder='{"Content-Type": "application/json"}'
                    rows={2}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none font-mono text-xs',
                      'bg-white border border-gray-200',
                      'text-gray-900 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-600/60">Body (JSON)</label>
                  <textarea
                    value={selectedNode.data.config?.body || ''}
                    onChange={(e) => handleUpdate('body', e.target.value)}
                    placeholder='{"contact": "{{contact.email}}"}'
                    rows={4}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none font-mono text-xs',
                      'bg-white border border-gray-200',
                      'text-gray-900 placeholder-gray-400',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
              </>
            )}

            {/* NOTIFY ACTION */}
            {selectedNode.data.nodeType === 'action_notify' && (
              <NotifyActionConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                organizationId={organizationId}
              />
            )}

            {/* SMS ACTION */}
            {selectedNode.data.nodeType === 'action_sms' && (
              <>
                <CredentialSelector
                  connectionType="sms"
                  value={selectedNode.data.config?.credentialId}
                  onChange={(id) => handleUpdate('credentialId', id)}
                  label="Provedor SMS (Twilio)"
                />
                <MessageEditor
                  value={selectedNode.data.config?.message || ''}
                  onChange={(v) => handleUpdate('message', v)}
                  triggerType={triggerType}
                  label="Mensagem SMS"
                  placeholder="Olá {{ contact.first_name }}! Não esqueça do seu carrinho: {{ event.cart_url }}"
                  rows={3}
                  maxLength={320}
                />
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">
                    {(selectedNode.data.config?.message || '').length}/320 caracteres
                  </span>
                  <span className="text-gray-400">
                    ~{Math.ceil((selectedNode.data.config?.message || '').length / 160)} segmento(s)
                  </span>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-[11px] text-purple-700">
                    SMS será enviado para o telefone do contato
                  </p>
                </div>
              </>
            )}

            {/* LIST ACTIONS */}
            {(selectedNode.data.nodeType === 'action_add_to_list' ||
              selectedNode.data.nodeType === 'action_remove_from_list') && (
              <ListActionConfig
                config={selectedNode.data.config || {}}
                onUpdate={handleUpdate}
                organizationId={organizationId}
                isRemove={selectedNode.data.nodeType === 'action_remove_from_list'}
              />
            )}
          </section>

          {/* Variables hint */}
          <section className="p-3 bg-brand-50 border border-primary-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-[11px] text-brand-500 font-medium">
                  Personalização com Variáveis
                </p>
                <p className="text-[10px] text-brand-500/70">
                  Clique em <span className="bg-brand-100 px-1 rounded">Personalizar</span> para inserir dados dinâmicos como nome do contato, dados do pedido, etc.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(selectedNode.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg',
              'bg-gray-50 hover:bg-gray-100',
              'text-sm text-gray-500 hover:text-gray-700',
              'transition-colors'
            )}
          >
            <Copy className="w-4 h-4" />
            Copiar ID
          </button>
          <button
            onClick={handleDelete}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg',
              'bg-red-500/10 hover:bg-red-500/20',
              'text-sm text-red-400 hover:text-red-300',
              'transition-colors'
            )}
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// SELECT FIELD COMPONENT
// ============================================

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  loading?: boolean;
}

function SelectField({ value, onChange, options, loading }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className={cn(
          'w-full px-3 py-2 rounded-lg appearance-none',
          'bg-white border border-gray-200',
          'text-sm text-gray-700',
          'focus:outline-none focus:border-blue-500/50',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ============================================
// CONTACT FIELDS EDITOR
// ============================================

interface ContactFieldsEditorProps {
  fields: Record<string, any>;
  onFieldsChange: (fields: Record<string, any>) => void;
}

const CONTACT_FIELDS = [
  { key: 'first_name', label: 'Nome', type: 'text' },
  { key: 'last_name', label: 'Sobrenome', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Telefone', type: 'text' },
  { key: 'notes', label: 'Notas', type: 'textarea' },
];

function ContactFieldsEditor({ fields, onFieldsChange }: ContactFieldsEditorProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>(Object.keys(fields));

  const handleFieldToggle = (key: string) => {
    const newSelectedFields = selectedFields.includes(key)
      ? selectedFields.filter(f => f !== key)
      : [...selectedFields, key];
    
    setSelectedFields(newSelectedFields);
    
    // Remove field if unchecked
    if (!newSelectedFields.includes(key)) {
      const newFields = { ...fields };
      delete newFields[key];
      onFieldsChange(newFields);
    }
  };

  const handleFieldValueChange = (key: string, value: string) => {
    onFieldsChange({ ...fields, [key]: value });
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">
        Selecione os campos que deseja atualizar:
      </p>
      
      {CONTACT_FIELDS.map((field) => (
        <div key={field.key} className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFields.includes(field.key)}
              onChange={() => handleFieldToggle(field.key)}
              className="w-4 h-4 rounded border-gray-300 bg-transparent text-blue-500 focus:ring-blue-500/30"
            />
            <span className="text-xs text-gray-600/60">{field.label}</span>
          </label>
          
          {selectedFields.includes(field.key) && (
            field.type === 'textarea' ? (
              <textarea
                value={fields[field.key] || ''}
                onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                placeholder={`Novo valor para ${field.label}`}
                rows={2}
                className={cn(
                  'w-full px-3 py-2 rounded-lg resize-none',
                  'bg-white border border-gray-200',
                  'text-sm text-gray-700 placeholder-gray-400',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            ) : (
              <input
                type={field.type}
                value={fields[field.key] || ''}
                onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                placeholder={`Novo valor para ${field.label}`}
                className={cn(
                  'w-full px-3 py-2 rounded-lg',
                  'bg-white border border-gray-200',
                  'text-sm text-gray-700 placeholder-gray-400',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            )
          )}
        </div>
      ))}
      
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-[11px] text-blue-700">
          Use variáveis: <code className="bg-blue-100 px-1 rounded">{'{{trigger.new_name}}'}</code>
        </p>
      </div>
    </div>
  );
}

// ============================================
// FILTER CONDITIONS EDITOR
// ============================================

interface FilterCondition {
  field: string;
  operator: string;
  value: string;
}

interface FilterConditionsEditorProps {
  conditions: FilterCondition[];
  logicOperator: 'and' | 'or';
  onConditionsChange: (conditions: FilterCondition[]) => void;
  onLogicOperatorChange: (op: 'and' | 'or') => void;
}

const FILTER_FIELDS = [
  { value: 'contact.email', label: 'Email' },
  { value: 'contact.phone', label: 'Telefone' },
  { value: 'contact.first_name', label: 'Nome' },
  { value: 'contact.last_name', label: 'Sobrenome' },
  { value: 'contact.tags', label: 'Tags' },
  { value: 'contact.total_orders', label: 'Total de Pedidos' },
  { value: 'contact.total_spent', label: 'Total Gasto' },
  { value: 'deal.value', label: 'Valor do Deal' },
  { value: 'deal.stage_name', label: 'Estágio do Deal' },
  { value: 'order.total_price', label: 'Valor do Pedido' },
  { value: 'trigger.data', label: 'Dado do Trigger' },
];

const FILTER_OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'is_empty', label: 'Está vazio' },
  { value: 'is_not_empty', label: 'Não está vazio' },
];

function FilterConditionsEditor({ 
  conditions, 
  logicOperator, 
  onConditionsChange, 
  onLogicOperatorChange 
}: FilterConditionsEditorProps) {
  
  const addCondition = () => {
    onConditionsChange([
      ...conditions,
      { field: '', operator: 'equals', value: '' }
    ]);
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = conditions.map((c, i) => 
      i === index ? { ...c, ...updates } : c
    );
    onConditionsChange(newConditions);
  };

  const removeCondition = (index: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Logic Operator */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600/60">Combinar condições com:</span>
        <div className="flex gap-1">
          <button
            onClick={() => onLogicOperatorChange('and')}
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              logicOperator === 'and'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            )}
          >
            E (AND)
          </button>
          <button
            onClick={() => onLogicOperatorChange('or')}
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              logicOperator === 'or'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            )}
          >
            OU (OR)
          </button>
        </div>
      </div>

      {/* Conditions List */}
      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div key={index} className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 uppercase">
                Condição {index + 1}
              </span>
              <button
                onClick={() => removeCondition(index)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remover
              </button>
            </div>
            
            <select
              value={condition.field}
              onChange={(e) => updateCondition(index, { field: e.target.value })}
              className={cn(
                'w-full px-2 py-1.5 rounded text-xs',
                'bg-white border border-gray-200 text-gray-900'
              )}
            >
              <option value="">Selecione o campo...</option>
              {FILTER_FIELDS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            
            <select
              value={condition.operator}
              onChange={(e) => updateCondition(index, { operator: e.target.value })}
              className={cn(
                'w-full px-2 py-1.5 rounded text-xs',
                'bg-white border border-gray-200 text-gray-900'
              )}
            >
              {FILTER_OPERATORS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            
            {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
              <input
                type="text"
                value={condition.value}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder="Valor"
                className={cn(
                  'w-full px-2 py-1.5 rounded text-xs',
                  'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add Button */}
      <button
        onClick={addCondition}
        className={cn(
          'w-full py-2 rounded-lg text-xs',
          'border border-dashed border-gray-300',
          'text-gray-500 hover:text-gray-900 hover:border-gray-400',
          'transition-colors'
        )}
      >
        + Adicionar Condição
      </button>

      {conditions.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[11px] text-amber-700">
            Adicione pelo menos uma condição para o filtro funcionar
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// ORDER TRIGGER CONFIG
// ============================================

interface OrderTriggerConfigProps {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  organizationId?: string;
  label: string;
}

function OrderTriggerConfig({ config, onUpdate, organizationId, label }: OrderTriggerConfigProps) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  useEffect(() => {
    if (organizationId) {
      fetchStores();
    }
  }, [organizationId]);

  const fetchStores = async () => {
    if (!organizationId) return;
    setLoadingStores(true);
    try {
      const res = await fetch(`/api/stores?organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
      }
    } catch (e) {
      console.error('Error fetching stores:', e);
    } finally {
      setLoadingStores(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Store Filter */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Loja (opcional)</label>
        <div className="relative">
          <select
            value={config.storeId || ''}
            onChange={(e) => onUpdate('storeId', e.target.value)}
            disabled={loadingStores}
            className={cn(
              'w-full px-3 py-2 rounded-lg appearance-none',
              'bg-white border border-gray-200',
              'text-sm text-gray-700',
              'focus:outline-none focus:border-blue-500/50',
              'disabled:opacity-50'
            )}
          >
            <option value="">Todas as lojas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <p className="text-[10px] text-gray-400">
          Filtre por loja específica ou deixe vazio para todas
        </p>
      </div>

      {/* Minimum Value Filter */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Valor Mínimo (opcional)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700/40">R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.minValue || ''}
            onChange={(e) => onUpdate('minValue', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0.00"
            className={cn(
              'flex-1 px-3 py-2 rounded-lg',
              'bg-white border border-gray-200',
              'text-sm text-gray-700 placeholder-gray-400',
              'focus:outline-none focus:border-blue-500/50'
            )}
          />
        </div>
        <p className="text-[10px] text-gray-400">
          Só dispara para pedidos acima deste valor
        </p>
      </div>

      {/* Status Filter for Order Paid */}
      {label === 'Pedido Pago' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-600/60">Status de Pagamento</label>
          <div className="relative">
            <select
              value={config.paymentStatus || 'paid'}
              onChange={(e) => onUpdate('paymentStatus', e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded-lg appearance-none',
                'bg-white border border-gray-200',
                'text-sm text-gray-700',
                'focus:outline-none focus:border-blue-500/50'
              )}
            >
              <option value="paid">Pago</option>
              <option value="partially_paid">Parcialmente Pago</option>
              <option value="any">Qualquer status de pagamento</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
        <p className="text-[11px] text-emerald-700">
          {label}: Dispara quando um pedido {label === 'Pedido Pago' ? 'for pago' : 'for criado'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// NOTIFY ACTION CONFIG
// ============================================

interface NotifyActionConfigProps {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  organizationId?: string;
}

function NotifyActionConfig({ config, onUpdate, organizationId }: NotifyActionConfigProps) {
  const [users, setUsers] = useState<{ id: string; email: string; name?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (organizationId) {
      fetchUsers();
    }
  }, [organizationId]);

  const fetchUsers = async () => {
    if (!organizationId) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/organization/members?organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.members || []);
      }
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const selectedUserIds = config.userIds || [];

  const toggleUser = (userId: string) => {
    const newUserIds = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id: string) => id !== userId)
      : [...selectedUserIds, userId];
    onUpdate('userIds', newUserIds);
  };

  const selectAll = () => {
    onUpdate('userIds', users.map(u => u.id));
  };

  const selectNone = () => {
    onUpdate('userIds', []);
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Título da Notificação</label>
        <input
          type="text"
          value={config.title || ''}
          onChange={(e) => onUpdate('title', e.target.value)}
          placeholder="Ex: Nova ação necessária"
          className={cn(
            'w-full px-3 py-2 rounded-lg',
            'bg-white border border-gray-200',
            'text-sm text-gray-700 placeholder-gray-400',
            'focus:outline-none focus:border-blue-500/50'
          )}
        />
      </div>

      {/* Message */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Mensagem</label>
        <textarea
          value={config.message || ''}
          onChange={(e) => onUpdate('message', e.target.value)}
          placeholder="Mensagem da notificação..."
          rows={3}
          className={cn(
            'w-full px-3 py-2 rounded-lg resize-none',
            'bg-white border border-gray-200',
            'text-sm text-gray-700 placeholder-gray-400',
            'focus:outline-none focus:border-blue-500/50'
          )}
        />
      </div>

      {/* User Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600/60">Notificar Usuários</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] text-blue-400 hover:text-blue-700"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="text-[10px] text-gray-400 hover:text-gray-500"
            >
              Nenhum
            </button>
          </div>
        </div>
        
        <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-white rounded-lg border border-gray-200">
          {loadingUsers ? (
            <p className="text-xs text-gray-600/40 text-center py-2">Carregando...</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-gray-600/40 text-center py-2">Nenhum usuário encontrado</p>
          ) : (
            users.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="w-4 h-4 rounded border-gray-300 bg-transparent text-blue-500"
                />
                <span className="text-xs text-gray-600/80">
                  {user.name || user.email}
                </span>
              </label>
            ))
          )}
        </div>
        
        <p className="text-[10px] text-gray-400">
          {selectedUserIds.length} usuário(s) selecionado(s)
        </p>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-[11px] text-blue-700">
          A notificação aparecerá no sino de notificações dos usuários selecionados
        </p>
      </div>
    </div>
  );
}

// ============================================
// ABANDONED CART CONFIG
// ============================================

interface AbandonedCartConfigProps {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  organizationId?: string;
}

function AbandonedCartConfig({ config, onUpdate, organizationId }: AbandonedCartConfigProps) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  useEffect(() => {
    if (organizationId) {
      fetchStores();
    }
  }, [organizationId]);

  const fetchStores = async () => {
    if (!organizationId) return;
    setLoadingStores(true);
    try {
      const res = await fetch(`/api/stores?organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
      }
    } catch (e) {
      console.error('Error fetching stores:', e);
    } finally {
      setLoadingStores(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Store Filter */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Loja (opcional)</label>
        <div className="relative">
          <select
            value={config.storeId || ''}
            onChange={(e) => onUpdate('storeId', e.target.value)}
            disabled={loadingStores}
            className={cn(
              'w-full px-3 py-2 rounded-lg appearance-none',
              'bg-white border border-gray-200',
              'text-sm text-gray-700',
              'focus:outline-none focus:border-blue-500/50',
              'disabled:opacity-50'
            )}
          >
            <option value="">Todas as lojas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Abandonment Time */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Tempo de Abandono</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="1"
            value={config.abandonTime || 30}
            onChange={(e) => onUpdate('abandonTime', parseInt(e.target.value) || 30)}
            className={cn(
              'px-3 py-2 rounded-lg',
              'bg-white border border-gray-200',
              'text-sm text-gray-700',
              'focus:outline-none focus:border-blue-500/50'
            )}
          />
          <div className="relative">
            <select
              value={config.abandonUnit || 'minutes'}
              onChange={(e) => onUpdate('abandonUnit', e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded-lg appearance-none',
                'bg-white border border-gray-200',
                'text-sm text-gray-700',
                'focus:outline-none focus:border-blue-500/50'
              )}
            >
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <p className="text-[10px] text-gray-400">
          Dispara após este tempo sem finalizar a compra
        </p>
      </div>

      {/* Minimum Value */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Valor Mínimo do Carrinho (opcional)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700/40">R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.minValue || ''}
            onChange={(e) => onUpdate('minValue', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0.00"
            className={cn(
              'flex-1 px-3 py-2 rounded-lg',
              'bg-white border border-gray-200',
              'text-sm text-gray-700 placeholder-gray-400',
              'focus:outline-none focus:border-blue-500/50'
            )}
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.onlyWithEmail || false}
            onChange={(e) => onUpdate('onlyWithEmail', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 bg-transparent text-amber-500"
          />
          <span className="text-xs text-gray-600/60">
            Apenas carrinhos com email identificado
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.excludeRecovered || true}
            onChange={(e) => onUpdate('excludeRecovered', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 bg-transparent text-amber-500"
          />
          <span className="text-xs text-gray-600/60">
            Não disparar se carrinho já foi recuperado
          </span>
        </label>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-[11px] text-amber-700">
          Dispara quando cliente abandona o carrinho após {config.abandonTime || 30} {config.abandonUnit === 'hours' ? 'horas' : 'minutos'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// WHATSAPP ACTION CONFIG
// ============================================

interface WhatsAppActionConfigProps {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  triggerType: string;
}

function WhatsAppActionConfig({ config, onUpdate, triggerType }: WhatsAppActionConfigProps) {
  const [showEditor, setShowEditor] = useState(false);

  const hasMessage = config.message || config.bodyText;
  const messageMode = config.messageMode || 'free';
  const templateName = config.templateName;

  const handleConfigChange = (newConfig: any) => {
    // Update all config keys
    Object.entries(newConfig).forEach(([key, value]) => {
      onUpdate(key, value);
    });
  };

  return (
    <>
      <CredentialSelector
        connectionType="whatsapp"
        value={config.credentialId}
        onChange={(id) => onUpdate('credentialId', id)}
        label="Conexão WhatsApp"
      />

      {/* Message Preview / Editor Button */}
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">Mensagem WhatsApp</label>

        {hasMessage ? (
          <div
            onClick={() => setShowEditor(true)}
            className={cn(
              'p-3 rounded-lg cursor-pointer transition-all',
              'bg-white border border-gray-200 hover:border-green-500/50',
              'group'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs font-medium text-green-400">
                  {messageMode === 'template' ? 'Template' : 'Texto Livre'}
                </span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-green-400 transition-colors" />
            </div>

            {templateName && (
              <div className="text-[10px] text-gray-500 mb-1">
                Template: {templateName}
              </div>
            )}

            <p className="text-xs text-gray-600/70 line-clamp-3">
              {(config.message || config.bodyText || '').substring(0, 150)}
              {(config.message || config.bodyText || '').length > 150 ? '...' : ''}
            </p>

            <div className="mt-2 text-[10px] text-gray-400">
              Clique para editar
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowEditor(true)}
            className={cn(
              'w-full p-4 rounded-lg',
              'border-2 border-dashed border-gray-300 hover:border-green-500/50',
              'flex flex-col items-center gap-2',
              'text-gray-500 hover:text-green-400',
              'transition-all group'
            )}
          >
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">Configurar Mensagem</span>
            <span className="text-[10px] text-gray-400">
              Clique para abrir o editor avançado
            </span>
          </button>
        )}
      </div>

      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-[11px] text-green-700">
          WhatsApp será enviado para o número do contato
        </p>
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {showEditor && (
          <WhatsAppTemplateEditor
            config={config as any}
            onConfigChange={handleConfigChange}
            triggerType={triggerType}
            onClose={() => setShowEditor(false)}
            isModal={true}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================
// EMAIL ACTION CONFIG (template selector, not credentials)
// ============================================
function EmailActionConfig({ config, onUpdate, triggerType }: { config: Record<string, any>; onUpdate: (key: string, value: any) => void; triggerType: string }) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; thumbnail_url?: string }>>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const storeId = useFlowStore.getState().automationConfig?.storeId;

  useEffect(() => {
    setLoadingTemplates(true)
    const url = storeId
      ? `/api/email/templates?storeId=${storeId}`
      : '/api/email/templates';
    fetch(url)
      .then(r => r.json())
      .then(data => setTemplates(data.templates || data || []))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false))
  }, [storeId])

  const inputCls = 'w-full px-3 py-2.5 rounded-md bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-5">
      {/* CONTENT section header */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conteudo</h4>

        {/* Subject line - like Omnisend */}
        <div className="space-y-1.5 mb-4">
          <label className="text-sm font-medium text-gray-700">Subject line</label>
          <div className="relative">
            <input type="text" value={config.subject || ''} onChange={(e) => onUpdate('subject', e.target.value)}
              placeholder="Ainda pensando naquela camisa?"
              className={inputCls} />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <VariableButton triggerType={triggerType} onSelect={(v) => onUpdate('subject', (config.subject || '') + v)} className="scale-75" />
            </div>
          </div>
        </div>

        {/* Preheader - like Omnisend */}
        <div className="space-y-1.5 mb-4">
          <label className="text-sm font-medium text-gray-700">Preheader</label>
          <div className="relative">
            <input type="text" value={config.preheader || ''} onChange={(e) => onUpdate('preheader', e.target.value)}
              placeholder="Salvamos ela pra voce + mais 3 modelos..."
              className={inputCls} />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <VariableButton triggerType={triggerType} onSelect={(v) => onUpdate('preheader', (config.preheader || '') + v)} className="scale-75" />
            </div>
          </div>
        </div>

        {/* Sender's name */}
        <div className="space-y-1.5 mb-4">
          <label className="text-sm font-medium text-gray-700">Sender's name</label>
          <input type="text" value={config.senderName || ''} onChange={(e) => onUpdate('senderName', e.target.value)}
            placeholder="Minha Loja" className={inputCls} />
        </div>

        {/* Sender's email */}
        <div className="space-y-1.5 mb-4">
          <label className="text-sm font-medium text-gray-700">Sender's email address</label>
          <input type="email" value={config.senderEmail || ''} onChange={(e) => onUpdate('senderEmail', e.target.value)}
            placeholder="contato@minhaloja.com.br" className={inputCls} />
        </div>

        {/* Reply-to checkbox */}
        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input type="checkbox" checked={config.useReplyTo || false} onChange={(e) => onUpdate('useReplyTo', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
          <span className="text-sm text-gray-700">Receive replies to a different email address</span>
        </label>
        {config.useReplyTo && (
          <div className="space-y-1.5 mb-4">
            <input type="email" value={config.replyToEmail || ''} onChange={(e) => onUpdate('replyToEmail', e.target.value)}
              placeholder="Choose a reply-to email" className={inputCls} />
          </div>
        )}
      </div>

      {/* Template selection */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Template</h4>
        <select value={config.templateId || ''} onChange={(e) => onUpdate('templateId', e.target.value)}
          className={inputCls}>
          <option value="">Nenhum (usar HTML abaixo)</option>
          {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        {loadingTemplates && <p className="text-xs text-gray-400 mt-1">Carregando...</p>}

        {/* Template preview */}
        {config.templateId && (
          <EmailTemplatePreview templateId={config.templateId} />
        )}

        {/* HTML editor when no template */}
        {!config.templateId && (
          <div className="mt-3">
            <MessageEditor value={config.html || ''} onChange={(v) => onUpdate('html', v)} triggerType={triggerType}
              label="Corpo do Email (HTML)" placeholder="<p>Ola {{ contact.first_name }}!</p>" rows={6} />
          </div>
        )}
      </div>

      {/* Smart Sending */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Envio</h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.smartSending || false} onChange={(e) => onUpdate('smartSending', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
          <span className="text-sm text-gray-700">Smart Sending</span>
        </label>
        {config.smartSending && (
          <div className="flex items-center gap-2 mt-2 ml-6">
            <span className="text-xs text-gray-500">Pular se recebeu nas ultimas</span>
            <input type="number" min="1" value={config.smartSendingHours || 16} onChange={(e) => onUpdate('smartSendingHours', parseInt(e.target.value) || 16)}
              className="w-14 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500" />
            <span className="text-xs text-gray-500">horas</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
        <div className="flex-1" />
        <button
          onClick={() => {/* handled by parent save */}}
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Update
        </button>
      </div>
    </div>
  )
}

// ============================================
// LIST ACTION CONFIG
// ============================================

function ListActionConfig({ config, onUpdate, organizationId, isRemove }: {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  organizationId?: string;
  isRemove: boolean;
}) {
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    fetch(`/api/lists?organizationId=${organizationId}`)
      .then(r => r.json())
      .then(data => setLists(data.lists || data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [organizationId]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs text-gray-600/60">
          {isRemove ? 'Remover da Lista' : 'Adicionar à Lista'}
        </label>
        <select
          value={config.listId || ''}
          onChange={(e) => onUpdate('listId', e.target.value)}
          className={cn(
            'w-full px-3 py-2 rounded-lg',
            'bg-white border border-gray-200',
            'text-sm text-gray-700',
            'focus:outline-none focus:border-blue-500/50'
          )}
        >
          <option value="">Selecione uma lista...</option>
          {lists.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {loading && <p className="text-[10px] text-gray-400">Carregando listas...</p>}
      </div>
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-[11px] text-gray-600">
          {isRemove
            ? 'O contato será removido da lista selecionada.'
            : 'O contato será adicionado à lista selecionada.'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// TRIGGER FILTERS CONFIG (Universal)
// Shown for all trigger nodes
// ============================================

const TRIGGER_FILTER_FIELDS: Record<string, Array<{ value: string; label: string }>> = {
  trigger_abandon: [
    { value: 'cart_value', label: 'Valor do Carrinho' },
    { value: 'item_count', label: 'Qtd. de Itens' },
    { value: 'product_names', label: 'Nomes dos Produtos' },
    { value: 'currency', label: 'Moeda' },
  ],
  trigger_checkout_abandoned: [
    { value: 'cart_value', label: 'Valor do Checkout' },
    { value: 'item_count', label: 'Qtd. de Itens' },
    { value: 'currency', label: 'Moeda' },
  ],
  trigger_order: [
    { value: 'order_value', label: 'Valor do Pedido' },
    { value: 'discount_code', label: 'Código de Desconto' },
    { value: 'payment_method', label: 'Método de Pagamento' },
    { value: 'item_count', label: 'Qtd. de Itens' },
  ],
  trigger_order_paid: [
    { value: 'order_value', label: 'Valor do Pedido' },
    { value: 'payment_method', label: 'Método de Pagamento' },
  ],
  trigger_viewed_product: [
    { value: 'product_name', label: 'Nome do Produto' },
    { value: 'product_price', label: 'Preço do Produto' },
    { value: 'product_category', label: 'Categoria' },
    { value: 'brand', label: 'Marca' },
  ],
  trigger_form_submitted: [
    { value: 'form_name', label: 'Nome do Formulário' },
    { value: 'source', label: 'Origem' },
  ],
  trigger_signup: [
    { value: 'source', label: 'Origem' },
    { value: 'tags', label: 'Tags' },
  ],
};

const AUDIENCE_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'Nome' },
  { value: 'last_name', label: 'Sobrenome' },
  { value: 'phone', label: 'Telefone' },
  { value: 'city', label: 'Cidade' },
  { value: 'state', label: 'Estado' },
  { value: 'country', label: 'País' },
  { value: 'tags', label: 'Tags' },
  { value: 'lifecycle_stage', label: 'Estágio do Ciclo de Vida' },
  { value: 'total_orders', label: 'Total de Pedidos' },
  { value: 'total_spent', label: 'Total Gasto' },
  { value: 'aov', label: 'Ticket Médio' },
  { value: 'last_order_at', label: 'Data Último Pedido' },
  { value: 'created_at', label: 'Data de Cadastro' },
];

const TRIGGER_FILTER_OPERATORS = [
  { value: 'equals', label: 'Igual a' },
  { value: 'not_equals', label: 'Diferente de' },
  { value: 'greater_than', label: 'Maior que' },
  { value: 'less_than', label: 'Menor que' },
  { value: 'greater_or_equal', label: 'Maior ou igual' },
  { value: 'less_or_equal', label: 'Menor ou igual' },
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'is_set', label: 'Está definido' },
  { value: 'is_not_set', label: 'Não está definido' },
  { value: 'in_list', label: 'Está na lista' },
  { value: 'in_last_x_days', label: 'Nos últimos X dias' },
];

interface FilterRow {
  field: string;
  operator: string;
  value: string;
}

interface ExitCondition {
  type: 'event' | 'property';
  eventType?: string;
  field?: string;
  operator?: string;
  value?: string;
}

function TriggerFiltersConfig({ config, onUpdate, triggerType }: {
  config: Record<string, any>;
  onUpdate: (key: string, value: any) => void;
  triggerType: string;
}) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const triggerFields = TRIGGER_FILTER_FIELDS[triggerType] || [
    { value: 'value', label: 'Valor' },
    { value: 'source', label: 'Origem' },
  ];

  // Trigger Filters
  const triggerFilters: FilterRow[] = config.triggerFilters || [];
  const addTriggerFilter = () => {
    if (triggerFilters.length >= 5) return;
    onUpdate('triggerFilters', [...triggerFilters, { field: '', operator: 'equals', value: '' }]);
  };
  const updateTriggerFilter = (idx: number, patch: Partial<FilterRow>) => {
    const updated = triggerFilters.map((f, i) => i === idx ? { ...f, ...patch } : f);
    onUpdate('triggerFilters', updated);
  };
  const removeTriggerFilter = (idx: number) => {
    onUpdate('triggerFilters', triggerFilters.filter((_, i) => i !== idx));
  };

  // Audience Filters
  const audienceFilters: FilterRow[] = config.audienceFilters || [];
  const addAudienceFilter = () => {
    if (audienceFilters.length >= 5) return;
    onUpdate('audienceFilters', [...audienceFilters, { field: '', operator: 'equals', value: '' }]);
  };
  const updateAudienceFilter = (idx: number, patch: Partial<FilterRow>) => {
    const updated = audienceFilters.map((f, i) => i === idx ? { ...f, ...patch } : f);
    onUpdate('audienceFilters', updated);
  };
  const removeAudienceFilter = (idx: number) => {
    onUpdate('audienceFilters', audienceFilters.filter((_, i) => i !== idx));
  };

  // Exit Conditions
  const exitConditions: ExitCondition[] = config.exitConditions || [];
  const addExitCondition = () => {
    if (exitConditions.length >= 4) return;
    onUpdate('exitConditions', [...exitConditions, { type: 'event', eventType: 'placed_order' }]);
  };
  const updateExitCondition = (idx: number, patch: Partial<ExitCondition>) => {
    const updated = exitConditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onUpdate('exitConditions', updated);
  };
  const removeExitCondition = (idx: number) => {
    onUpdate('exitConditions', exitConditions.filter((_, i) => i !== idx));
  };

  const inputCls = cn(
    'w-full px-2 py-1.5 rounded-md',
    'bg-white border border-gray-200',
    'text-xs text-gray-700 placeholder-gray-400',
    'focus:outline-none focus:border-blue-500/50'
  );

  return (
    <div className="space-y-1 mt-2">
      {/* ---- TRIGGER FILTERS ---- */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('tf')}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Filtros do Trigger {triggerFilters.length > 0 && `(${triggerFilters.length})`}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedSections.includes('tf') && 'rotate-180')} />
        </button>
        {expandedSections.includes('tf') && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 mt-2">Filtrar por dados do evento (até 5)</p>
            {triggerFilters.map((filter, idx) => (
              <div key={idx} className="flex gap-1.5 items-start">
                <div className="flex-1 space-y-1">
                  <select value={filter.field} onChange={(e) => updateTriggerFilter(idx, { field: e.target.value })} className={inputCls}>
                    <option value="">Campo...</option>
                    {triggerFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={filter.operator} onChange={(e) => updateTriggerFilter(idx, { operator: e.target.value })} className={inputCls}>
                    {TRIGGER_FILTER_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!['is_set', 'is_not_set'].includes(filter.operator) && (
                    <input type="text" value={filter.value} onChange={(e) => updateTriggerFilter(idx, { value: e.target.value })}
                      placeholder="Valor" className={inputCls} />
                  )}
                </div>
                <button onClick={() => removeTriggerFilter(idx)} className="p-1 text-gray-400 hover:text-red-500 mt-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {triggerFilters.length < 5 && (
              <button onClick={addTriggerFilter}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Adicionar Filtro
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- AUDIENCE FILTERS ---- */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('af')}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Filtros de Audiência {audienceFilters.length > 0 && `(${audienceFilters.length})`}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedSections.includes('af') && 'rotate-180')} />
        </button>
        {expandedSections.includes('af') && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 mt-2">Filtrar por dados do perfil do contato</p>
            {audienceFilters.map((filter, idx) => (
              <div key={idx} className="flex gap-1.5 items-start">
                <div className="flex-1 space-y-1">
                  <select value={filter.field} onChange={(e) => updateAudienceFilter(idx, { field: e.target.value })} className={inputCls}>
                    <option value="">Campo...</option>
                    {AUDIENCE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={filter.operator} onChange={(e) => updateAudienceFilter(idx, { operator: e.target.value })} className={inputCls}>
                    {TRIGGER_FILTER_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!['is_set', 'is_not_set'].includes(filter.operator) && (
                    <input type="text" value={filter.value} onChange={(e) => updateAudienceFilter(idx, { value: e.target.value })}
                      placeholder="Valor" className={inputCls} />
                  )}
                </div>
                <button onClick={() => removeAudienceFilter(idx)} className="p-1 text-gray-400 hover:text-red-500 mt-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {audienceFilters.length < 5 && (
              <button onClick={addAudienceFilter}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Adicionar Filtro
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- EXIT CONDITIONS ---- */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('ec')}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Condições de Saída {exitConditions.length > 0 && `(${exitConditions.length})`}
          </span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedSections.includes('ec') && 'rotate-180')} />
        </button>
        {expandedSections.includes('ec') && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 mt-2">Cancelam o fluxo quando satisfeitas (até 4)</p>
            {exitConditions.map((cond, idx) => (
              <div key={idx} className="flex gap-1.5 items-start">
                <div className="flex-1 space-y-1">
                  <select value={cond.type} onChange={(e) => updateExitCondition(idx, { type: e.target.value as 'event' | 'property' })} className={inputCls}>
                    <option value="event">Evento ocorreu</option>
                    <option value="property">Propriedade mudou</option>
                  </select>
                  {cond.type === 'event' && (
                    <select value={cond.eventType || ''} onChange={(e) => updateExitCondition(idx, { eventType: e.target.value })} className={inputCls}>
                      <option value="placed_order">Realizou Pedido</option>
                      <option value="added_to_cart">Adicionou ao Carrinho</option>
                      <option value="checkout_completed">Completou Checkout</option>
                      <option value="form_submitted">Enviou Formulário</option>
                      <option value="unsubscribed">Descadastrou</option>
                    </select>
                  )}
                  {cond.type === 'property' && (
                    <>
                      <select value={cond.field || ''} onChange={(e) => updateExitCondition(idx, { field: e.target.value })} className={inputCls}>
                        <option value="">Campo...</option>
                        {AUDIENCE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <input type="text" value={cond.value || ''} onChange={(e) => updateExitCondition(idx, { value: e.target.value })}
                        placeholder="Novo valor" className={inputCls} />
                    </>
                  )}
                </div>
                <button onClick={() => removeExitCondition(idx)} className="p-1 text-gray-400 hover:text-red-500 mt-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {exitConditions.length < 4 && (
              <button onClick={addExitCondition}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Adicionar Condição de Saída
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- FREQUENCY ---- */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('freq')}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Frequência</span>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedSections.includes('freq') && 'rotate-180')} />
        </button>
        {expandedSections.includes('freq') && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-100 mt-0 pt-2">
            <div className="space-y-1.5">
              {[
                { value: 'once', label: 'Uma vez por contato' },
                { value: 'interval', label: 'A cada intervalo' },
                { value: 'unlimited', label: 'Sem limite' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    checked={(config.frequencyType || 'once') === opt.value}
                    onChange={() => onUpdate('frequencyType', opt.value)}
                    className="w-3.5 h-3.5 text-blue-500 border-gray-300"
                  />
                  <span className="text-xs text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {config.frequencyType === 'interval' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">A cada</span>
                <input type="number" min="1" value={config.frequencyValue || 4}
                  onChange={(e) => onUpdate('frequencyValue', parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500/50" />
                <select value={config.frequencyUnit || 'hours'}
                  onChange={(e) => onUpdate('frequencyUnit', e.target.value)}
                  className="px-2 py-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500/50">
                  <option value="hours">horas</option>
                  <option value="days">dias</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// EMAIL TEMPLATE PREVIEW
// ============================================

function EmailTemplatePreview({ templateId }: { templateId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);
    fetch(`/api/email/templates/${templateId}`)
      .then(r => r.json())
      .then(data => {
        setHtml(data.template?.html || data.html || null);
      })
      .catch(() => setHtml(null))
      .finally(() => setLoading(false));
  }, [templateId]);

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-6 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!html) {
    return (
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <Mail className="w-6 h-6 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">Sem preview disponivel</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden bg-white">
      <iframe
        srcDoc={html}
        className="w-full h-[200px] border-0"
        sandbox="allow-same-origin"
        title="Email preview"
      />
    </div>
  );
}

export default PropertiesPanel;
