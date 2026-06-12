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
import { assertDebugAllowed } from '@/lib/debug-guard'
export const dynamic = 'force-dynamic';

// =====================================================
// GET - Status e instruções
// =====================================================

export async function GET(request: NextRequest) {
  const blocked = assertDebugAllowed(request)
  if (blocked) return blocked
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
    }
  })
}

// =====================================================
// POST - Executar ações de teste
// =====================================================

export async function POST(request: NextRequest) {
  // ✅ P1: mesmo guard do GET — rota de debug, não expor em produção
  const blocked = assertDebugAllowed(request)
  if (blocked) return blocked

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

      case 'enable_ai':
        return handleEnableAI(body)

      case 'disable_ai':
        return handleDisableAI(body)

      case 'conversation_status':
        return handleConversationStatus(body)
      
      default:
        return NextResponse.json({ 
          error: 'Ação inválida',
          available_actions: [
            'test_redis', 
            'cache_stats', 
            'list_agents', 
            'process', 
            'test_rag',
            'enable_ai',
            'disable_ai',
            'conversation_status'
          ]
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
  const { agentId, organizationId, query, topK = 5, threshold = 0.7 } = body

  if (!agentId || !organizationId || !query) {
    return NextResponse.json({
      error: 'Campos obrigatórios: agentId, organizationId, query',
      example: {
        action: 'test_rag',
        agentId: 'uuid-do-agente',
        organizationId: 'uuid-da-organizacao',
        query: 'preço do produto',
        topK: 5,
        threshold: 0.7
      }
    }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    const { createRAGServiceForOrg } = await import('@/lib/ai/rag')
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const ragService = await createRAGServiceForOrg(supabaseAdmin as any, organizationId)
    if (!ragService) {
      return NextResponse.json({
        error: 'Chave OpenAI nao cadastrada nesta org (Configurações > API Keys).',
      }, { status: 400 })
    }

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

// =====================================================
// HABILITAR IA PARA CONVERSA
// =====================================================

async function handleEnableAI(body: any) {
  const { conversationId, phoneNumber, organizationId } = body

  if (!conversationId && !phoneNumber) {
    return NextResponse.json({ 
      error: 'Informe conversationId ou phoneNumber + organizationId',
      example: {
        action: 'enable_ai',
        conversationId: 'uuid-da-conversa',
        // OU
        phoneNumber: '5511999999999',
        organizationId: 'uuid-da-org',
      }
    }, { status: 400 })
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  try {
    let query = supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        ai_enabled: true,
        ai_disabled_at: null,
        ai_disabled_reason: null,
      })

    if (conversationId) {
      query = query.eq('id', conversationId)
    } else {
      query = query.eq('phone_number', phoneNumber).eq('organization_id', organizationId)
    }

    const { data, error } = await query.select()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '✅ IA habilitada para a conversa',
      updated: data?.length || 0,
    })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// =====================================================
// DESABILITAR IA PARA CONVERSA
// =====================================================

async function handleDisableAI(body: any) {
  const { conversationId, phoneNumber, organizationId, reason = 'manual' } = body

  if (!conversationId && !phoneNumber) {
    return NextResponse.json({ 
      error: 'Informe conversationId ou phoneNumber + organizationId',
      example: {
        action: 'disable_ai',
        conversationId: 'uuid-da-conversa',
        reason: 'manual',
      }
    }, { status: 400 })
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  try {
    let query = supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: reason,
      })

    if (conversationId) {
      query = query.eq('id', conversationId)
    } else {
      query = query.eq('phone_number', phoneNumber).eq('organization_id', organizationId)
    }

    const { data, error } = await query.select()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: '⏸️ IA desabilitada para a conversa',
      reason,
      updated: data?.length || 0,
    })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// =====================================================
// STATUS DA CONVERSA (DEBUG)
// =====================================================

async function handleConversationStatus(body: any) {
  const { conversationId, phoneNumber, organizationId } = body

  if (!conversationId && !phoneNumber) {
    return NextResponse.json({ 
      error: 'Informe conversationId ou phoneNumber + organizationId',
      example: {
        action: 'conversation_status',
        conversationId: 'uuid-da-conversa',
      }
    }, { status: 400 })
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  try {
    let query = supabaseAdmin
      .from('whatsapp_conversations')
      .select(`
        id,
        phone_number,
        status,
        ai_enabled,
        ai_agent_id,
        ai_disabled_at,
        ai_disabled_reason,
        pipeline_stage_id,
        last_message_at,
        last_message_preview,
        unread_count,
        created_at
      `)

    if (conversationId) {
      query = query.eq('id', conversationId)
    } else {
      query = query.eq('phone_number', phoneNumber).eq('organization_id', organizationId)
    }

    const { data: conversation, error } = await query.single()

    if (error || !conversation) {
      return NextResponse.json({ 
        success: false, 
        error: 'Conversa não encontrada',
        details: error?.message 
      }, { status: 404 })
    }

    // Buscar agente ativo se houver
    let activeAgent = null
    if (conversation.ai_enabled) {
      const { data: agentData } = await supabaseAdmin
        .rpc('get_active_agent_for_conversation', {
          p_organization_id: organizationId || (await getOrgFromConversation(conversation.id)),
          p_channel_id: null,
          p_pipeline_stage_id: conversation.pipeline_stage_id,
        })
      
      if (agentData && agentData.length > 0) {
        activeAgent = {
          id: agentData[0].agent_id,
          name: agentData[0].agent_name,
        }
      }
    }

    // Contar mensagens recentes
    const { count: totalMessages } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)

    const { count: aiMessages } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('direction', 'outbound')
      .contains('metadata', { sent_by: 'ai_agent' })

    return NextResponse.json({
      success: true,
      conversation: {
        ...conversation,
        activeAgent,
      },
      stats: {
        totalMessages,
        aiMessages,
      },
      ai_status: conversation.ai_enabled 
        ? (activeAgent ? '✅ IA ativa' : '⚠️ IA habilitada mas sem agente')
        : `⏸️ IA desabilitada (${conversation.ai_disabled_reason || 'sem motivo'})`,
    })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// Helper para buscar org de uma conversa
async function getOrgFromConversation(conversationId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('organization_id')
    .eq('id', conversationId)
    .single()
  return data?.organization_id || null
}
