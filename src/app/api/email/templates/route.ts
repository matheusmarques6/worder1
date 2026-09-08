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

    // A loja pedida tem de ser do usuário — um id de outra organização
    // é recusado, não vira filtro.
    if (storeId) {
      const { validateStoreAccess } = await import('@/lib/api-utils');
      const access = await validateStoreAccess(auth.supabase as any, auth.user.organization_id, storeId, auth.user.id);
      if (!access.valid) {
        return NextResponse.json({ error: access.error }, { status: access.status || 403 });
      }
    }

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

    // editor_type discriminates between the visual drag-and-drop editor
    // ('visual', default) and the founder-style text editor ('text').
    // Anything else is rejected at the DB CHECK constraint, so we filter
    // here too instead of trusting client input.
    const editorType =
      body.editor_type === 'text' || body.editorType === 'text' ? 'text' : 'visual';

    const insertData: Record<string, any> = {
      organization_id: auth.user.organization_id,
      name: body.name,
      subject: body.subject || '',
      html: body.html || '',
      category: body.category || 'marketing',
      editor_type: editorType,
      created_by: auth.user.id,
    };
    if (body.preview_text !== undefined) insertData.preview_text = body.preview_text;
    // Accept design_json / design so templates created from prebuilt
    // are loaded in the editor with real editable blocks.
    if (body.design_json || body.design) {
      insertData.design_json = body.design_json || body.design;
      insertData.design = body.design || body.design_json;
    }
    if (storeId) insertData.store_id = storeId;

    let { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .insert(insertData)
      .select()
      .single();

    // Graceful fallback for deployments that haven't run the
    // 2026_06_22_text_based_email_templates.sql migration yet. PostgREST
    // returns "Could not find the 'editor_type' column ... in the schema
    // cache" (PGRST204). For visual templates we can safely retry without
    // the column; for text-based we surface a clear error pointing at the
    // missing migration so the user knows what to apply.
    if (
      error &&
      /editor_type/i.test(error.message || '') &&
      /schema cache|could not find/i.test(error.message || '')
    ) {
      if (editorType === 'text') {
        console.error('[EmailTemplates] editor_type column missing — text templates require the 2026_06_22_text_based_email_templates.sql migration');
        return NextResponse.json(
          {
            error:
              'Banco desatualizado: rode a migration 2026_06_22_text_based_email_templates.sql no Supabase para habilitar templates de texto.',
            code: 'MIGRATION_REQUIRED',
            migration: '2026_06_22_text_based_email_templates.sql',
          },
          { status: 409 },
        );
      }
      const { editor_type: _drop, ...legacyInsert } = insertData;
      const retry = await supabaseAdmin
        .from('email_templates')
        .insert(legacyInsert)
        .select()
        .single();
      template = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[EmailTemplates] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
