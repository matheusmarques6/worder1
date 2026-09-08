// =============================================
// WORDER: Durable job queue (Upstash Redis)
// /src/lib/queue/durable-queue.ts
//
// Fila simples e confiável baseada em Redis sorted set:
//   - Jobs agendados em `queue:{name}:scheduled` (ZSET, score = scheduledFor)
//   - Jobs reservados em `queue:{name}:processing` (ZSET, score = prazo
//     de visibilidade); quem estoura o prazo volta para o agendado
//   - Backoff exponencial automático com dead-letter após maxAttempts
//   - Idempotência: jobId é único (SET queue:{name}:seen para dedup)
// =============================================

import { Redis } from '@upstash/redis'

const NAMESPACE = 'wq'

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set')
  }
  return new Redis({ url, token })
}

export interface Job<T = any> {
  id: string
  queue: string
  data: T
  attempts: number
  maxAttempts: number
  createdAt: number
  scheduledFor: number
  lastError?: string
}

export interface EnqueueOptions {
  /** ID único do job (idempotência). Se fornecido e já existir → no-op. */
  jobId?: string
  /** delay em ms a partir de agora. */
  delayMs?: number
  /** máximo de tentativas (default 5). */
  maxAttempts?: number
}

function keyScheduled(queue: string) { return `${NAMESPACE}:${queue}:scheduled` }
function keyProcessing(queue: string) { return `${NAMESPACE}:${queue}:processing` }
function keyDead(queue: string) { return `${NAMESPACE}:${queue}:dead` }
function keyJob(queue: string, id: string) { return `${NAMESPACE}:${queue}:job:${id}` }
function keySeen(queue: string, id: string) { return `${NAMESPACE}:${queue}:seen:${id}` }

/**
 * Prazo de visibilidade: quanto tempo um job reservado pode ficar sem
 * notícia antes de voltar para a fila.
 *
 * O worker roda com maxDuration de 60s e reserva até 20 jobs. Se os
 * envios demorarem, a função é morta no meio do laço — e os jobs que
 * ela já tinha reservado sumiam para sempre: saíam do agendado e não
 * eram registrados em lugar nenhum. Nenhum erro, nenhum dead letter,
 * simplesmente e-mails que nunca saíram.
 *
 * 5 minutos dá folga de sobra para um worker de 60s terminar e ainda
 * devolve o trabalho rápido quando ele morre.
 */
const VISIBILITY_MS = 5 * 60_000

