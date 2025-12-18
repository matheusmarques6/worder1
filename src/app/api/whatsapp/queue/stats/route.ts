import { NextRequest, NextResponse } from 'next/server'
import { campaignQueue, webhookQueue } from '@/lib/whatsapp/queue'
import { getRateLimiter } from '@/lib/whatsapp/rate-limiter'
import { getCircuitBreaker } from '@/lib/whatsapp/circuit-breaker'

// GET /api/whatsapp/queue/stats - Estatísticas das filas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceId = searchParams.get('instanceId')

    // Stats das filas
    const [campaignStats, webhookStats] = await Promise.all([
      campaignQueue.getStats(),
      webhookQueue.getStats()
    ])

    const response: any = {
      queues: {
        campaigns: campaignStats,
        webhooks: webhookStats
      },
      timestamp: new Date().toISOString()
    }

    // Se instanceId fornecido, incluir stats de rate limit e circuit breaker
    if (instanceId) {
      try {
        const rateLimiter = getRateLimiter(instanceId)
        const circuitBreaker = getCircuitBreaker(`wa:${instanceId}`)

        const [rateLimitStats, circuitState] = await Promise.all([
          rateLimiter.getStats(),
          circuitBreaker.getState()
        ])

        response.instance = {
          id: instanceId,
          rateLimit: rateLimitStats,
          circuitBreaker: {
            state: circuitState,
            stats: await circuitBreaker.getStats()
          }
        }
      } catch (error) {
        // Redis não configurado, ignorar
        response.instance = { id: instanceId, error: 'Stats not available' }
      }
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Error fetching queue stats:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch stats',
      queues: {
        campaigns: { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0, total: 0 },
        webhooks: { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0, total: 0 }
      }
    }, { status: 500 })
  }
}

// POST /api/whatsapp/queue/stats - Ações na fila (retry DLQ, clear, etc)
export async function POST(request: NextRequest) {
  try {
    const { action, queue: queueName, jobId } = await request.json()

    const queue = queueName === 'webhooks' ? webhookQueue : campaignQueue

    switch (action) {
      case 'retry_dlq':
        if (jobId) {
          const success = await queue.retryFromDLQ(jobId)
          return NextResponse.json({ success })
        } else {
          // Retry all DLQ jobs
          const dlqJobs = await queue.getDLQJobs(100)
          let retried = 0
          for (const job of dlqJobs) {
            if (await queue.retryFromDLQ(job.id)) retried++
          }
          return NextResponse.json({ retried, total: dlqJobs.length })
        }

      case 'clear':
        await queue.clear()
        return NextResponse.json({ success: true, message: 'Queue cleared' })

      case 'recover_stuck':
        const recovered = await queue.recoverStuckJobs(300000) // 5 min timeout
        return NextResponse.json({ recovered })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Queue action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
