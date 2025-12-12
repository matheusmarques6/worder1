import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

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

const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-02-15';

// Klaviyo API helper
async function klaviyoFetch(
  apiKey: string,
  endpoint: string,
  options: RequestInit = {}
) {
  const url = endpoint.startsWith('http') ? endpoint : `${KLAVIYO_API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      revision: KLAVIYO_REVISION,
      accept: 'application/json',
      ...options.headers,
    },
  });

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
}

// Get organization ID (from Shopify stores or create default)
async function getOrganizationId(): Promise<string> {
  // Try to get from existing Shopify store
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('organization_id')
    .limit(1)
    .single();

  if (store?.organization_id) {
    return store.organization_id;
  }

  // Try to get existing organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single();

  if (org?.id) {
    return org.id;
  }

  // Create default organization
  const { data: newOrg, error } = await supabase
    .from('organizations')
    .insert({
      name: 'Default Organization',
      slug: 'default-org-' + Date.now(),
    })
    .select('id')
    .single();

  if (error || !newOrg) {
    return crypto.randomUUID();
  }

  return newOrg.id;
}

// Connect Klaviyo account
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
    let totalLists = 0;
    let totalCampaigns = 0;
    let totalFlows = 0;

    try {
      // Get profile count
      const profilesRes = await klaviyoFetch(apiKey, '/profiles/?page[size]=1');
      totalProfiles = profilesRes.meta?.total || 0;

      // Get lists count
      const listsRes = await klaviyoFetch(apiKey, '/lists/?page[size]=1');
      totalLists = listsRes.data?.length || 0;
      if (listsRes.links?.next) totalLists = listsRes.meta?.total || totalLists;

      // Get campaigns count
      const campaignsRes = await klaviyoFetch(apiKey, '/campaigns/?page[size]=1');
      totalCampaigns = campaignsRes.data?.length || 0;
      if (campaignsRes.links?.next) totalCampaigns = campaignsRes.meta?.total || totalCampaigns;

      // Get flows count
      const flowsRes = await klaviyoFetch(apiKey, '/flows/?page[size]=1');
      totalFlows = flowsRes.data?.length || 0;
    } catch (e) {
      console.warn('[Klaviyo] Could not fetch initial stats:', e);
    }

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
      // Continue anyway - API verified successfully
    }

    console.log(`[Klaviyo] Account saved to database`);

    // Start async sync of campaigns and flows
    syncKlaviyoData(organizationId, apiKey).catch(err => {
      console.error('[Klaviyo] Background sync error:', err.message);
    });

    return NextResponse.json({
      success: true,
      account: {
        id: accountId,
        name: accountName,
        profiles: totalProfiles,
        lists: totalLists,
        campaigns: totalCampaigns,
        flows: totalFlows,
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

// Sync Klaviyo data
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const action = request.nextUrl.searchParams.get('action');

  // If no organizationId, try to get from existing account
  let orgId = organizationId;
  
  try {
    if (!orgId) {
      const { data: account } = await supabase
        .from('klaviyo_accounts')
        .select('organization_id, api_key')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!account) {
        return NextResponse.json(
          { error: 'Klaviyo não conectado' },
          { status: 404 }
        );
      }
      
      orgId = account.organization_id;
    }

    // Get Klaviyo account
    const { data: klaviyoAccount } = await supabase
      .from('klaviyo_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (!klaviyoAccount) {
      return NextResponse.json(
        { error: 'Klaviyo não conectado' },
        { status: 404 }
      );
    }

    if (action === 'sync') {
      // Full sync
      await syncKlaviyoData(orgId!, klaviyoAccount.api_key);
      
      return NextResponse.json({ 
        success: true,
        message: 'Sincronização concluída',
      });
    }

    // Return current stats
    return NextResponse.json({
      success: true,
      account: {
        id: klaviyoAccount.account_id,
        name: klaviyoAccount.account_name,
        profiles: klaviyoAccount.total_profiles,
        lists: klaviyoAccount.total_lists,
        campaigns: klaviyoAccount.total_campaigns,
        flows: klaviyoAccount.total_flows,
        lastSync: klaviyoAccount.last_sync_at,
      },
    });
  } catch (error: any) {
    console.error('[Klaviyo] Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

// Full sync function
async function syncKlaviyoData(organizationId: string, apiKey: string) {
  console.log(`[Klaviyo Sync] Starting full sync for org ${organizationId}...`);

  try {
    // Sync campaigns
    await syncCampaigns(organizationId, apiKey);

    // Sync flows
    await syncFlows(organizationId, apiKey);

    // Sync lists
    await syncLists(organizationId, apiKey);

    // Update account stats
    const [campaignsCount, flowsCount, listsCount, profilesCount] = await Promise.all([
      supabase.from('campaign_metrics').select('id', { count: 'exact' }).eq('organization_id', organizationId),
      supabase.from('flow_metrics').select('id', { count: 'exact' }).eq('organization_id', organizationId),
      supabase.from('klaviyo_lists').select('id', { count: 'exact' }).eq('organization_id', organizationId),
      klaviyoFetch(apiKey, '/profiles/?page[size]=1').then(r => r.meta?.total || 0).catch(() => 0),
    ]);

    await supabase
      .from('klaviyo_accounts')
      .update({
        total_campaigns: campaignsCount.count || 0,
        total_flows: flowsCount.count || 0,
        total_lists: listsCount.count || 0,
        total_profiles: profilesCount,
        last_sync_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);

    console.log(`[Klaviyo Sync] Complete`);
  } catch (error: any) {
    console.error('[Klaviyo Sync] Error:', error.message);
    throw error;
  }
}

// Sync campaigns with metrics
async function syncCampaigns(organizationId: string, apiKey: string) {
  console.log('[Klaviyo Sync] Syncing campaigns...');
  
  let cursor: string | null = null;
  let totalSynced = 0;

  do {
    const params = new URLSearchParams({
      'fields[campaign]': 'name,status,send_time,created_at,updated_at,archived',
      'page[size]': '50',
    });
    
    if (cursor) params.set('page[cursor]', cursor);

    const response = await klaviyoFetch(apiKey, `/campaigns/?${params.toString()}`);

    for (const campaign of response.data || []) {
      try {
        // Skip archived campaigns
        if (campaign.attributes.archived) continue;

        // Get campaign statistics
        let stats: any = {};
        try {
          // Use the metrics aggregation endpoint for campaign metrics
          const metricsRes = await klaviyoFetch(apiKey, `/campaigns/${campaign.id}/`);
          
          // Try to get send info if available
          if (metricsRes.data?.attributes?.send_options) {
            stats = metricsRes.data.attributes.send_options;
          }
        } catch (e) {
          // Metrics might not be available for all campaigns
        }

        // Calculate rates
        const sent = stats.sent || 0;
        const openRate = sent > 0 ? ((stats.opened || 0) / sent) * 100 : 0;
        const clickRate = sent > 0 ? ((stats.clicked || 0) / sent) * 100 : 0;

        await supabase.from('campaign_metrics').upsert({
          organization_id: organizationId,
          klaviyo_campaign_id: campaign.id,
          name: campaign.attributes.name,
          status: campaign.attributes.status,
          recipients: stats.recipients || 0,
          sent: stats.sent || 0,
          delivered: stats.delivered || 0,
          opened: stats.opened || 0,
          clicked: stats.clicked || 0,
          bounced: stats.bounced || 0,
          unsubscribed: stats.unsubscribed || 0,
          open_rate: openRate,
          click_rate: clickRate,
          revenue: parseFloat(stats.revenue || '0'),
          conversions: stats.conversions || 0,
          sent_at: campaign.attributes.send_time,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,klaviyo_campaign_id' });

        totalSynced++;
      } catch (e: any) {
        console.warn(`[Klaviyo Sync] Error syncing campaign ${campaign.id}:`, e.message);
      }
    }

    // Get next page cursor
    cursor = null;
    if (response.links?.next) {
      try {
        const nextUrl = new URL(response.links.next);
        cursor = nextUrl.searchParams.get('page[cursor]');
      } catch {}
    }
  } while (cursor);

  console.log(`[Klaviyo Sync] Synced ${totalSynced} campaigns`);
}

// Sync flows with metrics
async function syncFlows(organizationId: string, apiKey: string) {
  console.log('[Klaviyo Sync] Syncing flows...');
  
  const response = await klaviyoFetch(apiKey, '/flows/?fields[flow]=name,status,created,updated,archived');
  let totalSynced = 0;

  for (const flow of response.data || []) {
    try {
      // Skip archived flows
      if (flow.attributes.archived) continue;

      // Try to get flow metrics
      let stats: any = {};
      try {
        const flowDetails = await klaviyoFetch(apiKey, `/flows/${flow.id}/`);
        stats = flowDetails.data?.attributes || {};
      } catch {}

      const triggered = stats.triggered || 0;
      const openRate = triggered > 0 ? ((stats.opened || 0) / triggered) * 100 : 0;
      const clickRate = triggered > 0 ? ((stats.clicked || 0) / triggered) * 100 : 0;

      await supabase.from('flow_metrics').upsert({
        organization_id: organizationId,
        klaviyo_flow_id: flow.id,
        name: flow.attributes.name,
        status: flow.attributes.status,
        triggered: stats.triggered || 0,
        received: stats.received || 0,
        opened: stats.opened || 0,
        clicked: stats.clicked || 0,
        bounced: stats.bounced || 0,
        unsubscribed: stats.unsubscribed || 0,
        open_rate: openRate,
        click_rate: clickRate,
        revenue: parseFloat(stats.revenue || '0'),
        conversions: stats.conversions || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_flow_id' });

      totalSynced++;
    } catch (e: any) {
      console.warn(`[Klaviyo Sync] Error syncing flow ${flow.id}:`, e.message);
    }
  }

  console.log(`[Klaviyo Sync] Synced ${totalSynced} flows`);
}

// Sync lists
async function syncLists(organizationId: string, apiKey: string) {
  console.log('[Klaviyo Sync] Syncing lists...');
  
  const response = await klaviyoFetch(apiKey, '/lists/?fields[list]=name,created,updated,opt_in_process');
  let totalSynced = 0;

  for (const list of response.data || []) {
    try {
      // Get profile count for this list
      let profileCount = 0;
      try {
        const profilesRes = await klaviyoFetch(apiKey, `/lists/${list.id}/profiles/?page[size]=1`);
        profileCount = profilesRes.meta?.total || 0;
      } catch {}

      await supabase.from('klaviyo_lists').upsert({
        organization_id: organizationId,
        klaviyo_list_id: list.id,
        name: list.attributes.name,
        profile_count: profileCount,
        opt_in_process: list.attributes.opt_in_process || 'single_opt_in',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,klaviyo_list_id' });

      totalSynced++;
    } catch (e: any) {
      console.warn(`[Klaviyo Sync] Error syncing list ${list.id}:`, e.message);
    }
  }

  console.log(`[Klaviyo Sync] Synced ${totalSynced} lists`);
}

// Disconnect Klaviyo
export async function DELETE(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');

  try {
    let orgId = organizationId;
    
    if (!orgId) {
      // Get from existing account
      const { data: account } = await supabase
        .from('klaviyo_accounts')
        .select('organization_id')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      orgId = account?.organization_id;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Klaviyo não conectado' },
        { status: 404 }
      );
    }

    // Delete account and related data
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
