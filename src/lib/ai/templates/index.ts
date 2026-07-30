// =====================================================
// TEMPLATES INDEX
// src/lib/ai/templates/index.ts
//
// Exporta todos os templates e funções utilitárias
// =====================================================

import { modaFemininaTemplate } from './moda-feminina';
import { petShopTemplate } from './pet-shop';
import { fitnessTemplate } from './fitness';
import { belezaTemplate } from './beleza';
import { deliveryTemplate } from './delivery';
import { casaTemplate } from './casa';
import { babyTemplate } from './baby';
import { joiasTemplate } from './joias';
import { customTemplate } from './custom';
import type { NicheTemplate, TemplateData, GeneratedPromptResult } from './types';
import { AgentPersona } from '../types';

// =====================================================
// LISTA DE TODOS OS TEMPLATES
// =====================================================

export const ALL_TEMPLATES: NicheTemplate[] = [
  modaFemininaTemplate,
  petShopTemplate,
  fitnessTemplate,
  belezaTemplate,
  deliveryTemplate,
  casaTemplate,
  babyTemplate,
  joiasTemplate,
  customTemplate,
];

// =====================================================
// TEMPLATES POR CATEGORIA
// =====================================================

export const TEMPLATES_BY_CATEGORY = {
  ecommerce: ALL_TEMPLATES.filter(t => t.category === 'ecommerce'),
  services: ALL_TEMPLATES.filter(t => t.category === 'services'),
  local: ALL_TEMPLATES.filter(t => t.category === 'local'),
  saas: ALL_TEMPLATES.filter(t => t.category === 'saas'),
};

// =====================================================
// FUNÇÕES UTILITÁRIAS
// =====================================================

/**
 * Busca um template pelo ID
 */
export function getTemplateById(templateId: string): NicheTemplate | null {
  return ALL_TEMPLATES.find(t => t.id === templateId) || null;
}

/**
 * Busca templates por categoria
 */
export function getTemplatesByCategory(category: string): NicheTemplate[] {
  return ALL_TEMPLATES.filter(t => t.category === category);
}

/**
 * Busca templates por tag
 */
export function getTemplatesByTag(tag: string): NicheTemplate[] {
  return ALL_TEMPLATES.filter(t => t.tags.includes(tag.toLowerCase()));
}

/**
 * Remove seções cujo corpo ficou vazio depois da substituição.
 *
 * Um cabeçalho órfão ("## SOBRE O NEGÓCIO" seguido de nada) não é neutro: o
 * modelo lê a seção vazia como informação que deveria estar ali, gasta contexto
 * com ela e às vezes tenta preencher sozinho. Melhor não enviar a seção.
 */
