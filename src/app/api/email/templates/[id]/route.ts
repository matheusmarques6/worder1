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

    // Build update with only safe base fields
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.html !== undefined) updateData.html = body.html;
    if (body.thumbnail_url !== undefined) updateData.thumbnail_url = body.thumbnail_url;

    // Try saving design in design_json first, then design, then skip
    const designValue = body.design ?? body.design_json;

    if (designValue !== undefined) {
      // Attempt 1: save as design_json
      const attempt1 = { ...updateData, design_json: designValue };
      const { data: t1, error: e1 } = await supabaseAdmin
        .from('email_templates')
        .update(attempt1)
        .eq('id', params.id)
        .eq('organization_id', user.organization_id)
        .select()
        .single();

      if (!e1 && t1) {
        return NextResponse.json({ template: t1 });
      }

      // Attempt 2: save as design
      if (e1?.message?.includes('column') || e1?.code === '42703') {
        const attempt2 = { ...updateData, design: designValue };
        const { data: t2, error: e2 } = await supabaseAdmin
          .from('email_templates')
          .update(attempt2)
          .eq('id', params.id)
          .eq('organization_id', user.organization_id)
          .select()
          .single();

        if (!e2 && t2) {
          return NextResponse.json({ template: t2 });
        }

        // Attempt 3: save without design at all
        if (e2?.message?.includes('column') || e2?.code === '42703') {
          const { data: t3, error: e3 } = await supabaseAdmin
            .from('email_templates')
            .update(updateData)
            .eq('id', params.id)
            .eq('organization_id', user.organization_id)
            .select()
            .single();

          if (e3) {
            console.error('[EmailTemplate] All attempts failed:', e3.message);
            return NextResponse.json({ error: e3.message }, { status: 500 });
          }
          return NextResponse.json({ template: t3 });
        }

        return NextResponse.json({ error: e2?.message || 'Update failed' }, { status: 500 });
      }

      return NextResponse.json({ error: e1?.message || 'Update failed' }, { status: 500 });
    }

    // No design to save - just update base fields
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .select()
      .single();

    if (error) {
      console.error('[EmailTemplate] Update error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('[EmailTemplate] PUT error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
