import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

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

        // Get deal counts per stage
        const { data: dealCounts, error: countError } = await supabase
          .from('deals')
          .select('stage_id')
          .eq('organization_id', organizationId);

        // Count deals per stage
        const stageDealsMap: Record<string, number> = {};
        dealCounts?.forEach(deal => {
          if (deal.stage_id) {
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
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('*')
      .eq('organization_id', organizationId)
      .order('position');

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
        .select('id, name, color')
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

    // Update deal
    const previousDeal = await supabase
      .from('deals')
      .select('stage_id, value')
      .eq('id', id)
      .single();

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
        stage:pipeline_stages(id, name, color)
      `)
      .single();

    if (error) throw error;

    // Log activity if stage changed
    if (updates.stage_id && updates.stage_id !== previousDeal.data?.stage_id) {
      await supabase.from('deal_activities').insert({
        deal_id: id,
        type: 'stage_change',
        description: `Deal moved to ${data.stage?.name}`,
      });
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
  stages?: { name: string; color: string }[];
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

  // Create default stages if provided
  if (stages && stages.length > 0) {
    const stageInserts = stages.map((stage, index) => ({
      pipeline_id: pipeline.id,
      name: stage.name,
      color: stage.color,
      position: index,
    }));

    await supabase.from('pipeline_stages').insert(stageInserts);
  } else {
    // Create default stages
    const defaultStages = [
      { name: 'Lead', color: '#6366f1' },
      { name: 'Qualified', color: '#8b5cf6' },
      { name: 'Proposal', color: '#a855f7' },
      { name: 'Negotiation', color: '#f59e0b' },
      { name: 'Closed Won', color: '#22c55e' },
      { name: 'Closed Lost', color: '#ef4444' },
    ];

    const stageInserts = defaultStages.map((stage, index) => ({
      pipeline_id: pipeline.id,
      name: stage.name,
      color: stage.color,
      position: index,
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
}: {
  pipelineId: string;
  name: string;
  color: string;
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
      probability: probability || 50,
      expected_close_date: expDate,
      description,
      assigned_to: assignTo,
      position,
      status: 'open',
      tags: [],
      custom_fields: {},
    })
    .select(`
      *,
      contact:contacts(id, email, first_name, last_name, avatar_url, company),
      stage:pipeline_stages(id, name, color)
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
