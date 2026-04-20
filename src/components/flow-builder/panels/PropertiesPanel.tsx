'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Copy, Settings, ChevronDown, Sparkles, MessageCircle, ExternalLink, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, useSelectedNode } from '@/stores/flowStore';
import { getNodeDefinition, getNodeColor } from '../nodes/nodeTypes';
import { WebhookConfig } from './WebhookConfig';
import { CredentialSelector } from './CredentialSelector';
import { MessageEditor, VariableButton } from '../variables';
import { WhatsAppTemplateEditor } from '../whatsapp';
import { EmailPreviewMode } from './EmailPreviewMode';
import { EmailEditorOverlay } from './EmailEditorOverlay';

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
        className="w-[440px] bg-white border-r border-gray-200 flex flex-col h-full shrink-0 overflow-hidden"
      >
        {/* Header — Klaviyo style with icon */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          {Icon && (
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colors.bg)}>
              <Icon className={cn('w-4 h-4', colors.text)} />
            </div>
          )}
          <h3 className="text-base font-semibold text-gray-900 flex-1">
            {selectedNode.data.label || definition?.label || 'Configurar'}
          </h3>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Description — shown below header as gray text */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5">
            <input
              type="text"
              value={selectedNode.data.description || ''}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Adicionar descricao..."
              className="w-full bg-transparent text-sm text-gray-600 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {/* Dynamic Config */}
          <section className="space-y-4">

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
                  <label className="text-xs text-gray-500">Campo de Data</label>
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
                    <label className="text-xs text-gray-500">Nome do Campo</label>
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
                  <label className="text-xs text-gray-500">Quando Disparar?</label>
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
                  <label className="text-xs text-gray-500">Horário de Disparo</label>
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
                  <label className="text-xs text-gray-500">Tipo de Mensagem</label>
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
                  <label className="text-xs text-gray-500">Contém Palavra-chave (opcional)</label>
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
                    <span className="text-xs text-gray-500">
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
                  <label className="text-xs text-gray-500">Pipeline</label>
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
                      <label className="text-xs text-gray-500">De qual estágio? (opcional)</label>
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
                      <label className="text-xs text-gray-500">Para qual estágio?</label>
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
                <label className="text-xs text-gray-500">Nome da Tag</label>
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
                <label className="text-xs text-gray-500">Pipeline (opcional)</label>
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
                <label className="text-xs text-gray-500">Pipeline (opcional)</label>
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
                  <label className="text-xs text-gray-500">Pipeline (opcional)</label>
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
                  <label className="text-xs text-gray-500">Motivo da Perda (opcional)</label>
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
                    <label className="text-xs text-gray-500">Duração</label>
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
                    <label className="text-xs text-gray-500">Unidade</label>
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
                  <label className="text-xs text-gray-500">Tipo de Espera</label>
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
                    <label className="text-xs text-gray-500">Horário</label>
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
                    <label className="text-xs text-gray-500">Data e Hora</label>
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
                onLabelChange={handleLabelChange}
                triggerType={triggerType}
                organizationId={organizationId}
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
                  <label className="text-xs text-gray-500">Pipeline</label>
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
                    <label className="text-xs text-gray-500">Estágio</label>
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
                      <label className="text-xs text-gray-500">Título do Deal</label>
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
                      <label className="text-xs text-gray-500">Valor</label>
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
                  <label className="text-xs text-gray-500">Nome da Condição</label>
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
                  <label className="text-xs text-gray-500">Tipo</label>
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
                  <label className="text-xs text-gray-500">Campo</label>
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
                  <label className="text-xs text-gray-500">Operador</label>
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
                    <label className="text-xs text-gray-500">
                      {selectedNode.data.config?.operator === 'between' ? 'Valor minimo' : 'Valor'}
                    </label>
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
                    <label className="text-xs text-gray-500">Valor Máximo</label>
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
                  <label className="text-xs text-gray-500">Conector Lógico</label>
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
                  <label className="text-xs text-gray-500">Operador</label>
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
                  <label className="text-xs text-gray-500">Valor (R$)</label>
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
                  <label className="text-xs text-gray-500">Operador</label>
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
                  <label className="text-xs text-gray-500">Valor (R$)</label>
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
                  <label className="text-xs text-gray-500">Proporção</label>
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
                  <label className="text-xs text-gray-500">Nome do Caminho A</label>
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
                  <label className="text-xs text-gray-500">Nome do Caminho B</label>
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
                  <label className="text-xs text-gray-500">URL</label>
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
                  <label className="text-xs text-gray-500">Método</label>
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
                  <label className="text-xs text-gray-500">Headers (JSON)</label>
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
                  <label className="text-xs text-gray-500">Body (JSON)</label>
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
          <section className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-[11px] text-blue-700 font-medium">
                  Personalizacao com Variaveis
                </p>
                <p className="text-[10px] text-blue-600/70">
                  Use variaveis como <span className="bg-blue-100 px-1 rounded font-mono">{'{{contact.first_name}}'}</span> para dados dinamicos.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 flex items-center gap-2">
          <button
            onClick={() => {
              try {
                navigator.clipboard.writeText(selectedNode.id);
              } catch {
                // Fallback for insecure contexts
                const ta = document.createElement('textarea');
                ta.value = selectedNode.id;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
            }}
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
              'bg-red-50 hover:bg-red-100',
              'text-sm text-red-600 hover:text-red-700',
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
            <span className="text-xs text-gray-500">{field.label}</span>
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
        <span className="text-xs text-gray-500">Combinar condições com:</span>
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

  const [storeError, setStoreError] = useState(false);

  const fetchStores = async () => {
    if (!organizationId) return;
    setLoadingStores(true);
    setStoreError(false);
    try {
      const res = await fetch(`/api/stores?organizationId=${organizationId}`);
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
      } else {
        setStoreError(true);
      }
    } catch {
      setStoreError(true);
    } finally {
      setLoadingStores(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Store Filter */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Loja (opcional)</label>
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
        {storeError ? (
          <p className="text-[10px] text-red-500">Erro ao carregar lojas</p>
        ) : (
          <p className="text-[10px] text-gray-400">Filtre por loja especifica ou deixe vazio para todas</p>
        )}
      </div>

      {/* Minimum Value Filter */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Valor Mínimo (opcional)</label>
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
          <label className="text-xs text-gray-500">Status de Pagamento</label>
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
        <label className="text-xs text-gray-500">Título da Notificação</label>
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
        <label className="text-xs text-gray-500">Mensagem</label>
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
          <label className="text-xs text-gray-500">Notificar Usuários</label>
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
  const [storeLoadError, setStoreLoadError] = useState(false);

  useEffect(() => {
    if (organizationId) {
      setLoadingStores(true);
      setStoreLoadError(false);
      fetch(`/api/stores?organizationId=${organizationId}`)
        .then(r => r.ok ? r.json() : { stores: [] })
        .then(data => setStores(data.stores || []))
        .catch(() => setStoreLoadError(true))
        .finally(() => setLoadingStores(false));
    }
  }, [organizationId]);

  const selectCls = cn(
    'w-full px-3 py-2.5 rounded-md appearance-none',
    'bg-white border border-gray-200',
    'text-sm text-gray-900',
    'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
  );

  const inputCls = cn(
    'w-full px-3 py-2.5 rounded-md',
    'bg-white border border-gray-200',
    'text-sm text-gray-900 placeholder-gray-400',
    'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
  );

  return (
    <div className="space-y-5">
      {/* Store filter */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Loja</label>
        <select
          value={config.storeId || ''}
          onChange={(e) => onUpdate('storeId', e.target.value)}
          disabled={loadingStores}
          className={selectCls}
        >
          <option value="">Todas as lojas</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
        {storeLoadError && <p className="text-[10px] text-red-500 mt-1">Erro ao carregar lojas</p>}
      </div>

      {/* Minimum cart value */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">Valor minimo do carrinho</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.minValue || ''}
            onChange={(e) => onUpdate('minValue', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <p className="text-xs text-gray-400">Deixe vazio para qualquer valor</p>
      </div>

      <hr className="border-gray-100" />

      {/* Options */}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={config.onlyWithEmail || false}
            onChange={(e) => onUpdate('onlyWithEmail', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Apenas carrinhos com email identificado</span>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={config.excludeRecovered !== false}
            onChange={(e) => onUpdate('excludeRecovered', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Não disparar se carrinho ja foi recuperado</span>
        </label>
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
        <label className="text-xs text-gray-500">Mensagem WhatsApp</label>

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
function EmailActionConfig({ config, onUpdate, onLabelChange, triggerType, organizationId }: { config: Record<string, any>; onUpdate: (key: string, value: any) => void; onLabelChange?: (label: string) => void; triggerType: string; organizationId?: string }) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; thumbnail_url?: string }>>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [showSubjectEdit, setShowSubjectEdit] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPreviewMode, setShowPreviewMode] = useState(false)
  const [showEmailEditor, setShowEmailEditor] = useState(false)
  const storeId = useFlowStore.getState().automationConfig?.storeId;

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const url = storeId ? `/api/email/templates?storeId=${storeId}` : '/api/email/templates';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || data || []);
      }
    } catch {}
    setLoadingTemplates(false);
  }, [storeId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const inputCls = 'w-full px-3 py-2.5 rounded-md bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-0">

      {/* === SECTION: Nome do email + Status (Klaviyo style) === */}
      <div className="pb-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-gray-500">Nome do email</label>
            <input
              type="text"
              value={config.emailName || ''}
              onChange={(e) => {
                onUpdate('emailName', e.target.value);
                onLabelChange?.(e.target.value || 'Enviar E-mail');
              }}
              placeholder="Email #01 Carrinho Abandonado"
              className={inputCls}
            />
          </div>
          <div className="space-y-1 shrink-0">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={config.emailStatus || 'draft'}
              onChange={(e) => onUpdate('emailStatus', e.target.value)}
              className="h-[42px] px-3 rounded-md bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* === SECTION: Desempenho (Klaviyo style) === */}
      <div className="py-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Desempenho</h4>
            <p className="text-xs text-gray-400">Últimos 30 dias</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Taxa de abertura</span>
            <span className="text-sm text-gray-400">--</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Taxa de cliques</span>
            <span className="text-sm text-gray-400">--</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Receita</span>
            <span className="text-sm text-gray-400">--</span>
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* === SECTION: Assunto e remetente (Klaviyo style) === */}
      <div className="py-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-900">Assunto e remetente</h4>
          <button onClick={() => setShowSubjectEdit(!showSubjectEdit)}
            className="px-3 py-1 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {showSubjectEdit ? 'Pronto' : 'Editar'}
          </button>
        </div>

        {showSubjectEdit ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Assunto</label>
              <div className="relative">
                <input type="text" value={config.subject || ''} onChange={(e) => onUpdate('subject', e.target.value)}
                  placeholder="Voce esqueceu algo no carrinho" className={inputCls} />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <VariableButton triggerType={triggerType} onSelect={(v) => onUpdate('subject', (config.subject || '') + v)} className="scale-75" />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Texto de preview</label>
              <input type="text" value={config.preheader || ''} onChange={(e) => onUpdate('preheader', e.target.value)}
                placeholder="Aproveite! Seu desconto espera por voce!" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Nome do remetente</label>
              <input type="text" value={config.senderName || ''} onChange={(e) => onUpdate('senderName', e.target.value)}
                placeholder="Minha Loja" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email do remetente</label>
              <input type="email" value={config.senderEmail || ''} onChange={(e) => onUpdate('senderEmail', e.target.value)}
                placeholder="contato@minhaloja.com.br" className={inputCls} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500 w-24 shrink-0">Assunto</span>
              <span className="text-sm text-gray-900 text-right">{config.subject || <span className="text-gray-400 italic">Não definido</span>}</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500 w-24 shrink-0">Texto de preview</span>
              <span className="text-sm text-gray-900 text-right">{config.preheader || <span className="text-gray-400 italic">Não definido</span>}</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500 w-24 shrink-0">Nome do remetente</span>
              <span className="text-sm text-gray-900 text-right">{config.senderName || <span className="text-gray-400 italic">Não definido</span>}</span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-sm text-gray-500 w-24 shrink-0">Email do remetente</span>
              <span className="text-sm text-gray-900 text-right">{config.senderEmail || <span className="text-gray-400 italic">Não definido</span>}</span>
            </div>
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* === SECTION: Template (Klaviyo style) === */}
      <div className="py-5">
        {/* Template selector */}
        <select value={config.templateId || ''} onChange={(e) => onUpdate('templateId', e.target.value)}
          className={cn(inputCls, 'mb-3')}>
          <option value="">Escolher template...</option>
          <option value="__new__">+ Criar novo email</option>
          {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        {loadingTemplates && <p className="text-xs text-gray-400">Carregando...</p>}

        {/* Template preview with Desktop/Mobile + Edit */}
        {config.templateId && config.templateId !== '__new__' && (
          <EmailTemplatePreview
            templateId={config.templateId}
            onEdit={() => setShowEmailEditor(true)}
          />
        )}

        {/* New email — create template then open editor */}
        {config.templateId === '__new__' && (
          <div className="mt-3">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/email/templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: config.emailName || 'Novo Email',
                      ...(storeId ? { store_id: storeId } : {}),
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    const newId = data.template?.id;
                    if (newId) {
                      onUpdate('templateId', newId);
                      setTimeout(() => setShowEmailEditor(true), 100);
                    }
                  }
                } catch {}
              }}
              className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Abrir editor de email
            </button>
          </div>
        )}

        {/* No template selected */}
        {!config.templateId && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
            <Mail className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-blue-600">Selecione um template existente ou crie um novo email</p>
          </div>
        )}

        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[10px] text-blue-600 font-bold">i</span>
          </div>
          <p className="text-xs text-blue-600">Dynamic content may not appear completely in previews.</p>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* === SECTION: Configurações (Klaviyo style) === */}
      <div className="py-5">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">Configurações</h4>

        <div className="space-y-4">
          {/* Smart Sending */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={config.smartSending || false} onChange={(e) => onUpdate('smartSending', e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <div>
              <p className="text-sm text-gray-900">Pular perfis contatados recentemente</p>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="text-blue-600">Smart Sending</span> will skip anyone who received an email within the last {config.smartSendingHours || 16} hours.
              </p>
            </div>
          </label>
          {config.smartSending && (
            <div className="flex items-center gap-2 ml-6">
              <span className="text-xs text-gray-500">Skip window:</span>
              <input type="number" min="1" value={config.smartSendingHours || 16} onChange={(e) => onUpdate('smartSendingHours', parseInt(e.target.value) || 16)}
                className="w-14 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500" />
              <span className="text-xs text-gray-500">hours</span>
            </div>
          )}

          {/* UTM Tracking */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={config.utmTracking || false} onChange={(e) => onUpdate('utmTracking', e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <div>
              <p className="text-sm text-gray-900">Ativar rastreamento UTM</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Links will include additional tracking information, called <span className="text-blue-600">UTM parameters</span>.
              </p>
            </div>
          </label>
          {config.utmTracking && (
            <div className="space-y-2 ml-6">
              <input type="text" value={config.utmSource || 'worder'} onChange={(e) => onUpdate('utmSource', e.target.value)}
                placeholder="utm_source" className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500" />
              <input type="text" value={config.utmMedium || 'email'} onChange={(e) => onUpdate('utmMedium', e.target.value)}
                placeholder="utm_medium" className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500" />
              <input type="text" value={config.utmCampaign || ''} onChange={(e) => onUpdate('utmCampaign', e.target.value)}
                placeholder="utm_campaign" className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-blue-500" />
            </div>
          )}
        </div>
      </div>

      {/* === Bottom actions === */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        {config.templateId && config.templateId !== '__new__' && (
          <button
            onClick={() => setShowPreviewMode(true)}
            className="px-4 py-2 rounded-md border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Visualizar
          </button>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <button className="px-4 py-2 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button className="px-4 py-2 rounded-md bg-gray-900 text-sm font-medium text-white hover:bg-gray-800">
            Save
          </button>
        </div>
      </div>

      {/* Preview Mode fullscreen */}
      {showPreviewMode && config.templateId && organizationId && (
        <EmailPreviewMode
          templateId={config.templateId}
          triggerType={triggerType}
          organizationId={organizationId}
          onClose={() => setShowPreviewMode(false)}
        />
      )}

      {/* Email Editor fullscreen (opens INSIDE the flow, not new tab) */}
      {showEmailEditor && config.templateId && config.templateId !== '__new__' && (
        <EmailEditorOverlay
          templateId={config.templateId}
          triggerType={triggerType}
          organizationId={organizationId}
          onClose={async () => {
            await fetchTemplates();
            setShowEmailEditor(false);
          }}
        />
      )}
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/lists?organizationId=${organizationId}`)
      .then(r => r.json())
      .then(data => setLists(data.lists || data || []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [organizationId]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs text-gray-500">
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
        {loadError && <p className="text-[10px] text-red-500">Erro ao carregar listas. Tente novamente.</p>}
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
  const [expandedSections, setExpandedSections] = useState<string[]>(['reentry']);

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
    <div className="space-y-5 mt-3">
      {/* ---- RE-ENTRY CRITERIA (Klaviyo style) ---- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900">Re-entry criteria</h4>
        </div>
        <p className="text-xs text-gray-500 mb-3">Defina se contatos podem entrar no fluxo mais de uma vez.</p>
        <div className="space-y-2">
          {[
            { value: 'once', label: 'Sem re-entrada', desc: 'Contatos entram apenas uma vez, mesmo que a condicao seja atendida novamente.' },
            { value: 'unlimited', label: 'Permitir re-entrada', desc: 'Contatos re-entram sempre que a condicao for atendida.' },
            { value: 'interval', label: 'Re-entrada apos periodo', desc: 'Contatos re-entram apos um periodo definido.' },
          ].map(opt => (
            <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="frequency"
                checked={(config.frequencyType || 'once') === opt.value}
                onChange={() => onUpdate('frequencyType', opt.value)}
                className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300"
              />
              <div>
                <p className="text-sm text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        {config.frequencyType === 'interval' && (
          <div className="flex items-center gap-2 mt-3 ml-6">
            <span className="text-sm text-gray-600">Periodo:</span>
            <input type="number" min="1" value={config.frequencyValue || 5}
              onChange={(e) => onUpdate('frequencyValue', parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-1.5 rounded-md bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-blue-500" />
            <select value={config.frequencyUnit || 'days'}
              onChange={(e) => onUpdate('frequencyUnit', e.target.value)}
              className="px-2 py-1.5 rounded-md bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-blue-500">
              <option value="hours">Horas</option>
              <option value="days">Dias</option>
            </select>
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* ---- TRIGGER FILTERS (Klaviyo style) ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Trigger filters</h4>
          {triggerFilters.length < 5 ? (
            <button onClick={addTriggerFilter} className="text-xs font-medium text-blue-600 hover:text-blue-800">Add</button>
          ) : (
            <span className="text-[10px] text-gray-400">max 5</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">Limitar o fluxo quando condicoes especificas sao atendidas.</p>
        {triggerFilters.length === 0 && (
          <p className="text-xs text-gray-400">Nenhum filtro aplicado.</p>
        )}
        {triggerFilters.map((filter, idx) => (
          <div key={idx} className="flex gap-1.5 items-start mt-2">
            <div className="flex-1 space-y-1.5">
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
      </div>

      <hr className="border-gray-200" />

      {/* ---- PROFILE FILTERS (Klaviyo style) ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Profile filters</h4>
          {audienceFilters.length < 5 ? (
            <button onClick={addAudienceFilter} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
          ) : (
            <span className="text-[10px] text-gray-400">max 5</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">Limitar o fluxo por condicoes do perfil do contato.</p>
        {audienceFilters.length === 0 && (
          <p className="text-xs text-gray-400">Nenhum filtro de perfil aplicado.</p>
        )}
        {audienceFilters.map((filter, idx) => (
          <div key={idx} className="flex gap-1.5 items-start mt-2">
            <div className="flex-1 space-y-1.5">
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
      </div>

      <hr className="border-gray-200" />

      {/* ---- EXIT CONDITIONS (Omnisend style) ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900">Exit conditions</h4>
          {exitConditions.length < 4 ? (
            <button onClick={addExitCondition} className="text-xs font-medium text-blue-600 hover:text-blue-800">Add</button>
          ) : (
            <span className="text-[10px] text-gray-400">max 4</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">Cancelam o fluxo quando satisfeitas.</p>
        {exitConditions.length === 0 && (
          <p className="text-xs text-gray-400">Nenhuma condicao de saida.</p>
        )}
        {exitConditions.map((cond, idx) => (
          <div key={idx} className="flex gap-1.5 items-start mt-2">
            <div className="flex-1 space-y-1.5">
              <select value={cond.type} onChange={(e) => updateExitCondition(idx, { type: e.target.value as 'event' | 'property' })} className={inputCls}>
                <option value="event">Evento ocorreu</option>
                <option value="property">Propriedade mudou</option>
              </select>
              {cond.type === 'event' && (
                <select value={cond.eventType || ''} onChange={(e) => updateExitCondition(idx, { eventType: e.target.value })} className={inputCls}>
                  <option value="placed_order">Realizou Pedido</option>
                  <option value="added_to_cart">Adicionou ao Carrinho</option>
                  <option value="checkout_completed">Completou Checkout</option>
                  <option value="form_submitted">Enviou Formulario</option>
                  <option value="unsubscribed">Descadastrou</option>
                </select>
              )}
              {cond.type === 'property' && (
                <>
                  <select value={cond.field || ''} onChange={(e) => updateExitCondition(idx, { field: e.target.value })} className={inputCls}>
                    <option value="">Campo...</option>
                    {AUDIENCE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={cond.operator || 'equals'} onChange={(e) => updateExitCondition(idx, { operator: e.target.value })} className={inputCls}>
                    <option value="equals">Igual a</option>
                    <option value="not_equals">Diferente de</option>
                    <option value="is_set">Esta definido</option>
                    <option value="is_not_set">Não está definido</option>
                    <option value="contains">Contem</option>
                    <option value="greater_than">Maior que</option>
                    <option value="less_than">Menor que</option>
                  </select>
                  {!['is_set', 'is_not_set'].includes(cond.operator || '') && (
                    <input type="text" value={cond.value || ''} onChange={(e) => updateExitCondition(idx, { value: e.target.value })}
                      placeholder="Valor" className={inputCls} />
                  )}
                </>
              )}
            </div>
            <button onClick={() => removeExitCondition(idx)} className="p-1 text-gray-400 hover:text-red-500 mt-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// EMAIL TEMPLATE PREVIEW
// ============================================

function EmailTemplatePreview({ templateId, onEdit }: { templateId: string; onEdit?: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

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

  return (
    <div className="mt-4">
      {/* Toolbar: Template label + Desktop/Mobile + Edit */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Template</span>
        <div className="flex items-center gap-2">
          {/* Desktop/Mobile toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('desktop')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
              )}
              title="Desktop"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
              )}
              title="Mobile"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
              </svg>
            </button>
          </div>

          {/* Edit button */}
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !html ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
          <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Sem preview disponivel</p>
          {onEdit && (
            <button onClick={onEdit} className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium">
              Criar template
            </button>
          )}
        </div>
      ) : (
        <div className={cn(
          'rounded-xl border border-gray-200 overflow-hidden bg-white mx-auto transition-all duration-200',
          viewMode === 'mobile' ? 'max-w-[320px]' : 'w-full'
        )}>
          <iframe
            srcDoc={html}
            className={cn(
              'w-full border-0 transition-all duration-200',
              viewMode === 'mobile' ? 'h-[480px]' : 'h-[360px]'
            )}
            sandbox="allow-same-origin"
            title="Email preview"
          />
        </div>
      )}
    </div>
  );
}

export default PropertiesPanel;
