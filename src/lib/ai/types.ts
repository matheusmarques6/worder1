// =====================================================
// TIPOS PARA O SISTEMA DE AGENTES DE IA
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
  provider: string
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  persona: AgentPersona
  settings: AgentSettings
  total_messages: number
  total_conversations: number
  total_tokens_used: number
  avg_response_time_ms: number
  created_at: string
  updated_at: string
}

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

export interface AgentSource {
  id: string
  organization_id: string
  agent_id: string
  source_type: 'url' | 'file' | 'text' | 'products'
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
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message?: string
  chunks_count: number
  created_at: string
  updated_at?: string
  processed_at?: string
}

export interface AgentChunk {
  id: string
  organization_id: string
  source_id: string
  agent_id: string
  content: string
  content_tokens?: number
  metadata: Record<string, any>
  embedding?: number[]
  created_at: string
}

// =====================================================
// AÇÕES (WHEN/DO RULES)
// =====================================================

export interface AgentAction {
  id: string
  organization_id: string
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
  type: 'intent' | 'sentiment' | 'contains' | 'time' | 'custom'
  intent?: string
  custom_intent?: string
  sentiment?: string
  keywords?: string[]
  time_range?: { start: string; end: string }
  days?: string[]
}

export interface ActionDo {
  id: string
  type: 'transfer' | 'exact_message' | 'use_source' | 'ask_for' | 'dont_mention' | 'bring_up'
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

export interface AgentIntegration {
  id: string
  organization_id: string
  agent_id: string
  integration_id?: string
  integration_type: 'shopify' | 'woocommerce' | 'nuvemshop'
  sync_products: boolean
  sync_orders: boolean
  allow_price_info: boolean
  allow_stock_info: boolean
  source_id?: string
  last_sync_at?: string
  products_synced: number
  sync_status: 'pending' | 'syncing' | 'synced' | 'error'
  sync_error?: string
  created_at: string
  updated_at?: string
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
// ENGINE - TIPOS DE PROCESSAMENTO
// =====================================================

export interface EngineConfig {
  agent: AIAgent
  organizationId: string
  apiKey: string
}

export interface EngineMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
}

export interface EngineContext {
  conversationId: string
  conversationHistory: EngineMessage[]
  contactInfo?: ContactInfo
}

export interface ContactInfo {
  id?: string
  name?: string
  phone?: string
  email?: string
  customFields?: Record<string, any>
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
// RAG - BUSCA SEMÂNTICA
// =====================================================

export interface RAGSearchParams {
  agentId: string
  query: string
  topK?: number
  threshold?: number
  sourceIds?: string[]
}

export interface RAGResult {
  chunk_id: string
  source_id: string
  source_name: string
  content: string
  metadata: Record<string, any>
  similarity: number
}

// =====================================================
// DETECÇÃO DE INTENÇÃO
// =====================================================

export interface DetectedIntent {
  intent: PredefinedIntent | string
  confidence: number
  custom_intent?: string
  all_intents?: Array<{ intent: string; confidence: number }>
}

// =====================================================
// ANÁLISE DE SENTIMENTO
// =====================================================

export interface SentimentResult {
  sentiment: Sentiment
  confidence: number
  score: number // -1 (muito negativo) a 1 (muito positivo)
}

// =====================================================
// PROCESSAMENTO DE DOCUMENTOS
// =====================================================

export interface ProcessedDocument {
  content: string
  metadata: {
    title?: string
    pages?: number
    url?: string
    source_type: string
    file_name?: string
    file_size?: number
    word_count?: number
  }
}

export interface TextChunk {
  content: string
  tokens: number
  index: number
  metadata: Record<string, any>
}

export interface ChunkOptions {
  maxTokens?: number
  overlap?: number
  separator?: string
}

// =====================================================
// API RESPONSES
// =====================================================

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  total: number
  page: number
  limit: number
  has_more: boolean
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
