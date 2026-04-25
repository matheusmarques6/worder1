import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const automationId = params.id;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const { data: original, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    const { data: duplicate, error: insertError } = await supabase
      .from('automations')
      .insert({
        organization_id: original.organization_id,
        store_id: original.store_id,
        name: `Cópia de ${original.name}`,
        description: original.description,
        trigger_type: original.trigger_type,
        trigger_config: original.trigger_config,
        trigger_filters: original.trigger_filters || [],
        audience_filters: original.audience_filters || [],
        exit_conditions: original.exit_conditions || [],
        frequency_config: original.frequency_config || { type: 'once' },
        nodes: original.nodes || [],
        edges: original.edges || [],
        status: 'draft',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ automation: duplicate }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
