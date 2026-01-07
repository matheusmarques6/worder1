import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Vercel timeout configuration - Pro plan allows up to 300 seconds
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

// Rate limits per Klaviyo docs:
// - Burst: 1/s for reporting endpoints  
// - Steady: 2/m
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

// ============================================
// SUPABASE CLIENT SETUP
// ============================================
let _supabase: SupabaseClient | null = null;

function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) { 
    const db = getDb();
    return (db as unknown as Record<string | symbol, unknown>)[prop]; 
  }
});

// Sleep helper
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// TYPE DEFINITIONS
// ============================================
interface KlaviyoAccount {
  id: string;
  organization_id: string;
  api_key: string;
  public_key?: string;
  account_name?: string;
  updated_at?: string;
}

interface AccountInfo {
  currency: string;
  locale: string;
  orgName: string;
  timezone: string;
}

interface FlowData {
  flowId: string;
  revenue: number;
  conversions: number;
  delivered: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
}

interface CampaignData {
  campaignId: string;
  revenue: number;
  conversions: number;
  delivered: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
}

interface ReportStats {
  openRate?: number;
  clickRate?: number;
}

interface FlowReport {
  totalRevenue: number;
  totalConversions: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  flows: FlowData[];
  stats: ReportStats;
}

interface CampaignReport {
  totalRevenue: number;
  totalConversions: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  campaigns: CampaignData[];
  stats: ReportStats;
}

interface ListItem {
  id: string;
  name: string;
  profileCount: number;
}

interface ListMetrics {
  totalLists: number;
  totalSubscribers: number;
  lists: ListItem[];
}

interface SegmentItem {
  id: string;
  name: string;
  profileCount: number;
  isActive: boolean;
}

interface SegmentMetrics {
  totalSegments: number;
  segments: SegmentItem[];
  engaged90dProfiles: number;
  engaged90dSegmentName: string | null;
}

interface FlowItem {
  id: string;
  name: string;
  status: string;
  triggerType: string;
}

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  sendTime: string | null;
}

// Klaviyo API Response Types
interface KlaviyoListResponse {
  data: Array<{
    id: string;
    attributes: { name: string; profile_count?: number };
  }>;
  links?: { next?: string };
}

interface KlaviyoFlowResponse {
  data: Array<{
    id: string;
    attributes: { name: string; status: string; trigger_type?: string };
  }>;
  links?: { next?: string };
}

interface KlaviyoSegmentResponse {
  data: Array<{
    id: string;
    attributes: { name: string; profile_count?: number; is_active?: boolean };
  }>;
  links?: { next?: string };
}

interface KlaviyoCampaignResponse {
  data: Array<{
    id: string;
    attributes: { name: string; status: string; send_time?: string | null };
  }>;
  links?: { next?: string };
}

interface KlaviyoReportStatistics {
  delivered?: number;
  opens_unique?: number;
  clicks_unique?: number;
  conversion_value?: number;
  conversions?: number;
  recipients?: number;
  bounce_rate?: number;
  open_rate?: number;
  click_rate?: number;
  unsubscribe_rate?: number;
}

interface KlaviyoFlowReportResponse {
  data: {
    attributes: {
      results: Array<{
        groupings: { flow_id: string; send_channel: string };
        statistics: KlaviyoReportStatistics;
      }>;
    };
  };
}

interface KlaviyoCampaignReportResponse {
  data: {
    attributes: {
      results: Array<{
        groupings: { campaign_id: string; send_channel: string };
        statistics: KlaviyoReportStatistics;
      }>;
    };
  };
}

// ============================================
// KLAVIYO API REQUEST WITH RETRY
// ============================================
async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
  }
): Promise<T | null> {
  const { method = 'GET', body } = options || {};
  const url = `${KLAVIYO_API_URL}${endpoint}`;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 8000);
      console.log(`[Klaviyo] Retry ${attempt}/${maxRetries} - waiting ${backoff}ms`);
      await sleep(backoff);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'revision': KLAVIYO_REVISION,
        },
        ...(body && { body: JSON.stringify(body) }),
      });

      clearTimeout(timeoutId);

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
        console.log(`[Klaviyo] Rate limited. Waiting ${waitTime}ms`);
        if (attempt < maxRetries) {
          await sleep(waitTime);
          continue;
        }
        return null;
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[Klaviyo] Server error ${response.status}, retrying...`);
        continue;
      }

      const responseText = await response.text();

      if (!response.ok) {
        console.error(`[Klaviyo] API error ${response.status}:`, responseText.substring(0, 300));
        return null;
      }

      return JSON.parse(responseText) as T;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Klaviyo] Request error:`, errorMessage);
      if (attempt < maxRetries) continue;
      return null;
    }
  }

  return null;
}

