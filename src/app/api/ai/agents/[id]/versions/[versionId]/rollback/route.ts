import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listVersions, rollbackToVersion } from '@/lib/ai/versions'
export const dynamic = 'force-dynamic';

// =====================================================
// POST - REVERTER AGENTE PARA UMA VERSÃO (Bloco F1)
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; versionId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const { id: agentId, versionId } = params
    const body = await request.json()

    const { organization_id, user_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Verificar se agente existe na organização
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    await rollbackToVersion(
      supabase,
      agentId,
      organization_id,
      versionId,
      typeof user_id === 'string' ? user_id : null
    )

    const versions = await listVersions(supabase, agentId, organization_id)

    return NextResponse.json({ versions })

  } catch (error: any) {
    if (error?.message === 'Versão não encontrada') {
      return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })
    }
    console.error('Error in POST /api/ai/agents/[id]/versions/[versionId]/rollback:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
