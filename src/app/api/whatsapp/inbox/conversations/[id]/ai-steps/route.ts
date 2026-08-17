// GET - Passos recentes do agente nesta conversa (whatsapp_ai_run_steps).
//
// O painel de progresso (AgentActivity) era alimentado SÓ por Realtime: ao
// recarregar a página a trilha sumia, embora os passos estejam gravados
// (defeito 3 de 17/08). Esta rota devolve os últimos passos para a carga
// inicial; o Realtime segue sendo o vivo a partir daí. Mesmo shape do evento
// do canal (id, run_id, step, detail, created_at).
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { data, error } = await supabase
      .from('whatsapp_ai_run_steps')
      .select('id, conversation_id, run_id, agent_id, step, detail, created_at')
      .eq('conversation_id', params.id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) throw error

    // O painel espera ordem cronológica (o último é o estado atual).
    return NextResponse.json({ steps: (data ?? []).reverse() })
  } catch (error: any) {
    console.error('Error fetching ai steps:', error)
    return NextResponse.json({ error: 'Failed to fetch ai steps' }, { status: 500 })
  }
}