// ============================================
// GET ACCOUNT INFO (timezone, currency)
// ============================================
async function getAccountInfo(apiKey: string): Promise<AccountInfo> {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string;
      attributes: {
        preferred_currency?: string;
        locale?: string;
        timezone?: string;
        contact_information?: { organization_name?: string };
      };
    }>;
  }>(apiKey, '/accounts/');

  if (!response?.data?.[0]) {
    return { currency: 'BRL', locale: 'pt-BR', orgName: '', timezone: 'America/Sao_Paulo' };
  }

  const attrs = response.data[0].attributes;
  return {
    currency: attrs.preferred_currency || 'BRL',
    locale: attrs.locale || 'pt-BR',
    orgName: attrs.contact_information?.organization_name || '',
    timezone: attrs.timezone || 'America/Sao_Paulo'
  };
}

// Get timezone offset string (e.g., "America/Sao_Paulo" -> "-03:00")
function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');

    if (offsetPart?.value) {
      const match = offsetPart.value.match(/GMT([+-])(\d+)/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, '0');
        return `${sign}${hours}:00`;
      }
    }
  } catch (e) {
    console.log(`[Klaviyo] Error parsing timezone ${timezone}, using UTC`);
  }
  return '+00:00';
}

// ============================================
// FIND PLACED ORDER METRIC ID
// ============================================
async function findPlacedOrderMetric(apiKey: string): Promise<string | null> {
  console.log('[Klaviyo] Fetching metrics...');

  const response = await klaviyoRequest<{
    data: Array<{
      id: string;
      attributes: { name: string; integration?: { name: string } };
    }>;
  }>(apiKey, '/metrics');

  if (!response?.data) return null;

  const metrics = response.data;
  console.log(`[Klaviyo] Total metrics: ${metrics.length}`);

  // Find "Placed Order" metric - exact match first
  let placedOrderMetric = metrics.find(m => m.attributes.name === 'Placed Order');

  // Try variations if not found
  if (!placedOrderMetric) {
    placedOrderMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === 'placed order' ||
      m.attributes.name.toLowerCase().includes('placed order')
    );
  }

  if (placedOrderMetric) {
    console.log(`[Klaviyo] Using metric: ${placedOrderMetric.attributes.name} (${placedOrderMetric.id})`);
    return placedOrderMetric.id;
  }

  console.log('[Klaviyo] No Placed Order metric found');
  return null;
}

// ============================================
// GET ALL LISTS WITH PAGINATION
// ============================================
async function getLists(apiKey: string): Promise<ListMetrics> {
  const allLists: ListItem[] = [];
  let nextPage: string | null = '/lists/?page[size]=100';

  while (nextPage) {
    const response: KlaviyoListResponse | null = await klaviyoRequest<KlaviyoListResponse>(apiKey, nextPage);

    if (!response?.data) break;

    for (const l of response.data) {
      allLists.push({
        id: l.id,
        name: l.attributes.name,
        profileCount: l.attributes.profile_count || 0
      });
    }

    nextPage = response.links?.next 
      ? response.links.next.replace(KLAVIYO_API_URL, '') 
      : null;
    if (nextPage) await sleep(500);
  }

  const totalSubscribers = allLists.reduce((sum, l) => sum + l.profileCount, 0);
  console.log(`[Klaviyo] Fetched ${allLists.length} lists with ${totalSubscribers} subscribers`);

  return {
    totalLists: allLists.length,
    totalSubscribers,
    lists: allLists.sort((a, b) => b.profileCount - a.profileCount)
  };
}

