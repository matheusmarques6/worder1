// =============================================
// Dashboard Overview API
// GET /api/dashboard/overview?range=30d&granularity=weekly
//
// Aggregates Worder-attributed revenue, store totals, channel breakdown,
// time-series for the stacked bar chart, recent campaigns, top automations.
//
// Defensive by design: every query is wrapped in try/catch and every
// column access uses optional-chaining + numeric fallback, so we don't
// fail the whole endpoint if a table/column is missing in some tenant's
// schema (e.g. older deployments without attributed_revenue columns).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Range = 'today' | 'yesterday' | '7d' | '14d' | '30d' | '60d' | '90d' | 'month' | 'last_month' | 'custom';
type Granularity = 'daily' | 'weekly' | 'monthly';

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function daysForRange(range: Range): number {
  switch (range) {
    case 'today': return 1;
    case 'yesterday': return 2;
    case '7d': return 7;
    case '14d': return 14;
    case '30d': return 30;
    case '60d': return 60;
    case '90d': return 90;
    case 'month': return 30;
    case 'last_month': return 60;
    default: return 30;
  }
}

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function bucketLabel(d: Date, granularity: Granularity): string {
  if (granularity === 'monthly') return MONTHS_PT[d.getMonth()];
  return `${MONTHS_PT[d.getMonth()]} ${d.getDate()}`;
}

function buildBuckets(days: number, granularity: Granularity): Array<{ label: string; start: Date; end: Date }> {
  const now = new Date();
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];

  if (granularity === 'monthly') {
    const months = Math.min(6, Math.max(1, Math.ceil(days / 30)));
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ label: bucketLabel(start, granularity), start, end });
    }
    return buckets;
  }

  if (granularity === 'weekly') {
    const weeks = Math.min(8, Math.max(1, Math.ceil(days / 7)));
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(monday); start.setDate(start.getDate() - i * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      buckets.push({ label: bucketLabel(start, granularity), start, end });
    }
    return buckets;
  }

  // daily — one bucket per day across the whole range. Previous
  // version capped at 14 points which silently dropped the older
  // 16 days of a 30d window (and 76 days of a 90d window) — the
  // chart looked empty because all real orders fell outside the
  // last-14-day slice. Cap at 92 (3 months) so 90d works.
  const points = Math.min(92, Math.max(1, days));
  for (let i = points - 1; i >= 0; i--) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    buckets.push({ label: bucketLabel(start, granularity), start, end });
  }
  return buckets;
}

function findBucket(buckets: ReturnType<typeof buildBuckets>, dateStr: string | null | undefined): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return -1;
  for (let i = 0; i < buckets.length; i++) {
    if (d >= buckets[i].start && d < buckets[i].end) return i;
  }
  return -1;
}

// Defensive query helper — returns [] on any failure.
async function safeQuery<T = any>(fn: () => any): Promise<T[]> {
  try {
    const result = await fn()
    if (!result) return []
    const { data, error } = result as { data: any; error: any }
    if (error) return []
    return (data as T[]) || []
  } catch {
    return []
  }
}

// Pick first field found on a row by trying candidate keys.
function pickNum(row: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== '') return num(v);
  }
  // Nested stats/metadata fallback
  if (row?.stats) {
    for (const k of keys) {
      if (row.stats[k] !== undefined) return num(row.stats[k]);
    }
  }
  return 0;
}

function mapStatus(raw: string | undefined, defaultLabel = 'Rascunho'): string {
  const s = (raw || '').toLowerCase();
  if (s === 'sent' || s === 'enviada') return 'Enviada';
  if (s === 'scheduled') return 'Agendada';
  if (s === 'sending') return 'Enviando';
  if (s === 'active') return 'Ativo';
  if (s === 'paused') return 'Pausado';
  if (s === 'archived') return 'Arquivado';
  if (s === 'draft') return 'Rascunho';
  return raw || defaultLabel;
}

