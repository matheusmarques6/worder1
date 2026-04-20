import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchToOutbound } from '@/lib/webhooks/outbound-dispatcher';
import type { WebhookEventType } from '@/lib/webhooks/event-schemas';

export const dynamic = 'force-dynamic';

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    prefix: 'rl:webhook-test',
  });
  return ratelimit;
}

// POST /api/webhooks-admin/subscriptions/[id]/test
// Dispara um payload sintético pra essa subscription.
// Rate-limited a 10/hora por subscription pra evitar spam do destino.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { user } = auth;

  const rl = getRatelimit();
  if (rl) {
    const { success } = await rl.limit(`webhook-test:${params.id}`);
    if (!success) {
      return NextResponse.json({ error: 'rate limit exceeded (10/hour)' }, { status: 429 });
    }
  }

  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from('webhook_subscriptions')
    .select('id, store_id, organization_id, events')
    .eq('id', params.id)
    .maybeSingle();

  if (!sub || sub.organization_id !== user.organization_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!sub.events || sub.events.length === 0) {
    return NextResponse.json({ error: 'subscription has no events' }, { status: 400 });
  }

  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, shop_domain, shop_name')
    .eq('id', sub.store_id)
    .maybeSingle();

  const eventType = sub.events[0] as WebhookEventType;
  const fakeId = `test_${Date.now()}`;

  await dispatchToOutbound({
    eventType,
    organizationId: sub.organization_id,
    storeId: sub.store_id,
    sourceEventId: fakeId,
    source: 'test',
    store: {
      id: sub.store_id,
      shop_domain: store?.shop_domain ?? 'test.myshopify.com',
      name: store?.shop_name ?? 'Test Store',
    },
    data: {
      _test: true,
      message: 'This is a test event from Worder. If you receive this, your webhook is working.',
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}
