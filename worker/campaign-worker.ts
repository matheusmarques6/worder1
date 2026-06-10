#!/usr/bin/env node

// =============================================
// STANDALONE CAMPAIGN WORKER
// Execute com: npx ts-node worker/campaign-worker.ts
// Ou em Railway/Render: node dist/worker/campaign-worker.js
// =============================================

import { campaignProcessor } from '../src/lib/whatsapp/campaign-processor'
import { campaignQueue } from '../src/lib/whatsapp/queue'
import { beatWorkerHeartbeat } from '../src/lib/whatsapp/worker-heartbeat'

// Configurações
const CONFIG = {
  shutdownGracePeriodMs: 10000, // 10s para encerrar gracefully
  healthCheckIntervalMs: 30000, // Health check a cada 30s
}

// Estado do worker
let isShuttingDown = false
let processedJobs = 0
let startTime: number

// =============================================
// MAIN
// =============================================

async function main() {
  console.log('🚀 WhatsApp Campaign Worker Starting...')
  console.log(`📅 ${new Date().toISOString()}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`)
  
  startTime = Date.now()

  // Verificar variáveis de ambiente
  checkEnvVars()

  // Heartbeat: o cron whatsapp-dead-alert usa pra detectar worker morto
  // com fila acumulando.
  await beatWorkerHeartbeat().catch((e: any) =>
    console.warn('⚠️ heartbeat failed (ignored):', e?.message))

  // Setup graceful shutdown
  setupGracefulShutdown()

  // Health check periódico
  setupHealthCheck()

  // Iniciar worker
  try {
    await campaignProcessor.startWorker()
  } catch (error) {
    console.error('❌ Worker crashed:', error)
    process.exit(1)
  }
}

// =============================================
// VERIFICAR ENV VARS
// =============================================

function checkEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ Missing environment variables:')
    missing.forEach(key => console.error(`   - ${key}`))
    process.exit(1)
  }

  console.log('✅ Environment variables OK')
}

// =============================================
// GRACEFUL SHUTDOWN
// =============================================

function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log('⚠️ Already shutting down...')
      return
    }

    isShuttingDown = true
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`)

    // Parar de pegar novos jobs
    campaignProcessor.stopWorker()

    // Esperar jobs em andamento terminarem
    console.log(`⏳ Waiting ${CONFIG.shutdownGracePeriodMs / 1000}s for pending jobs...`)
    await sleep(CONFIG.shutdownGracePeriodMs)

    // Stats finais
    const uptime = Math.round((Date.now() - startTime) / 1000)
    console.log(`\n📊 Final Stats:`)
    console.log(`   Uptime: ${formatDuration(uptime)}`)
    console.log(`   Jobs processed: ${processedJobs}`)

    const queueStats = await campaignQueue.getStats().catch(() => null)
    if (queueStats) {
      console.log(`   Queue pending: ${queueStats.pending}`)
      console.log(`   Queue DLQ: ${queueStats.dead}`)
    }

    console.log('\n👋 Goodbye!')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGQUIT', () => shutdown('SIGQUIT'))

  // Uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error)
    shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  })
}

// =============================================
// HEALTH CHECK
// =============================================

function setupHealthCheck() {
  setInterval(async () => {
    if (isShuttingDown) return

    // Heartbeat: o cron whatsapp-dead-alert usa pra detectar worker morto
    // com fila acumulando.
    await beatWorkerHeartbeat().catch((e: any) =>
      console.warn('⚠️ heartbeat failed (ignored):', e?.message))

    const uptime = Math.round((Date.now() - startTime) / 1000)
    const memUsage = process.memoryUsage()

    try {
      const queueStats = await campaignQueue.getStats()

      console.log(`💓 Health Check [${formatDuration(uptime)}]:`)
      console.log(`   Queue: ${queueStats.pending} pending, ${queueStats.processing} processing, ${queueStats.dead} DLQ`)
      console.log(`   Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`)
    } catch (error: any) {
      console.error(`❌ Health check failed: ${error.message}`)
    }
  }, CONFIG.healthCheckIntervalMs)
}

// =============================================
// HELPERS
// =============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

// =============================================
// RUN
// =============================================

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
