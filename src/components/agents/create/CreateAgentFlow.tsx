'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  Sparkles,
  Target,
  User,
  FileText,
  Database,
  Rocket,
  Store,
  AlertCircle,
} from 'lucide-react';
import {
  Step1Niche,
  Step2Function,
  Step3Personalize,
  Step4PromptPreview,
  Step5Knowledge,
  Step6Activate,
  type AgentFunction,
} from './steps';
import { AgentsTheme } from '../ui/AgentsTheme';
import { Stepper } from '../ui/primitives';
import {
  NicheTemplate,
  getTemplateById,
  getTemplateDefaultsExtended,
  generatePromptFromTemplate,
} from '@/lib/ai/templates';
import { templateActionToAgentActionPayload } from '@/lib/ai/templates/action-adapter';
import type { StoreAnalysis } from '@/types/store-analysis';

interface CreateAgentFlowProps {
  organizationId: string;
  storeId?: string;
  onClose: () => void;
  onSuccess: (agentId: string) => void;
}

// Steps configuration - 6 steps
const STEPS = [
  { id: 1, name: 'Nicho', icon: Sparkles },
  { id: 2, name: 'Função', icon: Target },
  { id: 3, name: 'Personalizar', icon: User },
  { id: 4, name: 'Prompt', icon: FileText },
  { id: 5, name: 'Conhecimento', icon: Database },
  { id: 6, name: 'Ativar', icon: Rocket },
];

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  enabled: boolean;
  isCustom?: boolean;
}

// Default agent function
const DEFAULT_AGENT_FUNCTION: AgentFunction = {
  objective: 'sales',
  mainTasks: [
    'Responder dúvidas sobre produtos',
    'Recomendar produtos baseado nas necessidades',
    'Informar preços e disponibilidade',
  ],
  limitations: [],
  handoffRules: 'Transferir para humano quando o cliente estiver irritado ou pedir para falar com atendente.',
};

