// =============================================
// WHATSAPP CRM - CONFIGURAÇÕES DE ALTA ESCALA
// =============================================

// NOTE [Phase 4]: tier numerics (MPS / daily limits / tier names) and the
// `TierLevel` type now live in the single source of truth
// `src/config/whatsapp-tiers.ts`. The duplicate `TIER_CONFIG`/`TierLevel` that
// used to live here had zero importers and were DELETED to remove the divergent
// (and wrong: tier-1 daily 2000) copy.

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

  // Meta API - Atualizado para v21.0 (Março 2026)
  apiVersion: 'v21.0',
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