export function isQueueAvailable(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function genId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Adiciona um job à fila.
 * Se já existe um job com mesmo jobId (via SET seen), retorna null sem duplicar.
 */
export async function enqueue<T>(
  queue: string,
  data: T,
  opts: EnqueueOptions = {}
): Promise<Job<T> | null> {
  const redis = getRedis()
  const id = opts.jobId || genId()

  // Idempotência via SETNX com TTL de 7 dias
  if (opts.jobId) {
    const seen = await redis.set(keySeen(queue, id), '1', {
      nx: true,
      ex: 7 * 24 * 60 * 60,
    })
    if (!seen) return null
  }

  const now = Date.now()
  const job: Job<T> = {
    id,
    queue,
    data,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 5,
    createdAt: now,
    scheduledFor: now + (opts.delayMs || 0),
  }

  await redis.set(keyJob(queue, id), JSON.stringify(job))
  await redis.zadd(keyScheduled(queue), { score: job.scheduledFor, member: id })

  return job
}

/**
 * Devolve à fila os jobs reservados que estouraram o prazo de
 * visibilidade — os que um worker pegou e nunca reportou (timeout da
 * função, deploy no meio, crash).
 *
 * Retorna quantos foram devolvidos.
 */
export async function reclaimStale(queue: string, now: number = Date.now()): Promise<number> {
  const redis = getRedis()
  const vencidos = (await redis.zrange(keyProcessing(queue), 0, now, {
    byScore: true,
    offset: 0,
    count: 100,
  })) as string[]
  if (!vencidos.length) return 0

  let devolvidos = 0
  for (const id of vencidos) {
    // zrem atômico: se outro worker devolveu antes, este não duplica.
    const removed = await redis.zrem(keyProcessing(queue), id)
    if (!removed) continue
    const raw = await redis.get<string>(keyJob(queue, id))
    if (!raw) continue // job já apagado — nada a devolver
    // Volta para execução imediata, preservando a contagem de
    // tentativas: um job que morre em loop ainda termina em dead letter.
    await redis.zadd(keyScheduled(queue), { score: now, member: id })
    devolvidos++
  }
  return devolvidos
}

/**
 * Reserva N jobs prontos para execução, registrando cada um no
 * conjunto de "em processamento" com prazo de visibilidade. Sem esse
 * registro um worker que morre leva os jobs junto.
 */
export async function reserve<T = any>(queue: string, batch: number = 10): Promise<Job<T>[]> {
  const redis = getRedis()
  const now = Date.now()

  // Antes de pegar trabalho novo, recupera o que ficou preso.
  await reclaimStale(queue, now).catch(() => 0)

  // Pega até `batch` jobs cujo scheduledFor <= now
  const ids = (await redis.zrange(keyScheduled(queue), 0, now, {
    byScore: true,
    offset: 0,
    count: batch,
  })) as string[]

  if (!ids.length) return []

  const out: Job<T>[] = []
  for (const id of ids) {
    // Tenta remover do scheduled (atomic — se outro worker já pegou, zrem retorna 0)
    const removed = await redis.zrem(keyScheduled(queue), id)
    if (!removed) continue // outro worker pegou

    const raw = await redis.get<string>(keyJob(queue, id))
    if (!raw) continue
    try {
      const job = typeof raw === 'string' ? JSON.parse(raw) : (raw as Job<T>)
      // Só depois de ler o job com sucesso: marcar antes deixaria lixo
      // permanente no conjunto para jobs corrompidos.
      await redis.zadd(keyProcessing(queue), { score: now + VISIBILITY_MS, member: id })
      out.push(job)
    } catch {
      /* ignore corrupt */
    }
  }
  return out
}

/**
 * Marca job como completo (remove tudo).
 */
export async function complete(queue: string, jobId: string): Promise<void> {
  const redis = getRedis()
  await redis.zrem(keyProcessing(queue), jobId)
  await redis.del(keyJob(queue, jobId))
  // não apaga `seen` — ele tem TTL próprio
}

/**
 * Re-enfilera job para retry com backoff exponencial.
 * Se exceder maxAttempts → dead letter.
 */
export async function fail<T>(
  queue: string,
  job: Job<T>,
  error: string
): Promise<{ retrying: boolean; nextAttemptAt?: number }> {
  const redis = getRedis()
  const next: Job<T> = {
    ...job,
    attempts: job.attempts + 1,
    lastError: String(error).slice(0, 500),
  }

  // Sai de "em processamento" nos dois desfechos — senão o reclaim o
  // devolveria à fila depois de ele já ter ido para o dead letter.
  await redis.zrem(keyProcessing(queue), job.id)

  if (next.attempts >= next.maxAttempts) {
    // Dead letter
    await redis.lpush(keyDead(queue), JSON.stringify(next))
    await redis.del(keyJob(queue, job.id))
    return { retrying: false }
  }

  // Backoff: 5s, 25s, 125s, 625s, ...
  const delaySec = Math.pow(5, next.attempts)
  const nextAt = Date.now() + delaySec * 1000
  next.scheduledFor = nextAt

  await redis.set(keyJob(queue, job.id), JSON.stringify(next))
  await redis.zadd(keyScheduled(queue), { score: nextAt, member: job.id })

  return { retrying: true, nextAttemptAt: nextAt }
}

/**
 * Métricas da fila (para dashboard).
 */
export async function stats(queue: string): Promise<{
  scheduled: number
  processing: number
  dead: number
}> {
  const redis = getRedis()
  const [scheduled, processing, dead] = await Promise.all([
    redis.zcard(keyScheduled(queue)),
    redis.zcard(keyProcessing(queue)),
    redis.llen(keyDead(queue)),
  ])
  return {
    scheduled: Number(scheduled || 0),
    // Um `processing` que não desce é o sintoma de worker morrendo no
    // meio: o reclaim devolve, mas o número denuncia o problema.
    processing: Number(processing || 0),
    dead: Number(dead || 0),
  }
}

/**
 * Peek dead letters (sem remover).
 */
export async function peekDead<T = any>(queue: string, limit: number = 20): Promise<Job<T>[]> {
  const redis = getRedis()
  const items = await redis.lrange(keyDead(queue), 0, limit - 1)
  return (items as string[])
    .map((s) => {
      try { return typeof s === 'string' ? JSON.parse(s) : s } catch { return null }
    })
    .filter(Boolean) as Job<T>[]
}

/**
 * Re-enqueue de uma dead letter.
 */
export async function requeueDead(queue: string, jobId: string): Promise<boolean> {
  const redis = getRedis()
  const all = (await redis.lrange(keyDead(queue), 0, -1)) as string[]
  const idx = all.findIndex((s) => {
    try { return (typeof s === 'string' ? JSON.parse(s) : s)?.id === jobId } catch { return false }
  })
  if (idx === -1) return false
  const raw = all[idx]
  const job = typeof raw === 'string' ? JSON.parse(raw) : raw
  job.attempts = 0
  job.lastError = undefined
  job.scheduledFor = Date.now()
  await redis.lrem(keyDead(queue), 1, raw)
  await redis.set(keyJob(queue, job.id), JSON.stringify(job))
  await redis.zadd(keyScheduled(queue), { score: job.scheduledFor, member: job.id })
  return true
}
