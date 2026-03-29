// =============================================
// WORDER: Single Segment API
// /src/app/api/segments/[id]/route.ts
//
// GET, PUT, DELETE single segment.
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

    const { data: segment, error } = await supabaseAdmin
      .from('segments')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .single();

    if (error || !segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    return NextResponse.json({ segment });
  } catch (error) {
    console.error('[Segment] Error:', error);
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

    const { name, description, conditions, store_id } = body;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (store_id !== undefined) updateData.store_id = store_id;

    const { data: segment, error } = await supabaseAdmin
      .from('segments')
      .update(updateData)
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .select()
      .single();

    if (error || !segment) {
      return NextResponse.json({ error: 'Segment not found or update failed' }, { status: 404 });
    }

    return NextResponse.json({ segment });
  } catch (error) {
    console.error('[Segment] Error:', error);
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
      .from('segments')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', user.organization_id);

    if (error) {
      console.error('[Segment] Error deleting segment:', error);
      return NextResponse.json({ error: 'Failed to delete segment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Segment] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
