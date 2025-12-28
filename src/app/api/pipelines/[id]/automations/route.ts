// =============================================
// API: Pipeline Automations
// /api/pipelines/[id]/automations
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// =============================================
// GET - Buscar configurações de automação
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const pipelineId = params.id;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar regras do pipeline
    const { data: rules, error: rulesError } = await supabase
      .from('crm_automation_rules')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (rulesError) {
      console.error('Erro ao buscar regras:', rulesError);
      throw rulesError;
    }

    // Buscar integrações disponíveis
    const sources = [];

    // Verificar Shopify
    const { data: shopify } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    sources.push({
      type: 'shopify',
      name: 'Shopify',
      connected: !!shopify,
      integration_id: shopify?.id || null,
      integration_name: shopify?.shop_name || shopify?.shop_domain || null,
    });

    // Verificar WhatsApp
    const { data: whatsapp } = await supabase
      .from('whatsapp_configs')
      .select('id, phone_number, business_name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    sources.push({
      type: 'whatsapp',
      name: 'WhatsApp',
      connected: !!whatsapp,
      integration_id: whatsapp?.id || null,
      integration_name: whatsapp?.business_name || whatsapp?.phone_number || null,
    });

    // Hotmart (futuro)
    sources.push({
      type: 'hotmart',
      name: 'Hotmart',
      connected: false,
      integration_id: null,
      integration_name: null,
    });

    // Webhook sempre disponível
    sources.push({
      type: 'webhook',
      name: 'Webhook',
      connected: true,
      integration_id: null,
      integration_name: 'Integração manual',
    });

    // Formulários sempre disponível
    sources.push({
      type: 'form',
      name: 'Formulários',
      connected: true,
      integration_id: null,
      integration_name: 'Landing pages',
    });

    return NextResponse.json({
      success: true,
      data: {
        pipeline_id: pipelineId,
        rules: rules || [],
        sources,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar automações:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar configurações' },
      { status: 500 }
    );
  }
}

// =============================================
// POST - Criar regra de automação
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const pipelineId = params.id;
    const body = await request.json();

    const {
      organizationId,
      sourceType,
      triggerEvent,
      actionType,
      targetStageId,
      autoTags,
      isActive,
    } = body;

    // Validações
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório' },
        { status: 400 }
      );
    }

    if (!sourceType) {
      return NextResponse.json(
        { error: 'sourceType é obrigatório' },
        { status: 400 }
      );
    }

    if (!triggerEvent) {
      return NextResponse.json(
        { error: 'triggerEvent é obrigatório' },
        { status: 400 }
      );
    }

    if (!targetStageId) {
      return NextResponse.json(
        { error: 'targetStageId é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se já existe regra igual
    const { data: existing } = await supabase
      .from('crm_automation_rules')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .eq('organization_id', organizationId)
      .eq('source_type', sourceType)
      .eq('trigger_event', triggerEvent)
      .maybeSingle();

    if (existing) {
      // Atualizar regra existente
      const { data: rule, error } = await supabase
        .from('crm_automation_rules')
        .update({
          action_type: actionType || 'create_deal',
          target_stage_id: targetStageId,
          auto_tags: autoTags || [],
          is_active: isActive ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: rule,
        updated: true,
      });
    }

    // Criar nova regra
    const { data: rule, error } = await supabase
      .from('crm_automation_rules')
      .insert({
        pipeline_id: pipelineId,
        organization_id: organizationId,
        source_type: sourceType,
        trigger_event: triggerEvent,
        action_type: actionType || 'create_deal',
        target_stage_id: targetStageId,
        auto_tags: autoTags || [],
        is_active: isActive ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar regra:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: rule,
      created: true,
    });
  } catch (error) {
    console.error('Erro ao criar regra:', error);
    return NextResponse.json(
      { error: 'Erro ao criar regra de automação' },
      { status: 500 }
    );
  }
}

// =============================================
// PUT - Atualizar regra
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const { ruleId, ...updates } = body;

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId é obrigatório' },
        { status: 400 }
      );
    }

    // Converter camelCase para snake_case
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.sourceType !== undefined) dbUpdates.source_type = updates.sourceType;
    if (updates.triggerEvent !== undefined) dbUpdates.trigger_event = updates.triggerEvent;
    if (updates.actionType !== undefined) dbUpdates.action_type = updates.actionType;
    if (updates.targetStageId !== undefined) dbUpdates.target_stage_id = updates.targetStageId;
    if (updates.autoTags !== undefined) dbUpdates.auto_tags = updates.autoTags;
    if (typeof updates.isActive === 'boolean') dbUpdates.is_active = updates.isActive;

    const { data: rule, error } = await supabase
      .from('crm_automation_rules')
      .update(dbUpdates)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar regra:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('Erro ao atualizar regra:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar regra' },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE - Remover regra
// =============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('ruleId');

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId é obrigatório' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('crm_automation_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      console.error('Erro ao deletar regra:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    console.error('Erro ao deletar regra:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar regra' },
      { status: 500 }
    );
  }
}
