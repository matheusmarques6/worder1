import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { EventBus, EventType } from '@/lib/events';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility with existing code
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// GET - List deals, pipelines, or single deal
export async function GET(request: NextRequest) {
  try {
    getDb(); // Verify connection early
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const type = searchParams.get('type') || 'deals'; // deals | pipelines
  const dealId = searchParams.get('id');
  const pipelineId = searchParams.get('pipelineId');
  const stageId = searchParams.get('stageId');
  const contactId = searchParams.get('contactId');

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

  try {
    if (type === 'pipelines') {
      // First, get all pipelines
      const { data: pipelines, error: pipelineError } = await supabase
        .from('pipelines')
        .select('*')
        .eq('organization_id', organizationId)
        .order('position');

      if (pipelineError) throw pipelineError;

      // Then, get all stages for these pipelines
      const pipelineIds = pipelines?.map(p => p.id) || [];
      
      if (pipelineIds.length > 0) {
        const { data: stages, error: stagesError } = await supabase
          .from('pipeline_stages')
          .select('*')
          .in('pipeline_id', pipelineIds)
          .order('position');

        if (stagesError) throw stagesError;

        // Get deal counts per stage (only open deals)
        const { data: dealCounts } = await supabase
          .from('deals')
          .select('stage_id, status')
          .eq('organization_id', organizationId);

        // Count only OPEN deals per stage
        const stageDealsMap: Record<string, number> = {};
        dealCounts?.forEach(deal => {
          if (deal.stage_id && deal.status === 'open') {
            stageDealsMap[deal.stage_id] = (stageDealsMap[deal.stage_id] || 0) + 1;
          }
        });

        // Combine pipelines with their stages
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
      // Get deal with contact
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .eq('organization_id', organizationId)
        .single();

      if (dealError) throw dealError;

      // Get contact separately if exists
      let contact = null;
      if (deal?.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', deal.contact_id)
          .single();
        contact = contactData;
      }

      // Get stage separately if exists
      let stage = null;
      if (deal?.stage_id) {
        const { data: stageData } = await supabase
          .from('pipeline_stages')
          .select('*')
          .eq('id', deal.stage_id)
          .single();
        stage = stageData;
      }

      return NextResponse.json({ 
        deal: { 
          ...deal, 
          contact, 
          stage 
        } 
      });
    }

    // List deals with contacts and stages
    let dealsQuery = supabase
      .from('deals')
      .select('*')
      .eq('organization_id', organizationId)
      .order('position');
    
    // Filter by contact_id if provided
    if (contactId) {
      dealsQuery = dealsQuery.eq('contact_id', contactId);
    }

    const { data: deals, error: dealsError } = await dealsQuery;

    if (dealsError) throw dealsError;

    // Get unique contact IDs and stage IDs
    const contactIds = [...new Set(deals?.filter(d => d.contact_id).map(d => d.contact_id))];
    const stageIds = [...new Set(deals?.filter(d => d.stage_id).map(d => d.stage_id))];

    // Fetch contacts in batch
    let contactsMap: Record<string, any> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, avatar_url, company')
        .in('id', contactIds);
      
      contacts?.forEach(c => {
        contactsMap[c.id] = c;
      });
    }

    // Fetch stages in batch
    let stagesMap: Record<string, any> = {};
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, name, color, probability, is_won, is_lost')
        .in('id', stageIds);
      
      stages?.forEach(s => {
        stagesMap[s.id] = s;
      });
    }

    // Combine deals with contacts and stages
    const dealsWithRelations = deals?.map(deal => ({
      ...deal,
      contact: deal.contact_id ? contactsMap[deal.contact_id] : null,
      stage: deal.stage_id ? stagesMap[deal.stage_id] : null
    }));

    // Filter by pipeline or stage if specified
    let filteredDeals = dealsWithRelations || [];

    if (pipelineId) {
      filteredDeals = filteredDeals.filter(d => d.pipeline_id === pipelineId);
    }

    if (stageId) {
      filteredDeals = filteredDeals.filter(d => d.stage_id === stageId);
    }

    return NextResponse.json({ deals: filteredDeals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create deal or pipeline
export async function POST(request: NextRequest) {
  const { action, ...data } = await request.json();

  try {
    switch (action) {
      case 'create-pipeline':
        return await createPipeline(data);
      case 'create-stage':
        return await createStage(data);
      case 'create-deal':
        return await createDeal(data);
      case 'add-activity':
        return await addActivity(data);
      default:
        return await createDeal(data); // Default to creating deal
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update deal or stage
export async function PUT(request: NextRequest) {
  const { type, id, organizationId, ...updates } = await request.json();

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
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ pipeline: data });
    }

    // ==========================================
    // UPDATE DEAL - Com auto won_at/lost_at
    // ==========================================
    
    // Get previous deal state
    const { data: previousDeal } = await supabase
      .from('deals')
      .select('stage_id, value, status')
      .eq('id', id)
      .single();

    // ==========================================
    // AUTO-SET won_at/lost_at WHEN STATUS CHANGES
    // ==========================================
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
        // Reopening deal
        updates.won_at = null;
        updates.lost_at = null;
      }
    }

    // ==========================================
    // AUTO-UPDATE STATUS WHEN STAGE is_won/is_lost
    // ==========================================
    if (updates.stage_id && updates.stage_id !== previousDeal?.stage_id) {
      // Get new stage info
      const { data: newStage } = await supabase
        .from('pipeline_stages')
        .select('is_won, is_lost, probability')
        .eq('id', updates.stage_id)
        .single();

      if (newStage) {
        // If moving to a "won" stage
        if (newStage.is_won && previousDeal?.status !== 'won') {
          updates.status = 'won';
          updates.won_at = new Date().toISOString();
          updates.lost_at = null;
          updates.probability = 100;
        }
        // If moving to a "lost" stage
        else if (newStage.is_lost && previousDeal?.status !== 'lost') {
          updates.status = 'lost';
          updates.lost_at = new Date().toISOString();
          updates.won_at = null;
          updates.probability = 0;
        }
        // If moving from won/lost to a regular stage, reopen
        else if (!newStage.is_won && !newStage.is_lost && (previousDeal?.status === 'won' || previousDeal?.status === 'lost')) {
          updates.status = 'open';
          updates.won_at = null;
          updates.lost_at = null;
          // Inherit stage probability
          if (newStage.probability !== undefined && updates.probability === undefined) {
            updates.probability = newStage.probability;
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('deals')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select(`
        *,
        contact:contacts(id, email, first_name, last_name, avatar_url),
        stage:pipeline_stages(id, name, color, probability, is_won, is_lost)
      `)
      .single();

    if (error) throw error;

    // Log activity if stage changed
    if (updates.stage_id && updates.stage_id !== previousDeal?.stage_id) {
      await supabase.from('deal_activities').insert({
        deal_id: id,
        type: 'stage_change',
        description: `Deal moved to ${data.stage?.name}`,
      });

      // 🔥 EMITIR EVENTO DE MUDANÇA DE ESTÁGIO
      EventBus.emit(EventType.DEAL_STAGE_CHANGED, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: {
          from_stage_id: previousDeal?.stage_id,
          to_stage_id: updates.stage_id,
          to_stage_name: data.stage?.name,
          deal_title: data.title,
          deal_value: data.value,
          pipeline_id: data.pipeline_id,
        },
        source: 'crm',
      }).catch(console.error);
    }

    // Log activity if status changed
    if (updates.status && updates.status !== previousDeal?.status) {
      const statusMessages: Record<string, string> = {
        'won': '🎉 Deal marked as Won',
        'lost': '❌ Deal marked as Lost',
        'open': '🔄 Deal reopened',
      };
      await supabase.from('deal_activities').insert({
        deal_id: id,
        type: 'status_change',
        description: statusMessages[updates.status] || `Status changed to ${updates.status}`,
      }).catch(console.error);
    }

    // 🔥 EMITIR EVENTO DE DEAL GANHO
    if (updates.status === 'won' && previousDeal?.status !== 'won') {
      EventBus.emit(EventType.DEAL_WON, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: {
          deal_title: data.title,
          deal_value: data.value,
          pipeline_id: data.pipeline_id,
          stage_id: data.stage_id,
          won_at: data.won_at,
        },
        source: 'crm',
      }).catch(console.error);
    }

    // 🔥 EMITIR EVENTO DE DEAL PERDIDO
    if (updates.status === 'lost' && previousDeal?.status !== 'lost') {
      EventBus.emit(EventType.DEAL_LOST, {
        organization_id: organizationId,
        deal_id: id,
        contact_id: data.contact_id,
        email: data.contact?.email,
        data: {
          deal_title: data.title,
          deal_value: data.value,
          pipeline_id: data.pipeline_id,
          stage_id: data.stage_id,
          lost_at: data.lost_at,
        },
        source: 'crm',
      }).catch(console.error);
    }

    return NextResponse.json({ deal: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete deal, pipeline, or stage
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || 'deal';
  const id = searchParams.get('id');
  const organizationId = searchParams.get('organizationId');

  if (!id || !organizationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    let table = 'deals';
    if (type === 'pipeline') table = 'pipelines';
    if (type === 'stage') table = 'pipeline_stages';

    const query = supabase.from(table).delete().eq('id', id);
    
    if (type !== 'stage') {
      query.eq('organization_id', organizationId);
    }

    const { error } = await query;

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==========================================
// CREATE PIPELINE - Com stages padrão completos
// ==========================================
async function createPipeline({
  organizationId,
  name,
  description,
  color,
  stages,
}: {
  organizationId: string;
  name: string;
  description?: string;
  color?: string;
  stages?: { name: string; color: string; probability?: number; is_won?: boolean; is_lost?: boolean }[];
}) {
  // Get max position
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
      name,
      description,
      color: color || '#f97316',
      position,
    })
    .select()
    .single();

  if (error) throw error;

  // Create custom stages if provided
  if (stages && stages.length > 0) {
    const stageInserts = stages.map((stage, index) => ({
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
    // ==========================================
    // DEFAULT STAGES - Com probability e flags
    // ==========================================
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
      name: stage.name,
      color: stage.color,
      position: index,
      probability: stage.probability,
      is_won: stage.is_won,
      is_lost: stage.is_lost,
    }));

    await supabase.from('pipeline_stages').insert(stageInserts);
  }

  // Fetch pipeline with stages separately
  const { data: createdPipeline } = await supabase
    .from('pipelines')
    .select('*')
    .eq('id', pipeline.id)
    .single();

  const { data: pipelineStages } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipeline.id)
    .order('position');

  const fullPipeline = {
    ...createdPipeline,
    stages: pipelineStages || []
  };

  return NextResponse.json({ pipeline: fullPipeline }, { status: 201 });
}

async function createStage({
  pipelineId,
  name,
  color,
  probability,
  is_won,
  is_lost,
}: {
  pipelineId: string;
  name: string;
  color: string;
  probability?: number;
  is_won?: boolean;
  is_lost?: boolean;
}) {
  // Get max position
  const { data: existingStages } = await supabase
    .from('pipeline_stages')
    .select('position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingStages?.[0]?.position || 0) + 1;

  const { data, error } = await supabase
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

  return NextResponse.json({ stage: data }, { status: 201 });
}

async function createDeal({
  organizationId,
  organization_id,
  pipelineId,
  pipeline_id,
  stageId,
  stage_id,
  contactId,
  contact_id,
  title,
  value,
  currency,
  expectedCloseDate,
  expected_close_date,
  description,
  assignedTo,
  assigned_to,
  probability,
  commit_level,
}: {
  organizationId?: string;
  organization_id?: string;
  pipelineId?: string;
  pipeline_id?: string;
  stageId?: string;
  stage_id?: string;
  contactId?: string;
  contact_id?: string;
  title: string;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  expected_close_date?: string;
  description?: string;
  assignedTo?: string;
  assigned_to?: string;
  probability?: number;
  commit_level?: string;
}) {
  // Support both camelCase and snake_case
  const orgId = organizationId || organization_id;
  const pplId = pipelineId || pipeline_id;
  const stgId = stageId || stage_id;
  const ctcId = contactId || contact_id;
  const expDate = expectedCloseDate || expected_close_date;
  const assignTo = assignedTo || assigned_to;

  if (!orgId || !pplId || !stgId) {
    throw new Error('organizationId, pipelineId and stageId are required');
  }

  // Get stage info to inherit probability
  let dealProbability = probability;
  if (dealProbability === undefined) {
    const { data: stageInfo } = await supabase
      .from('pipeline_stages')
      .select('probability')
      .eq('id', stgId)
      .single();
    dealProbability = stageInfo?.probability ?? 50;
  }

  // Get max position in stage
  const { data: existingDeals } = await supabase
    .from('deals')
    .select('position')
    .eq('stage_id', stgId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingDeals?.[0]?.position || 0) + 1;

  const { data, error } = await supabase
    .from('deals')
    .insert({
      organization_id: orgId,
      pipeline_id: pplId,
      stage_id: stgId,
      contact_id: ctcId || null,
      title,
      value: value || 0,
      currency: currency || 'BRL',
      probability: dealProbability,
      expected_close_date: expDate,
      description,
      assigned_to: assignTo,
      position,
      status: 'open',
      commit_level: commit_level || 'pipeline',
      tags: [],
      custom_fields: {},
    })
    .select(`
      *,
      contact:contacts(id, email, first_name, last_name, avatar_url, company),
      stage:pipeline_stages(id, name, color, probability)
    `)
    .single();

  if (error) throw error;

  // Log activity (ignore errors)
  try {
    await supabase.from('deal_activities').insert({
      deal_id: data.id,
      type: 'created',
      description: 'Deal created',
    });
  } catch (e) {
    console.warn('Failed to log activity:', e);
  }

  // 🔥 EMITIR EVENTO DE DEAL CRIADO
  EventBus.emit(EventType.DEAL_CREATED, {
    organization_id: orgId,
    deal_id: data.id,
    contact_id: ctcId,
    email: data.contact?.email,
    data: {
      deal_title: title,
      deal_value: value || 0,
      pipeline_id: pplId,
      stage_id: stgId,
      stage_name: data.stage?.name,
      assigned_to: assignTo,
    },
    source: 'crm',
  }).catch(console.error);

  return NextResponse.json({ deal: data }, { status: 201 });
}

async function addActivity({
  dealId,
  type,
  description,
  userId,
}: {
  dealId: string;
  type: string;
  description: string;
  userId?: string;
}) {
  const { data, error } = await supabase
    .from('deal_activities')
    .insert({
      deal_id: dealId,
      type,
      description,
      user_id: userId,
    })
    .select(`
      *,
      user:users(first_name, last_name)
    `)
    .single();

  if (error) throw error;

  return NextResponse.json({ activity: data }, { status: 201 });
}
