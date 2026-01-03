// =============================================
// Pipeline Automation Rules API
// src/app/api/pipelines/[id]/automations/route.ts
//
// GET: Listar regras de automação da pipeline
// POST: Criar nova regra de automação
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// =============================================
// GET - Listar regras de automação
// =============================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const includeTransitions = searchParams.get('includeTransitions') === 'true';
  
  try {
    // Verificar se pipeline existe - RLS filtra automaticamente
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, name, organization_id')
      .eq('id', pipelineId)
      .single();
    
    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Buscar regras de automação - RLS filtra automaticamente
    const { data: rules, error: rulesError } = await supabase
      .from('pipeline_automation_rules')
      .select(`
        *,
        initial_stage:pipeline_stages!initial_stage_id(id, name, color),
        assigned_user:profiles!assign_to_user_id(id, full_name, avatar_url)
      `)
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (rulesError) {
      console.error('[Automations API] Error fetching rules:', rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }
    
    // Buscar transições se solicitado - RLS filtra automaticamente
    let transitions = null;
    if (includeTransitions) {
      const { data: transitionsData } = await supabase
        .from('pipeline_stage_transitions')
        .select(`
          *,
          from_stage:pipeline_stages!from_stage_id(id, name, color),
          to_stage:pipeline_stages!to_stage_id(id, name, color)
        `)
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true });
      
      transitions = transitionsData || [];
    }
    
    // Agrupar regras por source_type
    const rulesBySource = (rules || []).reduce((acc: Record<string, any[]>, rule) => {
      if (!acc[rule.source_type]) {
        acc[rule.source_type] = [];
      }
      acc[rule.source_type].push(rule);
      return acc;
    }, {});
    
    return NextResponse.json({
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
      },
      rules: rules || [],
      rulesBySource,
      transitions,
      totalRules: rules?.length || 0,
      activeRules: rules?.filter(r => r.is_enabled).length || 0,
    });
    
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Criar nova regra de automação
// =============================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  const pipelineId = params.id;
  
  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 });
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
    
    if (!name || !sourceType || !triggerEvent) {
      return NextResponse.json({ 
        error: 'name, sourceType and triggerEvent are required' 
      }, { status: 400 });
    }
    
    if (!initialStageId) {
      return NextResponse.json({ 
        error: 'initialStageId é obrigatório. Selecione um estágio inicial.' 
      }, { status: 400 });
    }
    
    // Verificar se pipeline existe - RLS filtra automaticamente
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, organization_id')
      .eq('id', pipelineId)
      .single();
    
    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    
    // Verificar se estágio inicial pertence à pipeline
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
    
    // Buscar próxima posição se não fornecida
    let rulePosition = position;
    if (rulePosition === undefined) {
      const { data: lastRule } = await supabase
        .from('pipeline_automation_rules')
        .select('position')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: false })
        .limit(1)
        .single();
      
      rulePosition = (lastRule?.position || 0) + 1;
    }
    
    // Criar regra - usa organization_id do usuário autenticado
    const { data: rule, error: createError } = await supabase
      .from('pipeline_automation_rules')
      .insert({
        organization_id: user.organization_id,
        pipeline_id: pipelineId,
        name,
        description: description || null,
        source_type: sourceType,
        source_id: sourceId || null,
        trigger_event: triggerEvent,
        filters: filters || {},
        initial_stage_id: initialStageId || null,
        assign_to_user_id: assignToUserId || null,
        deal_tags: dealTags || [],
        deal_title_template: dealTitleTemplate || null,
        prevent_duplicates: preventDuplicates ?? true,
        duplicate_check_period_hours: duplicateCheckPeriodHours ?? 24,
        update_existing_deal: updateExistingDeal ?? false,
        is_enabled: isEnabled ?? true,
        position: rulePosition,
      })
      .select(`
        *,
        initial_stage:pipeline_stages!initial_stage_id(id, name, color)
      `)
      .single();
    
    if (createError) {
      console.error('[Automations API] Error creating rule:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      rule,
      message: 'Automation rule created successfully',
    });
    
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
