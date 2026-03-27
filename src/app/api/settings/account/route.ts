import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const userId = auth.user.id;
  const orgId = auth.user.organization_id;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ profile: null, organization: null });
    const [{ data: profile }, { data: organization }] = await Promise.all([
      supabase.from('profiles').select('name, email, phone').eq('id', userId).single(),
      supabase.from('organizations').select('company_name, cnpj, address, city, state').eq('id', orgId).single(),
    ]);
    return NextResponse.json({ profile, organization });
  } catch {
    return NextResponse.json({ profile: null, organization: null });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const userId = auth.user.id;
  const orgId = auth.user.organization_id;
  const body = await request.json();
  const { type, ...fields } = body;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
    if (type === 'profile') {
      const { name, phone } = fields;
      const { error } = await supabase.from('profiles').update({ name, phone }).eq('id', userId);
      if (error) throw error;
    } else if (type === 'organization') {
      const { company_name, cnpj, address, city, state } = fields;
      const { error } = await supabase
        .from('organizations')
        .update({ company_name, cnpj, address, city, state })
        .eq('id', orgId);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
