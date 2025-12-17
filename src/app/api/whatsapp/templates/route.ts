import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

function extractVariables(components: any[]): { header: number; body: number; buttons: number[] } {
  const variables = { header: 0, body: 0, buttons: [] as number[] };
  
  for (const comp of components || []) {
    if (comp.type === 'HEADER' && comp.format === 'TEXT') {
      const matches = comp.text?.match(/\{\{(\d+)\}\}/g) || [];
      variables.header = matches.length;
    }
    if (comp.type === 'BODY') {
      const matches = comp.text?.match(/\{\{(\d+)\}\}/g) || [];
      variables.body = matches.length;
    }
    if (comp.type === 'BUTTONS') {
      for (const btn of comp.buttons || []) {
        if (btn.type === 'URL' && btn.url) {
          const matches = btn.url.match(/\{\{(\d+)\}\}/g) || [];
          variables.buttons.push(matches.length);
        } else {
          variables.buttons.push(0);
        }
      }
    }
  }
  
  return variables;
}

// GET - Lista templates da Meta
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!waConfig) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    let url = `${WHATSAPP_API_URL}/${waConfig.business_account_id}/message_templates?limit=100`;
    if (status) url += `&status=${status}`;
    if (category) url += `&category=${category}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${waConfig.access_token}` },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', result);
      return NextResponse.json({ error: result.error?.message || 'Failed to fetch templates' }, { status: 500 });
    }

    const templates = (result.data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      components: t.components,
      variables: extractVariables(t.components),
    }));

    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar template
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!waConfig) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const body = await request.json();
    const { name, category, language = 'pt_BR', components } = body;

    if (!name || !category || !components) {
      return NextResponse.json({ error: 'name, category, components required' }, { status: 400 });
    }

    const response = await fetch(
      `${WHATSAPP_API_URL}/${waConfig.business_account_id}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${waConfig.access_token}`,
        },
        body: JSON.stringify({
          name,
          category: category.toUpperCase(),
          language,
          components,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', result);
      return NextResponse.json({ error: result.error?.message || 'Failed to create template' }, { status: 500 });
    }

    return NextResponse.json({ success: true, template_id: result.id, status: 'PENDING' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar template
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!waConfig) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const templateName = request.nextUrl.searchParams.get('name');
    if (!templateName) {
      return NextResponse.json({ error: 'Template name required' }, { status: 400 });
    }

    const response = await fetch(
      `${WHATSAPP_API_URL}/${waConfig.business_account_id}/message_templates?name=${templateName}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${waConfig.access_token}` },
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', result);
      return NextResponse.json({ error: result.error?.message || 'Failed to delete template' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
