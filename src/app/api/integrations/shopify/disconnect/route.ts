import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  // Multi-org lookup
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  const orgIds = [...new Set([
    userOrgId,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  const { error } = await supabase
    .from('shopify_stores')
    .update({
      is_active: false,
      status: 'disconnected',
      uninstalled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('organization_id', orgIds)
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
