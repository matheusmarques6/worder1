import { NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET /api/webhooks-admin/stores
// Lista lojas da org pra popular o select no WebhookForm.
// RLS aplicada via supabase auth client.
export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('shopify_stores')
    .select('id, shop_domain, shop_name')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stores: data ?? [] });
}
