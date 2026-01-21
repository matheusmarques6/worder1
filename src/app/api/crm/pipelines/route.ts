// src/app/api/crm/pipelines/route.ts
// =============================================
// CRM PIPELINES API - CORRIGIDA
// =============================================
// Mudanças:
// 1. Resolve organization_id do TOKEN
// 2. store_id é OPCIONAL (filtra se fornecido)
// 3. Melhor tratamento de erros
// 4. Criação de pipeline com store_id
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET - Listar pipelines
export async function GET(request: NextRequest) {
  try {
    // =====================================================
    // CORREÇÃO: Resolver contexto do token
    // =====================================================
    const auth = await getAuthClient()
    if (!auth) {
      return authError()
    }
    
    const { supabase, user } = auth
    const organizationId = user.organization_id
    
    if (!organizationId) {
      return NextResponse.json({ 
        error: 'Organization not found for user',
        pipelines: [] 
      }, { status: 400 })
    }
    
    // store_id é OPCIONAL
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store_id') || searchParams.get('storeId')
    
    // =====================================================
    // CORREÇÃO: store_id opcional, não obrigatório
    // =====================================================
    let query = supabase
      .from('pipelines')
      .select(`
        id,
        name,
        color,
        description,
        is_default,
        position,
        store_id,
        has_active_automations,
        automation_rules_count,
        created_at,
        updated_at,
        stages:pipeline_stages(
          id,
          name,
          color,
          position,
          is_won,
          is_lost,
          probability
        )
      `)
      .eq('organization_id', organizationId)
      .order('position', { ascending: true })

    // Se store_id fornecido, filtrar
    // Se não, buscar todos da organização (incluindo sem loja e de todas as lojas que o usuário tem acesso)
    if (storeId) {
      // Buscar pipelines da loja específica OU pipelines globais (sem store_id)
      query = query.or(`store_id.eq.${storeId},store_id.is.null`)
    }

    const { data: pipelines, error } = await query

    if (error) {
      console.error('[Pipelines] Error fetching:', error)
      return NextResponse.json({ 
        error: error.message, 
        pipelines: [],
        hint: 'Check if pipelines table exists and has correct columns'
      }, { status: 500 })
    }

    // Ordenar stages por position
    const formattedPipelines = (pipelines || []).map(pipeline => ({
      ...pipeline,
      stages: (pipeline.stages || []).sort((a: any, b: any) => a.position - b.position)
    }))

    return NextResponse.json({ 
      pipelines: formattedPipelines,
      total: formattedPipelines.length,
      filter: {
        organization_id: organizationId,
        store_id: storeId || 'all'
      }
    })
    
  } catch (error: any) {
    console.error('[Pipelines] API error:', error)
    return NextResponse.json({ 
      error: error.message, 
      pipelines: [] 
    }, { status: 500 })
  }
}

// POST - Criar pipeline
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) {
      return authError()
    }
    
    const { supabase, user } = auth
    const organizationId = user.organization_id
    
    const body = await request.json()
    const { name, description, color, stages, store_id } = body
    
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    
    // Buscar última posição
    const { data: existingPipelines } = await supabase
      .from('pipelines')
      .select('position')
      .eq('organization_id', organizationId)
      .order('position', { ascending: false })
      .limit(1)

    const position = (existingPipelines?.[0]?.position || 0) + 1

    // Criar pipeline
    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .insert({
        organization_id: organizationId,
        store_id: store_id || null,
        name,
        description,
        color: color || '#6366f1',
        position,
        is_default: position === 1, // Primeiro é default
      })
      .select()
      .single()

    if (error) {
      console.error('[Pipelines] Error creating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Criar stages
    const stagesToCreate = stages && stages.length > 0 ? stages : [
      { name: 'Lead', color: '#6366f1', probability: 10 },
      { name: 'Qualificado', color: '#8b5cf6', probability: 25 },
      { name: 'Proposta', color: '#a855f7', probability: 50 },
      { name: 'Negociação', color: '#f59e0b', probability: 75 },
      { name: 'Ganho', color: '#22c55e', probability: 100, is_won: true },
      { name: 'Perdido', color: '#ef4444', probability: 0, is_lost: true },
    ]

    const stageInserts = stagesToCreate.map((stage: any, index: number) => ({
      pipeline_id: pipeline.id,
      name: stage.name,
      color: stage.color || '#6366f1',
      position: index,
      probability: stage.probability ?? 50,
      is_won: stage.is_won ?? false,
      is_lost: stage.is_lost ?? false,
    }))

    const { error: stagesError } = await supabase
      .from('pipeline_stages')
      .insert(stageInserts)

    if (stagesError) {
      console.error('[Pipelines] Error creating stages:', stagesError)
      // Pipeline foi criado, retornar mesmo assim
    }

    // Buscar pipeline completo com stages
    const { data: pipelineWithStages } = await supabase
      .from('pipelines')
      .select(`
        *,
        stages:pipeline_stages(*)
      `)
      .eq('id', pipeline.id)
      .single()

    return NextResponse.json({ 
      pipeline: pipelineWithStages || pipeline 
    }, { status: 201 })
    
  } catch (error: any) {
    console.error('[Pipelines] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Atualizar pipeline
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) {
      return authError()
    }
    
    const { supabase, user } = auth
    const organizationId = user.organization_id
    
    const body = await request.json()
    const { id, name, description, color, is_default, position, store_id } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Pipeline ID is required' }, { status: 400 })
    }
    
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color
    if (is_default !== undefined) updates.is_default = is_default
    if (position !== undefined) updates.position = position
    if (store_id !== undefined) updates.store_id = store_id
    
    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId) // Segurança
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }
    
    return NextResponse.json({ pipeline })
    
  } catch (error: any) {
    console.error('[Pipelines] PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Deletar pipeline
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) {
      return authError()
    }
    
    const { supabase, user } = auth
    const organizationId = user.organization_id
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Pipeline ID is required' }, { status: 400 })
    }
    
    // Verificar se tem deals neste pipeline
    const { count: dealsCount } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('pipeline_id', id)
    
    if (dealsCount && dealsCount > 0) {
      return NextResponse.json({ 
        error: `Cannot delete pipeline with ${dealsCount} deals. Move or delete deals first.` 
      }, { status: 400 })
    }
    
    // Deletar stages primeiro
    await supabase
      .from('pipeline_stages')
      .delete()
      .eq('pipeline_id', id)
    
    // Deletar pipeline
    const { error } = await supabase
      .from('pipelines')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId) // Segurança
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('[Pipelines] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
