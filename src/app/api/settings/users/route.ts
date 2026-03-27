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
