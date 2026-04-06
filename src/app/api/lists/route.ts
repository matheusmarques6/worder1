import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ lists: [] });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: lists, error } = await supabase
    .from('lists')
    .select('id, name, description, type, contact_count, created_at')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) {
    return NextResponse.json({ lists: [], error: error.message });
  }

  return NextResponse.json({ lists: lists || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { organizationId, name, description } = body;

  if (!organizationId || !name) {
    return NextResponse.json({ error: 'organizationId and name required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: list, error } = await supabase
    .from('lists')
    .insert({
      organization_id: organizationId,
      name,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ list }, { status: 201 });
}
