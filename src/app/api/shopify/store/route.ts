import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  // Multi-org lookup: get all orgs the user belongs to
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  const orgIds = [...new Set([
    userOrgId,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  try {
    if (storeId) {
      const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('id', storeId)
        .in('organization_id', orgIds)
        .single();

      if (error) throw error;
      return NextResponse.json({ store: data });
    }

    const { data, error } = await supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ stores: data || [] });
  } catch (error: any) {
    console.error('Shopify Store GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
