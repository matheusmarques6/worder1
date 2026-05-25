import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    // Only allow deleting placeholder stores (safety guard)
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, organization_id')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    if (!store.shop_domain?.endsWith('.worder.local')) {
      return NextResponse.json({ error: 'Only placeholder stores can be deleted' }, { status: 403 });
    }

    await supabase
      .from('shopify_stores')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[/api/stores/[id] DELETE] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
