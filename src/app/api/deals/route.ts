import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { EventBus, EventType } from '@/lib/events';
export const dynamic = 'force-dynamic';

// =============================================
// DEALS API - CORRIGIDA
// =============================================
// Mudanças:
// 1. store_id é OPCIONAL (não bloqueia se não fornecido)
// 2. Resolve contexto do token corretamente
// 3. Melhor tratamento de erros
// 4. Pipelines também ficam opcionais
// =============================================

// GET - List deals or pipelines
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    
    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    if (!organizationId) {
      return NextResponse.json({ 
        error: 'Organization not found for user' 
      }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'deals';
    const dealId = searchParams.get('id');
    const pipelineId = searchParams.get('pipelineId') || searchParams.get('pipeline_id');
    const stageId = searchParams.get('stageId') || searchParams.get('stage_id');
    const contactId = searchParams.get('contactId') || searchParams.get('contact_id');
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');
    const status = searchParams.get('status');

    // =====================================================
    // PIPELINES
    // =====================================================
    if (type === 'pipelines') {
      let query = supabase
        .from('pipelines')
        .select('*')
        .eq('organization_id', organizationId)
        .order('position');

      // store_id OPCIONAL - se fornecido, filtra; se não, busca todos
      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data: pipelines, error: pipelineError } = await query;

      if (pipelineError) {
        console.error('[Deals] Error fetching pipelines:', pipelineError);
        return NextResponse.json({ 
          error: pipelineError.message,
          pipelines: [] 
        }, { status: 500 });
      }

      const pipelineIds = pipelines?.map(p => p.id) || [];
      
      if (pipelineIds.length > 0) {
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('*')
          .in('pipeline_id', pipelineIds)
          .order('position');

        // Contar deals por stage
        let dealsQuery = supabase
          .from('deals')
          .select('stage_id, status')
          .eq('organization_id', organizationId);
        
        if (storeId) {
          dealsQuery = dealsQuery.eq('store_id', storeId);
        }
        
        const { data: dealCounts } = await dealsQuery;

        const stageDealsMap: Record<string, number> = {};
        dealCounts?.forEach(deal => {
          if (deal.stage_id && deal.status === 'open') {
            stageDealsMap[deal.stage_id] = (stageDealsMap[deal.stage_id] || 0) + 1;
          }
        });

        const pipelinesWithStages = pipelines?.map(pipeline => ({
          ...pipeline,
          stages: (stages || [])
            .filter(s => s.pipeline_id === pipeline.id)
            .map(s => ({
              ...s,
              deal_count: stageDealsMap[s.id] || 0
            }))
            .sort((a, b) => a.position - b.position)
        }));

        return NextResponse.json({ pipelines: pipelinesWithStages });
      }

      return NextResponse.json({ pipelines: pipelines || [] });
    }

    // =====================================================
    // SINGLE DEAL
    // =====================================================
    if (dealId) {
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .eq('organization_id', organizationId) // Segurança
        .single();

      if (dealError) {
        return NextResponse.json({ error: dealError.message }, { status: 500 });
      }

      if (!deal) {
        return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
      }

      // Buscar relacionamentos
      let contact = null;
      if (deal.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', deal.contact_id)
          .single();
        contact = contactData;
      }

      let stage = null;
      if (deal.stage_id) {
        const { data: stageData } = await supabase
          .from('pipeline_stages')
          .select('*')
          .eq('id', deal.stage_id)
          .single();
        stage = stageData;
      }

      return NextResponse.json({ deal: { ...deal, contact, stage } });
    }

    // =====================================================
    // LIST DEALS
    // =====================================================
    let dealsQuery = supabase
      .from('deals')
      .select('*')
      .eq('organization_id', organizationId)
      .order('position');
    
    // Filtros OPCIONAIS
    if (storeId) {
      dealsQuery = dealsQuery.eq('store_id', storeId);
    }
    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId);
    }
    if (stageId) {
      dealsQuery = dealsQuery.eq('stage_id', stageId);
    }
    if (contactId) {
      dealsQuery = dealsQuery.eq('contact_id', contactId);
    }
    if (status) {
      dealsQuery = dealsQuery.eq('status', status);
    }

    const { data: deals, error: dealsError } = await dealsQuery;
    
    if (dealsError) {
      console.error('[Deals] Error fetching:', dealsError);
      return NextResponse.json({ error: dealsError.message }, { status: 500 });
    }

    // Buscar relacionamentos em batch
    const contactIds = [...new Set(deals?.filter(d => d.contact_id).map(d => d.contact_id))];
    const stageIds = [...new Set(deals?.filter(d => d.stage_id).map(d => d.stage_id))];

    let contactsMap: Record<string, any> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, full_name, avatar_url, company, phone, whatsapp, position, source, lifetime_value, total_spent, total_orders, average_order_value, last_order_at, score, status, type, city, country, tags, is_subscribed_email, is_subscribed_sms, is_subscribed_whatsapp, created_at')
        .in('id', contactIds);
      contacts?.forEach(c => {
        contactsMap[c.id] = {
          ...c,
          name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email
        };
      });
    }

    let stagesMap: Record<string, any> = {};
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, name, color, probability, is_won, is_lost')
        .in('id', stageIds);
      stages?.forEach(s => { stagesMap[s.id] = s; });
    }

    const dealsWithRelations = deals?.map(deal => ({
      ...deal,
      contact: deal.contact_id ? contactsMap[deal.contact_id] : null,
      stage: deal.stage_id ? stagesMap[deal.stage_id] : null
    }));

    return NextResponse.json({ 
      deals: dealsWithRelations || [],
      total: dealsWithRelations?.length || 0,
      filter: {
        store_id: storeId || 'all',
        pipeline_id: pipelineId || 'all',
        stage_id: stageId || 'all',
        status: status || 'all'
      }
    });
    
  } catch (error: any) {
    console.error('[Deals] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create deal
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    
    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const body = await request.json();
    const { action, ...data } = body;

    // Actions especiais
    if (action === 'create-pipeline') {
      return await createPipeline(supabase, organizationId, data);
    }
    if (action === 'create-stage') {
      return await createStage(supabase, data);
    }

    // Criar deal
    const pipelineId = data.pipelineId || data.pipeline_id;
    const stageId = data.stageId || data.stage_id;
    const contactId = data.contactId || data.contact_id;
    const storeId = data.storeId || data.store_id;

    if (!pipelineId || !stageId) {
      return NextResponse.json({ 
        error: 'pipeline_id and stage_id are required' 
      }, { status: 400 });
    }

    if (!data.title) {
      return NextResponse.json({ 
        error: 'title is required' 
      }, { status: 400 });
    }

    // Buscar probabilidade do stage
    let dealProbability = data.probability;
    if (dealProbability === undefined) {
      const { data: stageInfo } = await supabase
        .from('pipeline_stages')
        .select('probability')
        .eq('id', stageId)
        .single();
      dealProbability = stageInfo?.probability ?? 50;
    }

    // Buscar última posição
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('position')
      .eq('stage_id', stageId)
      .order('position', { ascending: false })
      .limit(1);

    const position = (existingDeals?.[0]?.position || 0) + 1;

    // Criar deal
    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        organization_id: organizationId,
        store_id: storeId || null,
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contactId || null,
        title: data.title,
        value: data.value || 0,
        currency: data.currency || 'BRL',
        probability: dealProbability,
        expected_close_date: data.expected_close_date || data.expectedCloseDate,
        notes: data.notes || data.description,
        assigned_to: data.assigned_to || data.assignedTo,
        position,
        status: 'open',
        commit_level: data.commit_level || 'pipeline',
        tags: data.tags || [],
        custom_fields: data.custom_fields || {},
        contact_phone: data.contact_phone,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
      })
      .select(`
        *,
        contact:contacts(*),
        stage:pipeline_stages(*)
      `)
      .single();

    if (error) {
      console.error('[Deals] Error creating:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emitir evento
    try {
      await EventBus.emit(EventType.DEAL_CREATED, {
        organization_id: organizationId,
        deal_id: deal.id,
        contact_id: contactId,
        email: deal.contact?.email,
        data: {
          deal_title: data.title,
          deal_value: data.value || 0,
          pipeline_id: pipelineId,
          stage_id: stageId,
          stage_name: deal.stage?.name,
        },
        source: 'crm',
      });
    } catch (e) {
      console.warn('[Deals] Event emission failed:', e);
    }

    return NextResponse.json({ deal }, { status: 201 });
    
  } catch (error: any) {
    console.error('[Deals] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update deal
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    
    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const body = await request.json();
    const { type, id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Atualizar stage
    if (type === 'stage') {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ stage: data });
    }

    // Atualizar pipeline
    if (type === 'pipeline') {
      const { data, error } = await supabase
        .from('pipelines')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ pipeline: data });
    }

    // Atualizar deal
    const { data: previousDeal } = await supabase
      .from('deals')
      .select('stage_id, value, status, contact_id')
      .eq('id', id)
      .single();

    // Auto-set timestamps para status changes
    if (updates.status) {
      if (updates.status === 'won' && previousDeal?.status !== 'won') {
        updates.won_at = new Date().toISOString();
        updates.lost_at = null;
        updates.probability = 100;
      } else if (updates.status === 'lost' && previousDeal?.status !== 'lost') {
        updates.lost_at = new Date().toISOString();
        updates.won_at = null;
        updates.probability = 0;
      } else if (updates.status === 'open') {
        updates.won_at = null;
        updates.lost_at = null;
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: deal, error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select(`
        *,
        contact:contacts(*),
        stage:pipeline_stages(*)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Emitir eventos de status change
    try {
      if (updates.status === 'won' && previousDeal?.status !== 'won') {
        await EventBus.emit(EventType.DEAL_WON, {
          organization_id: organizationId,
          deal_id: id,
          contact_id: deal.contact_id,
          data: { deal_title: deal.title, deal_value: deal.value },
          source: 'crm',
        });
      }

      if (updates.status === 'lost' && previousDeal?.status !== 'lost') {
        await EventBus.emit(EventType.DEAL_LOST, {
          organization_id: organizationId,
          deal_id: id,
          contact_id: deal.contact_id,
          data: { deal_title: deal.title, deal_value: deal.value },
          source: 'crm',
        });
      }
    } catch (e) {
      console.warn('[Deals] Event emission failed:', e);
    }

    return NextResponse.json({ deal });
    
  } catch (error: any) {
    console.error('[Deals] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete deal
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    
    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'deal';
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (type === 'pipeline') {
      // Verificar deals
      const { count } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('pipeline_id', id);
      
      if (count && count > 0) {
        return NextResponse.json({ 
          error: `Cannot delete pipeline with ${count} deals` 
        }, { status: 400 });
      }
      
      await supabase.from('pipeline_stages').delete().eq('pipeline_id', id);
      const { error } = await supabase
        .from('pipelines')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (type === 'stage') {
      // Verificar deals
      const { count } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', id);
      
      if (count && count > 0) {
        return NextResponse.json({ 
          error: `Cannot delete stage with ${count} deals` 
        }, { status: 400 });
      }
      
      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // Delete deal
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (error) throw error;
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('[Deals] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HELPERS
// =============================================

async function createPipeline(supabase: any, organizationId: string, data: any) {
  const { name, description, color, stages, store_id } = data;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const { data: existingPipelines } = await supabase
    .from('pipelines')
    .select('position')
    .eq('organization_id', organizationId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingPipelines?.[0]?.position || 0) + 1;

  const { data: pipeline, error } = await supabase
    .from('pipelines')
    .insert({
      organization_id: organizationId,
      store_id: store_id || null,
      name,
      description,
      color: color || '#6366f1',
      position,
    })
    .select()
    .single();

  if (error) throw error;

  // Create default stages
  const stagesToCreate = stages && stages.length > 0 ? stages : [
    { name: 'Lead', color: '#6366f1', probability: 10 },
    { name: 'Qualificado', color: '#8b5cf6', probability: 25 },
    { name: 'Proposta', color: '#a855f7', probability: 50 },
    { name: 'Negociação', color: '#f59e0b', probability: 75 },
    { name: 'Ganho', color: '#22c55e', probability: 100, is_won: true },
    { name: 'Perdido', color: '#ef4444', probability: 0, is_lost: true },
  ];

  const stageInserts = stagesToCreate.map((stage: any, index: number) => ({
    pipeline_id: pipeline.id,
    name: stage.name,
    color: stage.color || '#6366f1',
    position: index,
    probability: stage.probability ?? 50,
    is_won: stage.is_won ?? false,
    is_lost: stage.is_lost ?? false,
  }));

  await supabase.from('pipeline_stages').insert(stageInserts);

  const { data: pipelineWithStages } = await supabase
    .from('pipelines')
    .select(`*, stages:pipeline_stages(*)`)
    .eq('id', pipeline.id)
    .single();

  return NextResponse.json({ pipeline: pipelineWithStages }, { status: 201 });
}

async function createStage(supabase: any, data: any) {
  const { pipelineId, pipeline_id, name, color, probability, is_won, is_lost } = data;
  const pid = pipelineId || pipeline_id;

  if (!pid || !name) {
    return NextResponse.json({ 
      error: 'pipeline_id and name are required' 
    }, { status: 400 });
  }

  const { data: existingStages } = await supabase
    .from('pipeline_stages')
    .select('position')
    .eq('pipeline_id', pid)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingStages?.[0]?.position || 0) + 1;

  const { data: stage, error } = await supabase
    .from('pipeline_stages')
    .insert({
      pipeline_id: pid,
      name,
      color: color || '#6366f1',
      position,
      probability: probability ?? 50,
      is_won: is_won ?? false,
      is_lost: is_lost ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json({ stage }, { status: 201 });
}
