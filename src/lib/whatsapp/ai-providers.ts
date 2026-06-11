// =============================================
// AI PROVIDERS - OpenAI, Claude, Gemini
// =============================================

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'deepseek' | 'google' | 'openrouter';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Endpoint base override. Util pra OpenAI-compat (OpenRouter / proxies
   * privados). Se ausente, cada provider usa seu endpoint padrao.
   * Aceita "https://x.y/v1" ou "https://x.y/v1/chat/completions".
   */
  baseUrl?: string;
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
// TOOL-CALLING (Fase 2b) — tipos provider-agnósticos
// =============================================

/** Definição de tool no formato neutro consumido por loop.ts. */
export interface ProviderTool {
  name: string;
  description: string;
  /** JSON Schema (object). */
  parameters: Record<string, any>;
}

/** Uma chamada de tool emitida pelo modelo. */
export interface ProviderToolCall {
  /** id da call (Anthropic tool_use.id / OpenAI tool_call.id). Gemini não tem; geramos um. */
  id: string;
  name: string;
  args: any;
}

/**
 * Mensagem no formato neutro do loop. Para resultados de tool usamos
 * role 'tool' carregando os resultados (cada provider converte ao seu formato).
 */
export interface ToolLoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** texto (user/assistant/system) */
  content?: string;
  /** tool calls que o assistant pediu (quando role='assistant') */
  toolCalls?: ProviderToolCall[];
  /** resultados de tools (quando role='tool') */
  toolResults?: Array<{ id: string; name: string; result: any }>;
}

export interface ProviderToolResult {
  /** texto final (quando o modelo parou de chamar tools) */
  content: string;
  /** tool calls pedidas neste passo (vazio => resposta final) */
  toolCalls: ProviderToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** sinal de rate-limit do provedor (HTTP 429) para abort gracioso no loop. */
  rateLimited?: boolean;
}

