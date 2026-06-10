import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';
export const dynamic = 'force-dynamic';

// =====================================================
// POST - REPROCESSAR FONTE
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // body é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, sourceId } = params
    const organizationId = auth.user.organization_id

    // Verificar se agente pertence à org autenticada
    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Verificar se fonte existe
    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
    }

    // Limpar chunks existentes
    await supabase
      .from('ai_agent_chunks')
      .delete()
      .eq('source_id', sourceId)

    // Atualizar status para pending
    const { error: updateError } = await supabase
      .from('ai_agent_sources')
      .update({
        status: 'pending',
        error_message: null,
        chunks_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)

    if (updateError) {
      console.error('Error updating source status:', updateError)
      throw updateError
    }

    // Disparar reprocessamento em background
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
      }),
    }).catch(err => {
      console.error('Error triggering reprocess:', err)
    })

    return NextResponse.json({
      success: true,
      message: 'Reprocessamento iniciado',
      source_id: sourceId,
    })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/sources/[sourceId]/reprocess:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
