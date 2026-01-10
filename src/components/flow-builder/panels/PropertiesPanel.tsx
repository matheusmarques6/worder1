'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Copy, Settings, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, useSelectedNode } from '@/stores/flowStore';
import { getNodeDefinition, getNodeColor } from '../nodes/nodeTypes';
import { WebhookConfig } from './WebhookConfig';
import { CredentialSelector } from './CredentialSelector';

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

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

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
        className="fb-properties w-80 bg-[#111111] border-l border-white/10 flex flex-col h-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colors.bg)}>
              <Icon className={cn('w-4 h-4', colors.text)} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {definition?.label || 'Configurar'}
              </h3>
              <p className="text-[11px] text-white/40 capitalize">
                {selectedNode.data.category}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Basic Info */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Informações Básicas
            </h4>
            
            <div className="space-y-2">
              <label className="text-xs text-white/60">Nome do Nó</label>
              <input
                type="text"
                value={selectedNode.data.label || ''}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder={definition?.label}
                className={cn(
                  'w-full px-3 py-2 rounded-lg',
                  'bg-[#0a0a0a] border border-white/10',
                  'text-sm text-white placeholder-white/30',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/60">Descrição (opcional)</label>
              <textarea
                value={selectedNode.data.description || ''}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Adicionar descrição..."
                rows={2}
                className={cn(
                  'w-full px-3 py-2 rounded-lg resize-none',
                  'bg-[#0a0a0a] border border-white/10',
                  'text-sm text-white placeholder-white/30',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>
          </section>

          {/* Dynamic Config based on node type */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
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
                  <label className="text-xs text-white/60">Pipeline</label>
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
                      <label className="text-xs text-white/60">De qual estágio? (opcional)</label>
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
                      <label className="text-xs text-white/60">Para qual estágio?</label>
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
                
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-[11px] text-blue-300">
                    💡 Exemplo: Dispara quando deal mover de "Qualificação" para "Proposta"
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
                <label className="text-xs text-white/60">Nome da Tag</label>
                <input
                  type="text"
                  value={selectedNode.data.config?.tagName || ''}
                  onChange={(e) => handleUpdate('tagName', e.target.value)}
                  placeholder="Ex: cliente-vip"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg',
                    'bg-[#0a0a0a] border border-white/10',
                    'text-sm text-white placeholder-white/30',
                    'focus:outline-none focus:border-blue-500/50'
                  )}
                />
              </div>
            )}

            {/* TRIGGER: DEAL CREATED - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_created' && (
              <div className="space-y-2">
                <label className="text-xs text-white/60">Pipeline (opcional)</label>
                <SelectField
                  value={selectedNode.data.config?.pipelineId || ''}
                  onChange={(v) => handleUpdate('pipelineId', v)}
                  options={[
                    { value: '', label: 'Qualquer pipeline' },
                    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  loading={loadingPipelines}
                />
                <p className="text-[10px] text-white/40">
                  Deixe vazio para disparar em qualquer pipeline
                </p>
              </div>
            )}

            {/* TRIGGER: DEAL WON - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_won' && (
              <div className="space-y-2">
                <label className="text-xs text-white/60">Pipeline (opcional)</label>
                <SelectField
                  value={selectedNode.data.config?.pipelineId || ''}
                  onChange={(v) => handleUpdate('pipelineId', v)}
                  options={[
                    { value: '', label: 'Qualquer pipeline' },
                    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  loading={loadingPipelines}
                />
                <p className="text-[10px] text-white/40">
                  Filtre por pipeline específico ou deixe vazio para todos
                </p>
              </div>
            )}

            {/* TRIGGER: DEAL LOST - Pipeline Filter */}
            {selectedNode.data.nodeType === 'trigger_deal_lost' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Pipeline (opcional)</label>
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
                  <label className="text-xs text-white/60">Motivo da Perda (opcional)</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.lostReason || ''}
                    onChange={(e) => handleUpdate('lostReason', e.target.value)}
                    placeholder="Ex: preço, concorrente..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
              </>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Tempo</label>
                  <input
                    type="number"
                    min="1"
                    value={selectedNode.data.config?.value || 1}
                    onChange={(e) => handleUpdate('value', parseInt(e.target.value) || 1)}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Unidade</label>
                  <SelectField
                    value={selectedNode.data.config?.unit || 'hours'}
                    onChange={(v) => handleUpdate('unit', v)}
                    options={[
                      { value: 'minutes', label: 'Minutos' },
                      { value: 'hours', label: 'Horas' },
                      { value: 'days', label: 'Dias' },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* DELAY UNTIL - Wait until specific date/time */}
            {selectedNode.data.nodeType === 'control_delay_until' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Tipo de Espera</label>
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
                    <label className="text-xs text-white/60">Horário</label>
                    <input
                      type="time"
                      value={selectedNode.data.config?.time || '09:00'}
                      onChange={(e) => handleUpdate('time', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-[#0a0a0a] border border-white/10',
                        'text-sm text-white',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                    <p className="text-[10px] text-white/40">
                      Se o horário já passou hoje, aguardará até amanhã
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs text-white/60">Data e Hora</label>
                    <input
                      type="datetime-local"
                      value={selectedNode.data.config?.datetime || ''}
                      onChange={(e) => handleUpdate('datetime', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-[#0a0a0a] border border-white/10',
                        'text-sm text-white',
                        'focus:outline-none focus:border-blue-500/50',
                        '[color-scheme:dark]'
                      )}
                    />
                  </div>
                )}

                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <p className="text-[11px] text-purple-300">
                    ⏰ A automação pausará neste ponto até a data/hora especificada
                  </p>
                </div>
              </>
            )}

            {/* EMAIL ACTION */}
            {selectedNode.data.nodeType === 'action_email' && (
              <>
                <CredentialSelector
                  connectionType="email"
                  value={selectedNode.data.config?.credentialId}
                  onChange={(id) => handleUpdate('credentialId', id)}
                  label="Conta de Email"
                />
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Assunto</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.subject || ''}
                    onChange={(e) => handleUpdate('subject', e.target.value)}
                    placeholder="Assunto do email"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Corpo do Email (HTML)</label>
                  <textarea
                    value={selectedNode.data.config?.html || ''}
                    onChange={(e) => handleUpdate('html', e.target.value)}
                    placeholder="<p>Olá {{contact.name}}!</p>"
                    rows={4}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none font-mono text-xs',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Template ID (opcional)</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.templateId || ''}
                    onChange={(e) => handleUpdate('templateId', e.target.value)}
                    placeholder="ID do template"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
              </>
            )}

            {/* WHATSAPP ACTION */}
            {selectedNode.data.nodeType === 'action_whatsapp' && (
              <>
                <CredentialSelector
                  connectionType="whatsapp"
                  value={selectedNode.data.config?.credentialId}
                  onChange={(id) => handleUpdate('credentialId', id)}
                  label="Conexão WhatsApp"
                />
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Tipo de Mensagem</label>
                  <SelectField
                    value={selectedNode.data.config?.messageType || 'template'}
                    onChange={(v) => handleUpdate('messageType', v)}
                    options={[
                      { value: 'template', label: 'Template' },
                      { value: 'text', label: 'Texto Livre' },
                    ]}
                  />
                </div>
                {selectedNode.data.config?.messageType === 'text' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-white/60">Mensagem</label>
                    <textarea
                      value={selectedNode.data.config?.message || ''}
                      onChange={(e) => handleUpdate('message', e.target.value)}
                      placeholder="Olá {{contact.name}}!"
                      rows={3}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg resize-none',
                        'bg-[#0a0a0a] border border-white/10',
                        'text-sm text-white placeholder-white/30',
                        'focus:outline-none focus:border-blue-500/50'
                      )}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-white/60">Template</label>
                      <input
                        type="text"
                        value={selectedNode.data.config?.templateId || ''}
                        onChange={(e) => handleUpdate('templateId', e.target.value)}
                        placeholder="Nome do template WhatsApp"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-[#0a0a0a] border border-white/10',
                          'text-sm text-white placeholder-white/30',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-white/60">Idioma</label>
                      <SelectField
                        value={selectedNode.data.config?.language || 'pt_BR'}
                        onChange={(v) => handleUpdate('language', v)}
                        options={[
                          { value: 'pt_BR', label: 'Português (BR)' },
                          { value: 'en_US', label: 'English (US)' },
                          { value: 'es', label: 'Español' },
                        ]}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* DEAL NODES */}
            {(selectedNode.data.nodeType === 'action_create_deal' ||
              selectedNode.data.nodeType === 'action_move_deal' ||
              selectedNode.data.nodeType === 'trigger_deal_stage') && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Pipeline</label>
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
                    <label className="text-xs text-white/60">Estágio</label>
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
                      <label className="text-xs text-white/60">Título do Deal</label>
                      <input
                        type="text"
                        value={selectedNode.data.config?.title || ''}
                        onChange={(e) => handleUpdate('title', e.target.value)}
                        placeholder="Ex: Venda - {{contact.name}}"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-[#0a0a0a] border border-white/10',
                          'text-sm text-white placeholder-white/30',
                          'focus:outline-none focus:border-blue-500/50'
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-white/60">Valor</label>
                      <input
                        type="number"
                        value={selectedNode.data.config?.value || 0}
                        onChange={(e) => handleUpdate('value', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className={cn(
                          'w-full px-3 py-2 rounded-lg',
                          'bg-[#0a0a0a] border border-white/10',
                          'text-sm text-white placeholder-white/30',
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
                  <label className="text-xs text-white/60">Campo</label>
                  <SelectField
                    value={selectedNode.data.config?.field || ''}
                    onChange={(v) => handleUpdate('field', v)}
                    options={[
                      { value: '', label: 'Selecione...' },
                      { value: 'contact.email', label: 'Email' },
                      { value: 'contact.phone', label: 'Telefone' },
                      { value: 'contact.first_name', label: 'Nome' },
                      { value: 'contact.tags', label: 'Tags' },
                      { value: 'contact.total_orders', label: 'Total de Pedidos' },
                      { value: 'contact.total_spent', label: 'Total Gasto' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Operador</label>
                  <SelectField
                    value={selectedNode.data.config?.operator || 'equals'}
                    onChange={(v) => handleUpdate('operator', v)}
                    options={[
                      { value: 'equals', label: 'Igual a' },
                      { value: 'not_equals', label: 'Diferente de' },
                      { value: 'contains', label: 'Contém' },
                      { value: 'greater_than', label: 'Maior que' },
                      { value: 'less_than', label: 'Menor que' },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Valor</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => handleUpdate('value', e.target.value)}
                    placeholder="Valor para comparar"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
              </>
            )}

            {/* CONDITION: ORDER VALUE */}
            {selectedNode.data.nodeType === 'condition_order_value' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Operador</label>
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
                  <label className="text-xs text-white/60">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => handleUpdate('value', e.target.value)}
                    placeholder="Ex: 100.00"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-[11px] text-amber-300">
                    💡 Exemplo: "Maior que R$ 100" vai seguir o caminho "Sim" se o pedido for acima de R$ 100
                  </p>
                </div>
              </>
            )}

            {/* CONDITION: DEAL VALUE */}
            {selectedNode.data.nodeType === 'condition_deal_value' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Operador</label>
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
                  <label className="text-xs text-white/60">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedNode.data.config?.value || ''}
                    onChange={(e) => handleUpdate('value', e.target.value)}
                    placeholder="Ex: 5000.00"
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-[11px] text-amber-300">
                    💡 Exemplo: "Maior que R$ 5.000" vai seguir o caminho "Sim" se o deal for acima desse valor
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
              <div className="space-y-2">
                <label className="text-xs text-white/60">
                  Porcentagem A: {selectedNode.data.config?.percentageA || 50}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedNode.data.config?.percentageA || 50}
                  onChange={(e) => handleUpdate('percentageA', parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>A: {selectedNode.data.config?.percentageA || 50}%</span>
                  <span>B: {100 - (selectedNode.data.config?.percentageA || 50)}%</span>
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
                  <label className="text-xs text-white/60">URL</label>
                  <input
                    type="url"
                    value={selectedNode.data.config?.url || ''}
                    onChange={(e) => handleUpdate('url', e.target.value)}
                    placeholder="https://..."
                    className={cn(
                      'w-full px-3 py-2 rounded-lg',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Método</label>
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
                  <label className="text-xs text-white/60">Headers (JSON)</label>
                  <textarea
                    value={selectedNode.data.config?.headers || '{}'}
                    onChange={(e) => handleUpdate('headers', e.target.value)}
                    placeholder='{"Content-Type": "application/json"}'
                    rows={2}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none font-mono text-xs',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Body (JSON)</label>
                  <textarea
                    value={selectedNode.data.config?.body || ''}
                    onChange={(e) => handleUpdate('body', e.target.value)}
                    placeholder='{"contact": "{{contact.email}}"}'
                    rows={4}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none font-mono text-xs',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-white placeholder-white/30',
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
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Mensagem</label>
                  <textarea
                    value={selectedNode.data.config?.message || ''}
                    onChange={(e) => handleUpdate('message', e.target.value)}
                    placeholder="Olá {{contact.name}}! Sua mensagem aqui..."
                    rows={3}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg resize-none',
                      'bg-[#0a0a0a] border border-white/10',
                      'text-sm text-white placeholder-white/30',
                      'focus:outline-none focus:border-blue-500/50'
                    )}
                  />
                  <p className="text-[10px] text-white/40">
                    Máximo 160 caracteres por segmento SMS
                  </p>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-[11px] text-amber-300">
                    📱 SMS será enviado para o telefone do contato
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Variables hint */}
          <section className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-[11px] text-blue-300">
              💡 Use variáveis como <code className="bg-blue-500/20 px-1 rounded">{'{{contact.name}}'}</code> para personalizar
            </p>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(selectedNode.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg',
              'bg-white/5 hover:bg-white/10',
              'text-sm text-white/60 hover:text-white',
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
          'bg-[#0a0a0a] border border-white/10',
          'text-sm text-white',
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
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
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
      <p className="text-[11px] text-white/50">
        Selecione os campos que deseja atualizar:
      </p>
      
      {CONTACT_FIELDS.map((field) => (
        <div key={field.key} className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedFields.includes(field.key)}
              onChange={() => handleFieldToggle(field.key)}
              className="w-4 h-4 rounded border-white/20 bg-transparent text-blue-500 focus:ring-blue-500/30"
            />
            <span className="text-xs text-white/60">{field.label}</span>
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
                  'bg-[#0a0a0a] border border-white/10',
                  'text-sm text-white placeholder-white/30',
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
                  'bg-[#0a0a0a] border border-white/10',
                  'text-sm text-white placeholder-white/30',
                  'focus:outline-none focus:border-blue-500/50'
                )}
              />
            )
          )}
        </div>
      ))}
      
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-[11px] text-blue-300">
          💡 Use variáveis: <code className="bg-blue-500/20 px-1 rounded">{'{{trigger.new_name}}'}</code>
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
        <span className="text-xs text-white/60">Combinar condições com:</span>
        <div className="flex gap-1">
          <button
            onClick={() => onLogicOperatorChange('and')}
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              logicOperator === 'and'
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
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
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            )}
          >
            OU (OR)
          </button>
        </div>
      </div>

      {/* Conditions List */}
      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div key={index} className="p-3 bg-white/5 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase">
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
                'bg-[#0a0a0a] border border-white/10 text-white'
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
                'bg-[#0a0a0a] border border-white/10 text-white'
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
                  'bg-[#0a0a0a] border border-white/10 text-white placeholder-white/30'
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
          'border border-dashed border-white/20',
          'text-white/60 hover:text-white hover:border-white/40',
          'transition-colors'
        )}
      >
        + Adicionar Condição
      </button>

      {conditions.length === 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-[11px] text-amber-300">
            ⚠️ Adicione pelo menos uma condição para o filtro funcionar
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
        <label className="text-xs text-white/60">Loja (opcional)</label>
        <div className="relative">
          <select
            value={config.storeId || ''}
            onChange={(e) => onUpdate('storeId', e.target.value)}
            disabled={loadingStores}
            className={cn(
              'w-full px-3 py-2 rounded-lg appearance-none',
              'bg-[#0a0a0a] border border-white/10',
              'text-sm text-white',
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
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        </div>
        <p className="text-[10px] text-white/40">
          Filtre por loja específica ou deixe vazio para todas
        </p>
      </div>

      {/* Minimum Value Filter */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Valor Mínimo (opcional)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/40">R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={config.minValue || ''}
            onChange={(e) => onUpdate('minValue', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="0.00"
            className={cn(
              'flex-1 px-3 py-2 rounded-lg',
              'bg-[#0a0a0a] border border-white/10',
              'text-sm text-white placeholder-white/30',
              'focus:outline-none focus:border-blue-500/50'
            )}
          />
        </div>
        <p className="text-[10px] text-white/40">
          Só dispara para pedidos acima deste valor
        </p>
      </div>

      {/* Status Filter for Order Paid */}
      {label === 'Pedido Pago' && (
        <div className="space-y-2">
          <label className="text-xs text-white/60">Status de Pagamento</label>
          <div className="relative">
            <select
              value={config.paymentStatus || 'paid'}
              onChange={(e) => onUpdate('paymentStatus', e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded-lg appearance-none',
                'bg-[#0a0a0a] border border-white/10',
                'text-sm text-white',
                'focus:outline-none focus:border-blue-500/50'
              )}
            >
              <option value="paid">Pago</option>
              <option value="partially_paid">Parcialmente Pago</option>
              <option value="any">Qualquer status de pagamento</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
        <p className="text-[11px] text-emerald-300">
          🛒 {label}: Dispara quando um pedido {label === 'Pedido Pago' ? 'for pago' : 'for criado'}
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
        <label className="text-xs text-white/60">Título da Notificação</label>
        <input
          type="text"
          value={config.title || ''}
          onChange={(e) => onUpdate('title', e.target.value)}
          placeholder="Ex: Nova ação necessária"
          className={cn(
            'w-full px-3 py-2 rounded-lg',
            'bg-[#0a0a0a] border border-white/10',
            'text-sm text-white placeholder-white/30',
            'focus:outline-none focus:border-blue-500/50'
          )}
        />
      </div>

      {/* Message */}
      <div className="space-y-2">
        <label className="text-xs text-white/60">Mensagem</label>
        <textarea
          value={config.message || ''}
          onChange={(e) => onUpdate('message', e.target.value)}
          placeholder="Mensagem da notificação..."
          rows={3}
          className={cn(
            'w-full px-3 py-2 rounded-lg resize-none',
            'bg-[#0a0a0a] border border-white/10',
            'text-sm text-white placeholder-white/30',
            'focus:outline-none focus:border-blue-500/50'
          )}
        />
      </div>

      {/* User Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/60">Notificar Usuários</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] text-blue-400 hover:text-blue-300"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="text-[10px] text-white/40 hover:text-white/60"
            >
              Nenhum
            </button>
          </div>
        </div>
        
        <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-[#0a0a0a] rounded-lg border border-white/10">
          {loadingUsers ? (
            <p className="text-xs text-white/40 text-center py-2">Carregando...</p>
          ) : users.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-2">Nenhum usuário encontrado</p>
          ) : (
            users.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="w-4 h-4 rounded border-white/20 bg-transparent text-blue-500"
                />
                <span className="text-xs text-white/80">
                  {user.name || user.email}
                </span>
              </label>
            ))
          )}
        </div>
        
        <p className="text-[10px] text-white/40">
          {selectedUserIds.length} usuário(s) selecionado(s)
        </p>
      </div>

      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-[11px] text-blue-300">
          🔔 A notificação aparecerá no sino de notificações dos usuários selecionados
        </p>
      </div>
    </div>
  );
}

export default PropertiesPanel;
