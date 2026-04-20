import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { encryptSecret, generateWebhookSecret } from '@/lib/webhooks/secret-store';
import { validateUrl } from '@/lib/webhooks/safe-fetch';

export const dynamic = 'force-dynamic';

// GET /api/webhooks-admin/subscriptions/[id]
// Lê via supabase auth client → RLS filtra por org.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, store_id, name, url, events, status, description, created_at, updated_at, secret_previous_expires_at')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ subscription: data });
}

// PATCH: dois modos.
// 1. { regenerate_secret: true } → rotaciona (move atual pra previous, 24h)
// 2. Campos parciais (name, url, events, status, description)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Defesa em profundidade: confirmar ownership antes de mexer
  const { data: existing } = await admin
    .from('webhook_subscriptions')
    .select('id, organization_id, secret_encrypted')
    .eq('id', params.id)
    .maybeSingle();

  if (!existing || existing.organization_id !== user.organization_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (body.regenerate_secret) {
    const newSecret = generateWebhookSecret();
    const newEncrypted = encryptSecret(newSecret);
    const { error } = await admin
      .from('webhook_subscriptions')
      .update({
        secret_encrypted: newEncrypted,
        secret_previous_encrypted: existing.secret_encrypted,
        secret_previous_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ secret: newSecret });
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.url !== undefined) {
    try {
      validateUrl(body.url);
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? 'invalid url' }, { status: 400 });
    }
    updates.url = body.url;
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ error: 'events must be non-empty array' }, { status: 400 });
    }
    updates.events = body.events;
  }
  if (body.status !== undefined) updates.status = body.status;
  if (body.description !== undefined) updates.description = body.description;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 });
  }

  const { error } = await admin
    .from('webhook_subscriptions')
    .update(updates)
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from('webhook_subscriptions')
    .select('organization_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!existing || existing.organization_id !== user.organization_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { error } = await admin
    .from('webhook_subscriptions')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
