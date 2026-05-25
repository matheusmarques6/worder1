// =============================================
// WORDER: Email Campaigns API
// /src/app/api/email/campaigns/route.ts
//
// GET: list campaigns with stats, POST: create.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    // Accept both casings — the campaigns page passes `storeId` but
    // other paths in the app use `store_id`. Without this fallback,
    // a multi-store org viewing campaigns of one specific store
    // saw every campaign in the org because the filter was ignored.
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');

    let query = supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(id, name)')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('[EmailCampaigns] Error fetching campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    // Use pre-computed stats from the campaign row (total_sent, total_failed
    // are updated atomically by send-batch via increment_campaign_stats RPC).
    // Falls back to a single batch query for opens/clicks if campaigns exist,
    // instead of N+1 individual queries per campaign.
    const campaignIds = (campaigns || []).map((c: any) => c.id);
    let statsMap: Record<string, { total: number; delivered: number; opened: number; clicked: number; bounced: number }> = {};

    if (campaignIds.length > 0) {
      try {
        const { data: statsRows } = await supabaseAdmin
          .from('email_sends')
          .select('campaign_id, status, opened_at, clicked_at')
          .in('campaign_id', campaignIds);

        for (const row of (statsRows || []) as any[]) {
          if (!statsMap[row.campaign_id]) {
            statsMap[row.campaign_id] = { total: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
          }
          const s = statsMap[row.campaign_id];
          s.total++;
          if (row.status === 'delivered') s.delivered++;
          if (row.status === 'bounced') s.bounced++;
          if (row.opened_at) s.opened++;
          if (row.clicked_at) s.clicked++;
        }
      } catch {
        console.warn('[EmailCampaigns] Stats batch query failed, using pre-computed');
      }
    }

    const campaignsWithStats = (campaigns || []).map((campaign: any) => {
      const s = statsMap[campaign.id] || {
        total: campaign.total_sent || 0,
        delivered: campaign.total_sent || 0,
        opened: 0,
        clicked: 0,
        bounced: campaign.total_failed || 0,
      };
      return {
        ...campaign,
        stats: {
          ...s,
          open_rate: s.total > 0 ? ((s.opened / s.total) * 100).toFixed(1) : '0.0',
          click_rate: s.total > 0 ? ((s.clicked / s.total) * 100).toFixed(1) : '0.0',
        },
      };
    });

    return NextResponse.json({ campaigns: campaignsWithStats });
  } catch (error) {
    console.error('[EmailCampaigns] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    const {
      name,
      subject,
      template_id,
      from_email,
      sender_name,
      reply_to,
      segment_id,
      store_id,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // Validação de email format
    const { firstInvalidEmail } = await import('@/lib/email/validation')
    const invalid = firstInvalidEmail([from_email, reply_to])
    if (invalid) {
      return NextResponse.json(
        { error: `Email inválido: ${invalid}` },
        { status: 400 }
      );
    }

    const insertData: Record<string, any> = {
      organization_id: user.organization_id,
      name,
      subject: subject || name,
      status: 'draft',
    }
    if (template_id) insertData.template_id = template_id
    if (from_email) insertData.from_email = from_email
    if (sender_name) insertData.sender_name = sender_name
    if (reply_to) insertData.reply_to = reply_to
    if (segment_id) insertData.segment_id = segment_id
    if (store_id) insertData.store_id = store_id
    // A/B test fields
    if (body.ab_test_enabled) {
      insertData.ab_test_enabled = true
      insertData.ab_test_percent = body.ab_test_percent ?? 50
      insertData.ab_variant_b = body.ab_variant_b || null
      insertData.ab_winner_metric = body.ab_winner_metric || 'open_rate'
      insertData.ab_duration_hours = body.ab_duration_hours ?? 4
    }
    // Smart sending / engagement / send-time optimization
    if (typeof body.smart_sending_enabled === 'boolean') insertData.smart_sending_enabled = body.smart_sending_enabled
    if (typeof body.smart_sending_hours === 'number') insertData.smart_sending_hours = body.smart_sending_hours
    if (typeof body.skip_unengaged === 'boolean') insertData.skip_unengaged = body.skip_unengaged
    if (typeof body.skip_unengaged_days === 'number') insertData.skip_unengaged_days = body.skip_unengaged_days
    if (typeof body.send_time_optimization === 'boolean') insertData.send_time_optimization = body.send_time_optimization
    // Agendamento
    if (body.scheduled_at) {
      insertData.scheduled_at = body.scheduled_at
      insertData.status = 'scheduled'
    }

    const { data: campaign, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[EmailCampaigns] Error creating campaign:', error);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('[EmailCampaigns] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
