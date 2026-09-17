// =============================================================
// Produtos da loja (espelho local de shopify_products)
//
//   GET   — lista da loja selecionada, com disponibilidade e a marca
//           "oculto dos feeds"; devolve também os domínios para os
//           links "ver na loja" / "editar na Shopify".
//   POST  — cria o produto NA SHOPIFY (fonte da verdade) e grava a
//           linha local. Preço/estoque/publicação passam a ser
//           mantidos pela sincronização e pelos webhooks.
//   PATCH — decisão só da Worder: ocultar/mostrar o produto em todos
//           os feeds dinâmicos de e-mail.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { publicStoreHost } from '@/lib/shopify/store-url';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Permissões do app da Shopify que "Novo produto" usa, por etapa. */
const PRODUCT_WRITE_SCOPES = {
  required: ['write_products'],
  inventory: ['read_locations', 'write_inventory'],
  publish: ['read_publications', 'write_publications'],
};

async function orgIdsFor(supabase: any, user: { id: string; organization_id: string }): Promise<string[]> {
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);
  return [...new Set([user.organization_id, ...((memberships || []).map((m: any) => m.organization_id))])];
}

function adminSlug(shopDomain: string | null | undefined): string | null {
  const d = String(shopDomain || '').toLowerCase();
  const m = d.match(/^([a-z0-9-]+)\.myshopify\.com$/);
  return m ? m[1] : null;
}

