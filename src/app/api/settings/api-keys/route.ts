import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import crypto from 'crypto';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ keys: [] });

    const { data } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    return NextResponse.json({ keys: data || [] });
  } catch {
    return NextResponse.json({ keys: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { name } = await request.json();
    const rawKey = 'wrd_' + crypto.randomBytes(24).toString('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        organization_id: orgId,
        name: name || 'API Key',
        key: rawKey,
        key_prefix: keyPrefix,
        user_id: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ...data, api_key: rawKey });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { id } = await request.json();
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
