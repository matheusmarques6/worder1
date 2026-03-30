// =============================================
// WORDER: Email Templates API
// /src/app/api/email/templates/route.ts
//
// GET: list templates, POST: create template.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    const { data: templates, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[EmailTemplates] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error('[EmailTemplates] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Minimal insert - only columns guaranteed to exist
    const insertData: Record<string, any> = {
      organization_id: user.organization_id,
      name: body.name,
    };
    if (body.subject) insertData.subject = body.subject;
    if (body.html) insertData.html = body.html;
    if (body.thumbnail_url) insertData.thumbnail_url = body.thumbnail_url;

    // Try with design_json if provided
    if (body.design || body.design_json) {
      insertData.design_json = body.design || body.design_json;
    }

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[EmailTemplates] Insert error:', error.message);

      // If column error: retry without design_json
      if (error.message?.includes('column') || error.code === '42703') {
        delete insertData.design_json;
        // Try with design instead
        if (body.design || body.design_json) {
          insertData.design = body.design || body.design_json;
        }
        const { data: t2, error: e2 } = await supabaseAdmin
          .from('email_templates').insert(insertData).select().single();

        if (e2) {
          // Try completely minimal
          delete insertData.design;
          const { data: t3, error: e3 } = await supabaseAdmin
            .from('email_templates').insert(insertData).select().single();
          if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
          return NextResponse.json({ template: t3 }, { status: 201 });
        }
        return NextResponse.json({ template: t2 }, { status: 201 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    console.error('[EmailTemplates] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
