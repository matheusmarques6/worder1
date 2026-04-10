import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const automationId = params.id;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch original automation
    const { data: original, error: fetchError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Create duplicate with "Cópia de" prefix and draft status
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
        status: 'draft', // Always create as draft
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
