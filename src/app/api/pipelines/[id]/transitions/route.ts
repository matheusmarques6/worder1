// =============================================
// Pipeline Stage Transitions API
// src/app/api/pipelines/[id]/transitions/route.ts
//
// GET: Listar transições automáticas
// POST: Criar nova transição
// PUT: Atualizar transição
// DELETE: Deletar transição
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseAdmin();
}

interface RouteParams {
  params: { id: string };
}

// =============================================
// GET - Listar transições
// =============================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }
  
  try {
    const { data: transitions, error } = await supabase
      .from('pipeline_stage_transitions')
      .select(`
        *,
        from_stage:pipeline_stages!from_stage_id(id, name, color),
        to_stage:pipeline_stages!to_stage_id(id, name, color)
      `)
      .eq('pipeline_id', pipelineId)
      .eq('organization_id', organizationId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('[Transitions API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      transitions: transitions || [],
      total: transitions?.length || 0,
    });
    
  } catch (error: any) {
    console.error('[Transitions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar transição
// =============================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const {
      organizationId,
      name,
      description,
      sourceType,
      triggerEvent,
      filters,
      fromStageId,
      toStageId,
      markAsWon,
      markAsLost,
      isEnabled,
      position,
    } = body;
    
    // Validações
    if (!organizationId || !sourceType || !triggerEvent || !toStageId) {
      return NextResponse.json({ 
        error: 'organizationId, sourceType, triggerEvent and toStageId are required' 
      }, { status: 400 });
    }
    
    // Verificar se pipeline existe
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', pipelineId)
      .eq('organization_id', organizationId)
      .single();
    
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Verificar estágios
    const { data: toStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('id', toStageId)
      .eq('pipeline_id', pipelineId)
      .single();
    
    if (!toStage) {
      return NextResponse.json({ error: 'Target stage not found' }, { status: 400 });
    }
    
    if (fromStageId) {
      const { data: fromStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('id', fromStageId)
        .eq('pipeline_id', pipelineId)
        .single();
      
      if (!fromStage) {
        return NextResponse.json({ error: 'Source stage not found' }, { status: 400 });
      }
    }
    
    // Buscar próxima posição
    let transitionPosition = position;
    if (transitionPosition === undefined) {
      const { data: lastTransition } = await supabase
        .from('pipeline_stage_transitions')
        .select('position')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: false })
        .limit(1)
        .single();
      
      transitionPosition = (lastTransition?.position || 0) + 1;
    }
    
    // Criar transição
    const { data: transition, error: createError } = await supabase
      .from('pipeline_stage_transitions')
      .insert({
        organization_id: organizationId,
        pipeline_id: pipelineId,
        name: name || `${sourceType} - ${triggerEvent}`,
        description,
        source_type: sourceType,
        trigger_event: triggerEvent,
        filters: filters || {},
        from_stage_id: fromStageId || null,
        to_stage_id: toStageId,
        mark_as_won: markAsWon || false,
        mark_as_lost: markAsLost || false,
        is_enabled: isEnabled ?? true,
        position: transitionPosition,
      })
      .select(`
        *,
        from_stage:pipeline_stages!from_stage_id(id, name, color),
        to_stage:pipeline_stages!to_stage_id(id, name, color)
      `)
      .single();
    
    if (createError) {
      console.error('[Transitions API] Error creating:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      transition,
      message: 'Stage transition created successfully',
    });
    
  } catch (error: any) {
    console.error('[Transitions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar transição
// =============================================
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  try {
    const body = await request.json();
    const {
      organizationId,
      transitionId,
      name,
      description,
      sourceType,
      triggerEvent,
      filters,
      fromStageId,
      toStageId,
      markAsWon,
      markAsLost,
      isEnabled,
      position,
    } = body;
    
    if (!organizationId || !transitionId) {
      return NextResponse.json({ error: 'organizationId and transitionId required' }, { status: 400 });
    }
    
    // Verificar se transição existe
    const { data: existing } = await supabase
      .from('pipeline_stage_transitions')
      .select('id')
      .eq('id', transitionId)
      .eq('pipeline_id', pipelineId)
      .eq('organization_id', organizationId)
      .single();
    
    if (!existing) {
      return NextResponse.json({ error: 'Transition not found' }, { status: 404 });
    }
    
    // Montar update
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (sourceType !== undefined) updateData.source_type = sourceType;
    if (triggerEvent !== undefined) updateData.trigger_event = triggerEvent;
    if (filters !== undefined) updateData.filters = filters;
    if (fromStageId !== undefined) updateData.from_stage_id = fromStageId;
    if (toStageId !== undefined) updateData.to_stage_id = toStageId;
    if (markAsWon !== undefined) updateData.mark_as_won = markAsWon;
    if (markAsLost !== undefined) updateData.mark_as_lost = markAsLost;
    if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
    if (position !== undefined) updateData.position = position;
    
    const { data: transition, error: updateError } = await supabase
      .from('pipeline_stage_transitions')
      .update(updateData)
      .eq('id', transitionId)
      .select(`
        *,
        from_stage:pipeline_stages!from_stage_id(id, name, color),
        to_stage:pipeline_stages!to_stage_id(id, name, color)
      `)
      .single();
    
    if (updateError) {
      console.error('[Transitions API] Error updating:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      transition,
      message: 'Stage transition updated successfully',
    });
    
  } catch (error: any) {
    console.error('[Transitions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Deletar transição
// =============================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
  }
  
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const transitionId = searchParams.get('transitionId');
  
  if (!organizationId || !transitionId) {
    return NextResponse.json({ error: 'organizationId and transitionId required' }, { status: 400 });
  }
  
  try {
    const { error: deleteError } = await supabase
      .from('pipeline_stage_transitions')
      .delete()
      .eq('id', transitionId)
      .eq('pipeline_id', pipelineId)
      .eq('organization_id', organizationId);
    
    if (deleteError) {
      console.error('[Transitions API] Error deleting:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Stage transition deleted successfully',
    });
    
  } catch (error: any) {
    console.error('[Transitions API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
