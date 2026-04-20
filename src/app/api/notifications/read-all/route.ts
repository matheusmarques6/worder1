import { NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const userId = auth.user.id;
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