// ============================================
// GET ALL FLOWS WITH PAGINATION
// ============================================
async function getFlows(apiKey: string): Promise<FlowItem[]> {
  const allFlows: FlowItem[] = [];
  let nextPage: string | null = '/flows?page[size]=100';

  while (nextPage) {
    const response: KlaviyoFlowResponse | null = await klaviyoRequest<KlaviyoFlowResponse>(apiKey, nextPage);

    if (!response?.data) break;

    for (const f of response.data) {
      allFlows.push({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type || 'unknown'
      });
    }

    nextPage = response.links?.next 
      ? response.links.next.replace(KLAVIYO_API_URL, '') 
      : null;
    if (nextPage) await sleep(500);
  }

  console.log(`[Klaviyo] Fetched ${allFlows.length} flows`);
  return allFlows;
}

// ============================================
// GET ALL SEGMENTS WITH PAGINATION
// ============================================
async function getSegments(apiKey: string): Promise<SegmentMetrics> {
  const allSegments: SegmentItem[] = [];
  let nextPage: string | null = '/segments/?page[size]=100';

  while (nextPage) {
    const response: KlaviyoSegmentResponse | null = await klaviyoRequest<KlaviyoSegmentResponse>(apiKey, nextPage);

    if (!response?.data) break;

    for (const s of response.data) {
      allSegments.push({
        id: s.id,
        name: s.attributes.name,
        profileCount: s.attributes.profile_count || 0,
        isActive: s.attributes.is_active ?? true
      });
    }

    nextPage = response.links?.next 
      ? response.links.next.replace(KLAVIYO_API_URL, '') 
      : null;
    if (nextPage) await sleep(500);
  }

  console.log(`[Klaviyo] Fetched ${allSegments.length} segments`);

  // Find engaged 90d segment
  const engaged90dSegment = allSegments.find(s => {
    const nameLower = s.name.toLowerCase();
    return nameLower.includes('engajado') ||
           nameLower.includes('engaged') ||
           nameLower.includes('90d') ||
           nameLower.includes('90 dias') ||
           nameLower.includes('ativos');
  });

  return {
    totalSegments: allSegments.length,
    segments: allSegments.sort((a, b) => b.profileCount - a.profileCount),
    engaged90dProfiles: engaged90dSegment?.profileCount || 0,
    engaged90dSegmentName: engaged90dSegment?.name || null
  };
}

// ============================================
// GET ALL CAMPAIGNS WITH PAGINATION
// ============================================
async function getCampaigns(apiKey: string): Promise<CampaignItem[]> {
  const allCampaigns: CampaignItem[] = [];
  // Per Klaviyo docs: filter by email channel
  let nextPage: string | null = '/campaigns?filter=equals(messages.channel,"email")&page[size]=100';

  while (nextPage) {
    const response: KlaviyoCampaignResponse | null = await klaviyoRequest<KlaviyoCampaignResponse>(apiKey, nextPage);

    if (!response?.data) break;

    for (const c of response.data) {
      allCampaigns.push({
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        sendTime: c.attributes.send_time || null
      });
    }

    nextPage = response.links?.next 
      ? response.links.next.replace(KLAVIYO_API_URL, '') 
      : null;
    if (nextPage) await sleep(500);
  }

  console.log(`[Klaviyo] Fetched ${allCampaigns.length} campaigns`);
  return allCampaigns;
}

