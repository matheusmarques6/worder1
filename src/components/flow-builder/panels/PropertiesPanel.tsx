'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Copy, Settings, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, useSelectedNode } from '@/stores/flowStore';
import { getNodeDefinition, getNodeColor } from './nodes/nodeTypes';

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

export function PropertiesPanel({ organizationId }: { organizationId?: string }) {
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
  }, [selectedNode?.data.nodeType, organizationId]);

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

            {/* EMAIL ACTION */}
            {selectedNode.data.nodeType === 'action_email' && (
              <>
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
                  <label className="text-xs text-white/60">Template ID</label>
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
                <div className="space-y-2">
                  <label className="text-xs text-white/60">Template</label>
                  <input
                    type="text"
                    value={selectedNode.data.config?.templateId || ''}
                    onChange={(e) => handleUpdate('templateId', e.target.value)}
                    placeholder="ID do template WhatsApp"
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
                    ]}
                  />
                </div>
              </>
            )}

            {/* NOTIFY ACTION */}
            {selectedNode.data.nodeType === 'action_notify' && (
              <div className="space-y-2">
                <label className="text-xs text-white/60">Mensagem</label>
                <textarea
                  value={selectedNode.data.config?.message || ''}
                  onChange={(e) => handleUpdate('message', e.target.value)}
                  placeholder="Mensagem de notificação..."
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg resize-none',
                    'bg-[#0a0a0a] border border-white/10',
                    'text-sm text-white placeholder-white/30',
                    'focus:outline-none focus:border-blue-500/50'
                  )}
                />
              </div>
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

export default PropertiesPanel;
