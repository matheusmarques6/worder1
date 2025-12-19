import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Ativar/desativar bot e selecionar agente
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { agentId, isActive } = body

    // Se desativando o bot
    if (isActive === false || !agentId) {
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .update({
          is_bot_active: false,
          ai_agent_id: null,
          bot_stopped_at: new Date().toISOString(), // Marca quando foi parado
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ 
        conversation: data,
        botActive: false,
        agent: null,
      })
    }

    // Se ativando o bot com um agente
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        is_bot_active: true,
        ai_agent_id: agentId,
        bot_stopped_at: null, // Limpa a flag de parado
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      conversation: data,
      botActive: true,
      agent: agent,
    })
  } catch (error: any) {
    console.error('Error toggling bot:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Status atual do bot
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('*, agent:ai_agents(*)')
      .eq('id', conversationId)
      .single()

    if (error) throw error

    return NextResponse.json({ 
      botActive: conversation.is_bot_active,
      agent: conversation.agent,
    })
  } catch (error: any) {
    console.error('Error getting bot status:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
