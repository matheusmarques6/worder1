import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase, user } = auth;
    const organizationId = user.organization_id;
    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get('dateRange') || '7d';
    const accountId = searchParams.get('accountId');

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    switch (dateRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get Google Ads accounts
    const { data: accounts } = await supabase
      .from('google_ads_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        hasData: false,
        accounts: [],
        kpis: null,
        campaigns: [],
        campaignTypes: [],
        keywords: [],
        products: [],
        searchTerms: [],
      });
    }

    const selectedAccountId = accountId || accounts[0]?.id;

    // Get campaigns
    const { data: campaigns } = await supabase
      .from('google_ads_campaigns')
      .select('*')
      .eq('google_ads_account_id', selectedAccountId)
      .order('name');

    // Get aggregated metrics
    const { data: metrics } = await supabase
      .from('google_ads_metrics')
      .select('*')
      .eq('google_ads_account_id', selectedAccountId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0]);

    // Calculate KPIs
    const kpis = calculateKPIs(metrics || []);

    // Get campaign metrics
    const campaignMetrics = aggregateCampaignMetrics(campaigns || [], metrics || []);

    // Get campaign type breakdown
    const campaignTypes = aggregateCampaignTypes(campaigns || [], metrics || []);

    // Get keywords with metrics
    const { data: keywords } = await supabase
      .from('google_ads_keywords')
      .select(`
        *,
        ad_group:google_ads_ad_groups(
          campaign:google_ads_campaigns(id, name)
        )
      `)
      .limit(20);

    // Get search terms
    const { data: searchTerms } = await supabase
      .from('google_ads_search_terms')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .order('clicks', { ascending: false })
      .limit(20);

    // Get products (Shopping)
    const { data: products } = await supabase
      .from('google_ads_products')
      .select(`
        *,
        metrics:google_ads_product_metrics(*)
      `)
      .eq('google_ads_account_id', selectedAccountId)
      .limit(20);

    return NextResponse.json({
      hasData: true,
      accounts,
      selectedAccountId,
      kpis,
      campaigns: campaignMetrics,
      campaignTypes,
      keywords: keywords || [],
      products: products || [],
      searchTerms: searchTerms || [],
    });

  } catch (error) {
    console.error('Error fetching Google Ads data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Ads data' },
      { status: 500 }
    );
  }
}

function calculateKPIs(metrics: any[]) {
  if (!metrics.length) return null;

  const totals = metrics.reduce((acc, m) => ({
    impressions: acc.impressions + (m.impressions || 0),
    clicks: acc.clicks + (m.clicks || 0),
    cost: acc.cost + parseFloat(m.cost || 0),
    conversions: acc.conversions + parseFloat(m.conversions || 0),
    conversion_value: acc.conversion_value + parseFloat(m.conversion_value || 0),
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 });

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
  const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
  const roas = totals.cost > 0 ? totals.conversion_value / totals.cost : 0;
  const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;

  return {
    cost: totals.cost,
    impressions: totals.impressions,
    clicks: totals.clicks,
    ctr,
    cpc,
    conversions: totals.conversions,
    conversionRate,
    cpa,
    conversionValue: totals.conversion_value,
    roas,
  };
}

function aggregateCampaignMetrics(campaigns: any[], metrics: any[]) {
  return campaigns.map(campaign => {
    const campaignMetrics = metrics.filter(m => m.campaign_id === campaign.id);
    const totals = campaignMetrics.reduce((acc, m) => ({
      impressions: acc.impressions + (m.impressions || 0),
      clicks: acc.clicks + (m.clicks || 0),
      cost: acc.cost + parseFloat(m.cost || 0),
      conversions: acc.conversions + parseFloat(m.conversions || 0),
      conversion_value: acc.conversion_value + parseFloat(m.conversion_value || 0),
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 });

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    const roas = totals.cost > 0 ? totals.conversion_value / totals.cost : 0;

    // Get latest quality score
    const lastMetric = campaignMetrics.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.campaign_type,
      status: campaign.status === 'ENABLED' ? 'active' : 'paused',
      budget: campaign.budget_amount ? `R$ ${campaign.budget_amount}/dia` : '-',
      spend: `R$ ${totals.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      impressions: formatNumber(totals.impressions),
      clicks: formatNumber(totals.clicks),
      ctr: `${ctr.toFixed(2)}%`,
      cpc: `R$ ${cpc.toFixed(2)}`,
      conversions: Math.round(totals.conversions),
      roas: `${roas.toFixed(1)}x`,
      qualityScore: lastMetric?.quality_score || null,
    };
  });
}

function aggregateCampaignTypes(campaigns: any[], metrics: any[]) {
  const types: Record<string, { spend: number; conversions: number; value: number }> = {};

  campaigns.forEach(campaign => {
    const type = campaign.campaign_type || 'OTHER';
    if (!types[type]) {
      types[type] = { spend: 0, conversions: 0, value: 0 };
    }

    const campaignMetrics = metrics.filter(m => m.campaign_id === campaign.id);
    campaignMetrics.forEach(m => {
      types[type].spend += parseFloat(m.cost || 0);
      types[type].conversions += parseFloat(m.conversions || 0);
      types[type].value += parseFloat(m.conversion_value || 0);
    });
  });

  const totalSpend = Object.values(types).reduce((sum, t) => sum + t.spend, 0);

  const typeConfig: Record<string, { icon: string; color: string }> = {
    SEARCH: { icon: 'Search', color: 'bg-blue-500' },
    SHOPPING: { icon: 'ShoppingBag', color: 'bg-green-500' },
    DISPLAY: { icon: 'Monitor', color: 'bg-purple-500' },
    VIDEO: { icon: 'Youtube', color: 'bg-red-500' },
    PERFORMANCE_MAX: { icon: 'Zap', color: 'bg-orange-500' },
    OTHER: { icon: 'MoreHorizontal', color: 'bg-gray-500' },
  };

  return Object.entries(types).map(([type, data]) => ({
    type,
    icon: typeConfig[type]?.icon || 'MoreHorizontal',
    color: typeConfig[type]?.color || 'bg-gray-500',
    spend: `R$ ${data.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    percent: totalSpend > 0 ? ((data.spend / totalSpend) * 100).toFixed(1) : '0',
    conversions: Math.round(data.conversions),
    roas: data.spend > 0 ? `${(data.value / data.spend).toFixed(1)}x` : '0x',
  }));
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
