// =============================================
// /api/integrations/shopify/aliases
//
// GET    — list aliases for a store (auth required)
// POST   — add an alias  { storeId, domain }
// DELETE — remove an alias { storeId, domain }
//
// Lets merchants whose Shopify canonical myshopifyDomain differs from
// what they originally typed during manual connection add the missing
// domain so webhooks/pixel events resolve correctly. Without this, a
// rename or expansion-store secondary domain leaves the original
// canonical domain orphaned and Shopify webhooks come back with 410.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeDomain } from '@/lib/shopify/resolve-store-by-domain';

export const dynamic = 'force-dynamic';

async function loadStore(storeId: string, organizationId: string) {
  const admin = getSupabaseAdmin();
  return admin
    .from('shopify_stores')
    .select('id, shop_domain, shop_domain_aliases')
    .eq('id', storeId)
    .eq('organization_id', organizationId)
    .maybeSingle();
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const { data: store } = await loadStore(storeId, orgId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  return NextResponse.json({
    primary: store.shop_domain,
    aliases: Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
  const domain = normalizeDomain(body?.domain);

  if (!storeId || !domain) {
    return NextResponse.json({ error: 'storeId and domain required' }, { status: 400 });
  }

  const { data: store } = await loadStore(storeId, orgId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  // No-op when the alias matches the primary or already exists
  const existing: string[] = Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [];
  if (domain === normalizeDomain(store.shop_domain)) {
    return NextResponse.json({
      primary: store.shop_domain,
      aliases: existing,
      message: 'Domain already matches the primary shop_domain — nothing to add.',
    });
  }
  if (existing.includes(domain)) {
    return NextResponse.json({ primary: store.shop_domain, aliases: existing, message: 'Already an alias.' });
  }

  const newAliases = [...existing, domain];
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('shopify_stores')
    .update({ shop_domain_aliases: newAliases, updated_at: new Date().toISOString() })
    .eq('id', storeId)
    .eq('organization_id', orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ primary: store.shop_domain, aliases: newAliases, added: domain });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
  const domain = normalizeDomain(body?.domain);

  if (!storeId || !domain) {
    return NextResponse.json({ error: 'storeId and domain required' }, { status: 400 });
  }

  const { data: store } = await loadStore(storeId, orgId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const existing: string[] = Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [];
  const newAliases = existing.filter(d => normalizeDomain(d) !== domain);

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('shopify_stores')
    .update({ shop_domain_aliases: newAliases, updated_at: new Date().toISOString() })
    .eq('id', storeId)
    .eq('organization_id', orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ primary: store.shop_domain, aliases: newAliases, removed: domain });
}
