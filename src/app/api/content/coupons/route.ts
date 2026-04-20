import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ coupons: [] });

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ coupons: data || [] });
  } catch (e: any) {
    return NextResponse.json({ coupons: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase)
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const body = await request.json();
    const { code, type, value, min_purchase, max_uses, expires_at } = body;

    if (!code || !type || value === undefined) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: code, type, value' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        organization_id: organizationId,
        code: code.toUpperCase(),
        type,
        value: Number(value),
        min_purchase: min_purchase ? Number(min_purchase) : null,
        max_uses: max_uses ? Number(max_uses) : null,
        uses_count: 0,
        expires_at: expires_at || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase)
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    }

    if (updates.code) updates.code = updates.code.toUpperCase();
    if (updates.value !== undefined) updates.value = Number(updates.value);
    if (updates.min_purchase !== undefined)
      updates.min_purchase = updates.min_purchase ? Number(updates.min_purchase) : null;
    if (updates.max_uses !== undefined)
      updates.max_uses = updates.max_uses ? Number(updates.max_uses) : null;

    const { data, error } = await supabase
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase)
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
