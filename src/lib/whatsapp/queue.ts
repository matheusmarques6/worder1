// =============================================
// MESSAGE QUEUE - FILA DE MENSAGENS
// Implementação usando Upstash Redis
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

// =============================================
// TYPES
// =============================================

export type JobType =
  | 'send_campaign_batch'
  | 'send_single_message'
  | 'process_webhook'
  | 'sync_templates'
  | 'update_campaign_stats'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead'

export interface QueueJob<T = any> {
  id: string
  type: JobType
  data: T
  status: JobStatus
  attempts: number
  maxAttempts: number
  priority: number        // Menor = maior prioridade
  createdAt: number
  scheduledFor?: number   // Timestamp para delay
  startedAt?: number
  completedAt?: number
  lastError?: string
  result?: any
}

export interface AddJobOptions {
  delay?: number          // Delay em ms antes de processar
  priority?: number       // Prioridade (menor = mais urgente)
  maxAttempts?: number    // Máximo de tentativas
}

export interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  dead: number
  total: number
}

// =============================================
// MESSAGE QUEUE CLASS
// =============================================

export class MessageQueue {
  private queueName: string
  private defaultMaxAttempts: number

  constructor(queueName: string = 'whatsapp:queue', defaultMaxAttempts: number = 5) {
    this.queueName = queueName
    this.defaultMaxAttempts = defaultMaxAttempts
  }

  // Keys
  private get pendingKey() { return `${this.queueName}:pending` }
  private get processingKey() { return `${this.queueName}:processing` }
  private get completedKey() { return `${this.queueName}:completed` }
  private get failedKey() { return `${this.queueName}:failed` }
  private get dlqKey() { return `${this.queueName}:dlq` }
  private jobKey(id: string) { return `${this.queueName}:job:${id}` }

