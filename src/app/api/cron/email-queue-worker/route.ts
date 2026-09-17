/**
 * CRON: Email queue worker
 * /api/cron/email-queue-worker
 *
 * Consome a fila `email-send-batch` (Upstash) chamando /send-batch com retry.
 * Roda a cada minuto no vercel.json.
 */

import { NextRequest, NextResponse } from 'next/server'
import { reserve, complete, fail, stats, isQueueAvailable } from '@/lib/queue/durable-queue'
import { authorizeCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const QUEUE_NAME = 'email-send-batch'
const BATCH = 20 // até 20 batches por execução (~1000 contatos)

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isQueueAvailable()) {
    return NextResponse.json({ error: 'Queue not configured (UPSTASH_REDIS_*)' }, { status: 503 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const start = Date.now()

  try {
    let jobs: Awaited<ReturnType<typeof reserve>>
    try {
      jobs = await reserve<any>(QUEUE_NAME, BATCH)
    } catch (redisErr: any) {
      console.warn('[email-queue-worker] Redis unavailable, skipping:', redisErr?.message?.slice(0, 100))
      return NextResponse.json({ skipped: true, reason: 'Redis unavailable' })
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        processed: 0,
        stats: await stats(QUEUE_NAME).catch(() => null),
      })
    }

    const results: any[] = []

    for (const job of jobs) {
      try {
        const res = await fetch(`${baseUrl}/api/email/campaigns/send-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
          },
          body: JSON.stringify(job.data),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`send-batch returned ${res.status}: ${text.slice(0, 200)}`)
        }

        await complete(QUEUE_NAME, job.id)
        results.push({ id: job.id, ok: true })
      } catch (err: any) {
        const { retrying, nextAttemptAt } = await fail(
          QUEUE_NAME,
          job,
          err?.message || String(err)
        )
        results.push({
          id: job.id,
          ok: false,
          retrying,
          nextAttemptAt,
          attempts: job.attempts + 1,
          error: err?.message,
        })
      }
    }

    return NextResponse.json({
      processed: jobs.length,
      results,
      stats: await stats(QUEUE_NAME),
      durationMs: Date.now() - start,
    })
  } catch (err: any) {
    console.error('[email-queue-worker] Error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
