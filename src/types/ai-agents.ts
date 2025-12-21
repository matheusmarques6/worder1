// =====================================================
// TIPOS COMPARTILHADOS - SISTEMA DE AGENTES DE IA
// Usados tanto no frontend quanto no backend
// =====================================================

// =====================================================
// AGENTE
// =====================================================

export interface AIAgent {
  id: string
  organization_id: string
  name: string
  description?: string
  system_prompt?: string
  provider: AIProvider
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  persona: AgentPersona
  settings: AgentSettings
  total_messages: number
  total_conversations: number
  total_tokens_used: number
  avg_response_time_ms?: number
  created_at: string
  updated_at: string
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'deepseek'

export interface AgentPersona {
  role_description: string
  tone: 'casual' | 'friendly' | 'professional'
  response_length: 'short' | 'medium' | 'long'
  language: 'pt-BR' | 'en' | 'es' | 'auto'
  reply_delay: number
  guidelines: string[]
}

export interface AgentSettings {
  channels: {
    all_channels: boolean
    channel_ids: string[]
  }
  pipelines: {
    all_pipelines: boolean
    pipeline_ids: string[]
    stage_ids: string[]
  }
  schedule: {
    always_active: boolean
    timezone: string
    hours: { start: string; end: string }
    days: string[]
  }
  behavior: {
    activate_on: 'new_message' | 'pipeline_stage' | 'manual'
    stop_on_human_reply: boolean
    cooldown_after_transfer: number
    max_messages_per_conversation: number
  }
}

// =====================================================
// FONTES (KNOWLEDGE BASE)
// =====================================================

export type SourceType = 'url' | 'file' | 'text' | 'products'
export type SourceStatus = 'pending' | 'processing' | 'ready' | 'error'

export interface AgentSource {
  id: string
  organization_id?: string
  agent_id: string
  source_type: SourceType
  name: string
  url?: string
  pages_crawled?: number
  file_url?: string
  file_size_bytes?: number
  original_filename?: string
  mime_type?: string
  text_content?: string
  integration_id?: string
  integration_type?: string
  products_count?: number
  last_product_sync_at?: string
  status: SourceStatus
  error_message?: string
  chunks_count: number
  created_at: string
  updated_at?: string
  processed_at?: string
}

// =====================================================
// AÇÕES (WHEN/DO RULES)
// =====================================================

export type ConditionType = 'intent' | 'sentiment' | 'contains' | 'time' | 'custom'
export type ActionType = 'transfer' | 'exact_message' | 'use_source' | 'ask_for' | 'dont_mention' | 'bring_up'

export interface AgentAction {
  id: string
  organization_id?: string
  agent_id: string
  name: string
  description?: string
  is_active: boolean
  priority: number
  conditions: ActionConditions
  actions: ActionDo[]
  times_triggered: number
  last_triggered_at?: string
  created_at: string
  updated_at?: string
}

export interface ActionConditions {
  match_type: 'all' | 'any'
  items: ActionCondition[]
}

export interface ActionCondition {
  id: string
  type: ConditionType
  intent?: string
  custom_intent?: string
  sentiment?: string
  keywords?: string[]
  time_range?: { start: string; end: string }
  days?: string[]
}

export interface ActionDo {
  id: string
  type: ActionType
  transfer_to?: 'queue' | string
  agent_id?: string
  message?: string
  source_id?: string
  ask_field?: 'email' | 'phone' | 'name' | 'address' | string
  custom_field?: string
  topic?: string
}

// Intents pré-definidos
export type PredefinedIntent =
  | 'buy'
  | 'support'
  | 'refund'
  | 'human'
  | 'price'
  | 'delivery'
  | 'availability'
  | 'complaint'
  | 'greeting'
  | 'farewell'
  | 'other'

// Sentimentos
export type Sentiment =
  | 'frustrated'
  | 'confused'
  | 'happy'
  | 'neutral'
  | 'sad'
  | 'angry'

// =====================================================
// INTEGRAÇÕES
// =====================================================

export type IntegrationType = 'shopify' | 'woocommerce' | 'nuvemshop'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'

export interface AgentIntegration {
  id: string
  organization_id?: string
  agent_id: string
  integration_id?: string
  integration_type: IntegrationType
  sync_products: boolean
  sync_orders: boolean
  allow_price_info: boolean
  allow_stock_info: boolean
  source_id?: string
  last_sync_at?: string
  products_synced: number
  sync_status: SyncStatus
  sync_error?: string
  created_at: string
  updated_at?: string
}

// =====================================================
// ENGINE - TIPOS DE PROCESSAMENTO
// =====================================================

export interface EngineMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
}

export interface EngineResponse {
  response: string
  sources_used: string[]
  actions_triggered: string[]
  tokens_used: number
  response_time_ms: number
  was_transferred: boolean
  transfer_to?: string
  action_result?: ActionExecutionResult
}

export interface ActionExecutionResult {
  action_id: string
  action_type: string
  executed: boolean
  result?: any
  should_stop: boolean
  instructions?: string[]
}

