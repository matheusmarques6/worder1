'use client';

// =============================================
// Componente: Pipeline Automation Config
// Configuração de automações dentro do Pipeline
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, 
  MessageSquare, 
  Zap, 
  FileText,
  Flame,
  Link,
  X,
  Download,
  Users,
  Loader2,
  Check
} from 'lucide-react';
import { useAuthStore } from '@/stores';
import type { 
  PipelineAutomationRule, 
  AutomationSourceType,
  AutomationTriggerEvent,
  AutomationActionType,
  AutomationAvailableSource,
  PipelineStage 
} from '@/types';
import { AUTOMATION_EVENTS } from '@/types';
import ShopifyImportModal from '@/components/integrations/shopify/ShopifyImportModal';

// =============================================
// TIPOS
// =============================================

interface PipelineAutomationConfigProps {
  pipelineId: string;
  stages: PipelineStage[];
}

// =============================================
// CONSTANTES
// =============================================

const SOURCE_ICONS: Record<AutomationSourceType, React.ReactNode> = {
  shopify: <ShoppingCart className="w-5 h-5" />,
  whatsapp: <MessageSquare className="w-5 h-5" />,
  hotmart: <Flame className="w-5 h-5" />,
  webhook: <Link className="w-5 h-5" />,
  form: <FileText className="w-5 h-5" />,
};

const SOURCE_COLORS: Record<AutomationSourceType, string> = {
  shopify: '#95BF47',
  whatsapp: '#25D366',
  hotmart: '#F04E23',
  webhook: '#8B5CF6',
  form: '#3B82F6',
};

// =============================================
// COMPONENTE PRINCIPAL
// =============================================

