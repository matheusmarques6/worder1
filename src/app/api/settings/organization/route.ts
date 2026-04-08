import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ organization: null });

    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    return NextResponse.json({ organization: data });
  } catch {
    return NextResponse.json({ organization: null });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const body = await request.json();

    // If updating email_settings, merge with existing
    if (body.email_settings) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('email_settings')
        .eq('id', orgId)
        .single();

      body.email_settings = {
        ...(existing?.email_settings || {}),
        ...body.email_settings,
      };
    }

    const { data, error } = await supabase
      .from('organizations')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ organization: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