function stripEmptySections(prompt: string): string {
  return prompt
    .split(/(?=^## )/m)
    .filter((block) => {
      if (!block.startsWith('## ')) return true; // preâmbulo antes do 1o header
      return block.replace(/^##[^\n]*/, '').trim() !== '';
    })
    .join('');
}

/**
 * Gera o prompt final substituindo as variáveis
 */
export function generatePromptFromTemplate(
  template: NicheTemplate,
  data: TemplateData
): GeneratedPromptResult {
  let prompt = template.promptTemplate;

  // Tabela única de variáveis. Antes havia dois caminhos de substituição —
  // um laço sobre customFieldValues e dois .replace() avulsos — e `agentName`
  // não estava em nenhum dos dois, apesar de existir em `data` e ser usado
  // logo abaixo na saudação. A limpeza final apagava a variável órfã, e o
  // prompt gravado no banco começava com "Você é , assistente virtual de X".
  // O wizard não coleta um nome de agente separado: `data.agentName` cai no
  // nome da loja (CreateAgentFlow.tsx). Repetir o mesmo nome nos dois lugares
  // renderia "Você é wdww, assistente virtual de **wdww**" — nesse caso o
  // genérico lê melhor.
  const storeNameValue = data.customFieldValues.storeName?.trim();
  const agentNameValue = data.agentName?.trim();
  const values: Record<string, string> = {
    agentName:
      !agentNameValue || agentNameValue === storeNameValue ? 'Assistente' : agentNameValue,
    voiceDescription: template.persona.voiceDescription,
    emojis: template.persona.emojis.join(' '),
  };
  // O que o lojista digitou vence o default do template — mas só se digitou
  // algo: string vazia não pode sobrescrever um default útil.
  Object.entries(data.customFieldValues).forEach(([key, value]) => {
    if (value != null && value !== '') values[key] = value;
  });

  // replaceAll com padrão string troca TODAS as ocorrências sem construir
  // regex — o caminho antigo montava `new RegExp('{{storeName}}')`, que só
  // funciona porque `{` solto é tolerado fora do modo unicode. A função de
  // replace evita que um `$&` no texto do lojista seja interpretado como
  // referência de captura.
  Object.entries(values).forEach(([key, value]) => {
    prompt = prompt.replaceAll(`{{${key}}}`, () => value.trim());
  });

  // Limpar variáveis não preenchidas
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, '');

  // Limpar linhas vazias extras
  prompt = prompt.replace(/\n{3,}/g, '\n\n');

  // Seções que perderam o corpo na limpeza acima não devem ir para o modelo
  prompt = stripEmptySections(prompt).trim();

  // Gerar guidelines
  const guidelines = [
    ...template.defaultGuidelines,
    ...(data.customFieldValues.guidelines?.split('\n').filter(Boolean) || []),
  ];
  
  // Gerar saudação
  const greetingTemplate = template.persona.greetings[0] || 'Olá! Como posso ajudar?';
  const greeting = greetingTemplate.replace(
    '{{storeName}}',
    data.customFieldValues.storeName || data.agentName
  );
  
  // Montar persona
  const persona: AgentPersona = {
    role_description: prompt,
    tone: data.persona.tone,
    response_length: data.persona.responseLength,
    language: template.persona.language,
    reply_delay: data.persona.replyDelay,
    guidelines,
  };
  
  return {
    systemPrompt: prompt,
    guidelines,
    greeting,
    persona,
  };
}

/**
 * Retorna cor do template em formato CSS
 */
export function getTemplateColor(templateId: string): string {
  const template = getTemplateById(templateId);
  return template?.color || '#6b7280';
}

/**
 * Retorna ícone do template
 */
export function getTemplateIcon(templateId: string): string {
  const template = getTemplateById(templateId);
  return template?.icon || '⚙️';
}

/**
 * Valida se todos os campos obrigatórios estão preenchidos
 */
export function validateTemplateData(
  template: NicheTemplate,
  data: TemplateData
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  template.customFields.forEach(field => {
    if (field.required && !data.customFieldValues[field.id]) {
      missingFields.push(field.label);
    }
  });
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Retorna valores padrão para um template
 */
export function getTemplateDefaults(template: NicheTemplate): Record<string, string> {
  const defaults: Record<string, string> = {};
  
  template.customFields.forEach(field => {
    if (field.defaultValue) {
      defaults[field.id] = field.defaultValue;
    }
  });
  
  return defaults;
}

/**
 * Interface para FAQ items no fluxo de criação
 */
interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  enabled: boolean;
  isCustom?: boolean;
}

/**
 * Interface para persona no fluxo de criação
 */
interface PersonaDefaults {
  tone: 'casual' | 'friendly' | 'professional' | 'luxury';
  responseLength: 'short' | 'medium' | 'long';
  replyDelay: number;
}

/**
 * Interface para retorno de getTemplateDefaultsExtended
 */
interface TemplateDefaultsExtended {
  formData: Record<string, string>;
  persona: PersonaDefaults;
  faqItems: FAQItem[];
}

/**
 * Retorna defaults estendidos para o fluxo de criação de agente
 * Inclui formData, persona e faqItems baseado no template e análise da loja
 */
export function getTemplateDefaultsExtended(
  template: NicheTemplate,
  storeAnalysis?: { suggestedFAQ?: Array<{ question: string; answer: string; category: string }> } | null
): TemplateDefaultsExtended {
  // Get form data defaults
  const formData: Record<string, string> = {};
  template.customFields.forEach(field => {
    if (field.defaultValue) {
      formData[field.id] = field.defaultValue;
    }
  });

  // Get persona defaults from template
  const persona: PersonaDefaults = {
    tone: template.persona?.tone || 'friendly',
    responseLength: template.persona?.responseLength || 'medium',
    replyDelay: template.persona?.replyDelay || 3,
  };

  // Get FAQ items - prefer store analysis if available
  let faqItems: FAQItem[] = [];
  
  if (storeAnalysis?.suggestedFAQ?.length) {
    faqItems = storeAnalysis.suggestedFAQ.map((f, i) => ({
      id: `store-faq-${i}`,
      question: f.question,
      answer: f.answer,
      category: f.category || 'general',
      enabled: true,
      isCustom: false,
    }));
  } else if (template.suggestedFAQ?.length) {
    faqItems = template.suggestedFAQ.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
      enabled: f.enabled,
      isCustom: false,
    }));
  }

  return { formData, persona, faqItems };
}

/**
 * Detecta template sugerido baseado em palavras-chave
 */
export function suggestTemplate(keywords: string[]): NicheTemplate | null {
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  
  // Buscar por tags
  for (const template of ALL_TEMPLATES) {
    const matchCount = template.tags.filter(tag => 
      lowerKeywords.some(kw => tag.includes(kw) || kw.includes(tag))
    ).length;
    
    if (matchCount >= 2) {
      return template;
    }
  }
  
  // Buscar por nome
  for (const template of ALL_TEMPLATES) {
    if (lowerKeywords.some(kw => template.name.toLowerCase().includes(kw))) {
      return template;
    }
  }
  
  return null;
}

// =====================================================
// EXPORTS
// =====================================================

export {
  modaFemininaTemplate,
  petShopTemplate,
  fitnessTemplate,
  belezaTemplate,
  deliveryTemplate,
  casaTemplate,
  babyTemplate,
  joiasTemplate,
  customTemplate,
};

export * from './types';
