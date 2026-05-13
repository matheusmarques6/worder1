// POST /api/shopify/sync-now — trigger sync with GraphQL
// REWRITE: Simplified with detailed logging at every step
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL, shopifyGraphQLPaginate, extractShopifyId } from '@/lib/shopify/graphql-client';
import { PRODUCTS_QUERY, CUSTOMERS_QUERY, ORDERS_QUERY } from '@/lib/shopify/graphql-queries';
import { ensureFreshToken } from '@/lib/shopify/ensure-fresh-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const supabase = getSupabaseAdmin();
    const userId = auth.user.id;
    const userOrgId = auth.user.organization_id;

    console.log(`[Sync] Starting. userId=${userId}, orgId=${userOrgId}`);

    // Multi-org lookup
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    const orgIds = [...new Set([userOrgId, ...(memberships?.map((m: any) => m.organization_id) || [])])];
    console.log(`[Sync] Orgs: ${orgIds.join(', ')}`);

    let body: any = {};
    try { body = await request.json(); } catch {}
    const syncType = body.syncType || 'all';
    // historical=true ignores the 90-day window when fetching orders.
    // Default sync stays at 90 days because that covers the cases that
    // matter for marketing (recent activity, abandoned carts), but a
    // merchant who's just connected the store needs the full backlog
    // — without this flag we capped the Dr. Melaxin sync at 360 of 627
    // orders. The full-sync endpoint and the "Sincronizar tudo" button
    // both flip this to true.
    // since: optional explicit cutoff ('YYYY-MM-DD'). Overrides historical
    // when provided so a merchant can run incremental top-ups.
    const historical: boolean = body.historical === true || body.full === true;
    const since: string | null = typeof body.since === 'string' ? body.since : null;

    // Find store — try ALL active stores, not just user's orgs
    let { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: any active store
    if (!store) {
      const { data: anyStore } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('is_active', true)
        .order('installed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      store = anyStore;
    }

    if (!store) {
      console.error('[Sync] No store found');
      return NextResponse.json({ error: 'Nenhuma loja encontrada' }, { status: 404 });
    }

    if (!store.access_token) {
      console.error(`[Sync] Store ${store.shop_domain} has no access_token`);
      return NextResponse.json({ error: 'Token de acesso não encontrado' }, { status: 400 });
    }

    // Always refresh the token at the start of a user-triggered sync for
    // manual stores — see ensureFreshToken docs for why (reinstall on
    // Shopify revokes the saved token immediately).
    const refreshed = await ensureFreshToken(store);
    if (!refreshed.ok) {
      console.error(`[Sync] Token refresh failed:`, refreshed.error);
      return NextResponse.json({
        error: 'Não foi possível gerar token de acesso. Verifique se o app está instalado na loja e se as credenciais estão corretas.',
        details: refreshed.error,
      }, { status: 401 });
    }
    store = refreshed.store;

    console.log(`[Sync] Store: ${store.shop_name} (${store.shop_domain}), syncType=${syncType}, type=${store.connection_type || 'oauth'}`);

    const storeConfig = {
      id: store.id,
      organization_id: store.organization_id,
      shop_domain: store.shop_domain,
      access_token: store.access_token,
    };

    const results: any = { products: 0, customers: 0, orders: 0, errors: [] };

    // ========== SYNC PRODUCTS ==========
    if (syncType === 'all' || syncType === 'products') {
      try {
        console.log(`[Sync] Fetching products from Shopify...`);
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, PRODUCTS_QUERY,
          { sortKey: 'UPDATED_AT' },
          'products',
          { first: 250, maxPages: 100 }
        );
        console.log(`[Sync] Fetched ${nodes.length} products from Shopify`);

        for (let i = 0; i < nodes.length; i += 50) {
          const batch = nodes.slice(i, i + 50);
          const products = batch.map((p: any) => {
            const variants = (p.variants?.nodes || []).map((v: any) => ({
              id: v.id ? extractShopifyId(v.id) : null,
              title: v.title, sku: v.sku, price: v.price,
              compare_at_price: v.compareAtPrice,
              inventory_quantity: v.inventoryQuantity,
            }));
            return {
              store_id: store.id,
              organization_id: store.organization_id,
              shopify_product_id: extractShopifyId(p.id),
              title: p.title,
              handle: p.handle,
              vendor: p.vendor,
              product_type: p.productType,
              status: (p.status || 'ACTIVE').toLowerCase(),
              tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
              price: parseFloat(variants[0]?.price || '0'),
              compare_at_price: variants[0]?.compare_at_price ? parseFloat(variants[0].compare_at_price) : null,
              sku: variants[0]?.sku || null,
              inventory_quantity: p.totalInventory || 0,
              variants,
              images: (p.images?.nodes || []).map((img: any) => ({ url: img.url, alt: img.altText })),
              updated_at: new Date().toISOString(),
            };
          });

          const { error } = await supabase
            .from('shopify_products')
            .upsert(products, { onConflict: 'store_id,shopify_product_id' });

          if (error) {
            console.error(`[Sync] Product upsert error:`, error.message, error.code, error.details);
            results.errors.push(`Products: ${error.message}`);
          } else {
            console.log(`[Sync] Upserted ${products.length} products`);
          }
          results.products += batch.length;
        }
      } catch (err: any) {
        console.error(`[Sync] Products error:`, err.message);
        results.errors.push(`Products: ${err.message}`);
      }
    }

    // ========== SYNC CUSTOMERS ==========
    if (syncType === 'all' || syncType === 'customers') {
      try {
        console.log(`[Sync] Fetching customers from Shopify...`);
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, CUSTOMERS_QUERY,
          { sortKey: 'UPDATED_AT' },
          'customers',
          { first: 250, maxPages: 100 }
        );
        console.log(`[Sync] Fetched ${nodes.length} customers from Shopify`);

        // Get all existing emails in batches (Supabase IN limit ~1000)
        const allEmails = nodes.filter((c: any) => c.email).map((c: any) => c.email.toLowerCase());
        const existingEmailMap = new Map<string, string>();

        for (let i = 0; i < allEmails.length; i += 500) {
          const batch = allEmails.slice(i, i + 500);
          const { data: existingContacts } = await supabase
            .from('contacts')
            .select('id, email')
            .in('email', batch);
          (existingContacts || []).forEach((c: any) => {
            if (c.email) existingEmailMap.set(c.email.toLowerCase(), c.id);
          });
        }

        // Split into new vs existing
        const toInsert: any[] = [];
        const toUpdate: any[] = [];

        for (const c of nodes) {
          if (!c.email) continue;
          const email = c.email.toLowerCase();
          const shopifyId = extractShopifyId(c.id);
          const totalOrders = parseInt(c.numberOfOrders || '0');
          const totalSpent = parseFloat(c.amountSpent?.amount || '0');

          // Calculate lifecycle stage
          let lifecycleStage = 'subscriber';
          if (totalOrders >= 5) lifecycleStage = 'vip';
          else if (totalOrders >= 2) lifecycleStage = 'repeat_customer';
          else if (totalOrders >= 1) lifecycleStage = 'customer';

          const data = {
            organization_id: store.organization_id,
            store_id: store.id,
            email,
            phone: c.phone || null,
            first_name: c.firstName || null,
            last_name: c.lastName || null,
            source: 'shopify',
            shopify_customer_id: shopifyId,
            total_orders: totalOrders,
            total_spent: totalSpent,
            average_order_value: totalOrders > 0 ? totalSpent / totalOrders : 0,
            tags: Array.isArray(c.tags) ? c.tags : [],
            lifecycle_stage: lifecycleStage,
            last_active_at: c.updatedAt || new Date().toISOString(),
            email_consent: c.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
            sms_consent: c.smsMarketingConsent?.marketingState === 'SUBSCRIBED',
            updated_at: new Date().toISOString(),
          };

          const existingId = existingEmailMap.get(email);
          if (existingId) {
            toUpdate.push({ id: existingId, ...data });
          } else if (!toInsert.some(c => c.email === email)) {
            // Dedup: skip if email already in toInsert batch
            toInsert.push({ ...data, created_at: new Date().toISOString() });
          }
        }

        // Batch insert new contacts (100 at a time, fallback to individual on error)
        for (let i = 0; i < toInsert.length; i += 100) {
          const batch = toInsert.slice(i, i + 100);
          const { error } = await supabase.from('contacts').insert(batch);
          if (error) {
            // Batch failed — insert one by one to skip duplicates
            console.warn(`[Sync] Batch insert failed (${i}), falling back to individual: ${error.message}`);
            for (const c of batch) {
              const { error: individualErr } = await supabase.from('contacts').insert(c);
              if (individualErr && individualErr.code !== '23505') {
                console.error(`[Sync] Individual insert failed for ${c.email}: ${individualErr.message}`);
              }
            }
          }
        }

        // Batch update existing contacts (one by one is fine, they're fewer)
        for (const contact of toUpdate) {
          const { id, ...data } = contact;
          await supabase.from('contacts').update(data).eq('id', id);
        }

        // Retroactively link anonymous pixel events to newly created/updated contacts.
        // Same pattern as /api/track/event — matches on email or anonymous_id where contact_id IS NULL.
        const allContactEmails = [...toInsert.map(c => c.email), ...toUpdate.map(c => c.email)].filter(Boolean);
        if (allContactEmails.length > 0) {
          // Fetch IDs for all synced contacts in batches
          const contactIdMap = new Map<string, string>();
          for (let i = 0; i < allContactEmails.length; i += 500) {
            const emailBatch = allContactEmails.slice(i, i + 500);
            const { data: contacts } = await supabase
              .from('contacts')
              .select('id, email')
              .in('email', emailBatch);
            (contacts || []).forEach((c: any) => {
              if (c.email) contactIdMap.set(c.email.toLowerCase(), c.id);
            });
          }

          // Link orphan contact_events by email (fire-and-forget, same pattern as /api/track/event)
          let linkedEmails = 0;
          for (const [email, contactId] of contactIdMap) {
            supabase
              .from('contact_events')
              .update({ contact_id: contactId })
              .is('contact_id', null)
              .eq('store_id', store.id)
              .ilike('properties->>_email', email)
              .then(() => {}, () => {});

            supabase
              .from('contact_events')
              .update({ contact_id: contactId })
              .is('contact_id', null)
              .eq('store_id', store.id)
              .ilike('properties->>email', email)
              .then(() => {}, () => {});

            linkedEmails++;
          }
          if (linkedEmails > 0) {
            console.log(`[Sync] Retroactively linking anonymous events for ${linkedEmails} contacts`);
          }
        }

        results.customers = toInsert.length + toUpdate.length;
        console.log(`[Sync] Contacts: ${toInsert.length} inserted, ${toUpdate.length} updated`);
      } catch (err: any) {
        console.error(`[Sync] Customers error:`, err.message);
        results.errors.push(`Customers: ${err.message}`);
      }
    }

    // ========== SYNC ORDERS ==========
    if (syncType === 'all' || syncType === 'orders') {
      try {
        // Order-fetch window. `since` wins (manual cutoff), then
        // historical=true (no date filter — full backlog), then the
        // default of last 90 days.
        let orderQuery: string | undefined
        if (since && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
          orderQuery = `created_at:>=${since}`
        } else if (!historical) {
          const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          orderQuery = `created_at:>=${sinceDate.toISOString().split('T')[0]}`
        }
        console.log(`[Sync] Fetching orders ${orderQuery ? `with filter: ${orderQuery}` : '(full historical backlog)'}...`)
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, ORDERS_QUERY,
          orderQuery
            ? { query: orderQuery, sortKey: 'CREATED_AT' }
            : { sortKey: 'CREATED_AT' },
          'orders',
          { first: 250, maxPages: 200 }
        );
        console.log(`[Sync] Fetched ${nodes.length} orders from Shopify`);

        for (const order of nodes) {
          const orderId = extractShopifyId(order.id);
          const orderValue = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
          const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'BRL';
          const lineItems = (order.lineItems?.nodes || []).map((li: any) => ({
            title: li.title, quantity: li.quantity, price: li.originalUnitPriceSet?.shopMoney?.amount,
            sku: li.sku, product_id: li.product?.id ? extractShopifyId(li.product.id) : null,
          }));

          // Insert or update order
          const { data: existingOrder } = await supabase
            .from('shopify_orders')
            .select('id')
            .eq('store_id', store.id)
            .eq('shopify_order_id', orderId)
            .maybeSingle();

          const orderData = {
            store_id: store.id,
            organization_id: store.organization_id,
            shopify_order_id: orderId,
            shopify_order_number: order.name?.replace('#', '') || orderId,
            name: order.name,
            email: order.email,
            phone: order.phone,
            total_price: orderValue,
            currency,
            financial_status: (order.displayFinancialStatus || 'pending').toLowerCase(),
            fulfillment_status: order.displayFulfillmentStatus?.toLowerCase() || null,
            line_items: lineItems,
            updated_at: new Date().toISOString(),
          };

          if (existingOrder) {
            await supabase.from('shopify_orders').update(orderData).eq('id', existingOrder.id);
          } else {
            await supabase.from('shopify_orders').insert(orderData);
          }

          // Create/update contact from order email
          if (order.email) {
            const { data: existingContact } = await supabase
              .from('contacts')
              .select('id')
              .eq('email', order.email.toLowerCase())
              .limit(1)
              .maybeSingle();

            let resolvedContactId: string | null = null;

            if (existingContact) {
              resolvedContactId = existingContact.id;
              await supabase.from('contacts').update({
                store_id: store.id,
                phone: order.phone || order.customer?.phone || null,
                shopify_customer_id: order.customer?.id ? extractShopifyId(order.customer.id) : null,
                updated_at: new Date().toISOString(),
              }).eq('id', existingContact.id);
            } else {
              const { data: newContact } = await supabase.from('contacts').insert({
                organization_id: store.organization_id,
                store_id: store.id,
                email: order.email.toLowerCase(),
                first_name: order.customer?.firstName || null,
                last_name: order.customer?.lastName || null,
                phone: order.phone || order.customer?.phone || null,
                source: 'shopify',
                shopify_customer_id: order.customer?.id ? extractShopifyId(order.customer.id) : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).select('id').maybeSingle();
              resolvedContactId = newContact?.id || null;
            }

            // Retroactively link anonymous pixel events to this contact (same pattern as /api/track/event)
            if (resolvedContactId) {
              const emailLower = order.email.toLowerCase();
              supabase.from('contact_events')
                .update({ contact_id: resolvedContactId })
                .is('contact_id', null)
                .eq('store_id', store.id)
                .ilike('properties->>email', emailLower)
                .then(() => {}, () => {});
              supabase.from('contact_events')
                .update({ contact_id: resolvedContactId })
                .is('contact_id', null)
                .eq('store_id', store.id)
                .ilike('properties->>_email', emailLower)
                .then(() => {}, () => {});
            }
          }

          results.orders++;
        }
        console.log(`[Sync] Upserted ${results.orders} orders`);
      } catch (err: any) {
        console.error(`[Sync] Orders error:`, err.message);
        results.errors.push(`Orders: ${err.message}`);
      }
    }

    // Update store stats. Mark the initial sync done and pin the api_version
    // so old stores (e.g. created on 2024-10) automatically migrate to 2026-04
    // the first time they run a successful sync. install-extras also does this
    // — both endpoints converge on the same final state.
    const syncOk = results.errors.length === 0;
    const storeUpdate: Record<string, any> = {
      last_sync_at: new Date().toISOString(),
      total_orders: results.orders,
      total_customers: results.customers,
    };
    if (syncOk) {
      storeUpdate.initial_sync_completed = true;
      storeUpdate.api_version = '2026-04';
    }
    await supabase.from('shopify_stores').update(storeUpdate).eq('id', store.id);

    console.log(`[Sync] DONE: ${results.products} products, ${results.customers} customers, ${results.orders} orders, ${results.errors.length} errors`);

    return NextResponse.json({
      success: results.errors.length === 0,
      data: results,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Sync] Fatal error:', error.message, error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
