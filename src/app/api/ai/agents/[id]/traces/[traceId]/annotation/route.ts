import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; traceId: string } }
) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (auth.user.role !== 'owner' && auth.user.role !== 'admin') {
      return NextResponse.json({ error: 'Sem permissão para anotar traces' }, { status: 403 })
    }

    const body = await request.json()
    const rating = body?.rating
    const correctionText =
      typeof body?.correctionText === 'string' ? body.correctionText.trim() : ''
    if (!['good', 'bad', 'fix'].includes(rating) || (rating === 'fix' && !correctionText)) {
      return NextResponse.json({ error: 'Payload de anotação inválido' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const organizationId = auth.user.organization_id
    const agentId = params.id

    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, organization_id')
      .eq('id', agentId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (agentError) throw agentError
    if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

    const { data: trace, error: traceError } = await supabase
      .from('agent_traces')
      .select('id, organization_id, agent_id')
      .eq('id', params.traceId)
      .eq('organization_id', organizationId)
      .eq('agent_id', agentId)
      .maybeSingle()
    if (traceError) throw traceError
    if (!trace) return NextResponse.json({ error: 'Trace não encontrado' }, { status: 404 })

    const { data: annotation, error } = await supabase
      .from('agent_trace_annotations')
      .upsert(
        {
          organization_id: organizationId,
          agent_id: agentId,
          trace_id: params.traceId,
          rating,
          correction_text: rating === 'fix' ? correctionText : null,
          annotated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'trace_id' }
      )
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ annotation })
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Payload de anotação inválido' }, { status: 400 })
    }
    console.error('Error in PUT /api/ai/agents/[id]/traces/[traceId]/annotation:', error)
    return NextResponse.json({ error: error?.message || 'Erro ao salvar anotação' }, { status: 500 })
  }
}