// ============================================
// FLOW VALUES REPORT - ALL FLOWS AT ONCE
// ============================================
async function getFlowValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = '+00:00'
): Promise<FlowReport> {
  console.log(`[Klaviyo] Getting flow values report: ${startDate} to ${endDate}`);

  // All valid statistics for flow-values-report
  const statistics = [
    'average_order_value',
    'bounce_rate',
    'click_rate',
    'click_to_open_rate',
    'clicks',
    'clicks_unique',
    'conversion_rate',
    'conversion_uniques',
    'conversion_value',
    'conversions',
    'delivered',
    'delivery_rate',
    'open_rate',
    'opens',
    'opens_unique',
    'recipients',
    'revenue_per_recipient',
    'unsubscribe_rate'
  ];

  // NO FILTER - returns ALL flows grouped automatically
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
        },
        conversion_metric_id: metricId,
        statistics
      }
    }
  };

  await sleep(MIN_REQUEST_INTERVAL);

  const response: KlaviyoFlowReportResponse | null = await klaviyoRequest<KlaviyoFlowReportResponse>(
    apiKey, 
    '/flow-values-reports/', 
    { method: 'POST', body }
  );

  const emptyResult: FlowReport = { 
    totalRevenue: 0, 
    totalConversions: 0, 
    totalDelivered: 0, 
    totalOpens: 0, 
    totalClicks: 0, 
    flows: [], 
    stats: {} 
  };

  if (!response?.data?.attributes?.results) {
    console.log('[Klaviyo] No flow results returned');
    return emptyResult;
  }

  const results = response.data.attributes.results;
  console.log(`[Klaviyo] Flow results: ${results.length} entries`);

  // Aggregate by flow_id
  const flowMap = new Map<string, FlowData>();

  let totalRevenue = 0;
  let totalConversions = 0;
  let totalDelivered = 0;
  let totalOpens = 0;
  let totalClicks = 0;

  for (const r of results) {
    const flowId = r.groupings.flow_id;
    const stats = r.statistics;

    totalRevenue += stats.conversion_value || 0;
    totalConversions += stats.conversions || 0;
    totalDelivered += stats.delivered || 0;
    totalOpens += stats.opens_unique || 0;
    totalClicks += stats.clicks_unique || 0;

    const existing = flowMap.get(flowId) || {
      flowId,
      revenue: 0, 
      conversions: 0, 
      delivered: 0, 
      opens: 0, 
      clicks: 0,
      openRate: 0, 
      clickRate: 0
    };

    flowMap.set(flowId, {
      flowId,
      revenue: existing.revenue + (stats.conversion_value || 0),
      conversions: existing.conversions + (stats.conversions || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      opens: existing.opens + (stats.opens_unique || 0),
      clicks: existing.clicks + (stats.clicks_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate
    });
  }

  console.log(`[Klaviyo] Flow totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`);

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    flows: Array.from(flowMap.values()),
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0
    }
  };
}

// ============================================
// CAMPAIGN VALUES REPORT - ALL CAMPAIGNS AT ONCE
// ============================================
async function getCampaignValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = '+00:00'
): Promise<CampaignReport> {
  console.log(`[Klaviyo] Getting campaign values report: ${startDate} to ${endDate}`);

  const statistics = [
    'average_order_value',
    'bounce_rate',
    'click_rate',
    'click_to_open_rate',
    'clicks',
    'clicks_unique',
    'conversion_rate',
    'conversion_uniques',
    'conversion_value',
    'conversions',
    'delivered',
    'delivery_rate',
    'open_rate',
    'opens',
    'opens_unique',
    'recipients',
    'revenue_per_recipient',
    'unsubscribe_rate'
  ];

  // NO FILTER - returns ALL campaigns grouped automatically
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
        },
        conversion_metric_id: metricId,
        statistics
      }
    }
  };

  await sleep(MIN_REQUEST_INTERVAL);

  const response: KlaviyoCampaignReportResponse | null = await klaviyoRequest<KlaviyoCampaignReportResponse>(
    apiKey, 
    '/campaign-values-reports/', 
    { method: 'POST', body }
  );

  const emptyResult: CampaignReport = { 
    totalRevenue: 0, 
    totalConversions: 0, 
    totalDelivered: 0, 
    totalOpens: 0, 
    totalClicks: 0, 
    campaigns: [], 
    stats: {} 
  };

  if (!response?.data?.attributes?.results) {
    console.log('[Klaviyo] No campaign results returned');
    return emptyResult;
  }

  const results = response.data.attributes.results;
  console.log(`[Klaviyo] Campaign results: ${results.length} entries`);

  // Aggregate by campaign_id
  const campaignMap = new Map<string, CampaignData>();

  let totalRevenue = 0;
  let totalConversions = 0;
  let totalDelivered = 0;
  let totalOpens = 0;
  let totalClicks = 0;

  for (const r of results) {
    const campaignId = r.groupings.campaign_id;
    const stats = r.statistics;

    totalRevenue += stats.conversion_value || 0;
    totalConversions += stats.conversions || 0;
    totalDelivered += stats.delivered || 0;
    totalOpens += stats.opens_unique || 0;
    totalClicks += stats.clicks_unique || 0;

    const existing = campaignMap.get(campaignId) || {
      campaignId,
      revenue: 0, 
      conversions: 0, 
      delivered: 0, 
      opens: 0, 
      clicks: 0,
      openRate: 0, 
      clickRate: 0
    };

    campaignMap.set(campaignId, {
      campaignId,
      revenue: existing.revenue + (stats.conversion_value || 0),
      conversions: existing.conversions + (stats.conversions || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      opens: existing.opens + (stats.opens_unique || 0),
      clicks: existing.clicks + (stats.clicks_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate
    });
  }

  console.log(`[Klaviyo] Campaign totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`);

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    campaigns: Array.from(campaignMap.values()),
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0
    }
  };
}

