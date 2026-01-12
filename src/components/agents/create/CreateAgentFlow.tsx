'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  ChevronRight,
  Sparkles,
  User,
  MessageSquare,
  Rocket,
  Store,
  AlertCircle,
} from 'lucide-react';
import { Step1Niche, Step2Personalize, Step3Knowledge, Step4Activate } from './steps';
import {
  NicheTemplate,
  getTemplateById,
  getTemplateDefaults,
  generatePromptFromTemplate,
} from '@/lib/ai/templates';
import type { StoreAnalysis } from '@/types/store-analysis';

interface CreateAgentFlowProps {
  organizationId: string;
  storeId?: string;
  onClose: () => void;
  onSuccess: (agentId: string) => void;
}

// Steps configuration
const STEPS = [
  { id: 1, name: 'Nicho', icon: Sparkles },
  { id: 2, name: 'Personalizar', icon: User },
  { id: 3, name: 'Conhecimento', icon: MessageSquare },
  { id: 4, name: 'Ativar', icon: Rocket },
];

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  enabled: boolean;
  isCustom?: boolean;
}

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

  // Creating state
  const [creating, setCreating] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Auto-load analysis if storeId provided
  useEffect(() => {
    if (storeId) {
      loadExistingAnalysis();
    }
  }, [storeId]);

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
        body: JSON.stringify({ storeId }),
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

  // Handle template selection
  const handleSelectTemplate = (template: NicheTemplate) => {
    setSelectedTemplate(template);
    
    // Set default values
    const defaults = getTemplateDefaults(template);
    setFormData(defaults);
    
    // Set persona defaults
    setPersona({
      tone: template.persona.tone,
      responseLength: template.persona.responseLength,
      replyDelay: template.persona.replyDelay,
    });
    
    // Initialize FAQ from template
    setFAQItems(
      template.suggestedFAQ.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        enabled: f.enabled,
        isCustom: false,
      }))
    );
  };

  // Create agent
  const handleCreateAgent = async (activateNow: boolean, channelIds: string[]) => {
    if (!selectedTemplate) return;
    
    setCreating(true);
    setCreateError(null);
    
    try {
      // Generate prompt
      const templateData = {
        templateId: selectedTemplate.id,
        agentName: formData.storeName || 'Assistente',
        storeId,
        customFieldValues: formData,
        persona,
        selectedFAQ: faqItems.filter((f) => f.enabled).map((f) => f.id),
        enabledActions: selectedTemplate.defaultActions.filter((a) => a.enabled).map((a) => a.id),
        storeAnalysis: storeAnalysis ? {
          storeName: storeAnalysis.storeName,
          storeDescription: storeAnalysis.storeDescription,
          detectedNiche: storeAnalysis.detectedNiche,
          products: storeAnalysis.products.total,
          categories: storeAnalysis.categories.map((c) => c.name),
          priceRange: storeAnalysis.priceRange,
          policies: storeAnalysis.policies,
        } : undefined,
      };
      
      const generated = generatePromptFromTemplate(selectedTemplate, templateData);
      
      // Create agent via API
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          name: formData.storeName || formData.agentName || `Assistente ${selectedTemplate.name}`,
          description: formData.storeDescription || selectedTemplate.description,
          system_prompt: generated.systemPrompt,
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 500,
          is_active: activateNow,
          persona: generated.persona,
          settings: {
            channels: {
              all_channels: channelIds.length === 0,
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
      
      // Create FAQ as sources (optional - could be separate API)
      // For now, FAQ is embedded in the prompt
      
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
        return formData.storeName?.trim() !== '';
      case 3:
        return true;
      default:
        return true;
    }
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
          <Step2Personalize
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            formData={formData}
            onFormDataChange={setFormData}
            persona={persona}
            onPersonaChange={setPersona}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        ) : null;
      case 3:
        return selectedTemplate ? (
          <Step3Knowledge
            template={selectedTemplate}
            storeAnalysis={storeAnalysis}
            faqItems={faqItems}
            onFAQChange={setFAQItems}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        ) : null;
      case 4:
        return selectedTemplate ? (
          <Step4Activate
            template={selectedTemplate}
            formData={formData}
            persona={persona}
            faqCount={faqItems.filter((f) => f.enabled).length}
            storeAnalysis={storeAnalysis}
            organizationId={organizationId}
            onBack={() => setCurrentStep(3)}
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
    <div className="fixed inset-0 z-50 bg-zinc-900">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Criar Agente de IA</h1>
        </div>

        {/* Steps indicator */}
        <div className="hidden md:flex items-center gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => goToStep(step.id)}
                  disabled={step.id > currentStep && !canProceed(step.id - 1)}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all
                    ${isCompleted
                      ? 'bg-green-500/20 text-green-400'
                      : isCurrent
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-zinc-800 text-zinc-500'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden lg:inline">{step.name}</span>
                </button>
                
                {index < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-zinc-600 mx-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Store indicator */}
        {storeId && storeAnalysis && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full">
            <Store className="w-4 h-4 text-green-400" />
            <span className="text-sm text-zinc-300">{storeAnalysis.storeName}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Error display */}
          {(analysisError || createError) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-400 font-medium">Erro</p>
                <p className="text-sm text-red-300">{analysisError || createError}</p>
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

      {/* Mobile step indicator */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-zinc-800 bg-zinc-900 flex items-center justify-center gap-2 px-4">
        {STEPS.map((step) => (
          <div
            key={step.id}
            className={`
              w-2 h-2 rounded-full transition-all
              ${currentStep === step.id
                ? 'w-8 bg-blue-500'
                : currentStep > step.id
                ? 'bg-green-500'
                : 'bg-zinc-700'
              }
            `}
          />
        ))}
      </div>
    </div>
  );
}

export default CreateAgentFlow;