export async function GET(request: NextRequest) {
  const range = (request.nextUrl.searchParams.get('range') || '30d') as Range;
  const granularity = (request.nextUrl.searchParams.get('granularity') || 'weekly') as Granularity;

  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    const orgId = auth.user.organization_id;
    const storeId = request.nextUrl.searchParams.get('storeId');

    // Compute the [sinceDate, untilDate) window in start-of-day
    // semantics so the count matches Shopify Admin's "Últimos N dias"
    // exactly. Three modes:
    //   - 'custom' → honor ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive)
    //   - 'today' / 'yesterday' → calendar day windows
    //   - 'last_month' → previous calendar month
    //   - everything else → "rolling N days ending today"
    const fromParam = request.nextUrl.searchParams.get('from');
    const toParam = request.nextUrl.searchParams.get('to');
    const days = daysForRange(range);
    let sinceDate = new Date();
    let untilDate = new Date(); // exclusive
    sinceDate.setHours(0, 0, 0, 0);
    untilDate.setHours(0, 0, 0, 0);
    untilDate.setDate(untilDate.getDate() + 1); // include today

    if (range === 'custom' && fromParam && toParam) {
      sinceDate = new Date(`${fromParam}T00:00:00`);
      untilDate = new Date(`${toParam}T00:00:00`);
      untilDate.setDate(untilDate.getDate() + 1); // inclusive end day
    } else if (range === 'today') {
      // sinceDate = today 00:00, untilDate = tomorrow 00:00 (defaults above)
    } else if (range === 'yesterday') {
      sinceDate.setDate(sinceDate.getDate() - 1);
      untilDate.setDate(untilDate.getDate() - 1);
    } else if (range === 'month') {
      sinceDate = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
    } else if (range === 'last_month') {
      const firstOfThis = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
      sinceDate = new Date(firstOfThis.getFullYear(), firstOfThis.getMonth() - 1, 1);
      untilDate = firstOfThis;
    } else {
      sinceDate.setDate(sinceDate.getDate() - days);
    }
    const since = sinceDate.toISOString();
    const until = untilDate.toISOString();

    // Previous-window starts the same span earlier than `since`.
    // For custom/today/last_month the span = (until - since) in days.
    const windowMs = untilDate.getTime() - sinceDate.getTime();
    const prevSinceDate = new Date(sinceDate.getTime() - windowMs);
    const prevSince = prevSinceDate.toISOString();

    const buckets = buildBuckets(days, granularity);

    // ── All queries in parallel (defensive) ──
    const [
      campaigns,
      prevCampaigns,
      automations,
      whatsappCampaigns,
      smsCampaigns,
      emailSends,
      orders,
      stores,
    ] = await Promise.all([
      safeQuery(() => supabaseAdmin.from('email_campaigns').select('*').eq('organization_id', orgId).gte('created_at', since).order('created_at', { ascending: false })),
      safeQuery(() => supabaseAdmin.from('email_campaigns').select('*').eq('organization_id', orgId).gte('created_at', prevSince).lt('created_at', since)),
      safeQuery(() => supabaseAdmin.from('automations').select('*').eq('organization_id', orgId)),
      safeQuery(() => supabaseAdmin.from('whatsapp_campaigns').select('*').eq('organization_id', orgId).gte('created_at', since)),
      safeQuery(() => supabaseAdmin.from('sms_campaigns').select('*').eq('organization_id', orgId).gte('created_at', since)),
      safeQuery(() => supabaseAdmin.from('email_sends').select('created_at, campaign_id').eq('organization_id', orgId).gte('created_at', since)),
      // Orders sit in shopify_orders (joined via store). Date bounds
      // are [since, until) — both sides explicit so 'today', 'ontem',
      // 'mês passado', and custom ranges only pull the right window.
      safeQuery(async () => {
        if (storeId) {
          return supabaseAdmin.from('shopify_orders')
            .select('total_price, total_refunded, created_at, financial_status')
            .eq('store_id', storeId)
            .gte('created_at', since)
            .lt('created_at', until);
        }
        const storesRes = await supabaseAdmin.from('shopify_stores').select('id').eq('organization_id', orgId);
        const storeIds = (storesRes.data || []).map((s: any) => s.id);
        if (!storeIds.length) return { data: [], error: null };
        return supabaseAdmin.from('shopify_orders')
          .select('total_price, total_refunded, created_at, financial_status')
          .in('store_id', storeIds)
          .gte('created_at', since)
          .lt('created_at', until);
      }),
      // Pull last_sync_at + initial_sync_completed too so the auto-
      // sync trigger below can decide whether to refresh stale data.
      safeQuery(() => supabaseAdmin.from('shopify_stores').select('id, last_sync_at, initial_sync_completed').eq('organization_id', orgId)),
    ]);

    // ── KPI aggregation ──
    const campaignsRevenue = campaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_revenue', 'revenue', 'total_revenue'), 0);
    const campaignsOrders = campaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_orders', 'orders'), 0);

    const automationsRevenue = automations.reduce((s: number, a: any) => s + pickNum(a, 'attributed_revenue', 'total_revenue', 'revenue'), 0);
    const automationsOrders = automations.reduce((s: number, a: any) => s + pickNum(a, 'attributed_orders', 'orders'), 0);

    const whatsappRevenue = whatsappCampaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_revenue', 'revenue', 'total_revenue'), 0);
    const whatsappOrders = whatsappCampaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_orders', 'orders'), 0);

    const smsRevenue = smsCampaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_revenue', 'revenue', 'total_revenue'), 0);
    const smsOrders = smsCampaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_orders', 'orders'), 0);

    const worderRevenue = campaignsRevenue + automationsRevenue + whatsappRevenue + smsRevenue;
    const worderOrders = campaignsOrders + automationsOrders + whatsappOrders + smsOrders;

    // Store totals (skip cancelled orders). financial_status='cancelled'
    // is the production marker — the legacy cancelled_at column was
    // never added to shopify_orders so .select() including it errored
    // the whole query, which is why the dashboard sat at R$0 even with
    // 432 paid rows on file.
    const validOrders = orders.filter((o: any) => String(o.financial_status || '').toLowerCase() !== 'cancelled');
    // Match Shopify Admin's "Total Sales" report to the cent:
    //  - 'refunded' orders count as $0 net. Shopify's totalRefundedSet
    //    is order-level and sometimes lags transaction-level refunds
    //    by a few cents per order, so subtracting it from total_price
    //    can leave a residual (e.g. $0.59) that Shopify itself treats
    //    as $0. Aggressive zero-out matches Shopify Admin exactly.
    //  - everything else: net = total_price - total_refunded (handles
    //    'partially_refunded' and any future status).
    const storeRevenue = validOrders.reduce(
      (s: number, o: any) => {
        const status = String(o.financial_status || '').toLowerCase();
        if (status === 'refunded') return s;
        return s + num(o.total_price) - num(o.total_refunded);
      },
      0
    );
    const storeOrders = validOrders.length;

    const worderShare = storeRevenue > 0 ? (worderRevenue / storeRevenue) * 100 : 0;

    // ── Delta vs previous period (campaigns portion is cheapest + representative) ──
    const prevCampaignsRevenue = prevCampaigns.reduce((s: number, c: any) => s + pickNum(c, 'attributed_revenue', 'revenue'), 0);
    const worderDelta = prevCampaignsRevenue > 0
      ? Math.round(((campaignsRevenue - prevCampaignsRevenue) / prevCampaignsRevenue) * 100)
      : 0;

    // ── Channels ──
    const channels = {
      email: campaignsRevenue,
      whatsapp: whatsappRevenue,
      sms: smsRevenue,
    };

    // ── Time series (stacked bars) ──
    const sb = buckets.map(() => ({ campanhas: 0, automacoes: 0, fora: 0 }));

    // Campaign revenue → distribute evenly across sends in the period
    // (proxy when email_sends doesn't track per-send revenue).
    const sendsByCampaign = new Map<string, number>();
    for (const s of emailSends) {
      const row = s as any;
      if (row.campaign_id) {
        sendsByCampaign.set(row.campaign_id, (sendsByCampaign.get(row.campaign_id) || 0) + 1);
      }
    }
    for (const s of emailSends) {
      const row = s as any;
      const bi = findBucket(buckets, row.created_at);
      if (bi < 0) continue;
      if (row.campaign_id) {
        const c = campaigns.find((x: any) => x.id === row.campaign_id);
        const cRev = c ? pickNum(c, 'attributed_revenue', 'revenue') : 0;
        const total = sendsByCampaign.get(row.campaign_id) || 1;
        sb[bi].campanhas += cRev / total;
      }
    }
    // Automations: distribute each automation's revenue evenly across
    // the buckets (we don't have per-run timestamps at this layer).
    const activeAutomations = automations.filter((a: any) => {
      const rev = pickNum(a, 'attributed_revenue', 'total_revenue', 'revenue');
      return rev > 0;
    });
    if (activeAutomations.length && buckets.length) {
      const perBucket = activeAutomations.reduce((s: number, a: any) => s + pickNum(a, 'attributed_revenue', 'total_revenue', 'revenue'), 0) / buckets.length;
      for (let i = 0; i < sb.length; i++) sb[i].automacoes += perBucket;
    }
    // Fora da Worder = (store order in bucket) - worder-in-bucket
    for (const o of validOrders) {
      const row = o as any;
      const bi = findBucket(buckets, row.created_at);
      if (bi < 0) continue;
      // Same accounting as storeRevenue above: refunded orders
      // contribute $0; everything else is total_price - total_refunded.
      // Keeping these in lockstep so the stacked chart sums match the
      // headline card.
      const status = String(row.financial_status || '').toLowerCase();
      if (status === 'refunded') continue;
      sb[bi].fora += num(row.total_price) - num(row.total_refunded);
    }
    for (let i = 0; i < sb.length; i++) {
      const worderBucket = sb[i].campanhas + sb[i].automacoes;
      sb[i].fora = Math.max(0, sb[i].fora - worderBucket);
    }

    const series = buckets.map((b, i) => ({
      label: b.label,
      campanhas: Math.round(sb[i].campanhas),
      automacoes: Math.round(sb[i].automacoes),
      fora: Math.round(sb[i].fora),
    }));

    // Mini sparkline data for Campanhas + Automações KPI cards
    const sparklines = {
      campanhas: series.map((s) => s.campanhas),
      automacoes: series.map((s) => s.automacoes),
    };

    // ── Recent campaigns (top 3 with sends) ──
    const recentCampaigns = campaigns
      .filter((c: any) => pickNum(c, 'total_sent') > 0)
      .slice(0, 3)
      .map((c: any) => {
        const sent = pickNum(c, 'total_sent');
        const delivered = pickNum(c, 'total_delivered');
        const opened = pickNum(c, 'total_opened');
        const clicked = pickNum(c, 'total_clicked');
        return {
          id: c.id,
          name: c.name || 'Campanha',
          status: mapStatus(c.status),
          sends: sent,
          openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
          clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
          revenue: pickNum(c, 'attributed_revenue', 'revenue'),
        };
      });

    // ── Top automations (by revenue → runs) ──
    const topAutomations = automations
      .map((a: any) => ({
        raw: a,
        revenue: pickNum(a, 'attributed_revenue', 'total_revenue', 'revenue'),
        runs: pickNum(a, 'total_runs', 'total_triggered', 'runs'),
        completed: pickNum(a, 'successful_runs', 'total_completed', 'completed'),
      }))
      .filter((x) => x.revenue > 0 || x.runs > 0)
      .sort((a, b) => b.revenue - a.revenue || b.runs - a.runs)
      .slice(0, 3)
      .map((x) => ({
        id: x.raw.id,
        name: x.raw.name || 'Automação',
        status: mapStatus(x.raw.status, 'Ativo'),
        sends: x.runs,
        conversionRate: x.runs > 0 ? (x.completed / x.runs) * 100 : 0,
        revenue: x.revenue,
      }));

    // ── Sync state detection ──
    //
    // Common bug: merchant connects Shopify, sees R$ 0 everywhere, gets
    // confused. shopify_orders is empty because sync-now hasn't run yet
    // (post-connect cascade is fire-and-forget in some paths, can fail
    // silently, or token expired). We detect this and:
    //   1. Auto-trigger a background sync so data starts populating
    //   2. Surface needs_sync flag so the UI can show "Sincronizando…"
    //
    // Heuristic: the store row exists but shopify_orders count is 0.
    // We don't condition on `total_orders` from the row because that
    // field isn't reliably maintained — the actual table count is
    // ground truth.
    // Two auto-sync triggers from the dashboard:
    //
    //   A. Empty store: shopify_orders.count === 0 → first-time
    //      sync, route to bulk so the merchant gets every order ever
    //      (bulk is async — they can leave the page).
    //
    //   B. Stale store: store has orders, but the newest one is
    //      more than 60 minutes old AND last_sync_at is also older
    //      than 60 minutes. New orders happened on Shopify side
    //      that we don't have yet. Fire an incremental 90-day sync
    //      so the dashboard catches up without merchant action.
    //      (No "60 min" arbitrary number — it just needs to be
    //       longer than typical webhook latency. orders/create
    //       webhook should land most orders within seconds; this
    //       cron-style backfill catches the ones that slipped.)
    //
    // The check is best-effort and fire-and-forget. Either trigger
    // sets needsSync=true so the UI can show a "Sincronizando…"
    // banner.
    let needsSync = false;
    let syncTriggered = false;
    if (stores.length > 0) {
      const STALE_MS = 60 * 60 * 1000; // 1 hour
      const targetStoreId = storeId || stores[0]?.id;
      const targetStore = stores.find((s: any) => s.id === targetStoreId) || stores[0];

      let shouldSync = false;
      let useHistorical = false;

      if (orders.length === 0) {
        shouldSync = true;
        useHistorical = true; // first time, route to bulk
      } else {
        // Find newest order date and last_sync_at
        const newestOrderTs = orders.reduce((max: number, o: any) => {
          const t = new Date(o.created_at).getTime();
          return Number.isFinite(t) && t > max ? t : max;
        }, 0);
        const lastSyncTs = targetStore?.last_sync_at
          ? new Date(targetStore.last_sync_at).getTime()
          : 0;
        const now = Date.now();
        if (
          newestOrderTs > 0 &&
          now - newestOrderTs > STALE_MS &&
          (lastSyncTs === 0 || now - lastSyncTs > STALE_MS)
        ) {
          shouldSync = true;
          useHistorical = false; // incremental — 90d enough
        }
      }

      if (shouldSync) {
        needsSync = true;
        try {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
          if (appUrl && targetStoreId) {
            fetch(`${appUrl}/api/shopify/sync-now`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Request': 'true',
                cookie: request.headers.get('cookie') || '',
              },
              body: JSON.stringify({
                storeId: targetStoreId,
                syncType: 'all',
                historical: useHistorical,
              }),
              keepalive: true,
            }).then(() => {}, () => {});
            syncTriggered = true;
          }
        } catch { /* never throw from dashboard */ }
      }
    }

    return NextResponse.json({
      worderRevenue,
      worderOrders,
      worderShare,
      worderDelta,
      campaignsRevenue,
      campaignsOrders,
      automationsRevenue,
      automationsOrders,
      storeRevenue,
      storeOrders,
      series,
      sparklines,
      channels,
      recentCampaigns,
      topAutomations,
      hasShopify: stores.length > 0,
      needsSync,
      syncTriggered,
      period: { range, granularity, days },
    });
  } catch (error: any) {
    console.error('[dashboard/overview] Error:', error);
    // Never 500 the dashboard — return an empty but well-formed payload.
    return NextResponse.json({
      worderRevenue: 0, worderOrders: 0, worderShare: 0, worderDelta: 0,
      campaignsRevenue: 0, campaignsOrders: 0,
      automationsRevenue: 0, automationsOrders: 0,
      storeRevenue: 0, storeOrders: 0,
      series: [], sparklines: { campanhas: [], automacoes: [] }, channels: { email: 0, whatsapp: 0, sms: 0 },
      recentCampaigns: [], topAutomations: [],
      hasShopify: false,
      period: { range, granularity, days: daysForRange(range) },
      _error: error?.message,
    });
  }
}