export function CreateAgentFlow({
  organizationId,
  storeId,
  onClose,
  onSuccess,
}: CreateAgentFlowProps) {
  // Current step
  const [currentStep, setCurrentStep] = useState(1);

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<NicheTemplate | null>(null);

  // Store analysis
  const [storeAnalysis, setStoreAnalysis] = useState<StoreAnalysis | null>(null);
  const [analyzingStore, setAnalyzingStore] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Agent function (NEW)
  const [agentFunction, setAgentFunction] = useState<AgentFunction>(DEFAULT_AGENT_FUNCTION);

  // Persona
  const [persona, setPersona] = useState<{
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  }>({
    tone: 'friendly',
    responseLength: 'medium',
    replyDelay: 3,
  });

  // FAQ
  const [faqItems, setFAQItems] = useState<FAQItem[]>([]);

  // Prompt (NEW)
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [editedPrompt, setEditedPrompt] = useState('');

  // Draft agent (NEW) - created early to allow knowledge upload
  const [draftAgentId, setDraftAgentId] = useState<string | null>(null);

  // Creating state
  const [creating, setCreating] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionsSeeded, setActionsSeeded] = useState(false);

  // Auto-load analysis if storeId provided
  useEffect(() => {
    if (storeId) {
      loadExistingAnalysis();
    }
  }, [storeId]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Generate prompt when entering step 4
  useEffect(() => {
    if (currentStep === 4 && selectedTemplate) {
      const prompt = buildFullPrompt();
      setGeneratedPrompt(prompt);
      if (!editedPrompt) {
        setEditedPrompt(prompt);
      }
    }
  }, [currentStep, selectedTemplate, formData, persona, agentFunction]);

  // Garantir draft quando entrar no Step 5 (mesmo via indicador)
  useEffect(() => {
    if (currentStep === 5 && !draftAgentId && selectedTemplate) {
      createDraftAgent();
    }
  }, [currentStep, draftAgentId, selectedTemplate]);

  // Load existing analysis
  const loadExistingAnalysis = async () => {
    if (!storeId) return;
    
    try {
      const res = await fetch(`/api/ai/analyze-store?storeId=${storeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          setStoreAnalysis(data.analysis);
          
          // Auto-select template if suggested
          if (data.analysis.suggestedTemplate) {
            const template = getTemplateById(data.analysis.suggestedTemplate);
            if (template) {
              handleSelectTemplate(template);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error loading analysis:', err);
    }
  };

  // Analyze store
  const handleAnalyzeStore = async () => {
    if (!storeId) return;
    
    setAnalyzingStore(true);
    setAnalysisError(null);
    
    try {
      const res = await fetch('/api/ai/analyze-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          organization_id: organizationId,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao analisar loja');
      }
      
      setStoreAnalysis(data.analysis);
      
      // Auto-select template
      if (data.analysis.suggestedTemplate) {
        const template = getTemplateById(data.analysis.suggestedTemplate);
        if (template) {
          handleSelectTemplate(template);
        }
      }
    } catch (err: any) {
      setAnalysisError(err.message);
    } finally {
      setAnalyzingStore(false);
    }
  };

  // Select template
  const handleSelectTemplate = (template: NicheTemplate) => {
    setSelectedTemplate(template);
    
    // Load defaults
    const defaults = getTemplateDefaultsExtended(template, storeAnalysis || undefined);
    setFormData(defaults.formData);
    setPersona(defaults.persona);
    setFAQItems(defaults.faqItems);
    
    // Update agent function based on template
    if (template.id !== 'custom') {
      const templateObjectives: Record<string, string> = {
        'moda-feminina': 'sales',
        'pet-shop': 'sales',
        'fitness': 'sales',
        'beleza': 'sales',
        'delivery': 'support',
        'casa': 'sales',
        'baby': 'sales',
        'joias': 'sales',
      };
      setAgentFunction({
        ...DEFAULT_AGENT_FUNCTION,
        objective: templateObjectives[template.id] || 'sales',
      });
    }
  };

  // Build full prompt with all sections
  const buildFullPrompt = (): string => {
    if (!selectedTemplate) return '';
    
    // Generate base prompt from template
    const templateData = {
      templateId: selectedTemplate.id,
      agentName: formData.storeName || formData.agentName || 'Assistente',
      storeId,
      customFieldValues: formData,
      persona,
      selectedFAQ: faqItems.filter((f) => f.enabled).map((f) => f.id),
      enabledActions: selectedTemplate.defaultActions?.filter((a) => a.enabled)?.map((a) => a.id) || [],
      storeAnalysis: storeAnalysis ? {
        storeName: storeAnalysis.storeName,
        storeDescription: storeAnalysis.storeDescription,
        detectedNiche: storeAnalysis.detectedNiche,
        products: storeAnalysis.products?.total || 0,
        categories: storeAnalysis.categories?.map((c) => c.name) || [],
        priceRange: storeAnalysis.priceRange,
        policies: storeAnalysis.policies,
      } : undefined,
    };
    
    const generated = generatePromptFromTemplate(selectedTemplate, templateData);
    let prompt = generated.systemPrompt;
    
    // Add agent function section
    const objectiveLabels: Record<string, string> = {
      sales: 'Vendas e conversão',
      support: 'Atendimento e suporte',
      leads: 'Qualificação de leads',
      scheduling: 'Agendamento',
      faq: 'FAQ e informações',
      custom: agentFunction.objectiveCustom || 'Personalizado',
    };
    
    const functionSection = `

## SEU OBJETIVO PRINCIPAL
${objectiveLabels[agentFunction.objective] || agentFunction.objective}

## SUAS TAREFAS
${agentFunction.mainTasks.map(t => `- ${t}`).join('\n')}

${agentFunction.limitations.length > 0 ? `## LIMITAÇÕES IMPORTANTES
${agentFunction.limitations.map(l => `⚠️ ${l}`).join('\n')}
` : ''}
## QUANDO TRANSFERIR PARA HUMANO
${agentFunction.handoffRules}
`;
    
    prompt = prompt + functionSection;
    
    return prompt.trim();
  };

  // Create draft agent (for knowledge upload)
  const createDraftAgent = async (): Promise<string | null> => {
    if (draftAgentId) return draftAgentId;
    if (!selectedTemplate) return null;
    
    try {
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          name: formData.storeName || formData.agentName || `Assistente ${selectedTemplate.name}`,
          description: formData.storeDescription || selectedTemplate.description,
          system_prompt: editedPrompt || generatedPrompt,
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 500,
          is_active: false, // Draft - not active yet
          persona: {
            role_description: editedPrompt || generatedPrompt,
            tone: persona.tone,
            response_length: persona.responseLength,
            language: 'pt-BR',
            reply_delay: persona.replyDelay,
            guidelines: [
              ...(selectedTemplate?.defaultGuidelines || []),
              ...agentFunction.mainTasks,
            ],
          },
          settings: {
            channels: {
              all_channels: false,
              channel_ids: [], // Empty for now, will be set on activation
            },
            pipelines: {
              all_pipelines: true,
              pipeline_ids: [],
              stage_ids: [],
            },
            schedule: {
              always_active: true,
              timezone: 'America/Sao_Paulo',
              hours: { start: '08:00', end: '22:00' },
              days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            },
            behavior: {
              activate_on: 'new_message',
              stop_on_human_reply: true,
              cooldown_after_transfer: 300,
              max_messages_per_conversation: 0,
            },
          },
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar draft do agente');
      }
      
      setDraftAgentId(data.agent.id);
      return data.agent.id;
    } catch (err: any) {
      console.error('Error creating draft agent:', err);
      setCreateError(err.message);
      return null;
    }
  };

  // Best-effort: persiste as ações pré-configuradas do template no agente.
  // Falhas NÃO bloqueiam a criação (o agente já existe e funciona sem ações).
  const seedTemplateActions = async (agentId: string) => {
    if (actionsSeeded || !selectedTemplate) return;
    const enabled = (selectedTemplate.defaultActions || []).filter((a) => a.enabled);
    if (enabled.length === 0) return;
    setActionsSeeded(true);
    for (const ta of enabled) {
      try {
        await fetch(`/api/ai/agents/${agentId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: organizationId,
            ...templateActionToAgentActionPayload(ta),
          }),
        });
      } catch (err) {
        console.error('Error seeding template action:', err);
      }
    }
  };

  // Create/activate final agent
  const handleCreateAgent = async (activateNow: boolean, channelIds: string[]) => {
    if (!selectedTemplate) return;
    
    setCreating(true);
    setCreateError(null);
    
    try {
      // If we have a draft, update it; otherwise create new
      if (draftAgentId) {
        // Update existing draft
        const res = await fetch(`/api/ai/agents/${draftAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.storeName || formData.agentName || `Assistente ${selectedTemplate.name}`,
            description: formData.storeDescription || selectedTemplate.description,
            system_prompt: editedPrompt,
            is_active: activateNow,
            persona: {
              role_description: editedPrompt,
              tone: persona.tone,
              response_length: persona.responseLength,
              language: 'pt-BR',
              reply_delay: persona.replyDelay,
              guidelines: [
                ...(selectedTemplate?.defaultGuidelines || []),
                ...agentFunction.mainTasks,
              ],
            },
            settings: {
              channels: {
                all_channels: false,
                channel_ids: channelIds,
              },
              pipelines: {
                all_pipelines: true,
                pipeline_ids: [],
                stage_ids: [],
              },
              schedule: {
                always_active: true,
                timezone: 'America/Sao_Paulo',
                hours: { start: '08:00', end: '22:00' },
                days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
              },
              behavior: {
                activate_on: 'new_message',
                stop_on_human_reply: true,
                cooldown_after_transfer: 300,
                max_messages_per_conversation: 0,
              },
            },
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Erro ao atualizar agente');
        }

        setCreatedAgentId(draftAgentId);
        await seedTemplateActions(draftAgentId);
      } else {
        // Create new agent
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: organizationId,
            name: formData.storeName || formData.agentName || `Assistente ${selectedTemplate.name}`,
            description: formData.storeDescription || selectedTemplate.description,
            system_prompt: editedPrompt,
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            max_tokens: 500,
            is_active: activateNow,
            persona: {
              role_description: editedPrompt,
              tone: persona.tone,
              response_length: persona.responseLength,
              language: 'pt-BR',
              reply_delay: persona.replyDelay,
              guidelines: [
                ...(selectedTemplate?.defaultGuidelines || []),
                ...agentFunction.mainTasks,
              ],
            },
            settings: {
              channels: {
                all_channels: false,
                channel_ids: channelIds,
              },
              pipelines: {
                all_pipelines: true,
                pipeline_ids: [],
                stage_ids: [],
              },
              schedule: {
                always_active: true,
                timezone: 'America/Sao_Paulo',
                hours: { start: '08:00', end: '22:00' },
                days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
              },
              behavior: {
                activate_on: 'new_message',
                stop_on_human_reply: true,
                cooldown_after_transfer: 300,
                max_messages_per_conversation: 0,
              },
            },
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao criar agente');
        }
        
        setCreatedAgentId(data.agent.id);
        await seedTemplateActions(data.agent.id);
      }

    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Navigation
  const goToStep = (step: number) => {
    if (step < currentStep || canProceed(step - 1)) {
      setCurrentStep(step);
    }
  };

  const canProceed = (fromStep: number): boolean => {
    switch (fromStep) {
      case 1:
        return selectedTemplate !== null;
      case 2:
        return agentFunction.objective !== '' && agentFunction.mainTasks.length > 0;
      case 3:
        return formData.storeName?.trim() !== '' || formData.agentName?.trim() !== '';
      case 4:
        return editedPrompt.trim() !== '';
      case 5:
        return true; // Knowledge is optional
      default:
        return true;
    }
  };

  // Handle step 5 entry - create draft if needed
  const handleEnterStep5 = async () => {
    // Create draft agent for knowledge upload
    await createDraftAgent();
    setCurrentStep(5);
  };

  // Render current step content
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1Niche
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleSelectTemplate}
            storeId={storeId}
            storeAnalysis={storeAnalysis}
            onAnalyzeStore={handleAnalyzeStore}
            analyzingStore={analyzingStore}
            onNext={() => setCurrentStep(2)}
          />
        );
      case 2:
        return selectedTemplate ? (
          <Step2Function
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            agentFunction={agentFunction}
            onFunctionChange={setAgentFunction}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        ) : null;
      case 3:
        return selectedTemplate ? (
          <Step3Personalize
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            formData={formData}
            onFormDataChange={setFormData}
            persona={persona}
            onPersonaChange={setPersona}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        ) : null;
      case 4:
        return selectedTemplate ? (
          <Step4PromptPreview
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            formData={formData}
            persona={persona}
            agentFunction={agentFunction}
            generatedPrompt={generatedPrompt}
            editedPrompt={editedPrompt}
            onPromptChange={setEditedPrompt}
            onNext={handleEnterStep5}
            onBack={() => setCurrentStep(3)}
          />
        ) : null;
      case 5:
        return selectedTemplate ? (
          <Step5Knowledge
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            faqItems={faqItems}
            onFAQChange={setFAQItems}
            onNext={() => setCurrentStep(6)}
            onBack={() => setCurrentStep(4)}
            draftAgentId={draftAgentId}
            organizationId={organizationId}
          />
        ) : null;
      case 6:
        return selectedTemplate ? (
          <Step6Activate
            template={selectedTemplate}
            formData={formData}
            persona={persona}
            faqCount={faqItems.filter((f) => f.enabled).length}
            storeAnalysis={storeAnalysis}
            organizationId={organizationId}
            onBack={() => setCurrentStep(5)}
            onCreateAgent={handleCreateAgent}
            creating={creating}
            createdAgentId={createdAgentId}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <AgentsTheme>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal relative w-full max-w-5xl"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - fixo */}
          <div className="modal-head">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="modal-x">
                <X className="w-5 h-5" />
              </button>
              <h1 className="modal-title">Criar Agente de IA</h1>
            </div>

            {/* Steps indicator */}
            <Stepper
              className="hidden md:flex"
              steps={STEPS.map((step) => ({ label: step.name }))}
              current={currentStep - 1}
              onStepClick={(index) => goToStep(index + 1)}
              doneIcon={<Check className="w-3 h-3" />}
            />

            {/* Store indicator */}
            {storeId && storeAnalysis && (
              <span className="chip chip-green hidden lg:inline-flex">
                <Store className="w-4 h-4" />
                {storeAnalysis.storeName}
              </span>
            )}
          </div>

          {/* Content - scroll interno */}
          <div className="modal-body">
            <div className="max-w-2xl mx-auto">
              {/* Error display */}
              {(analysisError || createError) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="callout red mb-6"
                >
                  <AlertCircle className="flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Erro</p>
                    <p>{analysisError || createError}</p>
                  </div>
                </motion.div>
              )}

              {/* Step content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile step indicator - fixo no bottom */}
          <div className="modal-foot md:hidden justify-center">
            {STEPS.map((step) => (
              <span
                key={step.id}
                className="dotn"
                style={{
                  width: currentStep === step.id ? 22 : 7,
                  background:
                    currentStep === step.id
                      ? 'var(--brand)'
                      : currentStep > step.id
                      ? 'var(--green)'
                      : 'var(--border-strong)',
                  transition: '.18s',
                }}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AgentsTheme>
  );
}

export default CreateAgentFlow;