function formatProduct(p: any) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const firstVariant = variants[0] || {};
  const sku = p.sku || firstVariant.sku || null;

  // Soma do estoque das variantes controladas. -1 e null = não controla.
  let invSum = 0;
  let invTracked = false;
  for (const v of variants) {
    const q = v?.inventory_quantity;
    if (q === null || q === undefined || q === -1 || q === '-1') continue;
    if (v?.tracked === false || v?.inventory_management === null) continue;
    const n = typeof q === 'number' ? q : parseInt(String(q), 10);
    if (Number.isFinite(n)) { invSum += n; invTracked = true; }
  }
  const totalInventory = invTracked
    ? invSum
    : (typeof p.inventory_quantity === 'number' && p.inventory_quantity > 0 ? p.inventory_quantity : null);

  return {
    id: p.id,
    shopifyProductId: p.shopify_product_id,
    title: p.title,
    handle: p.handle,
    vendor: p.vendor,
    productType: p.product_type || null,
    status: p.status,
    price: Number(p.price ?? firstVariant.price ?? 0),
    compareAtPrice: p.compare_at_price ? Number(p.compare_at_price) : (firstVariant.compare_at_price ? Number(firstVariant.compare_at_price) : null),
    sku,
    totalInventory,
    // null = a Shopify ainda não informou (linha antiga); a tela mostra
    // "—" em vez de fingir que sabe.
    available: typeof p.available === 'boolean' ? p.available : null,
    hiddenFromFeeds: p.hidden_from_feeds === true,
    tags: p.tags || '',
    variants,
    images: p.images || [],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const supabase = getSupabaseAdmin();
    const orgIds = await orgIdsFor(supabase, user);

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    // The requested store, or the ONLY active store of the user's
    // organizations. Never "the newest" — with two stores that listed
    // the wrong catalog.
    const { pickStore } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<any>(supabase, {
      orgIds, storeId, select: 'id, shop_domain, primary_domain, currency, scopes',
    });

    if (!picked.store) {
      return NextResponse.json({ products: [], total: 0, reason: picked.reason });
    }

    const store = picked.store;

    const { data: products, error, count } = await supabase
      .from('shopify_products')
      .select('*', { count: 'exact' })
      .eq('store_id', store.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const scopes: string[] = Array.isArray(store.scopes) ? store.scopes.map((s: any) => String(s).toLowerCase()) : [];
    const missingScopes = PRODUCT_WRITE_SCOPES.required.filter((s) => !scopes.includes(s));

    return NextResponse.json({
      products: (products || []).map(formatProduct),
      total: count ?? (products || []).length,
      storeId: store.id,
      currency: (store.currency || 'USD').toUpperCase(),
      // Para os links da tela: vitrine pública e admin da Shopify.
      publicDomain: publicStoreHost(store) || null,
      adminSlug: adminSlug(store.shop_domain),
      // A tela avisa ANTES do clique quando o app não pode criar produtos.
      // A lista de scopes gravada pode estar defasada; o POST confere de
      // fato na Shopify e devolve o erro certo se ainda faltar.
      canCreate: scopes.length === 0 || missingScopes.length === 0,
      missingScopes,
    });
  } catch (error: any) {
    console.error('[Products Shopify GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const supabase = getSupabaseAdmin();
    const orgIds = await orgIdsFor(supabase, user);
    const body = await request.json().catch(() => ({}));

    const title = String(body.title || '').trim();
    const price = Number(body.price);
    if (!title) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'Preço inválido' }, { status: 400 });

    const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<any>(supabase, { orgIds, storeId: body.storeId || body.store_id || null, select: '*' });
    if (!picked.store) {
      const err = pickStoreError(picked.reason);
      return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
    }
    let store = picked.store;
    if (store.is_active === false) {
      return NextResponse.json({ error: 'Loja desconectada. Reconecte a Shopify para criar produtos.' }, { status: 409 });
    }
    if (!store.access_token || store.access_token === 'manual') {
      return NextResponse.json({ error: 'A loja ainda não tem integração com a Shopify.' }, { status: 409 });
    }

    const { ensureFreshToken } = await import('@/lib/shopify/ensure-fresh-token');
    const refreshed = await ensureFreshToken(store);
    if (!refreshed.ok) return NextResponse.json({ error: refreshed.error }, { status: 401 });
    store = refreshed.store;

    const { createProductInShopify, ShopifyScopeError, ShopifyUserError } = await import('@/lib/shopify/products-admin');

    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
      : String(body.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const imageUrls: string[] = Array.isArray(body.imageUrls) ? body.imageUrls.map((u: any) => String(u)).filter(Boolean) : [];

    let created;
    try {
      created = await createProductInShopify(
        { id: store.id, organization_id: store.organization_id, shop_domain: store.shop_domain, access_token: store.access_token },
        {
          title,
          descriptionHtml: body.descriptionHtml ? String(body.descriptionHtml) : (body.description ? `<p>${String(body.description).replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>` : null),
          price,
          compareAtPrice: body.compareAtPrice != null && body.compareAtPrice !== '' ? Number(body.compareAtPrice) : null,
          sku: body.sku ? String(body.sku).trim() : null,
          trackInventory: body.trackInventory === true,
          quantity: body.quantity != null && body.quantity !== '' ? Number(body.quantity) : null,
          status: body.status === 'draft' ? 'draft' : 'active',
          vendor: body.vendor ? String(body.vendor).trim() : null,
          productType: body.productType ? String(body.productType).trim() : null,
          tags,
          imageUrls,
          publish: body.publish !== false,
        }
      );
    } catch (err: any) {
      if (err instanceof ShopifyScopeError) {
        return NextResponse.json({
          error: err.message,
          code: 'missing_scope',
          scope: err.scope,
          hint: 'Na Shopify: Apps → Desenvolver apps → seu app → Configuração → Escopos da Admin API. Adicione write_products (e, se quiser estoque e publicação automáticos, write_inventory, read_locations, read_publications e write_publications), salve e reinstale o app. A Worder renova o token sozinha.',
        }, { status: 403 });
      }
      if (err instanceof ShopifyUserError) {
        return NextResponse.json({ error: err.message, code: 'shopify_validation', userErrors: err.userErrors }, { status: 422 });
      }
      console.error('[Products Shopify POST] Shopify error:', err);
      return NextResponse.json({ error: err?.message || 'Falha ao criar produto na Shopify' }, { status: 502 });
    }

    // Grava a linha local. hidden_from_feeds nasce false; a partir daqui
    // sync e webhooks mantêm preço, estoque e disponibilidade.
    const row = {
      ...created.row,
      store_id: store.id,
      organization_id: store.organization_id,
      hidden_from_feeds: false,
    };
    // Colunas que podem não existir em esquemas antigos são retiradas
    // uma a uma se o banco reclamar.
    let attempt: Record<string, any> = { ...row };
    let saved: any = null;
    let saveError: any = null;
    for (let i = 0; i < 4; i++) {
      const { data, error } = await supabase
        .from('shopify_products')
        .upsert(attempt, { onConflict: 'store_id,shopify_product_id' })
        .select('*')
        .maybeSingle();
      if (!error) { saved = data; saveError = null; break; }
      saveError = error;
      const missing = ['body_html', 'description', 'published_at', 'available'].find(
        (c) => c in attempt && String(error.message || '').includes(c)
      );
      if (!missing) break;
      const { [missing]: _omit, ...rest } = attempt;
      attempt = rest;
    }
    if (saveError) {
      console.error('[Products Shopify POST] local upsert failed:', saveError);
      // O produto EXISTE na Shopify; a próxima sync traz a linha.
      return NextResponse.json({
        success: true,
        product: null,
        shopifyProductId: created.shopifyProductId,
        warnings: [...created.warnings, 'Criado na Shopify, mas ainda não apareceu aqui: rode "Sync Produtos".'],
      }, { status: 201 });
    }

    return NextResponse.json({
      success: true,
      product: saved ? formatProduct(saved) : null,
      shopifyProductId: created.shopifyProductId,
      warnings: created.warnings,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[Products Shopify POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const supabase = getSupabaseAdmin();
    const orgIds = await orgIdsFor(supabase, user);
    const body = await request.json().catch(() => ({}));

    const productId = String(body.productId || body.id || '');
    if (!UUID_RE.test(productId)) return NextResponse.json({ error: 'productId inválido' }, { status: 400 });
    if (typeof body.hiddenFromFeeds !== 'boolean') {
      return NextResponse.json({ error: 'hiddenFromFeeds (true/false) é obrigatório' }, { status: 400 });
    }

    const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<{ id: string }>(supabase, { orgIds, storeId: body.storeId || body.store_id || null, select: 'id' });
    if (!picked.store) {
      const err = pickStoreError(picked.reason);
      return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
    }

    // A loja na cláusula é a cerca: um produto de outra loja não muda.
    const { data, error } = await supabase
      .from('shopify_products')
      .update({ hidden_from_feeds: body.hiddenFromFeeds })
      .eq('id', productId)
      .eq('store_id', picked.store.id)
      .select('*')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Produto não encontrado nesta loja' }, { status: 404 });

    return NextResponse.json({ success: true, product: formatProduct(data) });
  } catch (error: any) {
    console.error('[Products Shopify PATCH] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
