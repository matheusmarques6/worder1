// =============================================
// GET/PATCH /api/settings/store-email
//
// Per-store email sender config. Each Shopify store under the merchant's
// org gets its own sender name + sender email + reply-to, because a
// merchant who runs two storefronts (e.g. Dr. Melaxin + Based) doesn't
// want to share a sender identity between them.
//
// Storage:
//   shopify_stores.settings.email_settings = {
//     default_sender_name, default_sender_email, default_reply_to
//   }
//
// Falls back to organizations.email_settings on first read (backward
// compat with the previous org-scoped storage). Once the merchant
// saves once for a store, the per-store row is authoritative.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

async function loadStore(orgId: string, storeId: string) {
  return supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id, settings')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle();
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const { data: store, error } = await loadStore(orgId, storeId);
  if (error || !store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Per-store config: read what the store actually has. The previous
  // version fell back to organizations.email_settings when the row was
  // empty — convenient for first-load UX, but it leaked the sibling
  // store's sender across stores in a multi-store org (Dr. Melaxin
  // kept seeing Based's "Based <based@worder.email>" sender). Now an
  // unconfigured store returns an empty object; the merchant configures
  // each store explicitly.
  const settings = (store.settings as any)?.email_settings || {};

  return NextResponse.json({ email_settings: settings });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
  const incoming = body?.email_settings || {};
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const { data: store, error: loadErr } = await loadStore(orgId, storeId);
  if (loadErr || !store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Merge into the existing settings JSONB so unrelated keys (e.g.
  // script_tag_id, loader_via) survive the update.
  const prevSettings: any = (store.settings as any) || {};
  const merged = {
    ...prevSettings,
    email_settings: {
      ...(prevSettings.email_settings || {}),
      ...incoming,
    },
  };

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('shopify_stores')
    .update({ settings: merged, updated_at: new Date().toISOString() })
    .eq('id', store.id)
    .select('id, settings')
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    email_settings: (updated.settings as any)?.email_settings || {},
  });
}
