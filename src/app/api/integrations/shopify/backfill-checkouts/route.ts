// =============================================
// POST /api/integrations/shopify/backfill-checkouts
//
// Re-runs identity resolution against every shopify_checkouts row in
// the caller's organization that's missing contact_id but has any of:
//   - email
//   - shopify_customer_id (rare on this table but supported)
//
// AND retries Shopify's GraphQL abandoned-checkout API for rows that
// have neither stored, in case the original webhook payload didn't
// carry the email but Shopify's later state does. (Common when the
// merchant only had checkouts/create with no email and never the
// follow-up checkouts/update with the typed email — webhook delivery
// loss, network glitch, sandbox skip, etc.)
//
// Idempotent: rows that already have a linked contact are skipped.
//
// Body: { storeId: "..." }   (defaults to active store of the org)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SHOPIFY_API_VERSION = '2026-04';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;

  const admin = getSupabaseAdmin();

  // Resolve store. Fall back to the active one if not specified.
  let store: any;
  if (storeId) {
    const { data } = await admin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, access_token, api_version')
      .eq('id', storeId)
      .eq('organization_id', orgId)
      .maybeSingle();
    store = data;
  } else {
    // Sem storeId só serve a ÚNICA loja ativa da organização.
    const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<any>(admin, {
      orgIds: [orgId], select: 'id, organization_id, shop_domain, access_token, api_version',
    });
    if (!picked.store) {
      const err = pickStoreError(picked.reason);
      return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
    }
    store = picked.store;
  }
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  // 1. Pull every checkout row missing a contact link
  const { data: rows } = await admin
    .from('shopify_checkouts')
    .select('id, shopify_checkout_id, shopify_checkout_token, email, phone, contact_id')
    .eq('store_id', store.id)
    .is('contact_id', null)
    .order('shopify_created_at', { ascending: false })
    .limit(500);

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No unlinked checkouts',
      processed: 0,
      linked: 0,
      enriched_from_shopify: 0,
    });
  }

  let linked = 0;
  let enrichedFromShopify = 0;
  const errors: string[] = [];

  // 2. For rows that already have an email, try to link them now
  const withEmail = rows.filter((r: any) => r.email);
  const emails = Array.from(new Set(withEmail.map((r: any) => String(r.email).toLowerCase())));
  if (emails.length > 0) {
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, email')
      .eq('organization_id', orgId)
      .in('email', emails);
    const byEmail: Record<string, string> = {};
    for (const c of contacts || []) {
      if (c.email) byEmail[String(c.email).toLowerCase()] = c.id;
    }
    for (const r of withEmail) {
      const cid = byEmail[String(r.email).toLowerCase()];
      if (cid) {
        await admin
          .from('shopify_checkouts')
          .update({ contact_id: cid, updated_at: new Date().toISOString() })
          .eq('id', r.id);
        // Also backfill the contact_events row
        await admin
          .from('contact_events')
          .update({ contact_id: cid })
          .eq('organization_id', orgId)
          .eq('shopify_resource_id', r.shopify_checkout_id)
          .eq('shopify_resource_type', 'checkout')
          .is('contact_id', null);
        linked++;
      }
    }
  }

  // 3. For rows STILL without email, try fetching the abandoned checkout
  //    from Shopify's GraphQL to recover email/customer info that the
  //    webhook payload may have lacked. Only viable for stores with an
  //    access token (i.e. not freshly disconnected).
  const withoutEmail = rows.filter((r: any) => !r.email);
  if (withoutEmail.length > 0 && store.access_token) {
    // Shopify limits GraphQL abandoned checkouts to recent ones. We
    // batch by page and match locally on token.
    const apiVersion = store.api_version || SHOPIFY_API_VERSION;
    try {
      const res = await fetch(
        `https://${store.shop_domain}/admin/api/${apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': store.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query AbandonedCheckouts {
                abandonedCheckouts(first: 100, sortKey: CREATED_AT, reverse: true) {
                  edges {
                    node {
                      id
                      abandonedCheckoutUrl
                      createdAt
                      customer { id email phone firstName lastName }
                      billingAddress { firstName lastName phone }
                    }
                  }
                }
              }
            `,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const edges = data.data?.abandonedCheckouts?.edges || [];
        // Map by trailing numeric id from gid (Shopify GIDs:
        // gid://shopify/AbandonedCheckout/12345)
        const byId = new Map<string, any>();
        for (const edge of edges) {
          const node = edge.node;
          const m = String(node.id || '').match(/AbandonedCheckout\/(\d+)/);
          if (m) byId.set(m[1], node);
        }
        for (const r of withoutEmail) {
          const node = byId.get(String(r.shopify_checkout_id));
          if (!node) continue;
          const recovered = {
            email: node.customer?.email || null,
            phone: node.customer?.phone || node.billingAddress?.phone || null,
            customerId: node.customer?.id ? String(node.customer.id).match(/Customer\/(\d+)/)?.[1] : null,
            firstName: node.billingAddress?.firstName || node.customer?.firstName || null,
            lastName: node.billingAddress?.lastName || node.customer?.lastName || null,
          };
          if (!recovered.email && !recovered.customerId) continue;
          // Update the row with recovered info
          await admin
            .from('shopify_checkouts')
            .update({
              email: recovered.email,
              phone: recovered.phone,
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
          enrichedFromShopify++;
          // Try to link a contact
          let cid: string | null = null;
          if (recovered.email) {
            const { data: c } = await admin
              .from('contacts')
              .select('id')
              .eq('organization_id', orgId)
              .ilike('email', recovered.email)
              .maybeSingle();
            cid = c?.id || null;
          }
          if (!cid && recovered.customerId) {
            const { data: c } = await admin
              .from('contacts')
              .select('id')
              .eq('organization_id', orgId)
              .eq('shopify_customer_id', recovered.customerId)
              .maybeSingle();
            cid = c?.id || null;
          }
          if (cid) {
            await admin
              .from('shopify_checkouts')
              .update({ contact_id: cid })
              .eq('id', r.id);
            await admin
              .from('contact_events')
              .update({ contact_id: cid })
              .eq('organization_id', orgId)
              .eq('shopify_resource_id', r.shopify_checkout_id)
              .eq('shopify_resource_type', 'checkout')
              .is('contact_id', null);
            linked++;
          }
        }
      } else {
        errors.push(`GraphQL abandoned checkouts query failed: ${res.status}`);
      }
    } catch (e: any) {
      errors.push(e?.message || 'GraphQL fetch error');
    }
  }

  return NextResponse.json({
    success: true,
    processed: rows.length,
    linked,
    enriched_from_shopify: enrichedFromShopify,
    errors: errors.length > 0 ? errors : undefined,
  });
}