/** Erro tipado para rate-limit (429) — o loop trata como abort gracioso. */
export class ProviderRateLimitError extends Error {
  constructor(message = 'rate_limited') {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

function isRateLimitStatus(status: number): boolean {
  return status === 429;
}

function genCallId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
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
// GROQ (API compatível com OpenAI)
// =============================================
async function callGroq(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'llama-3.1-70b-versatile',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Groq API error');
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
// OPENROUTER (compat OpenAI)
// =============================================
// OpenRouter usa o mesmo formato chat/completions da OpenAI. Aceita override
// de baseUrl (default https://openrouter.ai/api/v1). Headers HTTP-Referer e
// X-Title sao opcionais — mandamos quando NEXT_PUBLIC_APP_URL existir, util
// pra ranking de uso no painel deles.
function normalizeOpenAICompatUrl(base: string | undefined, fallback: string): string {
  const root = (base || fallback).replace(/\/$/, '');
  return root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
}

async function callOpenRouter(config: AIConfig, messages: AIMessage[]): Promise<AIResponse> {
  const url = normalizeOpenAICompatUrl(config.baseUrl, 'https://openrouter.ai/api/v1');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL;
  if (referer) {
    headers['HTTP-Referer'] = referer;
    headers['X-Title'] = 'Worder';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'openai/gpt-4o-mini',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenRouter API error');
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
    case 'google':
      return callGemini(config, finalMessages);
    case 'groq':
      return callGroq(config, finalMessages);
    case 'deepseek':
      return callDeepSeek(config, finalMessages);
    case 'openrouter':
      return callOpenRouter(config, finalMessages);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// =============================================
// TOOL-CALLING POR PROVIDER (Fase 2b)
// =============================================
// Cada função recebe o histórico no formato neutro (ToolLoopMessage[]) + as
// tools, faz UMA rodada, e devolve { content, toolCalls, usage }. O loop
// (src/lib/ai/tools/loop.ts) decide se executa as tools e chama de novo.

// ---- Anthropic ----
async function callAnthropicWithTools(
  config: AIConfig,
  messages: ToolLoopMessage[],
  tools: ProviderTool[],
): Promise<ProviderToolResult> {
  const systemMessage = messages.find((m) => m.role === 'system');

  // Converter histórico neutro -> blocos Anthropic.
  const anthropicMessages: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls || []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      anthropicMessages.push({ role: 'assistant', content: blocks });
    } else if (m.role === 'tool') {
      const blocks = (m.toolResults || []).map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
      }));
      anthropicMessages.push({ role: 'user', content: blocks });
    } else {
      anthropicMessages.push({ role: 'user', content: m.content || '' });
    }
  }

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
      temperature: config.temperature ?? 0.7,
      system: systemMessage?.content || config.systemPrompt || '',
      messages: anthropicMessages,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  });

  if (isRateLimitStatus(response.status)) {
    return { content: '', toolCalls: [], rateLimited: true };
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Anthropic API error');
  }

  let text = '';
  const toolCalls: ProviderToolCall[] = [];
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, args: block.input || {} });
    }
  }

  return {
    content: text,
    toolCalls,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// ---- OpenAI-compatível (OpenAI / Groq / DeepSeek) ----
async function callOpenAICompatWithTools(
  url: string,
  config: AIConfig,
  messages: ToolLoopMessage[],
  tools: ProviderTool[],
): Promise<ProviderToolResult> {
  // Converter histórico neutro -> mensagens OpenAI.
  const openaiMessages: any[] = [];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const msg: any = { role: 'assistant', content: m.content || '' };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.content = m.content || null;
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }));
      }
      openaiMessages.push(msg);
    } else if (m.role === 'tool') {
      for (const r of m.toolResults || []) {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: r.id,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
        });
      }
    } else {
      openaiMessages.push({ role: m.role, content: m.content || '' });
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: openaiMessages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
      tools: tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    }),
  });

  if (isRateLimitStatus(response.status)) {
    return { content: '', toolCalls: [], rateLimited: true };
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI-compatible API error');
  }

  const choice = data.choices?.[0]?.message || {};
  const toolCalls: ProviderToolCall[] = (choice.tool_calls || []).map((tc: any) => {
    let args: any = {};
    try {
      args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      args = {};
    }
    return { id: tc.id || genCallId('call'), name: tc.function?.name, args };
  });

  return {
    content: choice.content || '',
    toolCalls,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// ---- Gemini ----
async function callGeminiWithTools(
  config: AIConfig,
  messages: ToolLoopMessage[],
  tools: ProviderTool[],
): Promise<ProviderToolResult> {
  const systemMessage = messages.find((m) => m.role === 'system');

  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls || []) {
        parts.push({ functionCall: { name: tc.name, args: tc.args || {} } });
      }
      contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const parts = (m.toolResults || []).map((r) => ({
        functionResponse: {
          name: r.name,
          response: typeof r.result === 'object' && r.result !== null ? r.result : { result: r.result },
        },
      }));
      contents.push({ role: 'user', parts });
    } else {
      contents.push({ role: 'user', parts: [{ text: m.content || '' }] });
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-1.5-flash'}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMessage
          ? { parts: [{ text: systemMessage.content }] }
          : undefined,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ],
        generationConfig: {
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens ?? 1000,
        },
      }),
    },
  );

  if (isRateLimitStatus(response.status)) {
    return { content: '', toolCalls: [], rateLimited: true };
  }

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Gemini API error');
  }

  let text = '';
  const toolCalls: ProviderToolCall[] = [];
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: genCallId('gem'),
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    }
  }

  return {
    content: text,
    toolCalls,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Dispatcher de UMA rodada de tool-calling. Provider-agnóstico.
 * Mantém callAI (sem tools) intacto. 429 => rateLimited=true (sem throw).
 */
export async function callAIWithTools(
  config: AIConfig,
  messages: ToolLoopMessage[],
  tools: ProviderTool[],
): Promise<ProviderToolResult> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropicWithTools(config, messages, tools);
    case 'openai':
      return callOpenAICompatWithTools(
        'https://api.openai.com/v1/chat/completions',
        config,
        messages,
        tools,
      );
    case 'groq':
      return callOpenAICompatWithTools(
        'https://api.groq.com/openai/v1/chat/completions',
        config,
        messages,
        tools,
      );
    case 'deepseek':
      return callOpenAICompatWithTools(
        'https://api.deepseek.com/v1/chat/completions',
        config,
        messages,
        tools,
      );
    case 'openrouter':
      return callOpenAICompatWithTools(
        normalizeOpenAICompatUrl(config.baseUrl, 'https://openrouter.ai/api/v1'),
        config,
        messages,
        tools,
      );
    case 'gemini':
    case 'google':
      return callGeminiWithTools(config, messages, tools);
    default:
      throw new Error(`Unknown AI provider (tools): ${config.provider}`);
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
    role: (msg.direction === 'outbound' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: msg.content,
  }));

  // Adicionar mensagem atual
  messages.push({ role: 'user' as const, content: userMessage });

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

  const historyMessages: AIMessage[] = conversationHistory.slice(-5).map(msg => ({
    role: (msg.direction === 'outbound' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: msg.content,
  }));

  const messages: AIMessage[] = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: userMessage },
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
  google: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Rápido)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Mais capaz)' },
  ],
  groq: [
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Mais capaz)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Ultra rápido)' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Balanceado)' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Leve)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' },
  ],
};
