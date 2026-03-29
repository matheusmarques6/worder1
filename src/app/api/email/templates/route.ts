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
      console.error('[EmailTemplates] Error fetching templates:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error) {
    console.error('[EmailTemplates] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    const { name, subject, html, thumbnail_url } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // Only insert columns that exist in the table:
    // id, organization_id, name, subject, html, design_json, thumbnail_url, created_at, updated_at
    const insertData: Record<string, any> = {
      organization_id: user.organization_id,
      name,
    }
    if (subject) insertData.subject = subject
    if (html) insertData.html = html
    if (thumbnail_url) insertData.thumbnail_url = thumbnail_url

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[EmailTemplates] Error creating template:', error);
      return NextResponse.json({ error: error.message || 'Failed to create template' }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('[EmailTemplates] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
