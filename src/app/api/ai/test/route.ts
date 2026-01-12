// =====================================================
// API DE TESTE - REDIS E MOTOR DE IA
// /api/ai/test
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { 
  testRedisConnection, 
  isRedisConfigured, 
  getCacheStats,
  CACHE_PREFIX 
} from '@/lib/redis'

// =====================================================
// GET - Status e instruções
// =====================================================

export async function GET() {
  // Testar conexão Redis
  const redisConfigured = isRedisConfigured()
  let redisStatus: { connected: boolean; latencyMs?: number; error?: string } = { 
    connected: false, 
    error: 'Não configurado' 
  }
  
  if (redisConfigured) {
    redisStatus = await testRedisConnection()
  }

  return NextResponse.json({
    status: 'API de Teste do Motor de IA',
    redis: {
      configured: redisConfigured,
      connected: redisStatus.connected,
      latencyMs: redisStatus.latencyMs,
      error: redisStatus.error,
    },
    endpoints: {
      'GET /api/ai/test': 'Status da API e Redis',
      'POST /api/ai/test': {
        actions: {
          test_redis: 'Testa conexão com Redis',
          cache_stats: 'Estatísticas do cache de embeddings',
          list_agents: 'Lista agentes de uma organização',
          process: 'Processa mensagem com agente',
          test_rag: 'Testa busca RAG',
        }
      }
    },
    environment: {
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? '✅ Configurado' : '❌ Não configurado',
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? '✅ Configurado' : '❌ Não configurado',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Configurado' : '❌ Não configurado',
      EVOLUTION_API_URL: process.env.EVOLUTION_API_URL ? '✅ Configurado' : '❌ Não configurado',
    }
  })
}

// =====================================================
// POST - Executar ações de teste
// =====================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'test_redis':
        return handleTestRedis()
      
      case 'cache_stats':
        return handleCacheStats()
      
      case 'list_agents':
        return handleListAgents(body)
      
      case 'process':
        return handleProcess(body)
      
      case 'test_rag':
        return handleTestRAG(body)
      
      default:
        return NextResponse.json({ 
          error: 'Ação inválida',
          available_actions: ['test_redis', 'cache_stats', 'list_agents', 'process', 'test_rag']
        }, { status: 400 })
    }

  } catch (error: any) {
    console.error('[AI Test] Erro:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 })
  }
}

// =====================================================
// HANDLERS
// =====================================================

async function handleTestRedis() {
  const configured = isRedisConfigured()
  
  if (!configured) {
    return NextResponse.json({
      success: false,
      error: 'Redis não configurado. Adicione UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN ao .env.local',
      help: {
        step1: 'Acesse https://console.upstash.com/',
        step2: 'Crie um database Redis',
        step3: 'Copie UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN',
        step4: 'Adicione ao arquivo .env.local',
        step5: 'Reinicie o servidor (npm run dev)',
      }
    }, { status: 400 })
  }

  const result = await testRedisConnection()

  if (result.connected) {
    return NextResponse.json({
      success: true,
      message: '✅ Redis conectado com sucesso!',
      latencyMs: result.latencyMs,
    })
  } else {
    return NextResponse.json({
      success: false,
      error: result.error,
      message: '❌ Falha ao conectar no Redis',
    }, { status: 500 })
  }
}

async function handleCacheStats() {
  const configured = isRedisConfigured()
  
  if (!configured) {
    return NextResponse.json({
      success: false,
      error: 'Redis não configurado',
    }, { status: 400 })
  }

  // Importar estatísticas de embeddings
  const { getEmbeddingCacheStats } = await import('@/lib/ai/embeddings')
  const embeddingStats = getEmbeddingCacheStats()

  const embeddingRedisStats = await getCacheStats(CACHE_PREFIX.EMBEDDING)
  const intentStats = await getCacheStats(CACHE_PREFIX.INTENT)
  const sentimentStats = await getCacheStats(CACHE_PREFIX.SENTIMENT)

  return NextResponse.json({
    success: true,
    cache: {
      embeddings: {
        ...embeddingRedisStats,
        sessionStats: embeddingStats, // hits, misses, hitRate da sessão atual
      },
      intents: intentStats,
      sentiments: sentimentStats,
      total: {
        keys: embeddingRedisStats.totalKeys + intentStats.totalKeys + sentimentStats.totalKeys,
        estimatedMemoryMB: embeddingRedisStats.estimatedMemoryMB + intentStats.estimatedMemoryMB + sentimentStats.estimatedMemoryMB,
      }
    }
  })
}

async function handleListAgents(body: any) {
  const { organizationId } = body

  if (!organizationId) {
    return NextResponse.json({ 
      error: 'Campo obrigatório: organizationId' 
    }, { status: 400 })
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  
  const { data: agents, error } = await supabaseAdmin
    .from('ai_agents')
    .select('id, name, is_active, provider, model, total_messages, total_tokens_used, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: agents?.length || 0,
    agents: agents || [],
  })
}

async function handleProcess(body: any) {
  const { agentId, organizationId, message, conversationHistory = [] } = body

  if (!agentId || !organizationId || !message) {
    return NextResponse.json({ 
      error: 'Campos obrigatórios: agentId, organizationId, message',
      example: {
        action: 'process',
        agentId: 'uuid-do-agente',
        organizationId: 'uuid-da-organizacao',
        message: 'Olá, qual o preço do produto X?',
        conversationHistory: []
      }
    }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    const { processWithAgent } = await import('@/lib/ai/engine')
    
    const result = await processWithAgent(
      agentId,
      organizationId,
      message,
      conversationHistory
    )

    return NextResponse.json({
      success: true,
      result: {
        response: result.response,
        sources_used: result.sources_used,
        actions_triggered: result.actions_triggered,
        tokens_used: result.tokens_used,
        response_time_ms: result.response_time_ms,
        was_transferred: result.was_transferred,
        transfer_to: result.transfer_to,
      },
      total_processing_time_ms: Date.now() - startTime,
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      processing_time_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}

async function handleTestRAG(body: any) {
  const { agentId, query, topK = 5, threshold = 0.7 } = body

  if (!agentId || !query) {
    return NextResponse.json({ 
      error: 'Campos obrigatórios: agentId, query',
      example: {
        action: 'test_rag',
        agentId: 'uuid-do-agente',
        query: 'preço do produto',
        topK: 5,
        threshold: 0.7
      }
    }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    const { createRAGService } = await import('@/lib/ai/rag')
    const ragService = createRAGService()

    const results = await ragService.search({
      agentId,
      query,
      topK,
      threshold,
    })

    return NextResponse.json({
      success: true,
      query,
      results_count: results.length,
      results: results.map(r => ({
        source_name: r.source_name,
        content_preview: r.content.substring(0, 300) + (r.content.length > 300 ? '...' : ''),
        similarity: Number(r.similarity.toFixed(4)),
        chunk_id: r.chunk_id,
        source_id: r.source_id,
      })),
      search_time_ms: Date.now() - startTime,
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      search_time_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}
