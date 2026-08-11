import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { snapshotIfChanged } from '@/lib/ai/versions';
import { hasActiveProviderKey, providerKeyMissingResponse } from '@/lib/ai/provider-key-check';
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

    return NextResponse.json({ agent })

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

    // Verificar se agente existe (estado pré-update usado pelo snapshot de versão)
    const { data: existing, error: checkError } = await supabase
      .from('ai_agents')
      .select('id, system_prompt, persona, settings, provider, is_active')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // P1-1: preflight — quando a mudanca toca is_active/provider e o estado
    // final e ativo, o provider precisa ter chave ativa. Evita o agente
    // "ligado" que morre silenciosamente na 1a mensagem do cliente.
    if (body.is_active !== undefined || body.provider !== undefined) {
      const finalActive = body.is_active !== undefined ? body.is_active : existing.is_active
      const finalProvider = body.provider !== undefined ? body.provider : existing.provider
      if (finalActive === true && finalProvider) {
        const hasKey = await hasActiveProviderKey(supabase, organization_id, finalProvider)
        if (!hasKey) {
          return NextResponse.json(providerKeyMissingResponse(finalProvider), { status: 400 })
        }
      }
    }

    // Snapshot de versão (Bloco F1) — não-fatal: o save continua mesmo se falhar
    try {
      await snapshotIfChanged(
        supabase,
        {
          id: agentId,
          organization_id,
          system_prompt: existing.system_prompt,
          persona: existing.persona,
          settings: existing.settings,
        },
        { system_prompt: body.system_prompt, persona: body.persona, settings: body.settings },
        typeof body.user_id === 'string' ? body.user_id : null,
        typeof body.version_label === 'string' ? body.version_label : null
      )
    } catch (snapshotError) {
      console.error('Error snapshotting agent version (non-fatal):', snapshotError)
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos atualizáveis
    const allowedFields = [
      'name',
      'description',
      'system_prompt',
      'provider',
      'model',
      'temperature',
      'max_tokens',
      'is_active',
      'persona',
      'settings',
      'presentation_mode',
      'client_adaptation',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Atualizar
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

    return NextResponse.json({ agent })

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

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos permitidos em PATCH
    const allowedFields = [
      'name',
      'description',
      'is_active',
      'persona',
      'settings',
      'system_prompt',
      'provider',
      'model',
      'temperature',
      'max_tokens',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // P1-1: preflight de ativacao (mesma regra do PUT). Busca o estado atual
    // so quando a mudanca toca is_active/provider.
    if (body.is_active !== undefined || body.provider !== undefined) {
      const { data: existingAgent } = await supabase
        .from('ai_agents')
        .select('provider, is_active')
        .eq('id', agentId)
        .eq('organization_id', organization_id)
        .single()

      if (existingAgent) {
        const finalActive = body.is_active !== undefined ? body.is_active : existingAgent.is_active
        const finalProvider = body.provider !== undefined ? body.provider : existingAgent.provider
        if (finalActive === true && finalProvider) {
          const hasKey = await hasActiveProviderKey(supabase, organization_id, finalProvider)
          if (!hasKey) {
            return NextResponse.json(providerKeyMissingResponse(finalProvider), { status: 400 })
          }
        }
      }
    }

    // Snapshot de versão (Bloco F1) — não-fatal: o save continua mesmo se falhar
    try {
      if (
        body.system_prompt !== undefined ||
        body.persona !== undefined ||
        body.settings !== undefined
      ) {
        const { data: current } = await supabase
          .from('ai_agents')
          .select('id, system_prompt, persona, settings')
          .eq('id', agentId)
          .eq('organization_id', organization_id)
          .single()

        if (current) {
          await snapshotIfChanged(
            supabase,
            {
              id: agentId,
              organization_id,
              system_prompt: current.system_prompt,
              persona: current.persona,
              settings: current.settings,
            },
            { system_prompt: body.system_prompt, persona: body.persona, settings: body.settings },
            typeof body.user_id === 'string' ? body.user_id : null,
            typeof body.version_label === 'string' ? body.version_label : null
          )
        }
      }
    } catch (snapshotError) {
      console.error('Error snapshotting agent version (non-fatal):', snapshotError)
    }

    // Atualizar
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

    return NextResponse.json({ agent })

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
