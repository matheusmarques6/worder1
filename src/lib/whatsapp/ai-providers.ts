// =============================================
// AI PROVIDERS - OpenAI, Claude, Gemini
// =============================================

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// =============================================
// OPENAI
// =============================================
async function callOpenAI(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API error');
  }

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// =============================================
// ANTHROPIC (CLAUDE)
// =============================================
async function callAnthropic(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  // Separar system prompt
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-3-haiku-20240307',
      max_tokens: config.maxTokens ?? 1000,
      system: systemMessage?.content || config.systemPrompt || '',
      messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Anthropic API error');
  }

  return {
    content: data.content?.[0]?.text || '',
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// =============================================
// GOOGLE GEMINI
// =============================================
async function callGemini(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  // Converter formato de mensagens
  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-1.5-flash'}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
        generationConfig: {
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens ?? 1000,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Gemini API error');
  }

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

// =============================================
// DEEPSEEK
// =============================================
async function callDeepSeek(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'DeepSeek API error');
  }

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// =============================================
// FUNÇÃO PRINCIPAL - CHAMAR AI
// =============================================
export async function callAI(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  // Adicionar system prompt se fornecido
  const finalMessages: AIMessage[] = config.systemPrompt
    ? [{ role: 'system', content: config.systemPrompt }, ...messages]
    : messages;

  switch (config.provider) {
    case 'openai':
      return callOpenAI(config, finalMessages);
    case 'anthropic':
      return callAnthropic(config, finalMessages);
    case 'gemini':
      return callGemini(config, finalMessages);
    case 'deepseek':
      return callDeepSeek(config, finalMessages);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// =============================================
// GERAR RESPOSTA PARA WHATSAPP
// =============================================
export async function generateWhatsAppResponse(params: {
  config: AIConfig;
  conversationHistory: Array<{ direction: string; content: string }>;
  userMessage: string;
  contactName?: string;
  context?: string;
}): Promise<string> {
  const { config, conversationHistory, userMessage, contactName, context } = params;

  // Construir histórico de mensagens
  const messages: AIMessage[] = conversationHistory.slice(-10).map(msg => ({
    role: msg.direction === 'outbound' ? 'assistant' : 'user',
    content: msg.content,
  }));

  // Adicionar mensagem atual
  messages.push({ role: 'user', content: userMessage });

  // System prompt padrão para WhatsApp
  const defaultSystemPrompt = `Você é um assistente virtual amigável de atendimento ao cliente via WhatsApp.
${contactName ? `O cliente se chama ${contactName}.` : ''}
${context ? `Contexto adicional: ${context}` : ''}

Regras:
- Seja cordial e profissional
- Respostas curtas e diretas (máximo 2-3 parágrafos)
- Use emojis com moderação
- Não use markdown ou formatação especial
- Se não souber a resposta, ofereça transferir para um atendente humano
- Sempre pergunte se pode ajudar em mais alguma coisa`;

  const finalConfig: AIConfig = {
    ...config,
    systemPrompt: config.systemPrompt || defaultSystemPrompt,
  };

  const response = await callAI(finalConfig, messages);
  return response.content;
}

// =============================================
// SUGERIR RESPOSTA PARA AGENTE
// =============================================
export async function suggestResponse(params: {
  config: AIConfig;
  conversationHistory: Array<{ direction: string; content: string }>;
  userMessage: string;
}): Promise<string[]> {
  const { config, conversationHistory, userMessage } = params;

  const systemPrompt = `Você é um assistente que ajuda atendentes de WhatsApp.
Baseado na conversa, sugira 3 possíveis respostas curtas e profissionais.
Retorne APENAS as 3 sugestões, uma por linha, sem numeração.`;

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-5).map(msg => ({
      role: msg.direction === 'outbound' ? 'assistant' : 'user' as const,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await callAI({ ...config, systemPrompt: undefined }, messages);
  
  // Separar sugestões por linha
  return response.content
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 3);
}

// =============================================
// MODELOS DISPONÍVEIS
// =============================================
export const AI_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Mais capaz)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Rápido e barato)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Mais barato)' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Recomendado)' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Rápido)' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Mais capaz)' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Rápido)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Mais capaz)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
  ],
};
