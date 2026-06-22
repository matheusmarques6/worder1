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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get('store_id');

    let query = supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('organization_id', auth.user.organization_id);

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: template, error } = await query.single();

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { searchParams } = request.nextUrl;
    const storeIdParam = searchParams.get('store_id') || searchParams.get('storeId');

    const body = await request.json();
    const storeIdFromBody = body.store_id || body.storeId;
    const targetStoreId = storeIdParam || storeIdFromBody;

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.preview_text !== undefined) updateData.preview_text = body.preview_text;
    if (body.html !== undefined) updateData.html = body.html;
    if (body.thumbnail_url !== undefined) updateData.thumbnail_url = body.thumbnail_url;
    if (body.category !== undefined) updateData.category = body.category;
    // Updates to editor_type are accepted only when the value is one
    // of the known flavors. This lets the API double as a "convert"
    // endpoint later without separate plumbing.
    const editorType = body.editor_type ?? body.editorType;
    if (editorType === 'text' || editorType === 'visual') {
      updateData.editor_type = editorType;
    }

    const designValue = body.design ?? body.design_json;
    if (designValue !== undefined) {
      updateData.design = designValue;
      updateData.design_json = designValue;
    }

    if (targetStoreId) {
      const { data: existing } = await supabaseAdmin
        .from('email_templates')
        .select('store_id')
        .eq('id', templateId)
        .eq('organization_id', auth.user.organization_id)
        .single();
      if (existing && !existing.store_id) {
        updateData.store_id = targetStoreId;
      }
    }

    const updateQuery = supabaseAdmin
      .from('email_templates')
      .update(updateData)
      .eq('id', templateId)
      .eq('organization_id', auth.user.organization_id);

    const { data: template, error } = await updateQuery
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await params;
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get('store_id');

    let deleteQuery = supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', templateId)
      .eq('organization_id', auth.user.organization_id);

    if (storeId) {
      deleteQuery = deleteQuery.eq('store_id', storeId);
    }

    const { error } = await deleteQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
