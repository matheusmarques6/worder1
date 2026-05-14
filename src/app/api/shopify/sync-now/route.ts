// POST /api/shopify/sync-now — trigger sync with GraphQL
//
// Always delegates to runFullSyncGraphQL (background path via QStash
// when configured, inline otherwise) so every sync gets the same
// cursor-checkpoint + adaptive throttle behavior. The previous inline
// path used shopifyGraphQLPaginate directly with no checkpoint, which
// stranded Dr. Melaxin's Shopify sync at 365 of 627 orders when the
// Vercel function timed out mid-pagination — restarting the sync just
// re-fetched the same 365.
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ensureFreshToken } from '@/lib/shopify/ensure-fresh-token';
import { enqueueShopifySync, isQStashConfigured } from '@/lib/queue';

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
    // Critical: honor the storeId the merchant clicked on. The previous
    // version of this handler ignored body.storeId / body.store_id
    // entirely and always picked the "most-recently-installed store in
    // the org". On a multi-store org (Dr. Melaxin + Based), the
    // merchant clicked "Sincronizar tudo" on Dr. Melaxin and the
    // handler ran a sync on Based — Dr. Melaxin's order count stayed
    // pegged at 365 forever no matter how many times they clicked.
    // Accept both casings so older callers (integrations page used
    // store_id, dashboard used storeId) keep working.
    const requestedStoreId: string | null = body.storeId || body.store_id || null;
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

    // Find store — prefer the explicit one the merchant clicked.
    let storeQuery = supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .eq('is_active', true);

    if (requestedStoreId) {
      storeQuery = storeQuery.eq('id', requestedStoreId);
    } else {
      storeQuery = storeQuery.order('installed_at', { ascending: false }).limit(1);
    }

    let { data: store } = await storeQuery.maybeSingle();

    // Fallback: any active store. Only triggers when NO storeId was
    // passed AND the org scope returned nothing (extremely rare —
    // typically a stale auth session pointing at a deleted org).
    if (!store && !requestedStoreId) {
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

    // Background mode (default): create a job row, push to QStash, and
    // return the jobId immediately. The /api/workers/shopify-sync worker
    // picks it up, walks the GraphQL connection with checkpointing,
    // chains continuations as needed. UI polls /api/shopify/jobs/[id].
    // Falls back to inline execution if QStash is not configured or the
    // caller passes background=false (legacy path).
    const wantBackground = body.background !== false && isQStashConfigured();
    if (wantBackground) {
      const { data: job, error: jobErr } = await supabase
        .from('shopify_import_jobs')
        .insert({
          store_id: store.id,
          organization_id: store.organization_id,
          status: 'pending',
          config: {
            sync_type: historical ? 'orders_historical' : `orders_${syncType}`,
            historical,
            since,
          },
          started_at: new Date().toISOString(),
          processed_count: 0,
        })
        .select('id')
        .single();
      if (jobErr || !job) {
        console.error('[Sync] Failed to create job row:', jobErr);
        // Fall through to inline as a safety net.
      } else {
        await enqueueShopifySync(job.id, store.id, syncType as any, {
          historical,
        });
        return NextResponse.json({
          ok: true,
          mode: 'background',
          jobId: job.id,
          storeId: store.id,
          message: 'Sync started. Poll /api/shopify/jobs/{jobId} for progress.',
        });
      }
    }

    // Inline path. The previous version paginated GraphQL directly with
    // shopifyGraphQLPaginate and no cursor persistence — when Vercel
    // killed the function past 300s mid-pagination, the next click
    // started over from cursor=null AND lost everything beyond the
    // first batch. That's why Dr. Melaxin's sync stuck at 365 of 627
    // orders (Shopify returned ~1.5 pages of recent orders, the
    // function timed out, the next sync repeated the same 365).
    //
    // Now we route inline syncs through runFullSyncGraphQL — it owns
    // cursor checkpointing on shopify_import_jobs, so an interrupted
    // sync resumes from last_cursor on the next call. Same engine the
    // QStash worker uses, just without the queue wrapper.
    {
      const { runFullSyncGraphQL } = await import('@/lib/services/shopify/full-sync-graphql');
      try {
        const result = await runFullSyncGraphQL(
          {
            id: store.id,
            organization_id: store.organization_id,
            shop_domain: store.shop_domain,
            access_token: store.access_token,
          } as any,
          {
            syncOrders: syncType === 'all' || syncType === 'orders',
            syncCustomers: syncType === 'all' || syncType === 'customers',
            syncProducts: syncType === 'all' || syncType === 'products',
            ordersHistorical: historical,
            ordersDaysBack: since ? undefined : 90,
          }
        );

        // Update store stats + flip initial_sync_completed when nothing
        // errored (same shape the legacy inline path produced).
        const syncOk = result.errors.length === 0;
        const storeUpdate: Record<string, any> = {
          last_sync_at: new Date().toISOString(),
          total_orders: result.ordersCount,
          total_customers: result.customersCount,
        };
        if (syncOk) {
          storeUpdate.initial_sync_completed = true;
          storeUpdate.api_version = '2026-04';
        }
        await supabase.from('shopify_stores').update(storeUpdate).eq('id', store.id);

        // Re-converge wiring at the same time (idempotent).
        fireInstallExtrasAfterSync(store.id);

        return NextResponse.json({
          success: syncOk,
          mode: 'inline',
          data: {
            products: result.productsCount,
            customers: result.customersCount,
            orders: result.ordersCount,
            eventsCreated: result.eventsCreated,
            totalRevenue: result.totalRevenue,
            durationMs: result.durationMs,
            errors: result.errors,
          },
          errors: result.errors.length > 0 ? result.errors : undefined,
        });
      } catch (err: any) {
        console.error('[Sync] runFullSyncGraphQL fatal:', err?.message);
        return NextResponse.json({ error: err?.message || 'sync failed' }, { status: 500 });
      }
    }

  } catch (error: any) {
    console.error('[Sync] Fatal error:', error.message, error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Fire-and-forget call to install-extras so a "Sincronizar tudo"
// click re-installs anything that fell out (script tag deleted on
// the Shopify side, webhooks revoked, pixel uninstalled). Idempotent
// — install-extras detects existing artifacts and reuses them.
function fireInstallExtrasAfterSync(storeId: string): void {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const secret = process.env.CRON_SECRET || '';
  if (!baseUrl) return;
  fetch(`${baseUrl}/api/shopify/install-extras`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'Authorization': `Bearer ${secret}` } : {}),
      'X-Internal-Request': 'true',
    },
    body: JSON.stringify({ storeId }),
    keepalive: true,
  }).catch((err) => {
    console.warn('[Sync] install-extras chain failed (non-blocking):', err?.message);
  });
}
