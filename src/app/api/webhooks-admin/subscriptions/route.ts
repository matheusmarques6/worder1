import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { encryptSecret, generateWebhookSecret } from '@/lib/webhooks/secret-store';
import { validateUrl } from '@/lib/webhooks/safe-fetch';

export const dynamic = 'force-dynamic';

const CONSENT_ACTION = 'webhook_pii_consent_accepted';

// Lista subscriptions da org do usuário (RLS aplica via supabase auth client).
export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, store_id, name, url, events, status, description, secret_previous_expires_at, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

// Cria subscription. Precisa de PII consent prévio (412 se ausente).
// Retorna o secret em texto puro UMA única vez.
export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const { store_id, name, url, events, description } = body as {
    store_id?: string;
    name?: string;
    url?: string;
    events?: string[];
    description?: string;
  };

  if (!store_id || !name || !url || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  try {
    validateUrl(url);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'invalid url' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Gate de PII consent (spec §11)
  const { data: priorConsent } = await admin
    .from('audit_logs')
    .select('id')
    .eq('organization_id', user.organization_id)
    .eq('action', CONSENT_ACTION)
    .limit(1)
    .maybeSingle();

  if (!priorConsent) {
    return NextResponse.json({ error: 'pii_consent_required' }, { status: 412 });
  }

  // Verificar que a store pertence à org do usuário (defesa em profundidade)
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id')
    .eq('id', store_id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ error: 'store not found' }, { status: 404 });
  }

  const secret = generateWebhookSecret();
  const secret_encrypted = encryptSecret(secret);

  const { data, error } = await admin
    .from('webhook_subscriptions')
    .insert({
      organization_id: user.organization_id,
      store_id,
      name,
      url,
      events,
      description: description ?? null,
      secret_encrypted,
      created_by: user.id,
    })
    .select('id, store_id, name, url, events, status, description, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subscription: data, secret });
}
