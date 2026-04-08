// =============================================
// WORDER: Single Email Template API
// Columns: id, organization_id, name, subject, preview_text,
// design_json, html, thumbnail_url, category, is_prebuilt,
// created_at, updated_at, created_by, design
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

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const body = await request.json();

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.preview_text !== undefined) updateData.preview_text = body.preview_text;
    if (body.html !== undefined) updateData.html = body.html;
    if (body.thumbnail_url !== undefined) updateData.thumbnail_url = body.thumbnail_url;
    if (body.category !== undefined) updateData.category = body.category;

    // Save design in BOTH columns for compatibility
    const designValue = body.design ?? body.design_json;
    if (designValue !== undefined) {
      updateData.design = designValue;
      updateData.design_json = designValue;
    }

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .select()
      .single();

    if (error) {
      console.error('[EmailTemplate] Update error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
