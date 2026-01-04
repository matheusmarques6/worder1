import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-route';


async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  return data?.organization_id
}

// GET - Obter permissões de um agente
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agentId = params.id

    // Verificar se o agente pertence à organização
    const { data: agent } = await supabase
      .from('agents')
      .select('id, type')
      .eq('id', agentId)
      .eq('organization_id', orgId)
      .single()

    // Tentar tabela antiga se a nova não existir
    if (!agent) {
      const { data: oldAgent } = await supabase
        .from('whatsapp_agents')
        .select('id')
        .eq('id', agentId)
        .eq('organization_id', orgId)
        .single()

      if (!oldAgent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
    }

    // Buscar permissões
    let { data: permissions, error } = await supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error && error.code === 'PGRST116') {
      // Não encontrou, retornar permissões padrão
      permissions = {
        access_level: 'agent',
        whatsapp_access_all: false,
        whatsapp_allowed_numbers: [],
        whatsapp_can_send: true,
        whatsapp_can_transfer: true,
        pipeline_access_all: false,
        pipeline_allowed_ids: [],
        pipeline_can_edit: false,
      }
    } else if (error && error.code === '42P01') {
      // Tabela não existe, retornar padrão
      permissions = {
        access_level: 'agent',
        whatsapp_access_all: false,
        whatsapp_allowed_numbers: [],
        whatsapp_can_send: true,
        whatsapp_can_transfer: true,
        pipeline_access_all: false,
        pipeline_allowed_ids: [],
        pipeline_can_edit: false,
      }
    } else if (error) {
      throw error
    }

    return NextResponse.json({ permissions })

  } catch (error: any) {
    console.error('Error fetching permissions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Atualizar permissões de um agente
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgId(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agentId = params.id
    const body = await request.json()

    // Verificar se o agente pertence à organização
    let { data: agent }: { data: any } = await supabase
      .from('agents')
      .select('id, type')
      .eq('id', agentId)
      .eq('organization_id', orgId)
      .single()

    if (!agent) {
      const { data: oldAgent } = await supabase
        .from('whatsapp_agents')
        .select('id')
        .eq('id', agentId)
        .eq('organization_id', orgId)
        .single()

      if (!oldAgent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
      agent = oldAgent
    }

    // Preparar dados de permissão
    const permissionData = {
      agent_id: agentId,
      access_level: body.access_level || 'agent',
      whatsapp_access_all: body.whatsapp_access_all || false,
      whatsapp_allowed_numbers: body.whatsapp_allowed_numbers || [],
      whatsapp_can_send: body.whatsapp_can_send !== false,
      whatsapp_can_transfer: body.whatsapp_can_transfer !== false,
      pipeline_access_all: body.pipeline_access_all || false,
      pipeline_allowed_ids: body.pipeline_allowed_ids || [],
      pipeline_can_edit: body.pipeline_can_edit || false,
      updated_at: new Date().toISOString(),
    }

    // Upsert permissões
    const { data: permissions, error } = await supabase
      .from('agent_permissions')
      .upsert(permissionData, {
        onConflict: 'agent_id',
      })
      .select()
      .single()

    if (error) {
      // Se a tabela não existe, apenas retornar sucesso
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          permissions: permissionData,
          note: 'Tabela de permissões não existe ainda. Execute as migrations.',
        })
      }
      throw error
    }

    return NextResponse.json({ success: true, permissions })

  } catch (error: any) {
    console.error('Error updating permissions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