export function PipelineAutomationConfig({
  pipelineId,
  stages,
}: PipelineAutomationConfigProps) {
  const { user } = useAuthStore();
  const organizationId = user?.organization_id;

  // Estados
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<PipelineAutomationRule[]>([]);
  const [sources, setSources] = useState<AutomationAvailableSource[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Form states
  const [selectedSource, setSelectedSource] = useState<AutomationSourceType>('shopify');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<AutomationActionType>('create_deal');
  const [selectedEvents, setSelectedEvents] = useState<AutomationTriggerEvent[]>([]);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // =============================================
  // CARREGAR DADOS
  // =============================================

  const loadAutomations = useCallback(async () => {
    if (!pipelineId || !organizationId) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/pipelines/${pipelineId}/automations?organizationId=${organizationId}`
      );
      const data = await response.json();

      if (data.success) {
        const loadedRules = data.data.rules || [];
        const loadedSources = data.data.sources || [];
        
        setRules(loadedRules);
        setSources(loadedSources);
        
        // Encontrar primeira fonte conectada
        const firstConnectedSource = loadedSources.find((s: AutomationAvailableSource) => s.connected);
        if (firstConnectedSource) {
          setSelectedSource(firstConnectedSource.type);
          
          // Preencher eventos selecionados baseado nas regras existentes
          const existingEvents = loadedRules
            .filter((r: PipelineAutomationRule) => r.source_type === firstConnectedSource.type)
            .map((r: PipelineAutomationRule) => r.trigger_event);
          setSelectedEvents(existingEvents);

          // Preencher estágio
          const firstRule = loadedRules.find((r: PipelineAutomationRule) => r.source_type === firstConnectedSource.type);
          if (firstRule) {
            setSelectedStage(firstRule.target_stage_id);
            setSelectedAction(firstRule.action_type);
          }
        }

        // Preencher tags (únicas de todas as regras)
        const existingTags: string[] = loadedRules.flatMap((r: PipelineAutomationRule) => r.auto_tags || []);
        setAutoTags([...new Set(existingTags)] as string[]);

        // Definir estágio padrão se não tiver
        if (!selectedStage && stages.length > 0) {
          setSelectedStage(stages[0].id);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar automações:', error);
    } finally {
      setLoading(false);
    }
  }, [pipelineId, organizationId, stages]);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  // Definir estágio padrão quando stages mudar
  useEffect(() => {
    if (!selectedStage && stages.length > 0) {
      setSelectedStage(stages[0].id);
    }
  }, [stages, selectedStage]);

  // =============================================
  // HANDLERS
  // =============================================

  const handleSourceChange = (source: AutomationSourceType) => {
    setSelectedSource(source);
    
    // Atualizar eventos selecionados para nova fonte
    const existingEvents = rules
      .filter(r => r.source_type === source)
      .map(r => r.trigger_event);
    setSelectedEvents(existingEvents);

    // Atualizar estágio e ação se tiver regra
    const firstRule = rules.find(r => r.source_type === source);
    if (firstRule) {
      setSelectedStage(firstRule.target_stage_id);
      setSelectedAction(firstRule.action_type);
    }
  };

  const handleEventToggle = (event: AutomationTriggerEvent) => {
    setSelectedEvents(prev => 
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !autoTags.includes(trimmedTag)) {
      setAutoTags([...autoTags, trimmedTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setAutoTags(autoTags.filter(t => t !== tag));
  };

  const handleSave = async () => {
    if (!organizationId || !selectedStage) return;

    try {
      setSaving(true);

      // Deletar regras antigas desta fonte
      const oldRules = rules.filter(r => r.source_type === selectedSource);
      for (const rule of oldRules) {
        await fetch(
          `/api/pipelines/${pipelineId}/automations?ruleId=${rule.id}`,
          { method: 'DELETE' }
        );
      }

      // Criar novas regras para cada evento selecionado
      for (const event of selectedEvents) {
        await fetch(`/api/pipelines/${pipelineId}/automations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            sourceType: selectedSource,
            triggerEvent: event,
            actionType: selectedAction,
            targetStageId: selectedStage,
            autoTags,
            isActive: true,
          }),
        });
      }

      // Recarregar
      await loadAutomations();
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setSaving(false);
    }
  };

  // =============================================
  // RENDER
  // =============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  const currentSource = sources.find(s => s.type === selectedSource);
  const availableEvents = AUTOMATION_EVENTS[selectedSource] || [];
  const isSourceConnected = currentSource?.connected ?? false;

  return (
    <div className="space-y-6">
      
      {/* Origem e Estágio */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">
            Origem
          </label>
          <select
            value={selectedSource}
            onChange={(e) => handleSourceChange(e.target.value as AutomationSourceType)}
            className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '20px',
              paddingRight: '40px',
            }}
          >
            {sources.map(source => (
              <option 
                key={source.type} 
                value={source.type}
              >
                {source.name} {!source.connected && '(Não conectado)'}
              </option>
            ))}
          </select>
          <p className="text-xs text-dark-500 mt-1">De onde vem o lead</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">
            Estágio inicial
          </label>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '20px',
              paddingRight: '40px',
            }}
          >
            {stages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-dark-500 mt-1">Onde o deal será criado</p>
        </div>
      </div>

      {/* Aviso se não conectado */}
      {!isSourceConnected && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-sm text-amber-400">
            ⚠️ Esta integração não está conectada. Vá em <strong>Integrações</strong> para conectar.
          </p>
        </div>
      )}

      {/* Tipo de Ação */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Ação
        </label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'create_deal', label: 'Criar deal', desc: 'Novo deal no estágio' },
            { value: 'move_deal', label: 'Mover deal', desc: 'Muda de estágio' },
            { value: 'update_contact', label: 'Atualizar', desc: 'Atualiza o contato' },
          ].map(action => (
            <button
              key={action.value}
              type="button"
              onClick={() => setSelectedAction(action.value as AutomationActionType)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedAction === action.value
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-dark-700 hover:border-dark-600'
              }`}
            >
              <span className="block text-white font-medium">{action.label}</span>
              <span className="block text-xs text-dark-400 mt-0.5">{action.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Eventos para sincronizar */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Eventos para sincronizar
        </label>
        <div className="space-y-2">
          {availableEvents.map(eventConfig => (
            <label
              key={eventConfig.event}
              className="flex items-start gap-3 p-4 bg-dark-800/50 rounded-xl cursor-pointer hover:bg-dark-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedEvents.includes(eventConfig.event)}
                onChange={() => handleEventToggle(eventConfig.event)}
                className="mt-0.5 w-5 h-5 rounded border-2 border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                style={{ accentColor: '#F97316' }}
              />
              <div>
                <span className="block text-white font-medium">{eventConfig.label}</span>
                <span className="block text-xs text-dark-400">{eventConfig.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Tags automáticas */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Tags automáticas
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
            placeholder="Nova tag..."
            className="flex-1 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl transition-colors"
          >
            Adicionar
          </button>
        </div>
        {autoTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {autoTags.map(tag => (
              <span
                key={tag}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/20 text-primary-400 rounded-lg text-sm"
              >
                {tag}
                <button 
                  type="button"
                  onClick={() => handleRemoveTag(tag)} 
                  className="hover:text-primary-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-dark-500 mt-2">
          Estas tags serão adicionadas automaticamente aos contatos
        </p>
      </div>

      {/* Importar Clientes - só mostra para Shopify conectado */}
      {selectedSource === 'shopify' && isSourceConnected && (
        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-white">Importar Clientes Existentes</h4>
              <p className="text-sm text-dark-400 mt-1">
                Importe todos os clientes já cadastrados no Shopify para o CRM
              </p>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Users className="w-4 h-4" />
                Importar Clientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão Salvar */}
      <div className="flex justify-end pt-4 border-t border-dark-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || selectedEvents.length === 0}
          className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Salvar Automações
            </>
          )}
        </button>
      </div>

      {/* Modal de Importação do Shopify */}
      {showImportModal && currentSource?.type === 'shopify' && currentSource?.integration_id && organizationId && (
        <ShopifyImportModal
          storeId={currentSource.integration_id}
          storeName={currentSource.integration_name || 'Shopify'}
          organizationId={organizationId}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
          }}
        />
      )}

    </div>
  );
}
