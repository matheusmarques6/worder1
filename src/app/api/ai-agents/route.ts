import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabase
      .from('ai_agents')
      .select(`
        *,
        sources:ai_agent_sources(id, name, type, status)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ agents: data || [] });
  } catch (error: any) {
    console.error('AI Agents GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { name, description, model, system_prompt, temperature, max_tokens, is_active } = body;

    if (!name) {
      return NextResponse.json({ error: 'Agent name required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_agents')
      .insert({
        organization_id: organizationId,
        name,
        description,
        model: model || 'gpt-4o-mini',
        system_prompt: system_prompt || '',
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 1000,
        is_active: is_active ?? true,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (error: any) {
    console.error('AI Agents POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_agents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ agent: data });
  } catch (error: any) {
    console.error('AI Agents PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('ai_agents')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('AI Agents DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
