import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processWithAgent } from '@/lib/ai/engine'
import { EngineMessage } from '@/lib/ai/types'

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado')
  }

  return createClient(url, key)
}

// =====================================================
// POST - TESTAR AGENTE
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agentId = params.id
    const body = await request.json()

    const { organization_id, message, conversation_history = [] } = body

    // Validações
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message é obrigatório' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Verificar se agente existe
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, name, is_active')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Converter histórico para formato do engine
    const history: EngineMessage[] = (conversation_history || []).map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    // Processar mensagem
    const startTime = Date.now()
    
    const result = await processWithAgent(
      agentId,
      organization_id,
      message.trim(),
      history,
      'test-conversation'
    )

    // Buscar nomes das fontes usadas
    let sourceNames: string[] = []
    if (result.sources_used.length > 0) {
      const { data: sources } = await supabase
        .from('ai_agent_sources')
        .select('id, name')
        .in('id', result.sources_used)

      sourceNames = sources?.map(s => s.name) || []
    }

    // Buscar nomes das ações disparadas
    let actionNames: string[] = []
    if (result.actions_triggered.length > 0) {
      const { data: actions } = await supabase
        .from('ai_agent_actions')
        .select('id, name')
        .in('id', result.actions_triggered)

      actionNames = actions?.map(a => a.name) || []
    }

    return NextResponse.json({
      response: result.response,
      sources_used: sourceNames,
      actions_triggered: actionNames,
      tokens_used: result.tokens_used,
      response_time_ms: result.response_time_ms,
      was_transferred: result.was_transferred,
      transfer_to: result.transfer_to,
      debug: {
        sources_ids: result.sources_used,
        actions_ids: result.actions_triggered,
        action_result: result.action_result,
      },
    })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/test:', error)
    
    // Retornar erro mais amigável
    let errorMessage = error.message
    
    if (error.message.includes('API key')) {
      errorMessage = 'API key do provedor de IA não configurada. Configure em Configurações > Chaves de API.'
    } else if (error.message.includes('não está ativo')) {
      errorMessage = 'Este agente está desativado. Ative-o antes de testar.'
    } else if (error.message.includes('horário')) {
      errorMessage = 'Fora do horário de funcionamento configurado para este agente.'
    }

    return NextResponse.json({ 
      error: errorMessage,
      original_error: error.message,
    }, { status: 500 })
  }
}

// Config
export const config = {
  maxDuration: 60,
}
