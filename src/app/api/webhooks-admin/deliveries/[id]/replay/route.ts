import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWebhookDelivery } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// POST /api/webhooks-admin/deliveries/[id]/replay
// Cria nova linha em webhook_deliveries com o mesmo payload, event_id
// sufixado com _replay_<ts> (preserva histórico + contorna UNIQUE
// (subscription_id, event_id)), e enfileira no QStash.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user, supabase } = auth;

  // 1. Lê via cliente autenticado — se RLS bloqueia, não volta nada.
  const { data: original, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !original) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // 2. Defesa em profundidade: confirmar org membership antes de usar service role
  if (original.organization_id !== user.organization_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 3. Inserir nova linha via admin (RLS não tem policy de INSERT)
  const admin = getSupabaseAdmin();
  const { data: inserted, error: insertError } = await admin
    .from('webhook_deliveries')
    .insert({
      subscription_id: original.subscription_id,
      organization_id: original.organization_id,
      store_id: original.store_id,
      event_type: original.event_type,
      event_id: `${original.event_id}_replay_${Date.now()}`,
      payload: original.payload,
      url: original.url,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? 'replay failed' },
      { status: 500 }
    );
  }

  try {
    await enqueueWebhookDelivery(inserted.id);
  } catch (err: any) {
    // Enqueue falhou; o sweeper pega na próxima rodada.
    console.warn('[replay] enqueue failed, sweeper will retry:', err?.message);
  }

  return NextResponse.json({ replayed_as: inserted.id });
}
