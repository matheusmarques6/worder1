import { NextRequest, NextResponse } from 'next/server'
import { decorateLegacyFields, toCanonicalAgentRow } from '@/lib/ai/mappers'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { snapshotAgent } from '@/lib/ai/versioning';
export const dynamic = 'force-dynamic';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =====================================================
// GET - BUSCAR AGENTE POR ID
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()
    const agentId = params.id

    // ✅ CORREÇÃO: Usar organization_id do usuário autenticado
    const organizationId = auth.user.organization_id

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Buscar agente
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ agent: decorateLegacyFields(agent) })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PUT - ATUALIZAR AGENTE COMPLETO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    // ✅ CORREÇÃO: Usar organization_id do usuário autenticado
    const organization_id = auth.user.organization_id

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Verificar se agente existe
    const { data: existing, error: checkError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Mapper aceita campos legados (system_prompt/provider/model/...) ou
    // canônicos (identity/llm_config/...) e devolve apenas o que veio no body.
    const updateData = {
      ...toCanonicalAgentRow(body),
      updated_at: new Date().toISOString(),
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating agent:', error)
      throw error
    }

    return NextResponse.json({ agent: decorateLegacyFields(agent) })

  } catch (error: any) {
    console.error('Error in PUT /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PATCH - ATUALIZAR CAMPOS ESPECÍFICOS
// =====================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    // ✅ CORREÇÃO: Usar organization_id do usuário autenticado
    const organization_id = auth.user.organization_id

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Detecta transição draft → published para auto-snapshot
    const { data: prevAgent } = await supabase
      .from('ai_agents')
      .select('status')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .maybeSingle()
    const prevStatus = prevAgent?.status as string | undefined

    const updateData = {
      ...toCanonicalAgentRow(body),
      updated_at: new Date().toISOString(),
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
      }
      throw error
    }

    // Auto-snapshot quando publica pela primeira vez ou re-publica após rascunho
    const newStatus = (agent as Record<string, unknown>).status as string | undefined
    if (newStatus === 'published' && prevStatus !== 'published') {
      try {
        await snapshotAgent(agentId, organization_id, {
          deployNotes: 'Auto-snapshot ao publicar',
          createdByUserId: auth.user.id,
        })
      } catch (snapErr) {
        console.warn('[agents/PATCH] auto-snapshot falhou:', snapErr)
      }
    }

    return NextResponse.json({ agent: decorateLegacyFields(agent) })

  } catch (error: any) {
    console.error('Error in PATCH /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// DELETE - REMOVER AGENTE
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()
    const agentId = params.id

    // ✅ CORREÇÃO: Usar organization_id do usuário autenticado
    const organizationId = auth.user.organization_id

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Deletar (cascata remove fontes, chunks, ações, integrações)
    const { error } = await supabase
      .from('ai_agents')
      .delete()
      .eq('id', agentId)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Error deleting agent:', error)
      throw error
    }

    return NextResponse.json({ success: true, message: 'Agente excluído com sucesso' })

  } catch (error: any) {
    console.error('Error in DELETE /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
