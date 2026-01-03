import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// POST - REPROCESSAR FONTE
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const { id: agentId, sourceId } = params

    // Verificar se fonte existe - RLS filtra automaticamente
    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: user.organization_id,
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
