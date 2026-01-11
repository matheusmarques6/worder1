// =============================================
// API: Shopify Transition Rules
// /api/shopify/transition-rules/route.ts
//
// GET    - Listar regras de transição
// POST   - Criar nova regra
// PUT    - Atualizar regra existente
// DELETE - Deletar regra
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// TYPES
// =============================================

interface TransitionRule {
  id?: string;
  store_id: string;
  organization_id: string;
  rule_name: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  
  // Trigger
  trigger_event: string;
  
  // Conditions
  from_pipeline_id?: string | null;
  from_stage_id?: string | null;
  min_order_value?: number | null;
  max_order_value?: number | null;
  customer_tags_include?: string[];
  customer_tags_exclude?: string[];
  product_ids_include?: string[];
  
  // Actions
  action_type: string;
  to_pipeline_id?: string | null;
  to_stage_id?: string | null;
  mark_as_won: boolean;
  mark_as_lost: boolean;
  add_tags: string[];
  remove_tags: string[];
  update_deal_value: boolean;
}

// Eventos disponíveis
const AVAILABLE_EVENTS = [
  { value: 'customers/create', label: 'Cliente Criado', icon: '👤' },
  { value: 'customers/update', label: 'Cliente Atualizado', icon: '✏️' },
  { value: 'orders/create', label: 'Pedido Criado', icon: '🛒' },
  { value: 'orders/paid', label: 'Pedido Pago', icon: '💳' },
  { value: 'orders/fulfilled', label: 'Pedido Enviado', icon: '📦' },
  { value: 'orders/cancelled', label: 'Pedido Cancelado', icon: '❌' },
  { value: 'orders/partially_fulfilled', label: 'Pedido Parcialmente Enviado', icon: '📬' },
  { value: 'checkouts/create', label: 'Checkout Iniciado', icon: '🛍️' },
  { value: 'checkouts/update', label: 'Checkout Atualizado', icon: '🔄' },
];

