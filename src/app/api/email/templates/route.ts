// =============================================
// WORDER: Email Templates API
// Columns: id, organization_id, name, subject, preview_text,
// design_json, html, thumbnail_url, category, is_prebuilt,
// created_at, updated_at, created_by, design
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get('store_id') || searchParams.get('storeId');

    let query = supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('updated_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: templates, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const storeId = body.store_id;

    const insertData: Record<string, any> = {
      organization_id: auth.user.organization_id,
      name: body.name,
      subject: body.subject || '',
      html: body.html || '',
      category: body.category || 'marketing',
      created_by: auth.user.id,
    };
    // Accept design_json / design so templates created from prebuilt
    // are loaded in the editor with real editable blocks.
    if (body.design_json || body.design) {
      insertData.design_json = body.design_json || body.design;
      insertData.design = body.design || body.design_json;
    }
    if (storeId) insertData.store_id = storeId;

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[EmailTemplates] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