// =====================================================
// LOGS DE USO
// =====================================================

export interface UsageLog {
  id: string
  organization_id: string
  agent_id: string
  conversation_id?: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost_cents: number
  response_time_ms: number
  chunks_used: number
  sources_used: string[]
  actions_triggered: string[]
  success: boolean
  error_message?: string
  created_at: string
}

// =====================================================
// API RESPONSES
// =====================================================

export interface APIResponse<T = any> {
  success?: boolean
  data?: T
  error?: string
  message?: string
}

export interface TestAgentResponse {
  response: string
  sources_used: string[]
  actions_triggered: string[]
  tokens_used: number
  response_time_ms: number
  was_transferred: boolean
  transfer_to?: string
  debug?: {
    sources_ids: string[]
    actions_ids: string[]
    action_result?: ActionExecutionResult
  }
}

// =====================================================
// DEFAULTS
// =====================================================

export const DEFAULT_PERSONA: AgentPersona = {
  role_description: '',
  tone: 'friendly',
  response_length: 'medium',
  language: 'pt-BR',
  reply_delay: 3,
  guidelines: [],
}

export const DEFAULT_SETTINGS: AgentSettings = {
  channels: { all_channels: true, channel_ids: [] },
  pipelines: { all_pipelines: true, pipeline_ids: [], stage_ids: [] },
  schedule: {
    always_active: true,
    timezone: 'America/Sao_Paulo',
    hours: { start: '08:00', end: '18:00' },
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
  behavior: {
    activate_on: 'new_message',
    stop_on_human_reply: true,
    cooldown_after_transfer: 300,
    max_messages_per_conversation: 0,
  },
}

export const RESPONSE_LENGTH_TOKENS = {
  short: { min: 50, max: 150 },
  medium: { min: 100, max: 250 },
  long: { min: 150, max: 400 },
}

export const PREDEFINED_INTENTS: PredefinedIntent[] = [
  'buy',
  'support',
  'refund',
  'human',
  'price',
  'delivery',
  'availability',
  'complaint',
  'greeting',
  'farewell',
  'other',
]

export const SENTIMENTS: Sentiment[] = [
  'frustrated',
  'confused',
  'happy',
  'neutral',
  'sad',
  'angry',
]

// =====================================================
// PRESETS PARA UI
// =====================================================

export const INTENT_PRESETS = [
  { id: 'buy', label: 'Cliente quer comprar' },
  { id: 'support', label: 'Cliente precisa de suporte' },
  { id: 'refund', label: 'Cliente quer reembolso' },
  { id: 'human', label: 'Cliente quer falar com humano' },
  { id: 'price', label: 'Cliente pergunta sobre preço' },
  { id: 'delivery', label: 'Cliente pergunta sobre entrega' },
  { id: 'availability', label: 'Cliente pergunta disponibilidade' },
  { id: 'complaint', label: 'Cliente faz reclamação' },
]

export const SENTIMENT_PRESETS = [
  { id: 'frustrated', label: 'Frustrado', color: 'text-red-400' },
  { id: 'confused', label: 'Confuso', color: 'text-yellow-400' },
  { id: 'happy', label: 'Satisfeito', color: 'text-green-400' },
  { id: 'neutral', label: 'Neutro', color: 'text-dark-400' },
  { id: 'sad', label: 'Triste', color: 'text-blue-400' },
  { id: 'angry', label: 'Irritado', color: 'text-red-500' },
]

export const ACTION_TYPE_PRESETS = [
  { id: 'transfer', label: 'Transferir para', color: 'bg-blue-500/20 text-blue-400' },
  { id: 'exact_message', label: 'Enviar mensagem exata', color: 'bg-green-500/20 text-green-400' },
  { id: 'use_source', label: 'Usar fonte específica', color: 'bg-purple-500/20 text-purple-400' },
  { id: 'ask_for', label: 'Pedir dados do cliente', color: 'bg-orange-500/20 text-orange-400' },
  { id: 'dont_mention', label: 'Nunca mencionar', color: 'bg-red-500/20 text-red-400' },
  { id: 'bring_up', label: 'Tentar abordar tópico', color: 'bg-yellow-500/20 text-yellow-400' },
]

export const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual', description: 'Descontraído e informal', emoji: '😊' },
  { value: 'friendly', label: 'Amigável', description: 'Cordial e acolhedor', emoji: '🤝' },
  { value: 'professional', label: 'Profissional', description: 'Formal e objetivo', emoji: '👔' },
] as const

export const RESPONSE_LENGTH_OPTIONS = [
  { value: 'short', label: 'Curtas', description: '100-200 caracteres', icon: '📝' },
  { value: 'medium', label: 'Médias', description: '150-250 caracteres', icon: '📄' },
  { value: 'long', label: 'Longas', description: '200-300 caracteres', icon: '📜' },
] as const

export const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'auto', label: 'Automático', flag: '🌐' },
] as const

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
  { value: 'google', label: 'Google', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'] },
  { value: 'groq', label: 'Groq', models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  { value: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'] },
] as const
