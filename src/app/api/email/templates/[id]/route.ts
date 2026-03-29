// =============================================
// WORDER: Single Email Template API
// /src/app/api/email/templates/[id]/route.ts
//
// GET, PUT, DELETE single template.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('[EmailTemplate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    const { name, subject, html, design, type, thumbnail_url } = body;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (subject !== undefined) updateData.subject = subject;
    if (html !== undefined) updateData.html = html;
    if (design !== undefined) updateData.design = design;
    if (type !== undefined) updateData.type = type;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .select()
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('[EmailTemplate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    const { error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', user.organization_id);

    if (error) {
      console.error('[EmailTemplate] Error deleting template:', error);
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[EmailTemplate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
