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
  retries = 5
): Promise<any> {
  let attempt = 0;

  while (attempt < retries) {
    if (attempt > 0) {
      // Exponential backoff: 1.5s, 3s, 6s, 8s (max)
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 8000);
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
 * Adiciona delay para evitar rate limiting
 */
async function klaviyoPost(apiKey: string, endpoint: string, body: any): Promise<any> {
  await sleep(100); // Small delay to avoid rate limiting
  
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
 * Precisamos encontrar dinamicamente qual métrica "Placed Order" usar.
 * Se houver múltiplas (Shopify, WooCommerce, etc), testamos qual tem dados.
 */
async function findPlacedOrderMetricId(apiKey: string): Promise<string | null> {
  console.log('[Klaviyo] Searching for Placed Order metric...');
  
  try {
    const response = await klaviyoFetch(apiKey, '/metrics');
    const metrics = response.data || [];
    
    // Find metrics named "Placed Order"
    const placedOrders = metrics.filter((m: any) => 
      m.attributes?.name === 'Placed Order'
    );
    
    if (placedOrders.length === 0) {
      console.log('[Klaviyo] No Placed Order metric found');
      return null;
    }
    
    if (placedOrders.length === 1) {
      console.log(`[Klaviyo] Found metric: ${placedOrders[0].id}`);
      return placedOrders[0].id;
    }
    
    // Multiple metrics - test which has data (como no workflow)
    console.log(`[Klaviyo] Found ${placedOrders.length} Placed Order metrics, testing...`);
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (const metric of placedOrders.slice(0, 3)) {
      try {
        const testBody = {
          data: {
            type: 'flow-values-report',
            attributes: {
              timeframe: {
                start: thirtyDaysAgo.toISOString(),
                end: now.toISOString()
              },
              conversion_metric_id: metric.id,
              statistics: ['conversion_value']
            }
          }
        };
        
        const testRes = await klaviyoPost(apiKey, '/flow-values-reports/', testBody);
        const results = testRes?.data?.attributes?.results || [];
        const total = results.reduce((sum: number, r: any) => 
          sum + (r.statistics?.conversion_value || 0), 0
        );
        
        if (total > 0) {
          console.log(`[Klaviyo] Selected metric ${metric.id} with revenue ${total}`);
          return metric.id;
        }
      } catch (e) {
        // Continue to next metric
      }
    }
    
    // Return first one as fallback
    return placedOrders[0].id;
    
  } catch (error: any) {
    console.error('[Klaviyo] Error finding metric:', error.message);
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
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key é obrigatória' },
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

    console.log('[Klaviyo] Verifying API Key...');
    
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
// GET - STATUS / SYNC
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

    // Trigger quick sync if requested
    if (action === 'sync') {
      try {
        await quickSyncKlaviyoData(
          klaviyoAccount.organization_id,
          klaviyoAccount.api_key
        );
      } catch (err: any) {
        console.error('[Klaviyo] Sync error:', err.message);
        // Don't fail the request, just log
      }

      // Refresh account data
      const { data: refreshed } = await supabase
        .from('klaviyo_accounts')
        .select('*')
        .eq('id', klaviyoAccount.id)
        .single();

      return NextResponse.json({
        connected: true,
        synced: true,
        account: {
          id: refreshed?.account_id || klaviyoAccount.account_id,
          name: refreshed?.account_name || klaviyoAccount.account_name,
          profiles: refreshed?.total_profiles || 0,
          campaigns: refreshed?.total_campaigns || 0,
          flows: refreshed?.total_flows || 0,
          lists: refreshed?.total_lists || 0,
          lastSync: refreshed?.last_sync_at || new Date().toISOString(),
        },
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
// QUICK SYNC - Simplified version for Vercel timeout
// ============================================
async function quickSyncKlaviyoData(organizationId: string, apiKey: string) {
  console.log('[Klaviyo Quick Sync] Starting...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  let profileCount = 0;
  let lists: any[] = [];
  let metricId: string | null = null;

  // 1. Get profile count (quick)
  try {
    profileCount = await fetchProfileCount(apiKey);
  } catch (e: any) {
    console.error('[Klaviyo Quick Sync] Profile count error:', e.message);
  }
  
  // 2. Get lists (quick)
  try {
    lists = await fetchLists(apiKey);
    for (const list of lists.slice(0, 5)) { // Limit to 5 lists
      await supabase.from('klaviyo_lists').upsert({
        organization_id: organizationId,
        klaviyo_list_id: list.klaviyo_list_id,
        name: list.name,
        profile_count: list.profile_count,
        opt_in_process: list.opt_in_process,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_list_id' });
    }
    console.log(`[Klaviyo Quick Sync] Synced ${Math.min(lists.length, 5)} lists`);
  } catch (e: any) {
    console.error('[Klaviyo Quick Sync] Lists error:', e.message);
  }

  // 3. Get metric ID (needed for revenue)
  try {
    metricId = await findPlacedOrderMetricId(apiKey);
  } catch (e: any) {
    console.error('[Klaviyo Quick Sync] Metric ID error:', e.message);
  }
  
  // 4. Get campaigns (simplified - without individual revenue calls)
  try {
    const response = await klaviyoFetch(
      apiKey, 
      '/campaigns?filter=equals(messages.channel,"email")'
    );
    
    const allCampaigns = response.data || [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    end.setHours(23, 59, 59, 999);
    
    // Filter and limit campaigns
    const campaignsInPeriod = allCampaigns
      .filter((camp: any) => {
        const sendTime = camp.attributes?.send_time;
        if (!sendTime) return false;
        const campDate = new Date(sendTime);
        return campDate >= start && campDate <= end && !camp.attributes?.archived;
      })
      .slice(0, 5); // Limit to 5 campaigns for speed
    
    for (const camp of campaignsInPeriod) {
      await supabase.from('campaign_metrics').upsert({
        organization_id: organizationId,
        klaviyo_campaign_id: camp.id,
        name: camp.attributes?.name || 'Unnamed Campaign',
        status: camp.attributes?.status || 'unknown',
        sent_at: camp.attributes?.send_time,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_campaign_id' });
    }
    console.log(`[Klaviyo Quick Sync] Synced ${campaignsInPeriod.length} campaigns (basic info)`);
  } catch (e: any) {
    console.error('[Klaviyo Quick Sync] Campaign error:', e.message);
  }

  // 5. Get flows (simplified - without individual revenue calls)
  try {
    const response = await klaviyoFetch(apiKey, '/flows');
    const allFlows = (response.data || [])
      .filter((f: any) => f.attributes?.status !== 'draft')
      .slice(0, 5); // Limit to 5 flows
    
    for (const flow of allFlows) {
      await supabase.from('flow_metrics').upsert({
        organization_id: organizationId,
        klaviyo_flow_id: flow.id,
        name: flow.attributes?.name || 'Unnamed Flow',
        status: flow.attributes?.status || 'unknown',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_flow_id' });
    }
    console.log(`[Klaviyo Quick Sync] Synced ${allFlows.length} flows (basic info)`);
  } catch (e: any) {
    console.error('[Klaviyo Quick Sync] Flow error:', e.message);
  }

  // 6. Update account stats
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

  console.log('[Klaviyo Quick Sync] Complete!');
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
