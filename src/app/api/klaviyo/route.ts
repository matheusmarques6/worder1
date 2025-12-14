import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Vercel timeout configuration - increase to max allowed
export const maxDuration = 60; // seconds (Pro plan allows up to 300)
export const dynamic = 'force-dynamic';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

// ============================================
// KLAVIYO API CONFIGURATION
// Baseado no workflow n8n funcional
// ============================================
const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15'; // Versão testada e funcional

// ============================================
// HELPER FUNCTIONS
// ============================================
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Klaviyo API request with retry and rate limiting
 * Implementa exponential backoff como no workflow
 */
async function klaviyoFetch(
  apiKey: string,
  endpoint: string,
  options: RequestInit = {},
  retries = 3 // Reduced from 5
): Promise<any> {
  let attempt = 0;

  while (attempt < retries) {
    if (attempt > 0) {
      // Faster backoff: 500ms, 1s, 2s (max)
      const backoff = Math.min(500 * Math.pow(2, attempt - 1), 2000);
      console.log(`[Klaviyo] Retry ${attempt}/${retries}, waiting ${backoff}ms...`);
      await sleep(backoff);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${KLAVIYO_API_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'revision': KLAVIYO_REVISION, // OBRIGATÓRIO!
          ...options.headers,
        },
      });

      // Rate limit - respect Retry-After header
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
        console.log(`[Klaviyo] Rate limited, waiting ${waitTime}ms...`);
        await sleep(waitTime);
        attempt++;
        continue;
      }

      // Server errors - retry
      if (response.status >= 500) {
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Klaviyo API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.errors?.[0]?.detail || errorMessage;
        } catch {
          errorMessage = errorText.substring(0, 200) || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      attempt++;
      if (attempt >= retries) throw error;
    }
  }
}

/**
 * POST request helper for Reporting API
 */
