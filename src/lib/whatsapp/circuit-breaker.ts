// =============================================
// CIRCUIT BREAKER - PROTEÇÃO CONTRA FAILURES
// Padrão: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
// =============================================

import { Redis } from '@upstash/redis'

// Inicializar Redis (lazy)
let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold?: number    // Falhas para abrir circuito (default: 5)
  successThreshold?: number    // Sucessos em HALF_OPEN para fechar (default: 3)
  resetTimeout?: number        // Tempo em OPEN antes de HALF_OPEN (ms, default: 30000)
  halfOpenMaxCalls?: number    // Calls permitidas em HALF_OPEN (default: 3)
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  lastFailure: number | null
  lastSuccess: number | null
  totalFailures: number
  totalSuccesses: number
}

export class CircuitBreaker {
  private name: string
  private failureThreshold: number
  private successThreshold: number
  private resetTimeout: number
  private halfOpenMaxCalls: number

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name
    this.failureThreshold = options.failureThreshold ?? 5
    this.successThreshold = options.successThreshold ?? 3
    this.resetTimeout = options.resetTimeout ?? 30000
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 3
  }

  // Keys
  private get stateKey() { return `cb:${this.name}:state` }
  private get failuresKey() { return `cb:${this.name}:failures` }
  private get successesKey() { return `cb:${this.name}:successes` }
  private get lastFailureKey() { return `cb:${this.name}:lastFailure` }
  private get lastSuccessKey() { return `cb:${this.name}:lastSuccess` }
  private get totalFailuresKey() { return `cb:${this.name}:totalFailures` }
  private get totalSuccessesKey() { return `cb:${this.name}:totalSuccesses` }
  private get halfOpenCallsKey() { return `cb:${this.name}:halfOpenCalls` }

  /**
   * Obter estado atual do circuito
   */
  async getState(): Promise<CircuitState> {
    const redis = getRedis()
    const state = await redis.get(this.stateKey) as CircuitState | null

    if (state === 'OPEN') {
      // Verificar se é hora de tentar HALF_OPEN
      const lastFailure = parseInt(await redis.get(this.lastFailureKey) as string || '0')
      if (Date.now() - lastFailure > this.resetTimeout) {
        await this.setState('HALF_OPEN')
        await redis.set(this.halfOpenCallsKey, '0')
        console.log(`🟡 Circuit ${this.name}: OPEN -> HALF_OPEN (reset timeout)`)
        return 'HALF_OPEN'
      }
    }

    return state || 'CLOSED'
  }

  /**
   * Verificar se pode executar
   */
  async canExecute(): Promise<boolean> {
    const state = await this.getState()

    if (state === 'CLOSED') {
      return true
    }

    if (state === 'OPEN') {
      return false
    }

    // HALF_OPEN: permitir algumas chamadas de teste
    const redis = getRedis()
    const halfOpenCalls = parseInt(await redis.get(this.halfOpenCallsKey) as string || '0')

    if (halfOpenCalls >= this.halfOpenMaxCalls) {
      return false
    }

    await redis.incr(this.halfOpenCallsKey)
    return true
  }

  /**
   * Registrar sucesso
   */
  async recordSuccess(): Promise<void> {
    const redis = getRedis()
    const state = await this.getState()

    await redis.set(this.lastSuccessKey, Date.now().toString())
    await redis.incr(this.totalSuccessesKey)

    if (state === 'HALF_OPEN') {
      const successes = await redis.incr(this.successesKey)

      if (successes >= this.successThreshold) {
        await this.setState('CLOSED')
        await redis.set(this.failuresKey, '0')
        await redis.set(this.successesKey, '0')
        console.log(`🟢 Circuit ${this.name}: HALF_OPEN -> CLOSED (recovered)`)
      }
    } else if (state === 'CLOSED') {
      // Reset failure counter on success
      await redis.set(this.failuresKey, '0')
    }
  }

  /**
   * Registrar falha
   */
  async recordFailure(error?: Error): Promise<void> {
    const redis = getRedis()
    const state = await this.getState()

    await redis.set(this.lastFailureKey, Date.now().toString())
    await redis.incr(this.totalFailuresKey)

    if (state === 'HALF_OPEN') {
      // Uma falha em HALF_OPEN reabre o circuito
      await this.setState('OPEN')
      await redis.set(this.successesKey, '0')
      console.log(`🔴 Circuit ${this.name}: HALF_OPEN -> OPEN (failure during recovery)`)
    } else if (state === 'CLOSED') {
      const failures = await redis.incr(this.failuresKey)

      if (failures >= this.failureThreshold) {
        await this.setState('OPEN')
        console.log(`🔴 Circuit ${this.name}: CLOSED -> OPEN (${failures} failures)`)
        if (error) {
          console.log(`   Last error: ${error.message}`)
        }
      }
    }
  }

  /**
   * Executar função com proteção do circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const canExecute = await this.canExecute()

    if (!canExecute) {
      const state = await this.getState()
      throw new CircuitBreakerError(
        `Circuit breaker ${this.name} is ${state}`,
        state
      )
    }

    try {
      const result = await fn()
      await this.recordSuccess()
      return result
    } catch (error: any) {
      await this.recordFailure(error)
      throw error
    }
  }

  /**
   * Obter estatísticas
   */
  async getStats(): Promise<CircuitBreakerStats> {
    const redis = getRedis()

    const [state, failures, successes, lastFailure, lastSuccess, totalFailures, totalSuccesses] =
      await Promise.all([
        this.getState(),
        redis.get(this.failuresKey),
        redis.get(this.successesKey),
        redis.get(this.lastFailureKey),
        redis.get(this.lastSuccessKey),
        redis.get(this.totalFailuresKey),
        redis.get(this.totalSuccessesKey),
      ])

    return {
      state,
      failures: parseInt(failures as string || '0'),
      successes: parseInt(successes as string || '0'),
      lastFailure: lastFailure ? parseInt(lastFailure as string) : null,
      lastSuccess: lastSuccess ? parseInt(lastSuccess as string) : null,
      totalFailures: parseInt(totalFailures as string || '0'),
      totalSuccesses: parseInt(totalSuccesses as string || '0'),
    }
  }

  /**
   * Forçar estado (para testes ou recovery manual)
   */
  async forceState(state: CircuitState): Promise<void> {
    await this.setState(state)
    console.log(`⚡ Circuit ${this.name}: Forced to ${state}`)
  }

  /**
   * Resetar circuit breaker
   */
  async reset(): Promise<void> {
    const redis = getRedis()

    await Promise.all([
      redis.del(this.stateKey),
      redis.del(this.failuresKey),
      redis.del(this.successesKey),
      redis.del(this.lastFailureKey),
      redis.del(this.lastSuccessKey),
      redis.del(this.halfOpenCallsKey),
    ])

    console.log(`🔄 Circuit ${this.name}: Reset`)
  }

  private async setState(state: CircuitState): Promise<void> {
    const redis = getRedis()
    await redis.set(this.stateKey, state)
  }
}

/**
 * Erro específico do Circuit Breaker
 */
export class CircuitBreakerError extends Error {
  public state: CircuitState

  constructor(message: string, state: CircuitState) {
    super(message)
    this.name = 'CircuitBreakerError'
    this.state = state
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================
const circuitBreakers = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  let cb = circuitBreakers.get(name)

  if (!cb) {
    cb = new CircuitBreaker(name, options)
    circuitBreakers.set(name, cb)
  }

  return cb
}

// =============================================
// EXPORTS
// =============================================
export default CircuitBreaker
