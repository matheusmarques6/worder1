// =============================================
// Buffer Redis com debounce — junta mensagens em rajada do mesmo cliente
// numa única execução do AgentRunner. Sem Redis configurado, o buffer
// retorna sempre [] e o caller deve escalar síncrono.
//
// Chaves:
//   ai:buffer:<conversationId>  → list de message ids (LPUSH)
//   ai:lock:<conversationId>    → flag NX para garantir 1 schedule por janela
// =============================================

import { redis } from '@/lib/redis/client'

const DEBOUNCE_MS = parseInt(process.env.AI_BUFFER_DEBOUNCE_MS || '5000', 10)
const MAX_TTL_MS = parseInt(process.env.AI_BUFFER_MAX_TTL_MS || '30000', 10)

export interface BufferAppendResult {
  /** True quando este caller deve agendar o worker (1ª msg da janela). */
  shouldSchedule: boolean
}

export async function appendToBuffer(
  conversationId: string,
  messageId: string,
): Promise<BufferAppendResult> {
  if (!redis) {
    // Sem Redis: cada mensagem dispara o worker síncrono.
    return { shouldSchedule: true }
  }
  const bufferKey = `ai:buffer:${conversationId}`
  const lockKey = `ai:lock:${conversationId}`

  await redis.lpush(bufferKey, messageId)
  await redis.expire(bufferKey, Math.ceil(MAX_TTL_MS / 1000))

  const acquired = await redis.set(lockKey, '1', {
    nx: true,
    ex: Math.ceil(DEBOUNCE_MS / 1000) + 5,
  })
  return { shouldSchedule: !!acquired }
}

export async function drainBuffer(conversationId: string): Promise<string[]> {
  if (!redis) return []
  const bufferKey = `ai:buffer:${conversationId}`
  const lockKey = `ai:lock:${conversationId}`
  const ids = (await redis.lrange(bufferKey, 0, -1)) as string[]
  await redis.del(bufferKey)
  await redis.del(lockKey)
  return ids.reverse()
}
