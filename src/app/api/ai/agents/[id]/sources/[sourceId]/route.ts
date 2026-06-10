import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';
export const dynamic = 'force-dynamic';

// =====================================================
// GET - BUSCAR FONTE ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id da
    // querystring é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, sourceId } = params
    const organizationId = auth.user.organization_id

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const { data: source, error } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
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
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id da
    // querystring é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, sourceId } = params
    const organizationId = auth.user.organization_id

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Buscar fonte para obter file_url (para deletar do storage)
    const { data: source } = await supabase
      .from('ai_agent_sources')
      .select('file_url')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .single()

    // Deletar do storage se houver arquivo
    if (source?.file_url) {
      try {
        // Extrair path do arquivo da URL
        const urlParts = source.file_url.split('/ai-sources/')
        if (urlParts[1]) {
          await supabase.storage
            .from('ai-sources')
            .remove([urlParts[1]])
        }
      } catch (storageError) {
        console.error('Error deleting file from storage:', storageError)
        // Continua mesmo se falhar a remoção do storage
      }
    }

    // Deletar chunks associados
    await supabase
      .from('ai_agent_chunks')
      .delete()
      .eq('source_id', sourceId)

    // Deletar fonte (cascata já remove chunks pelo FK)
    const { error } = await supabase
      .from('ai_agent_sources')
      .delete()
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)

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