// =============================================
// GET - Listar regras
// =============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const triggerEvent = searchParams.get('triggerEvent');
    const activeOnly = searchParams.get('activeOnly') === 'true';
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    let query = supabase
      .from('shopify_transition_rules')
      .select(`
        *,
        from_pipeline:pipelines!shopify_transition_rules_from_pipeline_id_fkey(id, name),
        from_stage:pipeline_stages!shopify_transition_rules_from_stage_id_fkey(id, name, color),
        to_pipeline:pipelines!shopify_transition_rules_to_pipeline_id_fkey(id, name),
        to_stage:pipeline_stages!shopify_transition_rules_to_stage_id_fkey(id, name, color)
      `)
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true });
    
    if (triggerEvent) {
      query = query.eq('trigger_event', triggerEvent);
    }
    
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    
    const { data: rules, error } = await query;
    
    if (error) {
      console.error('Error fetching transition rules:', error);
      return NextResponse.json(
        { error: 'Failed to fetch rules' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      rules: rules || [],
      availableEvents: AVAILABLE_EVENTS,
    });
    
  } catch (error: any) {
    console.error('Error in GET /api/shopify/transition-rules:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// POST - Criar regra
// =============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, organizationId, ...ruleData } = body;
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }
    
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId is required' },
        { status: 400 }
      );
    }
    
    if (!ruleData.ruleName) {
      return NextResponse.json(
        { error: 'ruleName is required' },
        { status: 400 }
      );
    }
    
    if (!ruleData.triggerEvent) {
      return NextResponse.json(
        { error: 'triggerEvent is required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    // Buscar próximo sort_order
    const { data: existingRules } = await supabase
      .from('shopify_transition_rules')
      .select('sort_order')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: false })
      .limit(1);
    
    const nextSortOrder = existingRules?.[0]?.sort_order 
      ? existingRules[0].sort_order + 1 
      : 0;
    
    // Preparar dados
    const rule = {
      store_id: storeId,
      organization_id: organizationId,
      rule_name: ruleData.ruleName,
      description: ruleData.description || null,
      is_active: ruleData.isActive ?? true,
      sort_order: ruleData.sortOrder ?? nextSortOrder,
      
      trigger_event: ruleData.triggerEvent,
      
      from_pipeline_id: ruleData.fromPipelineId || null,
      from_stage_id: ruleData.fromStageId || null,
      min_order_value: ruleData.minOrderValue || null,
      max_order_value: ruleData.maxOrderValue || null,
      customer_tags_include: ruleData.customerTagsInclude || [],
      customer_tags_exclude: ruleData.customerTagsExclude || [],
      product_ids_include: ruleData.productIdsInclude || [],
      
      action_type: ruleData.actionType || 'move_deal',
      to_pipeline_id: ruleData.toPipelineId || null,
      to_stage_id: ruleData.toStageId || null,
      mark_as_won: ruleData.markAsWon ?? false,
      mark_as_lost: ruleData.markAsLost ?? false,
      add_tags: ruleData.addTags || [],
      remove_tags: ruleData.removeTags || [],
      update_deal_value: ruleData.updateDealValue ?? false,
    };
    
    const { data: createdRule, error } = await supabase
      .from('shopify_transition_rules')
      .insert(rule)
      .select(`
        *,
        from_pipeline:pipelines!shopify_transition_rules_from_pipeline_id_fkey(id, name),
        from_stage:pipeline_stages!shopify_transition_rules_from_stage_id_fkey(id, name, color),
        to_pipeline:pipelines!shopify_transition_rules_to_pipeline_id_fkey(id, name),
        to_stage:pipeline_stages!shopify_transition_rules_to_stage_id_fkey(id, name, color)
      `)
      .single();
    
    if (error) {
      console.error('Error creating transition rule:', error);
      return NextResponse.json(
        { error: 'Failed to create rule', details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      rule: createdRule,
      message: 'Regra criada com sucesso',
    });
    
  } catch (error: any) {
    console.error('Error in POST /api/shopify/transition-rules:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// PUT - Atualizar regra
// =============================================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { ruleId, ...ruleData } = body;
    
    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    // Preparar dados para update
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    
    // Campos que podem ser atualizados
    if (ruleData.ruleName !== undefined) updateData.rule_name = ruleData.ruleName;
    if (ruleData.description !== undefined) updateData.description = ruleData.description;
    if (ruleData.isActive !== undefined) updateData.is_active = ruleData.isActive;
    if (ruleData.sortOrder !== undefined) updateData.sort_order = ruleData.sortOrder;
    if (ruleData.triggerEvent !== undefined) updateData.trigger_event = ruleData.triggerEvent;
    
    // Conditions
    if (ruleData.fromPipelineId !== undefined) updateData.from_pipeline_id = ruleData.fromPipelineId || null;
    if (ruleData.fromStageId !== undefined) updateData.from_stage_id = ruleData.fromStageId || null;
    if (ruleData.minOrderValue !== undefined) updateData.min_order_value = ruleData.minOrderValue;
    if (ruleData.maxOrderValue !== undefined) updateData.max_order_value = ruleData.maxOrderValue;
    if (ruleData.customerTagsInclude !== undefined) updateData.customer_tags_include = ruleData.customerTagsInclude;
    if (ruleData.customerTagsExclude !== undefined) updateData.customer_tags_exclude = ruleData.customerTagsExclude;
    if (ruleData.productIdsInclude !== undefined) updateData.product_ids_include = ruleData.productIdsInclude;
    
    // Actions
    if (ruleData.actionType !== undefined) updateData.action_type = ruleData.actionType;
    if (ruleData.toPipelineId !== undefined) updateData.to_pipeline_id = ruleData.toPipelineId || null;
    if (ruleData.toStageId !== undefined) updateData.to_stage_id = ruleData.toStageId || null;
    if (ruleData.markAsWon !== undefined) updateData.mark_as_won = ruleData.markAsWon;
    if (ruleData.markAsLost !== undefined) updateData.mark_as_lost = ruleData.markAsLost;
    if (ruleData.addTags !== undefined) updateData.add_tags = ruleData.addTags;
    if (ruleData.removeTags !== undefined) updateData.remove_tags = ruleData.removeTags;
    if (ruleData.updateDealValue !== undefined) updateData.update_deal_value = ruleData.updateDealValue;
    
    const { data: updatedRule, error } = await supabase
      .from('shopify_transition_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select(`
        *,
        from_pipeline:pipelines!shopify_transition_rules_from_pipeline_id_fkey(id, name),
        from_stage:pipeline_stages!shopify_transition_rules_from_stage_id_fkey(id, name, color),
        to_pipeline:pipelines!shopify_transition_rules_to_pipeline_id_fkey(id, name),
        to_stage:pipeline_stages!shopify_transition_rules_to_stage_id_fkey(id, name, color)
      `)
      .single();
    
    if (error) {
      console.error('Error updating transition rule:', error);
      return NextResponse.json(
        { error: 'Failed to update rule', details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      rule: updatedRule,
      message: 'Regra atualizada com sucesso',
    });
    
  } catch (error: any) {
    console.error('Error in PUT /api/shopify/transition-rules:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE - Deletar regra
// =============================================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('ruleId');
    
    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      );
    }
    
    const supabase = getSupabaseAdmin();
    
    const { error } = await supabase
      .from('shopify_transition_rules')
      .delete()
      .eq('id', ruleId);
    
    if (error) {
      console.error('Error deleting transition rule:', error);
      return NextResponse.json(
        { error: 'Failed to delete rule', details: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Regra deletada com sucesso',
    });
    
  } catch (error: any) {
    console.error('Error in DELETE /api/shopify/transition-rules:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
