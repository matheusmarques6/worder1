import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ members: [] });
    const { data } = await supabase
      .from('organization_members')
      .select('*, profiles(*)')
      .eq('organization_id', orgId);
    return NextResponse.json({ members: data || [] });
  } catch {
    return NextResponse.json({ members: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json();
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
    const { data, error } = await supabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        email: body.email,
        role: body.role || 'viewer',
        status: 'invited',
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const VALID_ROLES = ['admin', 'editor', 'viewer'];

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json();
  const { id, role } = body || {};
  if (!id || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'id e role válidos são obrigatórios' }, { status: 400 });
  }
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    // Garantir que o membro pertence à org de quem chamou
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, role, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });

    // Não permitir remover o último admin (rebaixando função)
    if (member.role === 'admin' && role !== 'admin') {
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('role', 'admin');
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'A organização precisa de pelo menos um administrador' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('id', id)
      .eq('organization_id', orgId)
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
  const orgId = auth.user.organization_id;
  const body = await request.json();
  const { id } = body || {};
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    // Garantir que o membro pertence à org de quem chamou
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, role, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });

    // Não permitir remover o último admin
    if (member.role === 'admin') {
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('role', 'admin');
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'Não é possível remover o último administrador' }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
