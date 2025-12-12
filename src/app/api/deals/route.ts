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
      const { data, error } = await supabase
        .from('pipelines')
        .select(`
          *,
          stages:pipeline_stages(
            id,
            name,
            color,
            position,
            deal_count:deals(count)
          )
        `)
        .eq('organization_id', organizationId)
        .order('position');

      if (error) throw error;
      return NextResponse.json({ pipelines: data });
    }

    if (dealId) {
      const { data, error } = await supabase
        .from('deals')
        .select(`
          *,
          contact:contacts(*),
          stage:pipeline_stages(
            id,
            name,
            color,
            pipeline:pipelines(id, name)
          ),
          activities:deal_activities(
            id,
            type,
            description,
            created_at,
            user:users(first_name, last_name)
          )
        `)
        .eq('id', dealId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ deal: data });
    }

    // List deals
    let query = supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(id, email, first_name, last_name, avatar_url),
        stage:pipeline_stages(id, name, color)
      `)
      .eq('organization_id', organizationId)
      .order('position');

    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId);
    }

    if (stageId) {
      query = query.eq('stage_id', stageId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ deals: data });
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
  stages,
}: {
  organizationId: string;
  name: string;
  description?: string;
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

  // Fetch pipeline with stages
  const { data: fullPipeline } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('id', pipeline.id)
    .single();

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
  pipelineId,
  stageId,
  contactId,
  title,
  value,
  currency,
  expectedCloseDate,
  description,
  assignedTo,
}: {
  organizationId: string;
  pipelineId: string;
  stageId: string;
  contactId?: string;
  title: string;
  value?: number;
  currency?: string;
  expectedCloseDate?: string;
  description?: string;
  assignedTo?: string;
}) {
  // Get max position in stage
  const { data: existingDeals } = await supabase
    .from('deals')
    .select('position')
    .eq('stage_id', stageId)
    .order('position', { ascending: false })
    .limit(1);

  const position = (existingDeals?.[0]?.position || 0) + 1;

  const { data, error } = await supabase
    .from('deals')
    .insert({
      organization_id: organizationId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      contact_id: contactId,
      title,
      value: value || 0,
      currency: currency || 'BRL',
      expected_close_date: expectedCloseDate,
      description,
      assigned_to: assignedTo,
      position,
    })
    .select(`
      *,
      contact:contacts(id, email, first_name, last_name, avatar_url),
      stage:pipeline_stages(id, name, color)
    `)
    .single();

  if (error) throw error;

  // Log activity
  await supabase.from('deal_activities').insert({
    deal_id: data.id,
    type: 'created',
    description: 'Deal created',
  });

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
