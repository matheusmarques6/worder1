// =============================================
// Pipeline Automation Rule API (Single)
// src/app/api/pipelines/[id]/automations/[ruleId]/route.ts
//
// GET: Buscar regra específica
// PUT: Atualizar regra
// DELETE: Deletar regra
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; ruleId: string };
}

// =============================================
// GET - Buscar regra específica
// =============================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { id: pipelineId, ruleId } = params;
  
  if (!pipelineId || !ruleId) {
    return NextResponse.json({ error: 'Pipeline ID and Rule ID required' }, { status: 400 });
  }
  
  try {
    // RLS filtra automaticamente por organization_id
    const { data: rule, error } = await supabase
      .from('pipeline_automation_rules')
      .select(`
        *,
        initial_stage:pipeline_stages!initial_stage_id(id, name, color),
        assigned_user:profiles!assign_to_user_id(id, full_name, avatar_url),
        pipeline:pipelines!pipeline_id(id, name)
      `)
      .eq('id', ruleId)
      .eq('pipeline_id', pipelineId)
      .single();
    
    if (error || !rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    
    return NextResponse.json({ rule });
    
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// PUT - Atualizar regra
// =============================================
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { id: pipelineId, ruleId } = params;
  
  if (!pipelineId || !ruleId) {
    return NextResponse.json({ error: 'Pipeline ID and Rule ID required' }, { status: 400 });
  }
  
  try {
    const body = await request.json();
    const {
      name,
      description,
      sourceType,
      sourceId,
      triggerEvent,
      filters,
      initialStageId,
      assignToUserId,
      dealTags,
      dealTitleTemplate,
      preventDuplicates,
      duplicateCheckPeriodHours,
      updateExistingDeal,
      isEnabled,
      position,
    } = body;
    
    // Verificar se regra existe - RLS filtra automaticamente
    const { data: existingRule, error: findError } = await supabase
      .from('pipeline_automation_rules')
      .select('id')
      .eq('id', ruleId)
      .eq('pipeline_id', pipelineId)
      .single();
    
    if (findError || !existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    
    // Verificar estágio inicial se fornecido
    if (initialStageId) {
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('id', initialStageId)
        .eq('pipeline_id', pipelineId)
        .single();
      
      if (!stage) {
        return NextResponse.json({ 
          error: 'Initial stage does not belong to this pipeline' 
        }, { status: 400 });
      }
    }
    
    // Montar objeto de atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (sourceType !== undefined) updateData.source_type = sourceType;
    if (sourceId !== undefined) updateData.source_id = sourceId;
    if (triggerEvent !== undefined) updateData.trigger_event = triggerEvent;
    if (filters !== undefined) updateData.filters = filters;
    if (initialStageId !== undefined) updateData.initial_stage_id = initialStageId;
    if (assignToUserId !== undefined) updateData.assign_to_user_id = assignToUserId;
    if (dealTags !== undefined) updateData.deal_tags = dealTags;
    if (dealTitleTemplate !== undefined) updateData.deal_title_template = dealTitleTemplate;
    if (preventDuplicates !== undefined) updateData.prevent_duplicates = preventDuplicates;
    if (duplicateCheckPeriodHours !== undefined) updateData.duplicate_check_period_hours = duplicateCheckPeriodHours;
    if (updateExistingDeal !== undefined) updateData.update_existing_deal = updateExistingDeal;
    if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
    if (position !== undefined) updateData.position = position;
    
    // Atualizar - RLS filtra automaticamente
    const { data: rule, error: updateError } = await supabase
      .from('pipeline_automation_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select(`
        *,
        initial_stage:pipeline_stages!initial_stage_id(id, name, color)
      `)
      .single();
    
    if (updateError) {
      console.error('[Automations API] Error updating rule:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      rule,
      message: 'Automation rule updated successfully',
    });
    
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// DELETE - Deletar regra
// =============================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { id: pipelineId, ruleId } = params;
  
  if (!pipelineId || !ruleId) {
    return NextResponse.json({ error: 'Pipeline ID and Rule ID required' }, { status: 400 });
  }
  
  try {
    // Verificar se regra existe - RLS filtra automaticamente
    const { data: existingRule, error: findError } = await supabase
      .from('pipeline_automation_rules')
      .select('id, name')
      .eq('id', ruleId)
      .eq('pipeline_id', pipelineId)
      .single();
    
    if (findError || !existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    
    // Deletar - RLS filtra automaticamente
    const { error: deleteError } = await supabase
      .from('pipeline_automation_rules')
      .delete()
      .eq('id', ruleId);
    
    if (deleteError) {
      console.error('[Automations API] Error deleting rule:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: `Rule "${existingRule.name}" deleted successfully`,
    });
    
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
