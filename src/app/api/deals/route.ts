import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { EventBus, EventType } from '@/lib/events';

// ✅ MIGRADO PARA RLS - Não usa mais getSupabaseClient()

// GET - List deals, pipelines, or single deal
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'deals';
  const dealId = searchParams.get('id');
  const pipelineId = searchParams.get('pipelineId');
  const stageId = searchParams.get('stageId');
  const contactId = searchParams.get('contactId');
  const storeId = searchParams.get('storeId'); // ✅ FILTRO POR LOJA

  try {
    if (type === 'pipelines') {
      const { data: pipelines, error: pipelineError } = await supabase
        .from('pipelines')
        .select('*')
        .order('position');

      if (pipelineError) throw pipelineError;

      const pipelineIds = pipelines?.map(p => p.id) || [];
      
      if (pipelineIds.length > 0) {
        const { data: stages, error: stagesError } = await supabase
          .from('pipeline_stages')
          .select('*')
          .in('pipeline_id', pipelineIds)
          .order('position');

        if (stagesError) throw stagesError;

        // ✅ FILTRAR DEALS POR STORE_ID SE FORNECIDO
        let dealCountsQuery = supabase
          .from('deals')
          .select('stage_id, status');
        if (storeId) dealCountsQuery = dealCountsQuery.eq('store_id', storeId);
        const { data: dealCounts } = await dealCountsQuery;

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

    if (dealId) {
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      let contact = null;
      if (deal?.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', deal.contact_id)
          .single();
        contact = contactData;
      }

      let stage = null;
      if (deal?.stage_id) {
        const { data: stageData } = await supabase
          .from('pipeline_stages')
          .select('*')
          .eq('id', deal.stage_id)
          .single();
        stage = stageData;
      }

      return NextResponse.json({ deal: { ...deal, contact, stage } });
    }

    let dealsQuery = supabase
      .from('deals')
      .select('*')
      .order('position');
    
    // ✅ FILTRAR POR STORE_ID SE FORNECIDO
    if (storeId) {
      dealsQuery = dealsQuery.eq('store_id', storeId);
    }
    
    if (contactId) {
      dealsQuery = dealsQuery.eq('contact_id', contactId);
    }

    const { data: deals, error: dealsError } = await dealsQuery;
    if (dealsError) throw dealsError;

    const contactIds = [...new Set(deals?.filter(d => d.contact_id).map(d => d.contact_id))];
    const stageIds = [...new Set(deals?.filter(d => d.stage_id).map(d => d.stage_id))];

    let contactsMap: Record<string, any> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, avatar_url, company')
        .in('id', contactIds);
      contacts?.forEach(c => { contactsMap[c.id] = c; });
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

    let filteredDeals = dealsWithRelations || [];
    if (pipelineId) filteredDeals = filteredDeals.filter(d => d.pipeline_id === pipelineId);
    if (stageId) filteredDeals = filteredDeals.filter(d => d.stage_id === stageId);

    return NextResponse.json({ deals: filteredDeals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create deal or pipeline
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const body = await request.json();
  const { action, ...data } = body;

  try {
    switch (action) {
      case 'create-pipeline':
        return await createPipeline(supabase, organizationId, data);
      case 'create-stage':
        return await createStage(supabase, data);
      case 'create-deal':
        return await createDeal(supabase, organizationId, data);
      case 'add-activity':
        return await addActivity(supabase, data);
      default:
        return await createDeal(supabase, organizationId, data);
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update deal or stage
export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const body = await request.json();
  const { type, id, organizationId: _, ...updates } = body;

  try {
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

    if (type === 'pipeline') {
      const { data, error } = await supabase
        .from('pipelines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ pipeline: data });
    }

    // UPDATE DEAL
    const { data: previousDeal } = await supabase
      .from('deals')
      .select('stage_id, value, status')
      .eq('id', id)
      .single();

    // Auto-set won_at/lost_at when status changes
    if (updates.status) {
      if (updates.status === 'won' && previousDeal?.status !== 'won') {
        updates.won_at = updates.won_at || new Date().toISOString();
        updates.lost_at = null;
        if (updates.probability === undefined) updates.probability = 100;
      } else if (updates.status === 'lost' && previousDeal?.status !== 'lost') {
        updates.lost_at = updates.lost_at || new Date().toISOString();
        updates.won_at = null;
        if (updates.probability === undefined) updates.probability = 0;
      } else if (updates.status === 'open') {
        updates.won_at = null;
        updates.lost_at = null;
      }
    }

    const { data, error } = await supabase
      .from('deals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, contact:contacts(*), stage:pipeline_stages(*)`)
      .single();

    if (error) throw error;

    // Emit events
    if (updates.stage_id && previousDeal?.stage_id !== updates.stage_id) {
      EventBus.emit(EventType.DEAL_STAGE_CHANGED, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: {
          deal_title: data.title,
          deal_value: data.value,
          from_stage_id: previousDeal?.stage_id,
          to_stage_id: updates.stage_id,
          to_stage_name: data.stage?.name,
        },
        source: 'crm',
      }).catch(console.error);
    }

    if (updates.status === 'won' && previousDeal?.status !== 'won') {
      EventBus.emit(EventType.DEAL_WON, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: { deal_title: data.title, deal_value: data.value },
        source: 'crm',
      }).catch(console.error);
    }

    if (updates.status === 'lost' && previousDeal?.status !== 'lost') {
      EventBus.emit(EventType.DEAL_LOST, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: { deal_title: data.title, deal_value: data.value },
        source: 'crm',
      }).catch(console.error);
    }

    return NextResponse.json({ deal: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete deal or pipeline
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'deal';
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }

  try {
    if (type === 'pipeline') {
      await supabase.from('pipeline_stages').delete().eq('pipeline_id', id);
      const { error } = await supabase.from('pipelines').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (type === 'stage') {
      const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper functions with supabase client passed in
async function createPipeline(supabase: any, organizationId: string, data: any) {
  const { name, description, color, stages } = data;

  const { data: existingPipelines } = await supabase
    .from('pipelines')
    .select('position')
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingPipelines?.[0]?.position || 0) + 1;

  const { data: pipeline, error } = await supabase
    .from('pipelines')
    .insert({
      organization_id: organizationId,
      name,
      description,
      color: color || '#f97316',
      position,
    })
    .select()
    .single();

  if (error) throw error;

  if (stages && stages.length > 0) {
    const stageInserts = stages.map((stage: any, index: number) => ({
      pipeline_id: pipeline.id,
      name: stage.name,
      color: stage.color,
      position: index,
      probability: stage.probability ?? 50,
      is_won: stage.is_won ?? false,
      is_lost: stage.is_lost ?? false,
    }));
    await supabase.from('pipeline_stages').insert(stageInserts);
  } else {
    const defaultStages = [
      { name: 'Lead', color: '#6366f1', probability: 10, is_won: false, is_lost: false },
      { name: 'Qualificado', color: '#8b5cf6', probability: 25, is_won: false, is_lost: false },
      { name: 'Proposta', color: '#a855f7', probability: 50, is_won: false, is_lost: false },
      { name: 'Negociação', color: '#f59e0b', probability: 75, is_won: false, is_lost: false },
      { name: 'Ganho', color: '#22c55e', probability: 100, is_won: true, is_lost: false },
      { name: 'Perdido', color: '#ef4444', probability: 0, is_won: false, is_lost: true },
    ];
    const stageInserts = defaultStages.map((stage, index) => ({
      pipeline_id: pipeline.id,
      ...stage,
      position: index,
    }));
    await supabase.from('pipeline_stages').insert(stageInserts);
  }

  const { data: pipelineStages } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipeline.id)
    .order('position');

  return NextResponse.json({ pipeline: { ...pipeline, stages: pipelineStages || [] } }, { status: 201 });
}

async function createStage(supabase: any, data: any) {
  const { pipelineId, name, color, probability, is_won, is_lost } = data;

  const { data: existingStages } = await supabase
    .from('pipeline_stages')
    .select('position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingStages?.[0]?.position || 0) + 1;

  const { data: stage, error } = await supabase
    .from('pipeline_stages')
    .insert({
      pipeline_id: pipelineId,
      name,
      color,
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

async function createDeal(supabase: any, organizationId: string, data: any) {
  const pipelineId = data.pipelineId || data.pipeline_id;
  const stageId = data.stageId || data.stage_id;
  const contactId = data.contactId || data.contact_id;
  const storeId = data.storeId || data.store_id; // ✅ ADICIONAR STORE_ID
  const expDate = data.expectedCloseDate || data.expected_close_date;
  const assignTo = data.assignedTo || data.assigned_to;

  if (!pipelineId || !stageId) {
    throw new Error('pipelineId and stageId are required');
  }

  let dealProbability = data.probability;
  if (dealProbability === undefined) {
    const { data: stageInfo } = await supabase
      .from('pipeline_stages')
      .select('probability')
      .eq('id', stageId)
      .single();
    dealProbability = stageInfo?.probability ?? 50;
  }

  const { data: existingDeals } = await supabase
    .from('deals')
    .select('position')
    .eq('stage_id', stageId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingDeals?.[0]?.position || 0) + 1;

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: organizationId,
      store_id: storeId || null, // ✅ SALVAR STORE_ID
      pipeline_id: pipelineId,
      stage_id: stageId,
      contact_id: contactId || null,
      title: data.title,
      value: data.value || 0,
      currency: data.currency || 'BRL',
      probability: dealProbability,
      expected_close_date: expDate,
      description: data.description,
      assigned_to: assignTo,
      position,
      status: 'open',
      commit_level: data.commit_level || 'pipeline',
      tags: [],
      custom_fields: {},
    })
    .select(`*, contact:contacts(*), stage:pipeline_stages(*)`)
    .single();

  if (error) throw error;

  EventBus.emit(EventType.DEAL_CREATED, {
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
      assigned_to: assignTo,
    },
    source: 'crm',
  }).catch(console.error);

  return NextResponse.json({ deal }, { status: 201 });
}

async function addActivity(supabase: any, data: any) {
  const { dealId, type, description, userId } = data;

  const { data: activity, error } = await supabase
    .from('deal_activities')
    .insert({
      deal_id: dealId,
      type,
      description,
      user_id: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json({ activity }, { status: 201 });
}
