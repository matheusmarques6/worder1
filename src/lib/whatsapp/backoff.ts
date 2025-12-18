// =============================================
// EXPONENTIAL BACKOFF COM JITTER
// Estratégia recomendada pela AWS para retry
// =============================================

export interface BackoffOptions {
  baseDelay?: number      // Delay inicial em ms (default: 1000)
  maxDelay?: number       // Delay máximo em ms (default: 30000)
  maxRetries?: number     // Tentativas máximas (default: 5)
  jitter?: 'full' | 'equal' | 'decorrelated' | 'none'  // Tipo de jitter (default: decorrelated)
}

export interface RetryOptions extends BackoffOptions {
  shouldRetry?: (error: any, attempt: number) => boolean
  onRetry?: (error: any, attempt: number, delay: number) => void
}

/**
 * Calcular delay com backoff exponencial
 */
export function calculateBackoff(
  attempt: number,
  options: BackoffOptions = {}
): number {
  const {
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = 'decorrelated',
  } = options

  let delay: number

  switch (jitter) {
    case 'none':
      // Exponencial puro: base * 2^attempt
      delay = baseDelay * Math.pow(2, attempt - 1)
      break

    case 'full':
      // Full jitter: random(0, base * 2^attempt)
      delay = Math.random() * baseDelay * Math.pow(2, attempt - 1)
      break

    case 'equal':
      // Equal jitter: base * 2^attempt / 2 + random(0, base * 2^attempt / 2)
      const temp = baseDelay * Math.pow(2, attempt - 1)
      delay = temp / 2 + Math.random() * (temp / 2)
      break

    case 'decorrelated':
    default:
      // Decorrelated jitter (recomendado pela AWS)
      // sleep = min(cap, random(base, sleep * 3))
      if (attempt === 1) {
        delay = baseDelay + Math.random() * baseDelay
      } else {
        // Usa o delay anterior * 3 como base
        const prevDelay = calculateBackoff(attempt - 1, { ...options, jitter: 'decorrelated' })
        delay = Math.random() * (prevDelay * 3 - baseDelay) + baseDelay
      }
      break
  }

  return Math.min(Math.round(delay), maxDelay)
}

/**
 * Calcular delays para todas as tentativas (útil para preview)
 */
export function getBackoffSchedule(
  maxRetries: number,
  options: BackoffOptions = {}
): number[] {
  const schedule: number[] = []
  for (let i = 1; i <= maxRetries; i++) {
    schedule.push(calculateBackoff(i, options))
  }
  return schedule
}

/**
 * Executar função com retry e backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = 'decorrelated',
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options

  let lastError: any
  let lastDelay = baseDelay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Verificar se deve tentar novamente
      if (!shouldRetry(error, attempt) || attempt === maxRetries) {
        throw error
      }

      // Calcular delay
      const delay = calculateBackoff(attempt, { baseDelay, maxDelay, jitter })
      lastDelay = delay

      // Callback de retry
      if (onRetry) {
        onRetry(error, attempt, delay)
      } else {
        console.log(
          `⏳ Retry ${attempt}/${maxRetries} in ${delay}ms - Error: ${error.message || error}`
        )
      }

      // Aguardar
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Função padrão para decidir se deve retry
 * Retorna true para erros de rede e rate limit
 */
function defaultShouldRetry(error: any, attempt: number): boolean {
  // Erros de rede
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
    return true
  }

  // Rate limit da Meta
  if (error.code === 429 || error.code === '429') return true
  if (error.code === 80007 || error.code === '80007') return true      // Rate limit
  if (error.code === 130429 || error.code === '130429') return true    // Rate limit hit
  if (error.code === 131056 || error.code === '131056') return true    // Pair rate limit

  // Server errors (5xx)
  if (error.status >= 500 && error.status < 600) return true

  // Erros específicos da Meta que podem ser temporários
  if (error.code === 131031) return true  // Message failed to send
  if (error.code === 131047) return true  // Re-engagement message
  if (error.code === 131026) return true  // Message undeliverable

  // Erro genérico de fetch
  if (error.message?.includes('fetch failed')) return true
  if (error.message?.includes('network')) return true

  return false
}

/**
 * Criar função de retry específica para WhatsApp
 */
export function createWhatsAppRetry(customOptions: RetryOptions = {}) {
  const defaultOptions: RetryOptions = {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: 'decorrelated',
    shouldRetry: (error, attempt) => {
      // Rate limits sempre retry
      const rateLimitCodes = [429, '429', 80007, '80007', 130429, '130429', 131056, '131056']
      if (rateLimitCodes.includes(error.code)) return true

      // Erros de rede
      if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(error.code)) return true

      // Server errors
      if (error.status >= 500) return true

      // Não fazer retry de erros de validação ou permanentes
      const permanentErrorCodes = [
        100,     // Invalid parameter
        190,     // Invalid access token
        131030,  // Recipient not WhatsApp user
        131051,  // Unsupported message type
        132000,  // Template not found
        132001,  // Template paused
        132007,  // Template disabled
      ]
      if (permanentErrorCodes.includes(error.code)) return false

      return defaultShouldRetry(error, attempt)
    },
    onRetry: (error, attempt, delay) => {
      console.log(
        `📱 WhatsApp retry ${attempt} in ${delay}ms - Error ${error.code || 'UNKNOWN'}: ${error.message}`
      )
    },
  }

  return <T>(fn: () => Promise<T>) =>
    withRetry(fn, { ...defaultOptions, ...customOptions })
}

/**
 * Decorador para adicionar retry a uma função
 * Nota: Decoradores experimentais, usar com cuidado
 */
export function withRetryDecorator(options: RetryOptions = {}) {
  return function <T extends (...args: any[]) => Promise<any>>(
    _target: any,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!

    descriptor.value = async function (this: any, ...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options)
    } as T

    return descriptor
  }
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Timeout helper - executar com timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ])
}

/**
 * Combinar retry com timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { timeout?: number } = {}
): Promise<T> {
  const { timeout = 30000, ...retryOptions } = options

  return withRetry(
    () => withTimeout(fn, timeout),
    retryOptions
  )
}

// =============================================
// EXPORTS
// =============================================
export default withRetry