  /**
   * Adicionar job à fila
   */
  async add<T>(
    type: JobType,
    data: T,
    options: AddJobOptions = {}
  ): Promise<string> {
    const redis = getRedis()
    const jobId = this.generateId()

    const job: QueueJob<T> = {
      id: jobId,
      type,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
      priority: options.priority ?? 0,
      createdAt: Date.now(),
      scheduledFor: options.delay ? Date.now() + options.delay : undefined,
    }

    // Salvar dados do job
    await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 7 }) // 7 dias

    // Adicionar à fila (sorted set por prioridade/timestamp)
    const score = options.delay
      ? Date.now() + options.delay
      : Date.now() - (options.priority ?? 0) * 1000000 // Prioridade afeta posição

    await redis.zadd(this.pendingKey, { score, member: jobId })

    return jobId
  }

  /**
   * Adicionar múltiplos jobs de uma vez
   */
  async addBatch<T>(
    type: JobType,
    items: T[],
    options: AddJobOptions = {}
  ): Promise<string[]> {
    const redis = getRedis()
    const jobIds: string[] = []
    const baseTime = Date.now()

    // Criar jobs
    const jobs: QueueJob<T>[] = items.map((data, index) => {
      const jobId = this.generateId()
      jobIds.push(jobId)

      return {
        id: jobId,
        type,
        data,
        status: 'pending' as JobStatus,
        attempts: 0,
        maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
        priority: options.priority ?? 0,
        createdAt: baseTime,
        scheduledFor: options.delay ? baseTime + options.delay + index * 10 : undefined,
      }
    })

    // Batch save jobs
    const pipeline = redis.pipeline()
    jobs.forEach(job => {
      pipeline.set(this.jobKey(job.id), JSON.stringify(job), { ex: 86400 * 7 })
    })
    await pipeline.exec()

    // Batch add to sorted set
    const members = jobs.map((job, index) => ({
      score: job.scheduledFor ?? baseTime + index,
      member: job.id,
    }))

    // Upstash Redis zadd aceita array
    for (const member of members) {
      await redis.zadd(this.pendingKey, member)
    }

    return jobIds
  }

  /**
   * Pegar próximo job pronto para processar
   */
  async getNext(): Promise<QueueJob | null> {
    const redis = getRedis()
    const now = Date.now()

    // Buscar jobs prontos (score <= now)
    const jobIds = await redis.zrange(this.pendingKey, 0, now, {
      byScore: true,
      offset: 0,
      count: 1,
    })

    if (!jobIds || jobIds.length === 0) {
      return null
    }

    const jobId = jobIds[0] as string

    // Tentar remover atomicamente (evitar race condition)
    const removed = await redis.zrem(this.pendingKey, jobId)
    if (removed === 0) {
      // Outro worker pegou esse job
      return null
    }

    // Buscar dados do job
    const jobData = await redis.get(this.jobKey(jobId))
    if (!jobData) {
      return null
    }

    const job = JSON.parse(jobData as string) as QueueJob

    // Marcar como processing
    job.status = 'processing'
    job.startedAt = Date.now()
    job.attempts++

    await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 7 })
    await redis.zadd(this.processingKey, { score: Date.now(), member: jobId })

    return job
  }

  /**
   * Pegar múltiplos jobs de uma vez
   */
  async getNextBatch(count: number): Promise<QueueJob[]> {
    const jobs: QueueJob[] = []

    for (let i = 0; i < count; i++) {
      const job = await this.getNext()
      if (!job) break
      jobs.push(job)
    }

    return jobs
  }

  /**
   * Marcar job como completo
   */
  async complete(jobId: string, result?: any): Promise<void> {
    const redis = getRedis()

    const jobData = await redis.get(this.jobKey(jobId))
    if (!jobData) return

    const job = JSON.parse(jobData as string) as QueueJob
    job.status = 'completed'
    job.completedAt = Date.now()
    job.result = result

    await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 }) // 1 dia
    await redis.zrem(this.processingKey, jobId)
    await redis.zadd(this.completedKey, { score: Date.now(), member: jobId })

    // Limpar completed antigos (manter últimos 1000)
    await redis.zremrangebyrank(this.completedKey, 0, -1001)
  }

  /**
   * Marcar job como falho e decidir se retry
   */
  async fail(jobId: string, error: string): Promise<boolean> {
    const redis = getRedis()

    const jobData = await redis.get(this.jobKey(jobId))
    if (!jobData) return false

    const job = JSON.parse(jobData as string) as QueueJob
    job.lastError = error

    await redis.zrem(this.processingKey, jobId)

    // Verificar se pode tentar novamente
    if (job.attempts < job.maxAttempts) {
      // Requeue com delay exponencial
      const delay = this.calculateRetryDelay(job.attempts)
      job.status = 'pending'
      job.scheduledFor = Date.now() + delay

      await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 7 })
      await redis.zadd(this.pendingKey, { score: job.scheduledFor, member: jobId })

      console.log(`♻️ Job ${jobId} requeued (attempt ${job.attempts}/${job.maxAttempts}), retry in ${delay}ms`)
      return true
    } else {
      // Move para DLQ
      job.status = 'dead'
      await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 30 }) // 30 dias
      await redis.lpush(this.dlqKey, jobId)

      console.log(`☠️ Job ${jobId} moved to DLQ after ${job.attempts} attempts`)
      return false
    }
  }

  /**
   * Requeue job com delay customizado
   */
  async requeue(jobId: string, delayMs: number): Promise<void> {
    const redis = getRedis()

    const jobData = await redis.get(this.jobKey(jobId))
    if (!jobData) return

    const job = JSON.parse(jobData as string) as QueueJob
    job.status = 'pending'
    job.scheduledFor = Date.now() + delayMs

    await redis.zrem(this.processingKey, jobId)
    await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 7 })
    await redis.zadd(this.pendingKey, { score: job.scheduledFor, member: jobId })
  }

  /**
   * Obter job por ID
   */
  async getJob(jobId: string): Promise<QueueJob | null> {
    const redis = getRedis()
    const jobData = await redis.get(this.jobKey(jobId))

    if (!jobData) return null
    return JSON.parse(jobData as string) as QueueJob
  }

  /**
   * Obter estatísticas da fila
   */
  async getStats(): Promise<QueueStats> {
    const redis = getRedis()

    const [pending, processing, completed, failed, dead] = await Promise.all([
      redis.zcard(this.pendingKey),
      redis.zcard(this.processingKey),
      redis.zcard(this.completedKey),
      redis.zcard(this.failedKey),
      redis.llen(this.dlqKey),
    ])

    return {
      pending: pending || 0,
      processing: processing || 0,
      completed: completed || 0,
      failed: failed || 0,
      dead: dead || 0,
      total: (pending || 0) + (processing || 0),
    }
  }

  /**
   * Obter jobs da DLQ
   */
  async getDLQJobs(limit: number = 100): Promise<QueueJob[]> {
    const redis = getRedis()
    const jobIds = await redis.lrange(this.dlqKey, 0, limit - 1)

    const jobs: QueueJob[] = []
    for (const jobId of jobIds) {
      const job = await this.getJob(jobId as string)
      if (job) jobs.push(job)
    }

    return jobs
  }

  /**
   * Retry job da DLQ
   */
  async retryFromDLQ(jobId: string): Promise<boolean> {
    const redis = getRedis()

    const jobData = await redis.get(this.jobKey(jobId))
    if (!jobData) return false

    const job = JSON.parse(jobData as string) as QueueJob
    job.status = 'pending'
    job.attempts = 0 // Reset attempts
    job.lastError = undefined

    await redis.lrem(this.dlqKey, 1, jobId)
    await redis.set(this.jobKey(jobId), JSON.stringify(job), { ex: 86400 * 7 })
    await redis.zadd(this.pendingKey, { score: Date.now(), member: jobId })

    console.log(`🔄 Job ${jobId} retried from DLQ`)
    return true
  }

  /**
   * Limpar fila (para testes)
   */
  async clear(): Promise<void> {
    const redis = getRedis()

    await Promise.all([
      redis.del(this.pendingKey),
      redis.del(this.processingKey),
      redis.del(this.completedKey),
      redis.del(this.failedKey),
      redis.del(this.dlqKey),
    ])

    console.log(`🧹 Queue ${this.queueName} cleared`)
  }

  /**
   * Recuperar jobs stuck em processing (timeout)
   */
  async recoverStuckJobs(timeoutMs: number = 300000): Promise<number> {
    const redis = getRedis()
    const cutoff = Date.now() - timeoutMs

    // Jobs em processing há mais de timeoutMs
    const stuckJobIds = await redis.zrange(this.processingKey, 0, cutoff, { byScore: true })

    let recovered = 0
    for (const jobId of stuckJobIds) {
      const job = await this.getJob(jobId as string)
      if (job) {
        await this.fail(jobId as string, 'Job timed out')
        recovered++
      }
    }

    if (recovered > 0) {
      console.log(`🔧 Recovered ${recovered} stuck jobs`)
    }

    return recovered
  }

  // Helpers privados

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff com jitter
    const baseDelay = 1000
    const maxDelay = 60000
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
    const jitter = Math.random() * delay * 0.5
    return Math.round(delay + jitter)
  }
}

// =============================================
// SINGLETON INSTANCES
// =============================================

// Fila principal para campanhas
export const campaignQueue = new MessageQueue('whatsapp:campaigns', 5)

// Fila para webhooks
export const webhookQueue = new MessageQueue('whatsapp:webhooks', 3)

// Fila de baixa prioridade
export const lowPriorityQueue = new MessageQueue('whatsapp:lowpriority', 3)

// =============================================
// EXPORTS
// =============================================
export default MessageQueue
