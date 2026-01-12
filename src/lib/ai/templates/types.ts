// =====================================================
// TIPOS PARA TEMPLATES NICHADOS
// src/lib/ai/templates/types.ts
// =====================================================

import { AgentPersona } from '../types';

/**
 * Template nichado para criação de agentes de IA
 * Cada nicho tem configurações específicas, prompt template,
 * FAQ sugerido e ações pré-configuradas
 */
export interface NicheTemplate {
  // Identificação
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  
  // Categorização
  category: 'ecommerce' | 'services' | 'saas' | 'local';
  subcategory: string;
  tags: string[];
  
  // Persona padrão
  persona: TemplatePersona;
  
  // Template do prompt (com variáveis {{variavel}})
  promptTemplate: string;
  
  // Diretrizes padrão
  defaultGuidelines: string[];
  
  // FAQ sugerido para o nicho
  suggestedFAQ: SuggestedFAQ[];
  
  // Ações pré-configuradas
  defaultActions: TemplateAction[];
  
  // Campos customizáveis pelo usuário
  customFields: CustomField[];
  
  // Integrações recomendadas
  recommendedIntegrations: string[];
}

/**
 * Persona específica do template
 */
export interface TemplatePersona {
  tone: 'casual' | 'friendly' | 'professional' | 'luxury';
  responseLength: 'short' | 'medium' | 'long';
  language: 'pt-BR' | 'en' | 'es' | 'auto';
  replyDelay: number;
  
  // Vocabulário específico do nicho
  vocabulary: string[];
  
  // Emojis apropriados
  emojis: string[];
  
  // Variações de saudação
  greetings: string[];
  
  // Descrição do tom de voz
  voiceDescription: string;
}

/**
 * FAQ sugerido para o nicho
 */
export interface SuggestedFAQ {
  id: string;
  question: string;
  answer: string;
  category: 'shipping' | 'returns' | 'payment' | 'product' | 'general' | 'support';
  priority: 'high' | 'medium' | 'low';
  enabled: boolean;
}

/**
 * Ação pré-configurada do template
 */
export interface TemplateAction {
  id: string;
  name: string;
  description: string;
  conditions: {
    type: 'intent' | 'sentiment' | 'contains' | 'time';
    value: string;
  }[];
  actions: {
    type: 'transfer' | 'exact_message' | 'use_source' | 'ask_for' | 'dont_mention';
    value: string;
  }[];
  matchType: 'all' | 'any';
  enabled: boolean;
}

/**
 * Campo customizável pelo usuário
 */
export interface CustomField {
  id: string;
  label: string;
  placeholder: string;
  helpText?: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'toggle';
  options?: { value: string; label: string }[];
  required: boolean;
  defaultValue?: string;
  
  // Onde este campo é inserido no prompt
  insertInto: 'prompt' | 'guidelines' | 'knowledge';
  
  // Variável no template (ex: {{storeName}})
  variable: string;
}

/**
 * Dados preenchidos pelo usuário ao criar agente
 */
export interface TemplateData {
  templateId: string;
  agentName: string;
  storeId?: string;
  
  // Valores dos campos customizáveis
  customFieldValues: Record<string, string>;
  
  // Personalizações
  persona: {
    tone: 'casual' | 'friendly' | 'professional' | 'luxury';
    responseLength: 'short' | 'medium' | 'long';
    replyDelay: number;
  };
  
  // FAQ selecionados
  selectedFAQ: string[];
  
  // Ações habilitadas
  enabledActions: string[];
  
  // Dados da análise de loja (se disponível)
  storeAnalysis?: {
    storeName: string;
    storeDescription: string;
    detectedNiche: string;
    products: number;
    categories: string[];
    priceRange: { min: number; max: number };
    policies: {
      shipping: string | null;
      returns: string | null;
    };
  };
}

/**
 * Resultado da geração do prompt
 */
export interface GeneratedPromptResult {
  systemPrompt: string;
  guidelines: string[];
  greeting: string;
  persona: AgentPersona;
}

// =====================================================
// CONSTANTES
// =====================================================

export const TEMPLATE_CATEGORIES = {
  ecommerce: {
    label: 'E-commerce',
    description: 'Lojas online e varejo',
    icon: '🛍️',
  },
  services: {
    label: 'Serviços',
    description: 'Prestação de serviços',
    icon: '🔧',
  },
  saas: {
    label: 'SaaS',
    description: 'Software como serviço',
    icon: '💻',
  },
  local: {
    label: 'Negócio Local',
    description: 'Estabelecimentos físicos',
    icon: '📍',
  },
};

export const TONE_OPTIONS = {
  casual: {
    label: 'Casual',
    description: 'Descontraído e informal',
    icon: '😎',
  },
  friendly: {
    label: 'Amigável',
    description: 'Acolhedor e simpático',
    icon: '😊',
  },
  professional: {
    label: 'Profissional',
    description: 'Formal e cortês',
    icon: '👔',
  },
  luxury: {
    label: 'Luxo',
    description: 'Sofisticado e exclusivo',
    icon: '✨',
  },
};

export const RESPONSE_LENGTH_OPTIONS = {
  short: {
    label: 'Curto',
    description: 'Respostas diretas (1-2 frases)',
    tokens: { min: 50, max: 150 },
  },
  medium: {
    label: 'Médio',
    description: 'Respostas balanceadas (2-4 frases)',
    tokens: { min: 100, max: 250 },
  },
  long: {
    label: 'Longo',
    description: 'Respostas detalhadas (4+ frases)',
    tokens: { min: 150, max: 400 },
  },
};
