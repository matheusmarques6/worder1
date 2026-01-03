import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - BUSCAR FONTE ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, sourceId } = params

    // RLS filtra automaticamente por organization_id
    const { data: source, error } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ source })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/sources/[sourceId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// DELETE - REMOVER FONTE
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, sourceId } = params

    // Buscar fonte para obter file_url - RLS filtra automaticamente
    const { data: source } = await supabase
      .from('ai_agent_sources')
      .select('file_url')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .single()

    // Deletar do storage se houver arquivo
    if (source?.file_url) {
      try {
        const urlParts = source.file_url.split('/ai-sources/')
        if (urlParts[1]) {
          await supabase.storage
            .from('ai-sources')
            .remove([urlParts[1]])
        }
      } catch (storageError) {
        console.error('Error deleting file from storage:', storageError)
      }
    }

    // Deletar chunks associados
    await supabase
      .from('ai_agent_chunks')
      .delete()
      .eq('source_id', sourceId)

    // Deletar fonte - RLS filtra automaticamente
    const { error } = await supabase
      .from('ai_agent_sources')
      .delete()
      .eq('id', sourceId)
      .eq('agent_id', agentId)

    if (error) {
      console.error('Error deleting source:', error)
      throw error
    }

    return NextResponse.json({ success: true, message: 'Fonte excluída com sucesso' })

  } catch (error: any) {
    console.error('Error in DELETE /api/ai/agents/[id]/sources/[sourceId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
