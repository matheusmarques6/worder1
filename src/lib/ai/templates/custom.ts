// =====================================================
// TEMPLATE: PERSONALIZADO
// src/lib/ai/templates/custom.ts
// =====================================================

import { NicheTemplate } from './types';

export const customTemplate: NicheTemplate = {
  id: 'custom',
  name: 'Personalizado',
  description: 'Crie seu agente do zero com total liberdade de configuração',
  icon: '⚙️',
  color: '#6b7280', // Gray
  
  category: 'services',
  subcategory: 'custom',
  tags: ['personalizado', 'custom', 'do zero', 'flexível'],
  
  persona: {
    tone: 'friendly',
    responseLength: 'medium',
    language: 'pt-BR',
    replyDelay: 3,
    
    vocabulary: [],
    emojis: ['😊', '👍', '✨'],
    
    greetings: [
      'Olá! Bem-vindo! Como posso ajudar você hoje?',
    ],
    
    voiceDescription: 'Defina o tom de voz ideal para seu negócio.',
  },
  
  promptTemplate: `## IDENTIDADE
Você é {{agentName}}, assistente virtual de **{{storeName}}**.
{{storeDescription}}

## SOBRE O NEGÓCIO
{{businessInfo}}

## TOM DE VOZ
{{voiceDescription}}

## SEU PAPEL
{{agentRole}}

## COMPORTAMENTO
{{agentBehavior}}

## LIMITAÇÕES
- Não forneça informações incorretas
- Se não souber algo, informe que vai verificar
- Transfira para humano quando necessário`,

  defaultGuidelines: [
    'Seja sempre cordial e prestativo',
    'Responda de forma clara e objetiva',
    'Se não souber a resposta, informe que vai verificar',
  ],
  
  suggestedFAQ: [],
  
  defaultActions: [
    {
      id: 'action-transfer-human',
      name: 'Transferir para humano',
      description: 'Transfere quando cliente pede atendimento humano',
      conditions: [{ type: 'intent', value: 'human' }],
      actions: [{ type: 'transfer', value: 'queue' }],
      matchType: 'any',
      enabled: true,
    },
  ],
  
  customFields: [
    {
      id: 'storeName',
      label: 'Nome do negócio',
      placeholder: 'Ex: Minha Empresa',
      helpText: 'Nome da sua empresa ou loja',
      type: 'text',
      required: true,
      insertInto: 'prompt',
      variable: '{{storeName}}',
    },
    {
      id: 'storeDescription',
      label: 'Descrição do negócio',
      placeholder: 'Ex: Empresa especializada em...',
      helpText: 'Breve descrição do que você faz',
      type: 'textarea',
      required: false,
      insertInto: 'prompt',
      variable: '{{storeDescription}}',
    },
    {
      id: 'businessInfo',
      label: 'Informações importantes',
      placeholder: 'Ex: Horário de funcionamento, localização, serviços...',
      helpText: 'Informações que o agente precisa saber',
      type: 'textarea',
      required: false,
      insertInto: 'prompt',
      variable: '{{businessInfo}}',
    },
    {
      id: 'agentRole',
      label: 'Papel do agente',
      placeholder: 'Ex: Ajudar clientes com dúvidas, agendar serviços...',
      helpText: 'O que o agente deve fazer',
      type: 'textarea',
      required: false,
      defaultValue: '- Ajudar clientes com dúvidas\n- Fornecer informações sobre produtos/serviços\n- Resolver problemas',
      insertInto: 'prompt',
      variable: '{{agentRole}}',
    },
    {
      id: 'agentBehavior',
      label: 'Comportamento esperado',
      placeholder: 'Ex: Seja sempre cordial, pergunte antes de recomendar...',
      helpText: 'Como o agente deve se comportar',
      type: 'textarea',
      required: false,
      defaultValue: '- Seja cordial e prestativo\n- Responda de forma clara\n- Pergunte se pode ajudar com mais alguma coisa',
      insertInto: 'prompt',
      variable: '{{agentBehavior}}',
    },
    {
      id: 'mainEmoji',
      label: 'Emoji principal',
      placeholder: 'Ex: 😊',
      helpText: 'Emoji que representa sua marca (opcional)',
      type: 'text',
      required: false,
      defaultValue: '😊',
      insertInto: 'prompt',
      variable: '{{mainEmoji}}',
    },
  ],
  
  recommendedIntegrations: [],
};

export default customTemplate;
