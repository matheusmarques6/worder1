// =============================================
// WORDER: Node execution timeout + circuit breaker
// /src/lib/automation/node-timeout.ts
// =============================================

export class NodeTimeoutError extends Error {
  constructor(nodeId: string, ms: number) {
    super(`Node ${nodeId} timed out after ${ms}ms`)
    this.name = 'NodeTimeoutError'
  }
}

/**
 * Wraps uma promise com timeout. Rejeita com NodeTimeoutError se exceder.
 */
export async function withNodeTimeout<T>(
  nodeId: string,
  timeoutMs: number,
  promise: Promise<T>
): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new NodeTimeoutError(nodeId, timeoutMs)),
      timeoutMs
    )
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Retorna timeout adequado ao tipo de node. Padrão 30s; actions externas 60s.
 */
export function timeoutForNodeType(type: string): number {
  if (type.startsWith('trigger_')) return 5_000 // trigger é passthrough
  if (type === 'action_email') return 60_000
  if (type === 'action_whatsapp') return 60_000
  if (type === 'action_whatsapp_ai') return 90_000
  if (type === 'action_sms') return 30_000
  if (type === 'action_webhook' || type === 'action_http_request') return 45_000
  if (type === 'action_shopify_coupon') return 30_000
  if (type.startsWith('control_delay')) return 10_000 // delay é só agendar
  if (type.startsWith('condition_') || type.startsWith('logic_')) return 5_000
  return 30_000
}

// =============================================
// Circuit breaker — por automação
// =============================================

interface CircuitState {
  failures: number
  openedAt?: number
}

const circuits = new Map<string, CircuitState>()

export interface CircuitOptions {
  /** número de falhas consecutivas antes de abrir */
  threshold: number
  /** tempo (ms) que o circuito fica aberto antes de permitir half-open */
  cooldownMs: number
}

const DEFAULT_OPTS: CircuitOptions = { threshold: 5, cooldownMs: 60_000 }

export function checkCircuit(key: string, opts: CircuitOptions = DEFAULT_OPTS): boolean {
  const s = circuits.get(key)
  if (!s) return true
  if (s.failures < opts.threshold) return true
  const openedAt = s.openedAt || 0
  // Passou cooldown → half-open: permite 1 tentativa
  if (Date.now() - openedAt > opts.cooldownMs) {
    s.failures = opts.threshold - 1
    return true
  }
  return false
}

export function recordSuccess(key: string): void {
  const s = circuits.get(key)
  if (!s) return
  s.failures = 0
  s.openedAt = undefined
}

export function recordFailure(key: string, opts: CircuitOptions = DEFAULT_OPTS): void {
  const s = circuits.get(key) || { failures: 0 }
  s.failures += 1
  if (s.failures >= opts.threshold && !s.openedAt) {
    s.openedAt = Date.now()
  }
  circuits.set(key, s)
}

export class CircuitOpenError extends Error {
  constructor(key: string) {
    super(`Circuit open for ${key}`)
    this.name = 'CircuitOpenError'
  }
}

/**
 * Envolve um bloco com circuit breaker.
 */
export async function withCircuit<T>(
  key: string,
  fn: () => Promise<T>,
  opts: CircuitOptions = DEFAULT_OPTS
): Promise<T> {
  if (!checkCircuit(key, opts)) {
    throw new CircuitOpenError(key)
  }
  try {
    const result = await fn()
    recordSuccess(key)
    return result
  } catch (err) {
    recordFailure(key, opts)
    throw err
  }
}