async function klaviyoPost(apiKey: string, endpoint: string, body: any): Promise<any> {
  return klaviyoFetch(apiKey, endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Get organization ID from existing store or create default
 */
async function getOrganizationId(): Promise<string> {
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('organization_id')
    .limit(1)
    .single();

  if (store?.organization_id) return store.organization_id;

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single();

  if (org?.id) return org.id;

  const { data: newOrg } = await supabase
    .from('organizations')
    .insert({ name: 'Default Organization', slug: 'default-org-' + Date.now() })
    .select('id')
    .single();

  return newOrg?.id || crypto.randomUUID();
}

// ============================================
// FIND PLACED ORDER METRIC ID
// ============================================
/**
 * O Metric ID varia por conta Klaviyo!
 * SIMPLIFIED: Retorna o primeiro "Placed Order" encontrado
 */
async function findPlacedOrderMetricId(apiKey: string): Promise<string | null> {
  try {
    // FIXED: Use page[size] not page_size
    const response = await klaviyoFetch(apiKey, '/metrics');
    const metrics = response.data || [];
    
    // Find first metric named "Placed Order"
    const placedOrder = metrics.find((m: any) => 
      m.attributes?.name === 'Placed Order'
    );
    
    if (placedOrder) {
      console.log(`[Klaviyo] Found Placed Order metric: ${placedOrder.id}`);
      return placedOrder.id;
    }
    
    // Fallback: try to find any order/purchase metric
    const orderMetric = metrics.find((m: any) => {
      const name = (m.attributes?.name || '').toLowerCase();
      return name.includes('order') || name.includes('purchase') || name.includes('compra');
    });
    
    if (orderMetric) {
      console.log(`[Klaviyo] Found alternative order metric: ${orderMetric.id} (${orderMetric.attributes?.name})`);
      return orderMetric.id;
    }
    
    console.log('[Klaviyo] No order metric found, using first available metric');
    // Last resort: use any metric (required for flow-values-report)
    if (metrics.length > 0) {
      console.log(`[Klaviyo] Using fallback metric: ${metrics[0].id} (${metrics[0].attributes?.name})`);
      return metrics[0].id;
    }
    
    return null;
  } catch (e: any) {
    console.error('[Klaviyo] Error finding metric:', e.message);
    return null;
  }
}

// ============================================
// FETCH CAMPAIGNS WITH REVENUE
// ============================================
/**
 * Busca campanhas usando o filtro OBRIGATÓRIO de canal email
 * e obtém revenue via Reporting API (campaign-values-reports)
 */
async function fetchCampaignsWithRevenue(
  apiKey: string, 
  metricId: string,
  startDate: string, 
  endDate: string
): Promise<any[]> {
  console.log('[Klaviyo] Fetching email campaigns...');
  
  try {
    // ⚠️ CRITICAL: filter by email channel is REQUIRED!
    // Sem este filtro a API retorna erro 400
    const response = await klaviyoFetch(
      apiKey, 
      '/campaigns?filter=equals(messages.channel,"email")'
    );
    
    const allCampaigns = response.data || [];
    console.log(`[Klaviyo] Total campaigns found: ${allCampaigns.length}`);
    
    // Filter by period
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const campaignsInPeriod = allCampaigns.filter((camp: any) => {
      const sendTime = camp.attributes?.send_time;
      if (!sendTime) return false;
      const campDate = new Date(sendTime);
      return campDate >= start && campDate <= end && !camp.attributes?.archived;
    });
    
    console.log(`[Klaviyo] Campaigns in period: ${campaignsInPeriod.length}`);
    
    // Get revenue for each campaign using Reporting API
    const campaignsWithRevenue = [];
    
    for (const camp of campaignsInPeriod) {
      const campaignData: any = {
        id: camp.id,
        klaviyo_campaign_id: camp.id,
        name: camp.attributes?.name || 'Unnamed Campaign',
        status: camp.attributes?.status || 'unknown',
        sent_at: camp.attributes?.send_time,
        revenue: 0,
        conversions: 0,
        recipients: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        open_rate: 0,
        click_rate: 0,
      };
      
      if (metricId) {
        try {
          // Get revenue using campaign-values-reports (como no workflow)
          const revenueBody = {
            data: {
              type: 'campaign-values-report',
              attributes: {
                timeframe: {
                  start: `${startDate}T00:00:00Z`,
                  end: `${endDate}T23:59:59Z`
                },
                conversion_metric_id: metricId,
                filter: `equals(campaign_id,"${camp.id}")`,
                statistics: [
                  'conversion_value',
                  'conversions',
                  'recipients',
                  'delivered',
                  'opens_unique',
                  'clicks_unique',
                  'bounced',
                  'unsubscribed'
                ]
              }
            }
          };
          
          const revenueRes = await klaviyoPost(apiKey, '/campaign-values-reports/', revenueBody);
          const stats = revenueRes?.data?.attributes?.results?.[0]?.statistics || {};
          
          campaignData.revenue = stats.conversion_value || 0;
          campaignData.conversions = stats.conversions || 0;
          campaignData.recipients = stats.recipients || 0;
          campaignData.sent = stats.recipients || 0;
          campaignData.delivered = stats.delivered || 0;
          campaignData.opened = stats.opens_unique || 0;
          campaignData.clicked = stats.clicks_unique || 0;
          campaignData.bounced = stats.bounced || 0;
          campaignData.unsubscribed = stats.unsubscribed || 0;
          
          // Calculate rates
          if (campaignData.delivered > 0) {
            campaignData.open_rate = (campaignData.opened / campaignData.delivered) * 100;
            campaignData.click_rate = (campaignData.clicked / campaignData.delivered) * 100;
          }
          
        } catch (e: any) {
          console.warn(`[Klaviyo] Error getting campaign ${camp.id} metrics:`, e.message);
        }
      }
      
      campaignsWithRevenue.push(campaignData);
    }
    
    return campaignsWithRevenue;
    
  } catch (error: any) {
    console.error('[Klaviyo] Error fetching campaigns:', error.message);
    return [];
  }
}

// ============================================
// FETCH FLOWS WITH REVENUE AND PERFORMANCE
// ============================================
/**
 * Busca flows ativos e obtém:
 * - Revenue via flow-values-reports
 * - Performance (opens, clicks) via flow-series-reports
 */
async function fetchFlowsWithRevenue(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string
): Promise<{ flows: any[], totalRevenue: number, totalConversions: number }> {
  console.log('[Klaviyo] Fetching flows...');
  
  let totalRevenue = 0;
  let totalConversions = 0;
  
  try {
    // Fetch all flows
    const response = await klaviyoFetch(apiKey, '/flows');
    const allFlows = response.data || [];
    
    // Filter active flows (live or manual)
    const activeFlows = allFlows.filter((f: any) => 
      f.attributes?.status === 'live' || f.attributes?.status === 'manual'
    );
    
    console.log(`[Klaviyo] Active flows: ${activeFlows.length}`);
    
    // Get total flow revenue first (como no workflow)
    if (metricId) {
      try {
        const totalBody = {
          data: {
            type: 'flow-values-report',
            attributes: {
              timeframe: {
                start: `${startDate}T00:00:00Z`,
                end: `${endDate}T23:59:59Z`
              },
              conversion_metric_id: metricId,
              statistics: ['conversion_value', 'conversions']
            }
          }
        };
        
        const totalRes = await klaviyoPost(apiKey, '/flow-values-reports/', totalBody);
        const results = totalRes?.data?.attributes?.results || [];
        
        for (const r of results) {
          totalRevenue += r.statistics?.conversion_value || 0;
          totalConversions += r.statistics?.conversions || 0;
        }
        
        console.log(`[Klaviyo] Total flow revenue: ${totalRevenue.toFixed(2)}`);
        
      } catch (e: any) {
        console.warn('[Klaviyo] Error getting total flow revenue:', e.message);
      }
    }
    
    // Get individual flow data
    const flowsWithData = [];
    
    for (const flow of activeFlows) {
      const flowData: any = {
        id: flow.id,
        klaviyo_flow_id: flow.id,
        name: flow.attributes?.name || 'Unnamed Flow',
        status: flow.attributes?.status || 'unknown',
        revenue: 0,
        conversions: 0,
        triggered: 0,
        received: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        open_rate: 0,
        click_rate: 0,
      };
      
      if (metricId) {
        try {
          // Get revenue for this flow (flow-values-reports)
          const revenueBody = {
            data: {
              type: 'flow-values-report',
              attributes: {
                timeframe: {
                  start: `${startDate}T00:00:00Z`,
                  end: `${endDate}T23:59:59Z`
                },
                conversion_metric_id: metricId,
                filter: `equals(flow_id,"${flow.id}")`,
                statistics: ['conversion_value', 'conversions', 'conversion_uniques']
              }
            }
          };
          
          const revenueRes = await klaviyoPost(apiKey, '/flow-values-reports/', revenueBody);
          const revenueResults = revenueRes?.data?.attributes?.results || [];
          
          for (const r of revenueResults) {
            flowData.revenue += r.statistics?.conversion_value || 0;
            flowData.conversions += r.statistics?.conversions || 0;
          }
          
        } catch (e: any) {
          // Silently continue
        }
        
        try {
          // Get performance metrics (flow-series-reports)
          const perfBody = {
            data: {
              type: 'flow-series-report',
              attributes: {
                timeframe: {
                  start: `${startDate}T00:00:00Z`,
                  end: `${endDate}T23:59:59Z`
                },
                filter: `equals(flow_id,"${flow.id}")`,
                statistics: [
                  'opens',
                  'opens_unique',
                  'clicks',
                  'clicks_unique',
                  'deliveries',
                  'bounces',
                  'unsubscribes'
                ],
                interval: 'day'
              }
            }
          };
          
          const perfRes = await klaviyoPost(apiKey, '/flow-series-reports/', perfBody);
          const perfResults = perfRes?.data?.attributes?.results || [];
          
          // Sum all daily stats
          for (const r of perfResults) {
            flowData.triggered += r.statistics?.deliveries || 0;
            flowData.received += r.statistics?.deliveries || 0;
            flowData.opened += r.statistics?.opens_unique || 0;
            flowData.clicked += r.statistics?.clicks_unique || 0;
            flowData.bounced += r.statistics?.bounces || 0;
            flowData.unsubscribed += r.statistics?.unsubscribes || 0;
          }
          
          // Calculate rates
          if (flowData.triggered > 0) {
            flowData.open_rate = (flowData.opened / flowData.triggered) * 100;
          }
          if (flowData.opened > 0) {
            flowData.click_rate = (flowData.clicked / flowData.opened) * 100;
          }
          
        } catch (e: any) {
          // Silently continue
        }
      }
      
      flowsWithData.push(flowData);
      
      // Rate limiting
      await sleep(100);
    }
    
    return { flows: flowsWithData, totalRevenue, totalConversions };
    
  } catch (error: any) {
    console.error('[Klaviyo] Error fetching flows:', error.message);
    return { flows: [], totalRevenue: 0, totalConversions: 0 };
  }
}

// ============================================
// FETCH LISTS
// ============================================
async function fetchLists(apiKey: string): Promise<any[]> {
  console.log('[Klaviyo] Fetching lists...');
  
  try {
    const response = await klaviyoFetch(apiKey, '/lists');
    const lists = response.data || [];
    
    const listsWithCount = [];
    
    for (const list of lists) {
      const listData: any = {
        id: list.id,
        klaviyo_list_id: list.id,
        name: list.attributes?.name || 'Unnamed List',
        profile_count: 0,
        opt_in_process: list.attributes?.opt_in_process || 'single_opt_in',
      };
      
      try {
        // Get profile count for list (meta.total)
        const profilesRes = await klaviyoFetch(
          apiKey, 
          `/lists/${list.id}/profiles?page[size]=1`
        );
        listData.profile_count = profilesRes.meta?.total || 0;
      } catch (e) {
        // Silently continue
      }
      
      listsWithCount.push(listData);
      await sleep(100);
    }
    
    return listsWithCount;
    
  } catch (error: any) {
    console.error('[Klaviyo] Error fetching lists:', error.message);
    return [];
  }
}

// ============================================
// FETCH PROFILE COUNT
// ============================================
async function fetchProfileCount(apiKey: string): Promise<number> {
  try {
    const response = await klaviyoFetch(apiKey, '/profiles?page[size]=1');
    return response.meta?.total || 0;
  } catch (error) {
    return 0;
  }
}

// ============================================
// POST - CONNECT KLAVIYO
// ============================================
export async function POST(request: NextRequest) {
  try {
    const { apiKey, publicKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Private API Key é obrigatória' },
        { status: 400 }
      );
    }

    if (!publicKey) {
      return NextResponse.json(
        { error: 'Public API Key é obrigatória' },
        { status: 400 }
      );
    }

    // Validate API key format
    if (!apiKey.startsWith('pk_')) {
      return NextResponse.json(
        { error: 'API Key inválida. Use a Private API Key que começa com "pk_"' },
        { status: 400 }
      );
    }

    // Validate public key format (should be 6 characters)
    if (publicKey.length !== 6) {
      return NextResponse.json(
        { error: 'Public API Key deve ter 6 caracteres' },
        { status: 400 }
      );
    }

    console.log('[Klaviyo] Verifying API Keys...');
    console.log('[Klaviyo] Public Key:', publicKey);
    
    // Verify API key by fetching account info
    let accountData;
    try {
      accountData = await klaviyoFetch(apiKey, '/accounts/');
    } catch (fetchError: any) {
      console.error('[Klaviyo] API verification failed:', fetchError.message);
      return NextResponse.json(
        { error: `API Key inválida: ${fetchError.message}` },
        { status: 401 }
      );
    }

    if (!accountData.data || accountData.data.length === 0) {
      return NextResponse.json(
        { error: 'Não foi possível obter informações da conta Klaviyo' },
        { status: 400 }
      );
    }

    const account = accountData.data[0];
    const accountName = account.attributes?.contact_information?.organization_name || 
                        account.attributes?.contact_information?.default_sender_name ||
                        'Klaviyo Account';
    const accountId = account.id;

    console.log(`[Klaviyo] Account verified: ${accountName} (${accountId})`);

    // Get organization ID
    const organizationId = await getOrganizationId();

    // Get initial stats
    let totalProfiles = 0;
    let totalCampaigns = 0;
    let totalFlows = 0;
    let totalLists = 0;

    try {
      totalProfiles = await fetchProfileCount(apiKey);
      
      // Campaigns with email filter (REQUIRED)
      const campaignsRes = await klaviyoFetch(apiKey, '/campaigns?filter=equals(messages.channel,"email")&page[size]=1');
      totalCampaigns = campaignsRes.meta?.total || campaignsRes.data?.length || 0;
      
      const flowsRes = await klaviyoFetch(apiKey, '/flows?page[size]=1');
      totalFlows = flowsRes.data?.length || 0;
      if (flowsRes.links?.next) totalFlows = flowsRes.meta?.total || totalFlows;
      
      const listsRes = await klaviyoFetch(apiKey, '/lists?page[size]=1');
      totalLists = listsRes.data?.length || 0;
      
    } catch (e) {
      console.warn('[Klaviyo] Could not fetch initial stats:', e);
    }

    // Find metric ID for Placed Order
    const metricId = await findPlacedOrderMetricId(apiKey);
    console.log(`[Klaviyo] Metric ID found: ${metricId}`);

    // Save to database
    const { error: upsertError } = await supabase.from('klaviyo_accounts').upsert({
      organization_id: organizationId,
      api_key: apiKey,
      public_key: publicKey || null,
      account_id: accountId,
      account_name: accountName,
      is_active: true,
      total_profiles: totalProfiles,
      total_lists: totalLists,
      total_campaigns: totalCampaigns,
      total_flows: totalFlows,
      last_sync_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id',
    });

    if (upsertError) {
      console.error('[Klaviyo] Database error:', upsertError.message);
    }

    // Start background sync with metricId
    syncKlaviyoData(organizationId, apiKey, metricId).catch(err => {
      console.error('[Klaviyo] Background sync error:', err.message);
    });

    return NextResponse.json({
      success: true,
      account: {
        id: accountId,
        name: accountName,
        profiles: totalProfiles,
        campaigns: totalCampaigns,
        flows: totalFlows,
        lists: totalLists,
        metricId,
      },
    });
  } catch (error: any) {
    console.error('[Klaviyo] Connect error:', error);
    return NextResponse.json(
      { error: error.message || 'Falha ao conectar Klaviyo' },
      { status: 500 }
    );
  }
}

// ============================================
// GET - STATUS / SYNC / TEST
// ============================================
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  try {
    // Get Klaviyo account
    const { data: klaviyoAccounts } = await supabase
      .from('klaviyo_accounts')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    const klaviyoAccount = klaviyoAccounts?.[0];

    if (!klaviyoAccount) {
      return NextResponse.json(
        { error: 'Klaviyo não conectado', connected: false },
        { status: 404 }
      );
    }

    // TEST action - Debug Klaviyo API directly
    if (action === 'test') {
      const testResults: any = {
        timestamp: new Date().toISOString(),
        accountId: klaviyoAccount.account_id,
        accountName: klaviyoAccount.account_name,
        publicKey: klaviyoAccount.public_key || 'Não configurada',
        apiKeyPrefix: klaviyoAccount.api_key?.substring(0, 10) + '...',
        tests: {},
        requiredScopes: [
          'accounts:read',
          'campaigns:read', 
          'flows:read',
          'lists:read',
          'profiles:read',
          'metrics:read',
          'events:read',
          'segments:read'
        ],
        instructions: 'Se algum teste falhar com 403, a API Key não tem permissão. Crie uma nova key com Full Access ou os scopes listados acima.'
      };

      // Test 1: Get Account (requires accounts:read)
      try {
        const accountRes = await klaviyoFetch(klaviyoAccount.api_key, '/accounts');
        testResults.tests.accounts = {
          success: true,
          scope: 'accounts:read ✅',
          count: accountRes.data?.length || 0,
          data: accountRes.data?.[0]?.attributes?.contact_information || null
        };
      } catch (e: any) {
        testResults.tests.accounts = { 
          success: false, 
          scope: 'accounts:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope accounts:read'
        };
      }

      // Test 2: Get Lists (requires lists:read)
      try {
        const listsRes = await klaviyoFetch(klaviyoAccount.api_key, '/lists');
        testResults.tests.lists = {
          success: true,
          scope: 'lists:read ✅',
          count: listsRes.data?.length || 0,
          names: listsRes.data?.slice(0, 5).map((l: any) => l.attributes?.name) || []
        };
      } catch (e: any) {
        testResults.tests.lists = { 
          success: false, 
          scope: 'lists:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope lists:read'
        };
      }

      // Test 3: Get Campaigns (requires campaigns:read)
      try {
        const campsRes = await klaviyoFetch(
          klaviyoAccount.api_key, 
          '/campaigns?filter=equals(messages.channel,"email")'
        );
        testResults.tests.campaigns = {
          success: true,
          scope: 'campaigns:read ✅',
          count: campsRes.data?.length || 0,
          names: campsRes.data?.slice(0, 5).map((c: any) => ({
            name: c.attributes?.name,
            status: c.attributes?.status,
            sendTime: c.attributes?.send_time
          })) || []
        };
      } catch (e: any) {
        testResults.tests.campaigns = { 
          success: false, 
          scope: 'campaigns:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope campaigns:read'
        };
      }

      // Test 4: Get Flows (requires flows:read)
      try {
        const flowsRes = await klaviyoFetch(klaviyoAccount.api_key, '/flows');
        testResults.tests.flows = {
          success: true,
          scope: 'flows:read ✅',
          count: flowsRes.data?.length || 0,
          names: flowsRes.data?.slice(0, 5).map((f: any) => ({
            name: f.attributes?.name,
            status: f.attributes?.status,
            trigger: f.attributes?.trigger_type
          })) || []
        };
      } catch (e: any) {
        testResults.tests.flows = { 
          success: false, 
          scope: 'flows:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope flows:read'
        };
      }

      // Test 5: Get Metrics (requires metrics:read)
      try {
        const metricsRes = await klaviyoFetch(klaviyoAccount.api_key, '/metrics');
        const placedOrders = metricsRes.data?.filter((m: any) => 
          m.attributes?.name === 'Placed Order'
        ) || [];
        testResults.tests.metrics = {
          success: true,
          scope: 'metrics:read ✅',
          totalCount: metricsRes.data?.length || 0,
          placedOrderMetrics: placedOrders.map((m: any) => ({
            id: m.id,
            name: m.attributes?.name,
            integration: m.attributes?.integration?.name || m.attributes?.integration?.category
          })),
          importantMetrics: metricsRes.data?.slice(0, 10).map((m: any) => m.attributes?.name) || []
        };
      } catch (e: any) {
        testResults.tests.metrics = { 
          success: false, 
          scope: 'metrics:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope metrics:read'
        };
      }

      // Test 6: Get Profiles count (requires profiles:read)
      try {
        const profilesRes = await klaviyoFetch(
          klaviyoAccount.api_key, 
          '/profiles?page[size]=1'
        );
        testResults.tests.profiles = {
          success: true,
          scope: 'profiles:read ✅',
          totalCount: profilesRes.meta?.total || 0
        };
      } catch (e: any) {
        testResults.tests.profiles = { 
          success: false, 
          scope: 'profiles:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope profiles:read'
        };
      }

      // Test 7: Get Events count (requires events:read)
      try {
        const eventsRes = await klaviyoFetch(
          klaviyoAccount.api_key, 
          '/events?page[size]=1'
        );
        testResults.tests.events = {
          success: true,
          scope: 'events:read ✅',
          recentEvent: eventsRes.data?.[0]?.attributes?.event_properties?.['$event_id'] ? 'Há eventos' : 'Sem eventos recentes'
        };
      } catch (e: any) {
        testResults.tests.events = { 
          success: false, 
          scope: 'events:read ❌',
          error: e.message,
          fix: 'API Key precisa do scope events:read'
        };
      }

      // Summary
      const allTests = Object.values(testResults.tests) as any[];
      const passed = allTests.filter(t => t.success).length;
      const failed = allTests.filter(t => !t.success).length;
      
      testResults.summary = {
        passed,
        failed,
        total: allTests.length,
        status: failed === 0 ? '✅ TODAS AS PERMISSÕES OK' : `❌ ${failed} PERMISSÃO(ÕES) FALTANDO`,
        recommendation: failed > 0 
          ? 'Crie uma nova Private API Key com Full Access ou adicione os scopes faltando'
          : 'API Key configurada corretamente!'
      };

      return NextResponse.json(testResults);
    }

    // DEBUG: Test Reporting API directly
    if (action === 'debug-metrics') {
      console.log('[Klaviyo Debug] Testing Reporting API with RAW responses...');
      
      const debugResult: any = {
        timestamp: new Date().toISOString(),
        apiKey: klaviyoAccount.api_key.substring(0, 10) + '...',
      };

      // Calculate date range (last 30 days for testing)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      debugResult.dateRange = { start: startDateStr, end: endDateStr };

      // 1. Get campaigns list
      try {
        const campaignsRes = await klaviyoFetch(
          klaviyoAccount.api_key,
          '/campaigns?filter=equals(messages.channel,"email")'
        );
        const allCampaigns = campaignsRes.data || [];
        const sentCampaigns = allCampaigns.filter((c: any) => 
          (c.attributes?.status || '').toLowerCase() === 'sent'
        );
        
        debugResult.campaigns = {
          total: allCampaigns.length,
          sent: sentCampaigns.length,
          firstSentId: sentCampaigns[0]?.id || null,
          firstSentName: sentCampaigns[0]?.attributes?.name || null,
        };
      } catch (e: any) {
        debugResult.campaigns = { error: e.message };
      }

      // 2. Find Metric ID
      let metricId: string | null = null;
      try {
        const metricsRes = await klaviyoFetch(klaviyoAccount.api_key, '/metrics');
        const metrics = metricsRes.data || [];
        
        const placedOrder = metrics.find((m: any) => m.attributes?.name === 'Placed Order');
        metricId = placedOrder?.id || null;
        
        if (!metricId) {
          const orderMetric = metrics.find((m: any) => {
            const name = (m.attributes?.name || '').toLowerCase();
            return name.includes('order') || name.includes('purchase') || name.includes('pedido');
          });
          metricId = orderMetric?.id || null;
        }
        
        if (!metricId && metrics.length > 0) {
          metricId = metrics[0].id;
        }
        
        debugResult.metricId = {
          found: !!metricId,
          id: metricId,
          totalMetrics: metrics.length,
          first5Metrics: metrics.slice(0, 5).map((m: any) => ({
            id: m.id,
            name: m.attributes?.name
          }))
        };
      } catch (e: any) {
        debugResult.metricId = { error: e.message };
      }

      // 3. Test Campaign Values Report - RAW RESPONSE
      if (debugResult.campaigns?.firstSentId && metricId) {
        const campId = debugResult.campaigns.firstSentId;
        
        try {
          const body = {
            data: {
              type: 'campaign-values-report',
              attributes: {
                timeframe: {
                  start: startDateStr + 'T00:00:00Z',
                  end: endDateStr + 'T23:59:59Z'
                },
                conversion_metric_id: metricId,
                filter: `equals(campaign_id,"${campId}")`,
                statistics: ['conversion_value', 'conversions']
              }
            }
          };

          console.log('[Debug] Campaign request body:', JSON.stringify(body, null, 2));
          
          // Make RAW fetch to see exact response
          const rawResponse = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
            method: 'POST',
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoAccount.api_key}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'revision': '2024-10-15'
            },
            body: JSON.stringify(body)
          });
          
          const rawText = await rawResponse.text();
          let rawJson = null;
          try {
            rawJson = JSON.parse(rawText);
          } catch (e) {
            // Keep as text
          }
          
          debugResult.campaignTest = {
            status: rawResponse.status,
            statusText: rawResponse.statusText,
            requestBody: body,
            rawResponseText: rawText.substring(0, 2000),
            parsedResponse: rawJson,
            // Show the path to results
            dataPath: rawJson?.data,
            attributesPath: rawJson?.data?.attributes,
            resultsPath: rawJson?.data?.attributes?.results,
          };
        } catch (e: any) {
          debugResult.campaignTest = { error: e.message, stack: e.stack };
        }
      }

      // 4. Test Flow Values Report - RAW RESPONSE
      try {
        const flowsRes = await klaviyoFetch(klaviyoAccount.api_key, '/flows');
        const allFlows = flowsRes.data || [];
        const liveFlows = allFlows.filter((f: any) => 
          (f.attributes?.status || '').toLowerCase() === 'live'
        );
        
        debugResult.flows = {
          total: allFlows.length,
          live: liveFlows.length,
          firstLiveId: liveFlows[0]?.id || null,
          firstLiveName: liveFlows[0]?.attributes?.name || null,
        };
        
        if (liveFlows[0]?.id && metricId) {
          const flowId = liveFlows[0].id;
          
          const body = {
            data: {
              type: 'flow-values-report',
              attributes: {
                timeframe: {
                  start: startDateStr + 'T00:00:00Z',
                  end: endDateStr + 'T23:59:59Z'
                },
                conversion_metric_id: metricId,
                filter: `equals(flow_id,"${flowId}")`,
                statistics: ['conversion_value', 'conversions']
              }
            }
          };
          
          const rawResponse = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
            method: 'POST',
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoAccount.api_key}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'revision': '2024-10-15'
            },
            body: JSON.stringify(body)
          });
          
          const rawText = await rawResponse.text();
          let rawJson = null;
          try {
            rawJson = JSON.parse(rawText);
          } catch (e) {}
          
          debugResult.flowValuesTest = {
            status: rawResponse.status,
            requestBody: body,
            rawResponseText: rawText.substring(0, 2000),
            parsedResponse: rawJson,
            resultsPath: rawJson?.data?.attributes?.results,
          };
          
          // Also test flow-series-report for engagement metrics
          const seriesBody = {
            data: {
              type: 'flow-series-report',
              attributes: {
                timeframe: {
                  start: startDateStr + 'T00:00:00Z',
                  end: endDateStr + 'T23:59:59Z'
                },
                filter: `equals(flow_id,"${flowId}")`,
                statistics: ['opens_unique', 'clicks_unique', 'deliveries'],
                interval: 'day'
              }
            }
          };
          
          const seriesResponse = await fetch('https://a.klaviyo.com/api/flow-series-reports/', {
            method: 'POST',
            headers: {
              'Authorization': `Klaviyo-API-Key ${klaviyoAccount.api_key}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'revision': '2024-10-15'
            },
            body: JSON.stringify(seriesBody)
          });
          
          const seriesText = await seriesResponse.text();
          let seriesJson = null;
          try {
            seriesJson = JSON.parse(seriesText);
          } catch (e) {}
          
          debugResult.flowSeriesTest = {
            status: seriesResponse.status,
            requestBody: seriesBody,
            rawResponseText: seriesText.substring(0, 2000),
            parsedResponse: seriesJson,
            resultsPath: seriesJson?.data?.attributes?.results,
          };
        }
      } catch (e: any) {
        debugResult.flows = { error: e.message };
      }

      // 5. Check database
      const { data: dbCampaigns } = await supabase
        .from('campaign_metrics')
        .select('klaviyo_campaign_id, name, sent, revenue, conversions')
        .eq('organization_id', klaviyoAccount.organization_id)
        .limit(5);

      debugResult.database = {
        campaigns: dbCampaigns || []
      };

      return NextResponse.json(debugResult);
    }

    // ULTRA-MINIMAL SYNC - One campaign at a time to avoid timeout
    if (action === 'sync-one') {
      console.log('[Klaviyo] Sync-one: Processing single campaign...');
      const startTime = Date.now();
      
      // Get metric ID
      const metricId = await findPlacedOrderMetricId(klaviyoAccount.api_key);
      if (!metricId) {
        return NextResponse.json({ error: 'No metric ID found' }, { status: 400 });
      }

      // Get campaigns
      const campaignsRes = await klaviyoFetch(
        klaviyoAccount.api_key,
        '/campaigns?filter=equals(messages.channel,"email")'
      );
      const allCampaigns = campaignsRes.data || [];
      
      // Get sent campaigns sorted by date
      const sentCampaigns = allCampaigns
        .filter((c: any) => (c.attributes?.status || '').toLowerCase() === 'sent')
        .sort((a: any, b: any) => {
          const dateA = new Date(a.attributes?.send_time || 0);
          const dateB = new Date(b.attributes?.send_time || 0);
          return dateB.getTime() - dateA.getTime();
        });

      // Find first campaign that hasn't been synced yet (revenue = 0)
      const { data: dbCampaigns } = await supabase
        .from('campaign_metrics')
        .select('klaviyo_campaign_id, revenue')
        .eq('organization_id', klaviyoAccount.organization_id);
      
      const syncedIds = new Set(
        (dbCampaigns || [])
          .filter((c: any) => Number(c.revenue) > 0)
          .map((c: any) => c.klaviyo_campaign_id)
      );

      // Find next campaign to sync
      let targetCampaign = sentCampaigns.find((c: any) => !syncedIds.has(c.id));
      
      // If all are synced, just pick the first one
      if (!targetCampaign && sentCampaigns.length > 0) {
        targetCampaign = sentCampaigns[0];
      }

      if (!targetCampaign) {
        return NextResponse.json({ 
          success: true, 
          message: 'No campaigns to sync',
          duration: `${Date.now() - startTime}ms`
        });
      }

      // Save campaign to DB first
      await supabase.from('campaign_metrics').upsert({
        organization_id: klaviyoAccount.organization_id,
        klaviyo_campaign_id: targetCampaign.id,
        name: targetCampaign.attributes?.name || 'Unnamed',
        status: targetCampaign.attributes?.status || 'unknown',
        sent_at: targetCampaign.attributes?.send_time,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_campaign_id' });

      // Get metrics for this campaign
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365);
      
      const body = {
        data: {
          type: 'campaign-values-report',
          attributes: {
            timeframe: {
              start: startDate.toISOString().split('T')[0] + 'T00:00:00Z',
              end: endDate.toISOString().split('T')[0] + 'T23:59:59Z'
            },
            conversion_metric_id: metricId,
            filter: `equals(campaign_id,"${targetCampaign.id}")`,
            statistics: ['conversion_value', 'conversions']
          }
        }
      };

      const response = await klaviyoPost(klaviyoAccount.api_key, '/campaign-values-reports/', body);
      
      let revenue = 0;
      let conversions = 0;
      
      if (response?.data?.attributes?.results?.[0]) {
        const stats = response.data.attributes.results[0].statistics || {};
        revenue = stats.conversion_value || 0;
        conversions = stats.conversions || 0;
      }

      // Update DB
      await supabase.from('campaign_metrics').update({
        revenue,
        conversions,
        updated_at: new Date().toISOString(),
      }).eq('organization_id', klaviyoAccount.organization_id)
        .eq('klaviyo_campaign_id', targetCampaign.id);

      const duration = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        duration: `${duration}ms`,
        campaign: {
          id: targetCampaign.id,
          name: targetCampaign.attributes?.name,
          revenue,
          conversions,
        },
        remaining: sentCampaigns.length - syncedIds.size - 1,
        message: `Synced 1 campaign. Call again to sync more.`
      });
    }

    // Trigger quick sync if requested
    if (action === 'sync') {
      const syncErrors: string[] = [];
      const syncStart = Date.now();
      
      try {
        await quickSyncKlaviyoData(
          klaviyoAccount.organization_id,
          klaviyoAccount.api_key,
          syncErrors
        );
      } catch (err: any) {
        console.error('[Klaviyo] Sync error:', err.message);
        syncErrors.push(`Main error: ${err.message}`);
      }

      const syncDuration = Date.now() - syncStart;

      // Refresh account data
      const { data: refreshed, error: refreshError } = await supabase
        .from('klaviyo_accounts')
        .select('*')
        .eq('id', klaviyoAccount.id)
        .single();

      if (refreshError) {
        console.error('[Klaviyo] Refresh error:', refreshError.message);
      }

      // Get actual counts from database
      const { count: dbCampaigns } = await supabase
        .from('campaign_metrics')
        .select('id', { count: 'exact' })
        .eq('organization_id', klaviyoAccount.organization_id);

      const { count: dbFlows } = await supabase
        .from('flow_metrics')
        .select('id', { count: 'exact' })
        .eq('organization_id', klaviyoAccount.organization_id);

      const { count: dbLists } = await supabase
        .from('klaviyo_lists')
        .select('id', { count: 'exact' })
        .eq('organization_id', klaviyoAccount.organization_id);

      return NextResponse.json({
        connected: true,
        synced: true,
        syncDuration: `${syncDuration}ms`,
        errors: syncErrors.length > 0 ? syncErrors : undefined,
        account: {
          id: refreshed?.account_id || klaviyoAccount.account_id,
          name: refreshed?.account_name || klaviyoAccount.account_name,
          profiles: refreshed?.total_profiles || 0,
          campaigns: refreshed?.total_campaigns || 0,
          flows: refreshed?.total_flows || 0,
          lists: refreshed?.total_lists || 0,
          lastSync: refreshed?.last_sync_at || klaviyoAccount.last_sync_at,
          publicKey: refreshed?.public_key || null,
        },
        database: {
          campaigns: dbCampaigns || 0,
          flows: dbFlows || 0,
          lists: dbLists || 0,
        },
        debug: {
          organizationId: klaviyoAccount.organization_id,
          lastSyncBefore: klaviyoAccount.last_sync_at,
          lastSyncAfter: refreshed?.last_sync_at,
          updated: refreshed?.last_sync_at !== klaviyoAccount.last_sync_at
        }
      });
    }

    return NextResponse.json({
      connected: true,
      account: {
        id: klaviyoAccount.account_id,
        name: klaviyoAccount.account_name,
        profiles: klaviyoAccount.total_profiles,
        campaigns: klaviyoAccount.total_campaigns,
        flows: klaviyoAccount.total_flows,
        lists: klaviyoAccount.total_lists,
        lastSync: klaviyoAccount.last_sync_at,
      },
    });
  } catch (error: any) {
    console.error('[Klaviyo] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error' },
      { status: 500 }
    );
  }
}

// ============================================
// QUICK SYNC - With Reporting API for metrics
// ============================================

/**
 * Fetch campaign metrics using Reporting API
 * BASED ON WORKING WORKFLOW - uses specific date range and correct statistics
 */
async function fetchCampaignMetrics(
  apiKey: string, 
  campaignIds: string[], 
  metricId: string | null,
  startDate: string,
  endDate: string
): Promise<Map<string, any>> {
  const metricsMap = new Map<string, any>();
  
  if (campaignIds.length === 0 || !metricId) {
    console.log('[Klaviyo] Skipping campaign metrics - no campaigns or metric ID');
    return metricsMap;
  }
  
  console.log(`[Klaviyo] Fetching metrics for ${campaignIds.length} campaigns...`);
  console.log(`[Klaviyo] Date range: ${startDate} to ${endDate}`);
  console.log(`[Klaviyo] Using metric ID: ${metricId}`);
  
  // Process each campaign individually
  for (const campId of campaignIds) {
    try {
      // Use the EXACT format from the working workflow
      const body = {
        data: {
          type: 'campaign-values-report',
          attributes: {
            timeframe: {
              start: startDate + 'T00:00:00Z',
              end: endDate + 'T23:59:59Z'
            },
            conversion_metric_id: metricId,
            filter: `equals(campaign_id,"${campId}")`,
            statistics: ['conversion_value', 'conversions']
          }
        }
      };
      
      console.log(`[Klaviyo] Campaign ${campId} request...`);
      const response = await klaviyoPost(apiKey, '/campaign-values-reports/', body);
      
      if (response?.data?.attributes?.results?.[0]) {
        const stats = response.data.attributes.results[0].statistics || {};
        metricsMap.set(campId, {
          revenue: stats.conversion_value || 0,
          conversions: stats.conversions || 0,
        });
        console.log(`[Klaviyo] Campaign ${campId}: revenue=${stats.conversion_value}, conversions=${stats.conversions}`);
      } else {
        console.log(`[Klaviyo] Campaign ${campId}: no results`);
      }
      
    } catch (e: any) {
      console.error(`[Klaviyo] Campaign ${campId} error:`, e.message);
    }
  }
  
  console.log(`[Klaviyo] Got metrics for ${metricsMap.size}/${campaignIds.length} campaigns`);
  return metricsMap;
}

/**
 * Fetch flow metrics using Reporting API
 * SIMPLIFIED: Only use flow-values-report (flow-series-report has different params)
 */
async function fetchFlowMetrics(
  apiKey: string, 
  flowIds: string[], 
  metricId: string | null,
  startDate: string,
  endDate: string
): Promise<Map<string, any>> {
  const metricsMap = new Map<string, any>();
  
  if (flowIds.length === 0 || !metricId) {
    console.warn('[Klaviyo] Cannot fetch flow metrics - no flows or metric ID');
    return metricsMap;
  }
  
  console.log(`[Klaviyo] Fetching metrics for ${flowIds.length} flows...`);
  console.log(`[Klaviyo] Date range: ${startDate} to ${endDate}`);
  
  const timeframeStart = startDate + 'T00:00:00Z';
  const timeframeEnd = endDate + 'T23:59:59Z';
  
  // Process each flow individually
  for (const flowId of flowIds) {
    try {
      // Get revenue using flow-values-report
      const body = {
        data: {
          type: 'flow-values-report',
          attributes: {
            timeframe: {
              start: timeframeStart,
              end: timeframeEnd
            },
            conversion_metric_id: metricId,
            filter: `equals(flow_id,"${flowId}")`,
            statistics: ['conversion_value', 'conversions']
          }
        }
      };
      
      console.log(`[Klaviyo] Flow ${flowId} request...`);
      const response = await klaviyoPost(apiKey, '/flow-values-reports/', body);
      
      // Flow can have multiple messages, sum them all
      let totalRevenue = 0;
      let totalConversions = 0;
      
      if (response?.data?.attributes?.results) {
        for (const r of response.data.attributes.results) {
          if (r?.statistics) {
            totalRevenue += r.statistics.conversion_value || 0;
            totalConversions += r.statistics.conversions || 0;
          }
        }
      }
      
      metricsMap.set(flowId, {
        revenue: totalRevenue,
        conversions: totalConversions,
        // Set other fields to 0 since we can't get them from flow-values-report
        triggered: 0,
        received: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        open_rate: 0,
        click_rate: 0,
      });
      
      console.log(`[Klaviyo] Flow ${flowId}: revenue=${totalRevenue}, conversions=${totalConversions}`);
      
    } catch (e: any) {
      console.error(`[Klaviyo] Flow ${flowId} error:`, e.message);
    }
  }
  
  console.log(`[Klaviyo] Got metrics for ${metricsMap.size}/${flowIds.length} flows`);
  return metricsMap;
}

/**
 * ULTRA-FAST SYNC - Optimized for Vercel 60s timeout
 * - Saves basic info first (fast)
 * - Fetches metrics in parallel
 * - Maximum 10 campaigns + 5 flows for metrics
 */
async function quickSyncKlaviyoData(organizationId: string, apiKey: string, errors: string[] = []) {
  console.log('[Klaviyo Quick Sync] Starting ULTRA-FAST sync for org:', organizationId);
  const startTime = Date.now();
  
  let profileCount = 0;
  let listsCount = 0;
  let campaignsCount = 0;
  let flowsCount = 0;
  let metricId: string | null = null;

  // STEP 1: Get Metric ID and Profile count in parallel (fast)
  const [metricResult, profileResult] = await Promise.allSettled([
    findPlacedOrderMetricId(apiKey),
    klaviyoFetch(apiKey, '/profiles?page[size]=1')
  ]);
  
  if (metricResult.status === 'fulfilled') {
    metricId = metricResult.value;
    console.log(`[Klaviyo Quick Sync] Metric ID: ${metricId}`);
  }
  
  if (profileResult.status === 'fulfilled') {
    profileCount = profileResult.value.meta?.total || 0;
    console.log(`[Klaviyo Quick Sync] Profiles: ${profileCount}`);
  }

  // STEP 2: Get lists, campaigns, flows in parallel
  const [listsResult, campaignsResult, flowsResult] = await Promise.allSettled([
    klaviyoFetch(apiKey, '/lists'),
    klaviyoFetch(apiKey, '/campaigns?filter=equals(messages.channel,"email")'),
    klaviyoFetch(apiKey, '/flows')
  ]);

  // Process Lists - BATCH for speed
  if (listsResult.status === 'fulfilled') {
    const lists = listsResult.value.data || [];
    listsCount = lists.length;
    
    // Save lists in BATCH (no sequential awaits)
    const listRecords = lists.slice(0, 5).map((list: any) => ({
      organization_id: organizationId,
      klaviyo_list_id: list.id,
      name: list.attributes?.name || 'Unnamed List',
      profile_count: 0,
      opt_in_process: list.attributes?.opt_in_process || 'single_opt_in',
      updated_at: new Date().toISOString(),
    }));
    
    if (listRecords.length > 0) {
      await supabase.from('klaviyo_lists').upsert(listRecords, { 
        onConflict: 'organization_id,klaviyo_list_id' 
      });
    }
    console.log(`[Klaviyo Quick Sync] Saved ${listRecords.length} lists`);
  }

  // Process Campaigns
  const campaignIds: string[] = [];
  if (campaignsResult.status === 'fulfilled') {
    const allCampaigns = campaignsResult.value.data || [];
    
    // Get SENT campaigns for metrics (limit to 10 for speed)
    // Sort by send_time DESC (most recent first)
    const sentCampaigns = allCampaigns
      .filter((c: any) => (c.attributes?.status || '').toLowerCase() === 'sent')
      .sort((a: any, b: any) => {
        const dateA = new Date(a.attributes?.send_time || 0);
        const dateB = new Date(b.attributes?.send_time || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10); // 10 campaigns - we have 300s timeout now
    
    console.log(`[Klaviyo Quick Sync] Selected ${sentCampaigns.length} most recent sent campaigns for metrics:`);
    sentCampaigns.forEach((c: any, i: number) => {
      console.log(`  ${i+1}. ${c.id} - ${c.attributes?.name?.substring(0, 40)}`);
    });
    
    for (const camp of sentCampaigns) {
      campaignIds.push(camp.id);
    }
    
    // IMPORTANT: Save campaigns that we're getting metrics for FIRST
    // This ensures the update will find them in the database
    const campaignsToSave = new Map<string, any>();
    
    // Add the campaigns we're getting metrics for (priority)
    for (const camp of sentCampaigns) {
      campaignsToSave.set(camp.id, camp);
    }
    
    // Add other campaigns up to 30 total
    for (const camp of allCampaigns) {
      if (campaignsToSave.size >= 30) break;
      if (!campaignsToSave.has(camp.id)) {
        campaignsToSave.set(camp.id, camp);
      }
    }
    
    campaignsCount = campaignsToSave.size;
    
    // Batch insert for speed
    const campaignRecords = Array.from(campaignsToSave.values()).map((camp: any) => ({
      organization_id: organizationId,
      klaviyo_campaign_id: camp.id,
      name: camp.attributes?.name || 'Unnamed Campaign',
      status: camp.attributes?.status || 'unknown',
      sent_at: camp.attributes?.send_time || camp.attributes?.scheduled_time,
      updated_at: new Date().toISOString(),
    }));
    
    const { error: upsertError } = await supabase.from('campaign_metrics').upsert(campaignRecords, { 
      onConflict: 'organization_id,klaviyo_campaign_id' 
    });
    
    if (upsertError) {
      console.error(`[Klaviyo Quick Sync] Error saving campaigns:`, upsertError.message);
    } else {
      console.log(`[Klaviyo Quick Sync] Saved ${campaignsCount} campaigns (including ${sentCampaigns.length} for metrics)`);
    }
  }

  // Process Flows
  const flowIds: string[] = [];
  if (flowsResult.status === 'fulfilled') {
    const allFlows = flowsResult.value.data || [];
    
    // Get LIVE flows for metrics (limit to 5 for speed)
    const activeFlows = allFlows
      .filter((f: any) => {
        const status = (f.attributes?.status || '').toLowerCase();
        return status === 'live' || status === 'manual';
      })
      .slice(0, 5); // 5 flows - we have 300s timeout now
    
    console.log(`[Klaviyo Quick Sync] Selected ${activeFlows.length} active flows for metrics:`);
    activeFlows.forEach((f: any, i: number) => {
      console.log(`  ${i+1}. ${f.id} - ${f.attributes?.name?.substring(0, 40)}`);
    });
    
    for (const flow of activeFlows) {
      flowIds.push(flow.id);
    }
    
    // IMPORTANT: Save flows that we're getting metrics for FIRST
    const flowsToSave = new Map<string, any>();
    
    // Add the flows we're getting metrics for (priority)
    for (const flow of activeFlows) {
      flowsToSave.set(flow.id, flow);
    }
    
    // Add other flows up to 20 total
    for (const flow of allFlows) {
      if (flowsToSave.size >= 20) break;
      if (!flowsToSave.has(flow.id)) {
        flowsToSave.set(flow.id, flow);
      }
    }
    
    flowsCount = flowsToSave.size;
    
    // Batch insert for speed
    const flowRecords = Array.from(flowsToSave.values()).map((flow: any) => ({
      organization_id: organizationId,
      klaviyo_flow_id: flow.id,
      name: flow.attributes?.name || 'Unnamed Flow',
      status: flow.attributes?.status || 'unknown',
      trigger_type: flow.attributes?.trigger_type || null,
      updated_at: new Date().toISOString(),
    }));
    
    const { error: upsertError } = await supabase.from('flow_metrics').upsert(flowRecords, { 
      onConflict: 'organization_id,klaviyo_flow_id' 
    });
    
    if (upsertError) {
      console.error(`[Klaviyo Quick Sync] Error saving flows:`, upsertError.message);
    } else {
      console.log(`[Klaviyo Quick Sync] Saved ${flowsCount} flows (including ${activeFlows.length} for metrics)`);
    }
  }

  // STEP 3: Fetch metrics in PARALLEL (this is the slow part)
  // Calculate date range (last 365 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  console.log(`[Klaviyo Quick Sync] Fetching metrics for ${campaignIds.length} campaigns and ${flowIds.length} flows...`);
  console.log(`[Klaviyo Quick Sync] Date range: ${startDateStr} to ${endDateStr}`);
  
  const [campaignMetricsResult, flowMetricsResult] = await Promise.allSettled([
    campaignIds.length > 0 ? fetchCampaignMetrics(apiKey, campaignIds, metricId, startDateStr, endDateStr) : Promise.resolve(new Map()),
    flowIds.length > 0 ? fetchFlowMetrics(apiKey, flowIds, metricId, startDateStr, endDateStr) : Promise.resolve(new Map())
  ]);

  // Update campaign metrics
  if (campaignMetricsResult.status === 'fulfilled') {
    const campaignMetrics = campaignMetricsResult.value;
    let updatedCount = 0;
    
    console.log(`[Klaviyo Quick Sync] Updating ${campaignMetrics.size} campaigns with metrics...`);
    
    for (const [campId, metrics] of campaignMetrics) {
      console.log(`[Klaviyo Quick Sync] Updating campaign ${campId}: revenue=${metrics.revenue}, conversions=${metrics.conversions}`);
      
      const { error, data } = await supabase.from('campaign_metrics').update({
        revenue: metrics.revenue || 0,
        conversions: metrics.conversions || 0,
        updated_at: new Date().toISOString(),
      }).eq('organization_id', organizationId).eq('klaviyo_campaign_id', campId).select();
      
      if (error) {
        console.error(`[Klaviyo Quick Sync] Update error for ${campId}:`, error.message);
      } else if (data && data.length > 0) {
        updatedCount++;
        console.log(`[Klaviyo Quick Sync] Successfully updated ${campId}`);
      } else {
        console.warn(`[Klaviyo Quick Sync] No rows updated for ${campId} - campaign may not exist in DB`);
      }
    }
    
    console.log(`[Klaviyo Quick Sync] Updated ${updatedCount}/${campaignMetrics.size} campaigns with metrics`);
  } else {
    console.error('[Klaviyo Quick Sync] Campaign metrics fetch failed:', 
      campaignMetricsResult.status === 'rejected' ? campaignMetricsResult.reason : 'unknown');
  }

  // Update flow metrics
  if (flowMetricsResult.status === 'fulfilled') {
    const flowMetrics = flowMetricsResult.value;
    let updatedCount = 0;
    
    for (const [flowId, metrics] of flowMetrics) {
      const { error } = await supabase.from('flow_metrics').update({
        triggered: metrics.triggered,
        received: metrics.received,
        opened: metrics.opened,
        clicked: metrics.clicked,
        bounced: metrics.bounced,
        unsubscribed: metrics.unsubscribed,
        open_rate: metrics.open_rate,
        click_rate: metrics.click_rate,
        revenue: metrics.revenue,
        conversions: metrics.conversions,
        updated_at: new Date().toISOString(),
      }).eq('organization_id', organizationId).eq('klaviyo_flow_id', flowId);
      
      if (!error) updatedCount++;
    }
    
    console.log(`[Klaviyo Quick Sync] Updated ${updatedCount} flows with metrics`);
  }

  // STEP 4: Update account stats
  const now = new Date().toISOString();
  await supabase
    .from('klaviyo_accounts')
    .update({
      total_profiles: profileCount,
      total_campaigns: campaignsCount,
      total_flows: flowsCount,
      total_lists: listsCount,
      last_sync_at: now,
    })
    .eq('organization_id', organizationId);

  const duration = Date.now() - startTime;
  console.log(`[Klaviyo Quick Sync] Complete in ${duration}ms!`);

  return {
    success: true,
    syncDuration: `${duration}ms`,
    metricId,
    database: {
      profiles: profileCount,
      lists: listsCount,
      campaigns: campaignsCount,
      flows: flowsCount,
    },
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================
// FULL SYNC FUNCTION
// ============================================
/**
 * Sincronização completa baseada no workflow n8n
 * 1. Busca metric ID
 * 2. Sync campanhas com revenue (via Reporting API)
 * 3. Sync flows com revenue e performance
 * 4. Sync listas
 * 5. Atualiza estatísticas
 */
async function syncKlaviyoData(
  organizationId: string, 
  apiKey: string,
  metricId: string | null
) {
  console.log(`[Klaviyo Sync] Starting full sync for org ${organizationId}...`);
  
  // Calculate date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  try {
    // Find metric if not provided
    if (!metricId) {
      metricId = await findPlacedOrderMetricId(apiKey);
    }
    
    // Sync campaigns with revenue
    if (metricId) {
      const campaigns = await fetchCampaignsWithRevenue(apiKey, metricId, startStr, endStr);
      
      for (const camp of campaigns) {
        await supabase.from('campaign_metrics').upsert({
          organization_id: organizationId,
          klaviyo_campaign_id: camp.klaviyo_campaign_id,
          name: camp.name,
          status: camp.status,
          recipients: camp.recipients,
          sent: camp.sent,
          delivered: camp.delivered,
          opened: camp.opened,
          clicked: camp.clicked,
          bounced: camp.bounced,
          unsubscribed: camp.unsubscribed,
          open_rate: camp.open_rate,
          click_rate: camp.click_rate,
          revenue: camp.revenue,
          conversions: camp.conversions,
          sent_at: camp.sent_at,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,klaviyo_campaign_id' });
      }
      
      console.log(`[Klaviyo Sync] Synced ${campaigns.length} campaigns`);
    }

    // Sync flows with revenue and performance
    if (metricId) {
      const { flows } = await fetchFlowsWithRevenue(apiKey, metricId, startStr, endStr);
      
      for (const flow of flows) {
        await supabase.from('flow_metrics').upsert({
          organization_id: organizationId,
          klaviyo_flow_id: flow.klaviyo_flow_id,
          name: flow.name,
          status: flow.status,
          triggered: flow.triggered,
          received: flow.received,
          opened: flow.opened,
          clicked: flow.clicked,
          bounced: flow.bounced,
          unsubscribed: flow.unsubscribed,
          open_rate: flow.open_rate,
          click_rate: flow.click_rate,
          revenue: flow.revenue,
          conversions: flow.conversions,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,klaviyo_flow_id' });
      }
      
      console.log(`[Klaviyo Sync] Synced ${flows.length} flows`);
    }

    // Sync lists
    const lists = await fetchLists(apiKey);
    
    for (const list of lists) {
      await supabase.from('klaviyo_lists').upsert({
        organization_id: organizationId,
        klaviyo_list_id: list.klaviyo_list_id,
        name: list.name,
        profile_count: list.profile_count,
        opt_in_process: list.opt_in_process,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_list_id' });
    }
    
    console.log(`[Klaviyo Sync] Synced ${lists.length} lists`);

    // Update account stats
    const profileCount = await fetchProfileCount(apiKey);
    
    const campaignCount = await supabase
      .from('campaign_metrics')
      .select('id', { count: 'exact' })
      .eq('organization_id', organizationId);
    
    const flowCount = await supabase
      .from('flow_metrics')
      .select('id', { count: 'exact' })
      .eq('organization_id', organizationId);
    
    await supabase.from('klaviyo_accounts').update({
      total_profiles: profileCount,
      total_campaigns: campaignCount.count || 0,
      total_flows: flowCount.count || 0,
      total_lists: lists.length,
      last_sync_at: new Date().toISOString(),
    }).eq('organization_id', organizationId);

    console.log(`[Klaviyo Sync] Complete!`);
    
  } catch (error: any) {
    console.error('[Klaviyo Sync] Error:', error.message);
    throw error;
  }
}

// ============================================
// DELETE - DISCONNECT
// ============================================
export async function DELETE(request: NextRequest) {
  try {
    const { data: account } = await supabase
      .from('klaviyo_accounts')
      .select('organization_id')
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (!account?.organization_id) {
      return NextResponse.json({ error: 'Klaviyo não conectado' }, { status: 404 });
    }

    const orgId = account.organization_id;

    // Delete all related data
    await Promise.all([
      supabase.from('klaviyo_accounts').delete().eq('organization_id', orgId),
      supabase.from('campaign_metrics').delete().eq('organization_id', orgId),
      supabase.from('flow_metrics').delete().eq('organization_id', orgId),
      supabase.from('klaviyo_lists').delete().eq('organization_id', orgId),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Klaviyo] Disconnect error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
