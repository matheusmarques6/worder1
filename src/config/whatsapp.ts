// =============================================
// WHATSAPP CRM - CONFIGURAÇÕES DE ALTA ESCALA
// =============================================

// Tiers da Meta (Out 2025 - Portfolio-based)
export const TIER_CONFIG = {
  0: { name: 'Não verificado', mps: 10, daily: 250 },
  1: { name: 'Tier 1', mps: 40, daily: 2000 },
  2: { name: 'Tier 2', mps: 60, daily: 10000 },
  3: { name: 'Tier 3', mps: 80, daily: 100000 },
  4: { name: 'Unlimited', mps: 500, daily: Infinity }
} as const

export const WHATSAPP_CONFIG = {
  // Rate limiting
  targetMPS: 70,              // Target msg/segundo (margem de 80)
  burstCapacity: 100,         // Burst máximo
  pairRatePerMinute: 10,      // Máximo por destinatário/minuto
  
  // Retry com Exponential Backoff
  maxRetries: 5,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
  
  // Queue/Batch processing
  batchSize: 100,             // Recipients por batch
  parallelBatches: 5,         // Batches paralelos
  checkIntervalMs: 1000,      // Intervalo de check da queue
  staggerDelayMs: 2000,       // Delay entre batches iniciais
  
  // Circuit breaker
  failureThreshold: 5,        // Falhas antes de abrir
  resetTimeoutMs: 30000,      // Tempo para tentar novamente
  halfOpenMaxAttempts: 3,     // Tentativas em half-open
  
  // Agent settings
  maxConcurrentChats: 5,
  autoAwayTimeoutMinutes: 30,
  heartbeatIntervalMs: 5000,
  
  // Alertas
  quotaAlertThreshold: 0.8,   // Alertar em 80% da quota
  errorAlertThreshold: 10,    // Alertar após 10 erros
  
  // Meta API
  apiVersion: 'v18.0',
  apiBaseUrl: 'https://graph.facebook.com'
} as const

// Códigos de erro recuperáveis (fazer retry)
export const RETRYABLE_ERRORS = [
  429,      // Rate limit
  131056,   // Pair rate limit
  131053,   // Media upload failed
  500,      // Internal server error
  503,      // Service unavailable
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND'
]

// Códigos de erro fatais (não fazer retry)
export const FATAL_ERRORS = [
  131026,   // Message undeliverable
  131047,   // Re-engagement message required
  131051,   // Unsupported message type
  132000,   // Template not found
  132001,   // Template paused
  132005,   // Template param mismatch
  132007,   // Template content mismatch
  132012,   // Template hydration failed
]

export type TierLevel = keyof typeof TIER_CONFIG