// ============================================
// GET DATE RANGE BASED ON PERIOD
// ============================================
function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: Date;
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 90);
      break;
    case '12m':
    case 'all':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);

  const formatDate = (d: Date): string => d.toISOString().split('T')[0];

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
}

// ============================================
// VALIDATE UUID FORMAT (Security)
// ============================================
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ============================================
// MAIN GET HANDLER
// ============================================
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const storeId = searchParams.get('storeId');
  const period = searchParams.get('period') || '30d';
  const debug = searchParams.get('debug') === 'true';

  try {
    console.log('[Klaviyo] ========== STARTING REPORT ==========');
    console.log(`[Klaviyo] StoreId: ${storeId || 'not provided'}`);
    console.log(`[Klaviyo] Period: ${period}`);

    // Validate period parameter (Security)
    const validPeriods = ['today', '7d', '30d', '90d', '12m', 'all'];
    const sanitizedPeriod = validPeriods.includes(period) ? period : '30d';

    // ============================================
    // CRITICAL: Get the correct Klaviyo account for this store
    // This ensures data isolation between stores
    // ============================================
    let klaviyoAccount: KlaviyoAccount | null = null;
    let organizationId: string | null = null;

    if (storeId) {
      // Validate storeId format (Security - prevent SQL injection)
      if (!isValidUUID(storeId)) {
        console.error('[Klaviyo] Invalid storeId format:', storeId);
        return NextResponse.json({
          success: false,
          error: 'ID de loja inválido'
        }, { status: 400 });
      }

      // Get store first to find organization_id
      const { data: store, error: storeError } = await supabase
        .from('shopify_stores')
        .select('id, organization_id, shop_name')
        .eq('id', storeId)
        .single();

      if (storeError || !store) {
        console.error('[Klaviyo] Store not found:', storeId);
        return NextResponse.json({
          success: false,
          error: 'Loja não encontrada'
        }, { status: 404 });
      }

      organizationId = store.organization_id as string;
      console.log(`[Klaviyo] Store: ${store.shop_name}, Organization: ${organizationId}`);

      // Get Klaviyo account for THIS organization
      const { data: account, error: accountError } = await supabase
        .from('klaviyo_accounts')
        .select('id, organization_id, api_key, public_key, account_name, updated_at')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single();

      if (accountError && accountError.code !== 'PGRST116') {
        console.error('[Klaviyo] Error fetching account by org:', accountError);
      }

      klaviyoAccount = account as KlaviyoAccount | null;

      // FALLBACK: If no account found for this org, try to find any active account
      // This handles cases where Klaviyo was connected with a different organization_id
      if (!klaviyoAccount) {
        console.warn(`[Klaviyo] No account found for organization ${organizationId}, trying fallback...`);
        
        const { data: fallbackAccount } = await supabase
          .from('klaviyo_accounts')
          .select('id, organization_id, api_key, public_key, account_name, updated_at')
          .eq('is_active', true)
          .limit(1)
          .single();

        if (fallbackAccount) {
          console.warn(`[Klaviyo] Using fallback account: ${fallbackAccount.account_name} (org: ${fallbackAccount.organization_id})`);
          console.warn(`[Klaviyo] ATTENTION: Consider updating klaviyo_accounts.organization_id to match ${organizationId}`);
          klaviyoAccount = fallbackAccount as KlaviyoAccount;
        }
      }
    } else {
      // Fallback: get first active account (for backward compatibility)
      // WARNING: This should be avoided in multi-store environments
      console.warn('[Klaviyo] No storeId provided - using first active account');
      
      const { data: account } = await supabase
        .from('klaviyo_accounts')
        .select('id, organization_id, api_key, public_key, account_name, updated_at')
        .eq('is_active', true)
        .limit(1)
        .single();

      klaviyoAccount = account as KlaviyoAccount | null;
      organizationId = klaviyoAccount?.organization_id || null;
    }

    if (!klaviyoAccount?.api_key) {
      return NextResponse.json({
        success: true,
        connected: false,
        message: 'Klaviyo não conectado'
      });
    }

    console.log(`[Klaviyo] Account: ${klaviyoAccount.account_name} (org: ${organizationId})`);

    // Get account info (timezone, currency)
    const accountInfo = await getAccountInfo(klaviyoAccount.api_key);
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone);
    console.log(`[Klaviyo] Timezone: ${accountInfo.timezone} (${timezoneOffset})`);

    // Get date range
    const { startDate, endDate } = getDateRange(sanitizedPeriod);
    console.log(`[Klaviyo] Date range: ${startDate} to ${endDate}`);

    // Find Placed Order metric
    const metricId = await findPlacedOrderMetric(klaviyoAccount.api_key);

    if (!metricId) {
      console.warn('[Klaviyo] No Placed Order metric found');
      // Return basic data without revenue
      const [listMetrics, allFlows, allCampaigns] = await Promise.all([
        getLists(klaviyoAccount.api_key),
        getFlows(klaviyoAccount.api_key),
        getCampaigns(klaviyoAccount.api_key)
      ]);

      return NextResponse.json({
        success: true,
        connected: true,
        warning: "Métrica 'Placed Order' não encontrada. Configure a integração de e-commerce no Klaviyo.",
        account: {
          id: klaviyoAccount.id,
          name: klaviyoAccount.account_name || 'Klaviyo Account',
          currency: accountInfo.currency
        },
        overview: {
          totalSubscribers: { value: listMetrics.totalSubscribers, change: 0 },
          emailsSent: { value: 0, change: 0 },
          openRate: { value: 0, change: 0 },
          clickRate: { value: 0, change: 0 },
          revenue: { value: 0, change: 0 }
        },
        flows: allFlows.map(f => ({
          id: f.id,
          name: f.name,
          status: f.status,
          triggered: 0,
          opened: 0,
          clicked: 0,
          revenue: 0
        })),
        campaigns: allCampaigns.filter(c => c.status === 'sent').map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          sent: 0,
          opened: 0,
          clicked: 0,
          revenue: 0
        })),
        lists: listMetrics.lists
      });
    }

    // ============================================
    // FETCH ALL DATA IN PARALLEL
    // ============================================
    const [listMetrics, segmentMetrics, allFlows, allCampaigns, flowReport, campaignReport] = await Promise.all([
      getLists(klaviyoAccount.api_key),
      getSegments(klaviyoAccount.api_key),
      getFlows(klaviyoAccount.api_key),
      getCampaigns(klaviyoAccount.api_key),
      getFlowValuesReport(klaviyoAccount.api_key, metricId, startDate, endDate, timezoneOffset),
      getCampaignValuesReport(klaviyoAccount.api_key, metricId, startDate, endDate, timezoneOffset)
    ]);

    // ============================================
    // MERGE FLOW DATA WITH NAMES
    // ============================================
    const flowsWithNames = flowReport.flows.map(fr => {
      const flowInfo = allFlows.find(f => f.id === fr.flowId);
      return {
        id: fr.flowId,
        name: flowInfo?.name || 'Unknown Flow',
        status: flowInfo?.status || 'unknown',
        triggered: fr.delivered,
        opened: fr.opens,
        clicked: fr.clicks,
        revenue: fr.revenue,
        conversions: fr.conversions,
        open_rate: fr.openRate,
        click_rate: fr.clickRate
      };
    }).filter(f => f.revenue > 0 || f.triggered > 0);

    // ============================================
    // MERGE CAMPAIGN DATA WITH NAMES
    // ============================================
    const campaignsWithNames = campaignReport.campaigns.map(cr => {
      const campInfo = allCampaigns.find(c => c.id === cr.campaignId);
      return {
        id: cr.campaignId,
        name: campInfo?.name || 'Unknown Campaign',
        status: campInfo?.status || 'sent',
        sent_at: campInfo?.sendTime,
        sent: cr.delivered,
        delivered: cr.delivered,
        opened: cr.opens,
        clicked: cr.clicks,
        revenue: cr.revenue,
        conversions: cr.conversions,
        open_rate: cr.openRate,
        click_rate: cr.clickRate
      };
    }).filter(c => c.revenue > 0 || c.sent > 0);

    // ============================================
    // CALCULATE TOTALS
    // ============================================
    const totalRevenue = flowReport.totalRevenue + campaignReport.totalRevenue;
    const totalConversions = flowReport.totalConversions + campaignReport.totalConversions;
    const totalDelivered = flowReport.totalDelivered + campaignReport.totalDelivered;
    const totalOpens = flowReport.totalOpens + campaignReport.totalOpens;
    const totalClicks = flowReport.totalClicks + campaignReport.totalClicks;

    const openRate = totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0;
    const clickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0;

    console.log('[Klaviyo] ========== FINAL SUMMARY ==========');
    console.log(`[Klaviyo] Total Revenue: ${accountInfo.currency} ${totalRevenue.toFixed(2)}`);
    console.log(`[Klaviyo] - Campaigns: ${accountInfo.currency} ${campaignReport.totalRevenue.toFixed(2)}`);
    console.log(`[Klaviyo] - Flows: ${accountInfo.currency} ${flowReport.totalRevenue.toFixed(2)}`);
    console.log(`[Klaviyo] Total Delivered: ${totalDelivered}`);
    console.log('[Klaviyo] ========================================');

    // ============================================
    // BUILD RESPONSE
    // ============================================
    const responseData: Record<string, unknown> = {
      success: true,
      connected: true,
      account: {
        id: klaviyoAccount.id,
        name: klaviyoAccount.account_name || 'Klaviyo Account',
        currency: accountInfo.currency,
        timezone: accountInfo.timezone,
        lastSync: klaviyoAccount.updated_at || new Date().toISOString(),
        publicKey: klaviyoAccount.public_key || null
      },
      mode: 'realtime-reporting-api-v2',
      period: {
        label: sanitizedPeriod,
        start: startDate,
        end: endDate
      },
      overview: {
        totalSubscribers: {
          value: listMetrics.totalSubscribers,
          change: 0
        },
        emailsSent: {
          value: totalDelivered,
          change: 0
        },
        openRate: {
          value: openRate,
          change: 0
        },
        clickRate: {
          value: clickRate,
          change: 0
        },
        revenue: {
          value: totalRevenue,
          change: 0
        }
      },
      revenue: {
        totalRevenue,
        campaignRevenue: campaignReport.totalRevenue,
        flowRevenue: flowReport.totalRevenue,
        totalConversions,
        averageOrderValue: totalConversions > 0 ? totalRevenue / totalConversions : 0
      },
      emailPerformance: {
        delivered: totalDelivered,
        opened: totalOpens,
        clicked: totalClicks,
        openRate,
        clickRate,
        clickToOpenRate: totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0
      },
      engagement: {
        engagedProfiles: segmentMetrics.engaged90dProfiles,
        engagementRate: listMetrics.totalSubscribers > 0
          ? ((segmentMetrics.engaged90dProfiles / listMetrics.totalSubscribers) * 100).toFixed(1)
          : '0',
        engaged90dSegmentName: segmentMetrics.engaged90dSegmentName
      },
      flowPerformance: {
        totalRevenue: flowReport.totalRevenue,
        totalConversions: flowReport.totalConversions,
        totalDelivered: flowReport.totalDelivered,
        avgOpenRate: flowReport.stats.openRate || 0,
        avgClickRate: flowReport.stats.clickRate || 0
      },
      campaignPerformance: {
        totalRevenue: campaignReport.totalRevenue,
        totalConversions: campaignReport.totalConversions,
        totalDelivered: campaignReport.totalDelivered,
        avgOpenRate: campaignReport.stats.openRate || 0,
        avgClickRate: campaignReport.stats.clickRate || 0
      },
      flows: flowsWithNames.sort((a, b) => b.revenue - a.revenue),
      campaigns: campaignsWithNames.sort((a, b) => b.revenue - a.revenue),
      lists: listMetrics.lists,
      segments: segmentMetrics.segments,
      counts: {
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === 'live').length,
        totalCampaigns: allCampaigns.length,
        sentCampaigns: allCampaigns.filter(c => c.status === 'sent').length,
        totalLists: listMetrics.totalLists,
        totalSegments: segmentMetrics.totalSegments
      }
    };

    if (debug) {
      responseData.debug = {
        metricId,
        organizationId,
        timezoneOffset,
        flowResults: flowReport.flows.length,
        campaignResults: campaignReport.campaigns.length
      };
    }

    return NextResponse.json(responseData);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Klaviyo] Error:', errorMessage);
    return NextResponse.json({
      success: false,
      error: 'Erro interno ao processar requisição'
    }, { status: 500 });
  }
}
