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

  // =============================================
  // [Phase 0 / 0B] Atomic Lua scripts
  // Move the racing read-then-write transitions into single atomic EVALs so
  // that under N concurrent lanes (a) HALF_OPEN admits at most halfOpenMaxCalls
  // and (b) a CLOSED success reset can never clobber an in-flight opening
  // failure decision.
  // =============================================

  // OPEN -> HALF_OPEN transition (atomic read + timeout check + write).
  // KEYS = [state, lastFailure, halfOpenCalls]; ARGV = [now_ms, resetTimeout_ms]
  // Returns the EFFECTIVE state string. Only the caller that wins the race
  // performs the transition (CAS on state == 'OPEN').
  private static readonly LUA_GET_STATE = `
local state = redis.call('GET', KEYS[1])
if state == 'OPEN' then
  local lastFailure = tonumber(redis.call('GET', KEYS[2])) or 0
  local now = tonumber(ARGV[1])
  local resetTimeout = tonumber(ARGV[2])
  if (now - lastFailure) > resetTimeout then
    redis.call('SET', KEYS[1], 'HALF_OPEN')
    redis.call('SET', KEYS[3], '0')
    return 'HALF_OPEN'
  end
  return 'OPEN'
end
if state == false or state == nil then return 'CLOSED' end
return state
`.trim()

  // HALF_OPEN admission: atomic test-and-increment. The increment IS the gate —
  // admit iff INCR(halfOpenCalls) <= halfOpenMaxCalls. Only valid while state is
  // HALF_OPEN (re-checked here to avoid admitting after a concurrent reopen).
  // KEYS = [state, halfOpenCalls]; ARGV = [halfOpenMaxCalls]. Returns 1=admit, 0=deny.
  private static readonly LUA_HALFOPEN_ADMIT = `
local state = redis.call('GET', KEYS[1])
if state ~= 'HALF_OPEN' then
  if state == 'CLOSED' or state == false or state == nil then return 1 end
  return 0
end
local n = redis.call('INCR', KEYS[2])
if n <= tonumber(ARGV[1]) then return 1 end
return 0
`.trim()

  // Failure accounting (atomic). Reads state, then:
  //  - HALF_OPEN -> OPEN (one failure reopens), reset successes.
  //  - CLOSED   -> INCR failures; open iff >= threshold.
  // Returns cjson [newState, failures]. Because this runs as one EVAL, a
  // concurrent CLOSED-success reset cannot interleave between the INCR and the
  // threshold compare. KEYS = [state, failures, successes];
  // ARGV = [failureThreshold]
  private static readonly LUA_RECORD_FAILURE = `
local state = redis.call('GET', KEYS[1])
if state == false or state == nil then state = 'CLOSED' end
if state == 'HALF_OPEN' then
  redis.call('SET', KEYS[1], 'OPEN')
  redis.call('SET', KEYS[3], '0')
  return cjson.encode({'OPEN', 0})
elseif state == 'CLOSED' then
  local failures = redis.call('INCR', KEYS[2])
  if failures >= tonumber(ARGV[1]) then
    redis.call('SET', KEYS[1], 'OPEN')
    return cjson.encode({'OPEN', failures})
  end
  return cjson.encode({'CLOSED', failures})
end
return cjson.encode({state, tonumber(redis.call('GET', KEYS[2])) or 0})
`.trim()

  // Success accounting (atomic). Reads state, then:
  //  - HALF_OPEN -> INCR successes; close iff >= successThreshold (resets both).
  //  - CLOSED    -> reset failures to 0 (gated on state being CLOSED, so it can
  //                 never clobber a failure that just opened the breaker).
  // Returns cjson [newState, successes]. KEYS = [state, failures, successes];
  // ARGV = [successThreshold]
  private static readonly LUA_RECORD_SUCCESS = `
local state = redis.call('GET', KEYS[1])
if state == false or state == nil then state = 'CLOSED' end
if state == 'HALF_OPEN' then
  local successes = redis.call('INCR', KEYS[3])
  if successes >= tonumber(ARGV[1]) then
    redis.call('SET', KEYS[1], 'CLOSED')
    redis.call('SET', KEYS[2], '0')
    redis.call('SET', KEYS[3], '0')
    return cjson.encode({'CLOSED', successes})
  end
  return cjson.encode({'HALF_OPEN', successes})
elseif state == 'CLOSED' then
  -- [0B] guarded reset: only reset while genuinely CLOSED.
  redis.call('SET', KEYS[2], '0')
  return cjson.encode({'CLOSED', 0})
end
return cjson.encode({state, tonumber(redis.call('GET', KEYS[3])) or 0})
`.trim()

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
   * [0B] A transição OPEN->HALF_OPEN (read + reset-timeout check + write) é
   * feita atomicamente num único EVAL, então N callers concorrentes não correm.
   */
  async getState(): Promise<CircuitState> {
    const redis = getRedis()
    try {
      const state = await redis.eval(
        CircuitBreaker.LUA_GET_STATE,
        [this.stateKey, this.lastFailureKey, this.halfOpenCallsKey],
        [Date.now(), this.resetTimeout],
      ) as CircuitState
      return state || 'CLOSED'
    } catch (err) {
      // Fail-safe: degrade para leitura simples (mantém interface).
      console.error(`⚠️ Circuit ${this.name} getState eval failed; reading state directly`, err)
      const state = await redis.get(this.stateKey) as CircuitState | null
      return state || 'CLOSED'
    }
  }

  /**
   * Verificar se pode executar
   * [0B] Admissão HALF_OPEN é um test-and-increment atômico: admite sse
   * INCR(halfOpenCalls) <= halfOpenMaxCalls. Sob N lanes, no máximo
   * halfOpenMaxCalls passam.
   */
  async canExecute(): Promise<boolean> {
    const state = await this.getState()

    if (state === 'CLOSED') {
      return true
    }

    if (state === 'OPEN') {
      return false
    }

    // HALF_OPEN: admissão atômica (o INCR é o portão).
    const redis = getRedis()
    try {
      const admit = await redis.eval(
        CircuitBreaker.LUA_HALFOPEN_ADMIT,
        [this.stateKey, this.halfOpenCallsKey],
        [this.halfOpenMaxCalls],
      ) as number
      return admit === 1
    } catch (err) {
      // Fail-CLOSED em HALF_OPEN: na dúvida, não martele o endpoint em recuperação.
      console.error(`⚠️ Circuit ${this.name} canExecute eval failed; denying (fail-closed)`, err)
      return false
    }
  }

  /**
   * Registrar sucesso
   * [0B] Contabilização atômica: o reset de failures no estado CLOSED é gated
   * dentro do mesmo EVAL, então não pode apagar uma falha que acabou de abrir
   * o circuito.
   */
  async recordSuccess(): Promise<void> {
    const redis = getRedis()

    await redis.set(this.lastSuccessKey, Date.now().toString())
    await redis.incr(this.totalSuccessesKey)

    try {
      const raw = await redis.eval(
        CircuitBreaker.LUA_RECORD_SUCCESS,
        [this.stateKey, this.failuresKey, this.successesKey],
        [this.successThreshold],
      )
      const [newState] = (typeof raw === 'string' ? JSON.parse(raw) : raw) as [CircuitState, number]
      if (newState === 'CLOSED') {
        // Pode ter sido a transição HALF_OPEN -> CLOSED (recuperação).
        // (Log best-effort; o estado já foi committed atomicamente.)
      }
    } catch (err) {
      console.error(`⚠️ Circuit ${this.name} recordSuccess eval failed`, err)
    }
  }

  /**
   * Registrar falha
   * [0B] Contabilização atômica: a checagem de threshold roda sobre o valor
   * retornado pelo INCR dentro do mesmo EVAL — um success reset concorrente não
   * pode se intercalar entre o INCR e a comparação.
   */
  async recordFailure(error?: Error): Promise<void> {
    const redis = getRedis()

    await redis.set(this.lastFailureKey, Date.now().toString())
    await redis.incr(this.totalFailuresKey)

    try {
      const raw = await redis.eval(
        CircuitBreaker.LUA_RECORD_FAILURE,
        [this.stateKey, this.failuresKey, this.successesKey],
        [this.failureThreshold],
      )
      const [newState, failures] = (typeof raw === 'string' ? JSON.parse(raw) : raw) as [CircuitState, number]
      if (newState === 'OPEN') {
        console.log(`🔴 Circuit ${this.name}: -> OPEN (${failures} failures)`)
        if (error) {
          console.log(`   Last error: ${error.message}`)
        }
      }
    } catch (err) {
      console.error(`⚠️ Circuit ${this.name} recordFailure eval failed`, err)
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
