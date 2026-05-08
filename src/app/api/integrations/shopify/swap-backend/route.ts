// =============================================
// PATCH /api/integrations/shopify/swap-backend
//
// Swaps the underlying Shopify backend on an EXISTING shopify_stores
// row, keeping every relation (contacts, events, automations, flows,
// emails, financials) intact. Use case: the merchant wants to point
// their Worder "Based" account at a different Shopify store while
// preserving years of CRM data.
//
// Distinct from /update-credentials: that endpoint rotates the
// Client Secret on the SAME Shopify shop. This one swaps to a
// DIFFERENT shop entirely (new domain, new shop_id, new admin).
//
// Distinct from disconnect+reconnect: that flow creates a new row
// and orphans all the data tied to the old one.
//
// Body:
//   {
//     storeId: "<uuid>",
//     newDomain: "newstore.myshopify.com",
//     clientId: "...",
//     clientSecret: "..."
//   }
//
// Flow:
//   1. Verify the store belongs to the caller's organization.
//   2. Exchange the new credentials for a fresh access token.
//   3. Fetch shop info (id, name, currency, etc) from the NEW shop.
//   4. Update the existing row in place. Move the OLD shop_domain
//      into shop_domain_aliases so any in-flight webhooks from the
//      old shop don't return 410.
//   5. Stale webhook subscriptions on the old shop are intentionally
//      NOT cleaned up here (we lack credentials for the old shop now).
//      They naturally stop reaching us once the merchant disconnects
//      our app from the old shop in Shopify Admin, or after the
//      access token expires.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAccessTokenViaClientCredentials } from '@/lib/shopify/client-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { storeId, newDomain, clientId, clientSecret } = body || {};

    if (!storeId || !newDomain || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'storeId, newDomain, clientId e clientSecret são obrigatórios' },
        { status: 400 }
      );
    }

    const cleanDomain = String(newDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain.endsWith('.myshopify.com')) {
      return NextResponse.json(
        { error: 'Domínio inválido. Use o formato <loja>.myshopify.com' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: store, error: storeErr } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_domain_aliases, organization_id, connection_type')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    // Block accidental re-pointing at a Shopify already managed by
    // ANOTHER row in the same org — that would create dual-owner
    // conflicts. The merchant should merge those rows instead.
    if (cleanDomain !== store.shop_domain) {
      const { data: collision } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, is_active')
        .eq('organization_id', organizationId)
        .neq('id', storeId)
        .or(`shop_domain.eq.${cleanDomain},shop_domain_aliases.cs.{${cleanDomain}}`)
        .maybeSingle();
      if (collision && collision.is_active) {
        return NextResponse.json(
          {
            error: `Outra loja ativa nesta organização já usa ${cleanDomain}. Mescle ou exclua a duplicada antes de trocar.`,
            collidingStoreId: collision.id,
          },
          { status: 409 }
        );
      }
    }

    // Exchange new credentials for a fresh token. If this fails the
    // merchant typed something wrong — return now without touching
    // the row.
    const cleanClientId = String(clientId).trim();
    const cleanClientSecret = String(clientSecret).trim();
    let tokenResult;
    try {
      tokenResult = await getAccessTokenViaClientCredentials(
        cleanDomain,
        cleanClientId,
        cleanClientSecret
      );
    } catch (error: any) {
      return NextResponse.json({ error: error.message || 'Falha ao validar credenciais' }, { status: 401 });
    }

    const accessToken = tokenResult.access_token;
    const expiresIn = tokenResult.expires_in;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const scopesList = tokenResult.scope
      ? tokenResult.scope.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean)
      : [];

    // Fetch shop info from the NEW shop so we can update name, currency,
    // shop_id etc on the row.
    let shopName: string | null = null;
    let shopEmail: string | null = null;
    let currency: string | null = null;
    let planName: string | null = null;
    let permanentDomain: string | null = null;
    let shopifyShopId: string | null = null;

    try {
      const shopInfoRes = await fetch(
        `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `{ shop { id name email currencyCode myshopifyDomain plan { displayName } } }`,
          }),
        }
      );
      if (shopInfoRes.ok) {
        const shopInfo = await shopInfoRes.json();
        const s = shopInfo.data?.shop;
        if (s) {
          shopName = s.name || null;
          shopEmail = s.email || null;
          currency = s.currencyCode || null;
          planName = s.plan?.displayName || null;
          permanentDomain = (s.myshopifyDomain || '').toLowerCase() || null;
          if (s.id) {
            const m = String(s.id).match(/Shop\/(\d+)/);
            shopifyShopId = m ? m[1] : String(s.id);
          }
        }
      }
    } catch { /* best-effort — domain swap proceeds with what we have */ }

    // Resolve canonical domain. If GraphQL reports a different
    // myshopifyDomain than what the merchant typed, prefer the canonical
    // as primary — that's what Shopify uses in webhook X-Shopify-Shop-Domain
    // headers, so primary-as-canonical means O(1) webhook lookup.
    // Merchant-typed and the previous primary ride along as aliases for
    // back-compat.
    const primaryDomain = (permanentDomain && permanentDomain !== cleanDomain)
      ? permanentDomain
      : cleanDomain;

    const existingAliases: string[] = Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [];
    const aliases = new Set(existingAliases.map((a) => String(a).toLowerCase()));
    if (store.shop_domain && store.shop_domain !== primaryDomain) {
      aliases.add(String(store.shop_domain).toLowerCase());
    }
    // Merchant-typed domain rides as alias so old pixel/script_tags
    // pointing at it keep resolving.
    if (cleanDomain !== primaryDomain) {
      aliases.add(cleanDomain);
    }
    aliases.delete(primaryDomain); // primary doesn't go in aliases

    // Free up the canonical primaryDomain if any OTHER row is currently
    // sitting on it. Common case: merchant excluded the previously-active
    // row (Based - lojalaclode) leaving it is_active=false but still
    // holding shop_domain=lojalaclode. Then they reactivate Based - sourosa,
    // which canonicalizes to lojalaclode, and the unique constraint
    // idx_shopify_domain blocks the UPDATE.
    //
    // We renombre the colliding inactive row's domain to a placeholder
    // so the canonical is free for the row being reactivated. The
    // colliding row stays in DB (data preserved, audit trail intact)
    // but won't resolve any webhook because its domain is now bogus
    // and is_active=false anyway.
    {
      const { data: blockers } = await supabase
        .from('shopify_stores')
        .select('id, shop_domain, is_active')
        .eq('organization_id', organizationId)
        .neq('id', storeId)
        .eq('shop_domain', primaryDomain);
      for (const b of (blockers || []) as any[]) {
        if (b.is_active) {
          // Active conflict — refuse (user must merge first)
          return NextResponse.json({
            error: `Outra loja ATIVA já usa ${primaryDomain}. Mescle ou exclua antes de prosseguir.`,
            collidingStoreId: b.id,
          }, { status: 409 });
        }
        // Inactive — free the domain by renaming to a placeholder
        const placeholder = `archived-${b.id}.worder.local`;
        await supabase
          .from('shopify_stores')
          .update({ shop_domain: placeholder, updated_at: new Date().toISOString() })
          .eq('id', b.id);
      }
    }

    const updates: Record<string, any> = {
      shop_domain: primaryDomain,
      shop_domain_aliases: Array.from(aliases),
      access_token: accessToken,
      client_id: cleanClientId,
      api_secret: cleanClientSecret,
      webhook_secret: cleanClientSecret,
      token_expires_at: tokenExpiresAt,
      scopes: scopesList,
      connection_type: 'manual',
      connection_status: 'active',
      status: 'active',
      is_active: true,
      // After swap the new Shopify has none of our webhooks/pixels yet.
      // Clearing these flags surfaces the install-extras step in the UI.
      pixel_installed: false,
      embed_installed: false,
      initial_sync_completed: false,
      api_version: SHOPIFY_API_VERSION,
      updated_at: new Date().toISOString(),
    };
    if (shopName) updates.shop_name = shopName;
    if (shopEmail) updates.shop_email = shopEmail;
    if (currency) updates.currency = currency;
    if (planName) updates.plan_name = planName;
    if (shopifyShopId) updates.shopify_shop_id = shopifyShopId;

    // Resilient update: if the DB schema is missing the recent
    // shopify_shop_id / shop_domain_aliases columns (migration not yet
    // applied), drop those fields and retry. Without this the swap
    // would fail with PGRST204 even though the merchant's credentials
    // are valid.
    function isMissingColumnError(err: any, col: string): boolean {
      if (!err) return false;
      const code = err.code || '';
      const msg = String(err.message || '');
      if (code === 'PGRST204' || code === '42703') return msg.includes(col);
      return msg.includes(col) && (msg.includes('column') || msg.includes('schema cache'));
    }
    let attempt: Record<string, any> = { ...updates };
    let updErr: any = null;
    for (const col of ['', 'shopify_shop_id', 'shop_domain_aliases']) {
      if (col && col in attempt) {
        const { [col]: _, ...rest } = attempt;
        attempt = rest;
      }
      const { error } = await supabase.from('shopify_stores').update(attempt).eq('id', storeId);
      if (!error) { updErr = null; break; }
      updErr = error;
      // If error doesn't mention a known fallback column, give up.
      const next = ['shopify_shop_id', 'shop_domain_aliases'].find(c => isMissingColumnError(error, c) && c in attempt);
      if (!next) break;
      const { [next]: _, ...rest } = attempt;
      attempt = rest;
    }
    if (updErr) {
      return NextResponse.json(
        { error: `Falha ao salvar: ${updErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      // Surface BOTH so the UI can explain "you typed X but the
      // canonical is Y — we registered Y as primary".
      domainSwap: cleanDomain !== primaryDomain ? {
        merchant_typed: cleanDomain,
        canonical: primaryDomain,
        explanation: `Você digitou ${cleanDomain} mas o domínio canônico (interno permanente) da Shopify é ${primaryDomain}. Salvamos ${primaryDomain} como principal e ${cleanDomain} como alias — webhooks chegam mais rápido e nada quebra.`,
      } : null,
      store: {
        id: storeId,
        shop_domain: primaryDomain,
        shop_name: shopName,
        currency,
        shopify_shop_id: shopifyShopId,
        aliases: Array.from(aliases),
      },
      needs_reinstall: true,
      next_steps: [
        'Rode "Reinstalar tudo" em /integrations/shopify/tracking-debug pra registrar webhooks no novo Shopify',
        'Cole o Custom Pixel snippet em Shopify Admin → Customer Events da nova loja',
      ],
      token: {
        obtained: true,
        expiresIn,
        expiresAt: tokenExpiresAt,
      },
      scopes: scopesList,
    });
  } catch (err: any) {
    console.error('[Shopify Swap Backend] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao trocar Shopify' },
      { status: 500 }
    );
  }
}
