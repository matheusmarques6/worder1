import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// GET /api/webhooks-admin/deliveries/[id]
// Detalhe de uma entrega (payload completo, response_body, etc).
// RLS (auth client) garante que o usuário só vê entregas da sua org.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ delivery: data });
}
