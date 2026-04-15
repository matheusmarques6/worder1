// =============================================
// Shopify GDPR Mandatory Webhooks
// src/app/api/webhooks/shopify/gdpr/route.ts
//
// Shopify REQUIRES these 3 topics to approve the app:
//   - customers/data_request  (merchant requests data export for a shopper)
//   - customers/redact        (delete customer data 48h after uninstall)
//   - shop/redact             (delete all store data 48h after uninstall)
//
// Register all three pointing to this single endpoint.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function verifyHmac(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[GDPR] Shopify secret not configured — rejecting');
    return false;
  }
  const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  const sigBuf = Buffer.from(signature, 'base64');
  const digBuf = Buffer.from(digest, 'base64');
  if (sigBuf.length !== digBuf.length) return false;
  try {
    return crypto.timingSafeEqual(sigBuf, digBuf);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('X-Shopify-Hmac-Sha256');
  const topic = request.headers.get('X-Shopify-Topic') || '';
  const shopDomain = request.headers.get('X-Shopify-Shop-Domain') || '';

  if (!verifyHmac(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any = {};
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    // Always log the request so we can prove compliance
    await supabase.from('gdpr_requests').insert({
      topic,
      shop_domain: shopDomain,
      payload,
      received_at: new Date().toISOString(),
      status: 'received',
    }).throwOnError().catch(() => {
      // Table may not exist yet; fall back to console
      console.log('[GDPR] Request logged (fallback):', { topic, shopDomain, payload });
    });

    // Resolve store/org
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('shop_domain', shopDomain)
      .maybeSingle();

    switch (topic) {
      case 'customers/data_request': {
        // We must provide the customer's data to the merchant within 30 days.
        // Mark for async export pipeline.
        if (store && payload?.customer?.email) {
          await supabase
            .from('gdpr_requests')
            .update({ status: 'queued_for_export' })
            .eq('shop_domain', shopDomain)
            .eq('topic', topic)
            .order('received_at', { ascending: false })
            .limit(1)
            .catch(() => null);
        }
        break;
      }

      case 'customers/redact': {
        if (store && payload?.customer?.email) {
          // Hard delete customer data for that customer in this org
          await supabase
            .from('contacts')
            .delete()
            .eq('organization_id', store.organization_id)
            .eq('email', payload.customer.email)
            .catch((e) => console.error('[GDPR] contact delete error', e));
        }
        break;
      }

      case 'shop/redact': {
        // 48h after uninstall — wipe all store data
        if (store) {
          await supabase.from('contacts').delete().eq('organization_id', store.organization_id).catch(() => null);
          await supabase.from('shopify_orders').delete().eq('organization_id', store.organization_id).catch(() => null);
          await supabase.from('shopify_checkouts').delete().eq('organization_id', store.organization_id).catch(() => null);
          await supabase.from('shopify_stores').delete().eq('id', store.id).catch(() => null);
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    console.error('[GDPR] Error handling', topic, error);
    // Still return 200 to stop Shopify from retrying indefinitely; we logged it.
    return NextResponse.json({ ok: true, logged: true }, { status: 200 });
  }
}
