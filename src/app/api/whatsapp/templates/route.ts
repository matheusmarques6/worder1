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
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    let query = supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ templates: data || [] });
  } catch (error: any) {
    console.error('Templates GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { name, category, language, components, body_text, header_text, footer_text, buttons } = body;

    if (!name) {
      return NextResponse.json({ error: 'Template name required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_templates')
      .insert({
        organization_id: organizationId,
        name,
        category: category || 'MARKETING',
        language: language || 'pt_BR',
        status: 'draft',
        components: components || [],
        body_text,
        header_text,
        footer_text,
        buttons,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error: any) {
    console.error('Template POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
